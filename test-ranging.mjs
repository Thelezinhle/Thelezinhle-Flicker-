// Test ranging API
const API = 'https://flicker-secure-api.onrender.com';

async function test() {
  // Test 1: Create customer beacon at specific location
  const customerLat = -26.2041;
  const customerLng = 28.0473;
  
  console.log('1. Creating customer beacon...');
  const beaconRes = await fetch(`${API}/api/ranging/beacon/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: 'test-customer',
      orderId: 'TEST-DIST-001',
      latitude: customerLat,
      longitude: customerLng,
      accuracy: 5
    })
  });
  console.log('Beacon response:', await beaconRes.json());
  
  // Test 2: Start driver tracking at SAME location (should be ~0m)
  console.log('\n2. Starting driver tracking at SAME location...');
  const trackRes = await fetch(`${API}/api/ranging/track/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      driverId: 'test-driver',
      orderId: 'TEST-DIST-001',
      latitude: customerLat,  // Same location
      longitude: customerLng,
      accuracy: 5
    })
  });
  const trackData = await trackRes.json();
  console.log('Track response:', trackData);
  console.log(`Distance: ${trackData.data?.distance}m`);
  
  // Test 3: Update with driver 10 meters away
  console.log('\n3. Moving driver 10m away...');
  const updateRes = await fetch(`${API}/api/ranging/track/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: trackData.data?.sessionId,
      latitude: customerLat + 0.0001, // ~11 meters north
      longitude: customerLng,
      accuracy: 5
    })
  });
  const updateData = await updateRes.json();
  console.log('Update response:', updateData);
  console.log(`Distance after moving: ${updateData.data?.distance}m`);
  
  // Test 4: Check debug endpoint
  console.log('\n4. Checking debug beacons...');
  const debugRes = await fetch(`${API}/api/ranging/debug/beacons`);
  console.log('Debug:', await debugRes.json());
}

test().catch(console.error);
