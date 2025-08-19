import { Innertube } from 'youtubei.js';
import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import { mkdir, readFile, unlink } from 'fs/promises';
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
    const { url } = await request.json();
    
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
    
    // Find the best video format for audio extraction
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

    const tempDir = join(tmpdir(), 'ytbshow-audio');
    await mkdir(tempDir, { recursive: true });
    
    const videoId = info.basic_info.id || Date.now().toString();
    const videoPath = join(tempDir, `${videoId}.mp4`);
    const audioPath = join(tempDir, `${videoId}.mp3`);
    
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
    
    // Extract audio
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .output(audioPath)
        .on('end', () => resolve(undefined))
        .on('error', reject)
        .run();
    });
    
    // Read audio file
    const audioData = await readFile(audioPath);
    const audioBase64 = audioData.toString('base64');
    
    // Clean up
    await unlink(videoPath);
    await unlink(audioPath);
    
    return NextResponse.json({
      audio: `data:audio/mp3;base64,${audioBase64}`,
      videoTitle: info.basic_info.title,
    });
  } catch (error) {
    console.error('Error extracting audio:', error);
    const message = getYouTubeErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}