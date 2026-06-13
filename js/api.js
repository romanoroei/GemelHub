// ==========================================
// API MODULE - GemulHub
// ==========================================

const APIModule = (() => {
  let _cachedRaw = null;
  let _fetchPromise = null;
  const _resourceCache = new Map();
  const _resourcePromiseCache = new Map();
  (function extendAgachSahirTracks() {
    const insertAfter = (list, afterId, newId) => {
      if (!Array.isArray(list) || list.includes(newId)) return;
      const anchorIndex = list.indexOf(afterId);
      if (anchorIndex === -1) {
        list.push(newId);
        return;
      }
      list.splice(anchorIndex + 1, 0, newId);
    };

    const ensureTrack = (track) => {
      if (!CONFIG.INVESTMENT_TRACKS.some(item => item.id === track.id)) {
        CONFIG.INVESTMENT_TRACKS.push(track);
      }
    };

    const byId = (id) => CONFIG.INVESTMENT_TRACKS.find(track => track.id === id);

    const agachSahar = byId('agach_sahar');
    if (agachSahar) agachSahar.fundNameExcludes = Array.from(new Set([...(agachSahar.fundNameExcludes || []), '25%']));

    const pensionAgachSahar = byId('pension_agach_sahar');
    if (pensionAgachSahar) pensionAgachSahar.fundNameExcludes = Array.from(new Set([...(pensionAgachSahar.fundNameExcludes || []), '25%']));

    const polisaAgachSahar = byId('polisa_agach_sahar');
    if (polisaAgachSahar) polisaAgachSahar.fundNameExcludes = Array.from(new Set([...(polisaAgachSahar.fundNameExcludes || []), '25%']));

    ensureTrack({
      id: 'agach_sahar_maniot25',
      label: 'אג"ח סחיר עד 25% במניות',
      subSpecializationKeys: ['אג"ח סחיר'],
      fundNameIncludes: ['25%']
    });

    ensureTrack({
      id: 'pension_agach_sahar_maniot25',
      label: 'אג"ח סחיר עד 25% במניות',
      fundNameIncludes: ['אג"ח סחיר עד 25%', 'אגח סחיר עד 25%', 'אג"ח סחיר עד 25% במניות', 'אגח סחיר עד 25% במניות', '25%'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    });

    ensureTrack({
      id: 'polisa_agach_sahar_maniot25',
      label: 'אג"ח סחיר עד 25% במניות',
      fundNameIncludes: ['אג"ח סחיר עד 25%', 'אגח סחיר עד 25%', 'אג"ח סחיר עד 25% במניות', 'אגח סחיר עד 25% במניות', '25%'],
      fundNameExcludes: ['ממשלתי']
    });

    ['gemel_tagmulim', 'gemel_hashkaa', 'hashtalamot'].forEach(categoryId => {
      const category = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === categoryId);
      if (category?.trackList) insertAfter(category.trackList, 'agach_sahar', 'agach_sahar_maniot25');
    });

    ['pension_mekafit', 'pension_mashlima'].forEach(categoryId => {
      const category = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === categoryId);
      if (category?.trackList) insertAfter(category.trackList, 'pension_agach_sahar', 'pension_agach_sahar_maniot25');
    });

    const polisaCategory = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === 'polisa_chisachon');
    if (polisaCategory?.trackList) insertAfter(polisaCategory.trackList, 'polisa_agach_sahar', 'polisa_agach_sahar_maniot25');
  })();

  // ─── localStorage persistence ─────────────────────────────────
  const _LS_KEY = 'gemelhub_api_v1';
  const _LS_TTL = 6 * 60 * 60 * 1000; // 6 שעות

  let _cachedCurrentGemel = null;
  let _currentGemelPromise = null;

  function _saveToLocalStorage() {
    try {
      if (!_cachedCurrentGemel && !_cachedPension && !_cachedPolisa) return;
      localStorage.setItem(_LS_KEY, JSON.stringify({
        ts: Date.now(),
        gemel: _cachedCurrentGemel || null,
        pension: _cachedPension || null,
        polisa: _cachedPolisa || null
      }));
    } catch (e) { /* quota exceeded */ }
  }

  function loadCachesFromLocalStorage() {
    try {
      const raw = localStorage.getItem(_LS_KEY);
      if (!raw) return;
      const { ts, gemel, pension, polisa } = JSON.parse(raw);
      if (!ts || Date.now() - ts > _LS_TTL) { localStorage.removeItem(_LS_KEY); return; }
      if (gemel)   { _cachedCurrentGemel = gemel; _resourceCache.set(CONFIG.API.GEMEL_RESOURCE_ID, gemel); }
      if (pension) { _cachedPension = pension; }
      if (polisa)  { _cachedPolisa = polisa; }
    } catch (e) { localStorage.removeItem(_LS_KEY); }
  }

  // ─── helpers לשמירה/קריאה של נתוני Phase 2 ב-localStorage ───
  // TTL נפרד לנתונים היסטוריים (6 שעות — נתונים מתעדכנים יומי)
  const _LS_PHASE2_TTL = 6 * 60 * 60 * 1000;

  function _lsLoad(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (!ts || Date.now() - ts > _LS_PHASE2_TTL) { localStorage.removeItem(key); return null; }
      return data;
    } catch(e) { return null; }
  }

  function _lsSave(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); }
    catch(e) { /* quota exceeded — no-op */ }
  }

  async function fetchDatastoreRecords(resourceId) {
    if (!resourceId) return [];
    if (_resourceCache.has(resourceId)) return _resourceCache.get(resourceId);
    if (_resourcePromiseCache.has(resourceId)) return _resourcePromiseCache.get(resourceId);

    const fetchPromise = (async () => {
      let offset = 0;
      let total = Infinity;
      const all = [];

      while (offset < total) {
        const url = `${CONFIG.API.BASE_URL}?resource_id=${resourceId}&limit=${CONFIG.API.LIMIT}&offset=${offset}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (!json.success) throw new Error('API returned success=false');

        const records = json.result?.records || [];
        total = Number(json.result?.total || records.length || 0);
        all.push(...records);

        if (!records.length || records.length < CONFIG.API.LIMIT) break;
        offset += records.length;
      }

      _resourceCache.set(resourceId, all);
      _resourcePromiseCache.delete(resourceId);
      return all;
    })();

    _resourcePromiseCache.set(resourceId, fetchPromise);
    return fetchPromise;
  }

  function dedupeRecordsByFundAndPeriod(records) {
    const seen = new Set();
    const deduped = [];

    for (const record of records) {
      const fundId = String(record.FUND_ID || '').trim();
      const period = String(record.REPORT_PERIOD || '').trim();
      const cls = String(record.FUND_CLASSIFICATION || '').trim();
      const sub = String(record.SUB_SPECIALIZATION || '').trim();
      const key = `${fundId}|${period}|${cls}|${sub}`;
      if (!fundId || !period || seen.has(key)) continue;
      seen.add(key);
      deduped.push(record);
    }

    return deduped;
  }

  // ─── שלוף נתונים מסוננים מה-API לפי שדות ספציפיים ──────────
  // filtersObj = { FUND_ID: '8522' } או { FUND_CLASSIFICATION: '...', SUB_SPECIALIZATION: '...' }
  // מהיר בהרבה מ-fetchDatastoreRecords כי מחזיר רק רשומות תואמות
  function getLatestDistinctMonthlyYields(records, months = 6) {
    const seenPeriods = new Set();
    const vals = [];
    [...records]
      .sort((a, b) => Number(b.REPORT_PERIOD) - Number(a.REPORT_PERIOD))
      .forEach(record => {
        if (vals.length >= months) return;
        const period = String(record.REPORT_PERIOD || '').trim();
        if (!period || seenPeriods.has(period)) return;
        const monthlyYield = parseFloat(record.MONTHLY_YIELD);
        if (isNaN(monthlyYield)) return;
        seenPeriods.add(period);
        vals.push(monthlyYield);
      });
    return vals.length === months ? vals : null;
  }

  function compoundMonthlyYields(vals) {
    return (vals.reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100;
  }

  const _filteredCache        = new Map();
  const _filteredPromiseCache = new Map();

  async function fetchFilteredRecords(resourceId, filtersObj) {
    if (!resourceId) return [];
    const cacheKey = resourceId + '|' + JSON.stringify(filtersObj);
    if (_filteredCache.has(cacheKey))        return _filteredCache.get(cacheKey);
    if (_filteredPromiseCache.has(cacheKey)) return _filteredPromiseCache.get(cacheKey);

    const fetchPromise = (async () => {
      let offset = 0;
      let total  = Infinity;
      const all  = [];
      const filtersStr = encodeURIComponent(JSON.stringify(filtersObj));

      while (offset < total) {
        const url = `${CONFIG.API.BASE_URL}?resource_id=${resourceId}&filters=${filtersStr}&limit=${CONFIG.API.LIMIT}&offset=${offset}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (!json.success) throw new Error('API returned success=false');

        const records = json.result?.records || [];
        total = Number(json.result?.total || records.length || 0);
        all.push(...records);

        if (!records.length || records.length < CONFIG.API.LIMIT) break;
        offset += records.length;
      }

      _filteredCache.set(cacheKey, all);
      _filteredPromiseCache.delete(cacheKey);
      return all;
    })();

    _filteredPromiseCache.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  async function safeFetchFilteredRecords(resourceId, filtersObj) {
    try {
      return await fetchFilteredRecords(resourceId, filtersObj);
    } catch (error) {
      console.warn('filtered history fetch failed', filtersObj, error);
      return [];
    }
  }

  // ─── שלוף רק נתוני גמל נוכחיים (1 בקשה — לתצוגה וחיפוש) ────
  async function fetchCurrentGemelData() {
    if (_cachedCurrentGemel) return _cachedCurrentGemel;
    if (_currentGemelPromise) return _currentGemelPromise;

    _currentGemelPromise = (async () => {
      const records = await fetchDatastoreRecords(CONFIG.API.GEMEL_RESOURCE_ID);
      _cachedCurrentGemel = records;
      _currentGemelPromise = null;
      _saveToLocalStorage();
      return _cachedCurrentGemel;
    })();

    return _currentGemelPromise;
  }

  // ─── שלוף את כל הרשומות מה-API כולל היסטוריה (לתכונת טווח מותאם) ───
  async function fetchAllData() {
    if (_cachedRaw) return _cachedRaw;
    if (_fetchPromise) return _fetchPromise;

    _fetchPromise = (async () => {
      const [currentRecords, historical2023, historical1999_2022] = await Promise.all([
        fetchCurrentGemelData(),
        fetchDatastoreRecords(CONFIG.API.GEMEL_2023_RESOURCE_ID),
        fetchDatastoreRecords(CONFIG.API.GEMEL_1999_2022_RESOURCE_ID)
      ]);

      _cachedRaw = dedupeRecordsByFundAndPeriod([
        ...currentRecords,
        ...historical2023,
        ...historical1999_2022
      ]);
      return _cachedRaw;
    })();

    return _fetchPromise;
  }

  // ─── שלוף נתוני פנסיה (עם cache נפרד) ─────────────────────────────────────────
  let _cachedPension = null;
  let _fetchPensionPromise = null;
  let _cachedPensionHistorical = null;
  let _fetchPensionHistoricalPromise = null;

  async function fetchPensionData() {
    if (_cachedPension) return _cachedPension;
    if (_fetchPensionPromise) return _fetchPensionPromise;
    _fetchPensionPromise = (async () => {
      const url = `${CONFIG.API.BASE_URL}?resource_id=${CONFIG.API.PENSION_RESOURCE_ID}&limit=${CONFIG.API.LIMIT}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error('API returned success=false');
      _cachedPension = json.result.records;
      _saveToLocalStorage();
      return _cachedPension;
    })();
    return _fetchPensionPromise;
  }

  async function fetchPensionHistoricalRangeData() {
    if (_cachedPensionHistorical) return _cachedPensionHistorical;
    if (_fetchPensionHistoricalPromise) return _fetchPensionHistoricalPromise;

    _fetchPensionHistoricalPromise = (async () => {
      const [currentRecords, historical2023, historical1999_2022] = await Promise.all([
        fetchPensionData(),
        fetchDatastoreRecords(CONFIG.API.PENSION_2023_RESOURCE_ID),
        fetchDatastoreRecords(CONFIG.API.PENSION_1999_2022_RESOURCE_ID)
      ]);

      _cachedPensionHistorical = dedupeRecordsByFundAndPeriod([
        ...currentRecords,
        ...historical2023,
        ...historical1999_2022
      ]);
      return _cachedPensionHistorical;
    })();

    return _fetchPensionHistoricalPromise;
  }

  // ─── שלוף נתוני פוליסות חיסכון (עם cache נפרד) ────────────────
  let _cachedPolisa = null;
  let _fetchPolisaPromise = null;
  let _cachedPolisaHistorical = null;
  let _fetchPolisaHistoricalPromise = null;

  // גזור שם תצוגה מ-PARENT_COMPANY_NAME + FUND_NAME (כולל מנהלי משנה של הכשרה)
  function _polisaProviderName(parentName, fundName) {
    const pn = (parentName || '').toLowerCase();
    const fn = (fundName   || '').toLowerCase();
    if (pn.includes('הכשרה')) {
      if (fn.includes('ילין לפידות'))   return 'הכשרה - ילין לפידות';
      if (fn.includes('אלטשולר שחם')) return 'הכשרה - אלטשולר שחם';
      if (fn.includes('אנליסט'))         return 'הכשרה - אנליסט';
      if (fn.includes('מור'))            return 'הכשרה - מור';
      if (fn.includes('מיטב'))           return 'הכשרה - מיטב';
      return 'הכשרה';
    }
    // לשאר: המר שם חברה ארוך לשם קצר
    return getProviderDisplayName(parentName, parentName);
  }

  async function fetchPolisaData() {
    if (_cachedPolisa) return _cachedPolisa;
    if (_fetchPolisaPromise) return _fetchPolisaPromise;
    _fetchPolisaPromise = (async () => {
      const url = `${CONFIG.API.BASE_URL}?resource_id=${CONFIG.API.POLISA_RESOURCE_ID}&limit=${CONFIG.API.LIMIT}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error('API returned success=false');
      // נרמל שדות: הוסף CONTROLLING_CORPORATION + MANAGING_CORPORATION
      _cachedPolisa = json.result.records.map(r => {
        const prov = _polisaProviderName(r.PARENT_COMPANY_NAME, r.FUND_NAME);
        return { ...r, CONTROLLING_CORPORATION: prov, MANAGING_CORPORATION: prov };
      });
      _saveToLocalStorage();
      return _cachedPolisa;
    })();
    return _fetchPolisaPromise;
  }

  async function fetchPolisaHistoricalRangeData() {
    if (_cachedPolisaHistorical) return _cachedPolisaHistorical;
    if (_fetchPolisaHistoricalPromise) return _fetchPolisaHistoricalPromise;

    _fetchPolisaHistoricalPromise = (async () => {
      const [currentRecords, historical2023, historical1999_2022] = await Promise.all([
        fetchPolisaData(),
        fetchDatastoreRecords(CONFIG.API.POLISA_2023_RESOURCE_ID),
        fetchDatastoreRecords(CONFIG.API.POLISA_1999_2022_RESOURCE_ID)
      ]);

      const normalizedHistorical = [...historical2023, ...historical1999_2022].map(r => {
        const prov = _polisaProviderName(r.PARENT_COMPANY_NAME, r.FUND_NAME);
        return { ...r, CONTROLLING_CORPORATION: prov, MANAGING_CORPORATION: prov };
      });

      _cachedPolisaHistorical = dedupeRecordsByFundAndPeriod([
        ...currentRecords,
        ...normalizedHistorical
      ]);
      return _cachedPolisaHistorical;
    })();

    return _fetchPolisaHistoricalPromise;
  }

  // פוליסות: מנהלי משנה שמוחרגים מהטבלאות (אבל נשארים בחיפוש)
  const _POLISA_EXCLUDE = ['אקסלנס', 'משתתף', 'מקבלי קצבה'];
  function _isPolisaExcluded(fundName) {
    const n = (fundName || '').toLowerCase();
    return _POLISA_EXCLUDE.some(ex => n.includes(ex.toLowerCase()));
  }

  // ─── בחר רשומה אחת עדכנית לכל FUND_ID ───────────────────────
  // חשוב: מחזיר רק את הרשומה של תאריך הדיווח האחרון לכל קרן
  function getLatestRecords(records) {
    const map = new Map();
    for (const r of records) {
      const existing = map.get(r.FUND_ID);
      if (!existing || Number(r.REPORT_PERIOD) > Number(existing.REPORT_PERIOD)) {
        map.set(r.FUND_ID, r);
      }
    }
    return Array.from(map.values());
  }

  // ─── סנן כך שיוצגו רק קרנות עם נתונים עד הדיווח האחרון ──────
  // מוצא את תאריך הדיווח המקסימלי ומסנן רק אותו
  function filterLatestPeriodOnly(records) {
    if (!records.length) return records;
    let maxPeriod = 0;
    for (const r of records) {
      if (Number(r.REPORT_PERIOD) > maxPeriod) maxPeriod = Number(r.REPORT_PERIOD);
    }
    return records.filter(r => Number(r.REPORT_PERIOD) === maxPeriod);
  }

  // ─── סנן לפי יצרנים מורשים ───────────────────────────────────
  function filterByAllowedProviders(records) {
    return records.filter(r =>
      isProviderAllowed(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION)
    );
  }

  // ─── סנן לפי אוכלוסיית יעד ───────────────────────────────────
  function filterByTargetPopulation(records, pop) {
    if (!pop) return records;
    return records.filter(r => (r.TARGET_POPULATION || '') === pop);
  }

  // ─── סנן לפי FUND_CLASSIFICATION — task 6+7: התאמה מדויקת למניעת זליגה ───
  // שימוש ב-=== (exact match) כדי ש-'קופת גמל להשקעה' לא יתאים
  // ל-'קופת גמל להשקעה - חסכון לילד' וכו'
  function filterByCategory(records, cat) {
    if (!cat) return records;
    return records.filter(r => {
      const cls = (r.FUND_CLASSIFICATION || '').trim();
      return cat.apiClassifications.some(ac => cls === ac.trim());
    });
  }

  function matchesTrackToken(name, token) {
    const haystack = String(name || '').toLowerCase();
    const needle = String(token || '').trim().toLowerCase();
    if (!needle) return false;
    if (needle === '25%') {
      return /(?:עד\s*25|25\s*%|25\s*אחוז)/i.test(haystack);
    }
    return haystack.includes(needle);
  }

  // ─── התאם מסלול לפי SUB_SPECIALIZATION + FUND_NAME (אופציונלי) ─────────────
  function matchTrackBySubSpec(record, track) {
    const sub  = (record.SUB_SPECIALIZATION || '').trim().toLowerCase();
    const name = (record.FUND_NAME || '').toLowerCase();

    // אם למסלול יש subSpecializationKeys — בדוק אותם
    if (track.subSpecializationKeys && track.subSpecializationKeys.length) {
      if (!track.subSpecializationKeys.some(k => sub === k.trim().toLowerCase())) return false;
    } else if (!track.fundNameIncludes || !track.fundNameIncludes.length) {
      // אין קריטריון התאמה — לא מתאים
      return false;
    }

    // fundNameIncludes: לפחות אחד מהמפתחות חייב להופיע בשם הקופה
    if (track.fundNameIncludes && track.fundNameIncludes.length) {
      if (!track.fundNameIncludes.some(k => matchesTrackToken(name, k))) return false;
    }

    // fundNameExcludes: אף אחד מהמפתחות לא יכול להופיע בשם הקופה
    if (track.fundNameExcludes && track.fundNameExcludes.length) {
      if (track.fundNameExcludes.some(k => matchesTrackToken(name, k))) return false;
    }

    return true;
  }

  // ─── ארגן נתונים לפי קטגוריה → מסלולים ─────────────────────
  async function getOrganizedData(options = {}) {
    const {
      categoryId       = null,
      targetPopulation = 'כלל האוכלוסיה',
      selectedProviders = null
    } = options;

    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === categoryId);
    const isPension = !!(cat && cat.pensionAPI);
    const isPolisa  = !!(cat && cat.polisaAPI);
    const allRaw  = isPension ? await fetchPensionData()
                  : isPolisa  ? await fetchPolisaData()
                  : await fetchCurrentGemelData();
    // 1. קח רק את הרשומה העדכנית לכל קרן
    let records   = getLatestRecords(allRaw);

    // 2. יצרנים מורשים
    records = filterByAllowedProviders(records);

    // 2b. הסר קרנות "בניהול אישי" (task 8)
    records = records.filter(r => !(r.FUND_NAME || '').includes('בניהול אישי'));

    // 2c. הסר מנהלי משנה מוחרגים בפוליסות (אקסלנס ודומיהם)
    if (isPolisa) records = records.filter(r => !_isPolisaExcluded(r.FUND_NAME));

    // 3. אוכלוסיית יעד — רק לגמל (בפנסיה/פוליסה אין שדה זה)
    if (!isPension && !isPolisa) records = filterByTargetPopulation(records, targetPopulation);

    // 4. קטגוריה (FUND_CLASSIFICATION)
    if (cat) records = filterByCategory(records, cat);

    // 4b. הסר קרנות מוחרגות לפי קטגוריה (task 9)
    if (cat && cat.excludedFundIds && cat.excludedFundIds.length) {
      const excl = new Set(cat.excludedFundIds.map(String));
      records = records.filter(r => !excl.has(String(r.FUND_ID)));
    }

    // 5. סנן לתקופת הדיווח האחרונה בלבד (רק קרנות עם נתונים עדכניים)
    records = filterLatestPeriodOnly(records);

    // 6. יצרנים נבחרים (סינון נוסף מה-sidebar)
    if (selectedProviders && selectedProviders.size > 0) {
      records = records.filter(r => {
        const name = getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION);
        return selectedProviders.has(name);
      });
    }

    // 7. ארגן לפי מסלולים — task 5: שמור סדר trackList בדיוק
    const hiddenByDefault = cat ? (cat.hiddenDefaultTracks || []) : [];
    const topOrder = cat ? (cat.topOrderTracks || []) : [];
    // בנה את רשימת המסלולים בסדר: topOrderTracks קודם, אחר כך שאר ה-trackList
    const buildTracksInOrder = () => {
      if (!cat || !cat.trackList) return CONFIG.INVESTMENT_TRACKS;
      // כל מסלול לפי trackList order
      const allById = new Map(CONFIG.INVESTMENT_TRACKS.map(t => [t.id, t]));
      const trackListItems = cat.trackList.map(id => allById.get(id)).filter(Boolean);
      // מיין: topOrder קודם, hidden אחרון, שאר לפי trackList
      return [...trackListItems].sort((a, b) => {
        const aTop = topOrder.indexOf(a.id);
        const bTop = topOrder.indexOf(b.id);
        const aH = hiddenByDefault.includes(a.id) ? 2 : (aTop >= 0 ? -1 : 0);
        const bH = hiddenByDefault.includes(b.id) ? 2 : (bTop >= 0 ? -1 : 0);
        if (aH !== bH) return aH - bH;
        if (aTop >= 0 && bTop >= 0) return aTop - bTop;
        return trackListItems.indexOf(a) - trackListItems.indexOf(b);
      });
    };
    const tracksToUse = buildTracksInOrder();
    const yields12M = isPension
      ? await get12MYieldsPension()
      : isPolisa
        ? await get12MYieldsPolisa()
        : await get12MYields();

    const organized = [];

    for (const track of tracksToUse) {
      const isHidden = hiddenByDefault.includes(track.id);
      const trackRecords = records.filter(r => matchTrackBySubSpec(r, track));
      if (trackRecords.length === 0) continue;

      // מיון ראשוני לפי תשואה 12 חודשים יורדת
      trackRecords.sort((a, b) =>
        ((yields12M.get(String(b.FUND_ID)) ?? -9999) - (yields12M.get(String(a.FUND_ID)) ?? -9999))
      );

      organized.push({
        track,
        records: trackRecords,
        average: computeAverage(trackRecords),
        isHiddenByDefault: isHidden,
        sortField: '1yr',
        sortDir: 'desc'
      });
    }

    return organized;
  }

  // ─── חשב ממוצע ───────────────────────────────────────────────
  function computeAverage(records) {
    const FIELDS = ['MONTHLY_YIELD','YEAR_TO_DATE_YIELD','YIELD_TRAILING_3_YRS','YIELD_TRAILING_5_YRS'];
    const res = {};
    for (const f of FIELDS) {
      const vals = records.map(r => parseFloat(r[f])).filter(v => !isNaN(v));
      res[f] = vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
    }
    return res;
  }

  // ─── Top N מנהלים לפי תשואה 12 חודשים ───────────────────────
  async function getTop3(categoryId, trackId, n = 3) {
    const allRaw  = await fetchCurrentGemelData();
    let records   = getLatestRecords(allRaw);
    records = filterByAllowedProviders(records);
    records = records.filter(r => !(r.FUND_NAME || '').includes('בניהול אישי'));
    records = filterByTargetPopulation(records, 'כלל האוכלוסיה');

    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === categoryId);
    if (cat) records = filterByCategory(records, cat);

    // סנן לתאריך דיווח אחרון בלבד
    records = filterLatestPeriodOnly(records);

    const track = CONFIG.INVESTMENT_TRACKS.find(t => t.id === trackId);
    if (track) records = records.filter(r => matchTrackBySubSpec(r, track));

    const catMeta = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === categoryId);
    const yields12M = catMeta?.pensionAPI
      ? await get12MYieldsPension()
      : catMeta?.polisaAPI
        ? await get12MYieldsPolisa()
        : await get12MYields();
    records.sort((a, b) =>
      ((yields12M.get(String(b.FUND_ID)) ?? -9999) - (yields12M.get(String(a.FUND_ID)) ?? -9999))
    );

    return records.slice(0, n).map(record => ({
      ...record,
      __YIELD_12M__: yields12M.get(String(record.FUND_ID)) ?? null
    }));
  }

  // ─── קבל כל הרשומות (לחיפוש autocomplete) — רק תקופת דיווח אחרונה ──
  async function getAllSearchable() {
    const allRaw = await fetchCurrentGemelData();
    let records  = getLatestRecords(allRaw);
    records = filterByAllowedProviders(records);
    records = filterLatestPeriodOnly(records);
    return records;
  }

  async function getSourceRecordsByCategory(categoryId) {
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === categoryId);
    if (cat && cat.pensionAPI) return fetchPensionData();
    if (cat && cat.polisaAPI) return fetchPolisaData();
    return fetchAllData();
  }

  async function getRangeEligibleRecords(categoryId, targetPopulation = 'כלל האוכלוסיה') {
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === categoryId);
    if (!cat) return [];

    const isPension = !!cat.pensionAPI;
    const isPolisa = !!cat.polisaAPI;
    let records = isPension
      ? await fetchPensionHistoricalRangeData()
      : isPolisa
        ? await fetchPolisaHistoricalRangeData()
        : await getSourceRecordsByCategory(categoryId);

    records = filterByAllowedProviders(records);
    records = records.filter(r => !(r.FUND_NAME || '').includes('בניהול אישי'));

    if (isPolisa) {
      records = records.filter(r => !_isPolisaExcluded(r.FUND_NAME));
    }

    if (!isPension && !isPolisa) {
      records = filterByTargetPopulation(records, targetPopulation);
    }

    records = filterByCategory(records, cat);

    if (cat.excludedFundIds && cat.excludedFundIds.length) {
      const excl = new Set(cat.excludedFundIds.map(String));
      records = records.filter(r => !excl.has(String(r.FUND_ID)));
    }

    return records;
  }

  function listPeriodsInRange(startPeriod, endPeriod) {
    const startNum = Number(startPeriod);
    const endNum = Number(endPeriod);
    if (!startNum || !endNum || endNum < startNum) return [];

    const periods = [];
    let year = Math.floor(startNum / 100);
    let month = startNum % 100;
    const endYear = Math.floor(endNum / 100);
    const endMonth = endNum % 100;

    while (year < endYear || (year === endYear && month <= endMonth)) {
      periods.push(year * 100 + month);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return periods;
  }

  function shiftPeriodByMonths(period, deltaMonths) {
    let year = Math.floor(Number(period) / 100);
    let month = Number(period) % 100;
    let absolute = (year * 12) + (month - 1) + deltaMonths;
    year = Math.floor(absolute / 12);
    month = (absolute % 12) + 1;
    return (year * 100) + month;
  }

  async function getAvailableReportPeriods(categoryId, targetPopulation = 'כלל האוכלוסיה') {
    const records = await getRangeEligibleRecords(categoryId, targetPopulation);
    return Array.from(new Set(records.map(r => Number(r.REPORT_PERIOD)).filter(Boolean))).sort((a, b) => b - a);
  }

  async function getCustomRangeYields(categoryId, startPeriod, endPeriod, targetPopulation = 'כלל האוכלוסיה') {
    const expectedPeriods = listPeriodsInRange(startPeriod, endPeriod);
    const result = new Map();
    if (!expectedPeriods.length) return result;

    const expectedSet = new Set(expectedPeriods);
    const records = await getRangeEligibleRecords(categoryId, targetPopulation);
    const byFund = new Map();

    for (const record of records) {
      const fundId = String(record.FUND_ID || '');
      const period = Number(record.REPORT_PERIOD);
      if (!fundId || !expectedSet.has(period)) continue;
      if (!byFund.has(fundId)) byFund.set(fundId, new Map());
      byFund.get(fundId).set(period, record);
    }

    byFund.forEach((periodMap, fundId) => {
      if (periodMap.size !== expectedPeriods.length) {
        result.set(fundId, null);
        return;
      }

      let compound = 1;
      for (const period of expectedPeriods) {
        const monthlyYield = parseFloat(periodMap.get(period)?.MONTHLY_YIELD);
        if (isNaN(monthlyYield)) {
          result.set(fundId, null);
          return;
        }
        compound *= (1 + monthlyYield / 100);
      }

      result.set(fundId, (compound - 1) * 100);
    });

    return result;
  }

  const _cachedTrailing7YByCategory = new Map();
  const _trailing7YPromiseByCategory = new Map();

  async function getTrailing7Yields(categoryId, targetPopulation = 'כלל האוכלוסיה') {
    const cacheKey = `gemelhub_trailing7y_v1_${categoryId || 'all'}_${targetPopulation || ''}`;
    if (_cachedTrailing7YByCategory.has(cacheKey)) return _cachedTrailing7YByCategory.get(cacheKey);

    const cachedArr = _lsLoad(cacheKey);
    if (cachedArr) {
      const cachedMap = new Map(cachedArr.map(([fundId, value]) => [String(fundId), value === null ? null : Number(value)]));
      _cachedTrailing7YByCategory.set(cacheKey, cachedMap);
      return cachedMap;
    }

    if (_trailing7YPromiseByCategory.has(cacheKey)) return _trailing7YPromiseByCategory.get(cacheKey);

    const promise = (async () => {
      const records = await getRangeEligibleRecords(categoryId, targetPopulation);
      const periods = records.map(record => Number(record.REPORT_PERIOD)).filter(Boolean);
      const latestPeriod = periods.length ? Math.max(...periods) : 0;
      const expectedPeriods = latestPeriod ? listPeriodsInRange(shiftPeriodByMonths(latestPeriod, -83), latestPeriod) : [];
      const expectedSet = new Set(expectedPeriods);
      const byFund = new Map();

      records.forEach(record => {
        const fundId = String(record.FUND_ID || '');
        const period = Number(record.REPORT_PERIOD);
        if (!fundId || !expectedSet.has(period)) return;
        if (!byFund.has(fundId)) byFund.set(fundId, new Map());
        byFund.get(fundId).set(period, record);
      });

      const result = new Map();
      byFund.forEach((periodMap, fundId) => {
        if (periodMap.size !== expectedPeriods.length) {
          result.set(fundId, null);
          return;
        }
        const vals = [];
        for (const period of expectedPeriods) {
          const monthlyYield = parseFloat(periodMap.get(period)?.MONTHLY_YIELD);
          if (isNaN(monthlyYield)) {
            result.set(fundId, null);
            return;
          }
          vals.push(monthlyYield);
        }
        result.set(fundId, compoundMonthlyYields(vals));
      });

      _cachedTrailing7YByCategory.set(cacheKey, result);
      _lsSave(cacheKey, [...result.entries()]);
      _trailing7YPromiseByCategory.delete(cacheKey);
      return result;
    })().catch(error => {
      _trailing7YPromiseByCategory.delete(cacheKey);
      throw error;
    });

    _trailing7YPromiseByCategory.set(cacheKey, promise);
    return promise;
  }
  async function getAnnualYearlyYields(categoryId, targetPopulation = 'כלל האוכלוסיה', yearCount = 10) {
    const records = await getRangeEligibleRecords(categoryId, targetPopulation);
    const periodsByYear = new Map();

    for (const record of records) {
      const period = Number(record.REPORT_PERIOD);
      if (!period) continue;
      const year = Math.floor(period / 100);
      const month = period % 100;
      if (month < 1 || month > 12) continue;
      if (!periodsByYear.has(year)) periodsByYear.set(year, new Set());
      periodsByYear.get(year).add(period);
    }

    const years = Array.from(periodsByYear.entries())
      .filter(([, periods]) => periods.size === 12)
      .map(([year]) => year)
      .sort((a, b) => b - a)
      .slice(0, yearCount);

    const expectedByYear = new Map(years.map(year => [
      year,
      new Set(Array.from({ length: 12 }, (_, index) => (year * 100) + index + 1))
    ]));
    const byFund = new Map();

    for (const record of records) {
      const fundId = String(record.FUND_ID || '');
      const period = Number(record.REPORT_PERIOD);
      const year = Math.floor(period / 100);
      if (!fundId || !expectedByYear.has(year) || !expectedByYear.get(year).has(period)) continue;
      if (!byFund.has(fundId)) byFund.set(fundId, new Map());
      if (!byFund.get(fundId).has(year)) byFund.get(fundId).set(year, new Map());
      byFund.get(fundId).get(year).set(period, record);
    }

    const yieldMap = new Map();
    byFund.forEach((yearsMap, fundId) => {
      const fundYears = new Map();
      years.forEach(year => {
        const periodMap = yearsMap.get(year);
        if (!periodMap || periodMap.size !== 12) {
          fundYears.set(year, null);
          return;
        }

        let compound = 1;
        for (const period of expectedByYear.get(year)) {
          const monthlyYield = parseFloat(periodMap.get(period)?.MONTHLY_YIELD);
          if (isNaN(monthlyYield)) {
            fundYears.set(year, null);
            return;
          }
          compound *= (1 + monthlyYield / 100);
        }
        fundYears.set(year, (compound - 1) * 100);
      });
      yieldMap.set(fundId, fundYears);
    });

    return { years, yieldMap };
  }

  async function getYearlyYieldsForFunds(fundRecords, categoryId, targetPopulation = 'כלל האוכלוסיה', yearCount = 10) {
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === categoryId);
    if (!cat || !Array.isArray(fundRecords) || !fundRecords.length) {
      return { years: [], yieldMap: new Map() };
    }

    const fundIds = new Set(fundRecords.map(record => String(record.FUND_ID || '')).filter(Boolean));
    const latestReportPeriod = Math.max(...fundRecords.map(record => Number(record.REPORT_PERIOD) || 0));
    const latestReportYear = Math.floor(latestReportPeriod / 100);
    const latestReportMonth = latestReportPeriod % 100;
    const latestAnnualYear = latestReportMonth === 12 ? latestReportYear : latestReportYear - 1;
    const isPension = !!cat.pensionAPI;
    const isPolisa = !!cat.polisaAPI;
    let records = [];
    let yearSourceRecords = [];

    if (isPension) {
      records = await fetchPensionHistoricalRangeData();
      yearSourceRecords = records;
    } else if (isPolisa) {
      records = await fetchPolisaHistoricalRangeData();
      yearSourceRecords = records;
    } else {
      const current = await fetchCurrentGemelData();
      const currentFundRecords = current.filter(record => fundIds.has(String(record.FUND_ID || '')));
      const fundHistoryGroups = await Promise.all(Array.from(fundIds).map(fundId =>
        Promise.all([
          safeFetchFilteredRecords(CONFIG.API.GEMEL_2023_RESOURCE_ID, { FUND_ID: fundId }),
          safeFetchFilteredRecords(CONFIG.API.GEMEL_1999_2022_RESOURCE_ID, { FUND_ID: fundId })
        ]).then(([hist2023, hist1999]) => [...hist2023, ...hist1999])
      ));
      const directFundHistory = fundHistoryGroups.flat();
      const groupMap = new Map();
      const classMap = new Map();
      fundRecords.forEach(record => {
        const cls = (record.FUND_CLASSIFICATION || '').trim();
        const sub = (record.SUB_SPECIALIZATION || '').trim();
        if (!cls || !sub) return;
        if (!classMap.has(cls)) classMap.set(cls, { FUND_CLASSIFICATION: cls });
        const key = `${cls}|${sub}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            FUND_CLASSIFICATION: cls,
            SUB_SPECIALIZATION: sub
          });
        }
      });

      let historicalGroups = [];

      yearSourceRecords = [
        ...currentFundRecords,
        ...directFundHistory
      ];
      let sourceYears = getCompleteYearsFromRecords(yearSourceRecords, yearCount);
      if (sourceYears.length < yearCount && groupMap.size) {
        historicalGroups = await Promise.all(Array.from(groupMap.values()).map(filters =>
          Promise.all([
            safeFetchFilteredRecords(CONFIG.API.GEMEL_2023_RESOURCE_ID, filters),
            safeFetchFilteredRecords(CONFIG.API.GEMEL_1999_2022_RESOURCE_ID, filters)
          ]).then(([hist2023, hist1999]) => [...hist2023, ...hist1999])
        ));
        yearSourceRecords = [...yearSourceRecords, ...historicalGroups.flat()];
        sourceYears = getCompleteYearsFromRecords(yearSourceRecords, yearCount);
      }
      if (sourceYears.length < yearCount && classMap.size) {
        const classGroups = await Promise.all(Array.from(classMap.values()).map(filters =>
          Promise.all([
            safeFetchFilteredRecords(CONFIG.API.GEMEL_2023_RESOURCE_ID, filters),
            safeFetchFilteredRecords(CONFIG.API.GEMEL_1999_2022_RESOURCE_ID, filters)
          ]).then(([hist2023, hist1999]) => [...hist2023, ...hist1999])
        ));
        yearSourceRecords = [...yearSourceRecords, ...classGroups.flat()];
        sourceYears = getCompleteYearsFromRecords(yearSourceRecords, yearCount);
      }

      records = dedupeRecordsByFundAndPeriod([
        ...currentFundRecords,
        ...directFundHistory,
        ...historicalGroups.flat()
      ]);

      if (sourceYears.length < yearCount) {
        const [fullHist2023, fullHist1999] = await Promise.all([
          fetchDatastoreRecords(CONFIG.API.GEMEL_2023_RESOURCE_ID),
          fetchDatastoreRecords(CONFIG.API.GEMEL_1999_2022_RESOURCE_ID)
        ]);
        const fullFundHistory = [...fullHist2023, ...fullHist1999]
          .filter(record => fundIds.has(String(record.FUND_ID || '')));
        yearSourceRecords = [
          ...yearSourceRecords,
          ...fullFundHistory
        ];
        records = dedupeRecordsByFundAndPeriod([
          ...records,
          ...fullFundHistory
        ]);
      }
    }

    records = records.filter(record => fundIds.has(String(record.FUND_ID || '')));

    const completeYears = getCompleteYearsFromRecords(yearSourceRecords.length ? yearSourceRecords : records, 20)
      .filter(year => !latestAnnualYear || year <= latestAnnualYear);
    const displayYearCount = yearCount > 5
      ? Math.min(10, Math.max(5, completeYears.length))
      : 5;
    const years = latestAnnualYear
      ? Array.from({ length: displayYearCount }, (_, index) => latestAnnualYear - index)
      : completeYears.slice(0, displayYearCount);
    const canExpandTo10 = completeYears.length > 5;

    const expectedByYear = new Map(years.map(year => [
      year,
      Array.from({ length: 12 }, (_, index) => (year * 100) + index + 1)
    ]));
    const byFund = new Map();

    records.forEach(record => {
      const fundId = String(record.FUND_ID || '');
      const period = Number(record.REPORT_PERIOD);
      if (!fundId || !period) return;
      if (!byFund.has(fundId)) byFund.set(fundId, new Map());
      byFund.get(fundId).set(period, record);
    });

    const yieldMap = new Map();
    fundIds.forEach(fundId => {
      const periodMap = byFund.get(fundId) || new Map();
      const fundYears = new Map();
      years.forEach(year => {
        let compound = 1;
        for (const period of expectedByYear.get(year)) {
          const monthlyYield = parseFloat(periodMap.get(period)?.MONTHLY_YIELD);
          if (isNaN(monthlyYield)) {
            fundYears.set(year, null);
            return;
          }
          compound *= (1 + monthlyYield / 100);
        }
        fundYears.set(year, (compound - 1) * 100);
      });
      yieldMap.set(fundId, fundYears);
    });

    return { years, yieldMap, canExpandTo10 };
  }

  function getCompleteYearsFromRecords(records, yearCount) {
    const periodsByYear = new Map();
    (records || []).forEach(record => {
      const period = Number(record.REPORT_PERIOD);
      const year = Math.floor(period / 100);
      const month = period % 100;
      if (!year || month < 1 || month > 12) return;
      if (!periodsByYear.has(year)) periodsByYear.set(year, new Set());
      periodsByYear.get(year).add(period);
    });

    return Array.from(periodsByYear.entries())
      .filter(([, periods]) => periods.size === 12)
      .map(([year]) => year)
      .sort((a, b) => b - a)
      .slice(0, yearCount);
  }

  async function getActuarialComparison(categoryId, startPeriod, endPeriod, targetPopulation = '׳›׳׳ ׳”׳׳•׳›׳׳•׳¡׳™׳”') {
    const selectedPeriods = listPeriodsInRange(startPeriod, endPeriod);
    if (!selectedPeriods.length) return [];

    const selectedSet = new Set(selectedPeriods);
    const records = await getRangeEligibleRecords(categoryId, targetPopulation);
    const byCompany = new Map();
    const expectedSelectedPeriods = new Set();

    for (const record of records) {
      const period = Number(record.REPORT_PERIOD);
      const actuarialValue = parseFloat(record.ACTUARIAL_ADJUSTMENT);
      if (isNaN(actuarialValue)) continue;

      const companyName = getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION);
      if (String(companyName).includes('איילון')) continue;
      const companyKey = String(record.MANAGING_CORPORATION_LEGAL_ID || companyName);
      if (!byCompany.has(companyKey)) {
        byCompany.set(companyKey, {
          companyKey,
          companyName,
          legalId: record.MANAGING_CORPORATION_LEGAL_ID || null,
          periods: new Map()
        });
      }

      const companyEntry = byCompany.get(companyKey);
      if (!companyEntry.periods.has(period)) {
        companyEntry.periods.set(period, []);
      }
      companyEntry.periods.get(period).push(actuarialValue);
      if (selectedSet.has(period)) expectedSelectedPeriods.add(period);
    }

    return Array.from(byCompany.values()).map(company => {
      const periodRows = Array.from(company.periods.entries())
        .map(([period, values]) => ({
          period: Number(period),
          value: values.reduce((sum, value) => sum + value, 0) / values.length
        }))
        .sort((a, b) => a.period - b.period);

      const selectedRows = periodRows.filter(row => selectedSet.has(row.period));
      const totalAdjustment = selectedRows.length
        ? selectedRows.reduce((sum, row) => sum + row.value, 0)
        : null;
      const latestQuarter = periodRows[periodRows.length - 1] || null;
      const availableSelectedPeriods = selectedRows.length;
      const expectedSelectedCount = expectedSelectedPeriods.size;
      const noDataForSelectedRange = expectedSelectedCount > 0 && availableSelectedPeriods === 0;
      const partialRangeCoverage = expectedSelectedCount > 0 && availableSelectedPeriods > 0 && availableSelectedPeriods < expectedSelectedCount;
      const yearlyMap = new Map();
      let cumulative = 0;

      periodRows.forEach(row => {
        const year = Math.floor(row.period / 100);
        yearlyMap.set(year, (yearlyMap.get(year) || 0) + row.value);
      });

      const yearlyBreakdown = Array.from(yearlyMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([year, annualAdjustment]) => {
          cumulative += annualAdjustment;
          return {
            year,
            annualAdjustment,
            cumulativeAdjustment: cumulative
          };
        })
        .reverse();

      return {
        companyKey: company.companyKey,
        companyName: company.companyName,
        legalId: company.legalId,
        totalAdjustment,
        latestQuarterPeriod: latestQuarter ? latestQuarter.period : null,
        availableSelectedPeriods,
        expectedSelectedCount,
        noDataForSelectedRange,
        partialRangeCoverage,
        yearlyBreakdown
      };
    });
  }

  async function getAllSearchablePension() {
    const allRaw = await fetchPensionData();
    let records  = getLatestRecords(allRaw);
    records = filterByAllowedProviders(records);
    records = filterLatestPeriodOnly(records);
    return records;
  }

  async function getAllSearchablePolisa() {
    const allRaw = await fetchPolisaData();
    let records  = getLatestRecords(allRaw);
    records = filterByAllowedProviders(records);
    records = records.filter(r => !_isPolisaExcluded(r.FUND_NAME));
    records = records.filter(r => !(r.FUND_NAME || '').includes('בניהול אישי'));
    records = filterLatestPeriodOnly(records);
    return records;
  }

  // ─── חשב תשואה מצטברת 12 חודשים לכל קרן ──────────────────
  // מחזיר Map<FUND_ID_str, number|null>  (null = אין מספיק נתונים)
  let _cached12M = null;
  async function get12MYields() {
    if (_cached12M) return _cached12M;
    const allRaw = await fetchCurrentGemelData();

    // קבץ לפי FUND_ID, מיין לפי REPORT_PERIOD יורד
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }

    _cached12M = new Map();
    byFund.forEach((recs, id) => {
      // מיון מהחדש לישן
      recs.sort((a, b) => Number(b.REPORT_PERIOD) - Number(a.REPORT_PERIOD));
      const last12 = recs.slice(0, 12);
      if (last12.length < 12) {
        _cached12M.set(id, null);   // אין 12 חודשים
        return;
      }
      // תשואה מורכבת: (1+m1/100)*(1+m2/100)*...*1 − 1
      let compound = 1;
      let valid = true;
      for (const r of last12) {
        const m = parseFloat(r.MONTHLY_YIELD);
        if (isNaN(m)) { valid = false; break; }
        compound *= (1 + m / 100);
      }
      _cached12M.set(id, valid ? (compound - 1) * 100 : null);
    });

    return _cached12M;
  }

  // ─── תשואה מצטברת 12 חודשים — פוליסות חיסכון ──────────────────
  let _cached12MPolisa = null;
  async function get12MYieldsPolisa() {
    if (_cached12MPolisa) return _cached12MPolisa;
    const allRaw = await fetchPolisaData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cached12MPolisa = new Map();
    byFund.forEach((recs, id) => {
      recs.sort((a, b) => Number(b.REPORT_PERIOD) - Number(a.REPORT_PERIOD));
      const last12 = recs.slice(0, 12);
      if (last12.length < 12) { _cached12MPolisa.set(id, null); return; }
      let compound = 1, valid = true;
      for (const r of last12) {
        const m = parseFloat(r.MONTHLY_YIELD);
        if (isNaN(m)) { valid = false; break; }
        compound *= (1 + m / 100);
      }
      _cached12MPolisa.set(id, valid ? (compound - 1) * 100 : null);
    });
    return _cached12MPolisa;
  }

  // ─── ממוצע תשואה חודשית 6 חודשים אחרונים (task 12: מומנטום קצר-טווח) ──
  let _cached6M = null;
  async function get6MAvgYields() {
    if (_cached6M) return _cached6M;
    const allRaw = await fetchCurrentGemelData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cached6M = new Map();
    byFund.forEach((recs, id) => {
      const vals = getLatestDistinctMonthlyYields(recs, 6);
      if (!vals) { _cached6M.set(id, null); return; }
      // תשואה צבורה (ריבית דריבית) — נכון פיננסית יותר מממוצע פשוט
      _cached6M.set(id, compoundMonthlyYields(vals));
    });
    return _cached6M;
  }

  // ─── חשב Sharpe ratio לכל קרן ────────────────────────────
  // Sharpe = (mean monthly return / std monthly return) * sqrt(12)
  // מחזיר Map<FUND_ID_str, number|null>
  let _cachedSharpe = null;
  async function getAllSharpeRatios() {
    if (_cachedSharpe) return _cachedSharpe;
    const allRaw = await fetchCurrentGemelData();

    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }

    _cachedSharpe = new Map();
    byFund.forEach((recs, id) => {
      const vals = recs.map(r => parseFloat(r.MONTHLY_YIELD)).filter(v => !isNaN(v));
      if (vals.length < 6) { _cachedSharpe.set(id, null); return; }
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance);
      _cachedSharpe.set(id, std > 0 ? (mean / std) * Math.sqrt(12) : null);
    });

    return _cachedSharpe;
  }

  // ─── % חודשים חיוביים לכל קרן (לחישוב עקביות במומנטום) ────────
  // מחזיר Map<FUND_ID_str, number|null>  (0–100)
  let _cachedConsistency = null;
  async function getConsistencyMap() {
    if (_cachedConsistency) return _cachedConsistency;
    const allRaw = await fetchCurrentGemelData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedConsistency = new Map();
    byFund.forEach((recs, id) => {
      const vals = recs.map(r => parseFloat(r.MONTHLY_YIELD)).filter(v => !isNaN(v));
      if (!vals.length) { _cachedConsistency.set(id, null); return; }
      _cachedConsistency.set(id, vals.filter(v => v > 0).length / vals.length * 100);
    });
    return _cachedConsistency;
  }

  // ─── סטיית תקן שנתית לגמל ─────────────────────────────────────
  let _cachedStdDev = null;
  async function getStdDevMap() {
    if (_cachedStdDev) return _cachedStdDev;
    const allRaw = await fetchCurrentGemelData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedStdDev = new Map();
    byFund.forEach((recs, id) => {
      const vals = recs.map(r => parseFloat(r.MONTHLY_YIELD)).filter(v => !isNaN(v));
      if (vals.length < 6) { _cachedStdDev.set(id, null); return; }
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      _cachedStdDev.set(id, Math.sqrt(variance) * Math.sqrt(12));
    });
    return _cachedStdDev;
  }

  // ─── מומנטום (תשואה מצטברת 6 חודשים) לגמל ───────────────────────
  let _cachedMomentum = null;
  async function getMomentumMap() {
    if (_cachedMomentum) return _cachedMomentum;
    const allRaw = await fetchCurrentGemelData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedMomentum = new Map();
    byFund.forEach((recs, id) => {
      const vals = getLatestDistinctMonthlyYields(recs, 6);
      _cachedMomentum.set(id, vals ? compoundMonthlyYields(vals) : null);
    });
    return _cachedMomentum;
  }

  // ─── שארפ / עקביות / סטיית תקן / מומנטום לפוליסות ──────────────
  let _cachedSharpe_polisa = null;
  async function getAllSharpeRatiosPolisa() {
    if (_cachedSharpe_polisa) return _cachedSharpe_polisa;
    const allRaw = await fetchPolisaData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedSharpe_polisa = new Map();
    byFund.forEach((recs, id) => {
      const vals = recs.map(r => parseFloat(r.MONTHLY_YIELD)).filter(v => !isNaN(v));
      if (vals.length < 6) { _cachedSharpe_polisa.set(id, null); return; }
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance);
      _cachedSharpe_polisa.set(id, std > 0 ? (mean / std) * Math.sqrt(12) : null);
    });
    return _cachedSharpe_polisa;
  }

  let _cachedConsistency_polisa = null;
  async function getConsistencyMapPolisa() {
    if (_cachedConsistency_polisa) return _cachedConsistency_polisa;
    const allRaw = await fetchPolisaData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedConsistency_polisa = new Map();
    byFund.forEach((recs, id) => {
      const vals = recs.map(r => parseFloat(r.MONTHLY_YIELD)).filter(v => !isNaN(v));
      if (!vals.length) { _cachedConsistency_polisa.set(id, null); return; }
      _cachedConsistency_polisa.set(id, vals.filter(v => v > 0).length / vals.length * 100);
    });
    return _cachedConsistency_polisa;
  }

  let _cachedStdDev_polisa = null;
  async function getStdDevMapPolisa() {
    if (_cachedStdDev_polisa) return _cachedStdDev_polisa;
    const allRaw = await fetchPolisaData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedStdDev_polisa = new Map();
    byFund.forEach((recs, id) => {
      const vals = recs.map(r => parseFloat(r.MONTHLY_YIELD)).filter(v => !isNaN(v));
      if (vals.length < 6) { _cachedStdDev_polisa.set(id, null); return; }
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      _cachedStdDev_polisa.set(id, Math.sqrt(variance) * Math.sqrt(12));
    });
    return _cachedStdDev_polisa;
  }

  let _cachedMomentum_polisa = null;
  async function getMomentumMapPolisa() {
    if (_cachedMomentum_polisa) return _cachedMomentum_polisa;
    const allRaw = await fetchPolisaData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedMomentum_polisa = new Map();
    byFund.forEach((recs, id) => {
      const vals = getLatestDistinctMonthlyYields(recs, 6);
      _cachedMomentum_polisa.set(id, vals ? compoundMonthlyYields(vals) : null);
    });
    return _cachedMomentum_polisa;
  }

  // ─── ממוצע תשואה חודשית של המתחרים לפי REPORT_PERIOD ────────
  // מחזיר Map<REPORT_PERIOD_string, avgMonthlyYield>
  // כולל כל הרשומות ההיסטוריות (לא רק האחרונה), מוחרג FUND_ID נוכחי
  // גמל: fast path — מסנן ב-API לפי FUND_CLASSIFICATION+SUB_SPECIALIZATION (הרבה פחות נתונים)
  async function getTrackPeersMonthlyAvg(fundId, catId) {
    // בדוק cache מ-localStorage תחילה (Map נשמר כ-array של entries)
    const lsKey = `gemelhub_pavg_v1_${catId}_${fundId}`;
    const cachedArr = _lsLoad(lsKey);
    if (cachedArr) return new Map(cachedArr);

    const cat       = catId ? CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId) : null;
    const isPension = !!(cat && cat.pensionAPI);
    const isPolisa  = !!(cat && cat.polisaAPI);

    let allRaw;
    if (isPension) {
      // pension: שלוף את כל הנתונים ההיסטוריים (3 resources ידועים עם schema תקין)
      // cache ב-localStorage מבטיח שביקור שני יהיה מיידי
      allRaw = await fetchPensionHistoricalRangeData();
    } else if (isPolisa) {
      // polisa: שלוף את כל הנתונים ההיסטוריים
      allRaw = await fetchPolisaHistoricalRangeData();
    } else {
      // גמל — fast path: שלוף רק נתוני המסלול הרלוונטי (מסנן ב-API לפי cls+subSpec)
      const currentData = await fetchCurrentGemelData(); // כבר ב-cache
      const latestRec   = getLatestRecords(currentData).find(r => String(r.FUND_ID) === String(fundId));
      if (!latestRec) return new Map();

      const cls     = (latestRec.FUND_CLASSIFICATION || '').trim();
      const subSpec = (latestRec.SUB_SPECIALIZATION   || '').trim();
      const trackFilters = { FUND_CLASSIFICATION: cls, SUB_SPECIALIZATION: subSpec, TARGET_POPULATION: 'כלל האוכלוסיה' };

      const [hist2023, hist9922] = await Promise.all([
        fetchFilteredRecords(CONFIG.API.GEMEL_2023_RESOURCE_ID,      trackFilters),
        fetchFilteredRecords(CONFIG.API.GEMEL_1999_2022_RESOURCE_ID, trackFilters)
      ]);

      allRaw = dedupeRecordsByFundAndPeriod([
        ...currentData.filter(r =>
          (r.FUND_CLASSIFICATION || '').trim() === cls &&
          (r.SUB_SPECIALIZATION   || '').trim() === subSpec &&
          (r.TARGET_POPULATION    || '').trim() === 'כלל האוכלוסיה'
        ),
        ...hist2023,
        ...hist9922
      ]);
    }

    // מצא את הרשומה האחרונה של הקרן כדי לדעת לאיזה מסלול היא שייכת
    const latestRec = allRaw
      .filter(r => String(r.FUND_ID) === String(fundId))
      .sort((a, b) => Number(b.REPORT_PERIOD) - Number(a.REPORT_PERIOD))[0];
    if (!latestRec) return new Map();

    const cls = (latestRec.FUND_CLASSIFICATION || '');

    // מצא את המסלול המתאים — חפש רק בתוך מסלולי הקטגוריה הנוכחית
    const catTrackIds2 = cat && cat.trackList ? new Set(cat.trackList) : null;
    const tracksToSearch2 = catTrackIds2
      ? CONFIG.INVESTMENT_TRACKS.filter(t => catTrackIds2.has(t.id))
      : CONFIG.INVESTMENT_TRACKS;
    let matchedTrack = null;
    for (const track of tracksToSearch2) {
      if (matchTrackBySubSpec(latestRec, track)) { matchedTrack = track; break; }
    }

    const subMatch = matchedTrack
      ? (r) => matchTrackBySubSpec(r, matchedTrack)
      : (r) => (r.SUB_SPECIALIZATION || '').trim().toLowerCase() ===
               (latestRec.SUB_SPECIALIZATION || '').trim().toLowerCase();

    // סנן: יצרנים מורשים, אותו מסלול, אותה קלאסיפיקציה, ללא הקרן הנוכחית
    const peers = allRaw.filter(r =>
      String(r.FUND_ID) !== String(fundId) &&
      isProviderAllowed(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION) &&
      !(r.FUND_NAME || '').includes('בניהול אישי') &&
      !(isPolisa && _isPolisaExcluded(r.FUND_NAME)) &&
      (!isPension && !isPolisa ? (r.TARGET_POPULATION || '') === 'כלל האוכלוסיה' : true) &&
      (r.FUND_CLASSIFICATION || '') === cls &&
      subMatch(r)
    );

    // קבץ לפי REPORT_PERIOD → חשב ממוצע MONTHLY_YIELD
    const byPeriod = new Map();
    for (const r of peers) {
      const p = String(r.REPORT_PERIOD);
      const v = parseFloat(r.MONTHLY_YIELD);
      if (isNaN(v)) continue;
      if (!byPeriod.has(p)) byPeriod.set(p, []);
      byPeriod.get(p).push(v);
    }

    const avgMap = new Map();
    byPeriod.forEach((vals, period) => {
      avgMap.set(period, parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(3)));
    });

    // שמור ב-localStorage לביקור הבא (Map → array של entries)
    _lsSave(lsKey, [...avgMap.entries()]);
    return avgMap;
  }

  // ─── קבל היסטוריה מלאה לקרן בודדת ──────────────────────────
  // מסנן לפי FUND_ID ישירות ב-API + cache ב-localStorage (ביקור שני = מיידי)
  async function getFundHistory(fundId, catId) {
    // בדוק cache מ-localStorage תחילה
    const lsKey = `gemelhub_hist_v1_${catId}_${fundId}`;
    const cached = _lsLoad(lsKey);
    if (cached) return cached;

    const cat       = catId ? CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId) : null;
    const isPension = !!(cat && cat.pensionAPI);
    const isPolisa  = !!(cat && cat.polisaAPI);

    const fundFilter = { FUND_ID: String(fundId) };
    let result;

    if (isPension) {
      // pension: משתמש ב-fetchPensionHistoricalRangeData שמשלב 3 resources בוודאות
      const allRaw = await fetchPensionHistoricalRangeData();
      result = allRaw
        .filter(r => String(r.FUND_ID) === String(fundId))
        .sort((a, b) => Number(a.REPORT_PERIOD) - Number(b.REPORT_PERIOD));
    } else if (isPolisa) {
      // polisa: משתמש ב-fetchPolisaHistoricalRangeData שמשלב 3 resources בוודאות
      const allRaw = await fetchPolisaHistoricalRangeData();
      result = allRaw
        .filter(r => String(r.FUND_ID) === String(fundId))
        .sort((a, b) => Number(a.REPORT_PERIOD) - Number(b.REPORT_PERIOD));
    } else {
      // גמל
      const [current, hist2023, hist9922] = await Promise.all([
        fetchCurrentGemelData(),                                              // כבר ב-cache משלב 1
        fetchFilteredRecords(CONFIG.API.GEMEL_2023_RESOURCE_ID,      fundFilter),
        fetchFilteredRecords(CONFIG.API.GEMEL_1999_2022_RESOURCE_ID, fundFilter)
      ]);
      result = dedupeRecordsByFundAndPeriod([
        ...current.filter(r => String(r.FUND_ID) === String(fundId)),
        ...hist2023, ...hist9922
      ]).sort((a, b) => Number(a.REPORT_PERIOD) - Number(b.REPORT_PERIOD));
    }

    _lsSave(lsKey, result);
    return result;
  }

  // ─── קבל נתונים להשוואה: כל קרנות באותו מסלול ──────────────
  // מסנן בדיוק כמו getOrganizedData: subSpecializationKeys מהקונפיג + יצרנים מורשים
  async function getTrackPeers(fundId, catId) {
    const cat      = catId ? CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId) : null;
    const isPension = !!(cat && cat.pensionAPI);
    const isPolisa  = !!(cat && cat.polisaAPI);
    const allRaw   = isPension ? await fetchPensionData() : isPolisa ? await fetchPolisaData() : await fetchCurrentGemelData();
    let latest     = getLatestRecords(allRaw);
    const fund     = latest.find(r => String(r.FUND_ID) === String(fundId));
    if (!fund) return [];

    const fundSub = (fund.SUB_SPECIALIZATION || '').trim();
    const cls     = (fund.FUND_CLASSIFICATION || '');

    // מצא את המסלול מהקונפיג שתואם לקרן — חפש רק בתוך מסלולי הקטגוריה הנוכחית
    const catTrackIds = cat && cat.trackList ? new Set(cat.trackList) : null;
    const tracksToSearch = catTrackIds
      ? CONFIG.INVESTMENT_TRACKS.filter(t => catTrackIds.has(t.id))
      : CONFIG.INVESTMENT_TRACKS;
    let matchedTrack = null;
    for (const track of tracksToSearch) {
      if (matchTrackBySubSpec(fund, track)) {
        matchedTrack = track;
        break;
      }
    }

    const subMatch = matchedTrack
      ? (r) => matchTrackBySubSpec(r, matchedTrack)
      : (r) => (r.SUB_SPECIALIZATION || '').trim().toLowerCase() === fundSub.toLowerCase();

    // סנן בדיוק כמו getOrganizedData
    let peers = latest.filter(r =>
      isProviderAllowed(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION) &&
      !(r.FUND_NAME || '').includes('בניהול אישי') &&
      !(isPolisa && _isPolisaExcluded(r.FUND_NAME)) &&
      (!isPension && !isPolisa ? (r.TARGET_POPULATION || '') === 'כלל האוכלוסיה' : true) &&
      (r.FUND_CLASSIFICATION || '') === cls &&
      subMatch(r)
    );

    // החל excludedFundIds של הקטגוריה
    if (cat && cat.excludedFundIds && cat.excludedFundIds.length) {
      const excl = new Set(cat.excludedFundIds.map(String));
      peers = peers.filter(r => !excl.has(String(r.FUND_ID)));
    }

    // סנן לתקופת דיווח אחרונה בלבד
    peers = filterLatestPeriodOnly(peers);

    const yields12M = isPension
      ? await get12MYieldsPension()
      : isPolisa
        ? await get12MYieldsPolisa()
        : await get12MYields();
    return peers.sort((a, b) =>
      ((yields12M.get(String(b.FUND_ID)) ?? -9999) - (yields12M.get(String(a.FUND_ID)) ?? -9999))
    );
  }

  // ─── תשואה 12M לפנסיה ─────────────────────────────────────────
  let _cached12M_pension = null;
  async function get12MYieldsPension() {
    if (_cached12M_pension) return _cached12M_pension;
    const allRaw = await fetchPensionData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cached12M_pension = new Map();
    byFund.forEach((recs, id) => {
      recs.sort((a, b) => Number(b.REPORT_PERIOD) - Number(a.REPORT_PERIOD));
      const last12 = recs.slice(0, 12);
      if (last12.length < 12) { _cached12M_pension.set(id, null); return; }
      const vals = last12.map(r => parseFloat(r.MONTHLY_YIELD) / 100);
      const valid = vals.every(v => !isNaN(v));
      if (!valid) { _cached12M_pension.set(id, null); return; }
      const compound = vals.reduce((acc, v) => acc * (1 + v), 1);
      _cached12M_pension.set(id, (compound - 1) * 100);
    });
    return _cached12M_pension;
  }

  // ─── ממוצע 6 חודשים לפנסיה ─────────────────────────────────────
  let _cached6M_pension = null;
  async function get6MAvgYieldsPension() {
    if (_cached6M_pension) return _cached6M_pension;
    const allRaw = await fetchPensionData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cached6M_pension = new Map();
    byFund.forEach((recs, id) => {
      const vals = getLatestDistinctMonthlyYields(recs, 6);
      if (!vals) { _cached6M_pension.set(id, null); return; }
      // תשואה צבורה (ריבית דריבית)
      _cached6M_pension.set(id, compoundMonthlyYields(vals));
    });
    return _cached6M_pension;
  }

  // ─── Sharpe לפנסיה ──────────────────────────────────────────────
  let _cachedSharpe_pension = null;
  async function getAllSharpeRatiosPension() {
    if (_cachedSharpe_pension) return _cachedSharpe_pension;
    const allRaw = await fetchPensionData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedSharpe_pension = new Map();
    byFund.forEach((recs, id) => {
      const vals = recs.map(r => parseFloat(r.MONTHLY_YIELD)).filter(v => !isNaN(v));
      if (vals.length < 6) { _cachedSharpe_pension.set(id, null); return; }
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance);
      _cachedSharpe_pension.set(id, std > 0 ? (mean / std) * Math.sqrt(12) : null);
    });
    return _cachedSharpe_pension;
  }

  // ─── עקביות לפנסיה ──────────────────────────────────────────────
  let _cachedConsistency_pension = null;
  async function getConsistencyMapPension() {
    if (_cachedConsistency_pension) return _cachedConsistency_pension;
    const allRaw = await fetchPensionData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedConsistency_pension = new Map();
    byFund.forEach((recs, id) => {
      const vals = recs.map(r => parseFloat(r.MONTHLY_YIELD)).filter(v => !isNaN(v));
      if (!vals.length) { _cachedConsistency_pension.set(id, null); return; }
      _cachedConsistency_pension.set(id, vals.filter(v => v > 0).length / vals.length * 100);
    });
    return _cachedConsistency_pension;
  }

  // ─── סטיית תקן שנתית לפנסיה ─────────────────────────────────────
  let _cachedStdDev_pension = null;
  async function getStdDevMapPension() {
    if (_cachedStdDev_pension) return _cachedStdDev_pension;
    const allRaw = await fetchPensionData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedStdDev_pension = new Map();
    byFund.forEach((recs, id) => {
      const vals = recs.map(r => parseFloat(r.MONTHLY_YIELD)).filter(v => !isNaN(v));
      if (vals.length < 6) { _cachedStdDev_pension.set(id, null); return; }
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      _cachedStdDev_pension.set(id, Math.sqrt(variance) * Math.sqrt(12));
    });
    return _cachedStdDev_pension;
  }

  // ─── מומנטום (תשואה מצטברת 6 חודשים) לפנסיה ─────────────────────
  let _cachedMomentum_pension = null;
  async function getMomentumMapPension() {
    if (_cachedMomentum_pension) return _cachedMomentum_pension;
    const allRaw = await fetchPensionData();
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }
    _cachedMomentum_pension = new Map();
    byFund.forEach((recs, id) => {
      const vals = getLatestDistinctMonthlyYields(recs, 6);
      _cachedMomentum_pension.set(id, vals ? compoundMonthlyYields(vals) : null);
    });
    return _cachedMomentum_pension;
  }

  // ─── פער מצטבר (ריבית דריבית) של כל קופה במסלול ביחס לממוצע ─
  // מחזיר Array<{fundId, ctrl, mgmt, cumGap, abovePct, monthsValid, isMe}>
  // ממוין מהגבוה לנמוך לפי cumGap
  // משתמש בנתונים שכבר cached מ-getTrackPeersMonthlyAvg — מהיר
  async function getTrackPeersCumGaps(fundId, catId) {
    const lsKey = `gemelhub_pcg_v3_${catId}_${fundId}`;
    const cached = _lsLoad(lsKey);
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;

    // ── שלב 1: קבל FUND_IDs מהטבלה הראשית — מקור האמת ──
    // getTrackPeers מיישם בדיוק את כל הפילטרים (excludedFundIds, filterLatestPeriodOnly וכו')
    const trackPeers = await getTrackPeers(fundId, catId);
    const peerIdSet  = new Set(trackPeers.map(r => String(r.FUND_ID)));
    const allowedIds = new Set([...peerIdSet, String(fundId)]);
    if (peerIdSet.size === 0) return [];

    const cat       = catId ? CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId) : null;
    const isPension = !!(cat && cat.pensionAPI);
    const isPolisa  = !!(cat && cat.polisaAPI);

    // ── שלב 2: שאב היסטוריה (cache hit אחרי Phase 2) ──
    let allRaw;
    if (isPension) {
      allRaw = await fetchPensionHistoricalRangeData();
    } else if (isPolisa) {
      allRaw = await fetchPolisaHistoricalRangeData();
    } else {
      const currentData = await fetchCurrentGemelData();
      const lr = getLatestRecords(currentData).find(r => String(r.FUND_ID) === String(fundId));
      if (!lr) return [];
      const cls2    = (lr.FUND_CLASSIFICATION || '').trim();
      const subSpec = (lr.SUB_SPECIALIZATION   || '').trim();
      const tf = { FUND_CLASSIFICATION: cls2, SUB_SPECIALIZATION: subSpec, TARGET_POPULATION: 'כלל האוכלוסיה' };
      const [h23, h99] = await Promise.all([
        fetchFilteredRecords(CONFIG.API.GEMEL_2023_RESOURCE_ID,      tf),
        fetchFilteredRecords(CONFIG.API.GEMEL_1999_2022_RESOURCE_ID, tf)
      ]);
      allRaw = dedupeRecordsByFundAndPeriod([
        ...currentData.filter(r =>
          (r.FUND_CLASSIFICATION || '').trim() === cls2 &&
          (r.SUB_SPECIALIZATION   || '').trim() === subSpec &&
          (r.TARGET_POPULATION    || '').trim() === 'כלל האוכלוסיה'
        ),
        ...h23, ...h99
      ]);
    }

    if (!allRaw || !allRaw.length) return [];

    // ── שלב 3: חשב ממוצע חודשי רק מ-peers מהטבלה (בלי הקופה הנוכחית) ──
    const byPeriod = new Map();
    for (const r of allRaw) {
      if (!peerIdSet.has(String(r.FUND_ID))) continue;
      const p = String(r.REPORT_PERIOD);
      const v = parseFloat(r.MONTHLY_YIELD);
      if (isNaN(v) || !p) continue;
      if (!byPeriod.has(p)) byPeriod.set(p, []);
      byPeriod.get(p).push(v);
    }
    const avgMap = new Map();
    byPeriod.forEach((vals, p) => avgMap.set(p, vals.reduce((s,v)=>s+v,0)/vals.length));

    const periods36 = [...avgMap.keys()].sort((a,b) => Number(b)-Number(a)).slice(0, 36);
    if (!periods36.length) return [];

    // ── שלב 4: קבץ היסטוריה רק לקופות מ-allowedIds (peers + הנוכחית) ──
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!allowedIds.has(id)) continue;
      const p = String(r.REPORT_PERIOD);
      if (!p) continue;
      if (!byFund.has(id)) byFund.set(id, new Map());
      byFund.get(id).set(p, r);
    }

    // ── שלב 5: חשב פער מצטבר (ריבית דריבית) לכל קופה ──
    const result = [];
    byFund.forEach((recMap, fId) => {
      const recs = [...recMap.values()];
      if (!recs.length) return;
      const latestR = recs.sort((a,b) => Number(b.REPORT_PERIOD)-Number(a.REPORT_PERIOD))[0];
      let myC = 1, peerC = 1, aboveCnt = 0, validCnt = 0;
      for (const p of periods36) {
        const rec   = recMap.get(p);
        const myY   = rec ? parseFloat(rec.MONTHLY_YIELD) : NaN;
        const peerY = avgMap.get(p);
        if (isNaN(myY) || peerY == null || isNaN(peerY)) continue;
        validCnt++;
        myC   *= (1 + myY   / 100);
        peerC *= (1 + peerY / 100);
        if (myY > peerY) aboveCnt++;
      }
      if (validCnt < 6) return;
      result.push({
        fundId:      fId,
        ctrl:        latestR.CONTROLLING_CORPORATION || '',
        mgmt:        latestR.MANAGING_CORPORATION    || '',
        name:        latestR.FUND_NAME               || '',
        cumGap:      (myC - peerC) * 100,
        abovePct:    Math.round(aboveCnt / validCnt * 100),
        monthsValid: validCnt,
        isMe:        fId === String(fundId)
      });
    });

    result.sort((a,b) => b.cumGap - a.cumGap);
    _lsSave(lsKey, result);
    return result;
  }

  async function getTrackPeersNetDeposits(fundId, catId) {
    const lsKey = `gemelhub_netdep12_v1_${catId}_${fundId}`;
    const cached = _lsLoad(lsKey);
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;

    const trackPeers = await getTrackPeers(fundId, catId);
    const allowedIds = new Set(trackPeers.map(r => String(r.FUND_ID)));
    allowedIds.add(String(fundId));
    if (!allowedIds.size) return [];

    const cat       = catId ? CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId) : null;
    const isPension = !!(cat && cat.pensionAPI);
    const isPolisa  = !!(cat && cat.polisaAPI);

    let allRaw;
    if (isPension) {
      allRaw = await fetchPensionHistoricalRangeData();
    } else if (isPolisa) {
      allRaw = await fetchPolisaHistoricalRangeData();
    } else {
      const currentData = await fetchCurrentGemelData();
      const lr = getLatestRecords(currentData).find(r => String(r.FUND_ID) === String(fundId));
      if (!lr) return [];
      const cls2    = (lr.FUND_CLASSIFICATION || '').trim();
      const subSpec = (lr.SUB_SPECIALIZATION   || '').trim();
      const tf = { FUND_CLASSIFICATION: cls2, SUB_SPECIALIZATION: subSpec, TARGET_POPULATION: 'כלל האוכלוסיה' };
      const [h23, h99] = await Promise.all([
        fetchFilteredRecords(CONFIG.API.GEMEL_2023_RESOURCE_ID,      tf),
        fetchFilteredRecords(CONFIG.API.GEMEL_1999_2022_RESOURCE_ID, tf)
      ]);
      allRaw = dedupeRecordsByFundAndPeriod([
        ...currentData.filter(r =>
          (r.FUND_CLASSIFICATION || '').trim() === cls2 &&
          (r.SUB_SPECIALIZATION   || '').trim() === subSpec &&
          (r.TARGET_POPULATION    || '').trim() === 'כלל האוכלוסיה'
        ),
        ...h23, ...h99
      ]);
    }

    if (!allRaw || !allRaw.length) return [];

    const peerMeta = new Map(trackPeers.map(r => [String(r.FUND_ID), r]));
    const byFund = new Map();
    for (const r of allRaw) {
      const id = String(r.FUND_ID);
      if (!allowedIds.has(id)) continue;
      if (!byFund.has(id)) byFund.set(id, []);
      byFund.get(id).push(r);
    }

    const result = [];
    byFund.forEach((records, fId) => {
      const sorted = records
        .filter(r => r.REPORT_PERIOD)
        .sort((a, b) => Number(b.REPORT_PERIOD) - Number(a.REPORT_PERIOD));
      const last12 = sorted.slice(0, 12);
      const valid = last12
        .map(r => parseFloat(r.NET_MONTHLY_DEPOSITS))
        .filter(v => !isNaN(v));
      if (!valid.length) return;
      const latestR = peerMeta.get(fId) || sorted[0] || {};
      result.push({
        fundId: fId,
        ctrl: latestR.CONTROLLING_CORPORATION || '',
        mgmt: latestR.MANAGING_CORPORATION    || '',
        name: latestR.FUND_NAME               || '',
        totalNetDeposits: valid.reduce((sum, v) => sum + v, 0),
        monthsValid: valid.length,
        startPeriod: last12.length ? Number(last12[last12.length - 1].REPORT_PERIOD) : null,
        endPeriod: last12.length ? Number(last12[0].REPORT_PERIOD) : null,
        isMe: fId === String(fundId)
      });
    });

    result.sort((a, b) => b.totalNetDeposits - a.totalNetDeposits);
    _lsSave(lsKey, result);
    return result;
  }

  // ─── רשומה עדכנית לקופה בודדת (ללא היסטוריה) ───────────────
  async function getFundLatestRecord(fundId, catId) {
    const cat       = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId);
    const isPension = !!(cat && cat.pensionAPI);
    const isPolisa  = !!(cat && cat.polisaAPI);
    const src = isPension ? await fetchPensionData()
              : isPolisa  ? await fetchPolisaData()
              : await fetchCurrentGemelData();
    return src
      .filter(r => String(r.FUND_ID) === String(fundId))
      .sort((a, b) => Number(b.REPORT_PERIOD) - Number(a.REPORT_PERIOD))[0] || null;
  }

  return {
    loadCachesFromLocalStorage,
    getFundLatestRecord,
    fetchAllData,
    fetchPensionData,
    getOrganizedData,
    computeAverage,
    getTop3,
    getAllSearchable,
    getAllSearchablePension,
    getAllSearchablePolisa,
    fetchPolisaData,
    getAvailableReportPeriods,
    getCustomRangeYields,
    getTrailing7Yields,
    getAnnualYearlyYields,
    getYearlyYieldsForFunds,
    getActuarialComparison,
    get12MYieldsPolisa,
    getFundHistory,
    getTrackPeers,
    getTrackPeersMonthlyAvg,
    get12MYields,
    get6MAvgYields,
    getAllSharpeRatios,
    getConsistencyMap,
    getStdDevMap,
    getMomentumMap,
    getAllSharpeRatiosPolisa,
    getConsistencyMapPolisa,
    getStdDevMapPolisa,
    getMomentumMapPolisa,
    get12MYieldsPension,
    get6MAvgYieldsPension,
    getAllSharpeRatiosPension,
    getConsistencyMapPension,
    getStdDevMapPension,
    getMomentumMapPension,
    getTrackPeersCumGaps,
    getTrackPeersNetDeposits
  };
})();
