import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const migrationsDir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
const sql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => readFileSync(path.join(migrationsDir, name), 'utf8'))
  .join('\n');

test('database rejects self-claimed unknown employer sources learned from web search', () => {
  assert.match(sql, /enforce_web_discovery_employer_ownership/i);
  assert.match(sql, /provider\s+in\s*\(\s*'generic'\s*,\s*'custom'\s*\)/i);
  assert.match(sql, /employer_host\s*=\s*source_host/i);
  assert.match(sql, /source_host\s+not\s+like\s+'%\.'\s*\|\|\s*employer_host/i);
});
