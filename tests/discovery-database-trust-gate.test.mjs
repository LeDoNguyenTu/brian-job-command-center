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

test('database rejects web-learned board search pages that are not individual vacancies', () => {
  assert.match(sql, /enforce_web_discovery_source_quality/i);
  assert.match(sql, /source_class\s*=\s*'verified_board'/i);
  assert.match(sql, /individual vacancy listing/i);
  assert.match(sql, /linkedin\.com/i);
  assert.match(sql, /indeed\.com/i);
});

test('database normalizes role-like learned ATS source names from the stable source slug', () => {
  assert.match(sql, /role_like_title/i);
  assert.match(sql, /source_slug/i);
  assert.match(sql, /new\.company\s*:=\s*source_slug/i);
  assert.match(sql, /new\.display_name\s*:=\s*source_slug/i);
});

test('database refines source-name detection without treating industry words as job titles', () => {
  assert.match(sql, /refine_web_discovery_source_names/i);
  assert.match(sql, /engineer\|developer\|analyst/i);
});

test('database canonicalizes Greenhouse source aliases before unique URL enforcement', () => {
  assert.match(sql, /normalize_discovery_source_canonical_url/i);
  assert.match(sql, /boards\.greenhouse\.io/i);
  assert.match(sql, /job-boards\.greenhouse\.io/i);
  assert.match(sql, /new\.canonical_url/i);
});

test('database derives stable Workday and Manatal learned source names', () => {
  assert.match(sql, /refine_discovery_provider_source_name/i);
  assert.match(sql, /provider_name\s*=\s*'workday'/i);
  assert.match(sql, /myworkdayjobs\.com/i);
  assert.match(sql, /provider_name\s*=\s*'manatal'/i);
  assert.match(sql, /careers-page\.com/i);
  assert.match(sql, /new\.company\s*:=\s*refined_name/i);
});

test('database canonicalizes Manatal legacy and advanced career-page roots', () => {
  assert.match(sql, /normalize_discovery_source_canonical_url/i);
  assert.match(sql, /provider_name\s*=\s*'manatal'/i);
  assert.match(sql, /https:\/\/www\.careers-page\.com\//i);
  assert.match(sql, /new\.employer_host\s*:=\s*'www\.careers-page\.com'/i);
});
