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

## Interpretation and limitations

The result supports the predictive value of the broader monthly history: returns at several horizons, consistency, downside behavior, size, fees, flows, exposures, Alpha, and Sharpe contain more useful information together than the current fixed formula.

This is not yet authorization to change the production score. The baseline is a faithful monthly reconstruction rather than a byte-for-byte execution of the live website code. Several small cohorts remain individually unstable, so production eligibility should require cohort-level confidence. A final validation should add block-bootstrap confidence intervals, freeze the model specification, and run one untouched final holdout period before deployment.

Machine-readable aggregate, fold, and cohort results are stored in `monthly-model-backtest.json`.
