import https from 'https';
import { TLEObject, TLEResponse } from '@/lib/types/tle';
import { parseTLEToSatrec } from '@/lib/orbits/propagation';

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const statusCode = res.statusCode ?? 0;

      // Follow one level of redirect for 301/302
      if ((statusCode === 301 || statusCode === 302) && res.headers.location) {
        res.resume(); // drain the current response
        httpsGet(res.headers.location).then(resolve, reject);
        return;
      }

      // Reject on non-2xx status codes
      if (statusCode < 200 || statusCode >= 300) {
        res.resume(); // drain so the socket can be freed
        reject(new Error(`HTTP request failed with status code ${statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);

    // 15-second timeout
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('HTTP request timed out after 15 seconds'));
    });
  });
}

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

    // Validate line format: line1 must start with '1', line2 must start with '2'
    if (!line1.startsWith('1') || !line2.startsWith('2')) {
      console.warn('Skipping TLE block with invalid line format:', name);
      continue;
    }

    try {
      const noradId = parseInt(line1.substring(2, 7).trim(), 10);

      // Validate noradId is a valid number
      if (isNaN(noradId)) {
        console.warn('Skipping TLE block with invalid NORAD ID:', name);
        continue;
      }
      
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

let cachedObjects: TLEObject[] = [];
let lastFetchTime: number = 0;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Race condition guard: reuse in-flight fetch promise
let inFlightPromise: Promise<TLEResponse> | null = null;

export function getTLECacheStatus() {
  return {
    lastFetchTime: lastFetchTime > 0 ? new Date(lastFetchTime).toISOString() : null,
    itemCount: cachedObjects.length,
    isStale: Date.now() - lastFetchTime > CACHE_TTL_MS
  };
}

export async function getTLEData(forceRefresh: boolean = false): Promise<TLEResponse> {
  const now = Date.now();
  const isCacheValid = (now - lastFetchTime) < CACHE_TTL_MS;

  if (!forceRefresh && isCacheValid && cachedObjects.length > 0) {
    return {
      fetchedAt: new Date(lastFetchTime).toISOString(),
      staleAfter: new Date(lastFetchTime + CACHE_TTL_MS).toISOString(),
      stale: false,
      objects: cachedObjects,
    };
  }

  // If a fetch is already in progress, return that promise instead of starting a new one
  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = fetchTLEData(now);

  try {
    return await inFlightPromise;
  } finally {
    inFlightPromise = null;
  }
}

async function fetchTLEData(now: number): Promise<TLEResponse> {
  try {
    const activeText = await httpsGet('https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=TLE');
    const activeObjects = parseTLEText(activeText, 'satellite');

    const isroObjects = activeObjects.filter(sat => 
      INDIAN_KEYWORDS.some(kw => sat.name.toUpperCase().includes(kw))
    );

    const selectedActive = activeObjects
      .filter(sat => !isroObjects.includes(sat))
      .slice(0, 200);

    let debrisObjects: TLEObject[] = [];
    try {
      const debrisText = await httpsGet('https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-1408-debris&FORMAT=TLE');
      debrisObjects = parseTLEText(debrisText, 'debris');
    } catch (e) {
      console.error('Debris fetch failed:', e);
    }

    const curatedObjects = [...isroObjects, ...selectedActive, ...debrisObjects];

    // Filter out invalid TLEs early by trying to parse them
    const validObjects = curatedObjects.filter(obj => {
      try {
        parseTLEToSatrec(obj.line1, obj.line2);
        return true;
      } catch {
        return false;
      }
    });

    // Prevent empty response from overwriting a valid cache
    if (validObjects.length === 0 && cachedObjects.length > 0) {
      console.warn('CelesTrak returned 0 valid objects; keeping existing cache of', cachedObjects.length, 'objects');
    } else {
      cachedObjects = validObjects;
    }
    lastFetchTime = now;

    return {
      fetchedAt: new Date(lastFetchTime).toISOString(),
      staleAfter: new Date(lastFetchTime + CACHE_TTL_MS).toISOString(),
      stale: false,
      objects: cachedObjects,
    };

  } catch (error: unknown) {
    console.error('TLE Fetch Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (cachedObjects.length > 0) {
      return {
        fetchedAt: new Date(lastFetchTime).toISOString(),
        staleAfter: new Date(lastFetchTime + CACHE_TTL_MS).toISOString(),
        stale: true,
        error: errorMessage,
        objects: cachedObjects,
      };
    }

    throw new Error(errorMessage);
  }
}
