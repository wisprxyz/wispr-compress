# wispr-compress benchmark 20261111-215745

SQuAD v1.1 dev, 50 questions over 48 articles (whole article as context), seed 2.

## Compression only (no model)

| arm | est. tokens | saved | gold answer still in text |
|---|---:|---:|---:|
| full | 10027 | 0.0% | 100.0% |
| clean | 10027 | 0.0% | 100.0% |
| x50 | 3493 | 63.9% | 100.0% |
| x30 | 2468 | 75.0% | 98.0% |
| x15 | 1391 | 86.1% | 98.0% |

## dolphin-mistral-24b

| arm | prompt tokens | saved | cost / question | total cost | latency | EM | F1 | F1 vs full (95% CI) | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| full | 7472 | 0.0% | $0.00150 | $0.0750 | 1.7 s | 78% | 92.1 |  | 0 |
| clean | 7471 | 0.0% | $0.00150 | $0.0750 | 1.4 s | 78% | 92.2 | +0.1 [0.0, 0.3] | 0 |
| x50 | 2624 | 64.9% | $0.00053 | $0.0265 | 1.8 s | 84% | 94.9 | +2.7 [-1.7, 8.4] | 0 |
| x30 | 1877 | 74.9% | $0.00038 | $0.0190 | 1.1 s | 78% | 90.4 | -1.8 [-5.4, 1.0] | 0 |
| x15 | 1083 | 85.5% | $0.00022 | $0.0111 | 0.9 s | 74% | 88.7 | -3.4 [-7.7, -0.1] | 0 |

## gemma-4-26b-uncensored

| arm | prompt tokens | saved | cost / question | total cost | latency | EM | F1 | F1 vs full (95% CI) | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| full | 7357 | 0.0% | $0.00111 | $0.0554 | 1.6 s | 72% | 88.4 |  | 0 |
| clean | 7357 | 0.0% | $0.00111 | $0.0554 | 0.9 s | 72% | 88.4 | +0.0 [0.0, 0.0] | 0 |
| x50 | 2604 | 64.6% | $0.00040 | $0.0198 | 0.8 s | 72% | 87.3 | -1.0 [-5.7, 4.8] | 0 |
| x30 | 1869 | 74.6% | $0.00028 | $0.0142 | 0.8 s | 74% | 85.6 | -2.8 [-9.1, 3.8] | 0 |
| x15 | 1089 | 85.2% | $0.00017 | $0.0084 | 1.5 s | 76% | 86.8 | -1.6 [-7.9, 5.2] | 0 |

## claude

| arm | prompt tokens | saved | cost / question | total cost | latency | EM | F1 | F1 vs full (95% CI) | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| full | 11447 | 0.0% | $0.02300 | $1.1498 | 1.7 s | 74% | 87.5 |  | 0 |
| clean | 11446 | 0.0% | $0.02299 | $1.1497 | 1.6 s | 74% | 89.5 | +2.0 [-0.8, 6.4] | 0 |
| x50 | 4044 | 64.7% | $0.00820 | $0.4101 | 1.3 s | 74% | 88.0 | +0.5 [-5.4, 6.2] | 0 |
| x30 | 2889 | 74.8% | $0.00589 | $0.2943 | 1.3 s | 72% | 85.5 | -2.0 [-7.4, 1.6] | 0 |
| x15 | 1666 | 85.4% | $0.00344 | $0.1720 | 1.3 s | 76% | 88.5 | +1.0 [0.0, 2.3] | 0 |

Total spend $3.5358. Temperature 0, max_tokens 48, one call per question and arm, no retries counted as answers. Prompt tokens and cost are what the API returned.
