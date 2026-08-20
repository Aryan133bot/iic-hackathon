import http from 'http';

function fetchConjunctions(): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/api/conjunctions?refresh=true', (res) => {
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

async function runTest() {
  console.log('Testing /api/conjunctions endpoint (this may take a few seconds)...');
  try {
    const res = await fetchConjunctions();
    
    if (res.error) {
      console.error('API returned an error:', res.error);
      return;
    }

    const events = res.events || [];
    console.log(`\nComputed At: ${res.computedAt}`);
    console.log(`Total Events Found (Next 24h, <10km): ${events.length}`);

    if (events.length === 0) {
      console.log('\nNo conjunctions found within the threshold in the next 24 hours. (This is normal and physically realistic for a small 170-object subset!)');
      // If we had a way to print the global closest, we could, but our API filters by 10km.
    } else {
      console.log('\nTop 5 Most Urgent Conjunctions:');
      const top5 = events.slice(0, 5);
      top5.forEach((ev: any, i: number) => {
        console.log(`\n[${i + 1}] RISK: ${ev.riskTier.toUpperCase()}`);
        console.log(`    ${ev.objectA.name} (${ev.objectA.noradId}) vs ${ev.objectB.name} (${ev.objectB.noradId})`);
        console.log(`    Time of Closest Approach: ${ev.timeOfClosestApproach}`);
        console.log(`    Distance: ${ev.closestApproachKm.toFixed(3)} km`);
        console.log(`    Relative Velocity: ${ev.relativeVelocityKmS.toFixed(3)} km/s`);
      });
    }

  } catch (e) {
    console.error('Test failed. Ensure Next.js dev server is running (npm run dev).', e);
  }
}

runTest();
