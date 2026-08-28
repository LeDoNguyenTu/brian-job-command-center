import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/discover-jobs/orchestrator.ts', 'utf8');
const match = source.match(/const requiredExperienceYears = \(text: string\) => \{([\s\S]*?)\n\};/);
assert.ok(match, 'requiredExperienceYears implementation not found');
const requiredExperienceYears = new Function('text', match[1]);

test('parses flattened required experience without a later Preferred section masking it', () => {
  assert.equal(requiredExperienceYears('Required Skills Backend & Frameworks Kotlin (4+ yrs) & Java/JVM Preferred Experience Go'), 4);
});

test('parses lower bounds from required experience ranges', () => {
  assert.equal(requiredExperienceYears('Requirements At least 2-5 years experience as a software engineer.'), 2);
  assert.equal(requiredExperienceYears('Requirements Minimum 3-5 years experience in enterprise systems.'), 3);
  assert.equal(requiredExperienceYears('Requirements 2–4 years of experience in application development.'), 2);
  assert.equal(requiredExperienceYears('Requirements Minimum 1 to 3 years of experience in IT support.'), 1);
});

test('parses required experience when a flattened heading precedes the numeric requirement', () => {
  assert.equal(requiredExperienceYears('Experience 7+ years total engineering experience, with 3+ years in a senior/lead IC capacity.'), 7);
});

test('ignores clearly preferred experience ranges', () => {
  assert.equal(requiredExperienceYears('Requirements 1 year of Java experience. Preferred Experience 3-5 years with Pega.'), 1);
  assert.equal(requiredExperienceYears('Requirements 1 year of Java experience. 3+ years with Go preferred.'), 1);
});
