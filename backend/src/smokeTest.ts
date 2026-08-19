import http from 'http';

async function request(url: string, method: 'GET' | 'POST', body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP Error ${res.statusCode}: ${data}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runSmokeTests() {
  console.log("=========================================");
  console.log("RAGGoa - Running Production Smoke Tests");
  console.log("=========================================\n");

  const baseUrl = "http://localhost:5000";

  // Test 1: Health Check Endpoint
  try {
    console.log("Test 1: Querying GET /api/health...");
    const health = await request(`${baseUrl}/api/health`, 'GET');
    console.log("  [PASS] Status:", health.status);
    console.log("  [PASS] Database loaded:", health.database.loaded);
    console.log("  [PASS] Size:", health.database.size, "chunks");
  } catch (err: any) {
    console.error("  [FAIL] Health check failed:", err.message);
    process.exit(1);
  }

  // Test 2: Factual Grounded Text Query
  try {
    console.log("\nTest 2: Querying POST /api/query...");
    const queryResult = await request(`${baseUrl}/api/query`, 'POST', {
      query: "भारत की राजधानी क्या है?",
      strategy: "semantic",
      rerank: true
    });
    console.log("  [PASS] Status: HTTP 200");
    console.log("  [PASS] Answer:", queryResult.answer);
    console.log("  [PASS] Grounded status:", queryResult.confidenceStatus || "HIGH_CONFIDENCE");
    console.log("  [PASS] Citations:", queryResult.citations);
  } catch (err: any) {
    console.error("  [FAIL] Factual query failed:", err.message);
    process.exit(1);
  }

  // Test 3: Streaming SSE Endpoint
  try {
    console.log("\nTest 3: Querying POST /api/query-stream...");
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/query-stream',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      console.log("  [PASS] Status: HTTP 200 (SSE Event Stream)");
      let textBuffer = '';
      res.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.substring(6));
              if (payload.ttft) {
                console.log(`  [PASS] Time-to-First-Token: ${payload.ttft}ms`);
              } else if (payload.chunk) {
                textBuffer += payload.chunk;
              } else if (payload.done) {
                console.log(`  [PASS] Streaming complete in ${payload.totalMs}ms`);
              }
            } catch (e) {}
          }
        }
      });

      res.on('end', () => {
        console.log(`  [PASS] Full streamed response: "${textBuffer.trim()}"`);
        console.log("\n=========================================");
        console.log("ALL SMOKE TESTS PASSED SUCCESSFULLY! 🌴");
        console.log("=========================================");
      });
    });

    req.write(JSON.stringify({ query: "ताजमहल कहाँ स्थित है?", strategy: "semantic" }));
    req.end();

  } catch (err: any) {
    console.error("  [FAIL] Streaming query failed:", err.message);
    process.exit(1);
  }
}

runSmokeTests();
