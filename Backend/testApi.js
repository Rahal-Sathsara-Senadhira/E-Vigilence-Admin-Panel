import fs from 'fs';

async function testApi() {
  // 1. Login as Admin
  const loginRes = await fetch("http://localhost:8081/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@evigilance.com", password: "admin123" })
  });
  
  if (!loginRes.ok) {
    console.error("Login failed:", await loginRes.text());
    process.exit(1);
  }
  
  const loginData = await loginRes.json();
  const token = loginData.data.token;
  const cookie = `token=${token}`;
  console.log("Logged in successfully.");

  // 2. Fetch Police Stations to assign the officer to
  const stationsRes = await fetch("http://localhost:8081/api/stations", {
    headers: { "Cookie": cookie }
  });
  const stationsData = await stationsRes.json();
  const stationId = stationsData?.data?.[0]?._id;

  if (stationId) {
    // 3. Create Dummy Police Officer
    const createUserRes = await fetch("http://localhost:8081/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": cookie },
      body: JSON.stringify({
        name: "Dummy Officer",
        email: "officer@evigilance.com",
        password: "officerpassword",
        role: "station_officer",
        stationId: stationId
      })
    });
    
    if (createUserRes.ok) {
      console.log("Dummy officer created successfully!");
    } else {
      console.log("Dummy officer creation failed or already exists:", await createUserRes.text());
    }
  } else {
    console.log("No stations found. Cannot create officer without a station.");
  }

  // 4. Fetch latest violations/complaints
  const violationsRes = await fetch("http://localhost:8081/api/violations?limit=5&sort=desc", {
    headers: { "Cookie": cookie }
  });
  const violationsData = await violationsRes.json();
  console.log("\n--- Latest Violations/Complaints ---");
  console.log(JSON.stringify(violationsData.data.slice(0, 3), null, 2));

}

testApi();
