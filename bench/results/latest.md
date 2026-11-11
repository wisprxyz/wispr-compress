# wispr-compress benchmark 20261111-213121

SQuAD v1.1 dev, 50 questions over 48 articles (whole article as context), seed 1.

## Compression only (no model)

| arm | est. tokens | saved | gold answer still in text |
|---|---:|---:|---:|
| full | 9675 | 0.0% | 100.0% |
| clean | 9675 | 0.0% | 100.0% |
| x50 | 3674 | 62.5% | 100.0% |
| x30 | 2431 | 75.0% | 100.0% |
| x15 | 1336 | 86.1% | 100.0% |

## dolphin-mistral-24b

| arm | prompt tokens | saved | cost / question | total cost | latency | EM | F1 | F1 vs full (95% CI) | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| full | 7179 | 0.0% | $0.00144 | $0.0720 | 1.6 s | 94% | 95.0 |  | 0 |
| clean | 7178 | 0.0% | $0.00144 | $0.0720 | 1.2 s | 94% | 95.0 | +0.0 [0.0, 0.0] | 0 |
| x50 | 2743 | 61.8% | $0.00055 | $0.0277 | 1.1 s | 94% | 95.5 | +0.5 [0.0, 1.5] | 0 |
| x30 | 1832 | 74.5% | $0.00037 | $0.0186 | 1.0 s | 94% | 97.1 | +2.1 [-0.9, 7.0] | 0 |
| x15 | 1038 | 85.5% | $0.00021 | $0.0107 | 0.9 s | 92% | 94.8 | -0.2 [-1.3, 0.6] | 0 |

## gemma-4-26b-uncensored

| arm | prompt tokens | saved | cost / question | total cost | latency | EM | F1 | F1 vs full (95% CI) | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| full | 7073 | 0.0% | $0.00107 | $0.0533 | 1.4 s | 70% | 84.0 |  | 0 |
| clean | 7072 | 0.0% | $0.00107 | $0.0533 | 1.4 s | 70% | 84.0 | +0.0 [0.0, 0.0] | 0 |
| x50 | 2719 | 61.6% | $0.00041 | $0.0206 | 1.1 s | 74% | 87.6 | +3.6 [-3.8, 11.3] | 0 |
| x30 | 1823 | 74.2% | $0.00028 | $0.0139 | 1.0 s | 72% | 87.4 | +3.3 [-4.0, 10.8] | 0 |
| x15 | 1042 | 85.3% | $0.00016 | $0.0080 | 1.0 s | 72% | 87.4 | +3.4 [-4.0, 11.1] | 0 |

## claude

| arm | prompt tokens | saved | cost / question | total cost | latency | EM | F1 | F1 vs full (95% CI) | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| full | 11021 | 0.0% | $0.02214 | $1.1070 | 1.4 s | 84% | 92.3 |  | 0 |
| clean | 11020 | 0.0% | $0.02214 | $1.1069 | 1.3 s | 86% | 92.9 | +0.7 [0.0, 2.0] | 0 |
| x50 | 4240 | 61.5% | $0.00857 | $0.4287 | 1.2 s | 86% | 92.0 | -0.2 [-3.0, 2.1] | 0 |
| x30 | 2842 | 74.2% | $0.00578 | $0.2890 | 1.2 s | 82% | 91.3 | -1.0 [-3.0, 0.0] | 0 |
| x15 | 1610 | 85.4% | $0.00333 | $0.1663 | 1.1 s | 82% | 90.4 | -1.9 [-6.5, 1.3] | 0 |

Total spend $3.4481. Temperature 0, max_tokens 48, one call per question and arm, no retries counted as answers. Prompt tokens and cost are what the API returned.

## Pooled over the three models (150 paired comparisons per arm)

| arm | tokens saved | cost saved | F1 change vs full (95% CI) | worse / same / better |
|---|---:|---:|---:|---:|
| clean | 0.0% | 0.0% | +0.2 [0.0, +0.7] | 0 / 149 / 1 |
| x50 | 62.0% | 61.7% | +1.3 [-1.2, +4.0] | 3 / 140 / 7 |
| x30 | 74.3% | 73.9% | +1.5 [-1.2, +4.6] | 4 / 140 / 6 |
| x15 | 85.2% | 84.7% | +0.4 [-2.3, +3.3] | 6 / 136 / 8 |

Compression-only pass on 300 other questions (seed 7): gold answer still verbatim in the text at x50 98.7%, x30 98.3%, x15 98.0%.
