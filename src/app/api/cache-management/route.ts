import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'cache', 'videos');
const FRAMES_DIR = path.join(process.cwd(), 'cache', 'frames');
const AUDIO_DIR = path.join(process.cwd(), 'cache', 'audio');

// 获取文件大小（字节）(暂时未使用)
// function getFileSize(filePath: string): number {
//   try {
//     const stats = fs.statSync(filePath);
//     return stats.size;
//   } catch {
//     return 0;
//   }
// }

// 获取目录大小
function getDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  
  let totalSize = 0;
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      totalSize += getDirSize(filePath);
    } else {
      totalSize += stats.size;
    }
  }
  
  return totalSize;
}

// 删除目录及其内容
function removeDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      removeDir(filePath);
    } else {
      fs.unlinkSync(filePath);
    }
  }
  
  fs.rmdirSync(dirPath);
}

// 格式化文件大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// GET: 获取缓存信息
export async function GET() {
  try {
    const videoSize = getDirSize(CACHE_DIR);
    const framesSize = getDirSize(FRAMES_DIR);
    const audioSize = getDirSize(AUDIO_DIR);
    const totalSize = videoSize + framesSize + audioSize;
    
    // 获取缓存的视频数量
    const videoCount = fs.existsSync(CACHE_DIR) ? fs.readdirSync(CACHE_DIR).length : 0;
    
    // 获取缓存的帧目录数量
    const framesCount = fs.existsSync(FRAMES_DIR) ? fs.readdirSync(FRAMES_DIR).length : 0;
    
    // 获取缓存的音频文件数量
    const audioCount = fs.existsSync(AUDIO_DIR) ? fs.readdirSync(AUDIO_DIR).length : 0;
    
    return NextResponse.json({
      success: true,
      cache: {
        videos: {
          count: videoCount,
          size: videoSize,
          sizeFormatted: formatBytes(videoSize)
        },
        frames: {
          count: framesCount,
          size: framesSize,
          sizeFormatted: formatBytes(framesSize)
        },
        audio: {
          count: audioCount,
          size: audioSize,
          sizeFormatted: formatBytes(audioSize)
        },
        total: {
          size: totalSize,
          sizeFormatted: formatBytes(totalSize)
        }
      }
    });
  } catch (error) {
    console.error('Error getting cache info:', error);
    return NextResponse.json(
      { success: false, error: '获取缓存信息失败' },
      { status: 500 }
    );
  }
}

// DELETE: 清理缓存
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'all', 'videos', 'frames', 'audio'
    
    let deletedSize = 0;
    let deletedCount = 0;
    
    if (type === 'all' || type === 'videos') {
      if (fs.existsSync(CACHE_DIR)) {
        deletedSize += getDirSize(CACHE_DIR);
        const files = fs.readdirSync(CACHE_DIR);
        deletedCount += files.length;
        removeDir(CACHE_DIR);
      }
    }
    
    if (type === 'all' || type === 'frames') {
      if (fs.existsSync(FRAMES_DIR)) {
        deletedSize += getDirSize(FRAMES_DIR);
        const dirs = fs.readdirSync(FRAMES_DIR);
        deletedCount += dirs.length;
        removeDir(FRAMES_DIR);
      }
    }
    
    if (type === 'all' || type === 'audio') {
      if (fs.existsSync(AUDIO_DIR)) {
        deletedSize += getDirSize(AUDIO_DIR);
        const files = fs.readdirSync(AUDIO_DIR);
        deletedCount += files.length;
        removeDir(AUDIO_DIR);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `成功清理 ${deletedCount} 个缓存项，释放 ${formatBytes(deletedSize)} 空间`,
      deleted: {
        count: deletedCount,
        size: deletedSize,
        sizeFormatted: formatBytes(deletedSize)
      }
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json(
      { success: false, error: '清理缓存失败' },
      { status: 500 }
    );
  }
}