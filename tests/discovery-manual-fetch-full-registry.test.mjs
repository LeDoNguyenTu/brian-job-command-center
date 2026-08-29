import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/discover-jobs/index.ts', 'utf8');

test('authenticated manual fetch queues the remaining enabled source registry safely', () => {
  assert.match(source, /request\.clone\(\)\.json\(\)/);
  assert.match(source, /requestedAction\s*!==\s*['"]manual['"]/);
  assert.match(source, /handleDiscoveryRequest\(request\)/);
  assert.match(source, /discovery_sources/);
  assert.match(source, /\.eq\(['"]enabled['"],\s*true\)/);
  assert.match(source, /next_crawl_at/);
  assert.match(source, /queuedSources/);
});

test('manual queueing happens only after the orchestrator accepted the request', () => {
  const handled = source.indexOf('handleDiscoveryRequest(request)');
  const queueCall = source.indexOf('queueRemainingManualSources(body)');
  assert.ok(handled >= 0 && queueCall > handled, 'manual queue must happen after orchestrator authorization/success');
  assert.match(source, /requestedAction !== 'manual' \|\| !response\.ok/);
});
