# GemelHub predictive-model research universe

## Approved scope

Products:

- regular provident funds;
- investment provident funds;
- training funds;
- savings policies;
- comprehensive pension;
- supplementary/general pension.

Track families:

- general;
- equities;
- credit and bonds;
- age-dependent: up to 50, 50–60, and 60+ as separate cohorts;
- credit and bonds with up to 25% equities.

Each product × track combination is a separate ranking cohort. Child savings, central severance, index-tracking, cash, halacha, pension-recipient, and unrelated specialist tracks are excluded.

## Initial audit

The point-in-time audit found 97,903 eligible monthly rows. The largest and deepest cohorts are:

| Cohort | Funds | Monthly rows | Coverage |
|---|---:|---:|---:|
| Regular provident — general | 280 | 28,488 | 1999–2026 |
| Training fund — general | 162 | 19,126 | 1999–2026 |
| Savings policy — equities | 49 | 5,106 | 1999–2026 |
| Regular provident — 60+ | 49 | 5,033 | 1999–2026 |
| Regular provident — 50–60 | 47 | 4,883 | 1999–2026 |
| Regular provident — up to 50 | 48 | 4,727 | 2015–2026 |
| Savings policy — general | 37 | 4,423 | 1999–2026 |
| Regular provident — equities | 62 | 4,115 | 1999–2026 |
| Training fund — equities | 57 | 3,894 | 1999–2026 |

Pension age cohorts contain 10–12 funds per product and approximately 1,000–1,160 monthly rows per cohort, generally from 2012 or 2015 onward. These are large enough for walk-forward testing, while uncertainty must be clustered by month because the number of competing funds is modest.

## Classification discontinuity requiring resolution

The current `credit and bonds` and `up to 25% equities` labels begin in January 2024 for provident, investment-provident, training-fund, and savings-policy data. Their apparent 30-month history is a classification artifact, not necessarily the true economic history of the funds. Earlier equivalents are stored under legacy labels such as `אג"ח`, `משולב מניות`, and related specializations.

Before model training, continuity must be reconstructed by `FUND_ID`, fund-name history, and risk exposure. A legacy record may be linked only when its mandate is economically compatible; no blanket relabeling of all bond tracks is allowed. The audit intentionally does not declare these short cohorts ready for standalone training yet.

## Next data-engineering stage

1. Build a point-in-time identity table for every approved fund.
2. Resolve legacy-to-current track continuity with explicit evidence and exceptions.
3. Generate one row per fund and month with historical features and future 3/6/12/24-month targets.
4. Rank targets only within the same product × track × month cohort.
5. Apply purged walk-forward validation before fitting predictive models.

Machine-readable counts are stored in `research-universe-audit.json`.
