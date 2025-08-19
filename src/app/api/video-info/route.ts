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
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Try different player clients as fallback strategy
    let lastError: Error = new Error('No player clients available');
    
    for (const client of playerClients) {
      try {
        console.log(`Trying player client: ${client}`);
        
        // Use retry mechanism for getting video info with specific client
        const info = await withRetry(
          () => ytdl.getBasicInfo(url, { 
            agent,
            playerClients: [client]
          })
        );

        console.log(`Success with player client: ${client}`);
        return NextResponse.json({
          title: info.videoDetails.title,
          duration: info.videoDetails.lengthSeconds,
          thumbnail: info.videoDetails.thumbnails[0]?.url,
          author: info.videoDetails.author.name,
          viewCount: info.videoDetails.viewCount,
          uploadDate: info.videoDetails.uploadDate,
          description: info.videoDetails.description
        });
      } catch (error) {
        console.log(`Failed with player client ${client} for video info:`, getYouTubeErrorMessage(error));
        console.log(`Raw error details:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
    }
    
    // If all clients failed, throw the last error
    throw lastError;
  } catch (error) {
    console.error('Error fetching video info:', error);
    const errorMessage = getYouTubeErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}