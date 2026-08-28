import test from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml } from '../supabase/functions/discover-jobs/adapters/common.ts';

test('HTML normalization preserves encoded plus signs in experience requirements', () => {
  assert.equal(stripHtml('Requires 3&#43; years of experience &amp; production ownership.'), 'Requires 3+ years of experience & production ownership.');
});
