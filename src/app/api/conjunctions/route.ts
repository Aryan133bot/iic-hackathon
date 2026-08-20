/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getTLEData } from '@/lib/orbits/tle-cache';
import { parseTLEToSatrec } from '@/lib/orbits/propagation';
import { screenConjunctions } from '@/lib/orbits/conjunctions';
import { ConjunctionEvent } from '@/lib/types/orbits';

let cachedEvents: ConjunctionEvent[] = [];
let lastComputeTime = 0;
const COMPUTE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get('refresh') === 'true';
  const now = Date.now();

  if (!forceRefresh && (now - lastComputeTime) < COMPUTE_TTL_MS && cachedEvents.length > 0) {
    return NextResponse.json({
      computedAt: new Date(lastComputeTime).toISOString(),
      staleAfter: new Date(lastComputeTime + COMPUTE_TTL_MS).toISOString(),
      events: cachedEvents,
    });
  }

  try {
    // 1. Fetch live TLE data
    const tleData = await getTLEData(forceRefresh);
    const validObjects: { noradId: number; name: string; satrec: any }[] = [];

    // 2. Parse into satrecs
    for (const obj of tleData.objects) {
      try {
        const satrec = parseTLEToSatrec(obj.line1, obj.line2);
        validObjects.push({ noradId: obj.noradId, name: obj.name, satrec });
      } catch {
        // Skip invalid
      }
    }

    // 3. Screen Conjunctions
    // 24 hour window (1440 minutes), 30 second steps (10 seconds is too heavy for 170 objects over 24h)
    // 170 objects = ~14,000 pairs. 24h at 30s = 2880 steps.
    // So 14,000 * 2880 = 40 million loops if no pre-filter.
    // The altitude pre-filter will drop most of these.
    const events = screenConjunctions(validObjects, new Date(), 1440, 30, 10.0); // 10km threshold to ensure we catch some

    // Sort by risk tier then distance
    const tierWeights: Record<string, number> = { 'critical': 0, 'high': 1, 'moderate': 2, 'low': 3 };
    events.sort((a, b) => {
      if (tierWeights[a.riskTier] !== tierWeights[b.riskTier]) {
        return tierWeights[a.riskTier] - tierWeights[b.riskTier];
      }
      return a.closestApproachKm - b.closestApproachKm;
    });

    cachedEvents = events;
    lastComputeTime = now;

    return NextResponse.json({
      computedAt: new Date(lastComputeTime).toISOString(),
      staleAfter: new Date(lastComputeTime + COMPUTE_TTL_MS).toISOString(),
      events: cachedEvents,
    });
  } catch (error: unknown) {
    console.error('Conjunction computation failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({
      computedAt: new Date(now).toISOString(),
      staleAfter: new Date(now).toISOString(),
      error: 'Conjunction screening failed: ' + errorMessage,
      events: cachedEvents, // Return stale if we have it
    }, { status: 500 });
  }
}
