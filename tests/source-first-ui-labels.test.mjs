import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/source-first-ui-enhancer.tsx", import.meta.url), "utf8").catch(() => "");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("legacy dashboard labels identify the independent source-first scanner", () => {
  assert.match(source, /Source-first Job Scanner/);
  assert.match(source, /Supabase scanner · independent of ChatGPT/);
  assert.match(source, /Posted date/);
  assert.match(source, /All posted dates/);
  assert.match(source, /Date unavailable/);
  assert.match(source, /MutationObserver/);
  assert.match(layout, /<SourceFirstUiEnhancer \/>/);
});

test("manual full-registry scans surface progress and refresh when a new trusted job arrives", () => {
  assert.match(source, /Fetch now/);
  assert.match(source, /discovery_message/);
  assert.match(source, /Manual full-registry scan/);
  assert.match(source, /created_at/);
  assert.match(source, /availability_status/);
  assert.match(source, /verified_open/);
  assert.match(source, /window\.location\.reload\(\)/);
});
