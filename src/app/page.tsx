'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Film, Music, Loader2 } from 'lucide-react';
import Image from 'next/image';

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: string;
  formats: Array<{
    quality: string;
    container: string;
    itag: number;
  }>;
  audioFormats: Array<{
    quality: string;
    container: string;
    itag: number;
  }>;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [frames, setFrames] = useState<{ url: string; filename: string }[]>([]);
  const [selectedFrames, setSelectedFrames] = useState<string[]>([]);
  const [audio, setAudio] = useState<string | null>(null);
  const [frameRate, setFrameRate] = useState(1);

  const handleGetVideoInfo = async () => {
    if (!url.trim()) {
      toast.error('请输入 YouTube 视频链接');
      return;
    }
    
    setLoading(true);
    const toastId = toast.loading('正在获取视频信息...');
    
    try {
      const response = await fetch('/api/video-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setVideoInfo(data);
        toast.success('视频信息获取成功！', { id: toastId });
      } else {
        const error = await response.json();
        toast.error(error.error || '获取视频信息失败', { id: toastId });
      }
    } catch (error) {
      console.error('Error fetching video info:', error);
      toast.error('网络错误，请重试', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadVideo = async () => {
    const toastId = toast.loading('正在准备下载...');
    
    try {
      const response = await fetch('/api/download-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${videoInfo?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`;
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        toast.success('视频下载已开始！', { id: toastId });
      } else {
        const error = await response.json();
        toast.error(error.error || '下载失败', { id: toastId });
      }
    } catch (error) {
      console.error('Error downloading video:', error);
      toast.error('下载失败，请重试', { id: toastId });
    }
  };

  const handleExtractFrames = async () => {
    if (frameRate <= 0) {
      toast.error('帧率必须大于 0');
      return;
    }
    
    setLoading(true);
    const toastId = toast.loading('正在提取帧图片...');
    
    try {
      const response = await fetch('/api/extract-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, frameRate }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setFrames(data.frames);
        setSelectedFrames([]);
        toast.success(`成功提取 ${data.totalFrames} 帧图片！`, { id: toastId });
      } else {
        const error = await response.json();
        toast.error(error.error || '提取失败', { id: toastId });
      }
    } catch (error) {
      console.error('Error extracting frames:', error);
      toast.error('提取失败，请重试', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleExtractAudio = async () => {
    setLoading(true);
    const toastId = toast.loading('正在提取音频...');
    
    try {
      const response = await fetch('/api/extract-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setAudio(data.audio);
        toast.success('音频提取成功！', { id: toastId });
      } else {
        const error = await response.json();
        toast.error(error.error || '提取失败', { id: toastId });
      }
    } catch (error) {
      console.error('Error extracting audio:', error);
      toast.error('提取失败，请重试', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleFrameSelect = (frameFilename: string, checked: boolean) => {
    if (checked) {
      setSelectedFrames([...selectedFrames, frameFilename]);
    } else {
      setSelectedFrames(selectedFrames.filter(f => f !== frameFilename));
    }
  };

  const handleSelectAllFrames = (checked: boolean) => {
    if (checked) {
      setSelectedFrames(frames.map(f => f.filename));
    } else {
      setSelectedFrames([]);
    }
  };

  const handleDownloadSelectedFrames = () => {
    if (selectedFrames.length === 0) {
      toast.error('请至少选择一帧图片');
      return;
    }
    
    toast.loading(`正在下载 ${selectedFrames.length} 帧图片...`);
    
    selectedFrames.forEach((frameFilename) => {
      const frame = frames.find(f => f.filename === frameFilename);
      if (frame) {
        const a = document.createElement('a');
        a.href = frame.url;
        a.download = frame.filename;
        a.click();
      }
    });
    
    setTimeout(() => {
      toast.success(`${selectedFrames.length} 帧图片下载完成！`);
    }, 1000);
  };

  const handleDownloadAudio = () => {
    if (audio) {
      const a = document.createElement('a');
      a.href = audio;
      a.download = `${videoInfo?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp3`;
      a.click();
      toast.success('音频下载已开始！');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            YouTube 视频下载工具
          </h1>
          <p className="text-gray-600">下载视频、提取帧图片、分离音频 - 全在线完成</p>
        </div>

        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <Input
                placeholder="输入 YouTube 视频链接..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1"
              />
              <Button 
                onClick={handleGetVideoInfo} 
                disabled={loading || !url}
                className="bg-gradient-to-r from-purple-600 to-pink-600"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '获取信息'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {videoInfo && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Film className="w-5 h-5" />
                {videoInfo.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6">
                <Image 
                  src={videoInfo.thumbnail} 
                  alt={videoInfo.title}
                  width={256}
                  height={144}
                  className="w-64 h-36 object-cover rounded-lg"
                />
                <div className="flex-1">
                  <p className="mb-4">
                    <Badge variant="secondary">时长: {Math.floor(parseInt(videoInfo.duration) / 60)}:{(parseInt(videoInfo.duration) % 60).toString().padStart(2, '0')}</Badge>
                  </p>
                  
                  <Tabs defaultValue="video" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="video">下载视频</TabsTrigger>
                      <TabsTrigger value="frames">提取帧</TabsTrigger>
                      <TabsTrigger value="audio">分离音频</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="video" className="mt-4">
                      <Button onClick={handleDownloadVideo} className="w-full">
                        <Download className="w-4 h-4 mr-2" />
                        下载视频
                      </Button>
                    </TabsContent>
                    
                    <TabsContent value="frames" className="mt-4 space-y-4">
                      <div className="flex gap-4 items-center">
                        <Input
                          type="number"
                          placeholder="帧率 (fps)"
                          value={frameRate}
                          onChange={(e) => setFrameRate(parseInt(e.target.value) || 1)}
                          className="w-32"
                        />
                        <Button onClick={handleExtractFrames} disabled={loading}>
                          <Film className="w-4 h-4 mr-2" />
                          {loading ? '提取中...' : '提取帧'}
                        </Button>
                      </div>
                      
                      {frames.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <label className="flex items-center gap-2">
                              <Checkbox
                                checked={selectedFrames.length === frames.length}
                                onCheckedChange={handleSelectAllFrames}
                              />
                              全选 ({selectedFrames.length}/{frames.length})
                            </label>
                            <Button
                              onClick={handleDownloadSelectedFrames}
                              disabled={selectedFrames.length === 0}
                              variant="outline"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              下载选中帧
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-4 gap-4 max-h-96 overflow-y-auto p-2 border rounded-lg">
                            {frames.map((frame, index) => (
                              <div key={index} className="relative">
                                <Image
                                  src={frame.url}
                                  alt={`Frame ${index + 1}`}
                                  width={96}
                                  height={96}
                                  className="w-full h-24 object-cover rounded border"
                                />
                                <div className="absolute top-1 left-1">
                                  <Checkbox
                                    checked={selectedFrames.includes(frame.filename)}
                                    onCheckedChange={(checked) => handleFrameSelect(frame.filename, checked as boolean)}
                                  />
                                </div>
                                <span className="absolute bottom-1 right-1 bg-black/50 text-white text-xs px-1 rounded">
                                  {index + 1}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                    
                    <TabsContent value="audio" className="mt-4 space-y-4">
                      <Button onClick={handleExtractAudio} disabled={loading}>
                        <Music className="w-4 h-4 mr-2" />
                        {loading ? '提取中...' : '提取音频'}
                      </Button>
                      
                      {audio && (
                        <div className="space-y-4">
                          <audio controls className="w-full">
                            <source src={audio} type="audio/mpeg" />
                          </audio>
                          <Button onClick={handleDownloadAudio} className="w-full">
                            <Download className="w-4 h-4 mr-2" />
                            下载音频
                          </Button>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
