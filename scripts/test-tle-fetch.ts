import https from 'http'; // local is http

function fetchLocalAPI(): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get('http://localhost:3000/api/tle', (res) => {
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

async function testFetch() {
  console.log('Testing /api/tle endpoint...');
  try {
    const res = await fetchLocalAPI();
    console.log(`Fetched at: ${res.fetchedAt}`);
    console.log(`Total objects: ${res.objects.length}`);
    console.log('Sample object 1 (ISRO):', res.objects.find((o: any) => o.name.includes('ISRO') || o.name.includes('CARTOSAT')));
    console.log('Sample object 2 (Debris):', res.objects.find((o: any) => o.objectType === 'debris'));
  } catch (e) {
    console.error(e);
  }
}

testFetch();
