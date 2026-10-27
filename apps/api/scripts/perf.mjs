/**
 * Simple latency benchmark for common API endpoints.
 * Usage: node scripts/perf.mjs [baseUrl] [requestsPerEndpoint] [concurrency]
 * Expects the dev seed + scripts/seed-perf.ts data (accounts perf5, trainer1, admin).
 */
const BASE = process.argv[2] ?? 'http://localhost:4012';
const N = Number(process.argv[3] ?? 200);
const CONCURRENCY = Number(process.argv[4] ?? 10);
const PASSWORD = process.env.PERF_PASSWORD ?? 'Password123!';

async function login(identifier) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
    body: JSON.stringify({ identifier, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${identifier}: ${res.status}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return cookie;
}

async function measure(cookie, path) {
  const times = [];
  let errors = 0;
  const run = async () => {
    const t = performance.now();
    const res = await fetch(`${BASE}/api/v1${path}`, { headers: { cookie } });
    await res.arrayBuffer();
    if (!res.ok) errors++;
    times.push(performance.now() - t);
  };
  for (let i = 0; i < 20; i++) await run(); // warm-up
  times.length = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next++ < N) await run();
    }),
  );
  times.sort((a, b) => a - b);
  const pct = (p) =>
    times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))].toFixed(1);
  return { path, n: times.length, errors, p50: pct(50), p95: pct(95), p99: pct(99) };
}

const student = await login('perf5');
const trainer = await login('trainer1');
const admin = await login('admin');
const plan = [
  [student, '/auth/me'],
  [student, '/reading-sessions/active'],
  [student, '/student-books?pageSize=12'],
  [student, '/reading-sessions?pageSize=20'],
  [student, '/reflections?pageSize=15'],
  [student, '/analytics/me'],
  [student, '/analytics/reading-trends?from=2025-10-27&to=2026-10-27&granularity=month'],
  [trainer, '/trainer/students?pageSize=25'],
  [trainer, '/trainer/students?pageSize=25&inactiveOnly=true'],
  [trainer, '/trainer/overview'],
  [admin, '/admin/users?pageSize=25'],
  [admin, '/admin/reports/student-summary?format=json&from=2026-09-28&to=2026-10-27'],
];
const results = [];
for (const [cookie, path] of plan) results.push(await measure(cookie, path));
console.table(results); // eslint-disable-line no-console -- benchmark output
console.warn(
  `base=${BASE} requests/endpoint=${N} concurrency=${CONCURRENCY} node=${process.version}`,
);
