import { Innertube } from 'youtubei.js';
import { NextRequest, NextResponse } from 'next/server';
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
    const { url, quality } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const youtube = await createYouTubeClient();
    
    try {
      console.log('Fetching video info with youtubei.js');
      const info = await youtube.getInfo(url);
      
      // Get streaming data
      const streamingData = info.streaming_data;
      if (!streamingData) {
        throw new Error('No streaming data available');
      }

      // Find the best format based on quality preference
      const formats = streamingData.adaptive_formats.filter(format => 
        format.mime_type?.includes('video/mp4')
      );
      
      let selectedFormat;
      if (quality === 'highest') {
        selectedFormat = formats.reduce((prev, current) => 
          (current.height || 0) > (prev.height || 0) ? current : prev
        );
      } else {
        selectedFormat = formats.find(format => 
          format.quality_label === quality
        ) || formats[0];
      }

      if (!selectedFormat || !selectedFormat.url) {
        throw new Error('No suitable format found');
      }

      console.log('Successfully fetched video info with youtubei.js');
      return NextResponse.json({
        downloadUrl: selectedFormat.url,
        title: info.basic_info.title,
        quality: selectedFormat.quality_label,
        filesize: selectedFormat.content_length
      });
    } catch (error) {
      console.log('Failed to fetch video info:', getYouTubeErrorMessage(error));
      console.log('Raw error details:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error downloading video:', error);
    const errorMessage = getYouTubeErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}