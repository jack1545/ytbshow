import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import { withRetry, getYouTubeErrorMessage } from '@/lib/retry';

// Create agent with advanced options to avoid bot detection and improve connection reliability
// Using empty cookies array but with optimized agent options
const agent = ytdl.createAgent([], {
  pipelining: 1, // Reduce pipelining to avoid overwhelming YouTube servers
  headersTimeout: 30000, // 30 second header timeout
  bodyTimeout: 60000, // 60 second body timeout
  connectTimeout: 30000 // 30 second connection timeout
});

// Alternative player clients to try if default fails
const playerClients = ['WEB_EMBEDDED', 'IOS', 'ANDROID', 'TV'] as const;

export async function POST(request: NextRequest) {
  try {
    const { url, quality } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Try different player clients as fallback strategy
    let lastError: Error = new Error('No player clients available');
    
    for (const client of playerClients) {
      try {
        console.log(`Trying player client for download: ${client}`);
        
        // Use retry mechanism for getting video info with specific client
        const info = await withRetry(
          () => ytdl.getInfo(url, { 
            agent,
            playerClients: [client]
          })
        );

        // Find the best format based on quality preference
        const formats = info.formats.filter(format => 
          format.hasVideo && format.hasAudio && format.container === 'mp4'
        );
        
        let selectedFormat;
        if (quality === 'highest') {
          selectedFormat = formats.reduce((prev, current) => 
            (parseInt(String(current.height || '0')) > parseInt(String(prev.height || '0'))) ? current : prev
          );
        } else {
          selectedFormat = formats.find(format => format.qualityLabel === quality) || formats[0];
        }

        if (!selectedFormat) {
          throw new Error('No suitable format found');
        }

        console.log(`Success with player client for download: ${client}`);
        return NextResponse.json({
          downloadUrl: selectedFormat.url,
          title: info.videoDetails.title,
          quality: selectedFormat.qualityLabel,
          filesize: selectedFormat.contentLength
        });
      } catch (error) {
        console.log(`Failed with player client ${client} for download:`, getYouTubeErrorMessage(error));
        console.log(`Raw error details:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
    }
    
    // If all clients failed, throw the last error
    throw lastError;
  } catch (error) {
    console.error('Error downloading video:', error);
    const errorMessage = getYouTubeErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}