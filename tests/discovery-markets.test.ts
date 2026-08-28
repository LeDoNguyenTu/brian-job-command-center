import test from "node:test";
import assert from "node:assert/strict";
import { normalizeJobMarkets } from "../supabase/functions/discover-jobs/core/markets.ts";

test("normalizes all initial APAC markets", () => {
  assert.deepEqual(normalizeJobMarkets(["Singapore"]), ["SG"]);
  assert.deepEqual(normalizeJobMarkets(["Ho Chi Minh City, Vietnam"]), ["VN"]);
  assert.deepEqual(normalizeJobMarkets(["Kuala Lumpur, Malaysia"]), ["MY"]);
  assert.deepEqual(normalizeJobMarkets(["Bangkok, Thailand"]), ["TH"]);
  assert.deepEqual(normalizeJobMarkets(["Jakarta, Indonesia"]), ["ID"]);
  assert.deepEqual(normalizeJobMarkets(["Manila, Philippines"]), ["PH"]);
});

test("deduplicates multi-location market codes", () => {
  assert.deepEqual(normalizeJobMarkets(["Singapore", "Singapore, SG", "Ho Chi Minh City, Vietnam"]), ["SG", "VN"]);
});
