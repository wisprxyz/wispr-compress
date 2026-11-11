# Benchmark

`node bench/run.mjs --dry` costs nothing: it compresses each article and reports token savings and whether a gold answer still appears verbatim in the compressed text.

`node bench/run.mjs --models <id,id> --key key.txt` sends every (question, arm) pair to a model and scores the answer with SQuAD exact match and F1. Prompt tokens, cost and latency are what the API returned.

Options: `--n 50` questions, `--seed 1`, `--arms full,clean,x50,x30,x15`, `--base https://api.wispr.xyz/v1` (any OpenAI compatible endpoint), `--parallel 4`, `--max-spend 5` (USD, stops sending when reached).

Data: [SQuAD v1.1](https://rajpurkar.github.io/SQuAD-explorer/) dev set, CC BY-SA 4.0, downloaded on first run into `bench/data/` (git ignored). Each item is a whole Wikipedia article as the document (3k to 14k words) and one question whose answer is a span of it; the sample is spread over the 48 articles with a seeded generator so a run is reproducible.

Results land in `bench/results/<stamp>.md` and `.json` (per row data in `.rows.json`, git ignored).
