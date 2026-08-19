import { NextResponse } from 'next/server';
import { TLEObject, TLEResponse } from '@/lib/types/tle';

// In-memory cache
let cachedObjects: TLEObject[] = [];
let lastFetchTime: number = 0;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const INDIAN_KEYWORDS = ['CARTOSAT', 'RISAT', 'OCEANSAT', 'GSAT', 'EOS-', 'PSLV', 'CHANDRAYAAN', 'ISRO'];

/**
 * Parses Celestrak 3-line TLE text into TLEObject[]
 */
function parseTLEText(text: string, objectType: 'satellite' | 'debris'): TLEObject[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const objects: TLEObject[] = [];

  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 >= lines.length) break;
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    try {
      const noradId = parseInt(line1.substring(2, 7).trim(), 10);
      
      // Epoch parsing: yyddd.ffffffff
      const epochYearStr = line1.substring(18, 20);
      const epochYear = parseInt(epochYearStr, 10);
      const fullYear = epochYear > 50 ? 1900 + epochYear : 2000 + epochYear;
      const epochDayStr = line1.substring(20, 32);
      const epochDay = parseFloat(epochDayStr);
      
      const epochDate = new Date(Date.UTC(fullYear, 0, 1));
      epochDate.setUTCMilliseconds((epochDay - 1) * 24 * 60 * 60 * 1000);

      objects.push({
        noradId,
        name,
        line1,
        line2,
        epoch: epochDate.toISOString(),
        objectType,
      });
    } catch {
      console.warn('Failed to parse TLE block:', name);
    }
  }
  
  return objects;
}

import https from 'https';

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

export async function GET() {
  const now = Date.now();
  const isCacheValid = (now - lastFetchTime) < CACHE_TTL_MS;

  if (isCacheValid && cachedObjects.length > 0) {
    return NextResponse.json({
      fetchedAt: new Date(lastFetchTime).toISOString(),
      staleAfter: new Date(lastFetchTime + CACHE_TTL_MS).toISOString(),
      stale: false,
      objects: cachedObjects,
    } as TLEResponse);
  }

  try {
    // Fetch resource satellites (includes ISRO earth observation sats, bypasses rate limit on 'active')
    const activeText = await httpsGet('https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=TLE');
    const activeObjects = parseTLEText(activeText, 'satellite');

    // Filter active down to ISRO + maybe a random sample to keep it lightweight but illustrative
    const isroObjects = activeObjects.filter(sat => 
      INDIAN_KEYWORDS.some(kw => sat.name.toUpperCase().includes(kw))
    );

    const randomActive = activeObjects
      .filter(sat => !isroObjects.includes(sat))
      .slice(0, 200);

    // Fetch debris
    let debrisObjects: TLEObject[] = [];
    try {
      const debrisText = await httpsGet('https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-1408-debris&FORMAT=TLE');
      debrisObjects = parseTLEText(debrisText, 'debris');
    } catch (e) {
      console.error('Debris fetch failed:', e);
    }

    const curatedObjects = [...isroObjects, ...randomActive, ...debrisObjects];

    // Update cache
    cachedObjects = curatedObjects;
    lastFetchTime = now;

    return NextResponse.json({
      fetchedAt: new Date(lastFetchTime).toISOString(),
      staleAfter: new Date(lastFetchTime + CACHE_TTL_MS).toISOString(),
      stale: false,
      objects: cachedObjects,
    } as TLEResponse);

  } catch (error: unknown) {
    console.error('TLE Fetch Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (cachedObjects.length > 0) {
      // Fallback to stale cache
      return NextResponse.json({
        fetchedAt: new Date(lastFetchTime).toISOString(),
        staleAfter: new Date(lastFetchTime + CACHE_TTL_MS).toISOString(),
        stale: true,
        error: errorMessage,
        objects: cachedObjects,
      } as TLEResponse);
    }

    // No cache available
    return NextResponse.json({
      fetchedAt: new Date(now).toISOString(),
      staleAfter: new Date(now).toISOString(),
      stale: false,
      error: 'Failed to fetch TLE data and no cache available',
      objects: [],
    } as TLEResponse, { status: 500 });
  }
}
