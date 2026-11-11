import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compress, compressContext, compressMessages, clean, split, estimateTokens } from '../src/index.js';

const DOC = `Oxygen

Oxygen is a chemical element with symbol O and atomic number 8. It is a member of the chalcogen group on the periodic table and is a highly reactive nonmetal. Oxygen is the third most abundant element in the universe by mass.

History

Oxygen was discovered independently by Carl Wilhelm Scheele, in Uppsala, in 1773 or earlier, and Joseph Priestley in Wiltshire, in 1774. Priestley is usually given priority because his work was published first. The name oxygen was coined in 1777 by Antoine Lavoisier.

Uses

Common uses of oxygen include the production of steel, plastics and textiles. Oxygen is also used in medicine, in welding and in rocket propellant. Dr. Smith said the market for oxygen is large. It is sold in cylinders.
`;

test('clean collapses whitespace and duplicate lines', () => {
  const t = clean('a  b\r\n\r\n\r\nThis line is long enough to be deduplicated here\nThis line is long enough to be deduplicated here\n');
  assert.equal(t, 'a b\n\nThis line is long enough to be deduplicated here');
});

test('split keeps headings and does not break on abbreviations', () => {
  const u = split(clean(DOC));
  assert.ok(u.find((x) => x.head && x.text === 'History'));
  const smith = u.find((x) => /Dr\. Smith/.test(x.text));
  assert.ok(smith && /large\.$/.test(smith.text), 'Dr. must not end a sentence');
});

test('query-aware compression keeps the answering sentence', () => {
  const r = compress(DOC, { query: 'Who coined the name oxygen?', ratio: 0.25 });
  assert.match(r.text, /Lavoisier/);
  assert.ok(r.stats.tokensAfter < r.stats.tokensBefore * 0.4, `too big: ${JSON.stringify(r.stats)}`);
  assert.ok(r.text.indexOf('History') < r.text.indexOf('Lavoisier'), 'heading kept above its section');
});

test('maxTokens wins over ratio', () => {
  const r = compress(DOC, { query: 'uses of oxygen', maxTokens: 30 });
  assert.ok(r.stats.tokensAfter <= 45, JSON.stringify(r.stats));
  assert.match(r.text, /steel|welding|medicine/);
});

test('no query falls back to centrality and still returns text', () => {
  const r = compress(DOC, { ratio: 0.4 });
  assert.ok(r.text.length > 0);
  assert.ok(r.stats.saved > 0.4);
});

test('clean mode never drops content units', () => {
  const r = compress(DOC, { mode: 'clean' });
  assert.match(r.text, /Lavoisier/);
  assert.match(r.text, /cylinders/);
});

test('compressContext leaves the question untouched', () => {
  const r = compressContext({ context: DOC, question: 'When was oxygen discovered?' }, { ratio: 0.3 });
  assert.equal(r.question, 'When was oxygen discovered?');
  assert.match(r.context, /1773|1774/);
});

test('compressMessages only touches long messages', () => {
  const long = DOC.repeat(6);
  const r = compressMessages([
    { role: 'system', content: 'Answer briefly.' },
    { role: 'user', content: long + '\n\nWho discovered oxygen?' },
  ], { minTokens: 100, ratio: 0.3 });
  assert.equal(r.messages[0].content, 'Answer briefly.');
  assert.ok(r.messages[1].content.length < long.length / 2);
  assert.match(r.messages[1].content, /Scheele|Priestley/);
});

test('estimateTokens is in the right range for prose', () => {
  const n = estimateTokens('The quick brown fox jumps over the lazy dog, twice.');
  assert.ok(n >= 11 && n <= 16, String(n));
});

test('empty input', () => {
  const r = compress('');
  assert.equal(r.text, '');
  assert.equal(r.stats.tokensBefore, 0);
});
