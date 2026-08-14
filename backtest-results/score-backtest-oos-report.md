# GemelHub Score — true out-of-sample backtest

## Design

- Training/model selection: score years 2005–2014 (future performance in 2006–2015).
- Locked test: score years 2015–2024 (future performance in 2016–2025).
- Tracks: גמל כללי and גמל מניות, plus a combined result.
- 162 candidate models were ranked on combined training Spearman only. Ties were broken by top-third hit rate, lower fall-to-bottom rate, and Top-3 future percentile.
- Observations: 723 training (646 general, 77 equities); 367 test (214 general, 153 equities).
- The selected training model was `c55_m35_s10_strong_short`: 55% five-year consistency with strong recency weighting, 35% momentum split 50%/30%/20% across 3/6/12 months, and 10% Sharpe.

## Locked test results, 2015–2024

### Combined

| Model | Spearman | Top-third hit | Fall to bottom third | Top-3 future percentile |
|---|---:|---:|---:|---:|
| Current baseline | 0.241 | **40.3%** | **17.8%** | 60.4 |
| Training winner: 55/35/10 strong | **0.243** | 34.9% | 23.3% | **62.4** |
| 55/35/10 equal-year variant | **0.259** | 38.0% | 21.7% | **62.7** |

### גמל כללי

| Model | Spearman | Top-third hit | Fall to bottom third | Top-3 future percentile |
|---|---:|---:|---:|---:|
| Current baseline | 0.327 | **40.0%** | **14.7%** | 63.3 |
| Training winner: 55/35/10 strong | **0.331** | 34.7% | 17.3% | **67.4** |
| 55/35/10 equal-year variant | **0.347** | 38.7% | 16.0% | **68.1** |

### גמל מניות

| Model | Spearman | Top-third hit | Fall to bottom third | Top-3 future percentile |
|---|---:|---:|---:|---:|
| Current baseline | **0.104** | **40.7%** | **22.2%** | **57.5** |
| Training winner: 55/35/10 strong | 0.096 | 35.2% | 31.5% | 57.4 |
| 55/35/10 equal-year variant | **0.115** | 37.0% | 29.6% | 57.4 |

## Training-period context

The selected 55/35/10 strong-recency model beat baseline clearly on combined training data: Spearman 0.180 vs 0.130, hit rate 45.8% vs 40.6%, fall rate 27.7% vs 29.3%, and Top-3 future percentile 57.9 vs 50.9.

## Conclusion

The model selected using 2005–2014 did **not** deliver a robust, across-metric victory in 2015–2024. It placed 49th among the 162 candidate models on locked-test Spearman. It barely improved combined Spearman (0.243 vs 0.241) and improved Top-3 future percentile (62.4 vs 60.4), but materially reduced top-third hit rate (34.9% vs 40.3%) and increased falls to the bottom third (23.3% vs 17.8%). In equities it was worse than baseline on all four reported metrics, apart from a statistically immaterial 0.1 percentile difference in Top-3 that also favored baseline.

The equal-year 55/35/10 variant generalized better on Spearman and Top-3, especially in general funds, but it was not the model selected by the predeclared training rule and still lost to baseline on hit and fall rates. The locked test therefore does not justify changing the production GemelHub Score. A follow-up study should use rolling or nested walk-forward validation and predeclare one composite selection objective before considering a production change.

## Reproducibility

Run `node scripts/score-backtest-oos.mjs` from the repository root. Machine-readable results are in `backtest-results/score-backtest-oos.json`.
