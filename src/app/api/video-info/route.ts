import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import { withRetry, getYouTubeErrorMessage } from '@/lib/retry';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url || !ytdl.validateURL(url)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const info = await withRetry(
      () => ytdl.getInfo(url, {
        requestOptions: {
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        }
      }),
      {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        onRetry: (error, attempt) => {
          console.log(`Retry attempt ${attempt} for video info:`, error.message);
        }
      }
    );
    
    return NextResponse.json({
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[0].url,
      duration: info.videoDetails.lengthSeconds,
      formats: info.formats.filter(format => format.container === 'mp4'),
      audioFormats: info.formats.filter(format => format.mimeType?.includes('audio')),
    });
  } catch (error) {
    console.error('Error fetching video info:', error);
    const message = getYouTubeErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}