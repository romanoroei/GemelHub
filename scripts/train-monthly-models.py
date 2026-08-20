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
TEST_YEARS = [2018, 2020, 2022, 2024]

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

        imputer = SimpleImputer(strategy='median')
        x_train = imputer.fit_transform(train[numeric])
        x_test = imputer.transform(test[numeric])
        boost = HistGradientBoostingRegressor(max_iter=120, learning_rate=.05, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=5, random_state=42)
        boost.fit(x_train, train['truth'])
        boost_pred = boost.predict(x_test)
        ensemble_pred = .4 * ridge_pred + .6 * boost_pred

        for model, pred in [('baseline', test['baseline'].to_numpy()), ('ridge', ridge_pred), ('gradientBoosting', boost_pred), ('ensemble', ensemble_pred)]:
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
    for model in ['ridge','gradientBoosting','ensemble']:
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
composite_result = {
    'weights': {str(k): v for k, v in score_weights.items()},
    'ridge': metrics(composite, composite.prediction.to_numpy()),
    'baseline': metrics(composite, composite.baseline.to_numpy()),
    'rows': len(composite),
}
sample_fund_id = '119'
sample = composite[(composite.fundId == sample_fund_id) & (composite.period % 100 == 12)].copy()
sample_history = [{
    'fundId': sample_fund_id,
    'period': int(row.period),
    'predictedScore': round(float(row.prediction), 1),
    'baselineScore': round(float(row.baseline), 1),
    'realizedMultiHorizonPercentile': round(float(row.truth), 1),
} for row in sample.itertuples()]

result = {
    'generatedAt': pd.Timestamp.now('UTC').isoformat(),
    'design': {
        'testYears': TEST_YEARS, 'horizonsMonths': HORIZONS,
        'purgeRule': 'Training target must end before January of the test year',
        'models': ['current-score approximation', 'regularized ridge', 'histogram gradient boosting', '40/60 ridge/boost ensemble'],
        'featureCount': len(feature_cols), 'features': feature_cols,
    },
    'aggregate': aggregate,
    'foldComparisonsToBaseline': fold_comparisons,
    'cohorts': cohort_results,
    'compositeScore': composite_result,
    'sampleHistory': {
        'fundId': sample_fund_id,
        'fundName': "מנורה מבטחים יותר מסלול ד'",
        'cohort': 'gemel_regular__general',
        'points': sample_history,
    },
    'folds': folds,
}
out = ROOT / 'backtest-results' / 'monthly-model-backtest.json'
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result['aggregate'], ensure_ascii=False, indent=2))
