# wispr-compress

Query-aware prompt compression with no model and no dependencies.

Give it a long document and the question you are about to ask about it. It keeps the sentences that carry the answer, in their original order, and drops the rest. You send fewer tokens, pay less, wait less, and the model still answers correctly. The numbers below are measured, not claimed.

```js
import { compress } from 'wispr-compress';

const { text, stats } = compress(article, { query: 'Who coined the name oxygen?', ratio: 0.3 });
// stats -> { tokensBefore: 9675, tokensAfter: 2431, saved: 0.75, units: 412, kept: 96 }
```

Nothing leaves your process. The compressor is BM25 over sentences with neighbour smoothing and a paragraph lead boost; without a query it ranks sentences by how much of the document's informative vocabulary they carry. It is about 200 lines and it runs in a few milliseconds on a 10k token document.

## Results

Measured on 11 Nov 2026: 50 SQuAD v1.1 questions, each with its whole Wikipedia article as the document (7k to 11k prompt tokens), three models, 750 model calls, zero errors, $3.45 in total. Every question was asked once per arm at temperature 0 and scored with SQuAD exact match and F1 against the gold answers. Prompt tokens and cost are the figures the API billed. Full table in [bench/results/latest.md](bench/results/latest.md).

Pooled over the three models (150 paired comparisons per arm, bootstrap 95% CI on the F1 difference against the uncompressed prompt):

| arm | prompt tokens saved | cost saved | F1 change vs full | answers worse / same / better |
|---|---:|---:|---:|---:|
| clean | 0.0% | 0.0% | +0.2 [0.0, +0.7] | 0 / 149 / 1 |
| extractive 50% | 62.0% | 61.7% | +1.3 [-1.2, +4.0] | 3 / 140 / 7 |
| extractive 30% | 74.3% | 73.9% | +1.5 [-1.2, +4.6] | 4 / 140 / 6 |
| extractive 15% | 85.2% | 84.7% | +0.4 [-2.3, +3.3] | 6 / 136 / 8 |

Per model, F1 on the full article and at 30%:

| model | host | full | 30% | F1 change (95% CI) | cost per question full → 30% |
|---|---|---:|---:|---:|---:|
| dolphin-mistral-24b | Venice | 95.0 | 97.1 | +2.1 [-0.9, +7.0] | $0.00144 → $0.00037 |
| gemma-4-26b-uncensored | Phala TEE | 84.0 | 87.4 | +3.3 [-4.0, +10.8] | $0.00107 → $0.00028 |
| claude (sonnet 5.5) | OpenRouter | 92.3 | 91.3 | -1.0 [-3.0, 0.0] | $0.02214 → $0.00578 |

Reading: at 30% the prompt is a quarter of the size and the cost a quarter of the price, and the answer quality is unchanged within the measurement (the confidence interval covers zero on every model and in the pool). The two open models answered slightly better on the compressed article, the frontier model slightly worse, neither by a significant margin. In the compression-only pass over 300 further questions (`--dry --n 300 --seed 7`) the gold answer was still present verbatim in 98.0% of the compressed articles at 15% and 98.7% at 50%.

This is one task family (span answers over long articles). Run `node bench/run.mjs --dry` on your own documents and questions before you rely on it elsewhere.

## Install

```
npm i wispr-compress
```

Node 20 or newer, ESM. Types included.

## API

`compress(text, options)` returns `{ text, stats }`.

| option | default | meaning |
|---|---|---|
| `query` | none | the question or task the text must still answer; without it units are ranked by centrality |
| `ratio` | 0.3 with a query, 0.5 without | cap on the share of estimated tokens to keep (the result is often smaller, sentences with nothing in common with the query are never kept) |
| `maxTokens` | none | absolute budget, wins over ratio |
| `mode` | `extractive` | `clean` only normalises whitespace and removes duplicate lines and sentences |
| `keepHeadings` | true | keep a heading when anything under it is kept |
| `neighbour` | 0.35 | share of a sentence's score lent to the sentences next to it, so a hit keeps its context |
| `lead` | 0.15 | boost for the first sentence of each paragraph |
| `gap` | `…` | marker written where material was dropped inside a paragraph; `''` for none |
| `tokenizer` | prose estimate | your own token counter, for example a BPE tokenizer |

`compressContext({ context, question }, options)` compresses the document and returns the question untouched.

`compressMessages(messages, options)` takes an OpenAI style messages array and compresses every message longer than `minTokens` (default 400) against the last user message.

`estimateTokens(text)`, `clean(text)` and `split(text)` are exported too.

### CLI

```
npx wispr-compress article.txt -q "Who coined the name oxygen?" -r 0.3 --stats
cat article.txt | npx wispr-compress --clean
```

## When it helps and when it does not

It helps when the document is long and the question is specific: retrieval style questions over articles, contracts, logs, transcripts, documentation. That is where 60 to 85 percent of the prompt tokens are sentences the model never needed.

It does not help when every sentence matters (summarise this, translate this, review all of this code), when the question is vague, or when the document is already short. In those cases pass `mode: 'clean'` or do not compress. The query terms must appear in the text for BM25 to find them; a question phrased with none of the document's words will keep the wrong sentences. Check `stats.kept` and the `--dry` benchmark on your own data before you trust it on a new corpus.

## Benchmark

See [bench/README.md](bench/README.md). `node bench/run.mjs --dry` costs nothing; a model run needs a key for any OpenAI compatible endpoint and scores with SQuAD exact match and F1.

## Licence

MIT. The benchmark data is SQuAD v1.1 (CC BY-SA 4.0), downloaded at run time, not vendored.

Built by [WISPR](https://wispr.xyz).
