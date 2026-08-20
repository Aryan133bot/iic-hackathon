import { NextResponse } from 'next/server';
import { getTLEData } from '@/lib/orbits/tle-cache';
import { updateTLEEpochToNow } from '@/lib/orbits/tle-utils';
import demoData from '@/data/demo-scenario.json';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const isDemo = searchParams.get('demo') === 'true';

    if (isDemo) {
      // Return synthetic demo data with fresh epochs
      const freshDemoObjects = demoData.map(obj => ({
        ...obj,
        line1: updateTLEEpochToNow(obj.line1)
      }));
      return NextResponse.json({
        fetchedAt: new Date().toISOString(),
        objects: freshDemoObjects
      });
    }

    const data = await getTLEData(forceRefresh);
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
