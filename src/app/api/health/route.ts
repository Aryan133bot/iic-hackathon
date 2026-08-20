import { NextResponse } from 'next/server';
import { getTLECacheStatus } from '@/lib/orbits/tle-cache';

export async function GET() {
  const tleStatus = getTLECacheStatus();
  
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    tleCache: tleStatus,
    config: {
      geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash (default)'
    }
  });
}
