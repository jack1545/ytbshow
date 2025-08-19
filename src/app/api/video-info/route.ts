import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import { withRetry, getYouTubeErrorMessage } from '@/lib/retry';

// Create agent with advanced options to avoid bot detection and improve connection reliability
const agent = ytdl.createAgent([], {
  pipelining: 1, // Reduce pipelining to avoid overwhelming YouTube servers
  maxRedirections: 5, // Allow more redirections
  headersTimeout: 30000, // 30 second header timeout
  bodyTimeout: 60000, // 60 second body timeout
  connect: {
    timeout: 30000 // 30 second connection timeout
  }
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