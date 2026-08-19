import { mapBackendResponse } from '../components/Dashboard';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log("Running frontend unit tests for mapBackendResponse...");

// 1. Success
const res1 = mapBackendResponse({
  status: 'success',
  answer: 'ताजमहल आगरा में है।',
  citations: ['c1'],
  sources: [{ id: 'c1' }],
  telemetry: { total: 100 }
}, 200);
assert(res1.status === 'GROUNDED_SUCCESS', 'res1 status should be GROUNDED_SUCCESS');
assert(res1.answer === 'ताजमहल आगरा में है।', 'res1 answer match');
assert(res1.citations.length === 1, 'res1 citations match');

// 2. Refusal / Insufficient context
const res2 = mapBackendResponse({
  status: 'insufficient_context',
  answer: "I couldn't find enough information.",
  reason: 'Below threshold'
}, 200);
assert(res2.status === 'INSUFFICIENT_CTX', 'res2 status should be INSUFFICIENT_CTX');
assert(res2.citations.length === 0, 'res2 citations empty on refusal');
assert(res2.reason === 'Below threshold', 'res2 reason match');

// 3. Validation error (400)
const res3 = mapBackendResponse({ error: 'Query empty' }, 400);
assert(res3.status === 'VALIDATION_ERROR', 'res3 status should be VALIDATION_ERROR');

// 4. Rate limit (429)
const res4 = mapBackendResponse({ error: 'RATE_LIMITED' }, 429);
assert(res4.status === 'RATE_LIMITED', 'res4 status should be RATE_LIMITED');

// 5. Rate limit inside error string (200 or 500)
const res5 = mapBackendResponse({ error: 'ApiError: RESOURCE_EXHAUSTED 429' }, 200);
assert(res5.status === 'RATE_LIMITED', 'res5 status should be RATE_LIMITED');

// 6. Timeout
const res6 = mapBackendResponse({ error: 'GENERATION_TIMEOUT' }, 504);
assert(res6.status === 'SERVER_ERROR', 'res6 status should be SERVER_ERROR');

console.log("All mapBackendResponse tests passed successfully! (6/6 assertion suites)");
