import { app } from './app';

const seen = new Set<string>();

for (const route of app.routes) {
  if (route.method === 'ALL') continue;
  const key = `${route.method} ${route.path}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`${route.method.padEnd(7)} ${route.path}`);
}
