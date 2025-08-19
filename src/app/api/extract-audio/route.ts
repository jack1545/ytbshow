import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const CACHE_DIR = path.join(process.cwd(), 'cache', 'videos');
const AUDIO_DIR = path.join(process.cwd(), 'cache', 'audio');

// 确保音频输出目录存在
const ensureAudioDir = () => {
  try {
    if (!fsSync.existsSync(AUDIO_DIR)) {
      fsSync.mkdirSync(AUDIO_DIR, { recursive: true });
      console.log(`Created audio directory: ${AUDIO_DIR}`);
    }
  } catch (error) {
    console.error('Error creating audio directory:', error);
    throw new Error(`Failed to create audio directory: ${error}`);
  }
};

// 生成视频文件的唯一标识符
const generateVideoId = (url: string): string => {
  return createHash('md5').update(url).digest('hex');
};

export async function POST(request: NextRequest) {
  try {
    const { url, videoId, format = 'mp3' } = await request.json();
    
    if (!url && !videoId) {
      return NextResponse.json({ error: 'URL or videoId is required' }, { status: 400 });
    }

    // 生成或使用提供的videoId
    const actualVideoId = videoId || createHash('md5').update(url).digest('hex');
    const videoFileName = `${actualVideoId}.mp4`;
    const videoFilePath = path.join(CACHE_DIR, videoFileName);

    // 检查缓存的视频文件是否存在
    try {
      await fs.access(videoFilePath);
    } catch {
      return NextResponse.json({
        error: 'Video not found in cache. Please download the video first.',
        suggestion: 'Use the download-cache API to cache the video before extracting audio.'
      }, { status: 404 });
    }

    // 确保音频目录存在
    ensureAudioDir();

    // 创建音频输出文件路径
    const audioFileName = `${actualVideoId}.${format}`;
    const audioFilePath = path.join(AUDIO_DIR, audioFileName);

    // 检查音频文件是否已经存在
    try {
      await fs.access(audioFilePath);
      const stats = await fs.stat(audioFilePath);
      const audioBuffer = await fs.readFile(audioFilePath);
      
      console.log(`Audio already extracted: ${audioFileName}`);
      
      return NextResponse.json({
        success: true,
        audio: {
          filename: audioFileName,
          data: `data:audio/${format};base64,${audioBuffer.toString('base64')}`,
          format,
          size: stats.size
        },
        videoId: actualVideoId,
        cached: true,
        message: 'Audio already extracted and cached'
      });
    } catch {
      // 音频文件不存在，需要提取
    }

    try {
      // 使用FFmpeg从本地视频文件提取音频
      const audioPromise = new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', videoFilePath,
          '-vn', // No video
          '-acodec', format === 'mp3' ? 'libmp3lame' : 'aac',
          '-ab', '192k',
          audioFilePath
        ]);

        ffmpeg.stderr.on('data', (data) => {
          console.log('FFmpeg stderr:', data.toString());
        });

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg process exited with code ${code}`));
          }
        });

        ffmpeg.on('error', reject);
      });

      await audioPromise;
      
      // 读取音频文件并转换为base64
      const audioBuffer = await fs.readFile(audioFilePath);
      const stats = await fs.stat(audioFilePath);
      
      console.log(`Successfully extracted audio from cached video: ${audioFileName}`);

      return NextResponse.json({
        success: true,
        audio: {
          filename: audioFileName,
          data: `data:audio/${format};base64,${audioBuffer.toString('base64')}`,
          format,
          size: stats.size
        },
        videoId: actualVideoId,
        cached: false,
        message: 'Audio extracted successfully from cached video'
      });
    } catch (error) {
      console.error('Error extracting audio:', error);
      // 清理失败的音频文件
      await fs.unlink(audioFilePath).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error('Error extracting audio:', error);
    return NextResponse.json({ 
      error: 'Failed to extract audio from cached video',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}