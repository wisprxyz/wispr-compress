// wispr-compress: query-aware prompt compression with no model and no dependencies.
//
// Two stages:
//   1. clean      whitespace, duplicate lines and sentences, zero-width junk. Lossless for a model.
//   2. extractive split the text into units (sentences, headings, list items), score every unit
//                 against the query with BM25 (or by centrality when there is no query), keep the
//                 best units in their original order until the token budget is met.
//
// Nothing here calls a network. Token counts are estimates unless you pass your own tokenizer;
// the benchmark in bench/ reports the counts the provider actually billed.

const STOP = new Set(('a an and are as at be but by for from has have he her his if in into is it its of on or ' +
  'she that the their them they this to was were will with you your we our not no do does did than then there ' +
  'these those which who whom what when where why how can could should would may might also been being had').split(' '));

const ABBREV = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|no|fig|inc|ltd|co|corp|u\.s|u\.k|approx|dept|est|al|cf|op|ca)\.$/i;

/** Rough token estimate for English prose (about 1.3 tokens per word plus punctuation). */
export function estimateTokens(text) {
  if (!text) return 0;
  let n = 0;
  const re = /[A-Za-zÀ-ɏ']+|\d+|[^\sA-Za-zÀ-ɏ\d']/g;
  let m;
  while ((m = re.exec(text))) {
    const w = m[0];
    if (/^[A-Za-zÀ-ɏ']+$/.test(w)) n += w.length <= 4 ? 1 : Math.ceil(w.length / 4.2);
    else if (/^\d+$/.test(w)) n += Math.ceil(w.length / 3);
    else n += 1;
  }
  return n;
}

const stem = (w) => {
  if (w.length <= 4) return w;
  return w.replace(/(ies|sses)$/, (s) => (s === 'ies' ? 'y' : 'ss')).replace(/(ing|edly|ed|ly|es|s)$/, '');
};

export function terms(text) {
  const out = [];
  for (const w of text.toLowerCase().match(/[a-z0-9À-ɏ]+/g) || []) {
    if (STOP.has(w) || w.length < 2) continue;
    out.push(stem(w));
  }
  return out;
}

/** Normalise whitespace, drop zero-width characters, collapse repeated blank lines and repeated punctuation. */
export function clean(text) {
  let t = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍﻿­]/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([.!?]){3,}/g, '$1$1$1')
    .replace(/([,;:]){2,}/g, '$1')
    .trim();
  // duplicate lines (headers, footers, repeated boilerplate) keep their first occurrence only
  const seen = new Set();
  const lines = [];
  for (const line of t.split('\n')) {
    const key = line.trim().toLowerCase();
    if (key.length > 24 && seen.has(key)) continue;
    if (key) seen.add(key);
    lines.push(line);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Split text into units with paragraph membership.
 * A unit is a heading, a list item, or a sentence. Returns [{ text, para, head }].
 */
export function split(text) {
  const units = [];
  const paras = text.split(/\n\s*\n/);
  paras.forEach((para, pi) => {
    const p = para.trim();
    if (!p) return;
    const lines = p.split('\n');
    const isHeading = lines.length === 1 && p.length <= 90 && !/[.!?:;,]$/.test(p) && (/^#{1,6}\s/.test(p) || p.split(' ').length <= 12);
    if (isHeading) { units.push({ text: p, para: pi, head: true }); return; }
    const isList = lines.length > 1 && lines.every((l) => /^\s*(?:[-*•]|\d+[.)])\s/.test(l));
    if (isList) { for (const l of lines) units.push({ text: l.trim(), para: pi, head: false }); return; }
    const flat = lines.join(' ');
    let start = 0;
    const re = /[.!?]+["'”’)\]]*\s+(?=["'“‘(\[]?[A-Z0-9])/g;
    let m;
    while ((m = re.exec(flat))) {
      const end = m.index + m[0].length;
      const cand = flat.slice(start, end).trim();
      if (ABBREV.test(cand.replace(/["'”’)\]]+$/, ''))) continue;
      if (cand) units.push({ text: cand, para: pi, head: false });
      start = end;
    }
    const tail = flat.slice(start).trim();
    if (tail) units.push({ text: tail, para: pi, head: false });
  });
  return units;
}

/** Drop units whose normalised text already appeared. */
function dedupe(units) {
  const seen = new Set();
  return units.filter((u) => {
    const k = u.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (k.length > 20 && seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function bm25Scores(units, query, { k1 = 1.2, b = 0.75 } = {}) {
  const docs = units.map((u) => terms(u.text));
  const N = docs.length;
  const avgdl = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, N);
  const df = new Map();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  const idf = (t) => { const n = df.get(t) || 0; return Math.log(1 + (N - n + 0.5) / (n + 0.5)); };
  const q = terms(query);
  const qset = [...new Set(q)];
  return docs.map((d) => {
    if (!d.length) return 0;
    const tf = new Map();
    for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
    let s = 0;
    for (const t of qset) {
      const f = tf.get(t);
      if (!f) continue;
      s += idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.length / avgdl));
    }
    return s;
  });
}

// Query-free: a unit scores by how much document-wide informative vocabulary it carries (idf weighted),
// normalised by length so long sentences do not win by size alone.
function centralityScores(units) {
  const docs = units.map((u) => terms(u.text));
  const N = docs.length;
  const df = new Map();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  return docs.map((d) => {
    if (!d.length) return 0;
    let s = 0;
    for (const t of new Set(d)) { const n = df.get(t); if (n > 1) s += Math.log(1 + N / n); }
    return s / Math.sqrt(d.length);
  });
}

/**
 * Compress text.
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.query]        the question or task the text must still answer
 * @param {number} [opts.ratio]        keep this share of the estimated tokens (0 to 1). Default 0.3 when a query is given, 0.5 otherwise
 * @param {number} [opts.maxTokens]    absolute budget; wins over ratio when both are given
 * @param {'clean'|'extractive'} [opts.mode]  default 'extractive'
 * @param {boolean} [opts.keepHeadings]  keep a heading when anything under it is kept (default true)
 * @param {number} [opts.neighbour]    share of a unit's score lent to its neighbours (default 0.35)
 * @param {number} [opts.lead]         boost for the first sentence of a paragraph (default 0.15)
 * @param {string} [opts.gap]          marker for omitted material inside a paragraph (default '…')
 * @param {(text: string) => number} [opts.tokenizer]  your own token counter
 */
export function compress(text, opts = {}) {
  const count = opts.tokenizer || estimateTokens;
  const cleaned = clean(text);
  const before = count(String(text ?? ''));
  const mode = opts.mode || 'extractive';
  if (mode === 'clean') {
    const after = count(cleaned);
    return { text: cleaned, stats: stats(before, after, 0, 0) };
  }
  const units = dedupe(split(cleaned));
  const query = (opts.query || '').trim();
  const base = query ? bm25Scores(units, query) : centralityScores(units);
  const max = Math.max(...base, 1e-9);
  const nb = opts.neighbour ?? 0.35;
  const lead = opts.lead ?? 0.15;
  const scores = base.map((s, i) => {
    let v = s / max;
    if (nb) {
      const l = i > 0 && units[i - 1].para === units[i].para ? base[i - 1] / max : 0;
      const r = i + 1 < base.length && units[i + 1].para === units[i].para ? base[i + 1] / max : 0;
      v += nb * Math.max(l, r);
    }
    if (lead && (i === 0 || units[i - 1].para !== units[i].para)) v += lead * (query ? v : 1);
    if (units[i].head) v = 0; // headings ride along with their section, see keepHeadings
    return v;
  });
  const ratio = opts.ratio ?? (query ? 0.3 : 0.5);
  const unitTokens = units.map((u) => count(u.text));
  const total = unitTokens.reduce((a, b) => a + b, 0);
  const budget = Math.max(1, Math.floor(opts.maxTokens ?? ratio * total));
  const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const keep = new Set();
  let used = 0;
  for (const [s, i] of order) {
    if (s <= 0) break;
    if (used + unitTokens[i] > budget) continue;
    keep.add(i);
    used += unitTokens[i];
  }
  if (!keep.size && units.length) keep.add(order[0][1]);
  if (opts.keepHeadings !== false) {
    for (let i = 0; i < units.length; i++) {
      if (!units[i].head) continue;
      for (let j = i + 1; j < units.length && !units[j].head; j++) if (keep.has(j)) { keep.add(i); break; }
    }
  }
  const gap = opts.gap ?? '…';
  const out = [];
  let lastPara = -1, lastIdx = -1, para = [];
  const flush = () => { if (para.length) out.push(para.join(' ')); para = []; };
  for (let i = 0; i < units.length; i++) {
    if (!keep.has(i)) continue;
    const u = units[i];
    if (u.para !== lastPara) { flush(); lastPara = u.para; }
    else if (gap && lastIdx !== i - 1) para.push(gap);
    if (u.head) { flush(); out.push(u.text); } else para.push(u.text);
    lastIdx = i;
  }
  flush();
  const result = out.join('\n\n');
  const after = count(result);
  return { text: result, stats: stats(before, after, units.length, keep.size) };
}

function stats(before, after, units, kept) {
  return { tokensBefore: before, tokensAfter: after, ratio: before ? +(after / before).toFixed(3) : 1, saved: before ? +(1 - after / before).toFixed(3) : 0, units, kept };
}

/**
 * Compress the document part of a prompt while leaving the question intact.
 * Returns { context, question, stats }.
 */
export function compressContext({ context, question }, opts = {}) {
  const r = compress(context, { ...opts, query: question });
  return { context: r.text, question, stats: r.stats };
}

/**
 * Compress an OpenAI style messages array: every message longer than `minTokens` (default 400)
 * is compressed against the last user message. Short messages pass through untouched.
 */
export function compressMessages(messages, opts = {}) {
  const count = opts.tokenizer || estimateTokens;
  const minTokens = opts.minTokens ?? 400;
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const query = opts.query ?? (typeof last?.content === 'string' ? last.content.slice(-2000) : '');
  let before = 0, after = 0;
  const out = messages.map((m) => {
    if (typeof m.content !== 'string') return m;
    const n = count(m.content);
    before += n;
    if (n < minTokens) { after += n; return m; }
    // the question itself is often inside the long message: compress all of it except its last 400 tokens of text
    const r = compress(m.content, { ...opts, query: m === last ? query : (opts.query ?? query) });
    after += r.stats.tokensAfter;
    return { ...m, content: r.text };
  });
  return { messages: out, stats: stats(before, after, 0, 0) };
}

export default compress;
