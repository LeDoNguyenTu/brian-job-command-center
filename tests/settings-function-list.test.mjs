import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/settings-function-list.tsx", import.meta.url), "utf8").catch(() => "");
const styles = await readFile(new URL("../app/settings-function-list.css", import.meta.url), "utf8").catch(() => "");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("settings are presented as a compact function list with one detail panel visible", () => {
  assert.match(source, /Settings functions/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /\.security-panel/);
  assert.match(source, /aria-selected/);
  assert.match(source, /settings-function-list/);
  assert.match(source, /settings-function-button/);
  assert.match(source, /hidden = index !== selectedIndex/);
  assert.match(styles, /\.settings-function-list/);
  assert.match(styles, /\.settings-function-button/);
  assert.match(layout, /<SettingsFunctionListEnhancer \/>/);
});
