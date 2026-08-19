import http from 'http';
import { parseTLEToSatrec, propagateOverWindow } from '../src/lib/orbits/propagation';

function fetchLocalAPI(): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/api/tle', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function testPropagation() {
  console.log('Fetching live TLEs from local API...');
  let data;
  try {
    data = await fetchLocalAPI();
  } catch (error) {
    console.error('API fetch failed. Ensure Next.js dev server is running (npm run dev).', error);
    process.exit(1);
  }

  const objects = data.objects || [];
  if (objects.length < 2) {
    console.error('Not enough objects returned by API.');
    process.exit(1);
  }

  // Select 2 diverse objects (e.g. one ISRO sat, one Debris)
  const isroSat = objects.find((o: any) => o.name.includes('CARTOSAT') || o.name.includes('ISRO') || o.name.includes('RISAT')) || objects[0];
  const debris = objects.find((o: any) => o.objectType === 'debris') || objects[1];

  const testCases = [isroSat, debris];

  const startDate = new Date();
  const durationMinutes = 60;
  const stepSeconds = 30;

  for (const obj of testCases) {
    console.log(`\n--- Propagating: ${obj.name} (NORAD: ${obj.noradId}) ---`);
    let satrec;
    try {
      satrec = parseTLEToSatrec(obj.line1, obj.line2);
    } catch (e: any) {
      console.error(`Failed to parse TLE for ${obj.name}: ${e.message}`);
      continue;
    }

    const trajectory = propagateOverWindow(satrec, startDate, durationMinutes, stepSeconds);
    
    console.log(`Generated ${trajectory.length} samples over ${durationMinutes} minutes (step: ${stepSeconds}s)`);
    console.log('Sample Trail (first 5 steps):');
    
    for (let i = 0; i < Math.min(5, trajectory.length); i++) {
      const state = trajectory[i];
      console.log(`[+${i * stepSeconds}s] Alt: ${state.geodetic.altitudeKm.toFixed(2)} km, Lat: ${state.geodetic.latitudeDegrees.toFixed(2)}°, Lon: ${state.geodetic.longitudeDegrees.toFixed(2)}°`);
    }

    const lastState = trajectory[trajectory.length - 1];
    if (lastState) {
        console.log(`...`);
        console.log(`[+${durationMinutes * 60}s] Alt: ${lastState.geodetic.altitudeKm.toFixed(2)} km, Lat: ${lastState.geodetic.latitudeDegrees.toFixed(2)}°, Lon: ${lastState.geodetic.longitudeDegrees.toFixed(2)}°`);
    }
  }
}

testPropagation();
