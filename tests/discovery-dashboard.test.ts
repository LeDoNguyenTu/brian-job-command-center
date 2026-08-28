import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../app/components/DiscoveryStatusPanel.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/components/discovery-status.module.css', import.meta.url), 'utf8');

test('mounts authenticated APAC discovery health controls', () => {
  assert.match(layout, /DiscoveryStatusPanel/);
  assert.match(component, /discovery_markets/);
  for (const code of ['SG', 'VN', 'MY', 'TH', 'ID', 'PH']) assert.match(component, new RegExp(`code: "${code}"`));
  assert.match(component, /from\("discovery_sources"\)/);
  assert.match(component, /from\("discovery_runs"\)/);
  assert.match(component, /from\("discovery_quarantine"\)/);
  assert.match(component, /Source health/);
  assert.match(component, /Verified open/);
  assert.match(component, /Date unavailable/);
  assert.match(component, /First seen/);
  assert.match(styles, /\.sourceHealthGrid/);
  assert.match(styles, /\.marketToggleGrid/);
});