#!/usr/bin/env node
// Benchmark: does compression keep the answer, and what does it save?
//
// Data: SQuAD v1.1 dev (Rajpurkar et al., CC BY-SA 4.0), downloaded on first run into bench/data/.
// Each item = one Wikipedia article (all its paragraphs, 3k to 14k words) + one question whose answer
// is a span of the article. The model gets the whole article (arm "full") or a compressed article, and
// is scored with the standard SQuAD exact match and F1 against the gold answers.
//
// Arms:  full       the article as is
//        clean      whitespace + duplicate removal only (lossless for a model)
//        x50 x30 x15 query-aware extractive at 50%, 30%, 15% of the tokens
//
// --dry runs no model: it reports the token savings and whether a gold answer still appears verbatim
// in the compressed article ("answer retained"). That costs nothing and is the first thing to look at.
//
// Model calls go to any OpenAI compatible endpoint (default https://api.wispr.xyz/v1). Key: WISPR_KEY
// env or --key <file>. Prompt tokens, cost and latency are taken from the response, not estimated.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compress, estimateTokens } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);

const N = +arg('--n', 50);
const SEED = +arg('--seed', 1);
const DRY = flag('--dry');
const ARMS = arg('--arms', 'full,clean,x50,x30,x15').split(',');
const MODELS = arg('--models', 'dolphin-mistral-24b').split(',');
const BASE = (arg('--base', process.env.WISPR_BASE || 'https://api.wispr.xyz/v1')).replace(/\/$/, '');
const KEY = process.env.WISPR_KEY || (arg('--key') ? readFileSync(arg('--key'), 'utf8').trim() : '');
const PAR = +arg('--parallel', 4);
const MAX_SPEND = +arg('--max-spend', 5);
const DATA = join(here, 'data');
const RESULTS = join(here, 'results');

const ratios = { x50: 0.5, x30: 0.3, x15: 0.15 };

// ---------- data ----------
async function loadSquad() {
  mkdirSync(DATA, { recursive: true });
  const f = join(DATA, 'dev-v1.1.json');
  if (!existsSync(f)) {
    const url = 'https://rajpurkar.github.io/SQuAD-explorer/dataset/dev-v1.1.json';
    process.stderr.write(`downloading ${url}\n`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download failed ${r.status}`);
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return JSON.parse(readFileSync(f, 'utf8'));
}

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function sample(squad, n, seed) {
  const rand = rng(seed);
  const items = [];
  const articles = squad.data.map((a) => ({ title: a.title, context: a.paragraphs.map((p) => p.context).join('\n\n'), qas: a.paragraphs.flatMap((p) => p.qas) }));
  // spread over articles: round robin through a shuffled article list, one random question each pass
  const order = articles.map((_, i) => i).sort(() => rand() - 0.5);
  const used = new Set();
  let pass = 0;
  while (items.length < n && pass < 50) {
    for (const ai of order) {
      if (items.length >= n) break;
      const a = articles[ai];
      const q = a.qas[Math.floor(rand() * a.qas.length)];
      if (used.has(q.id)) continue;
      used.add(q.id);
      items.push({ id: q.id, title: a.title, context: a.context, question: q.question, answers: [...new Set(q.answers.map((x) => x.text))] });
    }
    pass++;
  }
  return items;
}

// ---------- scoring (official SQuAD v1.1 normalisation) ----------
const norm = (s) => s.toLowerCase().replace(/[^\w\s]|_/g, ' ').replace(/\b(a|an|the)\b/g, ' ').split(/\s+/).filter(Boolean).join(' ');
const em = (pred, golds) => golds.some((g) => norm(g) === norm(pred)) ? 1 : 0;
function f1(pred, golds) {
  let best = 0;
  const p = norm(pred).split(' ').filter(Boolean);
  for (const g of golds) {
    const t = norm(g).split(' ').filter(Boolean);
    const counts = new Map();
    for (const w of t) counts.set(w, (counts.get(w) || 0) + 1);
    let same = 0;
    for (const w of p) if (counts.get(w)) { same++; counts.set(w, counts.get(w) - 1); }
    if (!same) continue;
    const pr = same / p.length, rc = same / t.length;
    best = Math.max(best, (2 * pr * rc) / (pr + rc));
  }
  return best;
}
const retained = (text, golds) => golds.some((g) => norm(text).includes(norm(g))) ? 1 : 0;

// ---------- model ----------
const SYSTEM = 'You answer questions from a document. Reply with the shortest exact phrase from the document that answers the question, nothing else. If the document does not contain the answer, reply: unknown';

async function ask(model, context, question) {
  const body = { model, temperature: 0, max_tokens: 48, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Document:\n${context}\n\nQuestion: ${question}\nAnswer:` }] };
  const t0 = Date.now();
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}`, 'x-wispr-shard': 'off', 'x-wispr-reroute': 'off' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || j.error || `http ${r.status}`);
      const text = (j.choices?.[0]?.message?.content || '').trim().split('\n')[0];
      return { text, tokIn: j.usage?.prompt_tokens ?? null, tokOut: j.usage?.completion_tokens ?? null, cost: j.wispr?.cost_usd ?? null, ms: Date.now() - t0, model: j.model || model };
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); }
  }
  return { text: '', error: String(last?.message || last), ms: Date.now() - t0 };
}

async function pool(items, fn, par) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: par }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

// ---------- stats ----------
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
function bootCI(diffs, iters = 2000, seed = 7) {
  const rand = rng(seed);
  const ms = [];
  for (let i = 0; i < iters; i++) { let s = 0; for (let j = 0; j < diffs.length; j++) s += diffs[Math.floor(rand() * diffs.length)]; ms.push(s / diffs.length); }
  ms.sort((a, b) => a - b);
  return [ms[Math.floor(iters * 0.025)], ms[Math.floor(iters * 0.975)]];
}

// ---------- main ----------
const squad = await loadSquad();
const items = sample(squad, N, SEED);
process.stderr.write(`${items.length} questions over ${new Set(items.map((i) => i.title)).size} articles, seed ${SEED}\n`);

const variants = items.map((it) => {
  const v = { full: { text: it.context, stats: { tokensBefore: estimateTokens(it.context), tokensAfter: estimateTokens(it.context), saved: 0 } } };
  for (const arm of ARMS) {
    if (arm === 'full') continue;
    const r = arm === 'clean' ? compress(it.context, { mode: 'clean' }) : compress(it.context, { query: it.question, ratio: ratios[arm] });
    v[arm] = r;
  }
  return v;
});

const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
mkdirSync(RESULTS, { recursive: true });

// dry: savings + answer retained
const dry = {};
for (const arm of ARMS) {
  const rows = items.map((it, i) => ({ saved: variants[i][arm].stats.saved ?? 0, est: variants[i][arm].stats.tokensAfter, retained: retained(variants[i][arm].text, it.answers) }));
  dry[arm] = { estTokens: Math.round(mean(rows.map((r) => r.est))), saved: mean(rows.map((r) => r.saved)), retained: mean(rows.map((r) => r.retained)) };
}
let md = `# wispr-compress benchmark ${stamp}\n\nSQuAD v1.1 dev, ${items.length} questions over ${new Set(items.map((i) => i.title)).size} articles (whole article as context), seed ${SEED}.\n\n## Compression only (no model)\n\n| arm | est. tokens | saved | gold answer still in text |\n|---|---:|---:|---:|\n`;
for (const arm of ARMS) md += `| ${arm} | ${dry[arm].estTokens} | ${(dry[arm].saved * 100).toFixed(1)}% | ${(dry[arm].retained * 100).toFixed(1)}% |\n`;

const report = { stamp, n: items.length, seed: SEED, arms: ARMS, dry, models: {} };
if (!DRY) {
  if (!KEY) { process.stderr.write('no key: set WISPR_KEY or --key <file>\n'); process.exit(1); }
  let spent = 0;
  const rows = [];
  for (const model of MODELS) {
    const perArm = {};
    for (const arm of ARMS) {
      process.stderr.write(`${model} ${arm}: `);
      const res = await pool(items, async (it, i) => {
        if (spent > MAX_SPEND) return { text: '', error: 'max spend reached', ms: 0 };
        const r = await ask(model, variants[i][arm].text, it.question);
        spent += r.cost || 0;
        process.stderr.write(r.error ? 'x' : '.');
        return r;
      }, PAR);
      process.stderr.write(` $${spent.toFixed(4)}\n`);
      const scored = res.map((r, i) => ({ id: items[i].id, title: items[i].title, model, arm, pred: r.text, error: r.error, em: r.error ? 0 : em(r.text, items[i].answers), f1: r.error ? 0 : f1(r.text, items[i].answers), tokIn: r.tokIn, tokOut: r.tokOut, cost: r.cost, ms: r.ms }));
      rows.push(...scored);
      perArm[arm] = scored;
    }
    const base = perArm.full || perArm[ARMS[0]];
    report.models[model] = {};
    md += `\n## ${model}\n\n| arm | prompt tokens | saved | cost / question | total cost | latency | EM | F1 | F1 vs full (95% CI) | errors |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
    for (const arm of ARMS) {
      const s = perArm[arm];
      const ok = s.filter((r) => !r.error);
      const tokIn = mean(ok.map((r) => r.tokIn).filter((x) => x != null));
      const baseTok = mean(base.filter((r) => !r.error).map((r) => r.tokIn).filter((x) => x != null));
      const cost = ok.map((r) => r.cost).filter((x) => x != null);
      const diffs = s.map((r, i) => r.f1 - base[i].f1);
      const [lo, hi] = bootCI(diffs);
      const row = { promptTokens: Math.round(tokIn), saved: baseTok ? 1 - tokIn / baseTok : 0, costPerQ: mean(cost), totalCost: cost.reduce((a, b) => a + b, 0), latencyMs: Math.round(mean(ok.map((r) => r.ms))), em: mean(s.map((r) => r.em)), f1: mean(s.map((r) => r.f1)), f1Delta: mean(diffs), ci: [lo, hi], errors: s.length - ok.length };
      report.models[model][arm] = row;
      md += `| ${arm} | ${row.promptTokens} | ${(row.saved * 100).toFixed(1)}% | $${row.costPerQ.toFixed(5)} | $${row.totalCost.toFixed(4)} | ${(row.latencyMs / 1000).toFixed(1)} s | ${(row.em * 100).toFixed(0)}% | ${(row.f1 * 100).toFixed(1)} | ${arm === 'full' ? '' : `${(row.f1Delta * 100 >= 0 ? '+' : '')}${(row.f1Delta * 100).toFixed(1)} [${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}]`} | ${row.errors} |\n`;
    }
  }
  writeFileSync(join(RESULTS, `${stamp}.rows.json`), JSON.stringify(rows, null, 1));
  md += `\nTotal spend $${spent.toFixed(4)}. Temperature 0, max_tokens 48, one call per question and arm, no retries counted as answers. Prompt tokens and cost are what the API returned.\n`;
}
writeFileSync(join(RESULTS, `${stamp}.json`), JSON.stringify(report, null, 1));
writeFileSync(join(RESULTS, `${stamp}.md`), md);
writeFileSync(join(RESULTS, 'latest.md'), md);
process.stdout.write(md);
