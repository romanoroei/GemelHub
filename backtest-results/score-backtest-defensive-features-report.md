# GemelHub Score — defensive feature walk-forward

## Design

Four point-in-time features were calculated from information available at each historical decision date:

- share of positive months over the preceding 36 months;
- downside deviation over the preceding 36 months;
- maximum drawdown over the preceding 36 months;
- standard deviation of the fund's annual percentile rank across five years.

The study combined 10%, 20%, or 30% defensive weight with the existing consistency/momentum/Sharpe candidate family. Selection was performed separately for general and equity tracks using an expanding training window. Each year from 2011 through 2024 was tested only after its model had been selected from preceding years.

## Aggregate unseen results

| Track | Model | Spearman | Top-third hit | Fall to bottom third | Top-3 future percentile |
|---|---|---:|---:|---:|---:|
| Combined | Baseline | 0.217 | **39.6%** | **21.3%** | 59.2 |
| Combined | Defensive features | **0.222** | 38.6% | 21.8% | **60.3** |
| General | Baseline | **0.293** | **41.5%** | 19.3% | 64.8 |
| General | Defensive features | 0.290 | 40.0% | **18.5%** | **66.6** |
| Equities | Baseline | 0.064 | 35.8% | **25.4%** | 53.6 |
| Equities | Defensive features | **0.077** | 35.8% | 28.4% | **54.1** |

## Stability finding

For general funds, the selector converged strongly after the first fold: 13 of 14 tests used a 10% defensive component emphasizing positive-month consistency and stable annual ranking. The underlying return model was also stable from 2012 onward: 75% five-year consistency, 15% short-term momentum, and 10% Sharpe before applying the defensive overlay.

For equities, selection remained unstable. Defensive weight moved between 10%, 20%, and 30%, and the chosen return model changed several times. This is consistent with the weaker equity sample and indicates that a production equity formula is not yet supported.

## Interpretation

The new features add useful information, particularly for general funds: bottom-third failures declined and Top-3 quality rose by 1.8 percentile points. The trade-off is a 1.5-point decline in top-third hit rate and a small decline in Spearman. The model therefore improves protection and the very top selections, but does not yet dominate baseline on every objective.

This is the first experiment in the series to improve the general-fund downside metric while also improving Top-3 quality. It supports continuing with a fixed, simpler general-fund candidate centered on a 10% stability overlay. The equity result does not pass the safety threshold.

No production score change is recommended from this experiment alone.
