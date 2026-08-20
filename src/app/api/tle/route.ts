import { NextResponse } from 'next/server';
import { getTLEData } from '@/lib/orbits/tle-cache';

export async function GET() {
  try {
    const data = await getTLEData();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      staleAfter: new Date().toISOString(),
      stale: false,
      error: 'Failed to fetch TLE data and no cache available: ' + errorMessage,
      objects: [],
    }, { status: 500 });
  }
}
