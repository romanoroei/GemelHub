# GemelHub Score — expanding walk-forward study

## Method

For every test year from 2011 through 2024, a model was selected separately for general and equity tracks using only observations from 2005 through the preceding year. The selected model was then locked and evaluated on the next unseen year.

The predeclared selection objective was:

`top-third hit rate - 1.5 × bottom-third fall rate + 20 × Spearman + 0.1 × (Top-3 percentile - 50)`

This gives a bottom-third failure a larger cost than a top-third success, while retaining rank correlation and Top-3 quality as secondary signals. There were 162 fixed candidate models in every fold.

## Aggregate unseen results, 2011–2024

| Track | Model | Spearman | Top-third hit | Fall to bottom third | Top-3 future percentile |
|---|---|---:|---:|---:|---:|
| Combined | Current baseline | **0.217** | 39.6% | **21.3%** | **59.2** |
| Combined | Walk-forward selection | 0.216 | 39.6% | 23.3% | 57.6 |
| General | Current baseline | 0.293 | 41.5% | **19.3%** | **64.8** |
| General | Walk-forward selection | **0.304** | 41.5% | 20.0% | 61.5 |
| Equities | Current baseline | **0.064** | 35.8% | **25.4%** | 53.6 |
| Equities | Walk-forward selection | 0.027 | 35.8% | 29.9% | **53.7** |

The dataset contains 578 genuinely unseen walk-forward observations: 391 general and 187 equities, across 14 annual tests per track.

## Stability finding

The selected formula changed materially over time. General funds used five different formulas, while equities used three. The most frequent general model was selected in only 6 of 14 folds. The most frequent equity model appeared in 8 of 14 folds.

The adaptive selector therefore did not beat the current baseline. In general funds it improved Spearman slightly but did not improve hit rate, increased bottom-third failures, and reduced the Top-3 percentile. In equities it reduced Spearman and increased bottom-third failures.

## Decision

Do not use annual re-optimization as the production methodology. The next research stage should test a stable ensemble: retain only models that remain near the top across many training windows, average their percentile scores, and require agreement between consistency, momentum, and defensive components. The ensemble must be evaluated on the same untouched annual folds and must beat baseline on hit rate and fall rate, not only Spearman.

Machine-readable fold-level results are in `score-backtest-walk-forward.json`.
