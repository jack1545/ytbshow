import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import ytdl from '@distube/ytdl-core';
import { writeFile, mkdir, readdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { withRetry, getYouTubeErrorMessage } from '@/lib/retry';

export async function POST(request: NextRequest) {
  try {
    const { url, frameRate = 1 } = await request.json();
    
    if (!url || !ytdl.validateURL(url)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const info = await withRetry(
      () => ytdl.getInfo(url),
      {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        onRetry: (error, attempt) => {
          console.log(`Retry attempt ${attempt} for frame extraction:`, error.message);
        }
      }
    );
    
    const videoFormat = ytdl.chooseFormat(info.formats, { quality: 'highest' });
    
    if (!videoFormat) {
      return NextResponse.json({ error: 'No suitable video format found' }, { status: 400 });
    }

    const tempDir = join(tmpdir(), 'ytbshow-frames');
    await mkdir(tempDir, { recursive: true });
    
    const videoId = new URL(url).searchParams.get('v') || Date.now().toString();
    const videoPath = join(tempDir, `${videoId}.mp4`);
    
    // Download video with timeout
    const videoStream = ytdl(url, { 
      format: videoFormat,
      requestOptions: {
        timeout: 30000 // 30 second timeout
      }
    });
    const writeStream = (await import('fs')).createWriteStream(videoPath);
    
    await new Promise((resolve, reject) => {
      videoStream.pipe(writeStream);
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