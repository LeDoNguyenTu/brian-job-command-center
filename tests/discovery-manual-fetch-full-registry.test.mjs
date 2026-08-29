import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/discover-jobs/index.ts', 'utf8');

test('authenticated manual fetch queues the remaining enabled source registry safely', () => {
  assert.match(source, /request\.clone\(\)\.json\(\)/);
  assert.match(source, /action\s*===\s*['"]manual['"]/);
  assert.match(source, /handleDiscoveryRequest\(request\)/);
  assert.match(source, /discovery_sources/);
  assert.match(source, /\.eq\(['"]enabled['"],\s*true\)/);
  assert.match(source, /next_crawl_at/);
  assert.match(source, /queuedSources/);
});

test('manual queueing happens only after the orchestrator accepted the request', () => {
  const handled = source.indexOf('handleDiscoveryRequest(request)');
  const queue = source.indexOf("from('discovery_sources')");
  assert.ok(handled >= 0 && queue > handled, 'manual queue must happen after orchestrator authorization/success');
});
