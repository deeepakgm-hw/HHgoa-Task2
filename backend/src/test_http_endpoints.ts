async function run() {
  console.log("Testing live endpoints at http://localhost:5000...\n");

  // Health check
  try {
    const healthRes = await fetch("http://localhost:5000/api/health");
    const health = await healthRes.json() as any;
    console.log("1. /api/health:", health.status, "Chunks:", health.database?.size, "GenModel:", health.services?.generation);
  } catch (err: any) {
    console.log("Health check failed:", err.message);
  }

  // Known Good Hindi Query
  try {
    console.log("\n2. Testing known good query: 'ताजमहल कहाँ स्थित है?'");
    const t0 = performance.now();
    const qRes = await fetch("http://localhost:5000/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "ताजमहल कहाँ स्थित है?" })
    });
    const dur = (performance.now() - t0).toFixed(2);
    const qData = await qRes.json() as any;
    console.log(`   HTTP Status: ${qRes.status} | Pipeline: ${dur}ms`);
    console.log(`   Status: ${qData.status} | Mode: ${qData.mode}`);
    console.log(`   Answer: ${qData.answer}`);
    console.log(`   Citations:`, qData.citations);
  } catch (err: any) {
    console.log("Query failed:", err.message);
  }

  // Refusal Query
  try {
    console.log("\n3. Testing out-of-domain query: 'जापान की राजधानी क्या है?'");
    const t0 = performance.now();
    const qRes = await fetch("http://localhost:5000/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "जापान की राजधानी क्या है?" })
    });
    const dur = (performance.now() - t0).toFixed(2);
    const qData = await qRes.json() as any;
    console.log(`   HTTP Status: ${qRes.status} | Pipeline: ${dur}ms`);
    console.log(`   Status: ${qData.status} | Mode: ${qData.mode}`);
    console.log(`   Answer: ${qData.answer}`);
    console.log(`   Reason: ${qData.reason}`);
  } catch (err: any) {
    console.log("Refusal query failed:", err.message);
  }
}

run();
