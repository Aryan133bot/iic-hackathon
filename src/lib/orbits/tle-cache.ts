import https from 'https';
import { TLEObject, TLEResponse } from '@/lib/types/tle';
import { parseTLEToSatrec } from '@/lib/orbits/propagation';

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
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

    try {
      const noradId = parseInt(line1.substring(2, 7).trim(), 10);
      
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

  try {
    const activeText = await httpsGet('https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=TLE');
    const activeObjects = parseTLEText(activeText, 'satellite');

    const isroObjects = activeObjects.filter(sat => 
      INDIAN_KEYWORDS.some(kw => sat.name.toUpperCase().includes(kw))
    );

    const randomActive = activeObjects
      .filter(sat => !isroObjects.includes(sat))
      .slice(0, 200);

    let debrisObjects: TLEObject[] = [];
    try {
      const debrisText = await httpsGet('https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-1408-debris&FORMAT=TLE');
      debrisObjects = parseTLEText(debrisText, 'debris');
    } catch (e) {
      console.error('Debris fetch failed:', e);
    }

    const curatedObjects = [...isroObjects, ...randomActive, ...debrisObjects];

    // Filter out invalid TLEs early by trying to parse them
    const validObjects = curatedObjects.filter(obj => {
      try {
        parseTLEToSatrec(obj.line1, obj.line2);
        return true;
      } catch {
        return false;
      }
    });

    cachedObjects = validObjects;
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
