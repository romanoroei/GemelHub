# GemelHub monthly predictive model — purged walk-forward backtest

## Outcome

The regularized linear Ridge model was the most reliable model in this experiment. It beat the current-score approximation on the practical selection and downside metrics at every forecast horizon. Gradient boosting did not generalize as reliably and was not selected.

## Test design

- 90,950 fund-month observations across the approved provident, investment-provident, training-fund, savings-policy, comprehensive-pension, and supplementary-pension cohorts.
- 29 historical features plus product/track cohort identity.
- Separate future percentile targets for 3, 6, 12, and 24 months.
- Outer test years: 2018, 2020, 2022, and 2024.
- Purging: a training observation was allowed only if its entire future target window ended before January of the test year.
- Rankings and success metrics were calculated only inside the same product × track × month cohort, with at least five comparable funds.
- Baseline is a monthly reconstruction of the current score: equal percentile weight for five trailing 12-month blocks (84% total) and Sharpe (16%), renormalized when older history is unavailable.

## Blind-test results

| Horizon | Model | Monthly Spearman | Top-third hit | Fall to bottom third | Top-3 future percentile |
|---|---|---:|---:|---:|---:|
| 3m | Baseline | 0.116 | 38.8% | 26.4% | 54.6 |
| 3m | Ridge | **0.158** | **40.2%** | **23.7%** | **56.3** |
| 6m | Baseline | 0.161 | 41.6% | 24.9% | 55.9 |
| 6m | Ridge | **0.188** | **42.6%** | **21.6%** | **57.6** |
| 12m | Baseline | 0.197 | 43.2% | 22.0% | 56.7 |
| 12m | Ridge | **0.207** | **45.5%** | **20.4%** | **57.8** |
| 24m | Baseline | **0.168** | 41.9% | 24.2% | 54.8 |
| 24m | Ridge | 0.167 | **43.7%** | **22.0%** | **56.9** |

The Ridge model reduced bottom-third failures in all four outer test years at the 3-, 6-, and 24-month horizons, and in three of four years at 12 months. It improved hit rate in all four 12-month test years and in three of four years at the other horizons.

## Proposed multi-horizon research score

The four Ridge forecasts were combined using 20% for 3 months, 25% for 6 months, 35% for 12 months, and 20% for 24 months. On 19,426 genuinely unseen predictions across 1,302 product-track-month groups:

| Score | Monthly Spearman | Top-third hit | Fall to bottom third | Top-3 future percentile |
|---|---:|---:|---:|---:|
| Baseline | 0.198 | 39.1% | 19.8% | 55.7 |
| Multi-horizon Ridge | **0.214** | **41.1%** | **17.5%** | **57.3** |

This is the first model in the research series to improve all four aggregate metrics simultaneously in a purged monthly walk-forward test.

## Short-horizon and investor-flow experiment

A separate Ridge candidate used only relative returns over 1, 3, 6, and 12 months. A second candidate added fund size, raw asset changes over 1/3/6/12 months, and reported net-flow ratios over 1/3/6/12 months. Both were trained and tested with the same purged walk-forward folds as the broad model.

| Composite score | Monthly Spearman | Top-third hit | Fall to bottom third | Top-3 future percentile |
|---|---:|---:|---:|---:|
| Short returns only | 0.087 | 33.3% | 26.4% | 52.2 |
| Short returns + assets/flows | 0.139 | 36.4% | 20.9% | 54.4 |
| Baseline | 0.198 | 39.1% | 19.8% | 55.7 |
| Broad Ridge including assets/flows | **0.215** | **41.2%** | **17.4%** | **57.3** |

Assets and flows add substantial information compared with short-term returns alone, but the focused model does not beat the baseline or the broad Ridge. The evidence therefore supports retaining asset/flow trends as inputs inside the broad model, not replacing the broad model with a short-horizon-only formula. Raw asset growth and reported net flows are kept as separate inputs because asset growth also contains the mechanical effect of investment returns.

## Interpretation and limitations

The result supports the predictive value of the broader monthly history: returns at several horizons, consistency, downside behavior, size, fees, flows, exposures, Alpha, and Sharpe contain more useful information together than the current fixed formula.

This is not yet authorization to change the production score. The baseline is a faithful monthly reconstruction rather than a byte-for-byte execution of the live website code. Several small cohorts remain individually unstable, so production eligibility should require cohort-level confidence. A final validation should add block-bootstrap confidence intervals, freeze the model specification, and run one untouched final holdout period before deployment.

Machine-readable aggregate, fold, and cohort results are stored in `monthly-model-backtest.json`.

## Historical example

For fund 119, `מנורה מבטחים יותר מסלול ד'`, the genuinely out-of-sample December observations were:

| Decision date | Predicted multi-horizon score | Baseline score | Realized future multi-horizon percentile |
|---|---:|---:|---:|
| 2018-12 | 47.4 | 73.6 | 45.4 |
| 2020-12 | 62.2 | 54.5 | 43.8 |
| 2022-12 | 51.3 | 52.6 | 55.9 |
| 2024-12 | 52.6 | 50.0 | 52.1 |

This example also demonstrates why the score is probabilistic rather than a promise: the 2020 signal was optimistic and did not materialize, while the 2018, 2022, and 2024 estimates were directionally closer to the realized relative outcome. Reliability is established across thousands of cohort-month decisions, not from any single fund observation.

### Additional example: fund 1093

For fund 1093, `אלטשולר שחם השתלמות כללי`, the genuinely out-of-sample December observations were:

| Decision date | Predicted multi-horizon score | Baseline score | Realized future multi-horizon percentile |
|---|---:|---:|---:|
| 2018-12 | 62.6 | 81.3 | 97.2 |
| 2020-12 | 100.0 | 84.1 | 29.9 |
| 2022-12 | 69.5 | 49.6 | 36.6 |
| 2024-12 | 45.1 | 37.0 | 23.0 |

The 2018 signal correctly identified a very strong subsequent relative result. The 2020 and 2022 signals were too optimistic and constitute clear misses. In 2024 the model correctly pointed below the middle of the peer group, although the realized weakness was greater than forecast. A score of 100 is a clipped expected relative percentile, not a guarantee of future performance.
