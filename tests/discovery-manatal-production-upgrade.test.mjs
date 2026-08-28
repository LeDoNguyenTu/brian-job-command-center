import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationDir = path.resolve('supabase/migrations');
const sql = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8'))
  .join('\n');

test('existing Manatal sources are promoted to the structured adapter', () => {
  assert.match(sql, /update\s+public\.discovery_sources[\s\S]*adapter\s*=\s*'manatal'[\s\S]*provider\s*=\s*'manatal'/i);
  assert.match(sql, /source_class\s*=\s*'direct_structured'/i);
});
