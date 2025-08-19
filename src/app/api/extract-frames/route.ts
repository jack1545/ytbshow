import { Innertube } from 'youtubei.js';
import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import { writeFile, mkdir, readdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { withRetry } from '@/lib/utils';
import { getYouTubeErrorMessage } from '@/lib/youtube-error';

const createYouTubeClient = async () => {
  return await Innertube.create({
    lang: 'en',
    location: 'US',
    retrieve_player: true,
    enable_safety_mode: false,
  });
};

export async function POST(request: NextRequest) {
  try {
    const { url, frameRate = 1 } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const youtube = await createYouTubeClient();
    
    console.log('Fetching video info with youtubei.js');
    const info = await youtube.getInfo(url);
    
    // Get streaming data
    const streamingData = info.streaming_data;
    if (!streamingData) {
      throw new Error('No streaming data available');
    }
    
    // Find the best video format
    const videoFormats = streamingData.adaptive_formats.filter(format => 
      format.mime_type?.includes('video/mp4') && format.has_video
    );
    
    if (videoFormats.length === 0) {
      throw new Error('No video formats found');
    }
    
    // Select the highest quality video format
    const videoFormat = videoFormats.reduce((prev, current) => 
      (current.bitrate || 0) > (prev.bitrate || 0) ? current : prev
    );
    
    if (!videoFormat || !videoFormat.url) {
      return NextResponse.json({ error: 'No suitable video format found' }, { status: 400 });
    }

    const tempDir = join(tmpdir(), 'ytbshow-frames');
    await mkdir(tempDir, { recursive: true });
    
    const videoId = info.basic_info.id || Date.now().toString();
    const videoPath = join(tempDir, `${videoId}.mp4`);
    
    // Download video using fetch
    const response = await fetch(videoFormat.url);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }
    
    const videoBuffer = await response.arrayBuffer();
    const writeStream = (await import('fs')).createWriteStream(videoPath);
    
    await new Promise((resolve, reject) => {
      writeStream.write(Buffer.from(videoBuffer));
      writeStream.end();
      writeStream.on('finish', () => resolve(undefined));
      writeStream.on('error', reject);
    });
    
    // Extract frames
    const framesDir = join(tempDir, videoId);
    await mkdir(framesDir, { recursive: true });
    
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .fps(frameRate)
        .output(join(framesDir, 'frame_%04d.png'))
        .on('end', () => resolve(undefined))
        .on('error', reject)
        .run();
    });
    
    // Read frames
    const frameFiles = await readdir(framesDir);
    const pngFiles = frameFiles.filter(file => file.endsWith('.png')).sort();
    const frames: { url: string; filename: string }[] = [];
    
    for (const file of pngFiles) {
      const framePath = join(framesDir, file);
      const data = await readFile(framePath);
      const filename = `${videoId}_${file}`;
      
      // Save to public temp directory
      const publicDir = join(process.cwd(), 'public', 'temp');
      await mkdir(publicDir, { recursive: true });
      const publicPath = join(publicDir, filename);
      await writeFile(publicPath, data);
      
      frames.push({
        url: `/temp/${filename}`,
        filename,
      });
      
      // Clean up frame file
      await unlink(framePath);
    }
    
    // Clean up
    await unlink(videoPath);
    await readdir(framesDir).then(files => Promise.all(files.map(f => unlink(join(framesDir, f)))));
    await readdir(tempDir).then(files => files.length === 0 ? null : unlink(tempDir).catch(() => {}));
    
    return NextResponse.json({
      frames,
      totalFrames: frames.length,
      videoTitle: info.videoDetails.title,
    });
  } catch (error) {
    console.error('Error extracting frames:', error);
    const message = getYouTubeErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}