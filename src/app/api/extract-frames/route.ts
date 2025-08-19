import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createHash } from 'crypto';

const CACHE_DIR = path.join(process.cwd(), 'cache', 'videos');
const FRAMES_DIR = path.join(process.cwd(), 'cache', 'frames');

// 确保帧目录存在
const ensureFramesDir = async () => {
  try {
    await fs.access(FRAMES_DIR);
  } catch {
    await fs.mkdir(FRAMES_DIR, { recursive: true });
  }
};

// 生成视频文件的唯一标识符
const generateVideoId = (url: string): string => {
  return createHash('md5').update(url).digest('hex');
};

export async function POST(request: NextRequest) {
  try {
    const { url, videoId, frameCount = 10 } = await request.json();
    
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
        suggestion: 'Use the download-cache API to cache the video before extracting frames.'
      }, { status: 404 });
    }

    // 确保帧目录存在
    await ensureFramesDir();

    // 创建帧输出目录
    const framesOutputDir = path.join(FRAMES_DIR, actualVideoId);
    await fs.mkdir(framesOutputDir, { recursive: true });

    try {
      // 使用FFmpeg从本地视频文件提取帧
      const framePromise = new Promise<string[]>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', videoFilePath,
          '-vf', `select=not(mod(n\\,${Math.floor(100/frameCount)}))`,
          '-vsync', 'vfr',
          '-q:v', '2',
          path.join(framesOutputDir, 'frame_%03d.jpg')
        ]);

        ffmpeg.stderr.on('data', (data) => {
          console.log('FFmpeg stderr:', data.toString());
        });

        ffmpeg.on('close', async (code) => {
          if (code === 0) {
            try {
              const files = await fs.readdir(framesOutputDir);
              const frameFiles = files.filter(f => f.startsWith('frame_')).sort();
              resolve(frameFiles);
            } catch (error) {
              reject(error);
            }
          } else {
            reject(new Error(`FFmpeg process exited with code ${code}`));
          }
        });

        ffmpeg.on('error', reject);
      });

      const frameFiles = await framePromise;
      
      // 读取帧并转换为base64
      const frames = [];
      for (const frameFile of frameFiles.slice(0, frameCount)) {
        const framePath = path.join(framesOutputDir, frameFile);
        const frameBuffer = await fs.readFile(framePath);
        frames.push({
          filename: frameFile,
          data: `data:image/jpeg;base64,${frameBuffer.toString('base64')}`
        });
      }

      console.log(`Successfully extracted ${frames.length} frames from cached video`);

      return NextResponse.json({
        success: true,
        frames,
        videoId: actualVideoId,
        frameCount: frames.length,
        message: 'Frames extracted successfully from cached video'
      });
    } catch (error) {
      console.error('Error extracting frames:', error);
      // 清理失败的帧目录
      await fs.rm(framesOutputDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error('Error extracting frames:', error);
    return NextResponse.json({ 
      error: 'Failed to extract frames from cached video',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}