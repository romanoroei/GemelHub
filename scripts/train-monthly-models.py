import gzip, json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.python-packages'))
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

HORIZONS = [3, 6, 12, 24]
TEST_YEARS = list(range(2018, 2025))

def serial(period):
    return (period // 100) * 12 + (period % 100) - 1

rows = []
with gzip.open(ROOT / 'backtest-results' / 'research-monthly-panel.ndjson.gz', 'rt', encoding='utf-8') as f:
    for line in f:
        r = json.loads(line)
        flat = {'cohort': r['cohort'], 'product': r['product'], 'track': r['track'], 'fundId': r['fundId'], 'period': r['period']}
        flat.update(r['features'])
        flat.update({f'target_{key}': value for key, value in r['targets'].items()})
        rows.append(flat)
df = pd.DataFrame(rows)
df['serial'] = df['period'].map(serial)

feature_cols = [c for c in rows[0] if c not in {'cohort','product','track','fundId','period'} and not c.startswith('target_')]
feature_cols = [c for c in feature_cols if not c.startswith('return_') or c in {
    'return_1m','return_3m','return_6m','return_12m','return_24m','return_36m','return_60m',
    'return_year_1','return_year_2','return_year_3','return_year_4','return_year_5'
}]
short_flow_features = [
    'return_1m', 'return_3m', 'return_6m', 'return_12m',
    'total_assets_log', 'asset_change_1m', 'asset_change_3m',
    'asset_change_6m', 'asset_change_12m', 'net_flow_to_assets',
    'net_flow_to_assets_3m', 'net_flow_to_assets_6m', 'net_flow_to_assets_12m',
]
short_return_features = ['return_1m', 'return_3m', 'return_6m', 'return_12m']

def add_baseline(frame):
    annual = ['return_year_1','return_year_2','return_year_3','return_year_4','return_year_5']
    pieces = []
    for col in annual + ['sharpe']:
        pieces.append(frame.groupby(['cohort','period'])[col].rank(pct=True) * 100)
    frame = frame.copy()
    component_frame = pd.concat(pieces, axis=1)
    component_frame.columns = annual + ['sharpe']
    weights = pd.Series({**{col: .168 for col in annual}, 'sharpe': .16})
    numerator = component_frame.mul(weights).sum(axis=1, skipna=True)
    denominator = component_frame.notna().mul(weights).sum(axis=1)
    frame['baseline'] = numerator / denominator.replace(0, np.nan)
    return frame

df = add_baseline(df)

def metrics(frame, prediction):
    work = frame[['cohort','period']].copy()
    work['truth'] = frame['truth'].to_numpy()
    work['pred'] = prediction
    spears, selected, hits, falls, top3 = [], 0, 0, 0, []
    for _, g in work.groupby(['cohort','period']):
        if len(g) < 5: continue
        rho = spearmanr(g['pred'], g['truth']).statistic
        if np.isfinite(rho): spears.append(rho)
        ranked = g.sort_values('pred', ascending=False)
        cut = int(np.ceil(len(ranked) / 3))
        chosen = ranked.iloc[:cut]
        selected += len(chosen)
        hits += int((chosen['truth'] >= 66.6667).sum())
        falls += int((chosen['truth'] <= 33.3333).sum())
        top3.extend(ranked.iloc[:3]['truth'].tolist())
    return {
        'groups': len(spears),
        'meanMonthlySpearman': round(float(np.mean(spears)), 3) if spears else None,
        'topThirdHitRate': round(hits / selected * 100, 1) if selected else None,
        'topThirdFallRate': round(falls / selected * 100, 1) if selected else None,
        'top3FuturePercentile': round(float(np.mean(top3)), 1) if top3 else None,
    }

prediction_frames = []
folds = []
for horizon in HORIZONS:
    target = f'target_percentile_{horizon}m'
    available = df[df[target].notna()].copy()
    for test_year in TEST_YEARS:
        test = available[(available.period // 100) == test_year].copy()
        test_start = test_year * 12
        train = available[(available.serial + horizon) < test_start].copy()
        if len(train) < 1000 or len(test) < 100: continue
        train['truth'] = train[target]
        test['truth'] = test[target]
        numeric = feature_cols
        ridge = Pipeline([
            ('prep', ColumnTransformer([
                ('num', Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', StandardScaler())]), numeric),
                ('cat', OneHotEncoder(handle_unknown='ignore'), ['cohort']),
            ])),
            ('model', Ridge(alpha=50.0)),
        ])
        ridge.fit(train[numeric + ['cohort']], train['truth'])
        ridge_pred = ridge.predict(test[numeric + ['cohort']])

        short_flow_ridge = Pipeline([
            ('prep', ColumnTransformer([
                ('num', Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', StandardScaler())]), short_flow_features),
                ('cat', OneHotEncoder(handle_unknown='ignore'), ['cohort']),
            ])),
            ('model', Ridge(alpha=50.0)),
        ])
        short_flow_ridge.fit(train[short_flow_features + ['cohort']], train['truth'])
        short_flow_pred = short_flow_ridge.predict(test[short_flow_features + ['cohort']])

        short_return_ridge = Pipeline([
            ('prep', ColumnTransformer([
                ('num', Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', StandardScaler())]), short_return_features),
                ('cat', OneHotEncoder(handle_unknown='ignore'), ['cohort']),
            ])),
            ('model', Ridge(alpha=50.0)),
        ])
        short_return_ridge.fit(train[short_return_features + ['cohort']], train['truth'])
        short_return_pred = short_return_ridge.predict(test[short_return_features + ['cohort']])

        imputer = SimpleImputer(strategy='median')
        x_train = imputer.fit_transform(train[numeric])
        x_test = imputer.transform(test[numeric])
        boost = HistGradientBoostingRegressor(max_iter=120, learning_rate=.05, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=5, random_state=42)
        boost.fit(x_train, train['truth'])
        boost_pred = boost.predict(x_test)
        ensemble_pred = .4 * ridge_pred + .6 * boost_pred

        for model, pred in [('baseline', test['baseline'].to_numpy()), ('ridge', ridge_pred), ('shortReturnRidge', short_return_pred), ('shortFlowRidge', short_flow_pred), ('gradientBoosting', boost_pred), ('ensemble', ensemble_pred)]:
            fold_metrics = metrics(test, pred)
            folds.append({'horizonMonths': horizon, 'testYear': test_year, 'model': model, 'trainRows': len(train), 'testRows': len(test), **fold_metrics})
            pf = test[['cohort','product','track','fundId','period','truth']].copy()
            pf['prediction'] = pred
            pf['horizonMonths'] = horizon
            pf['testYear'] = test_year
            pf['model'] = model
            prediction_frames.append(pf)

fold_df = pd.DataFrame(folds)
aggregate = []
for (horizon, model), g in fold_df.groupby(['horizonMonths','model']):
    aggregate.append({
        'horizonMonths': int(horizon), 'model': model, 'folds': len(g),
        'meanMonthlySpearman': round(float(g.meanMonthlySpearman.mean()), 3),
        'topThirdHitRate': round(float(np.average(g.topThirdHitRate, weights=g.testRows)), 1),
        'topThirdFallRate': round(float(np.average(g.topThirdFallRate, weights=g.testRows)), 1),
        'top3FuturePercentile': round(float(np.average(g.top3FuturePercentile, weights=g.testRows)), 1),
    })

all_predictions = pd.concat(prediction_frames, ignore_index=True)
cohort_results = []
for (horizon, model, cohort), g in all_predictions.groupby(['horizonMonths','model','cohort']):
    cohort_results.append({'horizonMonths': int(horizon), 'model': model, 'cohort': cohort, 'rows': len(g), **metrics(g, g.prediction.to_numpy())})

fold_comparisons = []
for horizon in HORIZONS:
    base = fold_df[(fold_df.horizonMonths == horizon) & (fold_df.model == 'baseline')].set_index('testYear')
    for model in ['ridge','shortReturnRidge','shortFlowRidge','gradientBoosting','ensemble']:
        challenger = fold_df[(fold_df.horizonMonths == horizon) & (fold_df.model == model)].set_index('testYear')
        common = base.index.intersection(challenger.index)
        fold_comparisons.append({
            'horizonMonths': horizon, 'model': model, 'folds': len(common),
            'spearmanWins': int((challenger.loc[common].meanMonthlySpearman > base.loc[common].meanMonthlySpearman).sum()),
            'hitRateWins': int((challenger.loc[common].topThirdHitRate > base.loc[common].topThirdHitRate).sum()),
            'fallRateWins': int((challenger.loc[common].topThirdFallRate < base.loc[common].topThirdFallRate).sum()),
            'top3Wins': int((challenger.loc[common].top3FuturePercentile > base.loc[common].top3FuturePercentile).sum()),
        })

# A single research score emphasizing the practically useful 6- and 12-month
# horizons while retaining short- and long-horizon information.
score_weights = {3: .20, 6: .25, 12: .35, 24: .20}
key_cols = ['cohort','product','track','fundId','period','testYear']
ridge_predictions = all_predictions[all_predictions.model == 'ridge']
pred_wide = ridge_predictions.pivot_table(index=key_cols, columns='horizonMonths', values='prediction')
truth_wide = ridge_predictions.pivot_table(index=key_cols, columns='horizonMonths', values='truth')
common_index = pred_wide.index.intersection(truth_wide.index)
pred_wide, truth_wide = pred_wide.loc[common_index], truth_wide.loc[common_index]
weights = pd.Series(score_weights)
composite_prediction = pred_wide.mul(weights).sum(axis=1, skipna=True) / pred_wide.notna().mul(weights).sum(axis=1)
composite_truth = truth_wide.mul(weights).sum(axis=1, skipna=True) / truth_wide.notna().mul(weights).sum(axis=1)
composite = pred_wide.reset_index()[key_cols]
composite['truth'] = composite_truth.to_numpy()
composite['prediction'] = composite_prediction.clip(0, 100).to_numpy()
baseline_lookup = df.set_index(['cohort','product','track','fundId','period'])['baseline']
composite['baseline'] = [baseline_lookup.get((r.cohort,r.product,r.track,r.fundId,r.period), np.nan) for r in composite.itertuples()]

# Point-in-time score trend. Every underlying score is itself out of sample;
# exact month lookups avoid treating gaps in a fund's history as valid lags.
score_lookup = {(r.cohort, r.fundId, serial(r.period)): float(r.prediction) for r in composite.itertuples()}
for months in [3, 6, 12]:
    composite[f'scoreDelta{months}m'] = [
        float(r.prediction) - score_lookup.get((r.cohort, r.fundId, serial(r.period) - months), np.nan)
        for r in composite.itertuples()
    ]
trend_weights = {3: .5, 6: .3, 12: .2}
trend_numerator = sum(composite[f'scoreDelta{months}m'].fillna(0) * weight for months, weight in trend_weights.items())
trend_denominator = sum(composite[f'scoreDelta{months}m'].notna() * weight for months, weight in trend_weights.items())
composite['scoreTrend'] = trend_numerator / trend_denominator.replace(0, np.nan)

# User-facing protection layer: separate long-run quality from entry timing.
# All inputs are point-in-time and ranked only against the same cohort/month.
feature_lookup = df.set_index(['cohort','product','track','fundId','period'])
for months in [1, 3, 6, 12]:
    col = f'return_{months}m'
    composite[col] = [feature_lookup[col].get((r.cohort,r.product,r.track,r.fundId,r.period), np.nan) for r in composite.itertuples()]
    composite[f'{col}_percentile'] = composite.groupby(['cohort','period'])[col].rank(pct=True) * 100

rank_cols = [f'return_{months}m_percentile' for months in [1, 3, 6, 12]]
composite['horizonAgreement'] = (100 - composite[rank_cols].std(axis=1, skipna=True) * 2).clip(0, 100)
composite['shortTermLevel'] = composite[[f'return_{m}m_percentile' for m in [3, 6, 12]]].mean(axis=1)
composite['recentWeakening'] = (
    .6 * (composite['return_3m_percentile'] - composite['return_1m_percentile']).clip(lower=0)
    + .4 * (composite['return_6m_percentile'] - composite['return_3m_percentile']).clip(lower=0)
).clip(0, 100)
composite['overheatLevel'] = ((composite['shortTermLevel'] - 70).clip(lower=0) / 30 * 100).clip(0, 100)
composite['disagreementRisk'] = (100 - composite.horizonAgreement).clip(0, 100)
composite['qualityShortTermGap'] = (
    (composite.prediction - composite.shortTermLevel - 10).clip(lower=0) / 40 * 100
).clip(0, 100)
composite['reversalRisk'] = (
    .30 * composite.overheatLevel
    + .25 * composite.recentWeakening
    + .15 * composite.disagreementRisk
    + .30 * composite.qualityShortTermGap
).clip(0, 100)

for offset in [1, 2, 3]:
    composite[f'priorScore{offset}m'] = [score_lookup.get((r.cohort, r.fundId, serial(r.period) - offset), np.nan) for r in composite.itertuples()]
prior_cols = [f'priorScore{offset}m' for offset in [1, 2, 3]]
composite['highScorePersistenceMonths'] = composite[prior_cols].ge(80).sum(axis=1)
composite['displayScore'] = composite.prediction.clip(5, 95)
composite['confidence'] = np.select(
    [
        (composite.horizonAgreement >= 70) & (composite[prior_cols].notna().sum(axis=1) == 3),
        (composite.horizonAgreement >= 45) & (composite[prior_cols].notna().sum(axis=1) >= 2),
    ],
    ['high', 'medium'],
    default='low',
)
high_reversal_warning = (
    (composite.reversalRisk >= 55)
    | ((composite.prediction >= 85) & (composite.qualityShortTermGap >= 80))
)
caution_warning = (
    (composite.reversalRisk >= 35)
    | ((composite.prediction >= 80) & (composite.qualityShortTermGap >= 50))
)
composite['timingLabel'] = np.select(
    [high_reversal_warning, caution_warning],
    ['high reversal risk', 'caution'],
    default='normal',
)

timing_label_results = []
for label, group in composite.groupby('timingLabel'):
    timing_label_results.append({
        'label': label,
        'rows': len(group),
        'meanFuturePercentile': round(float(group.truth.mean()), 1),
        'futureBottomThirdRate': round(float((group.truth <= 33.3333).mean() * 100), 1),
        'futureTopThirdRate': round(float((group.truth >= 66.6667).mean() * 100), 1),
    })

guardrail_results = []
for strength in [.10, .25, .50]:
    penalty = strength * (composite.reversalRisk - 35).clip(lower=0)
    guarded = (composite.displayScore - penalty).clip(5, 95)
    valid = guarded.notna()
    guardrail_results.append({
        'strength': strength,
        'formula': 'capped broad score minus strength * reversal risk above 35',
        **metrics(composite[valid], guarded[valid].to_numpy()),
        'rows': int(valid.sum()),
    })
composite['guardedScore'] = (composite.displayScore - .25 * (composite.reversalRisk - 35).clip(lower=0)).clip(5, 95)
trend_results = []
for strength in [.10, .25, .50]:
    adjusted = (composite.prediction + strength * composite.scoreTrend.clip(-20, 20)).clip(0, 100)
    valid = adjusted.notna()
    trend_results.append({
        'strength': strength,
        'formula': 'broad score + strength * clipped weighted 3/6/12-month score change',
        **metrics(composite[valid], adjusted[valid].to_numpy()),
        'rows': int(valid.sum()),
    })
composite_result = {
    'weights': {str(k): v for k, v in score_weights.items()},
    'ridge': metrics(composite, composite.prediction.to_numpy()),
    'baseline': metrics(composite, composite.baseline.to_numpy()),
    'rows': len(composite),
}
short_flow_predictions = all_predictions[all_predictions.model == 'shortFlowRidge']
short_pred_wide = short_flow_predictions.pivot_table(index=key_cols, columns='horizonMonths', values='prediction').reindex(common_index)
short_composite_prediction = short_pred_wide.mul(weights).sum(axis=1, skipna=True) / short_pred_wide.notna().mul(weights).sum(axis=1)
short_composite = composite.copy()
short_composite['prediction'] = short_composite_prediction.clip(0, 100).to_numpy()
short_flow_composite_result = {
    'weights': {str(k): v for k, v in score_weights.items()},
    'shortFlowRidge': metrics(short_composite, short_composite.prediction.to_numpy()),
    'baseline': metrics(short_composite, short_composite.baseline.to_numpy()),
    'rows': len(short_composite),
}
short_return_predictions = all_predictions[all_predictions.model == 'shortReturnRidge']
short_return_wide = short_return_predictions.pivot_table(index=key_cols, columns='horizonMonths', values='prediction').reindex(common_index)
short_return_composite_prediction = short_return_wide.mul(weights).sum(axis=1, skipna=True) / short_return_wide.notna().mul(weights).sum(axis=1)
short_return_composite = composite.copy()
short_return_composite['prediction'] = short_return_composite_prediction.clip(0, 100).to_numpy()
short_return_composite_result = {
    'weights': {str(k): v for k, v in score_weights.items()},
    'shortReturnRidge': metrics(short_return_composite, short_return_composite.prediction.to_numpy()),
    'baseline': metrics(short_return_composite, short_return_composite.baseline.to_numpy()),
    'rows': len(short_return_composite),
}
sample_funds = {
    '119': ("מנורה מבטחים יותר מסלול ד'", 'gemel_regular__general'),
    '1093': ('אלטשולר שחם השתלמות כללי', 'training_fund__general'),
}
sample_histories = []
for sample_fund_id, (sample_name, sample_cohort) in sample_funds.items():
    sample = composite[(composite.fundId == sample_fund_id) & (composite.period >= 201801)].copy()
    sample_histories.append({
        'fundId': sample_fund_id,
        'fundName': sample_name,
        'cohort': sample_cohort,
        'points': [{
            'fundId': sample_fund_id,
            'period': int(row.period),
            'predictedScore': round(float(row.prediction), 1),
            'baselineScore': round(float(row.baseline), 1),
            'realizedMultiHorizonPercentile': round(float(row.truth), 1),
            'scoreDelta3m': round(float(row.scoreDelta3m), 1) if np.isfinite(row.scoreDelta3m) else None,
            'scoreDelta6m': round(float(row.scoreDelta6m), 1) if np.isfinite(row.scoreDelta6m) else None,
            'scoreDelta12m': round(float(row.scoreDelta12m), 1) if np.isfinite(row.scoreDelta12m) else None,
            'scoreTrend': round(float(row.scoreTrend), 1) if np.isfinite(row.scoreTrend) else None,
            'trendAdjustedScore': round(float(np.clip(row.prediction + .25 * np.clip(row.scoreTrend, -20, 20), 0, 100)), 1) if np.isfinite(row.scoreTrend) else None,
            'displayScore': round(float(row.displayScore), 1),
            'guardedScore': round(float(row.guardedScore), 1) if np.isfinite(row.guardedScore) else None,
            'horizonAgreement': round(float(row.horizonAgreement), 1) if np.isfinite(row.horizonAgreement) else None,
            'shortTermLevel': round(float(row.shortTermLevel), 1) if np.isfinite(row.shortTermLevel) else None,
            'qualityShortTermGap': round(float(row.qualityShortTermGap), 1) if np.isfinite(row.qualityShortTermGap) else None,
            'reversalRisk': round(float(row.reversalRisk), 1) if np.isfinite(row.reversalRisk) else None,
            'timingLabel': row.timingLabel,
            'confidence': row.confidence,
            'highScorePersistenceMonths': int(row.highScorePersistenceMonths),
        } for row in sample.itertuples()],
    })

result = {
    'generatedAt': pd.Timestamp.now('UTC').isoformat(),
    'design': {
        'testYears': TEST_YEARS, 'horizonsMonths': HORIZONS,
        'purgeRule': 'Training target must end before January of the test year',
        'models': ['current-score approximation', 'regularized ridge', 'short-horizon plus asset/flow ridge', 'histogram gradient boosting', '40/60 ridge/boost ensemble'],
        'featureCount': len(feature_cols), 'features': feature_cols,
        'shortFlowFeatures': short_flow_features,
        'shortReturnFeatures': short_return_features,
    },
    'aggregate': aggregate,
    'foldComparisonsToBaseline': fold_comparisons,
    'cohorts': cohort_results,
    'compositeScore': composite_result,
    'shortFlowCompositeScore': short_flow_composite_result,
    'shortReturnCompositeScore': short_return_composite_result,
    'scoreTrendExperiment': {'weights': {str(k): v for k, v in trend_weights.items()}, 'candidates': trend_results},
    'userProtectionExperiment': {
        'displayScoreRange': [5, 95],
        'reversalRiskWeights': {'overheat': .30, 'recentWeakening': .25, 'horizonDisagreement': .15, 'qualityShortTermGap': .30},
        'guardrailCandidates': guardrail_results,
        'timingLabelResults': timing_label_results,
    },
    'sampleHistories': sample_histories,
    'folds': folds,
}
out = ROOT / 'backtest-results' / 'monthly-model-backtest.json'
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result['aggregate'], ensure_ascii=False, indent=2))
