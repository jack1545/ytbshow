import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import ytdl from '@distube/ytdl-core';
import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFile } from 'fs/promises';
import { withRetry, getYouTubeErrorMessage } from '@/lib/retry';

// Create agent with advanced options to avoid bot detection and improve connection reliability
const agent = ytdl.createAgent([], {
  pipelining: 1, // Reduce pipelining to avoid overwhelming YouTube servers
  maxRedirections: 5, // Allow more redirections
  headersTimeout: 30000, // 30 second header timeout
  bodyTimeout: 60000, // 60 second body timeout
  connectTimeout: 30000 // 30 second connection timeout
});

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url || !ytdl.validateURL(url)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const info = await withRetry(
      () => ytdl.getInfo(url, { agent }),
      {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        onRetry: (error, attempt) => {
          console.log(`Retry attempt ${attempt} for audio extraction:`, error.message);
        }
      }
    );
    
    const videoFormat = ytdl.chooseFormat(info.formats, { quality: 'highest' });
    
    if (!videoFormat) {
      return NextResponse.json({ error: 'No suitable video format found' }, { status: 400 });
    }

    const tempDir = join(tmpdir(), 'ytbshow-audio');
    await mkdir(tempDir, { recursive: true });
    
    const videoId = new URL(url).searchParams.get('v') || Date.now().toString();
    const videoPath = join(tempDir, `${videoId}.mp4`);
    const audioPath = join(tempDir, `${videoId}.mp3`);
    
    // Download video with agent
    const videoStream = ytdl(url, { 
      format: videoFormat,
      agent
    });
    const writeStream = (await import('fs')).createWriteStream(videoPath);
    
    await new Promise((resolve, reject) => {
      videoStream.pipe(writeStream);
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
      videoTitle: info.videoDetails.title,
    });
  } catch (error) {
    console.error('Error extracting audio:', error);
    const message = getYouTubeErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}