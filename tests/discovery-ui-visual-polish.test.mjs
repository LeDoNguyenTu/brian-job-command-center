import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const discoveryCss = fs.readFileSync(new URL('../app/components/discovery-status.module.css', import.meta.url), 'utf8');

const readPolishCss = () => fs.readFileSync(new URL('../app/visual-polish.css', import.meta.url), 'utf8');

test('global visual polish stylesheet is mounted and themes every scrollbar', () => {
  assert.match(layout, /import\s+["']\.\/visual-polish\.css["']/);
  const css = readPolishCss();
  assert.match(css, /scrollbar-color\s*:\s*var\(--scroll-thumb\)\s+var\(--scroll-track\)/i);
  assert.match(css, /::\-webkit-scrollbar-thumb/i);
  assert.match(css, /::\-webkit-scrollbar-track/i);
  assert.match(css, /\.app-shell\.light[\s\S]*--scroll-thumb/i);
});

test('scrollable modals and horizontal controls are stable and touch friendly', () => {
  const css = readPolishCss();
  assert.match(css, /\.job-modal[\s\S]*scrollbar-gutter\s*:\s*stable/i);
  assert.match(css, /\.security-modal[\s\S]*overscroll-behavior\s*:\s*contain/i);
  assert.match(css, /\.editor-modal[\s\S]*overscroll-behavior\s*:\s*contain/i);
  assert.match(css, /\.filter-tabs[\s\S]*-webkit-overflow-scrolling\s*:\s*touch/i);
});

test('mobile layout respects dynamic viewport and device safe areas', () => {
  const css = readPolishCss();
  assert.match(css, /100dvh/i);
  assert.match(css, /env\(safe-area-inset-bottom\)/i);
  assert.match(css, /@media\s*\(max-width:\s*520px\)/i);
  assert.match(css, /min-width\s*:\s*0/i);
});

test('discovery health panel inherits dashboard theme instead of hardcoding dark mode', () => {
  assert.match(discoveryCss, /color\s*:\s*var\(--ink\)/i);
  assert.match(discoveryCss, /background\s*:\s*var\(--panel-solid\)/i);
  assert.match(discoveryCss, /color\s*:\s*var\(--muted\)/i);
  assert.match(discoveryCss, /var\(--border\)/i);
});
