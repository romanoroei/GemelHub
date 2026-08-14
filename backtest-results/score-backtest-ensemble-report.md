# GemelHub Score — stable ensemble walk-forward

## Design

For each unseen year from 2011 through 2024, and separately for general and equity funds, the study ranked all 162 candidate models using prior years only. It selected five distinct weight families that combined strong aggregate performance with stable annual performance, then averaged their fund scores. Instability across training years was explicitly penalized.

## Unseen results

| Track | Model | Spearman | Top-third hit | Fall to bottom third | Top-3 future percentile |
|---|---|---:|---:|---:|---:|
| Combined | Baseline | 0.217 | 39.6% | **21.3%** | 59.2 |
| Combined | Stable ensemble | 0.217 | 39.6% | 23.8% | **59.9** |
| General | Baseline | 0.293 | 41.5% | **19.3%** | **64.8** |
| General | Stable ensemble | **0.301** | **42.2%** | 20.0% | 63.0 |
| Equities | Baseline | **0.064** | **35.8%** | **25.4%** | 53.6 |
| Equities | Stable ensemble | 0.040 | 34.3% | 31.3% | **56.7** |

## Interpretation

The ensemble modestly improved general-fund Spearman and hit rate, and it found better equity Top-3 funds. It nevertheless failed the safety requirement: bottom-third failures increased in both tracks, particularly equities. Across the 14 annual equity tests it beat baseline on hit rate in only one year and on fall rate in only two years.

The result suggests that further optimization of the same five annual returns, 3/6/12-month momentum, and Sharpe inputs is unlikely to produce the required reliability. The next stage should expand the feature set with monthly/quarterly consistency, downside deviation, drawdown behavior, recovery speed, and rank stability. These features must be calculated using information available at each historical decision date.

The ensemble is a research result only and should not replace the production score.
