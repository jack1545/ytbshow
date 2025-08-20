import { Innertube } from 'youtubei.js';
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { getYouTubeErrorMessage } from '@/lib/youtube-error';

// 在Vercel等serverless环境中使用临时目录
const CACHE_DIR = process.env.VERCEL 
  ? path.join('/tmp', 'cache', 'videos')
  : path.join(process.cwd(), 'cache', 'videos');

// 确保缓存目录存在
const ensureCacheDir = () => {
  try {
    if (!fsSync.existsSync(CACHE_DIR)) {
      fsSync.mkdirSync(CACHE_DIR, { recursive: true });
      console.log(`Created cache directory: ${CACHE_DIR}`);
    }
  } catch (error) {
    console.error('Error creating cache directory:', error);
    throw new Error(`Failed to create cache directory: ${error}`);
  }
};

// 生成视频文件的唯一标识符
const generateVideoId = (url: string): string => {
  return createHash('md5').update(url).digest('hex');
};

// 下载视频到本地缓存
const downloadVideoToCache = async (downloadUrl: string, filePath: string): Promise<void> => {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(buffer));
};

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
    const { url, quality = 'highest' } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // 确保缓存目录存在
    ensureCacheDir();

    // 生成视频ID和文件路径
    const videoId = generateVideoId(url);
    const fileName = `${videoId}.mp4`;
    const filePath = path.join(CACHE_DIR, fileName);

    // 检查文件是否已经缓存
    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);
      console.log(`Video already cached: ${fileName}`);
      
      return NextResponse.json({
        success: true,
        videoId,
        fileName,
        fileSize: stats.size,
        cached: true,
        message: 'Video already cached and ready for processing'
      });
    } catch {
      // 文件不存在，需要下载
    }

    try {
      console.log('Fetching video info with youtubei.js');
      const youtube = await createYouTubeClient();
      const info = await youtube.getInfo(url);
      
      // 获取流数据
      const streamingData = info.streaming_data;
      if (!streamingData) {
        throw new Error('No streaming data available');
      }

      // 选择最佳格式
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

      console.log('Downloading video to cache...');
      await downloadVideoToCache(selectedFormat.url, filePath);
      
      const stats = await fs.stat(filePath);
      console.log(`Video cached successfully: ${fileName} (${stats.size} bytes)`);

      return NextResponse.json({
        success: true,
        videoId,
        fileName,
        fileSize: stats.size,
        title: info.basic_info.title,
        quality: selectedFormat.quality_label,
        cached: false,
        message: 'Video downloaded and cached successfully'
      });

    } catch (error) {
      console.error('youtubei.js error:', getYouTubeErrorMessage(error));
      
      // 尝试使用oEmbed API获取基本信息
      console.log('Attempting oEmbed fallback for URL:', url);
      try {
        const videoIdMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/);
        console.log('Video ID match result:', videoIdMatch);
        if (videoIdMatch) {
          const videoId = videoIdMatch[1];
          console.log('Extracted video ID:', videoId);
          const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
          console.log('Fetching oEmbed data from:', oembedUrl);
          const oembedResponse = await fetch(oembedUrl);
          console.log('oEmbed response status:', oembedResponse.status);
          
          if (oembedResponse.ok) {
            const oembedData = await oembedResponse.json();
            return NextResponse.json({
              error: 'Direct video download is currently unavailable due to YouTube API restrictions.',
              suggestion: 'You can still view video information and use external tools to download the video manually.',
              videoInfo: {
                title: oembedData.title,
                author: oembedData.author_name,
                thumbnail: oembedData.thumbnail_url
              },
              details: getYouTubeErrorMessage(error)
            }, { status: 503 });
          }
        }
      } catch (oembedError) {
        console.error('oEmbed fallback also failed:', oembedError);
      }
      
      return NextResponse.json({
        error: 'Video download is temporarily unavailable due to YouTube API limitations. Please try again later or use a different video.',
        details: getYouTubeErrorMessage(error)
      }, { status: 503 });
    }

  } catch (error) {
    console.error('Error in download-cache:', error);
    return NextResponse.json({ 
      error: 'Internal server error during video caching',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}