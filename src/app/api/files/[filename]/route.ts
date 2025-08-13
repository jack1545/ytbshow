import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const filePath = join(process.cwd(), 'public', 'temp', filename);
    
    const fileBuffer = await readFile(filePath);
    
    const headers = new Headers({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    });

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers,
      status: 200,
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}