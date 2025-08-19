import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import { withRetry, getYouTubeErrorMessage } from '@/lib/retry';

// Create agent to avoid bot detection
const agent = ytdl.createAgent([]);

export async function POST(request: NextRequest) {
  try {
    const { url, quality = 'highest' } = await request.json();
    
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
          console.log(`Retry attempt ${attempt} for video download:`, error.message);
        }
      }
    );
    
    const format = ytdl.chooseFormat(info.formats, { quality });
    
    if (!format) {
      return NextResponse.json({ error: 'No suitable format found' }, { status: 400 });
    }

    const videoStream = ytdl(url, { 
      format,
      agent
    });
    
    const headers = new Headers({
      'Content-Type': format.mimeType || 'video/mp4',
      'Content-Disposition': `attachment; filename="${info.videoDetails.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4"`,
    });

    const readableStream = new ReadableStream({
      start(controller) {
        videoStream.on('data', (chunk) => controller.enqueue(chunk));
        videoStream.on('end', () => controller.close());
        videoStream.on('error', (error) => controller.error(error));
      },
    });

    return new NextResponse(readableStream, {
      headers,
      status: 200,
    });
  } catch (error) {
    console.error('Error downloading video:', error);
    const message = getYouTubeErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}