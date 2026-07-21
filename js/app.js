// ==========================================
// APP MODULE - GemulHub Main Logic
// ==========================================

const App = (() => {

  // ─── State ───────────────────────────────────────────────────
  const state = {
    activeCategoryId: null,
    targetPopulation: 'כלל האוכלוסיה',
    selectedTracks:   new Set(),
    selectedProviders: new Set(),
    excludedProviders: new Set(),
    organizedData: [],
    searchableRecords: [],
    isHomePage: true,
    yields12M: null,         // Map<FUND_ID, number|null> — גמל
    yields12MPension: null,  // Map<FUND_ID, number|null> — פנסיה
    yields12MPolisa: null,   // Map<FUND_ID, number|null> — פוליסות חיסכון
    trailing7Y: { loading: false, categoryId: null, targetPopulation: null, map: null, requestId: 0, error: null },
    pendingTrackId: null,    // task 8: ניווט ישיר למסלול מדף הבית
    pendingTrackFocusOnly: false,
    pendingCompareTopScroll: false,
    pendingInitialTableTopScroll: false,
    pendingActuarialFundId: null,
    pendingActuarialCompanyName: null,
    pendingActuarialHighlightDone: false,
    compactTracksView: true,
    advancedOptionsOpen: false,
    displayOptionsOpen: false,
    displayOptions: {
      medalIcon: 'gold',
      loserIcon: 'tomato',
      winnerHighlightStyle: 'yellow',
      heatmap: false,
      topThree: true
    },
    sandbox: {
      selections: [],  // pending selections (up to 6), not yet in portfolio
      portfolio: [],   // saved portfolio items (persisted in localStorage)
      portfolioName: '',
      isDirty: false, // true when a named portfolio has unsaved edits — name stays put, save button pulses instead
      autoSaveId: null, // id of the saved-portfolios list entry mirroring the current working portfolio, if any
      compareItems: null,
      returnsMenuOpen: false,
      selectedReturnFields: ['monthly', 'ytd', '12m', '3y']
    }
  };
  const ADVANCED_OPTIONS_STORAGE_KEY = 'gemelhubAdvancedOptionsOpenV3';
  const DISPLAY_OPTIONS_STORAGE_KEY = 'gemelhubDisplayOptionsV3';
  const FILTER_STATE_STORAGE_KEY = 'gemelhub_filter_state_v1';
  const DEFAULT_TARGET_POPULATION = 'כלל האוכלוסיה';
  const SANDBOX_STORAGE_KEY = 'gemelhub_sandbox_portfolio_v1';
  const SANDBOX_SELECTIONS_KEY = 'gemelhub_sandbox_selections_v1';
  const SANDBOX_NAME_KEY = 'gemelhub_sandbox_portfolio_name_v1';
  const SANDBOX_DIRTY_KEY = 'gemelhub_sandbox_dirty_v1';
  const SANDBOX_AUTOSAVE_ID_KEY = 'gemelhub_sandbox_autosave_id_v1';
  const SANDBOX_LAST_MOD_KEY = 'gemelhub_sandbox_last_modified_v1';
  const SANDBOX_RETURNS_FIELDS_KEY = 'gemelhub_sandbox_return_fields_v1';
  const ADVANCED_OPTIONS_AUTO_CLOSE_DELAY = 13000;
  const ADVANCED_OPTIONS_HOVER_TARGETS = [
    '#advanced-options-tab',
    '.title-search-bar',
    '#display-options-panel:not([hidden])',
    '#custom-range-panel:not([hidden])',
    '#sidebar:not(.sidebar-collapsed)',
    '#advanced-search-overlay:not([hidden])'
  ];
  const ADVANCED_OPTIONS_HOVER_SELECTOR = ADVANCED_OPTIONS_HOVER_TARGETS
    .map(selector => `${selector}:hover`)
    .join(',');
  const DEFAULT_DISPLAY_OPTIONS = Object.freeze({
    medalIcon: 'none',
    loserIcon: 'none',
    winnerHighlightStyle: 'none',
    heatmap: false,
    topThree: true
  });

  const REMOVED_CATEGORY_IDS = new Set(['removed_legacy_category']);

  const ghEscapeAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const ghIsSp500TrackLabel = (label) => /(?:s\s*&\s*p|sp)\s*500|500\s*(?:s\s*&\s*p|sp)/i.test(String(label || ''));
  const ghAllocationProfileFor = ({ stock, abroad, fx }) => {
    const parsePct = value => parseFloat(String(value ?? '').replace('%', ''));
    stock = parsePct(stock);
    abroad = parsePct(abroad);
    fx = parsePct(fx);
    const hasStock = Number.isFinite(stock);
    const hasAbroad = Number.isFinite(abroad);
    const hasFx = Number.isFinite(fx);
    if (hasStock && hasAbroad && hasFx && stock > 99 && abroad > 99 && fx > 99) return 'מסלול מחקה מדד חו״ל צמוד מט״ח';
    if (hasStock && hasAbroad && hasFx && stock > 75 && abroad < 5 && fx < 5) return 'מסלול מניות ישראלי';
    if (hasStock && hasAbroad && hasFx && stock > 75 && abroad > 75 && fx > 75) return 'מניות מוטה חו״ל צמוד מט״ח';
    if (hasStock && hasAbroad && hasFx && stock > 75 && abroad > 75 && fx < 20) return 'מניות מוטה חו״ל מנוטרל מטבע';
    if (hasStock && hasAbroad && hasFx && stock > 75 && abroad < 25 && fx < 25) return 'מניות מוטה ישראל';
    if (hasStock && hasAbroad && hasFx && stock === 0 && abroad > 75 && fx > 75) return 'אג״ח מוטה חו״ל צמוד מט״ח';
    if (hasStock && hasAbroad && hasFx && stock >= 10 && stock <= 25 && abroad < 25 && fx < 25) return 'אג״ח ומניות עד 25% מוטה ישראל';
    if (hasFx && fx < 20 && hasAbroad && abroad > 75) return 'חו״ל מנוטרל מטבע';
    if (hasAbroad && abroad > 75) return hasFx && fx > 75 ? 'חו״ל צמוד מט״ח' : 'חו״ל';
    if (hasAbroad && hasFx && abroad < 25 && fx < 25) return 'מוטה ישראל';
    if (hasFx && fx > 75) return 'צמוד מט״ח';
    return '';
  };
  const ghExposureFromRecord = (record = {}) => {
    const totalAssets = parseFloat(record.TOTAL_ASSETS) || 0;
    return {
      stock: calcExposurePercentValue(record.STOCK_MARKET_EXPOSURE, totalAssets),
      abroad: calcExposurePercentValue(record.FOREIGN_EXPOSURE, totalAssets),
      fx: calcExposurePercentValue(record.FOREIGN_CURRENCY_EXPOSURE, totalAssets)
    };
  };
  const ghExposureFromItem = (item = {}) => {
    const recordExposure = item.record ? ghExposureFromRecord(item.record) : {};
    return {
      stock: item.stock !== undefined && item.stock !== '' ? item.stock : recordExposure.stock,
      abroad: item.abroad !== undefined && item.abroad !== '' ? item.abroad : recordExposure.abroad,
      fx: item.fx !== undefined && item.fx !== '' ? item.fx : recordExposure.fx
    };
  };
  const ghAllocationProfileIcons = (profile, trackLabel = '') => {
    const text = String(profile || '');
    if (!text) return '';
    const flagIl = '<span class="table-allocation-flag-il" aria-hidden="true"><svg viewBox="0 0 30 20" focusable="false"><rect width="30" height="20" rx="2" fill="#fff"/><rect y="3" width="30" height="2.6" fill="#2563eb"/><rect y="14.4" width="30" height="2.6" fill="#2563eb"/><path d="M15 6.6l3.4 5.8H11.6L15 6.6z" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-linejoin="round"/><path d="M15 13.4L11.6 7.6h6.8L15 13.4z" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-linejoin="round"/></svg></span>';
    const icon = (src, cls) => `<span class="table-allocation-icon ${cls}" aria-hidden="true"><img src="${src}" alt="" loading="lazy" /></span>`;
    const icons = [];
    if (text.includes('אלוקציה שונה')) icons.push('<span class="table-allocation-warning" aria-hidden="true">⚠️</span>');
    if (text.includes('ישראלי') || text.includes('מוטה ישראל')) {
      icons.push(flagIl);
    } else if (text.includes('חו״ל')) {
      icons.push(ghIsSp500TrackLabel(trackLabel)
        ? icon('assets/allocation-us.png', 'table-allocation-icon-us')
        : icon('assets/allocation-abroad.png?v=20260530-2', 'table-allocation-icon-abroad'));
    }
    if (text.includes('צמוד מט״ח')) icons.push(icon('assets/allocation-fx.png', 'table-allocation-icon-fx'));
    if (text.includes('מנוטרל מטבע')) icons.push(icon('assets/allocation-shekel.png?v=20260605-2', 'table-allocation-icon-shekel'));
    return icons.length
      ? `<span class="table-allocation-icons" title="${ghEscapeAttr(text)}" aria-label="${ghEscapeAttr(text)}">${icons.join('')}</span>`
      : '';
  };

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
    const okevAgachManiot25FundIds = ['15258', '15351', '8684', '15290'];

    const agachSahar = byId('agach_sahar');
    if (agachSahar) {
      agachSahar.fundNameExcludes = Array.from(new Set([...(agachSahar.fundNameExcludes || []), '25%']));
    }

    const pensionAgachSahar = byId('pension_agach_sahar');
    if (pensionAgachSahar) {
      pensionAgachSahar.fundNameExcludes = Array.from(new Set([...(pensionAgachSahar.fundNameExcludes || []), '25%']));
    }

    const polisaAgachSahar = byId('polisa_agach_sahar');
    if (polisaAgachSahar) {
      polisaAgachSahar.fundNameExcludes = Array.from(new Set([...(polisaAgachSahar.fundNameExcludes || []), '25%']));
    }

    const okevAgach = byId('okev_agach');
    if (okevAgach) {
      okevAgach.fundIdExcludes = Array.from(new Set([...(okevAgach.fundIdExcludes || []), ...okevAgachManiot25FundIds]));
    }

    ensureTrack({
      id: 'agach_sahar_maniot25',
      label: 'אג"ח סחיר עד 25% במניות',
      subSpecializationKeys: ['אג"ח סחיר'],
      fundNameIncludes: ['25%']
    });

    ensureTrack({
      id: 'okev_agach_maniot25',
      label: 'עוקב מדדי אג"ח עד 25% במניות',
      subSpecializationKeys: ['עוקב מדדי אג"ח'],
      fundIds: okevAgachManiot25FundIds,
      fundNameIncludes: ['25%']
    });

    ensureTrack({
      id: 'pension_agach_sahar_maniot25',
      label: 'אג"ח סחיר עד 25% במניות',
      fundNameIncludes: ['אג"ח סחיר עד 25%', 'אגח סחיר עד 25%', 'אג"ח סחיר עד 25% במניות', 'אגח סחיר עד 25% במניות'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    });

    ensureTrack({
      id: 'polisa_agach_sahar_maniot25',
      label: 'אג"ח סחיר עד 25% במניות',
      fundNameIncludes: ['אג"ח סחיר עד 25%', 'אגח סחיר עד 25%', 'אג"ח סחיר עד 25% במניות', 'אגח סחיר עד 25% במניות'],
      fundNameExcludes: ['ממשלתי']
    });

    ['gemel_tagmulim', 'gemel_hashkaa', 'hashtalamot'].forEach(categoryId => {
      const category = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === categoryId);
      if (category?.trackList) insertAfter(category.trackList, 'agach_sahar', 'agach_sahar_maniot25');
      if (category?.trackList) insertAfter(category.trackList, 'okev_agach', 'okev_agach_maniot25');
    });

    ['pension_mekafit', 'pension_mashlima'].forEach(categoryId => {
      const category = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === categoryId);
      if (category?.trackList) insertAfter(category.trackList, 'pension_agach_sahar', 'pension_agach_sahar_maniot25');
    });

    const polisaCategory = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === 'polisa_chisachon');
    if (polisaCategory?.trackList) {
      insertAfter(polisaCategory.trackList, 'polisa_agach_sahar', 'polisa_agach_sahar_maniot25');
    }
  })();

  const CASH_TOOL_MANUAL_PRODUCTS = [
    { id: 'manual_money_market', label: 'קרן כספית' },
    { id: 'manual_structured', label: "סטרקצ'ר" },
    { id: 'manual_portfolio', label: 'תיק השקעות' },
    { id: 'manual_other', label: 'מוצר ידני אחר' }
  ];

  function createDefaultCashToolForm() {
    return {
      sourceType: 'existing',
      existingCategoryId: 'polisa_chisachon',
      existingProviderName: '',
      existingFundId: '',
      amount: '',
      allocationPercent: '',
      feePercent: '',
      notes: '',
      manualProductType: 'manual_money_market',
      manualName: '',
      riskScore: 35,
      stockPct: 0,
      abroadPct: 0,
      fxPct: 0,
      expectedReturn: '',
      manualProviderName: ''
    };
  }

  state.compareMode = 'tracks';
  state.pendingCompareMode = null;
  state.pendingActuarialFundId = null;
  state.pendingActuarialCompanyName = null;
  state.pendingActuarialHighlightDone = false;

  // ─── toggle state ─────────────────────────────────────────────
  state.yieldMode    = 'cumulative';  // 'cumulative' | 'annualized' | 'yearly'
  state.showExposure = false;          // default: חשיפות מוסתרות
  state._blockRenderers = [];          // renderBlockTable של כל מסלול פעיל
  state.yearlyReturns = {
    loading: false,
    categoryId: null,
    targetPopulation: null,
    requestId: 0,
    yearCount: 5,
    loadedYearCount: 0,
    activeTrackId: null,
    years: [],
    yieldMap: null
  };
  state.yearlyByTrack = new Map();

  // ─── H2H state ────────────────────────────────────────────────
  const H2H_METRICS = [
    { id:'monthly',   label:'תשואה חודשית',          shortLabel:'',        group:'תשואות',      defaultOn:true  },
    { id:'ytd',       label:'השנה',                   shortLabel:'השנה',    group:'תשואות',      defaultOn:true  },
    { id:'1yr',       label:'12 חודשים אחורה',       shortLabel:'12 חוד׳', group:'תשואות',      defaultOn:true  },
    { id:'3yr_cum',   label:'3 שנים (מצטבר)',        shortLabel:'3 שנים',  group:'תשואות',      defaultOn:true  },
    { id:'5yr_cum',   label:'5 שנים (מצטבר)',        shortLabel:'5 שנים',  group:'תשואות',      defaultOn:true  },
    { id:'7yr_cum',   label:'7 שנים (מצטבר)',        shortLabel:'7 שנים',  group:'תשואות',      defaultOn:false },
    { id:'3yr_ann',   label:'3 שנ׳ (שנתי ממוצע)',   shortLabel:'3 שנים',  group:'תשואות',      defaultOn:false },
    { id:'5yr_ann',   label:'5 שנ׳ (שנתי ממוצע)',   shortLabel:'5 שנים',  group:'תשואות',      defaultOn:false },
    { id:'7yr_ann',   label:'7 שנ׳ (שנתי ממוצע)',   shortLabel:'7 שנים',  group:'תשואות',      defaultOn:false },
    { id:'customRange', label:'טווח השקעה מותאם',    shortLabel:'טווח מותאם', group:'תשואות',    defaultOn:false },
    { id:'assets',    label:'סך נכסים',               shortLabel:'נכסים',   group:'מידע כללי',  defaultOn:true  },
    { id:'stock',     label:'חשיפה למניות',           shortLabel:'מניות',   group:'חשיפות',      defaultOn:false },
    { id:'abroad',    label:'חשיפה לחו"ל',            shortLabel:'חו״ל',    group:'חשיפות',      defaultOn:false },
    { id:'fx',        label:'חשיפה למט"ח',            shortLabel:'מט״ח',    group:'חשיפות',      defaultOn:false },
    { id:'sharpe',    label:'מדד שארפ',               shortLabel:'שארפ',    group:'מדדי סיכון', defaultOn:false },
    { id:'positive',  label:'חודשים חיוביים',         shortLabel:'חיוביים', group:'מדדי סיכון', defaultOn:false },
    { id:'stddev',    label:'סטיית תקן (שנתי)',       shortLabel:'סטיית תקן', group:'מדדי סיכון', defaultOn:false },
    { id:'momentum',  label:'ציון מומנטום',           shortLabel:'מומנטום', group:'מדדי סיכון', defaultOn:false },
    { id:'actuarial', label:'איזון אקטוארי 60 חודשים', shortLabel:'אקטוארי 60 ח׳', group:'מדדי סיכון', defaultOn:false },
    { id:'alpha',     label:'מדד אלפא (מול מסלול)',  shortLabel:'אלפא',    group:'מדדי סיכון', defaultOn:false },
  ];
  state.h2h = {
    items:       [],
    metrics:     new Set(H2H_METRICS.filter(m=>m.defaultOn).map(m=>m.id)),
    catCache:    {},
    metricsOpen: false,
    yearSectionOpen: false,
    customRangeSectionOpen: false,
    storageLoaded: false,
    pointerDrag: null,
    wizardOrganized: null,
    wizardSelection: null,
    wizardTrackOptions: [],
    wizardFundOptions: [],
    yearMetrics: new Set(),
    yearDataByCat: new Map(),
    yearsLoading: false,
    yearsRequestId: 0,
    yearsSignature: '',
    trailing7DataByCat: new Map(),
    trailing7Loading: false,
    trailing7RequestId: 0,
    trailing7Signature: '',
    viewMode: 'table',
    focusFundIds: new Set(),
    sortMetricId: '',
    persistedKeys: new Set(),
    customRange: {
      loading: false,
      availabilityLoading: false,
      active: false,
      selectionMode: 'months',
      startPeriod: '',
      endPeriod: '',
      selectedYear: '',
      availablePeriods: [],
      availableYears: [],
      yieldMapByCat: new Map(),
      signature: '',
      availabilitySignature: '',
      status: '',
      meta: '',
      userSelectedRange: false
    },
  };
  const H2H_STORAGE_KEY = 'gemelhubH2HComparison';

  const ADVANCED_SEARCH_METRICS = [
    { id: 'yield12m', label: 'תשואה 12 חודשים' },
    { id: 'yieldYtd', label: 'תשואה מתחילת שנה' },
    { id: 'yield3y', label: 'תשואה מצטברת 3 שנים' },
    { id: 'yield5y', label: 'תשואה מצטברת 5 שנים' },
    { id: 'assets', label: 'היקף נכסים' },
    { id: 'stock', label: 'חשיפה למניות' },
    { id: 'abroad', label: 'חשיפה לחו"ל' },
    { id: 'fx', label: 'חשיפה למט"ח' },
    { id: 'sharpe', label: 'מדד שארפ' },
    { id: 'positive', label: 'חודשים חיוביים' },
    { id: 'stddev', label: 'סטיית תקן' },
    { id: 'momentum', label: 'מומנטום 6 חודשים' },
    { id: 'actuarial', label: 'איזון אקטוארי' }
  ];
  const ADVANCED_SEARCH_DIRECTION_LABELS = { high: 'הכי גבוה', low: 'הכי נמוך' };

  function createAdvancedSearchParam(overrides = {}) {
    return {
      id: `adv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      metricId: '',
      direction: 'high',
      ...overrides
    };
  }

  state.advancedSearch = {
    open: false,
    mode: 'best',
    params: [createAdvancedSearchParam()],
    loading: false,
    metricsLoading: false,
    results: [],
    metricMaps: null
  };

  // ─── Color pool per provider ─────────────────────────────────
  state.customRange = {
    open: false,
    active: false,
    loading: false,
    availabilityLoading: false,
    availablePeriods: [],
    availableYears: [],
    selectionMode: 'months',
    startPeriod: '',
    endPeriod: '',
    selectedYear: '',
    yieldMap: null
  };

  state.actuarial = {
    rows: [],
    loading: false,
    rangeKey: '',
    showAllYears: false,
    sortField: 'totalAdjustment',
    sortDir: 'desc'
  };

  const COLORS = ['#6366f1','#10b981','#f97316','#a855f7','#ef4444',
                  '#14b8a6','#eab308','#ec4899','#6366f1','#64748b',
                  '#f59e0b','#06b6d4','#84cc16','#d946ef'];
  const colorMap = new Map(); let colorIdx = 0;
  function providerColor(name) {
    if (!colorMap.has(name)) { colorMap.set(name, COLORS[colorIdx++ % COLORS.length]); }
    return colorMap.get(name);
  }


  const HERO_COPY = {
    home: {
      title: 'ברוכים הבאים ל-GemelHub',
      sub: 'המערכת המקצועית והידידותית ביותר להשוואת קופות גמל, קרנות השתלמות, פוליסות חיסכון ופנסיה על בסיס נתוני משרד האוצר.'
    },
    gemel_tagmulim: {
      title: 'השווה בין הקופות, וגלה האם ניתן לשפר את התנאים שלך',
      sub: 'נתונים רשמיים, סינון ידידותי והשוואה ברורה בין מסלולים, מנהלים ותשואות.'
    },
    hashtalamot: {
      title: 'השווה בין הקופות, וגלה האם ניתן לשפר את התנאים שלך',
      sub: 'השווה בקלות בין מסלולים, מנהלים ותשואות על בסיס נתונים רשמיים ממשרד האוצר.'
    },
    gemel_hashkaa: {
      title: 'ניהול נכון של השקעה לטווח ארוך מתחיל בהשוואה מקצועית',
      sub: 'השווה מסלולי גמל להשקעה ובחן אפשרויות השקעה לטווח ארוך בצורה מקצועית, ברורה ונגישה.'
    },
    removed_legacy_category: {
      title: '',
      sub: ''
    },
    polisa_chisachon: {
      title: 'בחירה נכונה בניהול השקעות מקצועי מתחילה בהשוואה ברורה',
      sub: 'השווה פוליסות חיסכון, מסלולי השקעה ומנהלים שונים כדי לקבל תמונה רחבה ומסודרת.'
    },
    hisachon_yeled: {
      title: 'השווה מסלולי חיסכון לכל ילד ובחר נכון את ניהול הכסף לטווח ארוך',
      sub: 'מערכת נוחה להשוואת מסלולים, מנהלים ותשואות עבור חיסכון לכל ילד על בסיס נתונים רשמיים.'
    },
    pension_mekafit: {
      title: 'יכול להיות שאתה משלם ביוקר על הפנסיה שלך בלי לדעת',
      sub: 'השווה קרנות פנסיה על בסיס נתונים רשמיים ובדוק האם התנאים שלך עדיין מתאימים לך.'
    },
    pension_mashlima: {
      title: 'יכול להיות שאתה משלם ביוקר על הפנסיה שלך בלי לדעת',
      sub: 'השווה קרנות פנסיה כללית ומסלולים שונים על בסיס נתונים רשמיים ובחן האם אפשר לשפר תנאים.'
    },
    sandbox: {
      title: 'המעבדה שלי — תיק השקעות אישי',
      sub: 'בנה תיק השקעות מותאם אישית, השווה מסלולים ממגוון קטגוריות וקבל תמונה מלאה על הפיזור, התשואות ודמי הניהול שלך.'
    }
  };

  function updateHeroContent(catId = 'home') {
    const heroTitleEl = document.getElementById('hero-main-title');
    const heroSubEl = document.getElementById('hero-sub-title');
    const hero = HERO_COPY[catId] || HERO_COPY.home;
    if (heroTitleEl) heroTitleEl.textContent = hero.title;
    if (heroSubEl) heroSubEl.textContent = hero.sub;

    const heroEl = document.getElementById('hero-banner');
    if (heroEl) {
      // סינכרוני — חייב להיות לפני ה-paint כדי שה-sticky header לא יקפוץ
      document.documentElement.style.setProperty('--hero-h', heroEl.offsetHeight + 'px');
    }
  }

  
  let ctaPopupTimer = null;
  let ctaPopupInterval = null;
  let ctaPopupHideTimer = null;
  let ctaPopupIndex = 0;
  let displayOptionsAutoCloseTimer = null;
  let displayOptionsCloseTimer = null;
  let displayOptionsMutationObserver = null;
  let displayOptionsApplying = false;
  let advancedOptionsAutoCloseTimer = null;

  const CTA_POPUP_VARIANTS = [
    {
      title: 'ראית פערים ולא בטוח מה מתאים לך?',
      text: 'אפשר לבדוק עבורך התאמה אישית.',
      linkText: 'בדיקה אישית',
      className: 'toast-variant-a',
      source: 'popup-a'
    },
    {
      title: 'רוצה להבין אם אפשר לשפר תנאים?',
      text: 'בדיקה קצרה יכולה לעשות סדר בתמונה המלאה.',
      linkText: 'השאר פרטים',
      className: 'toast-variant-b',
      source: 'popup-b'
    },
    {
      title: 'לא בטוח מה באמת נכון עבורך?',
      text: 'אפשר לבדוק התאמה אישית לפי המצב שלך.',
      linkText: 'בדיקה אישית',
      className: 'toast-variant-c',
      source: 'popup-c'
    }
  ];

  function ensureCtaPopup() {
    let popup = document.getElementById('cta-popup-toast');
    if (popup) return popup;

    popup = document.createElement('div');
    popup.id = 'cta-popup-toast';
    popup.className = 'cta-popup-toast';
    popup.setAttribute('aria-hidden', 'true');
    popup.innerHTML = `
      <button type="button" class="cta-popup-toast-close" id="cta-popup-toast-close" aria-label="סגור">×</button>
      <div class="cta-popup-toast-icon"><i class="fas fa-user-check" aria-hidden="true"></i></div>
      <div class="cta-popup-toast-body">
        <strong id="cta-popup-toast-title"></strong>
        <span id="cta-popup-toast-text"></span>
      </div>
      <button type="button" id="cta-popup-toast-link" class="cta-popup-toast-link"></button>
    `;
    document.body.appendChild(popup);

    popup.querySelector('#cta-popup-toast-close')?.addEventListener('click', () => {
      stopRotatingCtaPopup();
      sessionStorage.setItem('gemelhubRotatingPopupDismissed', '1');
    });

    return popup;
  }

  function renderCtaPopupVariant(index) {
    const popup = ensureCtaPopup();
    const variant = CTA_POPUP_VARIANTS[index % CTA_POPUP_VARIANTS.length];
    popup.classList.remove('toast-variant-a', 'toast-variant-b', 'toast-variant-c');
    popup.classList.add(variant.className);
    popup.querySelector('#cta-popup-toast-title').textContent = variant.title;
    popup.querySelector('#cta-popup-toast-text').textContent = variant.text;
    const link = popup.querySelector('#cta-popup-toast-link');
    link.textContent = variant.linkText;
    // החלפת href בפתיחת טופס לידים
    link.onclick = () => {
      stopRotatingCtaPopup();
      if (typeof openLeadsModal === 'function') openLeadsModal(variant.source);
    };
  }

  function showNextCtaPopup() {
    if (sessionStorage.getItem('gemelhubRotatingPopupDismissed') === '1') return;
    const popup = ensureCtaPopup();
    renderCtaPopupVariant(ctaPopupIndex++);
    popup.classList.add('is-visible');
    popup.setAttribute('aria-hidden', 'false');
    clearTimeout(ctaPopupHideTimer);
    ctaPopupHideTimer = setTimeout(() => {
      popup.classList.remove('is-visible');
      popup.setAttribute('aria-hidden', 'true');
    }, 10000);
  }

  function startRotatingCtaPopup(delay = 10000) {
    return;
    if (sessionStorage.getItem('gemelhubRotatingPopupDismissed') === '1') return;
    clearTimeout(ctaPopupTimer);
    clearInterval(ctaPopupInterval);
    clearTimeout(ctaPopupHideTimer);
    ctaPopupTimer = setTimeout(() => {
      showNextCtaPopup();
      ctaPopupInterval = setInterval(showNextCtaPopup, 16000);
    }, delay);
  }

  function stopRotatingCtaPopup() {
    clearTimeout(ctaPopupTimer);
    clearInterval(ctaPopupInterval);
    clearTimeout(ctaPopupHideTimer);
    const popup = document.getElementById('cta-popup-toast');
    if (popup) {
      popup.classList.remove('is-visible');
      popup.setAttribute('aria-hidden', 'true');
    }
  }

  function scheduleThreeYearPopup() {
  }

  function updateStickyGapMask() {
    if (
      document.body.classList.contains('fund-page') ||
      document.body.classList.contains('h2h-active') ||
      document.body.classList.contains('sandbox-active')
    ) {
      document.body.classList.remove('sticky-gap-mask-active');
      return;
    }
    const stickyHeader = document.querySelector('.sticky-header');
    if (!stickyHeader) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const heroH = parseFloat(rootStyle.getPropertyValue('--hero-h')) || 0;
    const isStuck = stickyHeader.getBoundingClientRect().top <= heroH + 1;
    document.body.classList.toggle('sticky-gap-mask-active', isStuck && window.scrollY > 8);
  }

  function updateMobileStickyHeader() {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    const header = document.querySelector('.sticky-header');
    const hero = document.getElementById('hero-banner');
    if (
      !header ||
      !hero ||
      !isMobile ||
      document.body.classList.contains('h2h-active') ||
      document.body.classList.contains('sandbox-active')
    ) {
      document.body.classList.remove('mobile-sticky-header-fixed');
      document.documentElement.style.removeProperty('--mobile-sticky-header-h');
      return;
    }
    const heroVisible = hero.offsetHeight > 1 && getComputedStyle(hero).display !== 'none';
    if (!heroVisible) {
      document.body.classList.remove('mobile-sticky-header-fixed');
      document.documentElement.style.removeProperty('--mobile-sticky-header-h');
      return;
    }
    const headerH = Math.ceil(header.getBoundingClientRect().height || 0);
    document.documentElement.style.setProperty('--mobile-sticky-header-h', `${headerH}px`);
    const shouldFix = window.scrollY >= Math.max(0, hero.offsetTop + hero.offsetHeight - 1);
    document.body.classList.toggle('mobile-sticky-header-fixed', shouldFix);
  }

  function scrollMainPageToTop() {
    document.body.classList.remove('sticky-gap-mask-active', 'mobile-sticky-header-fixed');
    document.documentElement.style.removeProperty('--mobile-sticky-header-h');
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    [120, 360, 720].forEach(delay => {
      setTimeout(() => {
        if (window.scrollY <= 4) {
          document.body.classList.remove('sticky-gap-mask-active', 'mobile-sticky-header-fixed');
          document.documentElement.style.removeProperty('--mobile-sticky-header-h');
          window.scrollTo(0, 0);
        }
      }, delay);
    });
  }


  // ─── INIT ─────────────────────────────────────────────────────
  async function init() {
    APIModule.loadCachesFromLocalStorage();
    _sbRestoreMobileZoom();
    loadDisplayOptions();
    state.advancedOptionsOpen = false;
    localStorage.removeItem(ADVANCED_OPTIONS_STORAGE_KEY);
    repairStaticTextAndLayout();
    loadH2HPersistedKeysFromStorage();
    buildCategoryTabs();
    syncAdvancedOptionsUi();
    setupSearch();
    setupMobileFundSearch();
    setupMobileRecentFundsDrawer();
    setupAdvancedSearch();
    setupCustomRange();
    setupModal();
    setupMobileSidebar();
    setupMobileAppShell();
    setupExport();
    setupSidebarClearButtons();
    setupPopulationFilter();
    setupCompareModeToggle();
    setupCompactViewToggle();
    setupDisplayOptions();
    setupTwoColStickyHeaders();
    setupMobileStickyThead();
    updateMobileStickyHeader();
    loadSandboxPortfolio();
    const handledSharedPortfolioUrl = await _sbCheckUrlHash();
    setupSandboxCheckboxes();
    setupSandboxBarActions();
    setupValueBarRename();
    setupSandboxPortfolioDialogs();
    setupPrintListeners();
    window.addEventListener('resize', syncTracksDensityClasses);
    window.addEventListener('resize', updateStickyGapMask);
    window.addEventListener('resize', updateMobileStickyHeader);
    window.addEventListener('scroll', updateStickyGapMask, { passive: true });
    window.addEventListener('scroll', updateMobileStickyHeader, { passive: true });
    updateStickyGapMask();
    window.gemelhubScrollToTop = scrollMainPageToTop;
    window.gemelhubScrollToComparisonTableTop = scrollToComparisonTableTop;
    window.gemelhubStartFirstTableScrollGuard = startMobileFirstTableScrollGuard;
    window.addEventListener('beforeunload', () => {
      // Force-read all visible sandbox inputs into state before saving,
      // in case a field was edited but blur/change hadn't fired yet.
      _sbSyncVisibleInputsToState();
      saveSandboxPortfolio();
      saveCurrentFilterState();
    });
    window.addEventListener('pagehide', () => {
      _sbSyncVisibleInputsToState();
      saveSandboxPortfolio();
      saveCurrentFilterState();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        _sbSyncVisibleInputsToState();
        saveSandboxPortfolio();
        saveCurrentFilterState();
      }
    });
    setInterval(() => { if (state.sandbox.portfolio.length > 0) saveSandboxPortfolio(); }, 20000);
    _sbInitValueBarDrag();
    document.addEventListener('click', event => {
      if (!event.target.closest('.allocation-outlier-btn') && !event.target.closest('#allocation-outlier-floating-popover')) {
        closeAllocationOutlierPopover();
      }
    });
    document.addEventListener('mousemove', event => {
      const popover = document.getElementById('allocation-outlier-floating-popover');
      if (!popover) return;
      const btn = event.target.closest('.allocation-outlier-btn');
      if (btn?.dataset.outlierId === popover.dataset.owner) return;
      closeAllocationOutlierPopover();
    }, true);

    // task 10: ניווט ישיר מדף קופה → קטגוריה ספציפית
    const urlParams = new URLSearchParams(window.location.search);
    const urlApp = urlParams.get('app');
    const urlCat = urlParams.get('cat');
    const urlTrack = urlParams.get('track');
    const urlFocusTrack = urlParams.get('focusTrack');
    const urlView = urlParams.get('view');
    const urlFund = urlParams.get('fund');
    const urlProvider = urlParams.get('provider');
    const isMobileViewport = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    const shouldStartAtFirstTable = !!window.__GEMELHUB_FORCE_TABLE_TOP__ ||
      (isMobileViewport && !!window.__GEMELHUB_IS_RELOAD__ && !urlApp && !urlView && !urlParams.get('openAdvanced'));
    const effectiveUrlTrack = shouldStartAtFirstTable ? null : (urlFocusTrack || urlTrack);
    state.pendingCompareMode = urlView === 'actuarial' ? 'actuarial' : null;
    state.pendingActuarialFundId = urlView === 'actuarial' ? (urlFund || null) : null;
    state.pendingActuarialCompanyName = urlView === 'actuarial' ? (urlProvider || null) : null;
    state.pendingActuarialHighlightDone = false;
    state.pendingInitialTableTopScroll = !!shouldStartAtFirstTable;
    if (handledSharedPortfolioUrl) {
      // Shared portfolio links handle their own navigation after loading.
    } else if (urlApp === 'h2h') {
      switchToH2H();
    } else if (urlApp === 'sandbox') {
      switchToSandbox();
    } else if (urlCat && CONFIG.PRODUCT_CATEGORIES.find(c => c.id === urlCat && !REMOVED_CATEGORY_IDS.has(c.id))) {
      state.pendingTrackId = effectiveUrlTrack || null;
      state.pendingCompareTopScroll = !!effectiveUrlTrack;
      state.pendingTrackFocusOnly = !!(urlFocusTrack && effectiveUrlTrack);
      switchCategory(urlCat);
    } else {
      state.pendingTrackId = null;
      state.pendingCompareTopScroll = false;
      state.pendingTrackFocusOnly = false;
      switchCategory('hashtalamot');
    }
    if (urlParams.get('openAdvanced') === '1') {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('openAdvanced');
      history.replaceState(history.state, '', cleanUrl.toString());
      setTimeout(() => openAdvancedSearch(), 700);
    }
  }

  function setupSandboxCheckboxes() {
    // Delegate checkbox clicks and manage the checkbox as a compact membership state control.
    document.addEventListener('click', e => {
      const cb = e.target.closest('.sandbox-check');
      if (!cb) return;
      e.preventDefault();
      e.stopPropagation();
      const data = {
        fundId:        cb.dataset.fundid,
        fundName:      cb.dataset.fundname,
        provider:      cb.dataset.provider,
        trackId:       cb.dataset.trackid,
        trackLabel:    cb.dataset.tracklabel,
        categoryId:    cb.dataset.categoryid,
        categoryLabel: cb.dataset.categorylabel,
        y1:    cb.dataset.y1,
        y3:    cb.dataset.y3,
        y5:    cb.dataset.y5,
        y12m:  cb.dataset.y12m  || '',
        y5yr:  cb.dataset.y5yr  || '',
        stock:  cb.dataset.stock,
        abroad: cb.dataset.abroad,
        fx:     cb.dataset.fx,
        color:  cb.dataset.color,
        fundIdTagIcons: cb.dataset.fundIdTagIcons || '',
        reportPeriod: cb.dataset.reportPeriod || ''
      };

      const sandboxSelected = isSandboxSelected(data.fundId, data.trackId, data.categoryId);
      const inSandboxPortfolio = isInSandboxPortfolio(data.fundId, data.trackId, data.categoryId);
      const inH2H = isInH2HComparison(data.fundId, data.categoryId);

      if (inSandboxPortfolio && inH2H) {
        removeSandboxSelection(data.fundId, data.trackId, data.categoryId);
        removeSandboxPortfolioItem(data.fundId, data.trackId, data.categoryId);
        removeH2HComparisonItem(data.fundId, data.categoryId);
      } else if (sandboxSelected) {
        removeSandboxSelection(data.fundId, data.trackId, data.categoryId);
        if (inSandboxPortfolio) removeSandboxPortfolioItem(data.fundId, data.trackId, data.categoryId);
        if (inH2H && !inSandboxPortfolio) removeH2HComparisonItem(data.fundId, data.categoryId);
      } else {
        const ok = toggleSandboxSelection(data);
        if (!ok) {
          alert('ניתן לבחור עד 6 מסלולים בו-זמנית. הסר מסלול קיים לפני שתוסיף חדש.');
        }
      }

      saveSandboxPortfolio();
      _sbUpdateTabBadge();
      syncFundMembershipIndicators();
      setTimeout(syncFundMembershipIndicators, 0);
      if (state.activeCategoryId === 'sandbox') renderSandboxPage();
    }, true);
  }

  function repairStaticTextAndLayout() {
    document.title = 'GemelHub - השוואת קופות גמל, פנסיה וקרנות השתלמות';

    const skipLink = document.querySelector('.skip-link');
    if (skipLink) skipLink.textContent = 'דלג לתוכן הראשי';

    const sidebarToggle = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggle) {
      sidebarToggle.title = 'הצג/הסתר פילטרים';
      sidebarToggle.setAttribute('aria-label', 'הצג/הסתר פילטרים');
      const label = sidebarToggle.querySelector('.stb-label');
      if (label) label.textContent = 'סינון';
    }
    const compactToggle = document.getElementById('compact-view-toggle');
    if (compactToggle) {
      compactToggle.title = 'הצג שתי טבלאות במצב צפוף';
      compactToggle.setAttribute('aria-label', 'הצג שתי טבלאות במצב צפוף');
    }
    const displayToggle = document.getElementById('display-options-toggle');
    if (displayToggle) {
      displayToggle.title = 'פתח אפשרויות תצוגת טבלאות';
      displayToggle.setAttribute('aria-label', 'פתח אפשרויות תצוגת טבלאות');
    }

    const tsbInner = document.querySelector('.tsb-inner');
    const customRangeEntry = document.getElementById('custom-range-entry');
    if (tsbInner && customRangeEntry && sidebarToggle && customRangeEntry.previousElementSibling !== sidebarToggle) {
      tsbInner.insertBefore(customRangeEntry, sidebarToggle);
    }

    const searchInput = document.getElementById('global-search');
    if (searchInput) {
      searchInput.placeholder = 'חפש לפי מנהל, מספר קופה או מסלול...';
      searchInput.setAttribute('aria-label', 'חיפוש קופות לפי מנהל, מספר קופה או מסלול');
    }
    const searchLabel = document.querySelector('label[for="global-search"]');
    if (searchLabel) searchLabel.textContent = 'חיפוש קופות';

    const customRangeToggleLabel = document.getElementById('custom-range-toggle-label');
    if (customRangeToggleLabel && !state.customRange.active) {
      customRangeToggleLabel.textContent = 'בחר טווח השקעה מותאם';
    }

    const customRangeBadge = document.querySelector('.custom-range-badge');
    if (customRangeBadge) customRangeBadge.remove();

    const panelMain = document.querySelector('.custom-range-panel-main');
    const modeWrap = document.getElementById('custom-range-mode');
    const fieldsActions = document.querySelector('.custom-range-fields-actions');
    if (panelMain && modeWrap && fieldsActions && panelMain.firstElementChild !== modeWrap) {
      panelMain.insertBefore(modeWrap, fieldsActions);
    }

    const fieldsWrap = document.querySelector('.custom-range-fields');
    const actionsWrap = document.querySelector('.custom-range-actions');
    if (fieldsActions && fieldsWrap && actionsWrap && fieldsActions.firstElementChild !== actionsWrap) {
      fieldsActions.insertBefore(actionsWrap, fieldsWrap);
    }

    document.querySelectorAll('[data-range-mode="months"]').forEach(btn => btn.textContent = 'טווח חודשים');
    document.querySelectorAll('[data-range-mode="year"]').forEach(btn => btn.textContent = 'שנה ספציפית');

    const startField = document.querySelector('[data-range-fields="months"] span');
    if (startField) startField.textContent = 'מחודש';
    const endField = document.querySelectorAll('[data-range-fields="months"] span')[1];
    if (endField) endField.textContent = 'עד חודש';
    const yearField = document.querySelector('[data-range-fields="year"] span');
    if (yearField) yearField.textContent = 'שנה';

    const startSelect = document.getElementById('custom-range-start');
    const endSelect = document.getElementById('custom-range-end');
    const yearSelect = document.getElementById('custom-range-year');
    if (startSelect) startSelect.setAttribute('aria-label', 'מחודש');
    if (endSelect) endSelect.setAttribute('aria-label', 'עד חודש');
    if (yearSelect) yearSelect.setAttribute('aria-label', 'שנה');

    const applyBtn = document.getElementById('custom-range-apply');
    const clearBtn = document.getElementById('custom-range-clear');
    if (applyBtn) applyBtn.textContent = 'הצג בטבלה';
    if (clearBtn) clearBtn.textContent = 'חזור לטבלה רגילה';

    const note = document.querySelector('.regulatory-note-inline span');
    if (note) note.textContent = 'הנתונים מוצגים לצורכי מידע והשוואה בלבד ואינם מהווים ייעוץ, שיווק או המלצה אישית. התשואות מוצגות לפני דמי ניהול.';

    const loading = document.getElementById('loading-state');
    if (loading) {
      loading.setAttribute('aria-label', 'מרכיבים השוואה חכמה');
      const title = loading.querySelector('.loading-title');
      const subtitle = loading.querySelector('.loading-subtitle');
      if (title) title.textContent = 'מרכיבים עבורך השוואה חכמה...';
      if (subtitle) subtitle.textContent = 'עוד רגע תראה מי מוביל בתשואות, בדמי הניהול ובמסלול שמתאים לך.';
    }

    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.setAttribute('aria-label', 'פילטרים לסינון');

    const clearTracks = document.getElementById('clear-tracks');
    if (clearTracks) {
      clearTracks.textContent = 'נקה';
      clearTracks.setAttribute('aria-label', 'נקה סינון מסלולים');
      const title = clearTracks.parentElement;
      if (title) title.innerHTML = '<i class="fas fa-road"></i> מסלולי השקעה <button class="btn-clear-filter" id="clear-tracks" aria-label="נקה סינון מסלולים">נקה</button>';
    }

    const clearProviders = document.getElementById('clear-providers');
    if (clearProviders) {
      clearProviders.textContent = 'נקה';
      clearProviders.setAttribute('aria-label', 'נקה סינון מנהלים');
      const title = clearProviders.parentElement;
      if (title) title.innerHTML = '<i class="fas fa-building"></i> מנהלי השקעות <button class="btn-clear-filter" id="clear-providers" aria-label="נקה סינון מנהלים">נקה</button>';
    }

    const populationTitle = document.querySelector('#population-filter-section .sidebar-section-title');
    if (populationTitle) populationTitle.innerHTML = '<i class="fas fa-users"></i> אוכלוסיית יעד';

    const populationGroup = document.getElementById('filter-population');
    if (populationGroup) populationGroup.setAttribute('aria-label', 'אוכלוסיית יעד');
    const populationInputs = document.querySelectorAll('#filter-population input[name="population"]');
    if (populationInputs[0]) populationInputs[0].value = DEFAULT_TARGET_POPULATION;
    if (populationInputs[1]) populationInputs[1].value = '';
    const populationOptions = document.querySelectorAll('#filter-population label span');
    if (populationOptions[0]) populationOptions[0].textContent = 'כלל האוכלוסייה';
    if (populationOptions[1]) populationOptions[1].textContent = 'כולל קופות סקטוריאליות';

    const exportBtn = document.getElementById('btn-export');
    if (exportBtn) {
      exportBtn.setAttribute('aria-label', 'ייצוא הנתונים לקובץ CSV');
      exportBtn.innerHTML = '<i class="fas fa-file-csv"></i> ייצוא ל-CSV';
    }
  }

  // ─── CATEGORY TABS ──────────────────────────────────────────
  function isCustomRangeFeatureEnabled() {
    return !!CONFIG.FEATURES?.CUSTOM_RANGE?.enabled;
  }

  function isPensionCategory(categoryId = state.activeCategoryId) {
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === categoryId);
    return !!(cat && cat.pensionAPI);
  }

  function getCategoryLabel(categoryId = state.activeCategoryId) {
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === categoryId);
    return cat?.label || '';
  }

  function isActuarialModeAvailable(categoryId = state.activeCategoryId) {
    return categoryId === 'pension_mekafit' || categoryId === 'pension_mashlima';
  }

  function getCurrentCompareMode() {
    return isActuarialModeAvailable() && state.compareMode === 'actuarial' ? 'actuarial' : 'tracks';
  }

  function syncCompactViewToggle() {
    const btn = document.getElementById('compact-view-toggle');
    if (!btn) return;
    btn.style.display = 'none';
    btn.classList.toggle('is-active', !!state.compactTracksView);
    btn.setAttribute('aria-pressed', state.compactTracksView ? 'true' : 'false');
    const label = btn.querySelector('span');
    const icon = btn.querySelector('i');
    if (label) label.textContent = state.compactTracksView ? 'תצוגה מרווחת' : 'תצוגה צפופה';
    if (icon) {
      icon.className = state.compactTracksView ? 'fas fa-expand-alt' : 'fas fa-compress-alt';
      icon.setAttribute('aria-hidden', 'true');
    }
  }

  function toggleCompactTracksView() {
    state.compactTracksView = !state.compactTracksView;
    if (state.compactTracksView) {
      const sidebar = document.getElementById('sidebar');
      const toggleBtn = document.getElementById('sidebar-toggle-btn');
      if (sidebar && !sidebar.classList.contains('sidebar-collapsed')) {
        sidebar.classList.add('sidebar-collapsed');
        if (toggleBtn) toggleBtn.classList.remove('active');
        const compareModeToggle = document.getElementById('compare-mode-toggle');
        if (compareModeToggle && isActuarialModeAvailable()) {
          compareModeToggle.hidden = true;
          compareModeToggle.style.display = 'none';
        }
        const tracksContainer = document.getElementById('tracks-container');
        if (tracksContainer && isActuarialModeAvailable()) {
          tracksContainer.classList.add('mode-toggle-hidden');
        }
      }
    }
    syncCompactViewToggle();
    syncDisplayOptionsUi();
    syncTracksDensityClasses();
  }

  function loadDisplayOptions() {
    try {
      const saved = JSON.parse(localStorage.getItem(DISPLAY_OPTIONS_STORAGE_KEY) || 'null');
      state.displayOptions = normalizeDisplayOptions(saved || {});
    } catch (e) {
      state.displayOptions = { ...DEFAULT_DISPLAY_OPTIONS };
    }
  }

  function normalizeDisplayOptions(saved) {
    const next = { ...DEFAULT_DISPLAY_OPTIONS, ...saved };
    if (Object.prototype.hasOwnProperty.call(saved, 'medal')) {
      next.medalIcon = saved.medal ? (saved.medalIcon || 'gold') : 'none';
    }
    if (Object.prototype.hasOwnProperty.call(saved, 'tomato')) {
      next.loserIcon = saved.tomato ? (saved.tomatoIcon || saved.loserIcon || 'tomato') : 'none';
    } else if (saved.tomatoIcon && !saved.loserIcon) {
      next.loserIcon = saved.tomatoIcon;
    }
    if (Object.prototype.hasOwnProperty.call(saved, 'winnerHighlight')) {
      next.winnerHighlightStyle = saved.winnerHighlight ? (saved.winnerHighlightStyle || 'yellow') : 'none';
    }
    delete next.medal;
    delete next.tomato;
    delete next.tomatoIcon;
    delete next.winnerHighlight;
    return next;
  }

  function saveDisplayOptions() {
    try {
      localStorage.setItem(DISPLAY_OPTIONS_STORAGE_KEY, JSON.stringify(state.displayOptions));
    } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function applyDisplayOptionsToVisibleTables() {
    if (displayOptionsApplying) return;
    displayOptionsApplying = true;
    try {
      const options = state.displayOptions || DEFAULT_DISPLAY_OPTIONS;
      const winnerMarks = { gold: '🥇', trophy: '🏆', star: '⭐', crown: '👑', rocket: '🚀' };
      const loserMarks = { tomato: '🍅', thumbsDown: '👎', warning: '⚠️', down: '⬇️', snow: '🧊' };
      const winnerMark = options.medalIcon === 'none' ? '' : (winnerMarks[options.medalIcon] || winnerMarks.gold);
      const loserMark = options.loserIcon === 'none' ? '' : (loserMarks[options.loserIcon] || loserMarks.tomato);

    const parseCellValue = (cell) => {
      const text = cell.querySelector('.yield-number')?.textContent || cell.textContent || '';
      const match = text.replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : NaN;
    };

    const getBaseText = (cell) => {
      const currentNumber = cell.querySelector('.yield-number')?.textContent?.trim();
      if (currentNumber) {
        cell.dataset.displayBaseText = currentNumber;
        return currentNumber;
      }
      if (!cell.dataset.displayBaseText) {
        cell.dataset.displayBaseText = (cell.textContent || '').trim();
      }
      return cell.dataset.displayBaseText;
    };

    const heatIntensity = (value, scale) => {
      const max = value < 0 ? scale.negMaxAbs : scale.posMax;
      if (!max) return 0.16;
      return Math.max(0.16, Math.min(0.78, 0.16 + (Math.abs(value) / max) * 0.62));
    };

      document.querySelectorAll('table.track-table').forEach(table => {
        const rows = [...table.querySelectorAll('tbody tr:not(.average-row)')];
        const maxYieldCols = rows.reduce((max, row) => Math.max(max, row.querySelectorAll('td.yield-cell').length), 0);

        for (let colIndex = 0; colIndex < maxYieldCols; colIndex += 1) {
          const entries = rows.map((row, rowIndex) => {
            const cell = row.querySelectorAll('td.yield-cell')[colIndex];
            if (!cell) return null;
            const value = parseCellValue(cell);
            return Number.isFinite(value) ? { cell, value, rowIndex } : null;
          }).filter(Boolean);

          if (!entries.length) continue;

          const values = entries.map(entry => entry.value);
          const maxValue = Math.max(...values);
          const minValue = values.length > 1 ? Math.min(...values) : NaN;
          const scale = {
            posMax: values.filter(value => value > 0).reduce((max, value) => Math.max(max, value), 0),
            negMaxAbs: values.filter(value => value < 0).reduce((max, value) => Math.max(max, Math.abs(value)), 0)
          };
          const ranks = new Map(
            [...entries]
              .sort((a, b) => b.value - a.value)
              .slice(0, 3)
              .map((entry, rankIndex) => [entry.cell, rankIndex + 1])
          );

          entries.forEach(entry => {
            const { cell, value } = entry;
            const baseText = getBaseText(cell);
            const rank = ranks.get(cell) || null;
            const isBest = value === maxValue;
            const isWorst = Number.isFinite(minValue) && value === minValue;
            const heatClass = options.heatmap
              ? (value > 0 ? ' yield-heat-pos' : value < 0 ? ' yield-heat-neg' : ' yield-heat-zero')
              : '';
            const heatStyle = options.heatmap
              ? ` style="--heat-alpha:${heatIntensity(value, scale).toFixed(3)}"`
              : '';
            const winnerCls = options.winnerHighlightStyle !== 'none' && isBest
              ? ` yield-winner-marker yield-winner-marker-${options.winnerHighlightStyle || 'yellow'}`
              : '';
            const badge = isBest ? winnerMark : isWorst ? loserMark : '';
            const badgeHtml = badge ? `<span class="yield-badge" aria-hidden="true">${badge}</span>` : '';
            const topRankHtml = options.topThree && rank
              ? `<span class="yield-top-rank yield-top-rank-${rank}" aria-hidden="true">${rank}</span>`
              : '';

            cell.innerHTML = `<span class="yield-value-wrap${heatClass}"${heatStyle}><span class="yield-number-shell"><span class="yield-number${winnerCls}">${escapeHtml(baseText)}</span>${badgeHtml}${topRankHtml}</span></span>`;
          });
        }
      });
      normalizeMobileFinanceTablePresentation(document);
    } finally {
      displayOptionsApplying = false;
    }
  }

  function guardDisplayOptionsAfterRender() {
    const container = document.getElementById('tracks-container');
    if (!container || displayOptionsMutationObserver) return;
    displayOptionsMutationObserver = new MutationObserver(mutations => {
      if (displayOptionsApplying) return;
      const onlyYieldCellChanges = mutations.every(mutation => {
        const target = mutation.target;
        return target instanceof Element && !!target.closest('td.yield-cell');
      });
      if (onlyYieldCellChanges) return;
      applyDisplayOptionsToVisibleTables();
      syncTracksDensityClasses();
      updateTwoColStickyOffsets();
    });
    displayOptionsMutationObserver.observe(container, { childList: true, subtree: true });
  }

  function syncResponsiveTableLabels(root = document) {
    root.querySelectorAll('table.track-table').forEach(table => {
      const headers = [...table.querySelectorAll('thead th')].map(th =>
        (th.textContent || '').replace(/\s+/g, ' ').trim()
      );
      table.querySelectorAll('tbody tr').forEach(row => {
        row.querySelectorAll('td').forEach((cell, index) => {
          if (headers[index]) cell.dataset.mobileLabel = headers[index];
        });
      });
    });
  }

  function syncAllocationIconOverflow(root = document) {
    root.querySelectorAll('.provider-cell').forEach(cell => {
      const name = cell.querySelector('.prov-name');
      const text = cell.querySelector('.prov-name-text');
      const icons = cell.querySelector('.table-allocation-icons');
      if (!name || !text || !icons) return;
      cell.classList.remove('allocation-icons-hover-only');
      icons.style.removeProperty('width');
      icons.style.removeProperty('max-width');
      icons.style.removeProperty('opacity');
      if (icons.closest('.fund-id-tag-icons')) return;
      const textIsClipped = text.scrollWidth > text.clientWidth + 1;
      if (textIsClipped) {
        cell.classList.add('allocation-icons-hover-only');
      }
    });
  }

  function refreshDisplayOptionsTargets() {
    if (state.isHomePage) return;
    if (!document.querySelector('table.track-table') && getCurrentCompareMode() !== 'tracks') return;
    const container = document.getElementById('tracks-container') || document;
    if (displayOptionsMutationObserver) {
      displayOptionsMutationObserver.disconnect();
      displayOptionsMutationObserver = null;
    }
    state._blockRenderers.forEach(fn => fn());
    syncResponsiveTableLabels(container);
    applyDisplayOptionsToVisibleTables();
    syncTracksDensityClasses();
    syncAllocationIconOverflow(container);
    updateTwoColStickyOffsets();
    syncDisplayOptionsUi();
    guardDisplayOptionsAfterRender();
  }

  function clearDisplayOptionsTimers() {
    clearTimeout(displayOptionsAutoCloseTimer);
    clearTimeout(displayOptionsCloseTimer);
  }

  function scheduleDisplayOptionsAutoClose() {
    clearTimeout(displayOptionsAutoCloseTimer);
  }

  function clearAdvancedOptionsTimer() {
    clearTimeout(advancedOptionsAutoCloseTimer);
  }

  function isAdvancedOptionsAreaHovered() {
    return !!document.querySelector(`${ADVANCED_OPTIONS_HOVER_SELECTOR}:hover`);
  }

  function isFilterPanelPinnedOpen() {
    const sidebar = document.getElementById('sidebar');
    const filterBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarOpen = !!sidebar && !sidebar.classList.contains('sidebar-collapsed');
    const filterPressed = !!filterBtn && filterBtn.classList.contains('active');
    return sidebarOpen || filterPressed;
  }

  function scheduleAdvancedOptionsAutoClose() {
    clearAdvancedOptionsTimer();
    if (!state.advancedOptionsOpen || state.isHomePage) return;
    advancedOptionsAutoCloseTimer = setTimeout(() => {
      if (state.displayOptionsOpen || isAdvancedOptionsAreaHovered() || isFilterPanelPinnedOpen()) {
        scheduleAdvancedOptionsAutoClose();
        return;
      }
      state.advancedOptionsOpen = false;
      state.displayOptionsOpen = false;
      syncAdvancedOptionsUi();
    }, ADVANCED_OPTIONS_AUTO_CLOSE_DELAY);
  }

  function syncDisplayOptionsUi() {
    const btn = document.getElementById('display-options-toggle');
    const panel = document.getElementById('display-options-panel');
    const title = document.getElementById('page-main-title');
    const isVisible = state.advancedOptionsOpen && !state.isHomePage && getCurrentCompareMode() === 'tracks';
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    if (btn) {
      btn.style.display = isVisible ? '' : 'none';
      btn.classList.toggle('is-mobile-heatmap-toggle', isMobile);
      btn.classList.toggle('is-active', isVisible && (isMobile ? state.displayOptions.heatmap : state.displayOptionsOpen));
      btn.setAttribute('aria-expanded', !isMobile && isVisible && state.displayOptionsOpen ? 'true' : 'false');
      btn.setAttribute('aria-pressed', isVisible && isMobile && state.displayOptions.heatmap ? 'true' : 'false');
      const label = btn.querySelector('span');
      const icon = btn.querySelector('i');
      if (label && isMobile) label.textContent = state.displayOptions.heatmap ? 'הסר מפת חום' : 'מפת חום';
      if (icon && isMobile) icon.className = state.displayOptions.heatmap ? 'fas fa-droplet-slash' : 'fas fa-circle-half-stroke';
    }
    if (title) title.style.display = isVisible ? 'none' : '';
    if (!isVisible || isMobile) {
      state.displayOptionsOpen = false;
      clearDisplayOptionsTimers();
      if (panel) {
        panel.classList.remove('is-open');
        panel.hidden = true;
      }
    } else if (panel) {
      if (state.displayOptionsOpen) {
        clearTimeout(displayOptionsCloseTimer);
        panel.hidden = false;
        requestAnimationFrame(() => panel.classList.add('is-open'));
        scheduleDisplayOptionsAutoClose();
        scheduleAdvancedOptionsAutoClose();
      } else {
        clearTimeout(displayOptionsAutoCloseTimer);
        panel.classList.remove('is-open');
        displayOptionsCloseTimer = setTimeout(() => {
          if (!state.displayOptionsOpen) panel.hidden = true;
        }, 260);
      }
    }

    const labels = {
      compact: state.compactTracksView ? 'תצוגה מרווחת' : 'תצוגה צפופה',
      heatmap: state.displayOptions.heatmap ? 'הסר מפת חום' : 'עדכן מפת חום',
      topThree: state.displayOptions.topThree ? 'הסר אייקון מספר 1,2,3 לשלושת המובילים' : 'עדכן אייקון מספר 1,2,3 לשלושת המובילים'
    };
    document.querySelectorAll('[data-display-select]').forEach(select => {
      const key = select.dataset.displaySelect;
      if (key && Object.prototype.hasOwnProperty.call(state.displayOptions, key)) {
        select.value = state.displayOptions[key];
      }
    });
    document.querySelectorAll('[data-display-option]').forEach(optionBtn => {
      const key = optionBtn.dataset.displayOption;
      const label = optionBtn.querySelector('span');
      if (label && labels[key]) label.textContent = labels[key];
      if (key === 'compact') {
        const icon = optionBtn.querySelector('i');
        optionBtn.classList.toggle('is-active', !!state.compactTracksView);
        optionBtn.setAttribute('aria-pressed', state.compactTracksView ? 'true' : 'false');
        if (icon) icon.className = state.compactTracksView ? 'fas fa-expand-alt' : 'fas fa-compress-alt';
      } else if (key && key !== 'reset') {
        optionBtn.classList.toggle('is-active', !!state.displayOptions[key]);
        optionBtn.setAttribute('aria-pressed', state.displayOptions[key] ? 'true' : 'false');
      }
    });
  }

  function applyDisplayOptionsChange(key) {
    if (key === 'compact') {
      toggleCompactTracksView();
      state.displayOptionsOpen = true;
      syncDisplayOptionsUi();
      scheduleDisplayOptionsAutoClose();
      scheduleAdvancedOptionsAutoClose();
      return;
    }
    if (key === 'reset') {
      state.displayOptions = { ...DEFAULT_DISPLAY_OPTIONS };
    } else if (Object.prototype.hasOwnProperty.call(state.displayOptions, key)) {
      state.displayOptions[key] = !state.displayOptions[key];
    }
    saveDisplayOptions();
    state.displayOptionsOpen = true;
    syncDisplayOptionsUi();
    scheduleDisplayOptionsAutoClose();
    scheduleAdvancedOptionsAutoClose();
    refreshDisplayOptionsTargets();
  }

  function setupDisplayOptions() {
    const btn = document.getElementById('display-options-toggle');
    const panel = document.getElementById('display-options-panel');
    if (btn) {
      btn.addEventListener('click', () => {
        state.advancedOptionsOpen = true;
        const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
        if (isMobile) {
          state.displayOptionsOpen = false;
          state.displayOptions.heatmap = !state.displayOptions.heatmap;
          saveDisplayOptions();
          refreshDisplayOptionsTargets();
        } else {
          state.displayOptionsOpen = !state.displayOptionsOpen;
        }
        syncAdvancedOptionsUi();
        syncDisplayOptionsUi();
        scheduleAdvancedOptionsAutoClose();
      });
    }
    if (panel) {
      panel.addEventListener('click', event => {
        const optionBtn = event.target.closest('[data-display-option]');
        if (!optionBtn || !panel.contains(optionBtn)) return;
        event.stopPropagation();
        applyDisplayOptionsChange(optionBtn.dataset.displayOption);
      });

      panel.addEventListener('change', event => {
        const select = event.target.closest('[data-display-select]');
        if (!select || !panel.contains(select)) return;
        event.stopPropagation();
        const key = select.dataset.displaySelect;
        if (!key) return;
        state.displayOptions[key] = select.value;
        saveDisplayOptions();
        state.displayOptionsOpen = true;
        syncDisplayOptionsUi();
        scheduleDisplayOptionsAutoClose();
        scheduleAdvancedOptionsAutoClose();
        refreshDisplayOptionsTargets();
      });

      panel.addEventListener('input', event => {
        const select = event.target.closest('[data-display-select]');
        if (!select || !panel.contains(select)) return;
        event.stopPropagation();
        const key = select.dataset.displaySelect;
        if (!key) return;
        state.displayOptions[key] = select.value;
        saveDisplayOptions();
        state.displayOptionsOpen = true;
        syncDisplayOptionsUi();
        refreshDisplayOptionsTargets();
      });

      panel.addEventListener('click', event => {
        if (event.target.closest('[data-display-select]')) event.stopPropagation();
      });
    }
    document.addEventListener('click', event => {
      if (!state.displayOptionsOpen) return;
      if (event.target.closest('#display-options-panel') || event.target.closest('#display-options-toggle')) return;
      state.displayOptionsOpen = false;
      syncDisplayOptionsUi();
      scheduleAdvancedOptionsAutoClose();
    });
    syncDisplayOptionsUi();
  }

  function syncAdvancedOptionsUi() {
    document.body.classList.toggle('advanced-options-open', !!state.advancedOptionsOpen);
    const advancedBtn = document.getElementById('advanced-options-tab');
    if (advancedBtn) {
      advancedBtn.classList.toggle('is-active', !!state.advancedOptionsOpen);
      advancedBtn.style.display = (state.isHomePage || state.activeCategoryId === 'sandbox' || state.activeCategoryId === 'h2h') ? 'none' : '';
      advancedBtn.setAttribute('aria-pressed', state.advancedOptionsOpen ? 'true' : 'false');
    }
    if (!state.advancedOptionsOpen) {
      clearAdvancedOptionsTimer();
      const sidebar = document.getElementById('sidebar');
      const filterBtn = document.getElementById('sidebar-toggle-btn');
      if (sidebar) sidebar.classList.add('sidebar-collapsed');
      if (filterBtn) filterBtn.classList.remove('active');
      state.customRange.open = false;
      state.displayOptionsOpen = false;
      syncCustomRangeControls();
    } else {
      scheduleAdvancedOptionsAutoClose();
    }
    syncHeaderContext(state.isHomePage ? 'home' : getCurrentCompareMode() === 'actuarial' ? 'comparison' : 'comparison');
    syncDisplayOptionsUi();
    syncTracksDensityClasses();
    syncMobileAppNav(state.isHomePage ? 'home' : state.activeCategoryId);
  }

  function showFeatureLockMessage() {
    const message = document.getElementById('feature-lock-message');
    if (!message) return;
    message.hidden = false;
    message.classList.add('is-visible');
    clearTimeout(message._hideTimer);
    message._hideTimer = setTimeout(() => {
      message.classList.remove('is-visible');
      setTimeout(() => { message.hidden = true; }, 220);
    }, 2800);
  }

  const PENSION_ACTUARIAL_CATS = new Set(['pension_mekafit', 'pension_mashlima']);

  function ensureMobileCategorySheet() {
    let sheet = document.getElementById('mobile-category-sheet');
    if (sheet) return sheet;

    const ACTUARIAL_LABELS = { pension_mekafit: 'איזון אקטוארי – מקיפה', pension_mashlima: 'איזון אקטוארי – כללית' };

    sheet = document.createElement('div');
    sheet.id = 'mobile-category-sheet';
    sheet.className = 'mobile-category-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="mobile-category-sheet-head">
        <strong>אפשרויות</strong>
        <button type="button" class="mobile-category-sheet-close" aria-label="סגור">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <div class="mobile-category-section-title">קטגוריות</div>
      <div class="mobile-category-sheet-list">
        ${CONFIG.PRODUCT_CATEGORIES.filter(cat => !REMOVED_CATEGORY_IDS.has(cat.id)).map(cat => `
          <button type="button" class="mobile-category-option" data-mobile-cat="${cat.id}">
            <span class="mobile-category-option-icon">${cat.icon || ''}</span>
            <span class="mobile-category-option-label">${cat.label}</span>
          </button>
          ${PENSION_ACTUARIAL_CATS.has(cat.id) ? `<button type="button" class="mobile-category-sub" data-mobile-cat-actuarial="${cat.id}"><i class="fas fa-balance-scale" aria-hidden="true"></i><span>${ACTUARIAL_LABELS[cat.id]}</span></button>` : ''}
        `).join('')}
      </div>
      <div class="mobile-category-sheet-divider"></div>
      <div class="mobile-category-section-title">מתקדם</div>
      <div class="mobile-category-sheet-extras">
        <button type="button" class="mobile-category-option mob-extra-range">
          <span class="mobile-category-option-icon">📅</span>
          <span class="mobile-category-option-label">טווח השקעה מותאם</span>
        </button>
        <button type="button" class="mobile-category-option mob-extra-search">
          <span class="mobile-category-option-icon">🔍</span>
          <span class="mobile-category-option-label">חיפוש מתקדם</span>
        </button>
        <button type="button" class="mobile-category-option mob-extra-fund-search">
          <span class="mobile-category-option-icon">🏦</span>
          <span class="mobile-category-option-label">חיפוש קופה</span>
        </button>
      </div>
      <div class="mob-opts-zoom">
        <div class="mob-opts-zoom-label-row">
          <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
          <span>התאמת גודל תצוגה</span>
          <span class="mob-opts-zoom-value" id="mob-opts-zoom-value">100%</span>
        </div>
        <input type="range" id="mob-opts-zoom-slider" class="mob-opts-zoom-slider"
               min="${MOBILE_ZOOM_MIN}" max="${MOBILE_ZOOM_MAX}" step="1" value="100"
               aria-label="התאמת גודל תצוגה במובייל" />
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('.mobile-category-sheet-close')?.addEventListener('click', closeMobileCategorySheet);

    const zoomSlider = sheet.querySelector('#mob-opts-zoom-slider');
    const zoomValueEl = sheet.querySelector('#mob-opts-zoom-value');
    zoomSlider.value = String(_sbGetMobileZoomPct());
    zoomValueEl.textContent = zoomSlider.value + '%';
    // While actively dragging, fade the menu itself down to near-transparent
    // so the user can see the tables underneath resize live and judge the
    // right zoom level — then restore it once they let go.
    const startZoomDrag = () => {
      sheet.classList.add('is-zoom-dragging');
    };
    zoomSlider.addEventListener('input', () => {
      const pct = _sbApplyMobileZoom(parseInt(zoomSlider.value, 10));
      zoomValueEl.textContent = pct + '%';
      startZoomDrag();
    });
    const endZoomDrag = () => {
      sheet.classList.remove('is-zoom-dragging');
      _sbSaveMobileZoomPct(parseInt(zoomSlider.value, 10));
    };
    zoomSlider.addEventListener('pointerdown', startZoomDrag);
    zoomSlider.addEventListener('touchstart', startZoomDrag, { passive: true });
    zoomSlider.addEventListener('change', endZoomDrag);
    zoomSlider.addEventListener('pointerup', endZoomDrag);
    zoomSlider.addEventListener('pointercancel', endZoomDrag);
    zoomSlider.addEventListener('touchend', endZoomDrag);
    zoomSlider.addEventListener('touchcancel', endZoomDrag);
    zoomSlider.addEventListener('blur', endZoomDrag);

    sheet.querySelectorAll('[data-mobile-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        closeMobileCategorySheet();
        switchCategory(btn.dataset.mobileCat);
      });
    });

    sheet.querySelectorAll('[data-mobile-cat-actuarial]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const catId = btn.dataset.mobileCatActuarial;
        closeMobileCategorySheet();
        state.pendingCompareMode = 'actuarial';
        switchCategory(catId);
      });
    });

    sheet.querySelector('.mob-extra-range')?.addEventListener('click', () => {
      closeMobileCategorySheet();
      if (!state.activeCategoryId || state.isHomePage) return;
      state.advancedOptionsOpen = true;
      state.customRange.open = true;
      syncAdvancedOptionsUi();
      // hoist panel to root so position:fixed works inside sticky-header on iOS
      const panel = document.getElementById('custom-range-panel');
      if (panel && panel.parentElement !== document.documentElement) {
        document.documentElement.appendChild(panel);
      }
      syncCustomRangeControls();
      if (panel) {
        panel.removeAttribute('hidden');
        Object.assign(panel.style, {
          position: 'fixed',
          top: '50px',
          left: '8px',
          right: '8px',
          zIndex: '9200',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 10px 32px rgba(15,39,68,0.22)',
          padding: '12px',
        });
      }
    });

    sheet.querySelector('.mob-extra-search')?.addEventListener('click', () => {
      closeMobileCategorySheet();
      openAdvancedSearch();
    });

    sheet.querySelector('.mob-extra-fund-search')?.addEventListener('click', () => {
      closeMobileCategorySheet();
      if (window.openMobileFundSearch) window.openMobileFundSearch();
    });

    return sheet;
  }

  function openMobileCategorySheet() {
    const sheet = ensureMobileCategorySheet();
    if (!sheet.hidden && sheet.classList.contains('is-open')) {
      closeMobileCategorySheet();
      return;
    }
    document.body.classList.add('mobile-category-sheet-open');
    hideMobileStickyThead();
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('is-open'));
    syncMobileCategorySheet();
    syncMobileAppNav();
  }

  function closeMobileCategorySheet() {
    const sheet = document.getElementById('mobile-category-sheet');
    document.body.classList.remove('mobile-category-sheet-open');
    if (!sheet) return;
    sheet.classList.remove('is-open', 'is-zoom-dragging');
    setTimeout(() => {
      if (!sheet.classList.contains('is-open')) sheet.hidden = true;
    }, 180);
    syncMobileAppNav();
  }

  function syncMobileCategorySheet() {
    const sheet = document.getElementById('mobile-category-sheet');
    if (!sheet) return;
    sheet.querySelectorAll('[data-mobile-cat]').forEach(btn => {
      const isActive = btn.dataset.mobileCat === state.activeCategoryId;
      const filterCount = getSavedFilterCountForCategory(btn.dataset.mobileCat);
      btn.classList.toggle('is-active', isActive);
      btn.classList.toggle('has-active-filters', filterCount > 0);
      let badge = btn.querySelector('.cat-filter-badge');
      if (filterCount > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'cat-filter-badge'; btn.appendChild(badge); }
        badge.innerHTML = `<i class="fas fa-filter" aria-hidden="true"></i><span>${filterCount}</span>`;
        badge.setAttribute('aria-label', `${filterCount} סינונים פעילים`);
      } else if (badge) {
        badge.remove();
      }
    });
    const isSbOrH2H = state.activeCategoryId === 'sandbox' || state.activeCategoryId === 'h2h';
    ['.mob-extra-range', '.mob-extra-search', '.mob-extra-fund-search'].forEach(sel => {
      const btn = sheet.querySelector(sel);
      if (!btn) return;
      btn.disabled = isSbOrH2H;
      btn.classList.toggle('is-disabled', isSbOrH2H);
    });
  }

  function syncMobileAppNav(activeTarget = state.activeCategoryId) {
    const nav = document.querySelector('.mobile-app-nav');
    if (!nav) return;
    const current = state.isHomePage ? 'home' : String(activeTarget || '');
    nav.querySelectorAll('[data-mobile-app-target]').forEach(item => {
      const target = item.dataset.mobileAppTarget;
      const active = (target !== 'categories' && target !== 'sidebar-filter' && target === current) ||
        (target === 'categories' && document.body.classList.contains('mobile-category-sheet-open')) ||
        (target === 'sidebar-filter' && (current === 'h2h' ? !!state.h2h.metricsOpen : document.body.classList.contains('mobile-filter-open'))) ||
        (target === 'filter' && !!state.advancedOptionsOpen && !state.isHomePage) ||
        (target === 'h2h' && current === 'h2h') ||
        (target === 'sandbox' && current === 'sandbox');
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
      if (target === 'filter' || target === 'sidebar-filter') {
        const disabled = state.isHomePage || current === 'sandbox';
        item.disabled = disabled;
        item.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        item.classList.toggle('is-disabled', disabled);
      }
      if (target === 'sidebar-filter') {
        const label = Array.from(item.querySelectorAll('span')).find(span => !span.classList.contains('mob-nav-icon-wrap') && !span.classList.contains('mob-nav-badge') && !span.classList.contains('nav-filter-dot'));
        const icon = item.querySelector('i');
        if (label) label.textContent = current === 'h2h' ? 'מדדים' : 'סינון';
        item.setAttribute('aria-label', current === 'h2h' ? 'בחירת מדדים להשוואה' : 'סינון');
        if (icon) {
          icon.classList.toggle('fa-filter', current !== 'h2h');
          icon.classList.toggle('fa-sliders', current === 'h2h');
        }
      }
    });
    syncMobileCategorySheet();
  }

  function setupMobileAppShell() {
    const nav = document.querySelector('.mobile-app-nav');
    if (!nav) return;
    nav.addEventListener('click', event => {
      const item = event.target.closest('[data-mobile-app-action]');
      if (!item || !nav.contains(item)) return;
      event.preventDefault();
      const action = item.dataset.mobileAppAction;
      // close any open sheet/drawer when switching nav items
      if (action !== 'categories') closeMobileCategorySheet();
      if (action !== 'sidebar-filter' && document.body.classList.contains('mobile-filter-open')) closeMobileFilterDrawer();
      if (action === 'categories') {
        openMobileCategorySheet();
      } else if (action === 'sidebar-filter') {
        if (state.activeCategoryId === 'h2h' && !state.isHomePage) {
          state.h2h.metricsOpen = !state.h2h.metricsOpen;
          renderH2H();
          syncMobileAppNav('h2h');
        } else if (document.body.classList.contains('mobile-filter-open')) {
          closeMobileFilterDrawer();
        } else {
          openMobileFilterDrawer();
        }
      } else if (action === 'h2h') {
        switchToH2H();
      } else if (action === 'sandbox') {
        switchToSandbox();
      } else if (action === 'login') {
        showFeatureLockMessage();
      }
    });
    syncMobileAppNav('home');

    function openMobileFilterDrawer() {
      const sidebar = document.getElementById('sidebar');
      const filters = document.getElementById('sidebar-filters');
      if (!sidebar) return;
      const sticky = sidebar.querySelector('.sidebar-sticky');
      sidebar.style.setProperty('position', 'fixed', 'important');
      sidebar.style.setProperty('top', '82px', 'important');
      sidebar.style.setProperty('right', '8px', 'important');
      sidebar.style.setProperty('width', 'min(268px, calc(100vw - 18px))', 'important');
      sidebar.style.setProperty('bottom', 'calc(66px + env(safe-area-inset-bottom, 0px))', 'important');
      sidebar.style.setProperty('z-index', '9050', 'important');
      sidebar.style.setProperty('background', '#fff', 'important');
      sidebar.style.setProperty('padding', '12px 12px', 'important');
      sidebar.style.setProperty('overflow-y', 'auto', 'important');
      sidebar.style.setProperty('box-shadow', '0 12px 28px rgba(15,39,68,0.18)', 'important');
      sidebar.style.setProperty('border', '1px solid rgba(201,183,114,0.45)', 'important');
      sidebar.style.setProperty('border-radius', '14px', 'important');
      sidebar.style.setProperty('max-width', 'none', 'important');
      sidebar.style.setProperty('display', 'block', 'important');
      sidebar.style.setProperty('pointer-events', 'auto', 'important');
      sidebar.style.setProperty('opacity', '1', 'important');
      sidebar.style.setProperty('visibility', 'visible', 'important');
      sidebar.style.setProperty('transform', 'none', 'important');
      sidebar.style.setProperty('transition', 'none', 'important');
      if (sticky) {
        sticky.style.setProperty('transition', 'none', 'important');
        sticky.style.setProperty('animation', 'none', 'important');
        sticky.style.setProperty('visibility', 'visible', 'important');
        sticky.style.setProperty('opacity', '1', 'important');
        sticky.style.setProperty('width', 'auto', 'important');
      }
      if (filters) filters.style.setProperty('display', 'block', 'important');
      document.body.classList.add('mobile-filter-open');
      syncMobileAppNav();
    }
    function closeMobileFilterDrawer() {
      const sidebar = document.getElementById('sidebar');
      const sticky = sidebar && sidebar.querySelector('.sidebar-sticky');
      const filters = document.getElementById('sidebar-filters');
      if (sidebar) sidebar.removeAttribute('style');
      if (sticky) sticky.removeAttribute('style');
      if (filters) filters.removeAttribute('style');
      document.body.classList.remove('mobile-filter-open');
      syncMobileAppNav();
    }
    document.addEventListener('click', e => {
      if (!document.body.classList.contains('mobile-filter-open')) return;
      if (!e.target.closest('#sidebar') && !e.target.closest('[data-mobile-app-action="sidebar-filter"]')) {
        closeMobileFilterDrawer();
      }
    });
  }

  // ── Mobile display zoom (options sheet slider) ──────────────────────────
  // Uses the CSS `zoom` property (not transform:scale) specifically because
  // it triggers a real layout recalculation — the rendered size of every
  // element shrinks/grows, so more (or less) of the table genuinely fits on
  // screen, not just a cosmetic shrink with empty margins.
  // Range kept intentionally narrow (85–110%) per explicit request: enough
  // to matter, not enough to break the mobile responsive layout.
  //
  // IMPORTANT: applied to .page-body (the wrapper around <main>, i.e. the
  // actual page content), not document.body/documentElement. Body-level
  // chrome — the bottom nav (.mobile-app-nav) and the options sheet itself
  // (appended straight to <body>) — are siblings of .page-body, not
  // descendants of it, so they're never affected by this. Two earlier
  // attempts got this wrong:
  //   - Zooming <html> broke updateMobileStickyThead()'s zoom-compensation
  //     (`toZoomSpace`), which specifically reads a body-level zoom.
  //   - Zooming <body> directly then dragged the bottom nav and the options
  //     sheet's own box into the zoomed scale with it (the sheet is a body
  //     child), which is what caused the "menu falls apart at high zoom"
  //     and "bottom nav shouldn't move" reports.
  // .page-body is the correct scope: it scales the tables (the actual goal)
  // without touching any body-level UI chrome.
  const MOBILE_ZOOM_KEY = 'gemelhub_mobile_zoom_v1';
  const MOBILE_ZOOM_MIN = 85;
  const MOBILE_ZOOM_MAX = 110;
  const MOBILE_ZOOM_DEFAULT = 100;

  function _sbMobileZoomTarget() {
    return document.querySelector('.page-body') || document.body;
  }

  function _sbGetMobileZoomPct() {
    const saved = parseInt(localStorage.getItem(MOBILE_ZOOM_KEY), 10);
    if (isNaN(saved)) return MOBILE_ZOOM_DEFAULT;
    return Math.max(MOBILE_ZOOM_MIN, Math.min(MOBILE_ZOOM_MAX, saved));
  }

  function _sbApplyMobileZoom(pct) {
    const clamped = Math.max(MOBILE_ZOOM_MIN, Math.min(MOBILE_ZOOM_MAX, pct || MOBILE_ZOOM_DEFAULT));
    _sbMobileZoomTarget().style.zoom = (clamped / 100);
    scheduleMobileStickyTheadUpdate();
    return clamped;
  }

  function _sbSaveMobileZoomPct(pct) {
    try { localStorage.setItem(MOBILE_ZOOM_KEY, String(pct)); } catch (e) { /* storage unavailable */ }
  }

  function _sbRestoreMobileZoom() {
    _sbApplyMobileZoom(_sbGetMobileZoomPct());
  }

  function ensureMobileOptionsSheet() {
    let sheet = document.getElementById('mobile-options-sheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'mobile-options-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'אפשרויות');
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="mob-opts-title">אפשרויות</div>
      <div id="mob-opts-no-category" hidden style="font-size:.8rem;color:#e53e3e;text-align:center;margin-bottom:8px;font-family:'Heebo',sans-serif;">אנא בחר קטגוריה תחילה</div>
      <button class="mob-opts-btn" id="mob-opts-range">
        <i class="fas fa-calendar-alt"></i>
        <span>טווח השקעה מותאם</span>
      </button>
      <button class="mob-opts-btn" id="mob-opts-search">
        <i class="fas fa-sliders"></i>
        <span>חיפוש מתקדם</span>
      </button>
      <button class="mob-opts-close" id="mob-opts-close">סגור</button>`;
    document.documentElement.appendChild(sheet);

    sheet.querySelector('#mob-opts-range').addEventListener('click', () => {
      if (!state.activeCategoryId || state.isHomePage) {
        const msg = document.getElementById('mob-opts-no-category');
        if (msg) { msg.hidden = false; setTimeout(() => { msg.hidden = true; }, 2500); }
        return;
      }
      closeMobileOptionsSheet();
      state.advancedOptionsOpen = true;
      state.customRange.open = true;
      syncAdvancedOptionsUi();
      syncCustomRangeControls();
    });
    sheet.querySelector('#mob-opts-search').addEventListener('click', () => {
      closeMobileOptionsSheet();
      openAdvancedSearch();
    });
    sheet.querySelector('#mob-opts-close').addEventListener('click', () => closeMobileOptionsSheet());
    document.addEventListener('click', e => {
      if (!sheet || sheet.hidden) return;
      if (!sheet.contains(e.target) && !e.target.closest('[data-mobile-app-action="filter"]')) {
        closeMobileOptionsSheet();
      }
    }, { capture: true });
    return sheet;
  }

  function openMobileOptionsSheet() {
    const sheet = ensureMobileOptionsSheet();
    sheet.hidden = false;
  }

  function closeMobileOptionsSheet() {
    const sheet = document.getElementById('mobile-options-sheet');
    if (sheet) sheet.hidden = true;
  }

  function setupCompactViewToggle() {
    const btn = document.getElementById('compact-view-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      toggleCompactTracksView();
    });
    syncCompactViewToggle();
  }

  function syncHeaderContext(section) {
    const filterBtn = document.getElementById('sidebar-toggle-btn');
    const customRangeEntry = document.getElementById('custom-range-entry');
    const searchWrap = document.querySelector('.title-search-bar .hero-search');
    const advancedSearchBtn = document.getElementById('advanced-search-open-btn');
    const isComparison = section === 'comparison';
    const isSandbox = section === 'sandbox' || state.activeCategoryId === 'sandbox';

    if (filterBtn) filterBtn.style.display = isComparison && state.advancedOptionsOpen && !isSandbox ? '' : 'none';
    if (searchWrap) {
      const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
      const fundSearchPending = !!state._pendingFundSearch;
      state._pendingFundSearch = false;
      searchWrap.style.display = isSandbox || (isMobile && state.advancedOptionsOpen && !fundSearchPending) ? 'none' : '';
      if (fundSearchPending) {
        setTimeout(() => {
          searchWrap.style.display = '';
          const inp = document.getElementById('global-search');
          if (inp) { inp.focus(); inp.select(); inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }, 80);
      }
    }
    if (customRangeEntry && !isComparison) customRangeEntry.hidden = true;
    if (advancedSearchBtn) advancedSearchBtn.hidden = isSandbox || !isComparison || !state.advancedOptionsOpen;
    syncCompactViewToggle();
    updateFilterBadge();
    syncDisplayOptionsUi();
  }

  function hideSandboxSearchControls() {
    resetAdvancedSearchState();
    state.advancedOptionsOpen = false;
    state.customRange.open = false;
    state.displayOptionsOpen = false;
    const searchInput = document.getElementById('global-search');
    const searchDropdown = document.getElementById('search-dropdown');
    if (searchInput) searchInput.blur();
    if (searchDropdown) searchDropdown.style.display = 'none';
    syncAdvancedOptionsUi();
  }

  function getDefaultActuarialRange() {
    const chronological = [...state.customRange.availablePeriods].sort((a, b) => a - b);
    if (!chronological.length) return { startPeriod: '', endPeriod: '' };
    const endPeriod = String(chronological[chronological.length - 1]);
    const startIndex = Math.max(0, chronological.length - 12);
    const startPeriod = String(chronological[startIndex]);
    return { startPeriod, endPeriod };
  }

  function getEffectiveActuarialRange() {
    if (state.customRange.active && state.customRange.startPeriod && state.customRange.endPeriod) {
      return {
        startPeriod: String(state.customRange.startPeriod),
        endPeriod: String(state.customRange.endPeriod),
        isCustom: true
      };
    }
    return { ...getDefaultActuarialRange(), isCustom: false };
  }

  function resetCustomRangeState() {
    state.customRange.open = false;
    state.customRange.active = false;
    state.customRange.loading = false;
    state.customRange.availabilityLoading = false;
    state.customRange.availablePeriods = [];
    state.customRange.availableYears = [];
    state.customRange.selectionMode = 'months';
    state.customRange.startPeriod = '';
    state.customRange.endPeriod = '';
    state.customRange.selectedYear = '';
    state.customRange.yieldMap = null;
    state.actuarial.rows = [];
    state.actuarial.loading = false;
    state.actuarial.rangeKey = '';
    state.actuarial.showAllYears = false;
  }

  function resetAdvancedSearchState() {
    state.advancedSearch.open = false;
    state.advancedSearch.mode = 'best';
    state.advancedSearch.params = [createAdvancedSearchParam()];
    state.advancedSearch.loading = false;
    state.advancedSearch.metricsLoading = false;
    state.advancedSearch.results = [];
    state.advancedSearch.metricMaps = null;
    const overlay = document.getElementById('advanced-search-overlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function getMonthCountBetween(startPeriod, endPeriod) {
    const startNum = Number(startPeriod);
    const endNum = Number(endPeriod);
    if (!startNum || !endNum || endNum < startNum) return 0;
    const startYear = Math.floor(startNum / 100);
    const startMonth = startNum % 100;
    const endYear = Math.floor(endNum / 100);
    const endMonth = endNum % 100;
    return ((endYear - startYear) * 12) + (endMonth - startMonth) + 1;
  }

  function getCustomRangeMonthCount() {
    return getMonthCountBetween(state.customRange.startPeriod, state.customRange.endPeriod);
  }

  function formatRangeLabel(startPeriod, endPeriod) {
    if (!startPeriod || !endPeriod) return 'טווח מותאם';
    const monthCount = getMonthCountBetween(startPeriod, endPeriod);
    const suffix = monthCount ? ` · ${monthCount} חודשים` : '';
    return `${formatReportPeriod(startPeriod)} - ${formatReportPeriod(endPeriod)}${suffix}`;
  }

  function formatRangePeriodOnly(startPeriod, endPeriod) {
    if (!startPeriod || !endPeriod) return '';
    // אם נבחרה שנה שלמה — הצג רק את השנה
    if (state.customRange.selectionMode === 'year' && state.customRange.selectedYear) {
      return String(state.customRange.selectedYear);
    }
    // אחרת — הצג טווח חודשים
    return `${formatReportPeriod(startPeriod)} – ${formatReportPeriod(endPeriod)}`;
  }

  function formatCustomRangeToggleLabel() {
    const baseLabel = getCurrentCompareMode() === 'actuarial'
      ? 'בחר טווח איזון אקטוארי'
      : 'בחר טווח השקעה מותאם';
    if (!state.customRange.active) return baseLabel;
    if (state.customRange.startPeriod && state.customRange.endPeriod) {
      const monthCount = getMonthCountBetween(state.customRange.startPeriod, state.customRange.endPeriod);
      const suffix = monthCount ? ` (${monthCount} חודשים)` : '';
      return `הטווח שנבחר מ${formatReportPeriod(state.customRange.startPeriod)} עד ${formatReportPeriod(state.customRange.endPeriod)}${suffix}`;
    }
    return baseLabel;
  }

  function formatReportPeriodShort(period) {
    if (!period) return '';
    const s = String(period);
    const year = s.substring(2, 4);
    const month = parseInt(s.substring(4, 6), 10);
    const shortMonths = {
      1: 'ינו׳',
      2: 'פבר׳',
      3: 'מרץ',
      4: 'אפר׳',
      5: 'מאי',
      6: 'יונ׳',
      7: 'יול׳',
      8: 'אוג׳',
      9: 'ספט׳',
      10: 'אוק׳',
      11: 'נוב׳',
      12: 'דצמ׳'
    };
    return `${shortMonths[month] || month} ${year}`;
  }

  function setCustomRangeStatus(message = '') {
    const statusEl = document.getElementById('custom-range-status');
    if (statusEl) statusEl.textContent = message;
  }

  function setCustomRangeMeta(message = '') {
    const metaEl = document.getElementById('custom-range-meta');
    if (metaEl) metaEl.textContent = message;
  }

  function syncCustomRangeControls() {
    const entry = document.getElementById('custom-range-entry');
    const toggle = document.getElementById('custom-range-toggle');
    const toggleLabel = document.getElementById('custom-range-toggle-label');
    const panel = document.getElementById('custom-range-panel');
    const applyBtn = document.getElementById('custom-range-apply');
    const clearBtn = document.getElementById('custom-range-clear');
    const startSelect = document.getElementById('custom-range-start');
    const endSelect = document.getElementById('custom-range-end');
    const yearSelect = document.getElementById('custom-range-year');
    const modeButtons = document.querySelectorAll('[data-range-mode]');
    const monthFields = document.querySelectorAll('[data-range-fields="months"]');
    const yearFields = document.querySelectorAll('[data-range-fields="year"]');

    if (!entry || !toggle || !panel || !applyBtn || !clearBtn || !startSelect || !endSelect || !yearSelect) return;

    const enabled = isCustomRangeFeatureEnabled() && !state.isHomePage && !!state.activeCategoryId;
    const isLoading = state.customRange.loading || state.customRange.availabilityLoading;
    entry.hidden = !enabled;
    panel.hidden = !enabled || !state.customRange.open;
    toggle.setAttribute('aria-expanded', enabled && state.customRange.open ? 'true' : 'false');
    toggle.setAttribute('aria-busy', enabled && isLoading ? 'true' : 'false');
    toggle.disabled = !enabled;
    toggle.classList.toggle('is-active', state.customRange.active);
    toggle.classList.toggle('is-loading', isLoading);
    toggle.classList.remove('attention-pulse');
    if (enabled && !state.customRange.open) {
      void toggle.offsetWidth;
      toggle.classList.add('attention-pulse');
    }
    toggleLabel.textContent = state.customRange.availabilityLoading && !state.customRange.availablePeriods.length
      ? 'טוען נתונים היסטוריים...'
      : formatCustomRangeToggleLabel();

    const hasPeriods = state.customRange.availablePeriods.length > 1;
    const isYearMode = state.customRange.selectionMode === 'year';
    modeButtons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.rangeMode === state.customRange.selectionMode));
    monthFields.forEach(field => {
      field.hidden = isYearMode;
      field.style.display = isYearMode ? 'none' : 'flex';
    });
    yearFields.forEach(field => {
      field.hidden = !isYearMode;
      field.style.display = isYearMode ? 'flex' : 'none';
    });

    if (state.customRange.availabilityLoading && !hasPeriods) {
      setCustomRangeStatus('טוען נתונים היסטוריים עבור טווח מותאם. האפשרות תיפתח בעוד כמה שניות...');
    }

    const canApply = enabled
      && hasPeriods
      && !isLoading
      && (
        (!isYearMode && !!startSelect.value && !!endSelect.value && Number(startSelect.value) <= Number(endSelect.value))
        || (isYearMode && !!yearSelect.value)
      );

    startSelect.disabled = !enabled || isLoading || !hasPeriods;
    endSelect.disabled = !enabled || isLoading || !hasPeriods;
    yearSelect.disabled = !enabled || isLoading || !state.customRange.availableYears.length;
    applyBtn.disabled = !canApply;
    clearBtn.disabled = !enabled || isLoading || !state.customRange.active;

    if (!hasPeriods && enabled && !state.customRange.availabilityLoading) {
      setCustomRangeStatus('');
    }

    if (enabled && hasPeriods) {
      const monthCount = isYearMode
        ? getMonthCountBetween(state.customRange.startPeriod, state.customRange.endPeriod)
        : getMonthCountBetween(startSelect.value, endSelect.value);
      setCustomRangeMeta(monthCount ? `הטווח שנבחר כולל ${monthCount} חודשים` : '');
    } else {
      setCustomRangeMeta('');
    }
  }

  function fillCustomRangeSelect(selectEl, selectedValue, availablePeriods) {
    if (!selectEl) return;
    const displayPeriods = [...availablePeriods].sort((a, b) => b - a);
    const options = displayPeriods.map(period => {
      const selected = String(period) === String(selectedValue) ? ' selected' : '';
      return `<option value="${period}"${selected}>${formatReportPeriod(period)}</option>`;
    });
    selectEl.innerHTML = options.join('');
  }

  function fillCustomRangeYearSelect(selectEl, selectedValue, availableYears) {
    if (!selectEl) return;
    const options = availableYears.map(year => {
      const selected = String(year) === String(selectedValue) ? ' selected' : '';
      return `<option value="${year}"${selected}>${year}</option>`;
    });
    selectEl.innerHTML = options.join('');
  }

  function syncCustomRangeFromYear(yearValue) {
    const selectedYear = Number(yearValue);
    if (!selectedYear) {
      state.customRange.startPeriod = '';
      state.customRange.endPeriod = '';
      state.customRange.selectedYear = '';
      return;
    }
    const periodsForYear = state.customRange.availablePeriods
      .filter(period => Math.floor(Number(period) / 100) === selectedYear)
      .sort((a, b) => a - b);
    state.customRange.selectedYear = String(selectedYear);
    state.customRange.startPeriod = periodsForYear.length ? String(periodsForYear[0]) : '';
    state.customRange.endPeriod = periodsForYear.length ? String(periodsForYear[periodsForYear.length - 1]) : '';
  }

  function hydrateCustomRangePeriodOptions() {
    const startSelect = document.getElementById('custom-range-start');
    const endSelect = document.getElementById('custom-range-end');
    const yearSelect = document.getElementById('custom-range-year');
    const available = state.customRange.availablePeriods;
    if (!startSelect || !endSelect || !yearSelect) return;

    if (!available.length) {
      startSelect.innerHTML = '<option value="">אין נתונים</option>';
      endSelect.innerHTML = '<option value="">אין נתונים</option>';
      yearSelect.innerHTML = '<option value="">אין נתונים</option>';
      startSelect.value = '';
      endSelect.value = '';
      yearSelect.value = '';
      syncCustomRangeControls();
      return;
    }

    const chronological = [...available].sort((a, b) => a - b);
    const years = Array.from(new Set(chronological.map(period => Math.floor(Number(period) / 100)))).sort((a, b) => b - a);
    const defaultStart = state.customRange.startPeriod || String(chronological[Math.max(0, chronological.length - 24)]);
    const defaultEnd = state.customRange.endPeriod || String(chronological[chronological.length - 1]);
    const defaultYear = state.customRange.selectedYear || String(years[0] || '');

    state.customRange.availableYears = years;
    state.customRange.startPeriod = String(defaultStart);
    state.customRange.endPeriod = String(defaultEnd);
    state.customRange.selectedYear = defaultYear;

    fillCustomRangeSelect(startSelect, state.customRange.startPeriod, chronological);
    fillCustomRangeSelect(endSelect, state.customRange.endPeriod, chronological);
    fillCustomRangeYearSelect(yearSelect, state.customRange.selectedYear, years);
    if (state.customRange.selectionMode === 'year') {
      syncCustomRangeFromYear(state.customRange.selectedYear);
    }
    if (getCurrentCompareMode() === 'actuarial') {
      setCustomRangeStatus('מחשב איזון אקטוארי לטווח שנבחר...');
    }
    syncCustomRangeControls();
  }

  async function refreshCustomRangeAvailability() {
    if (!state.activeCategoryId || state.isHomePage || !isCustomRangeFeatureEnabled()) {
      resetCustomRangeState();
      syncCustomRangeControls();
      return;
    }

    state.customRange.availabilityLoading = true;
    syncCustomRangeControls();

    try {
      const periods = await APIModule.getAvailableReportPeriods(state.activeCategoryId, state.targetPopulation);
      state.customRange.availablePeriods = periods;
      state.customRange.startPeriod = '';
      state.customRange.endPeriod = '';
      state.customRange.selectedYear = '';
      state.customRange.yieldMap = null;
      state.customRange.active = false;
      resetCustomRangeSorts();
      hydrateCustomRangePeriodOptions();
      setCustomRangeStatus('');
    } finally {
      state.customRange.availabilityLoading = false;
      syncCustomRangeControls();
    }
  }

  async function applyCustomRangeSelection() {
    const startSelect = document.getElementById('custom-range-start');
    const endSelect = document.getElementById('custom-range-end');
    const yearSelect = document.getElementById('custom-range-year');
    if (!startSelect || !endSelect || !yearSelect || !state.activeCategoryId) return;

    if (state.customRange.selectionMode === 'year') {
      syncCustomRangeFromYear(yearSelect.value);
    }

    const startPeriod = Number(state.customRange.selectionMode === 'year' ? state.customRange.startPeriod : startSelect.value);
    const endPeriod = Number(state.customRange.selectionMode === 'year' ? state.customRange.endPeriod : endSelect.value);
    if (!startPeriod || !endPeriod || endPeriod < startPeriod) {
      setCustomRangeStatus('יש לבחור טווח חודשים תקין מהחודש המוקדם אל המאוחר.');
      return;
    }

    state.customRange.loading = true;
    state.customRange.startPeriod = String(startPeriod);
    state.customRange.endPeriod = String(endPeriod);
    if (getCurrentCompareMode() === 'actuarial') {
      setCustomRangeStatus('מחשב איזון אקטוארי לטווח שנבחר...');
    }
    setCustomRangeStatus('מחשב תשואה מותאמת לטווח שנבחר...');
    syncCustomRangeControls();

    try {
      if (getCurrentCompareMode() === 'actuarial') {
        state.customRange.yieldMap = null;
      } else {
        state.customRange.yieldMap = await APIModule.getCustomRangeYields(
          state.activeCategoryId,
          startPeriod,
          endPeriod,
          state.targetPopulation
        );
      }
      state.customRange.active = true;
      state.customRange.open = false;
      setCustomRangeStatus('');
      setCustomRangeMeta(`הטווח שנבחר כולל ${getMonthCountBetween(startPeriod, endPeriod)} חודשים`);
      // מיון אוטומטי לפי עמודת הטווח המותאם (מהגבוה לנמוך)
      if (getCurrentCompareMode() !== 'actuarial') {
        state.showExposure = false;
        state.yieldMode = 'cumulative';
        clearAllYearlyTrackStates();
        state.organizedData.forEach(item => {
          item.sortField = 'customRange';
          item.sortDir   = 'desc';
        });
      }
      await renderComparisonView();
    } catch (error) {
      console.error(error);
      setCustomRangeStatus('לא הצלחנו לחשב את הטווח המותאם כרגע. אפשר לנסות שוב.');
    } finally {
      state.customRange.loading = false;
      syncCustomRangeControls();
    }
  }

  function resetCustomRangeSorts() {
    state.organizedData.forEach(item => {
      if (item.sortField === 'customRange') {
        item.sortField = '1yr';
        item.sortDir = 'desc';
      }
    });
  }

  function clearCustomRangeSelection() {
    resetCustomRangeSorts();
    state.customRange.active = false;
    state.customRange.loading = false;
    state.customRange.yieldMap = null;
    state.customRange.open = false;
    state.customRange.selectionMode = 'months';
    setCustomRangeStatus('');
    syncCustomRangeControls();
    if (!state.isHomePage) renderComparisonView();
  }

  function setupCustomRange() {
    const toggle = document.getElementById('custom-range-toggle');
    const applyBtn = document.getElementById('custom-range-apply');
    const clearBtn = document.getElementById('custom-range-clear');
    const startSelect = document.getElementById('custom-range-start');
    const endSelect = document.getElementById('custom-range-end');
    const yearSelect = document.getElementById('custom-range-year');
    const modeButtons = document.querySelectorAll('[data-range-mode]');

    if (!toggle || !applyBtn || !clearBtn || !startSelect || !endSelect || !yearSelect) return;

    toggle.addEventListener('click', () => {
      if (!isCustomRangeFeatureEnabled() || state.isHomePage || !state.activeCategoryId) return;
      state.advancedOptionsOpen = true;
      state.customRange.open = !state.customRange.open;
      if (state.customRange.open && state.customRange.availabilityLoading && !state.customRange.availablePeriods.length) {
        setCustomRangeStatus('טוען נתונים היסטוריים עבור טווח מותאם. האפשרות תיפתח בעוד כמה שניות...');
      }
      syncAdvancedOptionsUi();
      syncCustomRangeControls();
    });

    startSelect.addEventListener('change', () => {
      state.customRange.startPeriod = startSelect.value;
      syncCustomRangeControls();
    });

    endSelect.addEventListener('change', () => {
      state.customRange.endPeriod = endSelect.value;
      syncCustomRangeControls();
    });

    yearSelect.addEventListener('change', () => {
      syncCustomRangeFromYear(yearSelect.value);
      syncCustomRangeControls();
    });

    modeButtons.forEach(button => {
      button.addEventListener('click', () => {
        state.customRange.selectionMode = button.dataset.rangeMode === 'year' ? 'year' : 'months';
        if (state.customRange.selectionMode === 'year') {
          syncCustomRangeFromYear(yearSelect.value || state.customRange.selectedYear);
        }
        syncCustomRangeControls();
      });
    });

    applyBtn.addEventListener('click', applyCustomRangeSelection);
    clearBtn.addEventListener('click', clearCustomRangeSelection);
    syncCustomRangeControls();
  }

  function buildCategoryTabs() {
    const bar = document.getElementById('category-tabs');
    bar.innerHTML = '';
    // "דף בית" כרטיסייה ראשונה
    const homeBtn = document.createElement('button');
    homeBtn.className = 'cat-tab active';
    homeBtn.dataset.cat = 'home';
    homeBtn.innerHTML = '<span class="tab-icon">🏠</span><span>דף בית</span>';
    homeBtn.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); showHomePage(); });
    bar.appendChild(homeBtn);

    const advancedBtn = document.createElement('button');
    advancedBtn.type = 'button';
    advancedBtn.className = 'cat-tab advanced-options-tab';
    advancedBtn.id = 'advanced-options-tab';
    advancedBtn.innerHTML = '<span class="tab-icon"><i class="fas fa-sliders-h" aria-hidden="true"></i></span><span>אפשרויות מתקדמות</span>';
    advancedBtn.setAttribute('aria-pressed', state.advancedOptionsOpen ? 'true' : 'false');
    advancedBtn.addEventListener('click', () => {
      state.advancedOptionsOpen = !state.advancedOptionsOpen;
      syncAdvancedOptionsUi();
      if (state.advancedOptionsOpen) scheduleAdvancedOptionsAutoClose();
    });
    bar.appendChild(advancedBtn);

    CONFIG.PRODUCT_CATEGORIES.filter(cat => !REMOVED_CATEGORY_IDS.has(cat.id)).forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-tab';
      btn.dataset.cat = cat.id;
      btn.innerHTML = `<span class="tab-icon">${cat.icon}</span><span>${cat.label}</span>`;
      btn.addEventListener('click', () => {
        switchCategory(cat.id);
      });
      bar.appendChild(btn);
    });

    // ── כפתור המעבדה ──
    const sandboxBtn = document.createElement('button');
    sandboxBtn.className = 'cat-tab sandbox-tab';
    sandboxBtn.dataset.cat = 'sandbox';
    sandboxBtn.innerHTML = '<span class="tab-icon">🧪</span><span>המעבדה שלי</span><span class="sandbox-tab-badge" style="display:none"></span>';
    sandboxBtn.addEventListener('click', () => { window.scrollTo({top:0,behavior:'smooth'}); switchToSandbox(); });
    bar.appendChild(sandboxBtn);

    // ── כפתור ראש בראש ──
    const h2hBtn = document.createElement('button');
    h2hBtn.className = 'cat-tab h2h-tab';
    h2hBtn.dataset.cat = 'h2h';
    h2hBtn.innerHTML = '<span class="tab-icon">⚖️</span><span>ראש בראש</span><span class="h2h-tab-badge" style="display:none"></span>';
    h2hBtn.addEventListener('click', () => { window.scrollTo({top:0,behavior:'smooth'}); switchToH2H(); });
    bar.appendChild(h2hBtn);
    updateH2HTabBadge(getPersistedH2HItemCount());

    // Header nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const cid = link.dataset.cat;
        if (cid === 'home') showHomePage();
        else if (cid) {
          switchCategory(cid);
        }
      });
    });
  }

  // ─── SWITCH CATEGORY ─────────────────────────────────────────
  async function switchCategory(catId) {
    if (REMOVED_CATEGORY_IDS.has(catId)) {
      showHomePage();
      return;
    }
    updateHeroContent(catId);
    state.isHomePage = false;
    state.activeCategoryId = catId;
    const requestedCompareMode = state.pendingCompareMode;
    state.compareMode = requestedCompareMode === 'actuarial' && isActuarialModeAvailable(catId) ? 'actuarial' : 'tracks';
    state.pendingCompareMode = null;
    if (state.compareMode !== 'actuarial') {
      state.pendingActuarialFundId = null;
      state.pendingActuarialCompanyName = null;
      state.pendingActuarialHighlightDone = false;
    }
    loadSavedFilterState(catId);
    resetCustomRangeState();
    resetAdvancedSearchState();
    syncCustomRangeControls();

    setActiveTab(catId);
    updateSidebarBadge(catId);
    showSection('comparison');

    // sticky header
    const filterBtn = document.getElementById('sidebar-toggle-btn');
    if (filterBtn) filterBtn.style.display = '';

    // פתח את סרגל הסינון אוטומטית בכניסה לדף השוואה
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('sidebar-collapsed', !state.advancedOptionsOpen);
      if (filterBtn) filterBtn.classList.toggle('active', state.advancedOptionsOpen);
    }
    syncTracksDensityClasses();

    // count bar — מוצג בדפי השוואה
    const countBar = document.getElementById('tracks-count-bar');
    if (countBar) countBar.style.display = 'none';

    // גלול לראש עכשיו — לפני שה-overlay עולה, כדי שה-bypass של smooth-scroll יעבוד
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    document.documentElement.style.scrollBehavior = '';

    await loadCategory(catId);
    startRotatingCtaPopup(10000);
  }

  function setActiveTab(catId) {
    document.querySelectorAll('.cat-tab[data-cat]').forEach(t =>
      t.classList.toggle('active', t.dataset.cat === catId));
    document.querySelectorAll('.nav-link').forEach(l =>
      l.classList.toggle('active', l.dataset.cat === catId));
    syncMobileAppNav(catId);
    syncAdvancedOptionsUi();
  }

  function updateSidebarBadge(catId) {
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId);
    if (!cat) return;
    // כותרת ב-sticky header
    document.getElementById('page-main-title').textContent = cat.label;
  }

  function getFilterStorageCategoryKey(catId = state.activeCategoryId) {
    return String(catId || '');
  }

  function readFilterStorage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FILTER_STATE_STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch(e) {
      return {};
    }
  }

  function writeFilterStorage(data) {
    try {
      localStorage.setItem(FILTER_STATE_STORAGE_KEY, JSON.stringify(data || {}));
    } catch(e) {}
  }

  function categoryUsesTargetPopulation(catId = state.activeCategoryId) {
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId);
    return !!cat && !cat.pensionAPI && !cat.polisaAPI;
  }

  function normalizeFilterState(raw = {}) {
    return {
      selectedTracks: Array.isArray(raw.selectedTracks) ? raw.selectedTracks.map(String) : [],
      selectedProviders: Array.isArray(raw.selectedProviders) ? raw.selectedProviders.map(String) : [],
      excludedProviders: Array.isArray(raw.excludedProviders) ? raw.excludedProviders.map(String) : [],
      targetPopulation: raw.targetPopulation || DEFAULT_TARGET_POPULATION
    };
  }

  function getActiveFilterCount(catId = state.activeCategoryId) {
    let count = state.selectedTracks.size + state.selectedProviders.size + state.excludedProviders.size;
    if (categoryUsesTargetPopulation(catId) && state.targetPopulation !== DEFAULT_TARGET_POPULATION) count += 1;
    return count;
  }

  function getSavedFilterCountForCategory(catId) {
    const key = getFilterStorageCategoryKey(catId);
    if (!key) return 0;
    if (key === getFilterStorageCategoryKey(state.activeCategoryId)) return getActiveFilterCount(catId);
    const saved = normalizeFilterState(readFilterStorage()[key]);
    let count = saved.selectedTracks.length + saved.selectedProviders.length + saved.excludedProviders.length;
    if (categoryUsesTargetPopulation(catId) && saved.targetPopulation !== DEFAULT_TARGET_POPULATION) count += 1;
    return count;
  }

  function updateFilterBadge() {
    const count = getActiveFilterCount();
    ['sidebar-toggle-btn', 'mobile-filter-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      let badge = btn.querySelector('.filter-count-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'filter-count-badge';
        btn.appendChild(badge);
      }
      const hasFilters = count > 0 && btn.style.display !== 'none';
      badge.textContent = hasFilters ? String(count) : '';
      badge.hidden = !hasFilters;
      btn.classList.toggle('has-active-filters', hasFilters);
      const base = id === 'mobile-filter-btn' ? 'פתח/סגור סינון' : 'הצג/הסתר פילטרים';
      btn.setAttribute('aria-label', hasFilters ? `${base}, ${count} סינונים פעילים` : base);
      btn.title = hasFilters ? `${base} (${count} סינונים פעילים)` : base;
    });
    // indicator on mobile nav "סינון" button — only show when the current category supports filtering
    const navFilterBtn = document.querySelector('[data-mobile-app-action="sidebar-filter"]');
    if (navFilterBtn) {
      const NO_FILTER_CATS = new Set(['h2h', 'sandbox']);
      const categoryHasFilter = !state.isHomePage && !NO_FILTER_CATS.has(state.activeCategoryId);
      const hasFilters = count > 0 && categoryHasFilter;
      let dot = navFilterBtn.querySelector('.nav-filter-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'nav-filter-dot';
        const iconWrap = navFilterBtn.querySelector('.mob-nav-icon-wrap');
        (iconWrap || navFilterBtn).appendChild(dot);
      }
      dot.textContent = hasFilters ? String(count) : '';
      dot.hidden = !hasFilters;
    }
    syncMobileCategorySheet();
  }

  function saveCurrentFilterState(catId = state.activeCategoryId) {
    const key = getFilterStorageCategoryKey(catId);
    if (!key || !CONFIG.PRODUCT_CATEGORIES.some(c => c.id === key)) {
      updateFilterBadge();
      return;
    }
    const all = readFilterStorage();
    const entry = {
      selectedTracks: [...state.selectedTracks],
      selectedProviders: [...state.selectedProviders],
      excludedProviders: [...state.excludedProviders],
      targetPopulation: state.targetPopulation || DEFAULT_TARGET_POPULATION
    };
    const isEmpty = entry.selectedTracks.length === 0 &&
      entry.selectedProviders.length === 0 &&
      entry.excludedProviders.length === 0 &&
      (!categoryUsesTargetPopulation(key) || entry.targetPopulation === DEFAULT_TARGET_POPULATION);
    if (isEmpty) delete all[key];
    else all[key] = entry;
    writeFilterStorage(all);
    updateFilterBadge();
  }

  function loadSavedFilterState(catId) {
    const saved = normalizeFilterState(readFilterStorage()[getFilterStorageCategoryKey(catId)]);
    state.selectedTracks = new Set(saved.selectedTracks);
    state.selectedProviders = new Set(saved.selectedProviders);
    state.excludedProviders = new Set(saved.excludedProviders);
    state.targetPopulation = categoryUsesTargetPopulation(catId) ? saved.targetPopulation : DEFAULT_TARGET_POPULATION;
    updateFilterBadge();
  }

  function pruneSavedTrackFilters(availableTrackIds) {
    const available = new Set(availableTrackIds);
    const before = state.selectedTracks.size;
    state.selectedTracks = new Set([...state.selectedTracks].filter(trackId => available.has(trackId)));
    if (state.selectedTracks.size !== before) saveCurrentFilterState();
  }

  function pruneSavedProviderFilters(availableProviderKeys) {
    const available = new Set(availableProviderKeys);
    const selectedBefore = state.selectedProviders.size;
    const excludedBefore = state.excludedProviders.size;
    state.selectedProviders = new Set([...state.selectedProviders].filter(key => available.has(key)));
    state.excludedProviders = new Set([...state.excludedProviders].filter(key => available.has(key)));
    if (state.selectedProviders.size !== selectedBefore || state.excludedProviders.size !== excludedBefore) {
      saveCurrentFilterState();
    }
  }

  function showSection(section) {
    document.getElementById('home-section').style.display    = section==='home'       ? 'block' : 'none';
    document.getElementById('compare-section').style.display = section==='comparison' ? 'block' : 'none';
    document.getElementById('h2h-section').style.display     = section==='h2h'        ? 'block' : 'none';
    const sandboxEl = document.getElementById('sandbox-section');
    if (sandboxEl) sandboxEl.style.display = section==='sandbox' ? 'block' : 'none';
    if (section !== 'sandbox') _sbHideValueBar();
    // הסתר את שורת החיפוש/סינון בקטגוריית ראש בראש
    document.body.classList.toggle('h2h-active', section === 'h2h');
    document.body.classList.toggle('sandbox-active', section === 'sandbox');
    if (section === 'sandbox') hideSandboxSearchControls();
    syncHeaderContext(section);
  }

  function setupCompareModeToggle() {
    const toggle = document.getElementById('compare-mode-toggle');
    if (!toggle) return;
    toggle.querySelectorAll('[data-compare-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const requestedMode = btn.dataset.compareMode === 'actuarial' ? 'actuarial' : 'tracks';
        if (requestedMode === getCurrentCompareMode()) return;
        state.compareMode = requestedMode;
        state.customRange.active = false;
        state.customRange.open = false;
        state.customRange.loading = false;
        state.customRange.yieldMap = null;
        syncCustomRangeControls();
        renderComparisonView();
      });
    });
  }

  function updateCompareModeUi() {
    const toggle = document.getElementById('compare-mode-toggle');
    const actuarialContainer = document.getElementById('actuarial-container');
    const tracksContainer = document.getElementById('tracks-container');
    const trackSection = document.getElementById('filter-tracks')?.closest('.sidebar-section');
    const countBar = document.getElementById('tracks-count-bar');
    const exportBtn = document.getElementById('btn-export');
    const mode = getCurrentCompareMode();
    const actuarialAvailable = isActuarialModeAvailable();

    if (toggle) {
      const sidebarCollapsed = !!document.getElementById('sidebar')?.classList.contains('sidebar-collapsed');
      toggle.hidden = !actuarialAvailable || sidebarCollapsed;
      toggle.style.display = (actuarialAvailable && !sidebarCollapsed) ? '' : 'none';
      toggle.querySelectorAll('[data-compare-mode]').forEach(btn => {
        const active = btn.dataset.compareMode === mode;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }
    if (actuarialContainer) actuarialContainer.hidden = mode !== 'actuarial';
    if (actuarialContainer) actuarialContainer.classList.toggle('actuarial-container-raised', mode === 'actuarial' && actuarialAvailable);
    if (tracksContainer) tracksContainer.style.display = mode === 'actuarial' ? 'none' : 'block';
    if (tracksContainer) tracksContainer.classList.toggle('tracks-container-pension-raised', mode === 'tracks' && actuarialAvailable);
    if (tracksContainer) {
      const sidebarCollapsed = !!document.getElementById('sidebar')?.classList.contains('sidebar-collapsed');
      tracksContainer.classList.toggle('mode-toggle-hidden', actuarialAvailable && sidebarCollapsed);
    }
    if (trackSection) trackSection.style.display = mode === 'actuarial' ? 'none' : '';
    if (countBar) countBar.style.display = 'none';
    if (exportBtn) {
      exportBtn.innerHTML = mode === 'actuarial'
        ? '<i class="fas fa-file-csv"></i> ייצוא איזון אקטוארי'
        : '<i class="fas fa-file-csv"></i> ייצוא ל-CSV';
    }
    syncCompactViewToggle();
    syncTracksDensityClasses();
  }

  function updateComparisonUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('app');
    if (state.activeCategoryId) {
      url.searchParams.set('cat', state.activeCategoryId);
      if (getCurrentCompareMode() === 'actuarial') {
        url.searchParams.set('view', 'actuarial');
        if (state.pendingActuarialFundId) url.searchParams.set('fund', state.pendingActuarialFundId);
        else url.searchParams.delete('fund');
        if (state.pendingActuarialCompanyName) url.searchParams.set('provider', state.pendingActuarialCompanyName);
        else url.searchParams.delete('provider');
      } else {
        url.searchParams.delete('view');
        url.searchParams.delete('fund');
        url.searchParams.delete('provider');
      }
    } else {
      url.searchParams.delete('cat');
      url.searchParams.delete('view');
      url.searchParams.delete('fund');
      url.searchParams.delete('provider');
    }
    history.replaceState({ catId: state.activeCategoryId, view: getCurrentCompareMode() }, '', url.toString());
  }

  function updateAppPageUrl(appId) {
    const url = new URL(window.location.href);
    url.searchParams.delete('cat');
    url.searchParams.delete('track');
    url.searchParams.delete('view');
    url.searchParams.delete('fund');
    url.searchParams.delete('provider');
    if (appId) url.searchParams.set('app', appId);
    else url.searchParams.delete('app');
    history.replaceState({ app: appId || 'home' }, '', url.toString());
  }

  async function renderComparisonView() {
    updateFilterBadge();
    updateCompareModeUi();
    if (getCurrentCompareMode() === 'actuarial') {
      await loadActuarialComparisonData();
      renderActuarialComparison();
    } else {
      renderTracks();
    }
    updateComparisonUrl();
    updateFilterBadge();
    // The mobile sticky-thead clone caches column count/positions from the
    // last time it rendered — if a custom-range column gets added/removed
    // (or any other column change) without a scroll/resize event happening
    // right after, the clone would keep showing stale columns until the
    // user scrolls again. Force it to recompute now, not just on next scroll.
    scheduleMobileStickyTheadUpdate();
  }

  // ─── HOME PAGE ───────────────────────────────────────────────
  async function showHomePage() {
    state.pendingTrackId = null;
    state.pendingCompareTopScroll = false;
    return switchCategory('hashtalamot');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateHeroContent('home');
    state.isHomePage = true;
    state.activeCategoryId = null;
    state.compareMode = 'tracks';
    state.pendingCompareMode = null;
    state.pendingActuarialFundId = null;
    state.pendingActuarialCompanyName = null;
    state.pendingActuarialHighlightDone = false;
    resetCustomRangeState();
    resetAdvancedSearchState();
    syncCustomRangeControls();
    updateComparisonUrl();
    setActiveTab('home');
    showSection('home');
    // sticky header — task 3: לא מציגים "ברוכים הבאים" ליד שורת החיפוש
    document.getElementById('page-main-title').textContent = '';
    const filterBtn = document.getElementById('sidebar-toggle-btn');
    if (filterBtn) filterBtn.style.display = 'none';
    updateFilterBadge();
    // task 1: hero — תמיד מוצג (לא מסתירים)
    // count bar — מוסתר בדף הבית
    const countBar = document.getElementById('tracks-count-bar');
    if (countBar) countBar.style.display = 'none';
    document.getElementById('sidebar-filters').style.display = 'none';
    updateCompareModeUi();
    stopRotatingCtaPopup();

    const homeEl = document.getElementById('home-section');
    homeEl.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>טוען נתוני מובילים...</p></div>';

    try {
      // task 9: 3×3 — 9 כרטיסים (3 שורות × 3 קטגוריות)
      const [
        gemelAge50, gemelStocks, gemelAge5060,
        hashStocks, hashKaklali, hashSP500,
        hashkaaKaklali, hashkaaStocks, hashkaaAshraiAgach
      ] = await Promise.all([
        APIModule.getTop3('gemel_tagmulim', 'ad_gil_50', 3),
        APIModule.getTop3('gemel_tagmulim', 'maniот', 3),
        APIModule.getTop3('gemel_tagmulim', 'gil_50_60', 3),
        APIModule.getTop3('hashtalamot', 'maniот', 3),
        APIModule.getTop3('hashtalamot', 'kaklali', 3),
        APIModule.getTop3('hashtalamot', 'sp500', 3),
        APIModule.getTop3('gemel_hashkaa', 'kaklali', 3),
        APIModule.getTop3('gemel_hashkaa', 'maniот', 3),
        APIModule.getTop3('gemel_hashkaa', 'ashrai_agach', 3)
      ]);

      const gemelHomeRows = [gemelAge50, gemelStocks, gemelAge5060];
      const hashHomeRows = [hashStocks, hashKaklali, hashSP500];
      const hashkaaHomeRows = [hashkaaKaklali, hashkaaStocks, hashkaaAshraiAgach];
      const homeInsightCandidates = [
        { label: 'גמל עד גיל 50', rows: gemelAge50, catId: 'gemel_tagmulim', trackId: 'ad_gil_50' },
        { label: 'גמל מניות', rows: gemelStocks, catId: 'gemel_tagmulim', trackId: 'maniот' },
        { label: 'גמל גיל 50-60', rows: gemelAge5060, catId: 'gemel_tagmulim', trackId: 'gil_50_60' },
        { label: 'השתלמות מניות', rows: hashStocks, catId: 'hashtalamot', trackId: 'maniот' },
        { label: 'השתלמות כללי', rows: hashKaklali, catId: 'hashtalamot', trackId: 'kaklali' },
        { label: 'השתלמות S&P 500', rows: hashSP500, catId: 'hashtalamot', trackId: 'sp500' },
        { label: 'גמל להשקעה כללי', rows: hashkaaKaklali, catId: 'gemel_hashkaa', trackId: 'kaklali' },
        { label: 'גמל להשקעה מניות', rows: hashkaaStocks, catId: 'gemel_hashkaa', trackId: 'maniот' },
        { label: 'גמל להשקעה אשראי ואג"ח', rows: hashkaaAshraiAgach, catId: 'gemel_hashkaa', trackId: 'ashrai_agach' }
      ];
      const initialInsights = buildHomeDynamicInsights(homeInsightCandidates);

      homeEl.innerHTML = buildHomePage(
        gemelHomeRows,
        hashHomeRows,
        hashkaaHomeRows,
        initialInsights
      );
      bindHomeInteractiveElements(homeEl);

      // טען גם את ה-searchable
      state.searchableRecords = await APIModule.getAllSearchable();
    } catch (e) {
      homeEl.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>שגיאה בטעינת הנתונים</p></div>';
    }
  }

  // task 9: 3×3 — 3 שורות × 3 קטגוריות
  function buildHomePage(gemelRows, hashRows, hashkaaRows, dynamicInsights = []) {
    const allRecords = [...gemelRows, ...hashRows, ...hashkaaRows].flat();
    const firstRecord = allRecords.find(r => r && r.REPORT_PERIOD);
    const lastUpdate = firstRecord ? formatReportPeriod(firstRecord.REPORT_PERIOD) : '';
    const dateNote = lastUpdate
      ? `<span class="home-date-note">נתונים נכונים עד סוף חודש ${lastUpdate}</span>`
      : '';
    return `
      <div class="home-dashboard">
        <section class="home-panel-section" id="home-interesting-now">
          <div class="home-section-head">
            <div>
              <span class="home-kicker">מה מעניין עכשיו</span>
              <h3>איתותים מהנתונים האחרונים</h3>
            </div>
            ${dateNote}
          </div>
          <div class="home-interesting-panel">
            <div class="home-insight-grid" data-home-insights>
              ${renderHomeInsightPair(dynamicInsights, 0)}
            </div>
          </div>
        </section>

        <section class="home-panel-section" id="home-popular-tracks">
          <div class="home-section-head">
            <div>
              <span class="home-kicker">השוואה מהירה</span>
              <h3>מסלולים פופולריים</h3>
            </div>
            <button class="home-small-action" type="button" data-home-action="search">חיפוש קופה</button>
          </div>
          <div class="home-popular-panel">
            <div class="home-popular-grid">
              ${buildPopularTrackCard('fa-layer-group', 'השתלמות כללי', 'השוואה רחבה למסלול ברירת מחדל נפוץ', hashRows[1], 'hashtalamot', 'kaklali')}
              ${buildPopularTrackCard('fa-chart-line', 'גמל להשקעה מניות', 'מתאים למי שבודק חשיפה גבוהה לשוק המניות', hashkaaRows[1], 'gemel_hashkaa', 'maniот')}
              ${buildPopularTrackCard('fa-user-clock', 'גמל עד גיל 50', 'מסלול גיל מרכזי בקופות גמל', gemelRows[0], 'gemel_tagmulim', 'ad_gil_50')}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderHomeInsightPair(insights, startIndex = 0) {
    if (!Array.isArray(insights) || !insights.length) return '';
    const pairSize = Math.min(2, insights.length);
    return Array.from({ length: pairSize }, (_, offset) => {
      const item = insights[(startIndex + offset) % insights.length];
      return buildHomeInsightCard(item);
    }).join('');
  }

  function bindHomeInteractiveElements(homeEl) {
    if (!homeEl) return;
    homeEl.querySelectorAll('.htc-head-clickable').forEach(el => {
      if (el.dataset.homeBound === '1') return;
      el.dataset.homeBound = '1';
      el.addEventListener('click', () => {
        state.pendingTrackId = el.dataset.track || null;
        state.pendingCompareTopScroll = true;
        switchCategory(el.dataset.goto);
      });
    });
    homeEl.querySelectorAll('[data-home-action]').forEach(el => {
      if (el.dataset.homeBound === '1') return;
      el.dataset.homeBound = '1';
      el.addEventListener('click', () => {
        const action = el.dataset.homeAction;
        if (action === 'h2h') {
          switchToH2H();
          return;
        }
        if (action === 'search') {
          const input = document.getElementById('global-search');
          input?.focus();
          input?.select?.();
          return;
        }
        if (action === 'popular') {
          document.getElementById('home-popular-tracks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
    homeEl.querySelectorAll('.fund-name-link').forEach(el => {
      if (el.dataset.homeBound === '1') return;
      el.dataset.homeBound = '1';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const fundId = el.dataset.fundid;
        const catId  = el.dataset.catid;
        if (fundId) window.location.href = `fund.html?id=${fundId}&cat=${catId}`;
      });
    });
  }

  function scrollToComparisonTableTop() {
    const target = (state.pendingTrackId && document.querySelector(`#tracks-container .track-block[data-track-id="${CSS.escape(state.pendingTrackId)}"]`))
      || document.querySelector('#tracks-container .track-block')
      || document.getElementById('tracks-container')
      || document.getElementById('tracks-area');
    if (!target) return;
    if (state.pendingTrackFocusOnly && target.classList?.contains('track-block')) {
      scrollToTrackTableFirstRow(target, 'auto', { onlyIfNeeded: false });
      return;
    }
    const rowTop = (() => {
      if (!target.classList?.contains('track-block')) return target.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      const sameRowBlocks = Array.from(document.querySelectorAll('#tracks-container .track-block'))
        .filter(block => Math.abs(block.getBoundingClientRect().top - targetTop) < 12);
      return (sameRowBlocks.length ? sameRowBlocks : [target])
        .reduce((min, block) => Math.min(min, block.getBoundingClientRect().top), targetTop);
    })();
    const offset = getTrackScrollOffset();
    const y = rowTop + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
    // On mobile, getTrackScrollOffset() reads document.body's mobile-sticky-header-fixed class,
    // which normally only updates off the native 'scroll' event — not guaranteed to fire before
    // the next of the 5 retries below reads it again, so a stale (still-false) class means the
    // header's height never gets subtracted and the next retry can overshoot past row 1. This one
    // targeted line keeps that class in sync with where we just scrolled to, so each retry works
    // off current information instead of whatever it was several hundred ms ago.
    updateMobileStickyHeader();
  }

  function startMobileFirstTableScrollGuard() {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    if (!isMobile) return;
    requestAnimationFrame(() => {
      scrollToComparisonTableTop();
      state.pendingInitialTableTopScroll = false;
    });
  }

  function getTrackScrollOffset() {
    const rootStyle = getComputedStyle(document.documentElement);
    const heroH = parseFloat(rootStyle.getPropertyValue('--hero-h')) || 0;
    const stickyGap = parseFloat(rootStyle.getPropertyValue('--sticky-table-gap')) || 0;
    const mobileHeaderH = parseFloat(rootStyle.getPropertyValue('--mobile-sticky-header-h')) || 0;
    const stickyHeader = document.querySelector('.sticky-header');
    const stickyH = stickyHeader && getComputedStyle(stickyHeader).display !== 'none'
      ? stickyHeader.getBoundingClientRect().height
      : 0;
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    if (isMobile) {
      return document.body.classList.contains('mobile-sticky-header-fixed') ? mobileHeaderH : 0;
    }
    return heroH + stickyGap + stickyH;
  }

  function scrollToTrackBlockTop(block, behavior = 'smooth') {
    if (!block) return;
    const y = block.getBoundingClientRect().top + window.scrollY - getTrackScrollOffset();
    window.scrollTo({ top: Math.max(0, y), behavior });
  }

  function getTrackTableFirstRowScrollTarget(block) {
    if (!block) return;
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    if (!isMobile) return null;
    const firstRow = block.querySelector('.track-table-wrapper tbody tr:not(.average-row)');
    const trackHeader = block.querySelector('.track-header');
    const thead = block.querySelector('.track-table-wrapper thead');
    if (!firstRow || !trackHeader || !thead) return null;
    const logoHeight = document.querySelector('.mobile-table-logo-bar')?.getBoundingClientRect().height || 0;
    const desiredTop = logoHeight + trackHeader.getBoundingClientRect().height + thead.getBoundingClientRect().height + 2;
    return {
      desiredTop,
      top: firstRow.getBoundingClientRect().top,
      y: firstRow.getBoundingClientRect().top + window.scrollY - desiredTop
    };
  }

  function scrollToTrackTableFirstRow(block, behavior = 'smooth', options = {}) {
    if (!block) return;
    const target = getTrackTableFirstRowScrollTarget(block);
    if (!target) {
      scrollToTrackBlockTop(block, behavior);
      return;
    }
    if (options.onlyIfNeeded && Math.abs(target.top - target.desiredTop) <= 14) return;
    window.scrollTo({ top: Math.max(0, target.y), behavior });
  }

  function scheduleTrackTableFirstRowScroll(block, options = {}) {
    const behavior = options.behavior || 'smooth';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToTrackTableFirstRow(block, behavior, options));
    });
  }

  function navigateToTrackTable(categoryId, trackId) {
    if (!categoryId || REMOVED_CATEGORY_IDS.has(categoryId)) return;
    state.pendingTrackId = trackId || null;
    state.pendingCompareTopScroll = !!trackId;
    switchCategory(categoryId);
  }

  async function buildHomeSupplementalInsights(candidates) {
    const insights = [];
    const fmt = (value) => Number.isFinite(value) ? formatPercent(value) : '-';
    const pname = (record) => record ? getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION) : '-';
    const compareButton = (item) => item ? `<button type="button" class="home-insight-cta htc-head-clickable" data-goto="${item.catId}" data-track="${item.trackId || ''}">פתח השוואה מלאה</button>` : '';

    try {
      const leaderItems = candidates
        .map(item => ({ ...item, top: item.rows?.[0] || null }))
        .filter(item => item.top?.FUND_ID);
      const streakChecks = await Promise.all(leaderItems.slice(0, 8).map(async item => {
        const history = await APIModule.getFundHistory(item.top.FUND_ID, item.catId);
        const latestHistory = [...(history || [])].sort((a, b) => Number(b.REPORT_PERIOD) - Number(a.REPORT_PERIOD));
        let streak = 0;
        for (const row of latestHistory) {
          const monthlyYield = parseFloat(row.MONTHLY_YIELD);
          if (!Number.isFinite(monthlyYield) || monthlyYield >= 0) break;
          streak += 1;
        }
        return { ...item, streak, lastYield: parseFloat(latestHistory[0]?.MONTHLY_YIELD) };
      }));
      const negativeStreak = streakChecks
        .filter(item => item.streak >= 2)
        .sort((a, b) => b.streak - a.streak || a.lastYield - b.lastYield)[0];
      if (negativeStreak) {
        insights.push({
          tone: 'negative',
          icon: 'fa-arrow-trend-down',
          title: 'רצף תשואות שלילי',
          text: `${negativeStreak.label}: ${pname(negativeStreak.top)} עם ${negativeStreak.streak} חודשים שליליים ברצף.`,
          detail: `התשואה החודשית האחרונה היא ${fmt(negativeStreak.lastYield)}. רצף כזה לא אומר שצריך לפעול מיד, אבל הוא כן דגל טוב לבדיקה מול מסלולים דומים. ${compareButton(negativeStreak)}`
        });
      }
    } catch (err) {}

    try {
      const periods = await APIModule.getAvailableReportPeriods('pension_mekafit');
      if (periods.length) {
        const chronological = [...periods].sort((a, b) => a - b);
        const endPeriod = String(chronological[chronological.length - 1]);
        const startPeriod = String(chronological[Math.max(0, chronological.length - 12)]);
        const actuarialRows = await APIModule.getActuarialComparison('pension_mekafit', startPeriod, endPeriod);
        const bestActuarial = [...actuarialRows]
          .filter(row => Number.isFinite(row.totalAdjustment))
          .sort((a, b) => b.totalAdjustment - a.totalAdjustment)[0];
        if (bestActuarial) {
          insights.push({
            tone: 'actuarial',
            icon: 'fa-scale-balanced',
            title: 'איזון אקטוארי חריג לטובה',
            text: `${bestActuarial.companyName} מובילה באיזון אקטוארי עם ${fmt(bestActuarial.totalAdjustment)} ב-12 החודשים האחרונים.`,
            detail: `הבדיקה מבוססת על קרנות פנסיה מקיפות בתקופה ${formatReportPeriod(startPeriod)} עד ${formatReportPeriod(endPeriod)}. איזון אקטוארי חיובי יכול להשפיע על התוצאה נטו של החוסך, לצד תשואות ודמי ניהול. <button type="button" class="home-insight-cta htc-head-clickable" data-goto="pension_mekafit" data-track="">פתח השוואת פנסיה</button>`
          });
        }
      }
    } catch (err) {}

    return insights;
  }

  function buildHomeDynamicInsights(candidates, supplementalInsights = []) {
    const withYields = candidates.map(item => {
      const rows = item.rows || [];
      const top = rows[0] || null;
      const second = rows[1] || null;
      const third = rows[2] || null;
      const topYield = top?.__YIELD_12M__;
      const secondYield = second?.__YIELD_12M__;
      const thirdYield = third?.__YIELD_12M__;
      return {
        ...item,
        top,
        second,
        third,
        topYield,
        secondYield,
        thirdYield,
        gap12: Number.isFinite(topYield) && Number.isFinite(secondYield) ? Math.abs(topYield - secondYield) : null,
        spreadTop3: Number.isFinite(topYield) && Number.isFinite(thirdYield) ? Math.abs(topYield - thirdYield) : null
      };
    }).filter(item => item.top && Number.isFinite(item.topYield));

    const providerWins = new Map();
    withYields.forEach(item => {
      const name = getProviderDisplayName(item.top.CONTROLLING_CORPORATION, item.top.MANAGING_CORPORATION);
      providerWins.set(name, (providerWins.get(name) || 0) + 1);
    });
    const strongest = [...withYields].sort((a, b) => b.topYield - a.topYield)[0];
    const closest = [...withYields].filter(item => Number.isFinite(item.gap12)).sort((a, b) => a.gap12 - b.gap12)[0];
    const widest = [...withYields].filter(item => Number.isFinite(item.spreadTop3)).sort((a, b) => b.spreadTop3 - a.spreadTop3)[0];
    const dominant = [...providerWins.entries()].sort((a, b) => b[1] - a[1])[0];
    const surprising = [...withYields].filter(item => item.label.includes('כללי') || item.label.includes('עד גיל')).sort((a, b) => b.topYield - a.topYield)[0];
    const sp500 = withYields.find(item => item.trackId === 'sp500');
    const stocks = [...withYields].filter(item => item.label.includes('מניות')).sort((a, b) => b.topYield - a.topYield)[0];
    const fmt = (value) => Number.isFinite(value) ? formatPercent(value) : '-';
    const pname = (record) => record ? getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION) : '-';
    const compareButton = (item) => item ? `<button type="button" class="home-insight-cta htc-head-clickable" data-goto="${item.catId}" data-track="${item.trackId || ''}">פתח השוואה מלאה</button>` : '';
    const pool = [
      strongest && {
        tone: 'hot',
        icon: 'fa-fire',
        title: 'המסלול עם התשואה הבולטת',
        text: `${strongest.label}: ${pname(strongest.top)} מוביל עם ${fmt(strongest.topYield)} ב-12 חודשים.`,
        detail: `מקום 2: ${pname(strongest.second)} עם ${fmt(strongest.secondYield)}. הפער מהמקום השני הוא ${Number.isFinite(strongest.gap12) ? strongest.gap12.toFixed(2) + '%' : 'לא זמין'}. ${compareButton(strongest)}`
      },
      closest && {
        tone: 'tight',
        icon: 'fa-bolt',
        title: 'קרב צמוד במיוחד',
        text: `${closest.label}: רק ${closest.gap12.toFixed(2)}% מפרידים בין המקום הראשון לשני.`,
        detail: `המוביל הוא ${pname(closest.top)} עם ${fmt(closest.topYield)}, אחריו ${pname(closest.second)} עם ${fmt(closest.secondYield)}. במצב כזה כדאי לבדוק גם 3 ו-5 שנים, לא רק 12 חודשים. ${compareButton(closest)}`
      },
      widest && {
        tone: 'gap',
        icon: 'fa-arrows-left-right-to-line',
        title: 'פער גדול בתוך אותו מסלול',
        text: `${widest.label}: הפער בין מקום 1 ל-3 מגיע ל-${widest.spreadTop3.toFixed(2)}%.`,
        detail: `${pname(widest.top)} מוביל עם ${fmt(widest.topYield)}, בעוד מקום 3 הוא ${pname(widest.third)} עם ${fmt(widest.thirdYield)}. זה איתות למסלול שבו בחירת מנהל משנה יותר. ${compareButton(widest)}`
      },
      dominant && {
        tone: 'manager',
        icon: 'fa-ranking-star',
        title: 'מנהל שחוזר במקומות הראשונים',
        text: `${dominant[0]} מופיע במקום הראשון ב-${dominant[1]} מסלולים מתוך הרשימה המהירה.`,
        detail: `האיתות מבוסס על המובילים ב-12 חודשים במסלולים הפופולריים בדף הבית. זה לא מספיק כהמלצה, אבל כן שווה בדיקה רוחבית מול מסלולים נוספים.`
      },
      surprising && {
        tone: 'steady',
        icon: 'fa-compass',
        title: 'מסלול כללי עם מספר מעניין',
        text: `${surprising.label}: ${pname(surprising.top)} מוביל עם ${fmt(surprising.topYield)}.`,
        detail: `במסלולים כלליים הפערים לפעמים פחות דרמטיים ממניות, ולכן נתון גבוה ב-12 חודשים יכול להצדיק בדיקה של עקביות ל-3 ו-5 שנים. ${compareButton(surprising)}`
      },
      sp500 && {
        tone: 'index',
        icon: 'fa-chart-simple',
        title: 'בדיקת מסלול מדד',
        text: `${sp500.label}: ${pname(sp500.top)} מוביל כרגע עם ${fmt(sp500.topYield)}.`,
        detail: `במסלולים עוקבי מדד חשוב לבדוק אם הפערים נובעים מתזמון, עקיבה, דמי ניהול או מבנה מסלול. ${compareButton(sp500)}`
      },
      stocks && {
        tone: 'stocks',
        icon: 'fa-arrow-trend-up',
        title: 'מסלולי מניות זזים חזק',
        text: `${stocks.label}: המוביל מציג ${fmt(stocks.topYield)} ב-12 חודשים.`,
        detail: `זהו איתות למסלול תנודתי יותר. כדאי לפתוח השוואה ולבדוק אם אותה קופה מובילה גם בטווחי 3 ו-5 שנים. ${compareButton(stocks)}`
      }
    ].filter(Boolean);
    const prioritized = [...supplementalInsights, ...pool];
    const seen = new Set();
    return prioritized.filter(item => {
      const key = `${item.title}|${item.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort(() => Math.random() - 0.5);
  }

  function buildHomeInsightCard(item) {
    return `
      <details class="home-insight-card home-insight-${item.tone || 'default'}">
        <summary>
          <span class="home-insight-icon"><i class="fas ${item.icon}" aria-hidden="true"></i></span>
          <span class="home-insight-copy">
            <strong>${item.title}</strong>
            <p>${item.text}</p>
          </span>
          <i class="fas fa-chevron-down home-insight-open" aria-hidden="true"></i>
        </summary>
        <div class="home-insight-detail">${item.detail}</div>
      </details>`;
  }

  function buildPopularTrackCard(icon, title, text, records, catId, trackId) {
    const leader = records?.[0];
    const leaderName = leader ? getProviderDisplayName(leader.CONTROLLING_CORPORATION, leader.MANAGING_CORPORATION) : '';
    const leaderYield = leader?.__YIELD_12M__;
    return `
      <article class="home-popular-card htc-head-clickable" data-goto="${catId}" data-track="${trackId || ''}" title="פתח השוואה מלאה">
        <div class="home-popular-top">
          <span class="home-popular-icon"><i class="fas ${icon}" aria-hidden="true"></i></span>
          <i class="fas fa-chevron-left home-popular-arrow" aria-hidden="true"></i>
        </div>
        <h4>${title}</h4>
        <p>${text}</p>
        <div class="home-popular-leader">
          <span>מוביל 12 חוד׳</span>
          <strong>${leaderName || '-'}</strong>
          <b class="${Number.isFinite(leaderYield) ? yieldClass(leaderYield) : ''}">${Number.isFinite(leaderYield) ? formatPercent(leaderYield) : '-'}</b>
        </div>
      </article>`;
  }

  // task 8: הוסף trackId לניווט ישיר למסלול
  function buildHomeTopCard(icon, title, subtitle, records, catId, trackId) {
    const rows = records.map((r, i) => {
      const name  = getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION);
      const color = providerColor(name);
      const y12mValue = r.__YIELD_12M__ ?? getActive12MMap()?.get(String(r.FUND_ID)) ?? null;
      const y12m  = y12mValue == null ? '-' : formatPercent(y12mValue);
      const fundId = r.FUND_ID || '';
      return `
        <div class="top-card-row">
          <span class="top-rank rank-${i+1}">${i+1}</span>
          <span class="top-dot" style="background:${color}"></span>
          <span class="top-name fund-name-link" data-fundid="${fundId}" data-catid="${catId}" title="לחץ לפרטי הקופה">${name} <i class="fas fa-external-link-alt" style="font-size:.6rem;color:#94a3b8;"></i></span>
          <span class="top-yield ${y12mValue == null ? '' : yieldClass(y12mValue)}">${y12m}</span>
        </div>
      `;
    }).join('');

    const empty = records.length === 0
      ? '<div class="top-empty">אין נתונים זמינים</div>' : '';

    return `
      <div class="home-top-card">
        <div class="htc-head htc-head-clickable" data-goto="${catId}" data-track="${trackId||''}" title="לחץ להשוואה מלאה">
          <span class="htc-icon">${icon}</span>
          <div class="htc-head-text">
            <div class="htc-title" style="font-size:1rem;color:var(--blue);font-weight:800;">${subtitle}</div>
          </div>
          <span class="htc-arrow"><i class="fas fa-chevron-left"></i></span>
        </div>
        <div class="htc-rows">${rows}${empty}</div>
      </div>
    `;
  }

  // ─── LOAD CATEGORY ───────────────────────────────────────────
  function resetYearlyReturnsMode() {
    state.yieldMode = 'cumulative';
    state.yearlyReturns.loading = false;
    state.yearlyReturns.categoryId = null;
    state.yearlyReturns.targetPopulation = null;
    state.yearlyReturns.requestId += 1;
    state.yearlyReturns.yearCount = 5;
    state.yearlyReturns.loadedYearCount = 0;
    state.yearlyReturns.activeTrackId = null;
    state.yearlyReturns.years = [];
    state.yearlyReturns.yieldMap = null;
    state.yearlyByTrack.clear();
    state.organizedData.forEach(item => {
      if (/^year_\d{4}$/.test(item.sortField)) {
        item.sortField = '1yr';
        item.sortDir = 'desc';
      }
    });
  }

  function scheduleTrailing7YLoad(catId, requestId) {
    const run = () => {
      APIModule.getTrailing7Yields(catId, state.targetPopulation)
        .then(map => {
          if (state.activeCategoryId !== catId || state.trailing7Y.requestId !== requestId) return;
          state.trailing7Y.map = map;
          state.trailing7Y.loading = false;
          state.trailing7Y.error = null;
          renderComparisonView();
        })
        .catch(error => {
          console.warn('7 year trailing yield load failed', error);
          if (state.activeCategoryId !== catId || state.trailing7Y.requestId !== requestId) return;
          state.trailing7Y.loading = false;
          state.trailing7Y.error = 'failed';
          renderComparisonView();
        });
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 0);
  }
  async function loadCategory(catId) {
    document.getElementById('sidebar-filters').style.display = '';
    showLoading(true);
    const requestedCategoryId = catId;
    resetYearlyReturnsMode();

    // Kicked off immediately (not awaited) so all three gemel/pension/polisa "current" datasets
    // start fetching in true parallel with whichever one this category actually needs below —
    // previously this only fired *after* the current category had already rendered, so switching
    // to a category needing a different family right after landing on the page could still hit a
    // fetch that hadn't even started yet. Firing it here instead means that by the time a user
    // switches tabs, the other families are very likely already cached (fetchCurrentGemelData()/
    // fetchPensionData()/fetchPolisaData() are single-flight, so this doesn't duplicate whatever
    // the current category's own fetch below also needs).
    Promise.all([
      APIModule.getAllSearchable().catch(() => []),
      APIModule.getAllSearchablePension().catch(() => []),
      APIModule.getAllSearchablePolisa().catch(() => [])
    ]).then(([s, sp, spo]) => { state.searchableRecords = [...s, ...sp, ...spo]; });

    try {
      const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId);
      const isPensionCat = !!(cat && cat.pensionAPI);
      const isPolisaCat  = !!(cat && cat.polisaAPI);
      const isExternalCat = isPensionCat || isPolisaCat;
      state.trailing7Y.categoryId = catId;
      state.trailing7Y.targetPopulation = state.targetPopulation;
      state.trailing7Y.map = null;
      state.trailing7Y.loading = true;
      state.trailing7Y.error = null;
      state.trailing7Y.requestId += 1;
      const trailing7YRequestId = state.trailing7Y.requestId;

      const [organized, yields12M, yields12MPension, yields12MPolisa] = await Promise.all([
        APIModule.getOrganizedData({
          categoryId:       catId,
          targetPopulation: state.targetPopulation,
          selectedProviders: new Set()
        }),
        isExternalCat  ? Promise.resolve(null) : APIModule.get12MYields(),
        isPensionCat   ? APIModule.get12MYieldsPension()  : Promise.resolve(null),
        isPolisaCat    ? APIModule.get12MYieldsPolisa()   : Promise.resolve(null),
      ]);
      state.organizedData    = organized;
      state.yields12M        = yields12M;
      state.yields12MPension = yields12MPension;
      state.yields12MPolisa  = yields12MPolisa;
      buildTrackFilters(organized, catId);
      buildProviderFilters(organized);
      setupPopulationRadio();
      updatePageTitle(catId, organized);
      if (state.pendingCompareTopScroll && state.pendingTrackId && !state.pendingTrackFocusOnly) {
        state.selectedTracks.delete(state.pendingTrackId);
        document.querySelectorAll('#filter-tracks input:checked').forEach(input => {
          input.checked = false;
          input.closest('.filter-checkbox')?.classList.remove('checked');
        });
      }
      renderComparisonView();
      showLoading(false);
      scheduleTrailing7YLoad(requestedCategoryId, trailing7YRequestId);

      // רקע: טווח מותאם — לא חוסם את הרינדור (נתוני חיפוש כבר הופעלו למעלה, מיד עם תחילת הטעינה)
      refreshCustomRangeAvailability()
        .then(() => {
          if (state.activeCategoryId === requestedCategoryId) renderComparisonView();
          if (state.activeCategoryId === requestedCategoryId && state.pendingCompareTopScroll) {
            setTimeout(scrollToComparisonTableTop, 0);
          }
        })
        .catch(() => {});

      // Restored to the exact pre-session implementation (manual pixel math + repeated retries) —
      // every attempt this session at a "smarter" version (scrollIntoView, scroll-margin-top,
      // scanning for pinned/sticky elements) regressed this in a new way. This one is proven.
      // Reload intentionally does NOT scroll at all anymore (see the removed
      // pendingInitialTableTopScroll branch below) — that was a separate, confirmed-working fix
      // and is unrelated to this track-jump path.
      if (state.pendingCompareTopScroll) {
        setTimeout(scrollToComparisonTableTop, 100);
        setTimeout(scrollToComparisonTableTop, 500);
        setTimeout(scrollToComparisonTableTop, 1200);
        setTimeout(scrollToComparisonTableTop, 2200);
        setTimeout(() => {
          scrollToComparisonTableTop();
          state.pendingTrackId = null;
          state.pendingCompareTopScroll = false;
          state.pendingTrackFocusOnly = false;
        }, 2800);
      } else if (state.pendingTrackId && getCurrentCompareMode() === 'tracks') {
        state.pendingTrackId = null;
        setTimeout(() => {
          const tableTop = document.getElementById('tracks-area') || document.getElementById('tracks-container');
          if (tableTop) {
            const y = tableTop.getBoundingClientRect().top + window.scrollY - getTrackScrollOffset();
            window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
          }
        }, 150);
      }
      state.pendingInitialTableTopScroll = false;
    } catch(e) {
      console.error(e);
      document.getElementById('tracks-container').innerHTML =
        `<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>שגיאה בטעינת הנתונים. ${e.message}</p></div>`;
    } finally {
      showLoading(false);
    }
  }

  // ─── UPDATE PAGE TITLE ────────────────────────────────────────
  // task 10: רק ספירת קופות מעל הטבלה
  function updatePageTitle(catId, organized) {
    const resultsCount = document.getElementById('results-count');
    if (resultsCount) resultsCount.textContent = '';
  }

  // ─── TRACK FILTERS (sidebar) ─────────────────────────────────
  function buildTrackFilters(organized, catId) {
    const cat  = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId);
    const hide = cat ? (cat.hiddenDefaultTracks || []) : [];
    // מסלולים שיופיעו ראשונים בסרגל (כללי מעל מניות לגמל/השתלמות)
    const topOrder = cat ? (cat.topOrderTracks || []) : [];

    const container = document.getElementById('filter-tracks');
    container.innerHTML = '';

    // מיון: topOrder קודם, אחריהם גלויים, לבסוף מוסתרים
    const sorted = [...organized].sort((a, b) => {
      const aTop  = topOrder.indexOf(a.track.id);
      const bTop  = topOrder.indexOf(b.track.id);
      const aH = hide.includes(a.track.id) ? 2 : (aTop >= 0 ? -1 : 0);
      const bH = hide.includes(b.track.id) ? 2 : (bTop >= 0 ? -1 : 0);
      if (aH !== bH) return aH - bH;
      if (aTop >= 0 && bTop >= 0) return aTop - bTop;
      return 0;
    });
    pruneSavedTrackFilters(sorted.map(item => item.track.id));

    let lastGroup = null;
    sorted.forEach(({ track, records, isHiddenByDefault }) => {
      // כותרת תת-קבוצה (למשל: מקבלי קצבה)
      if (track.group && track.group !== lastGroup) {
        lastGroup = track.group;
        const sep = document.createElement('div');
        sep.className = 'filter-group-sep';
        sep.textContent = track.groupLabel || track.group;
        container.appendChild(sep);
      } else if (!track.group) {
        lastGroup = null;
      }

      const label = document.createElement('label');
      label.className = 'filter-checkbox' + (track.group ? ' filter-checkbox-sub' : '');
      label.innerHTML = `
        <input type="checkbox" value="${track.id}" />
        <span>${track.label}</span>
        <span class="fc-count">${records.length}</span>
        ${isHiddenByDefault ? '<span class="fc-hidden-badge">מוסתר</span>' : ''}
      `;
      const cb = label.querySelector('input');
      cb.checked = state.selectedTracks.has(track.id);
      label.classList.toggle('checked', cb.checked);
      cb.addEventListener('change', () => {
        if (cb.checked) { state.selectedTracks.add(track.id); label.classList.add('checked'); }
        else            { state.selectedTracks.delete(track.id); label.classList.remove('checked'); }
        saveCurrentFilterState();
        renderComparisonView();
      });
      container.appendChild(label);
    });
  }

  // ─── PROVIDER FILTERS (sidebar) ──────────────────────────────
  const POLISA_PROVIDER_SUBFILTERS = [
    { parent: 'כלל', label: 'State Street', token: 'State Street' },
    { parent: 'הפניקס', label: 'BlackRock', token: 'BlackRock' },
    { parent: 'הראל', label: 'Fidelity', token: 'Fidelity' }
  ];

  function providerFilterKey(providerName) {
    return `provider:${providerName}`;
  }

  function providerSubFilterKey(parent, token) {
    return `sub:${parent}:${String(token).toLowerCase()}`;
  }

  function parseProviderFilterKey(key) {
    const raw = String(key || '');
    if (raw.startsWith('provider:')) {
      return { type: 'provider', provider: raw.slice('provider:'.length) };
    }
    if (raw.startsWith('sub:')) {
      const rest = raw.slice('sub:'.length);
      const sep = rest.indexOf(':');
      return {
        type: 'sub',
        provider: sep >= 0 ? rest.slice(0, sep) : '',
        token: sep >= 0 ? rest.slice(sep + 1) : ''
      };
    }
    return { type: 'provider', provider: raw };
  }

  function recordMatchesProviderFilter(record, key) {
    const providerName = getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION);
    const parsed = parseProviderFilterKey(key);
    if (parsed.type === 'provider') return providerName === parsed.provider;
    if (parsed.type === 'sub') {
      return providerName === parsed.provider &&
        String(record.FUND_NAME || '').toLowerCase().includes(String(parsed.token || '').toLowerCase());
    }
    return false;
  }

  function companyMatchesProviderFilter(companyName, key) {
    const parsed = parseProviderFilterKey(key);
    return parsed.type === 'provider' ? companyName === parsed.provider : false;
  }

  function recordPassesProviderFilters(record) {
    for (const key of state.excludedProviders) {
      if (recordMatchesProviderFilter(record, key)) return false;
    }
    if (state.selectedProviders.size === 0) return true;
    for (const key of state.selectedProviders) {
      if (recordMatchesProviderFilter(record, key)) return true;
    }
    return false;
  }

  function companyPassesProviderFilters(companyName) {
    for (const key of state.excludedProviders) {
      if (companyMatchesProviderFilter(companyName, key)) return false;
    }
    if (state.selectedProviders.size === 0) return true;
    for (const key of state.selectedProviders) {
      if (companyMatchesProviderFilter(companyName, key)) return true;
    }
    return false;
  }

  function setProviderFilterRowState(row, key) {
    const input = row.querySelector('input[type="checkbox"]');
    if (input) input.checked = state.selectedProviders.has(key);
    row.classList.toggle('checked', state.selectedProviders.has(key));
    row.classList.toggle('excluded', state.excludedProviders.has(key));
  }

  function appendProviderFilterRow(container, { key, providerName, labelText, color, isSub = false }) {
    const row = document.createElement('div');
    row.className = 'filter-checkbox provider-filter-row' + (isSub ? ' filter-checkbox-sub' : '');
    row.innerHTML = `
      <input type="checkbox" value="${key}" aria-label="הצג ${labelText}" />
      <span class="fc-dot" style="background:${color}"></span>
      <span class="provider-filter-name" role="button" tabindex="0" title="לחץ להסרה מהטבלאות">${labelText}</span>
    `;
    const cb = row.querySelector('input');
    const nameEl = row.querySelector('.provider-filter-name');
    cb.addEventListener('change', () => {
      if (cb.checked) {
        state.selectedProviders.add(key);
        state.excludedProviders.delete(key);
      } else {
        state.selectedProviders.delete(key);
      }
      setProviderFilterRowState(row, key);
      saveCurrentFilterState();
      renderComparisonView();
    });
    const toggleExclude = () => {
      state.selectedProviders.delete(key);
      if (state.excludedProviders.has(key)) state.excludedProviders.delete(key);
      else state.excludedProviders.add(key);
      setProviderFilterRowState(row, key);
      saveCurrentFilterState();
      renderComparisonView();
    };
    nameEl.addEventListener('click', toggleExclude);
    nameEl.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggleExclude();
    });
    setProviderFilterRowState(row, key);
    container.appendChild(row);
  }

  function buildProviderFilters(organized) {
    const providerRecords = new Map();
    organized.forEach(({ records }) => {
      records.forEach(r => {
        const providerName = getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION);
        if (!providerRecords.has(providerName)) providerRecords.set(providerName, []);
        providerRecords.get(providerName).push(r);
      });
    });
    const providers = Array.from(providerRecords.keys()).sort();

    const container = document.getElementById('filter-providers');
    container.innerHTML = '';
    const availableProviderKeys = [];
    providers.forEach(p => {
      const color = providerColor(p);
      availableProviderKeys.push(providerFilterKey(p));
      appendProviderFilterRow(container, {
        key: providerFilterKey(p),
        providerName: p,
        labelText: p,
        color
      });

      POLISA_PROVIDER_SUBFILTERS
        .filter(item => item.parent === p)
        .forEach(item => {
          const hasRecords = (providerRecords.get(p) || []).some(record =>
            String(record.FUND_NAME || '').toLowerCase().includes(item.token.toLowerCase())
          );
          if (!hasRecords) return;
          availableProviderKeys.push(providerSubFilterKey(item.parent, item.token));
          appendProviderFilterRow(container, {
            key: providerSubFilterKey(item.parent, item.token),
            providerName: p,
            labelText: item.label,
            color,
            isSub: true
          });
        });
    });
    pruneSavedProviderFilters(availableProviderKeys);
  }

  // ─── POPULATION FILTER ───────────────────────────────────────
  function setupPopulationFilter() {
    // initial binding – handled by setupPopulationRadio (called after load)
  }

  function setupPopulationRadio() {
    const section = document.getElementById('population-filter-section');
    if (section) section.hidden = !categoryUsesTargetPopulation();

    document.querySelectorAll('input[name="population"]').forEach(radio => {
      // Remove old listeners by cloning
      const newR = radio.cloneNode(true);
      radio.parentNode.replaceChild(newR, radio);
    });
    document.querySelectorAll('input[name="population"]').forEach(radio => {
      // Set current state
      radio.checked = (radio.value === state.targetPopulation);
      radio.closest('.filter-radio').classList.toggle('active', radio.checked);

      radio.addEventListener('change', () => {
        state.targetPopulation = radio.value;
        document.querySelectorAll('.filter-radio').forEach(l => l.classList.remove('active'));
        radio.closest('.filter-radio').classList.add('active');
        saveCurrentFilterState();
        if (!state.isHomePage) loadCategory(state.activeCategoryId);
      });
    });
  }

  // ─── RENDER TRACKS ────────────────────────────────────────────
  function stabilizeTracksContainerDuringRender(container, renderFn) {
    if (!container) {
      renderFn();
      return;
    }
    const currentHeight = container.offsetHeight;
    const shouldLockHeight = currentHeight > 80 && container.children.length > 0;
    if (shouldLockHeight) {
      container.style.minHeight = `${currentHeight}px`;
      container.classList.add('is-category-rendering');
    }

    renderFn();

    if (shouldLockHeight) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.classList.remove('is-category-rendering');
          container.style.minHeight = '';
        });
      });
    }
  }

  function renderTracks() {
    if (state.isHomePage) return;
    if (getCurrentCompareMode() !== 'tracks') return;

    state._blockRenderers = [];  // reset on each full render

    const container = document.getElementById('tracks-container');
    let totalShown = 0;

    stabilizeTracksContainerDuringRender(container, () => {
      container.innerHTML = '';
      syncTracksDensityClasses();

      state.organizedData.forEach(item => {
        const { track, isHiddenByDefault } = item;

        // פילטר מסלולים: אם יש בחירה בסרגל → הצג רק אותם
        if (state.selectedTracks.size > 0 && !state.selectedTracks.has(track.id)) return;
        // מסלול מוסתר ברירת מחדל: הצג רק אם נבחר במפורש
        if (isHiddenByDefault && !state.selectedTracks.has(track.id)) return;

        // פילטר יצרנים + חיפוש
        let recs = applyFiltersToRecords(item.records);
        if (recs.length === 0) return;

        // מיון ראשוני של הקובייה
        recs = sortBlockRecords(recs, item.sortField || '1yr', item.sortDir || 'desc', track.id);

        totalShown += recs.length;
        const block = buildTrackBlock(item, recs);
        container.appendChild(block);
      });

      if (totalShown === 0) {
        container.innerHTML = `
          <div class="no-data">
            <i class="fas fa-inbox"></i>
            <p>לא נמצאו תוצאות לפי הסינון הנבחר</p>
          </div>`;
      }
      syncTracksDensityClasses();
    });

    applyMobileTheadSticky();

    // עדכן ספירה — task 10
    document.getElementById('results-count').textContent = '';

    // עדכן הודעת רגולציה עם תקופה דינמית מתוך הנתונים
    if (state.organizedData.length) {
      const globalLatest = state.organizedData.reduce((mx, item) => {
        const lp = item.records.reduce((m2, r) => Number(r.REPORT_PERIOD) > m2 ? Number(r.REPORT_PERIOD) : m2, 0);
        return lp > mx ? lp : mx;
      }, 0);
      const noteEl = document.querySelector('.regulatory-note-inline span');
      if (noteEl && globalLatest) {
        noteEl.textContent = `הנתונים מעודכנים עד ${formatReportPeriod(globalLatest)}, ומוצגים לצורכי מידע והשוואה בלבד ואינם מהווים ייעוץ, שיווק או המלצה אישית. התשואות מוצגות לפני דמי ניהול.`;
      }
    }

    if (state.pendingCompareTopScroll) {
      requestAnimationFrame(() => {
        scrollToComparisonTableTop();
        requestAnimationFrame(scrollToComparisonTableTop);
      });
    }
    guardDisplayOptionsAfterRender();
    requestAnimationFrame(updateMobileStickyThead);
  }

  function syncTracksDensityClasses() {
    const container = document.getElementById('tracks-container');
    if (!container) return;
    if (getCurrentCompareMode() === 'actuarial') {
      container.style.display = 'none';
      return;
    }
    const sidebar = document.getElementById('sidebar');
    const sidebarOpen = !!sidebar && !sidebar.classList.contains('sidebar-collapsed');
    const yearlyActive = Array.from(state.yearlyByTrack.values()).some(entry => entry?.active);
    const customRangeActive = state.customRange.active && !!state.customRange.yieldMap;
    const narrowViewport = window.matchMedia('(max-width: 900px)').matches;
    const compact = !!state.compactTracksView;
    const blocked = narrowViewport || !compact || state.showExposure || sidebarOpen || getCurrentCompareMode() !== 'tracks';
    container.classList.toggle('tracks-two-col-blocked', blocked);
    container.classList.toggle('tracks-two-col-active', !blocked);
    container.classList.toggle('tracks-compact-view', compact);
    container.style.display = 'grid';
    container.style.gridTemplateColumns = blocked ? '1fr' : 'repeat(2, minmax(0, 1fr))';
    container.style.gap = blocked ? '16px' : '14px';
    requestAnimationFrame(updateTwoColStickyOffsets);
  }

  function updateTwoColStickyOffsets() {
    const container = document.getElementById('tracks-container');
    if (!container) return;
    container.querySelectorAll('.track-block').forEach(block => {
      const hdr = block.querySelector('.track-header');
      if (hdr) block.style.setProperty('--track-hdr-h', hdr.offsetHeight + 'px');
    });
  }

  function updateTwoColHeaderWrap(block) {
    const table = block.querySelector('.track-table-wrapper .track-table');
    const thead = table?.querySelector('thead');
    if (!table || !thead) return;

    block.querySelector('.track-thead-clone')?.remove();
    if (window.matchMedia && window.matchMedia('(max-width: 1024px)').matches) return;

    const cloneWrap = document.createElement('div');
    cloneWrap.className = 'track-thead-clone';

    const miniTable = document.createElement('table');
    miniTable.className = table.className;
    miniTable.appendChild(thead.cloneNode(true));

    cloneWrap.appendChild(miniTable);
    block.insertBefore(cloneWrap, block.querySelector('.track-table-wrapper'));
  }

  function setupTwoColStickyHeaders() {
    /* intentionally empty — sticky handled via CSS on .track-thead-clone */
  }

  let mobileStickyThead = null;
  let mobileStickyTheadBlock = null;
  let mobileStickyCompactBlock = null;
  let mobileStickyScrollWrapper = null;
  let mobileStickyTheadRaf = 0;
  const MOBILE_TABLE_ZOOM = 1;

  function ensureMobileStickyThead() {
    if (mobileStickyThead) return mobileStickyThead;
    mobileStickyThead = document.createElement('div');
    mobileStickyThead.className = 'mobile-sticky-thead-clone';
    mobileStickyThead.hidden = true;
    mobileStickyThead.addEventListener('click', event => {
      const cell = event.target.closest('.mobile-sticky-head-cell[data-sortfield]');
      if (!cell || !mobileStickyTheadBlock) return;
      const field = cell.dataset.sortfield;
      const sourceTh = Array.from(mobileStickyTheadBlock.querySelectorAll('thead th[data-sortfield]'))
        .find(th => th.dataset.sortfield === field);
      if (!sourceTh) return;
      event.preventDefault();
      event.stopPropagation();
      sourceTh.click();
    });
    document.body.appendChild(mobileStickyThead);
    return mobileStickyThead;
  }

  function hideMobileStickyThead() {
    if (mobileStickyThead) mobileStickyThead.hidden = true;
    if (mobileStickyTheadBlock) mobileStickyTheadBlock.classList.remove('is-mobile-sticky-source');
    mobileStickyTheadBlock = null;
    bindMobileStickyTheadScroll(null);
  }

  function scheduleMobileStickyTheadUpdate() {
    if (mobileStickyTheadRaf) return;
    mobileStickyTheadRaf = requestAnimationFrame(() => {
      mobileStickyTheadRaf = 0;
      updateMobileStickyThead();
    });
  }

  function bindMobileStickyTheadScroll(wrapper) {
    if (mobileStickyScrollWrapper === wrapper) return;
    if (mobileStickyScrollWrapper) {
      mobileStickyScrollWrapper.removeEventListener('scroll', scheduleMobileStickyTheadUpdate);
    }
    mobileStickyScrollWrapper = wrapper;
    if (mobileStickyScrollWrapper) {
      mobileStickyScrollWrapper.addEventListener('scroll', scheduleMobileStickyTheadUpdate, { passive: true });
    }
  }

  function setMobileStickyCompactBlock(block) {
    if (mobileStickyCompactBlock === block) return;
    if (mobileStickyCompactBlock) mobileStickyCompactBlock.classList.remove('is-mobile-sticky-compact');
    mobileStickyCompactBlock = block;
    if (mobileStickyCompactBlock) mobileStickyCompactBlock.classList.add('is-mobile-sticky-compact');
  }

  function clearMobileStickyCompactBlock() {
    if (mobileStickyCompactBlock) mobileStickyCompactBlock.classList.remove('is-mobile-sticky-compact');
    mobileStickyCompactBlock = null;
  }

  function getMobileStickyHeadText(th) {
    if (!th) return '';
    const clone = th.cloneNode(true);
    clone.querySelectorAll('.sort-arrow').forEach(el => el.remove());
    return clone.textContent
      .replace(/[⇅↑↓↕]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getMobileStickyHeadHtml(th) {
    if (!th) return '';
    const clone = th.cloneNode(true);
    clone.querySelectorAll('.sort-arrow.inactive').forEach(el => el.remove());
    return clone.innerHTML
      .replace(/[⇅↕]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function renderMobileStickyHeadCell(cell, th) {
    cell.classList.toggle('is-sorted', !!th?.classList.contains('col-sorted-head'));
    if (th?.dataset?.sortfield) {
      cell.dataset.sortfield = th.dataset.sortfield;
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-sort', th.getAttribute('aria-sort') || 'none');
      cell.tabIndex = 0;
    } else {
      delete cell.dataset.sortfield;
      cell.removeAttribute('role');
      cell.removeAttribute('aria-sort');
      cell.removeAttribute('tabindex');
    }

    const datesEl = th?.querySelector('.custom-range-th-dates');
    if (datesEl) {
      cell.classList.add('is-custom-range');
      cell.innerHTML = getMobileStickyHeadHtml(th);
      cell.style.setProperty('white-space', 'normal', 'important');
      cell.style.setProperty('line-height', '1.08', 'important');
      return;
    }
    cell.classList.remove('is-custom-range');
    cell.innerHTML = getMobileStickyHeadHtml(th) || getMobileStickyHeadText(th);
    cell.style.removeProperty('white-space');
    cell.style.removeProperty('line-height');
  }

  function updateMobileStickyThead() {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    if (!isMobile || getCurrentCompareMode() !== 'tracks') {
      hideMobileStickyThead();
      clearMobileStickyCompactBlock();
      return;
    }
    if (window.scrollY <= 0) {
      hideMobileStickyThead();
      clearMobileStickyCompactBlock();
      return;
    }

    const logoBarRect = document.querySelector('.mobile-table-logo-bar')?.getBoundingClientRect();
    const activeBlockLine = Math.ceil(logoBarRect?.bottom || 0);
    const blocks = Array.from(document.querySelectorAll('#tracks-container .track-block'));
    const activeBlock = blocks.find(block => {
      const r = block.getBoundingClientRect();
      return r.top <= activeBlockLine && r.bottom > activeBlockLine + 2;
    });
    if (!activeBlock) {
      hideMobileStickyThead();
      clearMobileStickyCompactBlock();
      return;
    }
    clearMobileStickyCompactBlock();

    const trackHeader = activeBlock.querySelector('.track-header');
    const wrapper = activeBlock.querySelector('.track-table-wrapper:not(.collapsed)');
    const table = wrapper?.querySelector('table.track-table');
    const thead = table?.querySelector('thead');
    if (!trackHeader || !wrapper || !table || !thead) {
      hideMobileStickyThead();
      return;
    }
    bindMobileStickyTheadScroll(wrapper);

    let headerRect = trackHeader.getBoundingClientRect();
    let wrapperRect = wrapper.getBoundingClientRect();
    let theadRect = thead.getBoundingClientRect();
    let controlsRect = activeBlock.querySelector('.track-header-controls')?.getBoundingClientRect();
    let stickyHeaderBottom = Math.max(headerRect.bottom, controlsRect?.bottom || 0);
    const stickyExitBuffer = 2;
    const shouldShow =
      activeBlock.getBoundingClientRect().bottom > activeBlockLine + stickyExitBuffer;
    if (!shouldShow) {
      hideMobileStickyThead();
      return;
    }

    const clone = ensureMobileStickyThead();
    const sourceThs = Array.from(thead.querySelectorAll('th'));
    if (mobileStickyTheadBlock !== activeBlock || Number(clone.dataset.columnCount || 0) !== sourceThs.length) {
      if (mobileStickyTheadBlock) mobileStickyTheadBlock.classList.remove('is-mobile-sticky-source');
      clone.replaceChildren(...sourceThs.map((th, index) => {
        const cell = document.createElement('div');
        cell.className = `mobile-sticky-head-cell${index === 0 ? ' is-rank' : ''}${index === 1 ? ' is-manager' : ''}`;
        renderMobileStickyHeadCell(cell, th);
        return cell;
      }));
      clone.dataset.columnCount = String(sourceThs.length);
      mobileStickyTheadBlock = activeBlock;
    }
    headerRect = trackHeader.getBoundingClientRect();
    wrapperRect = wrapper.getBoundingClientRect();
    theadRect = thead.getBoundingClientRect();
    controlsRect = activeBlock.querySelector('.track-header-controls')?.getBoundingClientRect();
    stickyHeaderBottom = Math.max(headerRect.bottom, controlsRect?.bottom || 0);
    activeBlock.classList.add('is-mobile-sticky-source');
    sourceThs.forEach((th, index) => {
      const cell = clone.children[index];
      if (cell) renderMobileStickyHeadCell(cell, th);
    });

    // getBoundingClientRect() already includes the user-controlled .page-body
    // zoom. The fixed clone is appended to <body>, so it is affected only by
    // body zoom; convert visual viewport pixels back to body CSS pixels.
    const bodyZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const pageZoom = parseFloat(getComputedStyle(_sbMobileZoomTarget()).zoom) || 1;
    const toBodyFixedSpace = value => value / bodyZoom;

    clone.hidden = false;
    clone.style.top = `${toBodyFixedSpace(Math.ceil(stickyHeaderBottom))}px`;
    clone.style.left = `${toBodyFixedSpace(Math.round(wrapperRect.left))}px`;
    clone.style.width = `${toBodyFixedSpace(Math.round(wrapperRect.width))}px`;
    clone.style.height = `${toBodyFixedSpace(Math.round(thead.getBoundingClientRect().height || 32))}px`;
    const wrapperWidth = Math.round(wrapperRect.width);
    const managerRect = sourceThs[1]?.getBoundingClientRect();
    const stickyColumnsLeft = managerRect
      ? Math.round(managerRect.left - wrapperRect.left)
      : wrapperWidth;
    let rankWidth = 0;
    sourceThs.forEach((th, index) => {
      const cell = clone.children[index];
      if (!cell) return;
      const thRect = th.getBoundingClientRect();
      const thStyle = getComputedStyle(th);
      const rawLeft = Math.round(thRect.left - wrapperRect.left);
      const rawRight = Math.round(wrapperRect.right - thRect.right);
      const width = Math.round(thRect.width);
      const visualFontSize = (parseFloat(thStyle.fontSize) || 12) * pageZoom;
      const visualLineHeight = Number.isFinite(parseFloat(thStyle.lineHeight))
        ? parseFloat(thStyle.lineHeight) * pageZoom
        : visualFontSize * 1.05;
      const visualCellHeight = Math.round(thRect.height);
      cell.style.setProperty('height', `${toBodyFixedSpace(visualCellHeight)}px`, 'important');
      cell.style.setProperty('font-size', `${visualFontSize}px`, 'important');
      cell.style.setProperty('line-height', `${visualLineHeight}px`, 'important');
      if (index === 0) {
        rankWidth = width;
        cell.style.setProperty('left', 'auto', 'important');
        cell.style.setProperty('right', '0px', 'important');
        cell.style.setProperty('width', `${toBodyFixedSpace(width)}px`, 'important');
        cell.style.setProperty('min-width', `${toBodyFixedSpace(width)}px`, 'important');
        cell.style.setProperty('max-width', `${toBodyFixedSpace(width)}px`, 'important');
        cell.style.setProperty('visibility', 'visible', 'important');
        cell.style.setProperty('clip-path', 'none', 'important');
        return;
      }
      if (index === 1) {
        const managerLeft = thRect.left - Math.round(wrapperRect.left);
        const managerWidth = thRect.width;
        // Use the manager header's own measured left/width, including
        // sub-pixels, so the sticky clone stays exactly over the source cell.
        cell.style.setProperty('left', `${toBodyFixedSpace(managerLeft)}px`, 'important');
        cell.style.setProperty('right', 'auto', 'important');
        cell.style.setProperty('width', `${toBodyFixedSpace(managerWidth)}px`, 'important');
        cell.style.setProperty('min-width', `${toBodyFixedSpace(managerWidth)}px`, 'important');
        cell.style.setProperty('max-width', `${toBodyFixedSpace(managerWidth)}px`, 'important');
        cell.style.setProperty('visibility', 'visible', 'important');
        cell.style.setProperty('clip-path', 'none', 'important');
        return;
      }
      const isCustomRangeHead = th.classList.contains('custom-range-col');
      const keepFullWidth = index < 2 || isCustomRangeHead;
      const visibleLeft = keepFullWidth ? rawLeft : Math.max(rawLeft, 0);
      const visibleRight = keepFullWidth ? rawLeft + width : Math.min(rawLeft + width, stickyColumnsLeft, wrapperWidth);
      const visibleWidth = Math.max(0, visibleRight - visibleLeft);
      const leftClip = keepFullWidth ? 0 : Math.max(0, -rawLeft);
      const rightClip = keepFullWidth ? 0 : Math.max(0, rawLeft + width - visibleRight);
      const isOutsideWrapper = index >= 2 && visibleWidth <= 0;
      if (index < 2) {
        cell.style.setProperty('left', 'auto', 'important');
        cell.style.setProperty('right', `${toBodyFixedSpace(rawRight)}px`, 'important');
      } else {
        cell.style.setProperty('left', `${toBodyFixedSpace(rawLeft)}px`, 'important');
        cell.style.setProperty('right', 'auto', 'important');
      }
      cell.style.setProperty('width', `${toBodyFixedSpace(width)}px`, 'important');
      cell.style.setProperty('min-width', `${toBodyFixedSpace(width)}px`, 'important');
      cell.style.setProperty('max-width', `${toBodyFixedSpace(width)}px`, 'important');
      cell.style.setProperty('overflow', 'hidden', 'important');
      cell.style.setProperty('text-overflow', 'clip', 'important');
      cell.style.setProperty('clip-path', keepFullWidth ? 'none' : `inset(0 ${toBodyFixedSpace(rightClip)}px 0 ${toBodyFixedSpace(leftClip)}px)`, 'important');
      cell.style.setProperty('visibility', index < 2 || !isOutsideWrapper ? 'visible' : 'hidden', 'important');
    });
  }

  function setupMobileStickyThead() {
    hideMobileStickyThead();
    clearMobileStickyCompactBlock();
    window.addEventListener('scroll', scheduleMobileStickyTheadUpdate, { passive: true });
    window.addEventListener('resize', scheduleMobileStickyTheadUpdate);
  }

  // Apply inline sticky to rank+manager thead cells.
  // Inline style with 'important' beats any stylesheet rule — the only reliable
  // way since dozens of conflicting !important CSS rules fight over position on thead th.
  function applyMobileTheadSticky() {
    if (!window.matchMedia('(max-width: 1024px)').matches) return;
    document.querySelectorAll('.track-table-wrapper table.track-table').forEach(table => {
      const row = table.querySelector('thead tr');
      if (!row) return;
      const th1 = row.children[0]; // rank
      const th2 = row.children[1]; // manager
      if (th1) {
        th1.style.setProperty('position', 'sticky', 'important');
        th1.style.setProperty('top', 'auto', 'important');
        th1.style.setProperty('right', '0px', 'important');
        th1.style.setProperty('z-index', '704', 'important');
        th1.style.setProperty('background', '#fefce8', 'important');
      }
      if (th2) {
        th2.style.setProperty('position', 'sticky', 'important');
        th2.style.setProperty('top', 'auto', 'important');
        th2.style.setProperty('right', '28px', 'important');
        th2.style.setProperty('z-index', '703', 'important');
        th2.style.setProperty('background', '#fefce8', 'important');
        th2.style.setProperty('box-shadow', '-3px 0 8px -3px rgba(15,23,42,.2)', 'important');
      }
    });
  }

  async function loadActuarialComparisonData() {
    if (!isActuarialModeAvailable() || !state.activeCategoryId) return;
    const range = getEffectiveActuarialRange();
    if (!range.startPeriod || !range.endPeriod) {
      state.actuarial.rows = [];
      state.actuarial.rangeKey = '';
      return;
    }

    const rangeKey = `${state.activeCategoryId}|${state.targetPopulation}|${range.startPeriod}|${range.endPeriod}`;
    if (state.actuarial.rangeKey === rangeKey && state.actuarial.rows.length) return;

    state.actuarial.loading = true;
    try {
      state.actuarial.rows = await APIModule.getActuarialComparison(
        state.activeCategoryId,
        Number(range.startPeriod),
        Number(range.endPeriod),
        state.targetPopulation
      );
      state.actuarial.rangeKey = rangeKey;
      state.actuarial.showAllYears = false;
    } finally {
      state.actuarial.loading = false;
    }
  }

  function getFilteredActuarialRows() {
    const q = (document.getElementById('global-search')?.value || '').toLowerCase().trim();
    return state.actuarial.rows.filter(row => {
      if (!companyPassesProviderFilters(row.companyName)) return false;
      if (!q) return true;
      const legalId = row.legalId ? String(row.legalId) : '';
      return row.companyName.toLowerCase().includes(q) || legalId.includes(q);
    });
  }

  function sortActuarialRows(rows) {
    const field = state.actuarial.sortField;
    const dir = state.actuarial.sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = field.startsWith('year:')
        ? (a.yearlyBreakdown.find(item => String(item.year) === field.slice(5))?.annualAdjustment ?? null)
        : a[field];
      const bv = field.startsWith('year:')
        ? (b.yearlyBreakdown.find(item => String(item.year) === field.slice(5))?.annualAdjustment ?? null)
        : b[field];
      if (field === 'companyName') return String(av).localeCompare(String(bv), 'he') * dir;
      const aNum = av == null ? -9999 : Number(av);
      const bNum = bv == null ? -9999 : Number(bv);
      return (aNum - bNum) * dir;
    });
  }

  function getPendingActuarialCompanyName() {
    const companyName = String(state.pendingActuarialCompanyName || '').trim();
    if (companyName) return companyName;
    const fundId = String(state.pendingActuarialFundId || '').trim();
    if (!fundId) return '';
    for (const item of state.organizedData || []) {
      const match = (item.records || []).find(record => String(record.FUND_ID || '').trim() === fundId);
      if (match) {
        return getProviderDisplayName(match.CONTROLLING_CORPORATION, match.MANAGING_CORPORATION);
      }
    }
    return '';
  }

  function renderActuarialComparison() {
    const wrap = document.getElementById('actuarial-container');
    const resultsCount = document.getElementById('results-count');
    if (!wrap) return;

    const range = getEffectiveActuarialRange();
    const rangeLabel = formatRangeLabel(range.startPeriod, range.endPeriod);
    const rangeOnlyLabel = formatRangePeriodOnly(range.startPeriod, range.endPeriod);
    const rangeMonthCount = getMonthCountBetween(range.startPeriod, range.endPeriod);

    if (state.actuarial.loading) {
      wrap.innerHTML = '<div class="actuarial-loading"><div class="spinner"></div><p>טוען איזון אקטוארי...</p></div>';
      if (resultsCount) resultsCount.textContent = '';
      return;
    }

    const rows = sortActuarialRows(getFilteredActuarialRows());
    const hasCoverageAlert = rows.some(row => row.noDataForSelectedRange || row.partialRangeCoverage);
    if (resultsCount) resultsCount.textContent = '';

    if (!rows.length) {
      wrap.innerHTML = `
      <div class="no-data">
        <i class="fas fa-inbox"></i>
        <p>לא נמצאו נתוני איזון אקטוארי עבור הטווח והסינון שנבחרו.</p>
        </div>`;
      return;
    }

    const allYears = Array.from(new Set(rows.flatMap(row => row.yearlyBreakdown.map(item => item.year)))).sort((a, b) => b - a);
    const defaultYears = allYears.slice(0, 10);
    const visibleYears = state.actuarial.showAllYears ? allYears : defaultYears;
    const showCustomRangeColumn = !!range.isCustom;
    const arrow = (field) => {
      if (state.actuarial.sortField !== field) return '<span class="sort-arrow inactive" aria-hidden="true">⇅</span>';
      return state.actuarial.sortDir === 'desc'
        ? '<span class="sort-arrow active" aria-hidden="true">↓</span>'
        : '<span class="sort-arrow active" aria-hidden="true">↑</span>';
    };
    const heatmapMax = rows.reduce((max, row) => {
      row.yearlyBreakdown.forEach(item => {
        max = Math.max(max, Math.abs(item.annualAdjustment || 0));
      });
      return max;
    }, 0);
    const renderHeatmapCell = (value) => {
      if (value == null) {
        return '<td class="actuarial-heatmap-cell is-empty">—</td>';
      }
      const ratio = heatmapMax ? Math.min(Math.abs(value) / heatmapMax, 1) : 0;
      const alpha = 0.18 + (ratio * 0.52);
      const background = value >= 0
        ? `rgba(22, 163, 74, ${alpha.toFixed(2)})`
        : `rgba(220, 38, 38, ${alpha.toFixed(2)})`;
      const color = value >= 0 ? '#166534' : '#991b1b';
      return `<td class="actuarial-heatmap-cell" style="background:${background};color:${color};">${formatPercent(value)}</td>`;
    };
    const heatmapRows = rows.map(row => {
      const yearMap = new Map(row.yearlyBreakdown.map(item => [item.year, item.annualAdjustment]));
      const coverageIcon = row.noDataForSelectedRange
        ? '<span class="actuarial-month-variance" title="אין נתוני איזון אקטוארי לטווח שביקשת עבור החברה הזו">⚠</span>'
        : (row.partialRangeCoverage
            ? '<span class="actuarial-month-variance" title="לחברה אין נתונים עבור מלוא טווח הסינון שביקשת">⚠</span>'
            : '');
      return `
        <tr class="actuarial-summary-row">
          <td>
            <div class="actuarial-company-cell">
              <span class="prov-dot" style="background:${providerColor(row.companyName)}"></span>
              <span class="actuarial-company-btn">${row.companyName}</span>
              ${coverageIcon}
            </div>
          </td>
          ${showCustomRangeColumn ? `<td class="${yieldClass(row.totalAdjustment)}">${row.totalAdjustment != null ? formatPercent(row.totalAdjustment) : '—'}</td>` : ''}
          ${visibleYears.map(year => renderHeatmapCell(yearMap.get(year))).join('')}
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div class="actuarial-heatmap-card">
        <div class="actuarial-heatmap-head">
          <h4>מפת חום שנתית, איזון אקטוארי : האם הקרן חילקה עודף או גרעון בין העמיתים</h4>
          <div class="actuarial-heatmap-tools">
            <div class="actuarial-heatmap-legend">
              <span class="actuarial-legend-chip is-negative">שלילי</span>
              <span class="actuarial-legend-chip is-positive">חיובי</span>
            </div>
            <button type="button" class="actuarial-toggle-years-btn" id="actuarial-toggle-years-btn">
              ${state.actuarial.showAllYears ? 'הצג רק 10 שנים אחרונות' : 'הצג את כל השנים'}
            </button>
          </div>
        </div>
        <div class="actuarial-heatmap-scroll">
          <table class="actuarial-heatmap-table">
            <thead>
              <tr>
                <th>חברה</th>
                ${showCustomRangeColumn ? `<th>טווח מותאם<br><small>${rangeOnlyLabel} · ${rangeMonthCount} חודשים</small></th>` : ''}
                ${visibleYears.map(year => `<th class="actuarial-sortable-year" data-actuarial-sort="year:${year}" title="לחצו למיון לפי ${year}">${year} ${arrow(`year:${year}`)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>${heatmapRows}</tbody>
          </table>
        </div>
      </div>
      <div class="actuarial-summary-note">
        ${hasCoverageAlert ? '<span class="actuarial-header-alert" title="יש חברות שאין להן נתונים מלאים לכל טווח הסינון שביקשת">⚠</span>' : ''}
        ${hasCoverageAlert ? 'סימון האזהרה מופיע רק בחברות שאין להן כיסוי מלא לטווח הסינון שנבחר.' : 'מפת החום מציגה השוואה שנתית ישירה בין החברות.'}
      </div>`;

    const toggleYearsBtn = document.getElementById('actuarial-toggle-years-btn');
    if (toggleYearsBtn) {
      toggleYearsBtn.addEventListener('click', () => {
        state.actuarial.showAllYears = !state.actuarial.showAllYears;
        renderActuarialComparison();
      });
    }
    wrap.querySelectorAll('[data-actuarial-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.actuarialSort;
        if (state.actuarial.sortField === field) {
          state.actuarial.sortDir = state.actuarial.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          state.actuarial.sortField = field;
          state.actuarial.sortDir = 'desc';
        }
        renderActuarialComparison();
      });
    });
  }

  // ─── FILTER RECORDS (provider + search) ──────────────────────
  function applyFiltersToRecords(records) {
    const q = (document.getElementById('global-search').value || '').toLowerCase().trim();
    return records.filter(r => {
      const name = getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION);

      // יצרן
      if (!recordPassesProviderFilters(r)) return false;

      // חיפוש
      if (q) {
        const inName = name.toLowerCase().includes(q);
        const inId   = String(r.FUND_ID || '').includes(q);
        const inSub  = (r.SUB_SPECIALIZATION || '').toLowerCase().includes(q);
        const inFund = (r.FUND_NAME || '').toLowerCase().includes(q);
        if (!inName && !inId && !inSub && !inFund) return false;
      }
      return true;
    });
  }

  // ─── SORT BLOCK ───────────────────────────────────────────────
  // dir='desc' → גבוה לנמוך, dir='asc' → נמוך לגבוה
  function sortBlockRecords(records, field, dir, trackId = null) {
    const FIELD_MAP = {
      '5yr':    'YIELD_TRAILING_5_YRS',
      '3yr':    'YIELD_TRAILING_3_YRS',
      '1yr':    '__YIELD_12M__',   // שדה מחושב
      'customRange': '__CUSTOM_RANGE__',
      'ytd':    'YEAR_TO_DATE_YIELD',
      'monthly':'MONTHLY_YIELD',
      'assets': 'TOTAL_ASSETS',
      'stock':  'STOCK_MARKET_EXPOSURE',
      'abroad': 'FOREIGN_EXPOSURE',
      'fx':     'FOREIGN_CURRENCY_EXPOSURE'
    };
    const f = FIELD_MAP[field] || '__YIELD_12M__';
    return [...records].sort((a, b) => {
      let av, bv;
      if (field === '1yr') {
        const _12mSortMap = getActive12MMap();
        av = (_12mSortMap ? _12mSortMap.get(String(a.FUND_ID)) : null) ?? -9999;
        bv = (_12mSortMap ? _12mSortMap.get(String(b.FUND_ID)) : null) ?? -9999;
      } else if (field === '7yr' || field === '7yr_ann') {
        const _7ySortMap = getActive7YMap();
        const toAnn7 = (value) => {
          const n = parseFloat(value);
          return isNaN(n) ? null : (Math.pow(1 + n / 100, 1 / 7) - 1) * 100;
        };
        const a7 = _7ySortMap ? _7ySortMap.get(String(a.FUND_ID)) : null;
        const b7 = _7ySortMap ? _7ySortMap.get(String(b.FUND_ID)) : null;
        av = (state.yieldMode === 'annualized' || field === '7yr_ann' ? toAnn7(a7) : a7) ?? -9999;
        bv = (state.yieldMode === 'annualized' || field === '7yr_ann' ? toAnn7(b7) : b7) ?? -9999;
      } else if (/^year_\d{4}$/.test(field)) {
        const year = Number(field.slice(5));
        const trackYearly = getYearlyTrackState(trackId);
        av = trackYearly?.yieldMap?.get(String(a.FUND_ID))?.get(year) ?? -9999;
        bv = trackYearly?.yieldMap?.get(String(b.FUND_ID))?.get(year) ?? -9999;
      } else if (field === 'yearly_ytd') {
        av = parseFloat(a.YEAR_TO_DATE_YIELD) || 0;
        bv = parseFloat(b.YEAR_TO_DATE_YIELD) || 0;
      } else if (field === 'customRange') {
        const customMap = state.customRange.yieldMap;
        av = (customMap ? customMap.get(String(a.FUND_ID)) : null) ?? -9999;
        bv = (customMap ? customMap.get(String(b.FUND_ID)) : null) ?? -9999;
      } else {
        av = parseFloat(a[f]) || 0;
        bv = parseFloat(b[f]) || 0;
        if (['stock','abroad','fx'].includes(field)) {
          av = calcExposurePercentValue(a[f], a.TOTAL_ASSETS) ?? -9999;
          bv = calcExposurePercentValue(b[f], b.TOTAL_ASSETS) ?? -9999;
        }
      }
      const diff = av - bv;
      return dir === 'asc' ? diff : -diff;
    });
  }

  // ─── BUILD TRACK BLOCK ────────────────────────────────────────
  function buildTrackBlock(item, records) {
    const { track } = item;
    const categoryLabel = getCategoryLabel();

    // חשב תקופת הדיווח העדכנית ביותר
    const latestPeriod = records.reduce(
      (mx, r) => r.REPORT_PERIOD > mx ? r.REPORT_PERIOD : mx, 0
    );

    const block = document.createElement('div');
    block.className = 'track-block';
    block.dataset.trackId = track.id;

    const renderBlockTable = () => {
      const recs = sortBlockRecords(applyFiltersToRecords(item.records), item.sortField, item.sortDir, track.id);
      const avg  = APIModule.computeAverage(recs);
      const controls = block.querySelector('.track-header-controls');
      if (controls) controls.innerHTML = buildTrackHeaderControls(track);
      block.querySelector('.track-table-wrapper').innerHTML =
        buildTrackTable(recs, avg, latestPeriod, track.id, item.sortField, item.sortDir);
      applyMobileTableSizing(block);
      updateTwoColHeaderWrap(block);
      syncResponsiveTableLabels(block);
      bindFundLinks(block);
      bindTableControls(block);
      clearMobileExposureCompetingActiveButtons();
      requestAnimationFrame(() => syncAllocationIconOverflow(block));
      applyMobileTheadSticky();
      scheduleMobileStickyTheadUpdate();
    };

    // רישום ה-renderer לטעינה גורפת בעת toggle
    state._blockRenderers.push(renderBlockTable);
    block.innerHTML = `
      <div class="track-header">
        <div class="track-title-group">
          <span class="track-label">${categoryLabel ? `<span class="track-category">${categoryLabel}</span>` : ''}<span class="track-label-prefix">מסלול</span><span class="track-name">${track.label}</span></span>
        </div>
        <div class="track-header-controls">${buildTrackHeaderControls(track)}</div>
      </div>
      <div class="track-table-wrapper">
        ${buildTrackTable(records, APIModule.computeAverage(records), latestPeriod, track.id, item.sortField, item.sortDir)}
      </div>
      <div class="track-block-note">הנתונים מעודכנים עד ${formatReportPeriod(latestPeriod)}, ומוצגים לצורכי מידע והשוואה בלבד ואינם מהווים ייעוץ, שיווק או המלצה אישית. התשואות מוצגות לפני דמי ניהול.</div>
    `;

    // מיון עצמאי לכל קובייה בלבד (event delegation)
    const titleShareBtn = document.createElement('button');
    titleShareBtn.className = 'track-share-image-btn share-track-image-btn';
    titleShareBtn.type = 'button';
    titleShareBtn.title = 'שתף צילום של הטבלה הנוכחית';
    titleShareBtn.setAttribute('aria-label', 'שתף צילום של הטבלה הנוכחית');
    titleShareBtn.innerHTML = '<i class="fas fa-camera" aria-hidden="true"></i>';
    block.querySelector('.track-title-group')?.appendChild(titleShareBtn);

    block.addEventListener('click', e => {
      const th = e.target.closest('th[data-sortfield]');
      if (!th) return;
      e.stopPropagation();
      const f = th.dataset.sortfield;
      if (item.sortField === f) {
        item.sortDir = item.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        item.sortField = f;
        item.sortDir = 'desc';
      }
      renderBlockTable();
      if (f === '3yr') scheduleThreeYearPopup();
      // announce sort change to screen readers
      const liveEl = document.getElementById('a11y-live');
      if (liveEl) {
        const dir = item.sortDir === 'desc' ? 'מהגבוה לנמוך' : 'מהנמוך לגבוה';
        liveEl.textContent = `ממוין לפי ${th.textContent.trim()} ${dir}`;
        setTimeout(() => { liveEl.textContent = ''; }, 2000);
      }
    });

    // קישורי קופה + כפתורי toggle (בנייה ראשונית)
    block.querySelector('.track-name')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      scrollToTrackTableFirstRow(block);
    });

    applyMobileTableSizing(block);
    updateTwoColHeaderWrap(block);
    syncResponsiveTableLabels(block);
    bindFundLinks(block);
    bindTableControls(block);
    clearMobileExposureCompetingActiveButtons();
    requestAnimationFrame(() => syncAllocationIconOverflow(block));

    return block;
  }

  function applyMobileTableSizing(scope = document) {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    scope.querySelectorAll('table.track-table').forEach(table => {
      const clearInlineMobileTableStyles = () => {
        table.style.removeProperty('table-layout');
        table.style.removeProperty('display');
        table.style.removeProperty('width');
        table.style.removeProperty('min-width');
        table.style.removeProperty('max-width');
        table.style.removeProperty('zoom');
        table.querySelector(':scope > colgroup')?.remove();
        table
          .querySelectorAll('th, td, td.yield-cell, td.exp-col, tr.average-row td, .yield-number, .exp-val, .th-yield-sub, thead th small')
          .forEach(el => {
            el.style.removeProperty('font-size');
            el.style.removeProperty('line-height');
            el.style.removeProperty('display');
            el.style.removeProperty('position');
            el.style.removeProperty('right');
            el.style.removeProperty('z-index');
            el.style.removeProperty('background');
            el.style.removeProperty('width');
            el.style.removeProperty('min-width');
            el.style.removeProperty('max-width');
            el.style.removeProperty('padding-inline');
            el.style.removeProperty('box-shadow');
          });
      };

      if (!isMobile) {
        table.removeAttribute('data-mobile-layout');
        table.classList.remove('mobile-finance-table');
        clearInlineMobileTableStyles();
        removeMobileTableScrollbar(table.closest('.track-table-wrapper'));
        return;
      }

      table.removeAttribute('data-mobile-layout');
      table.classList.add('mobile-finance-table');
      clearInlineMobileTableStyles();
      table.style.setProperty('zoom', String(MOBILE_TABLE_ZOOM), 'important');
      const isExposureOnly = table.classList.contains('exposure-only');
      const firstRowTHs = Array.from(table.querySelector('tr')?.children || []);
      const mobileColumnCount = firstRowTHs.length;
      if (mobileColumnCount > 2) {
        const rankWidth = 22;
        const managerWidth = 104;
        let expColWidth = 76;
        if (isExposureOnly) {
          const wrapper = table.closest('.track-table-wrapper');
          const containerWidth = wrapper ? wrapper.clientWidth : 0;
          const expColCount = firstRowTHs.filter(th => th.classList.contains('exp-col')).length || 3;
          if (containerWidth > 0) {
            expColWidth = Math.max(76, Math.floor((containerWidth - rankWidth - managerWidth) / expColCount));
          }
        }
        const customRangeWidth = 68;
        const restWidth = mobileColumnCount > 8 ? 54 : 56;
        const currentMonthWidth = 56;
        const compactReturnWidth = 48;
        let visibleIdx = 0;
        const getColWidth = (th) => {
          if (isExposureOnly && th.classList.contains('yield-col')) return 0;
          const w = visibleIdx === 0 ? rankWidth
            : visibleIdx === 1 ? managerWidth
            : th.classList.contains('custom-range-col') ? customRangeWidth
            : (isExposureOnly ? expColWidth
              : (visibleIdx === 2 ? currentMonthWidth : (visibleIdx === 3 ? compactReturnWidth : restWidth)));
          visibleIdx++;
          return w;
        };
        const colWidths = firstRowTHs.map(th => getColWidth(th));
        const rawTableWidth = colWidths.reduce((s, w) => s + w, 0);
        const wrapper = table.closest('.track-table-wrapper');
        const wideMobile = window.matchMedia && window.matchMedia('(min-width: 641px) and (max-width: 1024px)').matches;
        const wideMobileTargetWidth = wideMobile
          ? (wrapper?.clientWidth || Math.round((document.documentElement.clientWidth || window.innerWidth || 0) * 1.13))
          : 0;
        const targetTableWidth = wideMobileTargetWidth
          ? Math.max(rawTableWidth, wideMobileTargetWidth)
          : rawTableWidth;
        if (targetTableWidth > rawTableWidth) {
          const flexibleIndexes = colWidths
            .map((w, index) => (index > 1 && w > 0 ? index : -1))
            .filter(index => index >= 0);
          let remaining = targetTableWidth - rawTableWidth;
          flexibleIndexes.forEach((index, offset) => {
            const add = Math.floor(remaining / (flexibleIndexes.length - offset));
            colWidths[index] += add;
            remaining -= add;
          });
        }
        const tableWidth = colWidths.reduce((s, w) => s + w, 0);
        table.style.setProperty('width', `${tableWidth}px`, 'important');
        table.style.setProperty('min-width', `${tableWidth}px`, 'important');
        table.style.setProperty('max-width', 'none', 'important');
        table.style.setProperty('table-layout', 'fixed', 'important');
        const colgroup = document.createElement('colgroup');
        colWidths.forEach(w => {
          const col = document.createElement('col');
          col.style.width = w > 0 ? `${w}px` : '0';
          colgroup.appendChild(col);
        });
        table.insertBefore(colgroup, table.firstChild);
        if (isExposureOnly) {
          table.querySelectorAll('th.yield-col, td.yield-cell, .custom-range-col').forEach(el => {
            el.style.setProperty('display', 'none', 'important');
          });
          table.querySelectorAll('th.exp-col, td.exp-col').forEach(el => {
            el.style.setProperty('display', 'table-cell', 'important');
            el.style.setProperty('width', `${expColWidth}px`, 'important');
            el.style.setProperty('min-width', `${expColWidth}px`, 'important');
            el.style.setProperty('max-width', `${expColWidth}px`, 'important');
          });
        }
      }
      table.querySelectorAll('th, td').forEach(el => {
        el.style.setProperty('font-size', '12px', 'important');
        el.style.setProperty('line-height', '1.05', 'important');
      });
      table.querySelectorAll('thead th').forEach(el => {
        el.style.setProperty('background', '#fefce8', 'important');
        el.style.setProperty('color', '#0c2134', 'important');
        el.style.setProperty('font-weight', '900', 'important');
        el.style.setProperty('position', 'static', 'important');
        el.style.setProperty('top', 'auto', 'important');
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('z-index', '5', 'important');
        el.style.setProperty('box-shadow', 'none', 'important');
      });
      table.querySelectorAll('thead th:nth-child(1)').forEach(el => {
        el.style.setProperty('position', 'sticky', 'important');
        el.style.setProperty('top', 'auto', 'important');
        el.style.setProperty('right', '0px', 'important');
        el.style.setProperty('z-index', '704', 'important');
      });
      table.querySelectorAll('thead th:nth-child(2)').forEach(el => {
        el.style.setProperty('position', 'sticky', 'important');
        el.style.setProperty('top', 'auto', 'important');
        el.style.setProperty('right', '22px', 'important');
        el.style.setProperty('z-index', '703', 'important');
        el.style.setProperty('box-shadow', '-3px 0 8px -3px rgba(15,23,42,.2)', 'important');
      });
      table.querySelectorAll('td.yield-cell, td.exp-col, .yield-value-wrap, .yield-number-shell, .yield-number, .exp-val').forEach(el => {
        el.style.setProperty('font-size', '13px', 'important');
        el.style.setProperty('line-height', '1.06', 'important');
        el.style.setProperty('font-weight', '800', 'important');
      });
      table.querySelectorAll('.prov-name').forEach(el => {
        el.style.setProperty('font-size', '13px', 'important');
        el.style.setProperty('line-height', '1.06', 'important');
      });
      table.querySelectorAll('.prov-id').forEach(el => {
        el.style.setProperty('font-size', '10px', 'important');
        el.style.setProperty('line-height', '1.02', 'important');
      });
      table.querySelectorAll('tr.average-row td, tr.average-row td *, tr.average-row .yield-number').forEach(el => {
        el.style.setProperty('font-size', '13px', 'important');
        el.style.setProperty('line-height', '1.06', 'important');
        el.style.setProperty('font-weight', '850', 'important');
      });
      table.querySelectorAll('.yield-top-rank').forEach(el => {
        el.style.setProperty('top', '-7px', 'important');
        el.style.setProperty('left', '50%', 'important');
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('transform', 'translateX(-50%)', 'important');
        el.style.setProperty('font-size', '7.5px', 'important');
        el.style.setProperty('width', '14px', 'important');
        el.style.setProperty('height', '14px', 'important');
        el.style.setProperty('min-width', '14px', 'important');
        el.style.setProperty('min-height', '14px', 'important');
      });
      normalizeMobileFinanceTablePresentation(table);
      if (isExposureOnly) {
        table.querySelectorAll('.exp-val').forEach(el => {
          el.style.setProperty('font-size', '12px', 'important');
          el.style.setProperty('line-height', '1', 'important');
          el.style.setProperty('font-weight', '900', 'important');
        });
        table.querySelectorAll('.exp-bar-bg').forEach(el => {
          el.style.setProperty('display', 'block', 'important');
          el.style.setProperty('height', '7px', 'important');
          el.style.setProperty('min-height', '7px', 'important');
        });
      }
      setupMobileTableScrollbar(table.closest('.track-table-wrapper'));
      return;

      const tableFont = 'clamp(.76rem, 2.55vw, .88rem)';
      const compactYieldFont = table.classList.contains('hide-exposure')
        ? 'clamp(.78rem, 2.65vw, .9rem)'
        : tableFont;
      table
        .querySelectorAll('td.yield-cell, td.exp-col, tr.average-row td, .yield-number, .exp-val')
        .forEach(el => {
          el.style.setProperty('font-size', tableFont, 'important');
          el.style.setProperty('line-height', '1.08', 'important');
        });
      table
        .querySelectorAll('th, .th-yield-sub, thead th small')
        .forEach(el => {
          el.style.setProperty('font-size', 'clamp(.58rem, 1.85vw, .68rem)', 'important');
          el.style.setProperty('line-height', '1.04', 'important');
        });
      table
        .querySelectorAll('td.yield-cell, tr.average-row td.yield-cell, td.yield-cell .yield-number, td.yield-cell .yield-number-shell, td.yield-cell .yield-value-wrap')
        .forEach(el => {
          el.style.setProperty('font-size', compactYieldFont, 'important');
          el.style.setProperty('line-height', '1.08', 'important');
        });
      table.querySelectorAll('.prov-name').forEach(el => {
        el.style.setProperty('font-size', 'clamp(.68rem, 2.25vw, .78rem)', 'important');
        el.style.setProperty('line-height', '1.08', 'important');
      });
      table.querySelectorAll('.prov-id').forEach(el => {
        el.style.setProperty('font-size', 'clamp(.52rem, 1.8vw, .62rem)', 'important');
        el.style.setProperty('line-height', '1.04', 'important');
      });

      table.style.setProperty('table-layout', 'fixed', 'important');
      table.style.setProperty('display', 'table', 'important');
      table.querySelector(':scope > colgroup')?.remove();
      const columnCount = table.querySelector('tr')?.children.length || 0;
      if (columnCount > 2) {
        const rankWidth = 30;
        const managerWidth = 102;
        const restWidth = columnCount > 8 ? 56 : 62;
        const tableWidth = Math.max(560, managerWidth + restWidth * (columnCount - 2));
        table.style.setProperty('width', `${tableWidth}px`, 'important');
        table.style.setProperty('min-width', `${tableWidth}px`, 'important');
        table.style.setProperty('max-width', 'none', 'important');
        const colgroup = document.createElement('colgroup');
        Array.from({ length: columnCount }).forEach((_, index) => {
          const col = document.createElement('col');
          const width = index === 0 ? `${rankWidth}px` : index === 1 ? `${managerWidth}px` : `${restWidth}px`;
          col.style.width = width;
          colgroup.appendChild(col);
        });
        table.insertBefore(colgroup, table.firstChild);
      }
      table.querySelectorAll('tr').forEach(row => {
        const rankCell = row.children[0];
        const managerCell = row.children[1];
        if (rankCell) {
          rankCell.style.setProperty('display', 'table-cell', 'important');
          rankCell.style.setProperty('position', 'sticky', 'important');
          rankCell.style.setProperty('right', '0', 'important');
          rankCell.style.setProperty('z-index', rankCell.tagName === 'TH' ? '13' : '9', 'important');
          rankCell.style.setProperty('background', rankCell.tagName === 'TH' ? '#fefce8' : '#fff', 'important');
          rankCell.style.setProperty('width', '30px', 'important');
          rankCell.style.setProperty('min-width', '30px', 'important');
          rankCell.style.setProperty('max-width', '30px', 'important');
          rankCell.style.setProperty('padding-inline', '0', 'important');
        }
        if (managerCell) {
          managerCell.style.setProperty('display', 'table-cell', 'important');
          managerCell.style.setProperty('position', 'sticky', 'important');
          managerCell.style.setProperty('right', '30px', 'important');
          managerCell.style.setProperty('z-index', managerCell.tagName === 'TH' ? '12' : '8', 'important');
          managerCell.style.setProperty('background', managerCell.tagName === 'TH' ? '#fefce8' : '#fff', 'important');
          managerCell.style.setProperty('width', '102px', 'important');
          managerCell.style.setProperty('min-width', '102px', 'important');
          managerCell.style.setProperty('max-width', '102px', 'important');
          managerCell.style.setProperty('padding-inline', '2px', 'important');
          managerCell.style.setProperty('box-shadow', '-1px 0 0 rgba(203,213,225,.9), -8px 0 12px -12px rgba(15,23,42,.35)', 'important');
        }
      });
    });
  }

  function removeMobileTableScrollbar(wrapper) {
    if (!wrapper) return;
    wrapper.nextElementSibling?.classList?.contains('mobile-table-scrollbar') && wrapper.nextElementSibling.remove();
  }

  function setupMobileTableScrollbar(wrapper) {
    if (!wrapper) return;
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    if (!isMobile) {
      removeMobileTableScrollbar(wrapper);
      return;
    }

    let rail = wrapper.nextElementSibling;
    if (!rail || !rail.classList.contains('mobile-table-scrollbar')) {
      rail = document.createElement('div');
      rail.className = 'mobile-table-scrollbar';
      rail.setAttribute('aria-hidden', 'true');
      rail.innerHTML = '<div class="mobile-table-scrollbar-track"><div class="mobile-table-scrollbar-thumb"></div></div>';
      wrapper.insertAdjacentElement('afterend', rail);
    }

    const track = rail.querySelector('.mobile-table-scrollbar-track');
    const thumb = rail.querySelector('.mobile-table-scrollbar-thumb');
    if (!track || !thumb) return;

    const maxScroll = () => Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
    const isRtl = () => {
      const declaredDir = document.dir || document.documentElement.dir;
      if (declaredDir) return declaredDir.toLowerCase() === 'rtl';
      return getComputedStyle(document.documentElement).direction === 'rtl' || getComputedStyle(document.body).direction === 'rtl';
    };
    const getProgress = () => {
      const max = maxScroll();
      if (!max) return 0;
      return Math.max(0, Math.min(1, Math.abs(wrapper.scrollLeft) / max));
    };

    const update = () => {
      const max = maxScroll();
      rail.hidden = max <= 2;
      if (rail.hidden) return;
      const trackWidth = track.clientWidth || rail.clientWidth;
      const thumbWidth = Math.max(36, Math.round((wrapper.clientWidth / wrapper.scrollWidth) * trackWidth));
      const travel = Math.max(0, trackWidth - thumbWidth);
      const visualProgress = isRtl() ? 1 - getProgress() : getProgress();
      thumb.style.width = `${thumbWidth}px`;
      thumb.style.transform = `translateX(${Math.round(travel * visualProgress)}px)`;
    };

    if (rail.dataset.bound !== '1') {
      rail.dataset.bound = '1';
      wrapper.addEventListener('scroll', () => {
        update();
        updateMobileStickyThead();
      }, { passive: true });
      window.addEventListener('resize', update, { passive: true });

      const setFromClientX = clientX => {
        const max = maxScroll();
        if (!max) return;
        const trackRect = track.getBoundingClientRect();
        const thumbRect = thumb.getBoundingClientRect();
        const travel = Math.max(1, trackRect.width - thumbRect.width);
        const raw = (clientX - trackRect.left - thumbRect.width / 2) / travel;
        const visualProgress = Math.max(0, Math.min(1, raw));
        const progress = isRtl() ? 1 - visualProgress : visualProgress;
        wrapper.scrollLeft = isRtl() ? -progress * max : progress * max;
        update();
        updateMobileStickyThead();
      };

      rail.addEventListener('pointerdown', event => {
        event.preventDefault();
        rail.setPointerCapture?.(event.pointerId);
        setFromClientX(event.clientX);
        const move = moveEvent => setFromClientX(moveEvent.clientX);
        const up = () => {
          rail.removeEventListener('pointermove', move);
          rail.removeEventListener('pointerup', up);
          rail.removeEventListener('pointercancel', up);
        };
        rail.addEventListener('pointermove', move);
        rail.addEventListener('pointerup', up);
        rail.addEventListener('pointercancel', up);
      });
    }

    requestAnimationFrame(update);
  }

  function normalizeMobileFinanceTablePresentation(scope = document) {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    if (!isMobile) return;
    scope.querySelectorAll('table.mobile-finance-table, table.mobile-finance-table *').forEach(el => {
      if (el.matches('thead th')) {
        el.style.setProperty('font-size', '12px', 'important');
        el.style.setProperty('line-height', '1.05', 'important');
        el.style.setProperty('font-weight', '900', 'important');
        el.style.setProperty('background', '#fefce8', 'important');
        el.style.setProperty('color', '#0c2134', 'important');
        el.style.setProperty('position', 'static', 'important');
        el.style.setProperty('top', 'auto', 'important');
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('z-index', '5', 'important');
        el.style.setProperty('box-shadow', 'none', 'important');
      }
      if (el.matches('td.yield-cell, td.exp-col, .yield-value-wrap, .yield-number-shell, .yield-number, .exp-val')) {
        const isExposureOnlyValue = el.matches('.exp-val') && !!el.closest('table.exposure-only');
        el.style.setProperty('font-size', '13px', 'important');
        el.style.setProperty('line-height', '1.06', 'important');
        el.style.setProperty('font-weight', isExposureOnlyValue ? '900' : '800', 'important');
      }
      if (el.matches('table.exposure-only .exp-bar-bg')) {
        el.style.setProperty('display', 'block', 'important');
        el.style.setProperty('height', '7px', 'important');
        el.style.setProperty('min-height', '7px', 'important');
      }
      if (el.matches('.prov-name')) {
        el.style.setProperty('font-size', '13px', 'important');
        el.style.setProperty('line-height', '1.06', 'important');
      }
      if (el.matches('.prov-id')) {
        el.style.setProperty('font-size', '10px', 'important');
        el.style.setProperty('line-height', '1.02', 'important');
      }
      if (el.matches('tr.average-row td, tr.average-row td *, tr.average-row .yield-number')) {
        el.style.setProperty('font-size', '13px', 'important');
        el.style.setProperty('line-height', '1.06', 'important');
        el.style.setProperty('font-weight', '850', 'important');
      }
      if (el.matches('.yield-top-rank')) {
        el.style.setProperty('top', '-7px', 'important');
        el.style.setProperty('left', '50%', 'important');
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('transform', 'translateX(-50%)', 'important');
        el.style.setProperty('font-size', '7.5px', 'important');
        el.style.setProperty('width', '14px', 'important');
        el.style.setProperty('height', '14px', 'important');
        el.style.setProperty('min-width', '14px', 'important');
        el.style.setProperty('min-height', '14px', 'important');
      }
    });
    // Re-apply sticky to rank+manager thead cells — must run last so nothing overrides it
    scope.querySelectorAll('table.mobile-finance-table').forEach(table => {
      const row = table.querySelector('thead tr');
      if (!row) return;
      const th1 = row.children[0];
      const th2 = row.children[1];
      if (th1) {
        th1.style.setProperty('position', 'sticky', 'important');
        th1.style.setProperty('right', '0px', 'important');
        th1.style.setProperty('z-index', '702', 'important');
        th1.style.setProperty('top', 'auto', 'important');
        th1.style.setProperty('box-shadow', 'none', 'important');
      }
      if (th2) {
        th2.style.setProperty('position', 'sticky', 'important');
        th2.style.setProperty('right', '22px', 'important');
        th2.style.setProperty('z-index', '700', 'important');
        th2.style.setProperty('top', 'auto', 'important');
        th2.style.setProperty('box-shadow', '-1px 0 0 rgba(203,213,225,.9), -8px 0 12px -12px rgba(15,23,42,.35)', 'important');
      }
    });
  }

  function bindFundLinks(block) {
    if (block.dataset.allocationOutlierBound !== '1') {
      block.dataset.allocationOutlierBound = '1';
      block.addEventListener('click', e => {
        const btn = e.target.closest('.allocation-outlier-btn');
        if (!btn || !block.contains(btn)) return;
        e.preventDefault();
        e.stopPropagation();
        showAllocationOutlierPopover(btn);
      }, true);
      block.addEventListener('mouseover', e => {
        const btn = e.target.closest('.allocation-outlier-btn');
        if (btn && block.contains(btn)) showAllocationOutlierPopover(btn);
      }, true);
      block.addEventListener('mouseout', e => {
        const btn = e.target.closest('.allocation-outlier-btn');
        if (!btn || !block.contains(btn)) return;
        if (!btn.contains(e.relatedTarget)) closeAllocationOutlierPopover();
      }, true);
    }
    block.querySelectorAll('.fund-link').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target.closest('.allocation-outlier-btn')) return;
        if (e.target.closest('.sandbox-check')) return;
        if (e.target.closest('.provider-status-stack')) return;
        const fundId = el.dataset.fundid;
        const catId  = state.activeCategoryId;
        if (fundId) {
          addRecentViewedFund({
            fundId,
            catId: catId || el.dataset.categoryid || '',
            providerName: el.dataset.provider || '',
            trackId: el.dataset.trackid || '',
            trackLabel: el.dataset.tracklabel || '',
            categoryLabel: el.dataset.categorylabel || '',
            y12m: el.dataset.y12m || '',
            rank: el.dataset.rank || '',
            total: el.dataset.total || ''
          });
          window.location.href = `fund.html?id=${fundId}&cat=${catId || ''}`;
        }
      });
    });
  }

  function closeAllocationOutlierPopover() {
    document.getElementById('allocation-outlier-floating-popover')?.remove();
    document.querySelectorAll('.allocation-outlier-btn[aria-expanded="true"]').forEach(btn => {
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  function showAllocationOutlierPopover(btn) {
    const text = btn?.dataset.tooltip || '';
    if (!btn || !text) return;
    if (!btn.dataset.outlierId) {
      btn.dataset.outlierId = `alloc_outlier_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    const existing = document.getElementById('allocation-outlier-floating-popover');
    const isSame = existing?.dataset.owner === btn.dataset.outlierId;
    if (isSame) return;
    closeAllocationOutlierPopover();

    const popover = document.createElement('div');
    popover.id = 'allocation-outlier-floating-popover';
    popover.className = 'allocation-outlier-floating-popover';
    popover.dataset.owner = btn.dataset.outlierId;
    popover.textContent = text;
    document.body.appendChild(popover);

    const rect = btn.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const top = Math.max(8, rect.top + window.scrollY - popRect.height - 10);
    const left = Math.min(
      window.scrollX + window.innerWidth - popRect.width - 8,
      Math.max(window.scrollX + 8, rect.left + window.scrollX + rect.width / 2 - popRect.width / 2)
    );
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    btn.setAttribute('aria-expanded', 'true');
  }

  // ─── כפתורי בקרה בשורת מסלול ההשקעה ────────────────────────
  function buildTrackHeaderControls(track) {
    const trackYearlyState = getYearlyTrackState(track.id);
    const isTrackYearlyActive = !!trackYearlyState?.active;
    const additionalYearsVisible = isTrackYearlyActive && (
      trackYearlyState.loading ||
      trackYearlyState.canExpandTo10 ||
      trackYearlyState.yearCount > 5
    );
    const additionalYearsActive = isTrackYearlyActive && trackYearlyState.yearCount > 5;

    return `
      <div class="yield-toggle-group">
        <button class="tbl-ctrl-btn yield-mode-btn${!isTrackYearlyActive && state.yieldMode==='cumulative'?' is-active':''}" data-mode="cumulative"><strong>תשואה מצטברת</strong></button>
        <button class="tbl-ctrl-btn yield-mode-btn${!isTrackYearlyActive && state.yieldMode==='annualized'?' is-active':''}" data-mode="annualized"><strong>ממוצע שנתי</strong></button>
      </div>
      <button class="tbl-ctrl-btn yield-mode-btn yearly-mode-btn${isTrackYearlyActive?' is-active':''}" data-mode="yearly">תשואה לפי שנים</button>
      ${additionalYearsVisible ? `<button class="tbl-ctrl-btn yearly-expand-btn${additionalYearsActive ? ' is-active' : ''}" ${trackYearlyState.loading ? 'disabled' : ''}>${trackYearlyState.loading ? 'טוען...' : (additionalYearsActive ? 'הסר שנים נוספות' : 'הצג שנים נוספות')}</button>` : ''}
      <button class="tbl-ctrl-btn exp-toggle-btn${state.showExposure?' is-active':''}"><i class="fas fa-layer-group"></i> אלוקציית השקעות</button>
    `;
  }

  function getYearlyTrackKey(trackId) {
    return `${state.activeCategoryId || ''}|${state.targetPopulation || ''}|${trackId || ''}`;
  }

  function getYearlyTrackState(trackId) {
    return state.yearlyByTrack.get(getYearlyTrackKey(trackId)) || null;
  }

  function setYearlyTrackState(trackId, patch) {
    const key = getYearlyTrackKey(trackId);
    const current = state.yearlyByTrack.get(key) || {
      active: false,
      loading: false,
      requestId: 0,
      yearCount: 5,
      loadedYearCount: 0,
      years: [],
      yieldMap: null,
      canExpandTo10: false,
      error: ''
    };
    const next = { ...current, ...patch };
    state.yearlyByTrack.set(key, next);
    return next;
  }

  function clearAllYearlyTrackStates() {
    state.yearlyByTrack.forEach(entry => {
      entry.active = false;
      entry.loading = false;
      entry.requestId += 1;
    });
    state.organizedData.forEach(item => {
      if (/^year_\d{4}$/.test(item.sortField)) {
        item.sortField = '1yr';
        item.sortDir = 'desc';
      }
    });
  }

  async function ensureYearlyTrackLoaded(trackId, yearCount = 5) {
    const existing = getYearlyTrackState(trackId);
    if (existing?.loading) return;
    if (existing?.yieldMap && existing.loadedYearCount === yearCount) return;

    const entry = setYearlyTrackState(trackId, {
      active: true,
      loading: true,
      yearCount,
      requestId: (existing?.requestId || 0) + 1,
      years: [],
      yieldMap: null,
      canExpandTo10: false,
      error: ''
    });
    const requestId = entry.requestId;
    state._blockRenderers.forEach(fn => fn());

    try {
      const activeItem = state.organizedData.find(item => item.track.id === trackId);
      const visibleRecords = activeItem ? applyFiltersToRecords(activeItem.records || []) : [];
      const latestByFund = new Map();
      visibleRecords.forEach(record => {
        const fundId = String(record.FUND_ID || '');
        if (!fundId || latestByFund.has(fundId)) return;
        latestByFund.set(fundId, record);
      });

      const result = await withTimeout(
        APIModule.getYearlyYieldsForFunds(
          Array.from(latestByFund.values()),
          state.activeCategoryId,
          state.targetPopulation,
          yearCount
        ),
        yearCount > 5 ? 45000 : 30000,
        { years: [], yieldMap: new Map(), timeout: true }
      );

      const current = getYearlyTrackState(trackId);
      if (!current || current.requestId !== requestId || !current.active) return;
      if (result.timeout) {
        setYearlyTrackState(trackId, {
          loading: false,
          years: [],
          yieldMap: null,
          canExpandTo10: false,
          loadedYearCount: 0,
          error: 'timeout'
        });
        return;
      }
      setYearlyTrackState(trackId, {
        loading: false,
        years: result.years || [],
        yieldMap: result.yieldMap || new Map(),
        canExpandTo10: !!result.canExpandTo10,
        loadedYearCount: yearCount,
        error: result.timeout ? 'timeout' : ''
      });
      const latestYear = (result.years || [])[0];
      const item = state.organizedData.find(row => row.track.id === trackId);
      if (latestYear && item && !/^year_\d{4}$/.test(item.sortField)) {
        item.sortField = `year_${latestYear}`;
        item.sortDir = 'desc';
      }
    } catch (error) {
      console.error(error);
      const current = getYearlyTrackState(trackId);
      if (!current || current.requestId !== requestId) return;
      setYearlyTrackState(trackId, {
        loading: false,
        years: [],
        yieldMap: null,
        loadedYearCount: 0,
        error: 'failed'
      });
    } finally {
      const current = getYearlyTrackState(trackId);
      if (current?.requestId === requestId) {
        state._blockRenderers.forEach(fn => fn());
      }
    }
  }

  async function ensureYearlyReturnsLoaded() {
    const sameScope =
      state.yearlyReturns.categoryId === state.activeCategoryId &&
      state.yearlyReturns.targetPopulation === state.targetPopulation &&
      state.yearlyReturns.loadedYearCount === state.yearlyReturns.yearCount &&
      state.yearlyReturns.activeTrackId &&
      state.yearlyReturns.yieldMap;

    if (sameScope || state.yearlyReturns.loading) return;

    state.yearlyReturns.loading = true;
    state.yearlyReturns.categoryId = state.activeCategoryId;
    state.yearlyReturns.targetPopulation = state.targetPopulation;
    const requestId = ++state.yearlyReturns.requestId;
    state._blockRenderers.forEach(fn => fn());

    try {
      const activeItem = state.organizedData.find(item => item.track.id === state.yearlyReturns.activeTrackId);
      const visibleRecords = activeItem ? applyFiltersToRecords(activeItem.records || []) : [];
      const latestByFund = new Map();
      visibleRecords.forEach(record => {
        const fundId = String(record.FUND_ID || '');
        if (!fundId || latestByFund.has(fundId)) return;
        latestByFund.set(fundId, record);
      });

      const visibleFundRecords = Array.from(latestByFund.values());
      const result = await withTimeout(
        APIModule.getYearlyYieldsForFunds(
          visibleFundRecords,
          state.activeCategoryId,
          state.targetPopulation,
          state.yearlyReturns.yearCount
        ),
        state.yearlyReturns.yearCount > 5 ? 12000 : 7000,
        { years: [], yieldMap: new Map() }
      );
      if (requestId !== state.yearlyReturns.requestId || state.yieldMode !== 'yearly') return;
      state.yearlyReturns.years = result.years;
      state.yearlyReturns.yieldMap = result.yieldMap;
      state.yearlyReturns.loadedYearCount = state.yearlyReturns.yearCount;
      const latestYear = state.yearlyReturns.years[0];
      if (latestYear) {
        state.organizedData.forEach(item => {
          if (!/^year_\d{4}$/.test(item.sortField)) {
            item.sortField = `year_${latestYear}`;
            item.sortDir = 'desc';
          }
        });
      }
    } catch (error) {
      if (requestId !== state.yearlyReturns.requestId) return;
      console.error(error);
      state.yearlyReturns.years = [];
      state.yearlyReturns.yieldMap = new Map();
    } finally {
      if (requestId !== state.yearlyReturns.requestId) return;
      state.yearlyReturns.loading = false;
      state._blockRenderers.forEach(fn => fn());
    }
  }

  function withTimeout(promise, timeoutMs, fallbackValue) {
    let timerId;
    const timeout = new Promise(resolve => {
      timerId = setTimeout(() => resolve(fallbackValue), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
  }

  // Keeps Hebrew (and any other Unicode) readable in the downloaded file name — only strips the
  // handful of characters that are genuinely illegal in Windows/macOS file names. The previous
  // version hex-encoded every non-ASCII character, turning every Hebrew file name into gibberish
  // like "5e7-5e8-5e0...".
  function shareImageSlug(value) {
    const cleaned = String(value || '')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || 'מסלול';
  }

  function getShareImageMode() {
    return state.showExposure ? 'allocation' : 'returns';
  }

  function getShareImageModeLabel() {
    if (state.showExposure) return 'אלוקציית השקעות';
    const activeCustomRange = state.customRange?.active && !!state.customRange?.yieldMap;
    if (activeCustomRange) return 'טווח תשואה מותאם';
    if (state.yearlyReturns?.active) return 'תשואה לפי שנים';
    return state.yieldMode === 'annualized' ? 'ממוצע שנתי' : 'תשואה מצטברת';
  }

  function shareImageFileName(categoryLabel, trackLabel) {
    return `${shareImageSlug(categoryLabel)} - ${shareImageSlug(trackLabel)}.png`;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('canvas blob unavailable')), type || 'image/png', quality);
    });
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const words = String(text || '').split(' ');
    const lines = [];
    let line = '';
    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  let _shareLogoImagePromise = null;
  // Inlined (not fetched from assets/gemelhub-logo-print.svg) on purpose: loading the logo as a
  // separate file — over file:// (opening index.html directly) or even plain http:// in some
  // browser configs — taints the canvas the moment it's drawn with ctx.drawImage(). The taint
  // doesn't throw there; it only surfaces later as a SecurityError from canvas.toBlob(), which is
  // exactly the "couldn't create image" failure this was producing. A same-document data: URI
  // never taints a canvas, so drawing it is always safe regardless of how the page was opened.
  const SHARE_LOGO_SVG_DATA_URI = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="184" viewBox="120 42 720 184">' +
    '<text x="190" y="140" text-anchor="middle" dominant-baseline="alphabetic" ' +
    'font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Arial, sans-serif" font-size="96">\u{1F4B0}</text>' +
    '<text x="535" y="150" text-anchor="middle" font-family="Heebo, Arial, Helvetica, sans-serif" ' +
    'font-size="118" font-weight="600" letter-spacing="-1">' +
    '<tspan fill="#183A66">Gemel</tspan><tspan fill="#d4a017">Hub</tspan></text>' +
    '<text x="535" y="205" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" ' +
    'font-family="Heebo, Arial, Helvetica, sans-serif" font-size="36" font-weight="500" fill="#d4a017">' +
    'חיסכון פנסיוני בלחיצת כפתור' +
    '</text></svg>'
  );

  function loadShareLogoImage() {
    if (_shareLogoImagePromise) return _shareLogoImagePromise;
    _shareLogoImagePromise = new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // logo is a nice-to-have — never block the image on it
      img.src = SHARE_LOGO_SVG_DATA_URI;
    });
    return _shareLogoImagePromise;
  }

  // Drawn as vector shapes (not the flag emoji, and not the site's real PNG icons) on purpose:
  // regional-indicator flag emoji (🇮🇱/🇺🇸) silently fall back to plain "IL"/"US" text boxes on
  // many Windows/Linux Chrome + font combinations (confirmed while testing this feature), and the
  // site's real flag PNGs are large externally-loaded files that would reintroduce the file://
  // canvas-tainting bug the logo fix above addresses. An inline SVG data: URI is safe and renders
  // identically everywhere.
  const SHARE_FLAG_IL_SVG_DATA_URI = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20">' +
    '<rect width="30" height="20" rx="3" fill="#fff"/>' +
    '<rect y="3" width="30" height="2.6" fill="#2563eb"/>' +
    '<rect y="14.4" width="30" height="2.6" fill="#2563eb"/>' +
    '<path d="M15 6.6l3.4 5.8H11.6L15 6.6z" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M15 13.4L11.6 7.6h6.8L15 13.4z" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-linejoin="round"/>' +
    '</svg>'
  );
  const SHARE_FLAG_US_SVG_DATA_URI = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20">' +
    '<rect width="30" height="20" rx="3" fill="#fff"/>' +
    '<g fill="#B22234">' +
    '<rect y="0" width="30" height="1.54"/><rect y="3.08" width="30" height="1.54"/>' +
    '<rect y="6.16" width="30" height="1.54"/><rect y="9.24" width="30" height="1.54"/>' +
    '<rect y="12.32" width="30" height="1.54"/><rect y="15.4" width="30" height="1.54"/>' +
    '<rect y="18.48" width="30" height="1.52"/>' +
    '</g>' +
    '<rect width="13" height="10.8" fill="#3C3B6E"/>' +
    '</svg>'
  );
  const _shareFlagImagePromises = {};
  function loadShareFlagImage(kind) {
    const src = kind === 'il' ? SHARE_FLAG_IL_SVG_DATA_URI : kind === 'us' ? SHARE_FLAG_US_SVG_DATA_URI : null;
    if (!src) return Promise.resolve(null);
    if (!_shareFlagImagePromises[kind]) {
      _shareFlagImagePromises[kind] = new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }
    return _shareFlagImagePromises[kind];
  }

  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",Arial,sans-serif';
  // Emoji glyphs (not the site's real PNG/SVG icons) on purpose: those PNGs are large,
  // externally-loaded files, which would reintroduce the exact file:// canvas-tainting bug the
  // logo fix above addresses. A plain text glyph never taints the canvas.
  // Glyph choices deliberately mirror what the real icons actually depict (checked the source PNGs):
  // allocation-fx.png is a gold "$", allocation-shekel.png is a blue "₪" — not a generic exchange symbol.
  const TAG_ICON_GLYPH = { warning: '⚠️', abroad: '🌐', fx: '$', shekel: '₪' };
  const TAG_ICON_COLOR = { fx: '#b8860b', shekel: '#2563eb' };
  const TAG_ICON_FLAG_KINDS = new Set(['il', 'us']);

  const SHARE_EXP_COLORS = { stock: '#6366f1', abroad: '#10b981', fx: '#f97316' };
  const SHARE_RANK_STYLE = {
    1: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
    2: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
    3: { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' }
  };

  // Reads the exact table the user currently sees (mode, filters, sort, rows) straight off the
  // live DOM, so the share image always matches the on-screen view without duplicating the table's
  // own formatting/ranking/heat-map logic.
  function extractShareTableData(block) {
    // Scoped to .track-table-wrapper deliberately: on desktop, buildTrackTable's sticky-header
    // clone (.track-thead-clone) carries the exact same "table.track-table" class but only ever
    // holds a cloned <thead> with zero body rows. An unscoped querySelector('table.track-table')
    // matches whichever sits first in the DOM — the empty clone — which is exactly why the old
    // html2canvas path (and this one, before this fix) produced a blank/failed image on desktop
    // while mobile (where the clone is never created) worked fine.
    const table = block.querySelector('.track-table-wrapper table.track-table');
    if (!table) return null;
    const theadRow = table.querySelector('thead tr');
    const allTh = theadRow ? Array.from(theadRow.children) : [];
    const dataCols = allTh.slice(2).map(th => {
      const clone = th.cloneNode(true);
      clone.querySelectorAll('.sort-arrow, .th-yield-sub').forEach(el => el.remove());
      return {
        label: clone.textContent.trim(),
        isExp: th.classList.contains('exp-col'),
        sortField: th.dataset.sortfield || '',
        isSorted: th.classList.contains('col-sorted-head')
      };
    });

    const cellText = td => {
      if (!td) return '-';
      if (td.dataset.displayBaseText) return td.dataset.displayBaseText;
      const clone = td.cloneNode(true);
      clone.querySelectorAll('.yield-top-rank, .yield-badge').forEach(el => el.remove());
      return clone.textContent.trim() || '-';
    };
    const cellSign = td => {
      if (!td) return 0;
      if (td.classList.contains('yield-pos')) return 1;
      if (td.classList.contains('yield-neg')) return -1;
      return 0;
    };

    const readDataCell = (td, col) => {
      if (col.isExp) {
        const bar = td.querySelector('.exp-bar');
        const text = cellText(td);
        const pct = bar ? (parseFloat(bar.style.width) || 0) : (parseFloat(text) || 0);
        const color = (bar && bar.style.background) || SHARE_EXP_COLORS[col.sortField] || '#6366f1';
        return { text, allocation: { pct, color } };
      }
      const topRankEl = td.querySelector('.yield-top-rank');
      return {
        text: cellText(td),
        sign: cellSign(td),
        topRank: topRankEl ? parseInt(topRankEl.textContent, 10) || null : null,
        badge: td.querySelector('.yield-badge')?.textContent || ''
      };
    };

    const readRow = tr => {
      const tds = Array.from(tr.children);
      const providerTd = tds[1];
      const nameEl = providerTd?.querySelector('.prov-name-text');
      const colorEl = providerTd?.querySelector('.prov-name');
      const idEl = providerTd?.querySelector('.fund-id-number');
      const tagIconsEl = providerTd?.querySelector('.fund-id-tag-icons');
      const tagIcons = [];
      if (tagIconsEl) {
        if (tagIconsEl.querySelector('.table-allocation-warning')) tagIcons.push('warning');
        if (tagIconsEl.querySelector('.table-allocation-flag-il')) tagIcons.push('il');
        if (tagIconsEl.querySelector('.table-allocation-icon-us')) tagIcons.push('us');
        if (tagIconsEl.querySelector('.table-allocation-icon-abroad')) tagIcons.push('abroad');
        if (tagIconsEl.querySelector('.table-allocation-icon-fx')) tagIcons.push('fx');
        if (tagIconsEl.querySelector('.table-allocation-icon-shekel')) tagIcons.push('shekel');
      }
      return {
        rank: tds[0] ? tds[0].textContent.trim() : '',
        providerName: nameEl ? nameEl.textContent.trim() : (providerTd?.textContent.trim() || ''),
        providerColor: (colorEl && colorEl.style.color) || '#1a3560',
        fundId: idEl ? idEl.textContent.trim().replace(/^#/, '') : '',
        tagIcons,
        cells: tds.slice(2).map((td, i) => readDataCell(td, dataCols[i] || {}))
      };
    };

    const rows = Array.from(table.querySelectorAll('tbody tr:not(.average-row)')).map(readRow);
    const avgTr = table.querySelector('tbody tr.average-row');
    const avgRow = avgTr ? {
      cells: Array.from(avgTr.children).slice(2).map((td, i) => {
        const col = dataCols[i] || {};
        if (col.isExp) {
          const text = td.textContent.trim() || '-';
          return { text, allocation: { pct: parseFloat(text) || 0, color: SHARE_EXP_COLORS[col.sortField] || '#6366f1' } };
        }
        return { text: td.textContent.trim() || '-', sign: cellSign(td) };
      })
    } : null;

    return { columns: dataCols, rows, avgRow };
  }

  // Renders a brand-new <canvas> for the current table — no external library, no DOM snapshot
  // library, so it can never hang or fail on CSS it doesn't understand.
  async function buildShareCanvas(block, categoryLabel, trackLabel, modeLabel) {
    const data = extractShareTableData(block);
    if (!data || !data.rows.length) throw new Error('No table rows to render');

    const FONT = "'Heebo', Arial, sans-serif";
    const PAD = 26;
    const RANK_W = 42;
    const HEADER_H = 46;
    const ROW_H = 42;
    const AVG_H = 44;
    const TOP_H = 154; // must stay in sync with the header block actually drawn below (logo + title + mode pill + gap)
    const DISCLAIMER_TEXT = 'הנתונים מוצגים לצורכי מידע והשוואה בלבד ואינם מהווים ייעוץ, שיווק או המלצה אישית. התשואות מוצגות לפני דמי ניהול.';
    const DISCLAIMER_LINE_H = 15;
    const FOOTER_H = 42;

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');

    mctx.font = `800 14px ${FONT}`;
    let managerW = 100;
    data.rows.forEach(r => {
      const iconsW = (r.tagIcons && r.tagIcons.length)
        ? r.tagIcons.reduce((sum, kind) => sum + (TAG_ICON_FLAG_KINDS.has(kind) ? 18 : 14), 4)
        : 0;
      const w = mctx.measureText(`${r.providerName}   #${r.fundId}`).width + 34 + iconsW;
      managerW = Math.max(managerW, Math.min(w, 260));
    });

    mctx.font = `700 12.5px ${FONT}`;
    const colWidths = data.columns.map(col => {
      const headerW = mctx.measureText(col.label).width;
      return Math.max(col.isExp ? 108 : 88, Math.ceil(headerW) + 26);
    });

    const tableW = RANK_W + managerW + colWidths.reduce((a, b) => a + b, 0);
    const width = Math.ceil(tableW + PAD * 2);

    mctx.font = `600 11px ${FONT}`;
    const disclaimerLines = wrapCanvasText(mctx, DISCLAIMER_TEXT, tableW);
    const disclaimerH = disclaimerLines.length * DISCLAIMER_LINE_H + 14;

    const height = Math.ceil(TOP_H + HEADER_H + data.rows.length * ROW_H + (data.avgRow ? AVG_H : 0) + disclaimerH + FOOTER_H + PAD / 2);

    // High quality by default, but never risk exceeding real browser canvas limits.
    let scale = Math.min(2, window.devicePixelRatio || 2);
    const MAX_DIM = 8000, MAX_AREA = 60000000;
    while (scale > 1 && (width * scale > MAX_DIM || height * scale > MAX_DIM || width * height * scale * scale > MAX_AREA)) {
      scale -= 0.25;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.direction = 'rtl';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // ── brand header ──
    let y = 22;
    const usedFlagKinds = new Set();
    data.rows.forEach(r => (r.tagIcons || []).forEach(kind => { if (TAG_ICON_FLAG_KINDS.has(kind)) usedFlagKinds.add(kind); }));
    const flagImages = {};
    await Promise.all(Array.from(usedFlagKinds).map(async kind => { flagImages[kind] = await loadShareFlagImage(kind); }));
    const logo = await loadShareLogoImage();
    ctx.textAlign = 'center';
    if (logo && logo.width) {
      const logoH = 42, logoW = logoH * (logo.width / logo.height);
      ctx.drawImage(logo, width / 2 - logoW / 2, y, logoW, logoH);
      y += logoH + 16;
    } else {
      ctx.font = `800 24px ${FONT}`;
      ctx.fillStyle = '#183A66';
      ctx.fillText('GemelHub', width / 2, y + 16);
      y += 40;
    }

    ctx.font = `800 21px ${FONT}`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`${categoryLabel} - ${trackLabel}`, width / 2, y + 12);
    y += 32;

    ctx.font = `700 12.5px ${FONT}`;
    const pillW = ctx.measureText(modeLabel).width + 30, pillH = 24;
    const pillX = width / 2 - pillW / 2;
    ctx.fillStyle = '#fffbea';
    roundRectPath(ctx, pillX, y, pillW, pillH, 12);
    ctx.fill();
    ctx.strokeStyle = '#d8c589';
    ctx.lineWidth = 1;
    roundRectPath(ctx, pillX, y, pillW, pillH, 12);
    ctx.stroke();
    ctx.fillStyle = '#8a6d1d';
    ctx.fillText(modeLabel, width / 2, y + pillH / 2 + 1);

    // ── table geometry (RTL: rank rightmost, then manager, then data columns in DOM order) ──
    const tableY = TOP_H;
    const tableX0 = PAD;
    const cols = [];
    {
      let x = tableX0 + tableW;
      x -= RANK_W; cols.push({ x, w: RANK_W, key: 'rank' });
      x -= managerW; cols.push({ x, w: managerW, key: 'manager' });
      data.columns.forEach((col, i) => {
        x -= colWidths[i];
        cols.push({ x, w: colWidths[i], key: 'data', col, i });
      });
    }
    const bodyH = data.rows.length * ROW_H + (data.avgRow ? AVG_H : 0);

    // sorted-column tint spanning the whole column (header + body), matching the site's highlight
    cols.forEach(c => {
      if (c.key === 'data' && c.col.isSorted) {
        ctx.fillStyle = 'rgba(253,224,71,0.16)';
        ctx.fillRect(c.x, tableY, c.w, HEADER_H + bodyH);
      }
    });

    // header row
    ctx.fillStyle = '#f6f5ef';
    ctx.fillRect(tableX0, tableY, tableW, HEADER_H);
    ctx.font = `800 12.5px ${FONT}`;
    cols.forEach(c => {
      const isSortedHeader = c.key === 'data' && c.col.isSorted;
      ctx.fillStyle = isSortedHeader ? '#8a6d1d' : '#475569';
      const label = c.key === 'rank' ? '#' : c.key === 'manager' ? 'מנהל' : c.col.label;
      ctx.fillText(label, c.x + c.w / 2, tableY + HEADER_H / 2 + 1);
    });
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tableX0, tableY + HEADER_H);
    ctx.lineTo(tableX0 + tableW, tableY + HEADER_H);
    ctx.stroke();

    // ── body rows ──
    let rowY = tableY + HEADER_H;
    const drawAllocationCell = (c, cy, cell) => {
      const pct = cell.allocation.pct;
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = '#1e293b';
      ctx.fillText(cell.text, c.x + c.w / 2, cy - 7);
      const barW = c.w - 24, barX = c.x + 12, barY = cy + 8, barH = 6;
      ctx.fillStyle = '#e2e8f0';
      roundRectPath(ctx, barX, barY, barW, barH, 3);
      ctx.fill();
      const fillW = Math.max(0, Math.min(100, pct)) / 100 * barW;
      if (fillW > 0) {
        ctx.fillStyle = cell.allocation.color;
        roundRectPath(ctx, barX, barY, fillW, barH, 3);
        ctx.fill();
      }
    };
    const drawYieldCell = (c, cy, cell) => {
      ctx.font = `700 13.5px ${FONT}`;
      ctx.fillStyle = cell.sign > 0 ? '#1cb452' : cell.sign < 0 ? '#dc2626' : '#1e293b';
      ctx.fillText(cell.text, c.x + c.w / 2, cy);
      if (cell.topRank && SHARE_RANK_STYLE[cell.topRank]) {
        const textW = ctx.measureText(cell.text).width;
        const style = SHARE_RANK_STYLE[cell.topRank];
        const r = 6.5;
        const bx = c.x + c.w / 2 + textW / 2 + r + 3;
        const by = cy - 9;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fillStyle = style.bg;
        ctx.fill();
        ctx.strokeStyle = style.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = `900 8.5px ${FONT}`;
        ctx.fillStyle = style.text;
        ctx.fillText(String(cell.topRank), bx, by + 0.5);
      }
    };

    data.rows.forEach((row, rowIdx) => {
      const cy = rowY + ROW_H / 2;
      if (rowIdx % 2 === 1) {
        ctx.fillStyle = '#fafaf8';
        ctx.fillRect(tableX0, rowY, tableW, ROW_H);
        cols.forEach(c => {
          if (c.key === 'data' && c.col.isSorted) {
            ctx.fillStyle = 'rgba(253,224,71,0.16)';
            ctx.fillRect(c.x, rowY, c.w, ROW_H);
          }
        });
      }
      cols.forEach(c => {
        if (c.key === 'rank') {
          ctx.font = `700 12.5px ${FONT}`;
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(row.rank, c.x + c.w / 2, cy);
        } else if (c.key === 'manager') {
          ctx.beginPath();
          ctx.arc(c.x + c.w - 14, cy, 4, 0, Math.PI * 2);
          ctx.fillStyle = row.providerColor;
          ctx.fill();
          ctx.font = `800 13.5px ${FONT}`;
          ctx.fillStyle = row.providerColor;
          ctx.textAlign = 'right';
          ctx.fillText(row.providerName, c.x + c.w - 24, cy - 6);
          ctx.font = `600 10.5px ${FONT}`;
          ctx.fillStyle = '#94a3b8';
          const fundIdText = `#${row.fundId}`;
          ctx.fillText(fundIdText, c.x + c.w - 24, cy + 9);
          if (row.tagIcons && row.tagIcons.length) {
            const fundIdW = ctx.measureText(fundIdText).width;
            const iconBaseline = cy + 9;
            let iconRight = c.x + c.w - 24 - fundIdW - 5;
            row.tagIcons.forEach(kind => {
              if (TAG_ICON_FLAG_KINDS.has(kind)) {
                const flagImg = flagImages[kind];
                const flagW = 15, flagH = 10;
                if (flagImg && flagImg.width) {
                  ctx.drawImage(flagImg, iconRight - flagW, iconBaseline - flagH / 2, flagW, flagH);
                }
                iconRight -= flagW + 3;
              } else {
                const glyph = TAG_ICON_GLYPH[kind];
                if (!glyph) return;
                const color = TAG_ICON_COLOR[kind];
                ctx.font = color ? `900 12px ${FONT}` : `11px ${EMOJI_FONT}`;
                ctx.fillStyle = color || '#000000';
                ctx.fillText(glyph, iconRight, iconBaseline);
                iconRight -= 14;
              }
            });
          }
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
        } else {
          const cell = row.cells[c.i];
          if (!cell) return;
          if (cell.allocation) drawAllocationCell(c, cy, cell);
          else drawYieldCell(c, cy, cell);
        }
      });
      rowY += ROW_H;
    });

    // ── group average row ──
    if (data.avgRow) {
      ctx.fillStyle = '#fefce8';
      ctx.fillRect(tableX0, rowY, tableW, AVG_H);
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tableX0, rowY); ctx.lineTo(tableX0 + tableW, rowY);
      ctx.moveTo(tableX0, rowY + AVG_H); ctx.lineTo(tableX0 + tableW, rowY + AVG_H);
      ctx.stroke();
      const cy = rowY + AVG_H / 2;
      cols.forEach(c => {
        if (c.key === 'rank') return;
        if (c.key === 'manager') {
          ctx.font = `800 italic 13px ${FONT}`;
          ctx.fillStyle = '#64748b';
          ctx.textAlign = 'right';
          ctx.fillText('ממוצע קבוצה', c.x + c.w - 24, cy);
          ctx.textAlign = 'center';
        } else {
          const cell = data.avgRow.cells[c.i];
          if (!cell) return;
          if (cell.allocation) {
            drawAllocationCell(c, cy, cell);
          } else {
            ctx.font = `800 italic 13px ${FONT}`;
            ctx.fillStyle = cell.sign > 0 ? '#1cb452' : cell.sign < 0 ? '#dc2626' : '#334155';
            ctx.fillText(cell.text, c.x + c.w / 2, cy);
          }
        }
      });
      rowY += AVG_H;
    }

    // ── legal disclaimer (below the table, above the brand footer) ──
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    let disclaimerY = height - FOOTER_H - disclaimerH + DISCLAIMER_LINE_H / 2 + 7;
    disclaimerLines.forEach(line => {
      ctx.fillText(line, width / 2, disclaimerY);
      disclaimerY += DISCLAIMER_LINE_H;
    });

    // ── footer (no URL, per product requirements) ──
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('נוצר ב-GemelHub', width / 2, height - FOOTER_H / 2);

    return canvas;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Shown after the image was opened/downloaded (i.e. no native share sheet was available) so the
  // user can still reach WhatsApp — or copy the track link to share it anywhere else — without the
  // browser being able to attach the file automatically.
  function showShareOptionsToast(shareText, shareUrl) {
    document.querySelectorAll('.share-options-toast').forEach(el => el.remove());
    const toast = document.createElement('div');
    toast.className = 'share-options-toast';
    toast.innerHTML = `
      <button type="button" class="share-options-toast-close" aria-label="סגור">✕</button>
      <div class="share-options-toast-title">התמונה נשמרה למחשב</div>
      <div class="share-options-toast-actions">
        <button type="button" class="share-options-toast-btn whatsapp"><i class="fab fa-whatsapp" aria-hidden="true"></i> שתף בווטסאפ</button>
        <button type="button" class="share-options-toast-btn copy"><i class="fas fa-link" aria-hidden="true"></i> העתק קישור למסלול</button>
      </div>
    `;
    document.body.appendChild(toast);
    const close = () => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 350); };
    toast.querySelector('.whatsapp').addEventListener('click', () => {
      window.open('https://wa.me/?text=' + encodeURIComponent(shareText), '_blank', 'noopener');
      close();
    });
    toast.querySelector('.copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('הקישור הועתק');
      } catch (e) { /* clipboard API unavailable — user can still copy from the WhatsApp text */ }
      close();
    });
    toast.querySelector('.share-options-toast-close').addEventListener('click', close);
    setTimeout(close, 14000);
  }

  async function shareTrackImage(track) {
    if (!track?.id || !state.activeCategoryId) return;

    const mode = getShareImageMode();
    const modeLabel = getShareImageModeLabel();
    const category = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === state.activeCategoryId);
    const categoryLabel = category?.label || state.activeCategoryId;
    const title = `${categoryLabel} - ${track.label}`;
    const block = Array.from(document.querySelectorAll('.track-block'))
      .find(item => item.dataset.trackId === track.id);
    const btn = block?.querySelector('.share-track-image-btn');
    if (!block) return;
    const shareUrl = `${location.origin}${location.pathname}?cat=${encodeURIComponent(state.activeCategoryId)}&focusTrack=${encodeURIComponent(track.id)}`;
    const shareText = `השוואת ${title} ב-GemelHub לפי התצוגה שבחרת\n${shareUrl}`;
    try {
      if (btn) {
        btn.classList.add('is-loading');
        btn.disabled = true;
      }
      const canvas = await buildShareCanvas(block, categoryLabel, track.label, modeLabel);
      const fileName = shareImageFileName(categoryLabel, track.label);
      let blob;
      try {
        blob = await canvasToBlob(canvas, 'image/png');
      } catch (blobError) {
        // Extremely large tables: fall back to JPEG, which tends to succeed where PNG encoding fails.
        blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      }
      const file = new File([blob], fileName, { type: blob.type });

      // Try the native share sheet everywhere it's offered (mobile *and* desktop browsers that wire
      // one up, e.g. Windows share) — it's the only way to hand the actual image file to WhatsApp/
      // Mail/"edit" in one step. NotAllowedError/AbortError just mean it's unavailable or the user
      // backed out, so fall through to the plain download + toast below instead of failing.
      if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ title, text: shareText, files: [file] });
          return;
        } catch (shareError) {
          if (shareError?.name === 'AbortError') return; // user cancelled the share sheet — not a failure
          console.warn('navigator.share failed, falling back to download', shareError);
        }
      }

      // No new tab/window on purpose — the image just saves straight into the current page's
      // download flow, and the toast below offers WhatsApp/copy-link right where the user already is.
      downloadBlob(file, fileName);
      showShareOptionsToast(shareText, shareUrl);
    } catch (error) {
      if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
      console.warn('Could not create share image', error);
      alert('לא הצלחתי ליצור תמונת שיתוף כרגע. כדאי לנסות שוב בעוד רגע.');
    } finally {
      if (btn) {
        btn.classList.remove('is-loading');
        btn.disabled = false;
      }
    }
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const result = new Array(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++;
        result[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }));
    return result;
  }

  function buildYearlyReturnsFromHistories(histories, yearCount = 10) {
    const periodsByYear = new Map();

    histories.forEach(({ records }) => {
      (records || []).forEach(record => {
        const period = Number(record.REPORT_PERIOD);
        const year = Math.floor(period / 100);
        const month = period % 100;
        if (!year || month < 1 || month > 12) return;
        if (!periodsByYear.has(year)) periodsByYear.set(year, new Set());
        periodsByYear.get(year).add(period);
      });
    });

    const years = Array.from(periodsByYear.entries())
      .filter(([, periods]) => periods.size === 12)
      .map(([year]) => year)
      .sort((a, b) => b - a)
      .slice(0, yearCount);

    const expectedByYear = new Map(years.map(year => [
      year,
      Array.from({ length: 12 }, (_, index) => (year * 100) + index + 1)
    ]));
    const yieldMap = new Map();

    histories.forEach(({ fundId, records }) => {
      const byPeriod = new Map();
      (records || []).forEach(record => {
        const period = Number(record.REPORT_PERIOD);
        if (period) byPeriod.set(period, record);
      });

      const fundYears = new Map();
      years.forEach(year => {
        let compound = 1;
        for (const period of expectedByYear.get(year)) {
          const monthlyYield = parseFloat(byPeriod.get(period)?.MONTHLY_YIELD);
          if (isNaN(monthlyYield)) {
            fundYears.set(year, null);
            return;
          }
          compound *= (1 + monthlyYield / 100);
        }
        fundYears.set(year, (compound - 1) * 100);
      });
      yieldMap.set(String(fundId), fundYears);
    });

    return { years, yieldMap };
  }

  function bindTableControls(block) {
    // כפתורי מצטבר / ממוצע שנתי — segmented control
    block.querySelectorAll('.yield-mode-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const newMode = btn.dataset.mode;
        const wasExposure = state.showExposure;
        const isMobileExposureMode = state.showExposure && window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
        const hasActiveYearly = Array.from(state.yearlyByTrack.values()).some(entry => entry.active);
        if (isMobileExposureMode) {
          state.showExposure = false;
          document.querySelectorAll('.exp-toggle-btn').forEach(b => b.classList.remove('is-active'));
          document.querySelectorAll('table.track-table').forEach(t => {
            t.classList.add('hide-exposure');
            t.classList.remove('exposure-only');
          });
        }
        if (wasExposure && newMode === state.yieldMode && !hasActiveYearly) {
          document.querySelectorAll('.yield-mode-btn[data-mode]').forEach(b => {
            b.classList.toggle('is-active', b.dataset.mode === state.yieldMode);
          });
          syncTracksDensityClasses();
          if (Array.from(document.querySelectorAll('table.track-table')).some(t => !t.querySelector('th.yield-col, td.yield-cell'))) {
            state._blockRenderers.forEach(fn => fn());
          }
          scheduleTrackTableFirstRowScroll(block, { onlyIfNeeded: true, behavior: 'auto' });
          return;
        }
        if (newMode === 'yearly') {
          const trackId = block.dataset.trackId || null;
          if (!trackId) return;
          setYearlyTrackState(trackId, { active: true, yearCount: 5, loadedYearCount: 0, years: [], yieldMap: null, error: '' });
          block.querySelectorAll('.yield-mode-btn[data-mode]').forEach(b => {
            b.classList.toggle('is-active', b.dataset.mode === 'yearly');
          });
          syncTracksDensityClasses();
          state._blockRenderers.forEach(fn => fn());
          scheduleTrackTableFirstRowScroll(block);
          ensureYearlyTrackLoaded(trackId, 5);
          return;
        }
        if (!wasExposure && state.yieldMode === newMode && !hasActiveYearly) {
          scheduleTrackTableFirstRowScroll(block, { onlyIfNeeded: true });
          return;
        }
        state.yieldMode = newMode;
        clearAllYearlyTrackStates();
        // עדכון is-active על כל הכפתורים בכל הבלוקים
        document.querySelectorAll('.yield-mode-btn[data-mode]').forEach(b => {
          b.classList.toggle('is-active', b.dataset.mode === state.yieldMode);
        });
        // רינדור מחדש של כל הטבלאות (ערכי 3Y/5Y משתנים)
        syncTracksDensityClasses();
        state._blockRenderers.forEach(fn => fn());
        scheduleTrackTableFirstRowScroll(block);
      });
    });

    block.querySelector('.yearly-expand-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const trackId = block.dataset.trackId || null;
      const entry = getYearlyTrackState(trackId);
      if (!trackId || entry?.loading) return;
      if ((entry?.yearCount || 5) > 5) {
        setYearlyTrackState(trackId, {
          active: true,
          yearCount: 5,
          years: [],
          yieldMap: null,
          loadedYearCount: 0,
          error: '',
          requestId: (entry?.requestId || 0) + 1
        });
        syncTracksDensityClasses();
        state._blockRenderers.forEach(fn => fn());
        scheduleTrackTableFirstRowScroll(block);
        ensureYearlyTrackLoaded(trackId, 5);
        return;
      }
      setYearlyTrackState(trackId, {
        active: true,
        yearCount: 10,
        years: [],
        yieldMap: null,
        canExpandTo10: entry?.canExpandTo10 || true,
        loadedYearCount: 0,
        error: '',
        requestId: (entry?.requestId || 0) + 1
      });
      syncTracksDensityClasses();
      state._blockRenderers.forEach(fn => fn());
      scheduleTrackTableFirstRowScroll(block);
      ensureYearlyTrackLoaded(trackId, 10);
    });

    // כפתור שיתוף תמונה — bindTableControls נקרא מחדש בכל רינדור (מיון, טוגל אלוקציה וכו'),
    // אבל הכפתור עצמו נשאר אותו אלמנט DOM לאורך כל חיי הבלוק. בלי השמירה הזו כל רינדור מוסיף
    // עוד listener על אותו כפתור, ולחיצה בודדת אחרי כמה מיונים מייצרת כמה תמונות/הורדות בבת אחת.
    const shareImgBtn = block.querySelector('.share-track-image-btn');
    if (shareImgBtn && !shareImgBtn.dataset.shareBound) {
      shareImgBtn.dataset.shareBound = '1';
      shareImgBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const trackId = block.dataset.trackId || null;
        const track = CONFIG.INVESTMENT_TRACKS.find(item => item.id === trackId);
        shareTrackImage(track);
      });
    }

    const eBtn = block.querySelector('.exp-toggle-btn');
    if (eBtn) {
      eBtn.addEventListener('click', e => {
        e.stopPropagation();
        state.showExposure = !state.showExposure;
        const shouldReturnToCompactTrack = !state.showExposure && state.compactTracksView;
        const isMobileExposureMode = state.showExposure && window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
        if (isMobileExposureMode) {
          document.querySelectorAll('.yield-mode-btn, .yearly-expand-btn').forEach(b => b.classList.remove('is-active'));
        }
        // עדכון כל כפתורי האלוקציה
        document.querySelectorAll('.exp-toggle-btn').forEach(b => {
          b.classList.toggle('is-active', state.showExposure);
        });
        // toggle class על כל הטבלאות — CSS מסתיר/מציג .exp-col
        const _isMobExp = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
        const tables = Array.from(document.querySelectorAll('table.track-table'));
        const needsExposureRender = state.showExposure && tables.some(t => !t.querySelector('th.exp-col, td.exp-col'));
        const needsYieldRender = !state.showExposure && tables.some(t => !t.querySelector('th.yield-col, td.yield-cell'));
        tables.forEach(t => {
          t.classList.toggle('hide-exposure', !state.showExposure);
          t.classList.toggle('exposure-only', state.showExposure && _isMobExp);
        });
        syncTracksDensityClasses();
        clearMobileExposureCompetingActiveButtons();
        if (needsExposureRender || needsYieldRender) {
          state._blockRenderers.forEach(fn => fn());
          if (state.showExposure) scheduleTrackTableFirstRowScroll(block, { onlyIfNeeded: true, behavior: 'auto' });
          else if (shouldReturnToCompactTrack) requestAnimationFrame(() => requestAnimationFrame(() => scrollToTrackBlockTop(block, 'auto')));
          return;
        }
        if (state.showExposure) scheduleTrackTableFirstRowScroll(block, { onlyIfNeeded: true, behavior: 'auto' });
        else if (shouldReturnToCompactTrack) requestAnimationFrame(() => requestAnimationFrame(() => scrollToTrackBlockTop(block)));
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SANDBOX — המעבדה שלי
  // ═══════════════════════════════════════════════════════════════

  function clearMobileExposureCompetingActiveButtons() {
    const isMobileExposureMode = !!(
      state.showExposure &&
      window.matchMedia &&
      window.matchMedia('(max-width: 1024px)').matches
    );
    if (!isMobileExposureMode) return;
    document.querySelectorAll('.yield-mode-btn, .yearly-expand-btn').forEach(btn => {
      btn.classList.remove('is-active');
    });
  }

  function _sbGetTrackLabel(trackId) {
    return CONFIG.INVESTMENT_TRACKS.find(t => t.id === trackId)?.label || trackId;
  }

  function _sbGetCategoryLabel(catId) {
    return CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId)?.label || catId || '';
  }

  function _sbGetCategoryMeta(catId) {
    return CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId) || { label: catId || '', color: '#94a3b8', icon: '📊' };
  }

  function isSandboxSelected(fundId, trackId, categoryId) {
    return state.sandbox.selections.some(s => s.fundId === fundId && s.trackId === trackId && s.categoryId === categoryId);
  }

  function isInSandboxPortfolio(fundId, trackId, categoryId) {
    return state.sandbox.portfolio.some(s => s.fundId === fundId && s.trackId === trackId && s.categoryId === categoryId);
  }

  function removeSandboxSelection(fundId, trackId, categoryId) {
    const before = state.sandbox.selections.length;
    state.sandbox.selections = state.sandbox.selections.filter(s =>
      !(s.fundId === fundId && s.trackId === trackId && s.categoryId === categoryId));
    if (state.sandbox.selections.length !== before) updateSandboxBar();
  }

  function removeSandboxPortfolioItem(fundId, trackId, categoryId) {
    const before = state.sandbox.portfolio.length;
    state.sandbox.portfolio = state.sandbox.portfolio.filter(s =>
      !(s.fundId === fundId && s.trackId === trackId && s.categoryId === categoryId));
    if (state.sandbox.portfolio.length !== before) saveSandboxPortfolio();
  }

  function getH2HMembershipKey(fundId, categoryId) {
    return `${String(categoryId || '')}::${String(fundId || '')}`;
  }

  function loadH2HPersistedKeysFromStorage() {
    try {
      const raw = localStorage.getItem(H2H_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const savedItems = Array.isArray(parsed?.items) ? parsed.items : [];
      state.h2h.persistedKeys = new Set(savedItems
        .filter(item => item?.catId && item?.fundId)
        .map(item => getH2HMembershipKey(item.fundId, item.catId)));
    } catch (error) {
      state.h2h.persistedKeys = new Set();
    }
  }

  function syncH2HPersistedKeysFromItems() {
    state.h2h.persistedKeys = new Set((state.h2h.items || [])
      .filter(item => item?.catId && item?.record?.FUND_ID)
      .map(item => getH2HMembershipKey(item.record.FUND_ID, item.catId)));
  }

  function isInH2HComparison(fundId, categoryId) {
    const key = getH2HMembershipKey(fundId, categoryId);
    return state.h2h.persistedKeys?.has(key) ||
      (state.h2h.items || []).some(item => getH2HMembershipKey(item.record?.FUND_ID, item.catId) === key);
  }

  function removeH2HComparisonItem(fundId, categoryId) {
    const key = getH2HMembershipKey(fundId, categoryId);
    state.h2h.items = (state.h2h.items || []).filter(item =>
      getH2HMembershipKey(item.record?.FUND_ID, item.catId) !== key);
    state.h2h.persistedKeys?.delete(key);
    try {
      const raw = localStorage.getItem(H2H_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.items)) {
        parsed.items = parsed.items.filter(item => getH2HMembershipKey(item.fundId, item.catId) !== key);
        localStorage.setItem(H2H_STORAGE_KEY, JSON.stringify(parsed));
      }
    } catch (error) {
      console.warn('Could not remove H2H item from storage', error);
    }
    invalidateH2HYearData();
    updateH2HTabBadge();
  }

  function getFundMembershipStatus(fundId, trackId, categoryId) {
    const sandboxSelected = isSandboxSelected(String(fundId), trackId, categoryId);
    const inSandboxPortfolio = isInSandboxPortfolio(String(fundId), trackId, categoryId);
    const inH2H = isInH2HComparison(String(fundId), categoryId);
    const inSandbox = sandboxSelected || inSandboxPortfolio;
    return { sandboxSelected, inSandboxPortfolio, inSandbox, inH2H };
  }

  function getFundMembershipTitle({ sandboxSelected, inSandboxPortfolio, inSandbox, inH2H }) {
    if (inSandboxPortfolio && inH2H) return 'נמצא במעבדה ובראש בראש';
    if (sandboxSelected && inH2H) return 'נבחר להוספה ליעד נוסף';
    if (sandboxSelected) return 'נבחר להוספה';
    if (inSandboxPortfolio) return 'נמצא במעבדה שלי';
    if (inH2H) return 'נמצא בראש בראש';
    return '';
  }

  function renderFundMembershipIndicators(fundId, trackId, categoryId) {
    const status = getFundMembershipStatus(fundId, trackId, categoryId);
    return getFundMembershipTitle(status);
  }

  function syncFundMembershipIndicators() {
    document.querySelectorAll('.provider-status-stack').forEach(stack => {
      const fundId = stack.dataset.fundid || '';
      const trackId = stack.dataset.trackid || '';
      const categoryId = stack.dataset.categoryid || '';
      const status = getFundMembershipStatus(fundId, trackId, categoryId);
      const checkbox = stack.querySelector('.sandbox-check');
      const title = getFundMembershipTitle(status);
      if (checkbox) {
        checkbox.checked = !!(status.sandboxSelected || status.inSandboxPortfolio || status.inH2H);
        checkbox.classList.toggle('is-sandbox-selected', !!status.sandboxSelected);
        checkbox.classList.toggle('is-in-sandbox', !!status.inSandboxPortfolio);
        checkbox.classList.toggle('is-in-portfolio', !!status.inSandboxPortfolio);
        checkbox.classList.toggle('is-in-h2h', !!status.inH2H);
        checkbox.classList.toggle('is-in-both', !!status.inSandboxPortfolio && !!status.inH2H);
        if (title) checkbox.title = title;
        else checkbox.removeAttribute('title');
      }
    });
  }

  function _sbItemKey(itemOrParts) {
    if (!itemOrParts) return '';
    return [
      itemOrParts.categoryId || '',
      itemOrParts.trackId || '',
      itemOrParts.fundId || ''
    ].map(value => String(value)).join('|');
  }

  function _sbEscapeAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function _sbFindPortfolioItemFromElement(el) {
    const key = el?.dataset?.sandboxKey;
    if (key) {
      const byKey = state.sandbox.portfolio.find(item => _sbItemKey(item) === key);
      if (byKey) return byKey;
    }
    const idx = parseInt(el?.dataset?.portfolioIdx, 10);
    return Number.isInteger(idx) ? state.sandbox.portfolio[idx] : null;
  }

  function _sbFreeStorageForPortfolio() {
    try {
      const removablePrefixes = [
        'gemelhub_api_v1',
        'gemelhub_hist_v1_',
        'gemelhub_trailing7y_v1_',
        'gemelhub_pavg_v1_',
        'gemelhub_pcg_v3_',
        'gemelhub_track_',
        'gemelhub_actuarial_',
        'gemelhub_yearly_'
      ];
      Object.keys(localStorage).forEach(key => {
        if (removablePrefixes.some(prefix => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      });
    } catch(e) {}
  }

  function _sbSyncVisibleInputsToState() {
    const sbSection = document.getElementById('sandbox-section');
    if (!sbSection || sbSection.style.display === 'none') return;
    sbSection.querySelectorAll('.sandbox-invest-input').forEach(input => {
      const item = _sbFindPortfolioItemFromElement(input);
      if (!item) return;
      const clean = input.value.replace(/,/g, '').replace(/[^\d.]/g, '');
      if (item.investMode === 'percent') item.investPct = clean;
      else item.investAmount = clean;
    });
    sbSection.querySelectorAll('.sandbox-fee-input').forEach(input => {
      const item = _sbFindPortfolioItemFromElement(input);
      if (!item) return;
      const field = input.dataset.field;
      if (field === 'dnCumulative') item.dnCumulative = input.value;
      else if (field === 'dnDeposit') item.dnDeposit = input.value;
    });
  }

  function loadSandboxPortfolio() {
    _sbLoadReturnFields();
    try {
      const saved = localStorage.getItem(SANDBOX_STORAGE_KEY);
      if (saved) state.sandbox.portfolio = JSON.parse(saved);
    } catch(e) { state.sandbox.portfolio = []; }
    try {
      const savedSel = localStorage.getItem(SANDBOX_SELECTIONS_KEY);
      if (savedSel) state.sandbox.selections = JSON.parse(savedSel);
    } catch(e) { state.sandbox.selections = []; }
    state.sandbox.portfolioName = localStorage.getItem(SANDBOX_NAME_KEY) || '';
    state.sandbox.isDirty       = localStorage.getItem(SANDBOX_DIRTY_KEY) === '1';
    state.sandbox.autoSaveId    = localStorage.getItem(SANDBOX_AUTOSAVE_ID_KEY) || null;
    state.sandbox.lastModified  = localStorage.getItem(SANDBOX_LAST_MOD_KEY) || '';
    // On load: auto-merge any pending selections into portfolio so the bar
    // never reappears for items the user already "added" in a prior session.
    if (state.sandbox.selections.length > 0) {
      state.sandbox.selections.forEach(sel => {
        if (!isInSandboxPortfolio(sel.fundId, sel.trackId, sel.categoryId)) {
          state.sandbox.portfolio.push({
            ...sel,
            dnCumulative: _sbDefaultFee(sel.categoryId),
            dnDeposit: _sbDefaultFeeDeposit(sel.categoryId),
            investAmount: '', investPct: '', investMode: 'amount'
          });
        }
      });
      state.sandbox.selections = [];
      saveSandboxPortfolio();
    }
    _sbUpdateTabBadge();
    updateSandboxBar();
  }

  function saveSandboxPortfolio() {
    // Always snapshot current DOM values first so in-progress edits are captured
    _sbSyncVisibleInputsToState();
    const pJson = JSON.stringify(state.sandbox.portfolio);
    const sJson = JSON.stringify(state.sandbox.selections);
    const _trySave = () => {
      localStorage.setItem(SANDBOX_STORAGE_KEY, pJson);
      localStorage.setItem(SANDBOX_SELECTIONS_KEY, sJson);
      if (state.sandbox.portfolioName) localStorage.setItem(SANDBOX_NAME_KEY, state.sandbox.portfolioName);
      else localStorage.removeItem(SANDBOX_NAME_KEY);
      const _now = new Date().toISOString();
      state.sandbox.lastModified = _now;
      localStorage.setItem(SANDBOX_LAST_MOD_KEY, _now);
    };
    try {
      _trySave();
    } catch(e) {
      // QuotaExceededError — free API cache and retry
      try {
        _sbFreeStorageForPortfolio();
        _trySave();
      } catch(e2) { /* storage unavailable */ }
    }
    _sbUpdateTabBadge();
    syncFundMembershipIndicators();
    _sbShowAutosaveIndicator();
  }

  let _sbAutosaveTimer = null;
  function _sbShowAutosaveIndicator() {
    const el = document.getElementById('sb-autosave-status');
    if (!el) return;
    el.textContent = '✓ נשמר';
    el.classList.add('is-visible');
    clearTimeout(_sbAutosaveTimer);
    _sbAutosaveTimer = setTimeout(() => el.classList.remove('is-visible'), 2500);
  }

  function _sbUpdateTabBadge() {
    const total = state.sandbox.portfolio.length;
    const tabBadge = document.querySelector('.sandbox-tab .sandbox-tab-badge');
    if (tabBadge) { tabBadge.textContent = total; tabBadge.style.display = total > 0 ? '' : 'none'; }
    const navBadge = document.getElementById('sandbox-nav-badge');
    if (navBadge) { navBadge.textContent = total; navBadge.hidden = total === 0; }
  }

  function toggleSandboxSelection(data) {
    const idx = state.sandbox.selections.findIndex(s =>
      s.fundId === data.fundId && s.trackId === data.trackId && s.categoryId === data.categoryId
    );
    if (idx !== -1) {
      state.sandbox.selections.splice(idx, 1);
      updateSandboxBar();
      syncFundMembershipIndicators();
      return true;
    }
    if (state.sandbox.selections.length >= 6) return false;
    state.sandbox.selections.push({ ...data });
    updateSandboxBar();
    syncFundMembershipIndicators();
    return true;
  }

  function updateSandboxBar() {
    const bar = document.getElementById('sandbox-bar');
    if (!bar) return;
    const sels = state.sandbox.selections;
    if (sels.length === 0) {
      bar.classList.remove('is-visible');
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    bar.hidden = false;
    bar.classList.add('is-visible');
    const chipsHtml = sels.map(s => `
      <span class="sandbox-bar-chip">
        <span class="sandbox-bar-chip-dot" style="background:${s.color}"></span>
        <span class="sandbox-bar-chip-text">
          <span class="sandbox-bar-chip-provider" style="color:${s.color}">${s.provider}</span>
          <span class="sandbox-bar-chip-sep"> · </span>
          <span class="sandbox-bar-chip-track">${s.trackLabel}</span>
          <span class="sandbox-bar-chip-sep"> · </span>
          <span class="sandbox-bar-chip-category">${_sbGetCategoryLabel(s.categoryId)}</span>
        </span>
        <button type="button" class="sandbox-bar-chip-remove"
          data-remove-fundid="${s.fundId}" data-remove-trackid="${s.trackId}" data-remove-catid="${s.categoryId}"
          aria-label="הסר ${s.provider}">×</button>
      </span>`).join('');
    bar.innerHTML = `
      <span class="sandbox-bar-title">נבחרו ${sels.length}/6:</span>
      <div class="sandbox-bar-chips">${chipsHtml}</div>
      <div class="sandbox-bar-actions">
        <button type="button" class="sandbox-bar-go" id="sandbox-go-btn">
          <i class="fas fa-flask" aria-hidden="true"></i> מעבדה
        </button>
        <button type="button" class="sandbox-bar-go sandbox-bar-h2h" id="sandbox-h2h-btn">
          <i class="fas fa-balance-scale" aria-hidden="true"></i> ראש בראש
        </button>
      </div>`;
    bar.querySelector('#sandbox-go-btn').addEventListener('click', goToSandbox);
    bar.querySelector('#sandbox-h2h-btn')?.addEventListener('click', goSelectionsToH2H);
  }

  function setupSandboxBarActions() {
    const bar = document.getElementById('sandbox-bar');
    if (!bar) return;
    bar.addEventListener('click', e => {
      const btn = e.target.closest('.sandbox-bar-chip-remove');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const { removeFundid: fid, removeTrackid: tid, removeCatid: cid } = btn.dataset;
      state.sandbox.selections = state.sandbox.selections.filter(s =>
        !(s.fundId === fid && s.trackId === tid && s.categoryId === cid));
      const cb = document.querySelector(`.sandbox-check[data-fundid="${fid}"][data-trackid="${tid}"][data-categoryid="${cid}"]`);
      if (cb) cb.checked = false;
      updateSandboxBar();
      _sbUpdateTabBadge();
      syncFundMembershipIndicators();
    });
  }

  function setupValueBarRename() {
    const vbar = document.getElementById('sandbox-value-bar');
    if (!vbar) return;
    vbar.addEventListener('click', e => {
      const btn = e.target.closest('.svb-rename-btn');
      if (!btn) return;
      const nameSpan = btn.closest('.svb-portfolio-name');
      if (!nameSpan || nameSpan.querySelector('.svb-rename-input')) return;
      const currentName = state.sandbox.portfolioName || _sbDefaultPortfolioName();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'svb-rename-input';
      input.value = currentName;
      input.maxLength = 40;
      nameSpan.innerHTML = '';
      nameSpan.appendChild(input);
      input.focus();
      input.select();
      const commit = () => {
        const newName = input.value.trim();
        if (newName && newName !== currentName) {
          // Rename the mirrored saved entry (by id) before touching state, then fall
          // back to a name match for portfolios saved before the mirror-id existed.
          const loaded = _sbGetSavedPortfolios();
          const entry = _sbFindMirrorEntry(loaded) || loaded.find(p => p.name === currentName);
          if (entry) {
            entry.name = newName;
            delete entry.autoNamed; // user gave it a real name — no longer a discardable draft
            _sbPutSavedPortfolios(loaded);
            _sbSetAutoSaveId(entry.id);
          }
          state.sandbox.portfolioName = newName;
          localStorage.setItem(SANDBOX_NAME_KEY, newName);
        }
        _sbUpdateValueBar(state.sandbox.portfolio);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.removeEventListener('blur', commit); _sbUpdateValueBar(state.sandbox.portfolio); }
      });
    });
  }

  function _sbDefaultFee(catId) {
    if (catId === 'pension_mekafit' || catId === 'pension_mashlima') return '0.15';
    if (catId === 'polisa_chisachon') return '0.95';
    return '0.70';
  }

  function _sbDefaultFeeDeposit(catId) {
    if (catId === 'pension_mekafit' || catId === 'pension_mashlima') return '1.50';
    return '';
  }

  function goToSandbox() {
    state.sandbox.selections.forEach(sel => {
      if (!isInSandboxPortfolio(sel.fundId, sel.trackId, sel.categoryId)) {
        state.sandbox.portfolio.push({
          ...sel,
          dnCumulative: _sbDefaultFee(sel.categoryId),
          dnDeposit: _sbDefaultFeeDeposit(sel.categoryId),
          investAmount: '',
          investPct: '',
          investMode: 'amount'
        });
      }
    });
    state.sandbox.selections = [];
    _sbMarkPortfolioModified();
    saveSandboxPortfolio();
    updateSandboxBar();
    syncFundMembershipIndicators();
    switchToSandbox();
  }

  async function goSelectionsToH2H() {
    const selections = [...state.sandbox.selections];
    if (!selections.length) return;
    const btn = document.getElementById('sandbox-h2h-btn');
    const originalHtml = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> מוסיף להשוואה';
    }
    try {
      await restoreH2HState();
      const existingKeys = new Set(state.h2h.items.map(item => `${item.catId}::${item.record?.FUND_ID}`));
      let added = 0;
      let skipped = 0;
      for (const sel of selections) {
        const catId = sel.categoryId;
        const fundId = String(sel.fundId || '');
        const trackId = sel.trackId;
        const uniqueKey = `${catId}::${fundId}`;
        if (!catId || !trackId || !fundId || existingKeys.has(uniqueKey)) {
          skipped += 1;
          continue;
        }
        const cached = await h2hFetchCatData(catId);
        const cat = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === catId);
        const trackItem = cached.organized.find(item => item.track.id === trackId);
        const record = trackItem?.records.find(record => String(record.FUND_ID) === fundId);
        if (!record) {
          skipped += 1;
          continue;
        }
        existingKeys.add(uniqueKey);
        state.h2h.items.push({
          catId,
          catLabel: cat?.label || sel.categoryLabel || '',
          trackId,
          trackLabel: trackItem.track.label || sel.trackLabel || '',
          record,
          provName: getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION),
          yields12M: cached.yields12M || null,
          sharpeMap: cached.sharpeMap || null,
          consistencyMap: cached.consistencyMap || null,
          stdDevMap: cached.stdDevMap || null,
          momentumMap: cached.momentumMap || null,
          actuarialByProvider: cached.actuarialByProvider || null,
        });
        added += 1;
      }
      invalidateH2HYearData();
      persistH2HState();
      state.sandbox.selections = [];
      document.querySelectorAll('.sandbox-check:checked:not(.is-in-portfolio)').forEach(cb => { cb.checked = false; });
      updateSandboxBar();
      syncFundMembershipIndicators();
      if (added || skipped) {
        showToast(added ? `נוספו ${added} קופות להשוואה ראש בראש${skipped ? ` (${skipped} כבר היו קיימות)` : ''}` : 'הקופות שסימנת כבר קיימות בראש בראש');
      }
      switchToH2H();
    } catch (error) {
      console.warn('Could not add selections to H2H', error);
      showToast('לא הצלחתי להוסיף את הקופות להשוואה. נסה שוב.');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml || '<i class="fas fa-balance-scale" aria-hidden="true"></i> להשוואה ראש בראש';
      }
    }
  }

  function switchToSandbox() {
    // Auto-merge any pending selections into portfolio
    if (state.sandbox.selections.length > 0) {
      state.sandbox.selections.forEach(sel => {
        if (!isInSandboxPortfolio(sel.fundId, sel.trackId, sel.categoryId)) {
          state.sandbox.portfolio.push({
            ...sel,
            dnCumulative: _sbDefaultFee(sel.categoryId),
            dnDeposit: _sbDefaultFeeDeposit(sel.categoryId),
            investAmount: '',
            investPct: '',
            investMode: 'amount'
          });
        }
      });
      state.sandbox.selections = [];
      saveSandboxPortfolio();
      updateSandboxBar();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateHeroContent('sandbox');
    state.isHomePage = false;
    state.activeCategoryId = 'sandbox';
    updateAppPageUrl('sandbox');
    setActiveTab('sandbox');
    updateFilterBadge();
    showSection('sandbox');
    // update sticky header title manually (sandbox is not in PRODUCT_CATEGORIES)
    const pageTitle = document.getElementById('page-main-title');
    if (pageTitle) pageTitle.textContent = 'המעבדה שלי';
    renderSandboxPage();
    _sbHydrateFromApi(); // refresh y1/y3/y5 from current API data (async, re-renders when done)
  }

  // ── weighted helpers ──
  function _sbWeights(items) {
    const hasPct = items.some(it => it.investMode === 'percent' && it.investPct !== '');
    const hasAmt = items.some(it => it.investMode === 'amount' && it.investAmount !== '');
    if (hasPct) {
      const vals = items.map(it => it.investMode === 'percent' ? (parseFloat(it.investPct) || 0) : 0);
      const sum = vals.reduce((a, b) => a + b, 0);
      return sum > 0 ? vals.map(v => v / sum) : items.map(() => 1 / items.length);
    }
    if (hasAmt) {
      const vals = items.map(it => it.investMode === 'amount' ? (parseFloat(it.investAmount) || 0) : 0);
      const sum = vals.reduce((a, b) => a + b, 0);
      return sum > 0 ? vals.map(v => v / sum) : items.map(() => 1 / items.length);
    }
    return items.map(() => 1 / items.length);
  }

  function _sbWeightedVal(items, weights, getter) {
    let wSum = 0, wTotal = 0;
    items.forEach((it, i) => {
      const v = parseFloat(getter(it));
      if (!isNaN(v) && String(getter(it)) !== '') { wSum += v * weights[i]; wTotal += weights[i]; }
    });
    return wTotal > 0 ? wSum / wTotal : null;
  }

  function _sbFmtPct(val, decimals = 2) {
    const n = parseFloat(val);
    return (val === '' || val == null || isNaN(n)) ? '—' : `\u200E${n.toFixed(decimals)}%`;
  }

  const SB_RETURN_FIELDS = [
    { id: 'monthly', label: 'חודשי', itemKey: 'y1' },
    { id: 'ytd', label: 'השנה', itemKey: 'y3' },
    { id: '12m', label: '12 חוד׳', itemKey: 'y12m' },
    { id: '3y', label: '3 שנים', itemKey: 'y5' },
    { id: '5y', label: '5 שנים', itemKey: 'y5yr' }
  ];
  const SB_DEFAULT_RETURN_FIELDS = ['monthly', 'ytd', '12m', '3y'];
  const SB_MAX_RETURN_FIELDS = 4;

  function _sbNormalizeReturnFields(fields) {
    const valid = new Set(SB_RETURN_FIELDS.map(field => field.id));
    if (!Array.isArray(fields)) return [...SB_DEFAULT_RETURN_FIELDS];
    const unique = fields
      .filter(id => valid.has(id))
      .filter((id, index, arr) => arr.indexOf(id) === index);
    return SB_RETURN_FIELDS
      .map(field => field.id)
      .filter(id => unique.includes(id))
      .slice(0, SB_MAX_RETURN_FIELDS);
  }

  function _sbSelectedReturnFields() {
    return SB_RETURN_FIELDS;
  }

  function _sbLoadReturnFields() {
    try {
      const saved = JSON.parse(localStorage.getItem(SANDBOX_RETURNS_FIELDS_KEY) || 'null');
      state.sandbox.selectedReturnFields = _sbNormalizeReturnFields(saved);
    } catch(e) {
      state.sandbox.selectedReturnFields = [...SB_DEFAULT_RETURN_FIELDS];
    }
  }

  function _sbSaveReturnFields() {
    try {
      localStorage.setItem(SANDBOX_RETURNS_FIELDS_KEY, JSON.stringify(_sbNormalizeReturnFields(state.sandbox.selectedReturnFields)));
    } catch(e) {}
  }

  function _sbReturnFieldLabel(field, monthlyLabel = '') {
    return field.id === 'monthly' ? (monthlyLabel || field.label) : field.label;
  }

  function _sbReturnFieldValue(item, field) {
    return item?.[field.itemKey];
  }

  function _sbReturnCell(item, field) {
    const value = _sbReturnFieldValue(item, field);
    return `<td class="sb-td-return sb-td-${field.id} sb-yield-col" data-return-field="${field.id}" style="color:${_sbYieldColor(value)};font-weight:700;font-size:.9rem">${_sbFmtPct(value)}</td>`;
  }

  function _sbReturnFieldMenuHtml() {
    const selected = new Set(state.sandbox.selectedReturnFields);
    return `<div class="sandbox-return-fields-wrap">
      <button type="button" class="sandbox-fields-btn" id="sandbox-return-fields-btn" aria-expanded="${state.sandbox.returnsMenuOpen ? 'true' : 'false'}">
        <i class="fas fa-table-columns" aria-hidden="true"></i> <span class="sb-btn-label">הוסף שדות</span>
      </button>
      ${state.sandbox.returnsMenuOpen ? `<div class="sandbox-fields-panel" id="sandbox-return-fields-panel">
        ${SB_RETURN_FIELDS.map(field => {
          const checked = selected.has(field.id);
          const disabled = !checked && selected.size >= SB_MAX_RETURN_FIELDS;
          return `<label class="sandbox-field-option ${disabled ? 'is-disabled' : ''}">
            <input type="checkbox" data-sandbox-return-field="${field.id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <span>${field.label}</span>
          </label>`;
        }).join('')}
      </div>` : ''}
    </div>`;
  }

  function _sbYieldColor(val) {
    const n = parseFloat(val);
    if (isNaN(n) || val === '' || val == null) return 'var(--gray-400)';
    return n >= 0 ? '#16a34a' : '#dc2626';
  }

  function renderSandboxPage() {
    const section = document.getElementById('sandbox-section');
    if (!section) return;
    const portfolio = state.sandbox.portfolio;

    let html = `<div class="sandbox-page-header">
      <div class="sandbox-page-title">
        <span class="sandbox-page-title-text">🧪 המעבדה שלי</span><span id="sb-autosave-status" class="sb-autosave-status" aria-live="polite"></span>
        <img src="assets/gemelhub-logo-light.svg?v=sandbox-title-20260705" alt="GemelHub" class="sandbox-title-logo" />
      </div>
      <div class="sandbox-page-actions">
        <button type="button" class="sandbox-add-btn" id="sandbox-add-more-btn">
          <i class="fas fa-plus" aria-hidden="true"></i> <span class="sb-btn-label">הוסף</span>
        </button>
        ${portfolio.length > 0 && (!state.sandbox.portfolioName || state.sandbox.isDirty)
          ? `<button type="button" class="sandbox-save-btn sb-save-appear${state.sandbox.isDirty ? ' sb-save-pulse' : ''}" id="sandbox-save-portfolio-btn" title="שמור תיק"><i class="fas fa-floppy-disk" aria-hidden="true"></i> <span class="sb-btn-label">${state.sandbox.portfolioName ? 'שמור/עדכן' : 'שמור בשם'}</span></button>`
          : '<button type="button" class="sandbox-save-btn sb-save-hidden" id="sandbox-save-portfolio-btn" title="שמור תיק" aria-hidden="true"></button>'}
        <button type="button" class="sandbox-load-btn" id="sandbox-load-portfolio-btn" title="טען תיק שמור">
          <i class="fas fa-folder-open" aria-hidden="true"></i> <span class="sb-btn-label">פתח/השווה</span>
        </button>
        ${portfolio.length > 0 ? `<button type="button" class="sandbox-print-btn" id="sandbox-print-btn" title="הדפס תיק">
          <i class="fas fa-print" aria-hidden="true"></i>
        </button>
        <button type="button" class="sandbox-share-btn sb-share-pulse" id="sandbox-share-btn" title="שתף את התיק עם מישהו">
          <i class="fab fa-whatsapp" aria-hidden="true"></i> <span class="sb-btn-label">שתף תיק</span>
        </button>
        <button type="button" class="sandbox-clear-btn" id="sandbox-clear-portfolio-btn">
          <i class="fas fa-trash-alt" aria-hidden="true"></i></button>` : ''}
      </div>
    </div>`;

    if (portfolio.length === 0) {
      _sbHideValueBar();
      html += `<div class="sandbox-empty">
        <div class="sandbox-empty-icon">🧪</div>
        <div class="sandbox-empty-text">התיק שלך ריק</div>
        <div class="sandbox-empty-sub">סמן מסלולי השקעה מהקטגוריות השונות — הם יופיעו כאן לניתוח מעמיק</div>
      </div>`;
    } else {
      // group by category
      const grouped = {};
      portfolio.forEach(item => {
        if (!grouped[item.categoryId]) grouped[item.categoryId] = [];
        grouped[item.categoryId].push(item);
      });
      const catOrder = CONFIG.PRODUCT_CATEGORIES.map(c => c.id);
      const sortedKeys = Object.keys(grouped).sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b));

      for (const catId of sortedKeys) {
        const items = grouped[catId];
        const catDef = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId) || { label: catId, color: '#0f172a', icon: '📊' };
        const isPension = catId.startsWith('pension_');
        const weights = _sbWeights(items);
        const wY1  = _sbWeightedVal(items, weights, it => it.y1);
        const wY3  = _sbWeightedVal(items, weights, it => it.y3);
        const wY5  = _sbWeightedVal(items, weights, it => it.y5);
        const wStock  = _sbWeightedVal(items, weights, it => it.stock);
        const wAbroad = _sbWeightedVal(items, weights, it => it.abroad);
        const wFx     = _sbWeightedVal(items, weights, it => it.fx);
        const wDn  = _sbWeightedVal(items, weights, it => it.dnCumulative);
        const catAmtTotal = items.filter(it => it.investMode === 'amount' && it.investAmount !== '')
          .reduce((s, it) => s + (parseFloat(String(it.investAmount).replace(/,/g, '')) || 0), 0);
        const catPctTotal = items.filter(it => it.investMode === 'percent' && it.investPct !== '')
          .reduce((s, it) => s + (parseFloat(it.investPct) || 0), 0);
        const catAmtHas = items.some(it => it.investMode === 'amount' && it.investAmount !== '');
        const catPctHas = items.some(it => it.investMode === 'percent' && it.investPct !== '');
        const catInvestDisplay = catAmtHas ? formatCurrencyILS(catAmtTotal) : catPctHas ? `\u200E${catPctTotal.toFixed(0)}%` : '';
        const catInvestMode = items.every(it => it.investMode === 'percent') ? 'percent' : 'amount';

        const latestPeriod = items.reduce((mx, it) => (it.reportPeriod || '') > mx ? (it.reportPeriod || '') : mx, '');
        const monthlyLabel = (typeof formatReportPeriod === 'function' && latestPeriod) ? formatReportPeriod(latestPeriod) : 'חודשי';
        const returnFields = _sbSelectedReturnFields();
        const returnCols = returnFields.map(field => `<col class="sb-col-yield sb-col-yield-${field.id}">`).join('');
        const returnHeaders = returnFields.map(field => `<th class="sb-yield-col">${_sbReturnFieldLabel(field, monthlyLabel)}</th>`).join('');
        const catProviderColors = new Map();

        const tableRows = items.map(item => {
          const gi = portfolio.indexOf(item);
          const itemKey = _sbEscapeAttr(_sbItemKey(item));
          const providerName = String(item.provider || '').trim();
          if (!catProviderColors.has(providerName)) catProviderColors.set(providerName, providerColor(providerName));
          const itemProviderColor = catProviderColors.get(providerName) || item.color;
          const rawInvestVal = item.investMode === 'percent' ? item.investPct : item.investAmount;
          const displayInvest = rawInvestVal !== '' ? Number(String(rawInvestVal).replace(/,/g, '')).toLocaleString('he-IL') : '';
          const allocationProfile = ghAllocationProfileFor({ stock: item.stock, abroad: item.abroad, fx: item.fx });
          const allocationIcon = item.fundIdTagIcons || ghAllocationProfileIcons(allocationProfile, item.trackLabel || '');
          const fundUrl = `fund.html?id=${encodeURIComponent(item.fundId || '')}&cat=${encodeURIComponent(item.categoryId || '')}`;
          const returnCells = returnFields.map(field => _sbReturnCell(item, field)).join('');
          const isHidden = !!item.hidden;
          return `<tr data-portfolio-idx="${gi}" data-sandbox-key="${itemKey}"${isHidden ? ' class="sb-row-hidden"' : ''}>
            <td><button type="button" class="sandbox-remove-btn" data-portfolio-idx="${gi}" data-sandbox-key="${itemKey}" aria-label="הסר מסלול">
              <i class="fas fa-times" aria-hidden="true"></i></button></td>
            <td><div class="sandbox-provider-cell">
              <button type="button" class="sandbox-hide-btn${isHidden ? ' is-hidden' : ''}" data-portfolio-idx="${gi}" data-sandbox-key="${itemKey}" aria-label="${isHidden ? 'הצג מסלול' : 'הסתר מסלול מהתיק'}" title="${isHidden ? 'הצג מסלול' : 'הסתר מסלול מהתיק (לצורך סימולציה)'}">
                <i class="fas ${isHidden ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>
              </button>
              <a class="sandbox-provider-link" href="${fundUrl}" style="color:${itemProviderColor};">${item.provider}</a>
            </div></td>
            <td>
              <div class="sandbox-track-cell">
                <button type="button" class="sandbox-track-link" data-sandbox-track-cat="${item.categoryId}" data-sandbox-track-id="${item.trackId}">${item.trackLabel}</button>
                <div class="sandbox-track-id"><span class="sandbox-track-number">#${item.fundId || ''}</span><span class="sandbox-track-id-icons">${allocationIcon}</span></div>
              </div>
            </td>
            <td><input type="number" step="0.01" min="0" max="5" class="sandbox-fee-input"
              data-portfolio-idx="${gi}" data-sandbox-key="${itemKey}" data-field="dnCumulative"
              value="${item.dnCumulative}" placeholder="0.75" title="% דמי ניהול מצבירה" /></td>
            ${isPension ? `<td><input type="number" step="0.01" min="0" max="5" class="sandbox-fee-input"
              data-portfolio-idx="${gi}" data-sandbox-key="${itemKey}" data-field="dnDeposit"
              value="${item.dnDeposit}" placeholder="0.25" title="% דמי ניהול מהפקדה" /></td>` : ''}
            <td class="sb-invest-col">
              <div class="sandbox-invest-control">
                <input type="text" inputmode="numeric" class="sandbox-invest-input"
                  data-portfolio-idx="${gi}" data-sandbox-key="${itemKey}" data-field="invest"
                  value="${displayInvest}"
                  placeholder="${item.investMode==='percent'?'הכנס אחוז':'הכנס סכום'}" />
              </div>
            </td>
            ${returnCells}
            <td class="sb-td-stock sb-allocation-start">${expCell(item.stock !== '' ? _sbFmtPct(item.stock, 0) : '-', 'stock')}</td>
            <td class="sb-td-abroad">${expCell(item.abroad !== '' ? _sbFmtPct(item.abroad, 0) : '-', 'abroad')}</td>
            <td class="sb-td-fx">${expCell(item.fx !== '' ? _sbFmtPct(item.fx, 0) : '-', 'fx')}</td>
          </tr>`;
        }).join('');

        html += `<div class="sandbox-cat-block" data-sandbox-cat-id="${catId}">
          <div class="sandbox-cat-block-head">
            <div class="sandbox-cat-block-title">
              <span>${catDef.icon} ${catDef.label}</span>
            </div>
            <button type="button" class="sandbox-cat-add-btn" data-sandbox-add-cat="${catId}">
              <i class="fas fa-plus" aria-hidden="true"></i> הוסף מסלולים
            </button>
          </div>
          <div class="sandbox-cat-table-wrap">
            <table class="sandbox-cat-table${isPension ? ' is-pension-table' : ''}">
              <colgroup>
                <col class="sb-col-remove">
                <col class="sb-col-provider">
                <col class="sb-col-track">
                <col class="sb-col-fee">
                ${isPension ? '<col class="sb-col-fee">' : ''}
                <col class="sb-col-invest">
                ${returnCols}
                <col class="sb-col-exp">
                <col class="sb-col-exp">
                <col class="sb-col-exp">
              </colgroup>
              <thead><tr>
                <th></th><th>מנהל</th><th>מסלול</th>
                <th class="sb-fee-head"><span>דמי ניהול</span><span>מצבירה %</span></th>
                ${isPension ? '<th class="sb-fee-head"><span>דמי ניהול</span><span>מהפקדה %</span></th>' : ''}
                <th class="sb-invest-head">
                  <span>השקעה</span>
                  <span class="sandbox-invest-toggle sandbox-cat-mode-toggle" aria-label="בחירת אופן הזנת השקעה לקטגוריה">
                    <button type="button" class="${catInvestMode === 'percent' ? 'active' : ''}" data-sandbox-cat-mode="${catId}" data-mode="percent" title="כדי לחשב חשיפות לפי אחוזים, סכום האחוזים בכל מסלולי הקטגוריה חייב להסתכם ל-100%">%</button>
                    <button type="button" class="${catInvestMode === 'amount' ? 'active' : ''}" data-sandbox-cat-mode="${catId}" data-mode="amount">₪</button>
                  </span>
                </th>
                ${returnHeaders}
                <th class="sb-allocation-start">% מניות</th><th>% חו"ל</th><th>% מט"ח</th>
              </tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>`;
      }

      // Dashboard — exclude routes hidden by the user for the "what if" simulation
      html += _sbDashboardHtml(portfolio.filter(it => !it.hidden));
    }

    // Rescue value bar before innerHTML wipe (it may have been moved inside section)
    const _barBeforeRender = document.getElementById('sandbox-value-bar');
    if (_barBeforeRender && _barBeforeRender.closest('#sandbox-section')) {
      document.body.appendChild(_barBeforeRender);
    }

    section.innerHTML = html;
    _sbAttachEvents(section);

    // Anchor value bar inside the sandbox header, directly below the action buttons.
    const _sbPageHeader = section.querySelector('.sandbox-page-header');
    const _sbValueBar = document.getElementById('sandbox-value-bar');
    if (_sbPageHeader && _sbValueBar) {
      _sbPageHeader.appendChild(_sbValueBar);
    }
  }

  function _sbDonut(title, segments, centerText) {
    const R = 50, r = 30, cx = 60, cy = 60;
    let angle = -Math.PI / 2;
    const paths = segments.map((s, i) => {
      if (s.pct <= 0) return '';
      const sweep = Math.min(s.pct / 100, 0.9999) * 2 * Math.PI;
      const end = angle + sweep;
      const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
      const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end);
      const xi1 = cx + r * Math.cos(angle), yi1 = cy + r * Math.sin(angle);
      const xi2 = cx + r * Math.cos(end),   yi2 = cy + r * Math.sin(end);
      const lg = sweep > Math.PI ? 1 : 0;
      const d = `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${lg},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${xi2.toFixed(2)},${yi2.toFixed(2)} A${r},${r} 0 ${lg},0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z`;
      angle = end;
      const safeLabel = s.label.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
      return `<path class="sb-seg" d="${d}" fill="${s.color}" data-pct="${s.pct.toFixed(1)}" data-label="${safeLabel}" />`;
    }).join('');
    const legend = segments.map(s => `
      <div class="sb-legend-row">
        <span class="sb-legend-dot" style="background:${s.color}"></span>
        <span class="sb-legend-name">${s.label}</span>
        <span class="sb-legend-val">${s.pct.toFixed(0)}%</span>
      </div>`).join('');
    const safeCenter = String(centerText).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
    return `<div class="sb-chart-card">
      <div class="sb-chart-title">${title}</div>
      <svg viewBox="0 0 120 120" class="sb-donut-svg" data-center="${safeCenter}">
        <g class="sb-segs">${paths}</g>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="white" />
        <text class="sb-center-text" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${safeCenter}</text>
      </svg>
      <div class="sb-donut-legend">${legend}</div>
    </div>`;
  }

  function _sbBarChart(title, groups) {
    const allVals = groups.flatMap(g => g.bars.map(b => b.value)).filter(v => v != null && !isNaN(v));
    const maxAbs = allVals.length ? Math.max(0.01, ...allVals.map(Math.abs)) : 1;
    const groupsHtml = groups.map(g => {
      const barsHtml = g.bars.map(b => {
        if (b.value == null || isNaN(b.value)) return `<div class="sb-vbar-item"><div class="sb-vbar-empty"></div><div class="sb-vbar-period">${b.period}</div></div>`;
        const h = Math.min(90, Math.abs(b.value) / maxAbs * 80);
        const isPos = b.value >= 0;
        return `<div class="sb-vbar-item">
          <div class="sb-vbar-label" style="color:${isPos ? '#16a34a' : '#dc2626'}">${b.value.toFixed(1)}%</div>
          <div class="sb-vbar-track">
            <div class="sb-vbar-fill" style="height:${h}%;background:${isPos ? g.color : '#f87171'}"></div>
          </div>
          <div class="sb-vbar-period">${b.period}</div>
        </div>`;
      }).join('');
      return `<div class="sb-vbar-group">
        <div class="sb-vbar-group-name" style="color:${g.color}">${g.label}</div>
        <div class="sb-vbar-group-bars">${barsHtml}</div>
      </div>`;
    }).join('');
    return `<div class="sb-chart-card sb-chart-card-wide">
      <div class="sb-chart-title">${title}</div>
      <div class="sb-bar-chart-inner">${groupsHtml}</div>
    </div>`;
  }

  async function _sbHydrateFromApi() {
    const portfolio = state.sandbox.portfolio;
    if (portfolio.length === 0) return;
    const catIds = [...new Set(portfolio.map(it => it.categoryId))];
    let anyUpdated = false;
    for (const catId of catIds) {
      try {
        const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId);
        const isPension = !!(cat && cat.pensionAPI);
        const isPolisa  = !!(cat && cat.polisaAPI);
        const [organized, yields12M] = await Promise.all([
          APIModule.getOrganizedData({ categoryId: catId, targetPopulation: 'כלל האוכלוסיה', selectedProviders: new Set() }),
          isPension ? APIModule.get12MYieldsPension() : isPolisa ? APIModule.get12MYieldsPolisa() : APIModule.get12MYields()
        ]);
        const allRecords = organized.flatMap(t => t.records || []);
        portfolio.forEach(item => {
          if (item.categoryId !== catId) return;
          const rec = allRecords.find(r => String(r.FUND_ID) === String(item.fundId));
          if (!rec) return;
          item.y1   = rec.MONTHLY_YIELD        != null ? String(rec.MONTHLY_YIELD)        : '';
          item.y3   = rec.YEAR_TO_DATE_YIELD   != null ? String(rec.YEAR_TO_DATE_YIELD)   : '';
          item.y5   = rec.YIELD_TRAILING_3_YRS != null ? String(rec.YIELD_TRAILING_3_YRS) : '';
          item.y5yr = rec.YIELD_TRAILING_5_YRS != null ? String(rec.YIELD_TRAILING_5_YRS) : '';
          const y12mVal = yields12M ? yields12M.get(String(rec.FUND_ID)) : undefined;
          item.y12m = (y12mVal != null) ? String(y12mVal) : '';
          item.stock  = calcExposurePercentValue(rec.STOCK_MARKET_EXPOSURE, rec.TOTAL_ASSETS)?.toFixed(2) ?? '';
          item.abroad = calcExposurePercentValue(rec.FOREIGN_EXPOSURE, rec.TOTAL_ASSETS)?.toFixed(2) ?? '';
          item.fx     = calcExposurePercentValue(rec.FOREIGN_CURRENCY_EXPOSURE, rec.TOTAL_ASSETS)?.toFixed(2) ?? '';
          item.reportPeriod = rec.REPORT_PERIOD ? String(rec.REPORT_PERIOD) : '';
          anyUpdated = true;
        });
      } catch(e) { /* network/API error — keep stored values */ }
    }
    if (anyUpdated && state.activeCategoryId === 'sandbox') {
      saveSandboxPortfolio();
      // Surgically update yield cells so we never destroy in-progress input values
      const sbSec = document.getElementById('sandbox-section');
      if (sbSec) {
        state.sandbox.portfolio.forEach((item, gi) => {
          const row = sbSec.querySelector(`tr[data-portfolio-idx="${gi}"]`);
          if (!row) return;
          const stTd = row.querySelector('.sb-td-stock');
          const abTd = row.querySelector('.sb-td-abroad');
          const fxTd = row.querySelector('.sb-td-fx');
          _sbSelectedReturnFields().forEach(field => {
            const cell = row.querySelector(`[data-return-field="${field.id}"]`);
            const value = _sbReturnFieldValue(item, field);
            if (cell) {
              cell.style.color = _sbYieldColor(value);
              cell.textContent = _sbFmtPct(value);
            }
          });
          if (stTd) stTd.innerHTML = expCell(item.stock !== '' ? _sbFmtPct(item.stock, 0) : '-', 'stock');
          if (abTd) abTd.innerHTML = expCell(item.abroad !== '' ? _sbFmtPct(item.abroad, 0) : '-', 'abroad');
          if (fxTd) fxTd.innerHTML = expCell(item.fx !== '' ? _sbFmtPct(item.fx, 0) : '-', 'fx');
        });
        _sbRefreshWeightedRows(sbSec);
      }
    }
  }

  function _sbUpdateValueBar(portfolio, totalValue, catMap) {
    const bar = document.getElementById('sandbox-value-bar');
    if (!bar) return;
    const setValueBarSpace = (visible = bar.classList.contains('is-visible')) => {
      const reserve = visible ? Math.max(0, Math.ceil(bar.offsetHeight - 9)) : 0;
      document.documentElement.style.setProperty('--sandbox-mobile-value-bar-space', `${reserve}px`);
      const actions = document.querySelector('.sandbox-page-actions');
      if (actions && visible) {
        const top = Math.ceil(actions.getBoundingClientRect().bottom + 24);
        document.documentElement.style.setProperty('--sandbox-mobile-value-bar-top', `${top}px`);
      }
    };
    if (!portfolio || portfolio.length === 0) {
      bar.classList.remove('is-visible', 'is-position-ready');
      setValueBarSpace();
      return;
    }
    // Hidden routes never count toward the displayed totals, regardless of which
    // caller passed the portfolio in (some callers pass it unfiltered).
    portfolio = portfolio.filter(it => !it.hidden);
    const grouped = {};
    portfolio.forEach(item => {
      if (!grouped[item.categoryId]) grouped[item.categoryId] = [];
      grouped[item.categoryId].push(item);
    });
    const catOrder = CONFIG.PRODUCT_CATEGORIES.map(c => c.id);
    const catRows = Object.keys(grouped)
      .sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b))
      .map(catId => {
        const items = grouped[catId];
        const meta = _sbGetCategoryMeta(catId);
        const amountTotal = items
          .filter(it => it.investMode === 'amount' && it.investAmount !== '')
          .reduce((sum, it) => sum + (parseFloat(String(it.investAmount).replace(/,/g, '')) || 0), 0);
        const pctTotal = items
          .filter(it => it.investMode === 'percent' && it.investPct !== '')
          .reduce((sum, it) => sum + (parseFloat(String(it.investPct).replace(/,/g, '')) || 0), 0);
        const amountText = amountTotal > 0 ? `${Math.round(amountTotal).toLocaleString('he-IL')} ש"ח` : '';
        const pctText = pctTotal > 0 ? `${pctTotal.toFixed(pctTotal % 1 ? 1 : 0)}%` : '';
        const valueText = amountText && pctText ? `${amountText} · ${pctText}` : (amountText || pctText || 'ללא סכום');
        const managerCount = new Set(items.map(it => String(it.provider || '').trim()).filter(Boolean)).size;
        const countLabel = managerCount === 1 ? 'מנהל השקעות 1' : `${managerCount} מנהלי השקעות`;
        return `<span class="svb-category-row">
          <span class="svb-cat-name">${meta.label}</span>
          <span class="svb-cat-value">${valueText}</span>
          <span class="svb-meta">(${countLabel})</span>
        </span>`;
      });
    const allInvestedAsAmount = portfolio.length > 0 && portfolio.every(item => item.investMode === 'amount');
    const totalAmount = allInvestedAsAmount
      ? portfolio.reduce((sum, item) => sum + (parseFloat(String(item.investAmount).replace(/,/g, '')) || 0), 0)
      : 0;
    // Always show a name — the real saved name, or a "תיק השקעות <date>" placeholder — so
    // there's always something to rename, even for a brand-new/unsaved/empty-of-amounts portfolio.
    const displayName = escapeHtml(state.sandbox.portfolioName || _sbDefaultPortfolioName());
    const portfolioNameLabel = `<span class="svb-portfolio-name">${displayName}<button type="button" class="svb-rename-btn" title="שנה שם תיק"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg></button></span>`;
    const totalLine = allInvestedAsAmount && totalAmount > 0
      ? `<span class="svb-total-row">${portfolioNameLabel}<span class="svb-total-label">שווי התיק שלי</span><span class="svb-total-amount">${Math.round(totalAmount).toLocaleString('he-IL')} ש"ח</span></span>`
      : `<span class="svb-total-row">${portfolioNameLabel}</span>`;
    bar.innerHTML = catRows.length
      ? `<span class="svb-category-list">${totalLine}${catRows.join('')}</span>`
      : `<span class="svb-label">המעבדה שלי</span><span class="svb-meta">${portfolio.length} מסלולים · ${Object.keys(catMap || {}).length} קטגוריות</span>`;
    // set initial centered position if not yet positioned
    if (!bar.style.left) {
      bar.style.left   = (window.innerWidth / 2 - 120) + 'px';
      bar.style.bottom = '28px';
    }
    bar.classList.remove('is-position-ready');
    setValueBarSpace(true);
    bar.classList.add('is-visible', 'is-position-ready');
  }

  function _sbHideValueBar() {
    const bar = document.getElementById('sandbox-value-bar');
    if (bar) {
      bar.classList.remove('is-visible', 'is-position-ready');
      document.documentElement.style.setProperty('--sandbox-mobile-value-bar-space', '0px');
      document.documentElement.style.removeProperty('--sandbox-mobile-value-bar-top');
      // No need to restore to body — CSS handles mobile fixed positioning
    }
  }

  function _sbBuildPrintValueSummaryHtml(portfolio) {
    portfolio = Array.isArray(portfolio) ? portfolio.filter(it => !it.hidden) : [];
    if (!portfolio.length) return '';
    const grouped = {};
    portfolio.forEach(item => {
      if (!grouped[item.categoryId]) grouped[item.categoryId] = [];
      grouped[item.categoryId].push(item);
    });
    const catOrder = CONFIG.PRODUCT_CATEGORIES.map(c => c.id);
    const catRows = Object.keys(grouped)
      .sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b))
      .map(catId => {
        const items = grouped[catId];
        const meta = _sbGetCategoryMeta(catId);
        const amountTotal = items
          .filter(it => it.investMode === 'amount' && it.investAmount !== '')
          .reduce((sum, it) => sum + (parseFloat(String(it.investAmount).replace(/,/g, '')) || 0), 0);
        const pctTotal = items
          .filter(it => it.investMode === 'percent' && it.investPct !== '')
          .reduce((sum, it) => sum + (parseFloat(String(it.investPct).replace(/,/g, '')) || 0), 0);
        const amountText = amountTotal > 0 ? `${Math.round(amountTotal).toLocaleString('he-IL')} ש"ח` : '';
        const pctText = pctTotal > 0 ? `${pctTotal.toFixed(pctTotal % 1 ? 1 : 0)}%` : '';
        const valueText = amountText && pctText ? `${amountText} · ${pctText}` : (amountText || pctText || 'ללא סכום');
        const managerCount = new Set(items.map(it => String(it.provider || '').trim()).filter(Boolean)).size;
        const managerText = managerCount > 0
          ? `<span class="sb-print-value-managers">(${managerCount === 1 ? 'מנהל השקעות 1' : `${managerCount} מנהלי השקעות`})</span>`
          : '';
        return `<div class="sb-print-value-row">
          <span class="sb-print-value-cat">${escapeHtml(meta.label)}</span>
          <strong>${escapeHtml(valueText)}</strong>
          ${managerText}
        </div>`;
      });
    if (!catRows.length) return '';
    const allInvestedAsAmount = portfolio.every(item => item.investMode === 'amount');
    const totalAmount = allInvestedAsAmount
      ? portfolio.reduce((sum, item) => sum + (parseFloat(String(item.investAmount).replace(/,/g, '')) || 0), 0)
      : 0;
    const totalAmountHtml = totalAmount > 0
      ? `<strong>${Math.round(totalAmount).toLocaleString('he-IL')} ש"ח</strong>`
      : '';
    return `
      <div class="sb-print-value-total">
        <span>שווי התיק שלי</span>
        ${totalAmountHtml}
      </div>
      <div class="sb-print-value-divider" aria-hidden="true"></div>
      <div class="sb-print-value-rows">${catRows.join('')}</div>
    `;
  }

  // ── Sandbox: Named Portfolio Save / Load ──────────────────────────────────
  const SB_PORTFOLIOS_KEY = 'gemelhub_saved_portfolios_v1';

  function _sbGetSavedPortfolios() {
    try { return JSON.parse(localStorage.getItem(SB_PORTFOLIOS_KEY) || '[]'); } catch { return []; }
  }

  function _sbPutSavedPortfolios(list) {
    localStorage.setItem(SB_PORTFOLIOS_KEY, JSON.stringify(list));
  }

  function _sbFormatSavedDate(dateStr) {
    if (!dateStr) return '';
    try { const [y, m, d] = dateStr.split('-'); return `${d}.${m}.${y}`; } catch { return dateStr; }
  }

  // Next free serial: scans saved names (and the current name) for "תיק השקעות N"
  function _sbDefaultPortfolioName() {
    let max = 0;
    const scan = (name) => {
      const m = /^תיק השקעות (\d+)$/.exec(String(name || '').trim());
      if (m) max = Math.max(max, parseInt(m[1], 10));
    };
    _sbGetSavedPortfolios().forEach(p => scan(p.name));
    scan(state.sandbox.portfolioName);
    return `תיק השקעות ${max + 1}`;
  }

  function _sbSetDirty(val) {
    state.sandbox.isDirty = val;
    if (val) localStorage.setItem(SANDBOX_DIRTY_KEY, '1');
    else localStorage.removeItem(SANDBOX_DIRTY_KEY);
  }

  // Immediately hide/quiet the save button after an explicit save/update, without
  // waiting for the next full renderSandboxPage() re-render.
  function _sbResetSaveButtonUI() {
    const btn = document.getElementById('sandbox-save-portfolio-btn');
    if (!btn) return;
    btn.classList.add('sb-save-hidden');
    btn.setAttribute('aria-hidden', 'true');
    btn.classList.remove('sb-save-pulse', 'sb-save-appear');
  }

  // Hidden routes don't count toward a saved portfolio's displayed value or count suffix
  function _sbHiddenCountSuffix(portfolio) {
    const hidden = portfolio.filter(it => it.hidden).length;
    return hidden ? ` (${hidden} ${hidden === 1 ? 'מוסתר' : 'מוסתרים'})` : '';
  }

  function _sbVisibleAmountTotal(portfolio) {
    return portfolio.filter(it => !it.hidden).reduce((s, it) => s + (parseFloat(it.investAmount) || 0), 0);
  }

  function _sbSetAutoSaveId(id) {
    state.sandbox.autoSaveId = id;
    if (id) localStorage.setItem(SANDBOX_AUTOSAVE_ID_KEY, id);
    else localStorage.removeItem(SANDBOX_AUTOSAVE_ID_KEY);
  }

  // Discard the auto-saved default-named draft entry (if any) when the user
  // intentionally clears the working portfolio — no point keeping an unnamed draft around.
  function _sbDiscardAutoSavedDraft() {
    const id = state.sandbox.autoSaveId;
    if (!id) return;
    const list = _sbGetSavedPortfolios();
    const entry = list.find(p => p.id === id);
    if (entry && entry.autoNamed) _sbPutSavedPortfolios(list.filter(p => p.id !== id));
  }

  // The saved-list entry that truly mirrors the current working portfolio.
  // A stale autoSaveId left over from a previous portfolio must never let us
  // rename or overwrite an unrelated saved portfolio, so the id match counts
  // only if the entry is the auto-created draft or still carries the current name.
  function _sbFindMirrorEntry(list) {
    const id = state.sandbox.autoSaveId;
    if (!id) return null;
    const entry = list.find(p => p.id === id);
    if (!entry) return null;
    if (entry.autoNamed || (state.sandbox.portfolioName && entry.name === state.sandbox.portfolioName)) return entry;
    return null;
  }

  // Makes sure the current working portfolio has a real, up-to-date entry in the
  // saved-portfolios list — auto-creating one under the default name if it doesn't
  // have a name yet — so nothing is lost when browsing/loading a different portfolio.
  function _sbEnsureCurrentPortfolioPersisted() {
    if (!state.sandbox.portfolio.length) return;
    _sbSyncVisibleInputsToState();
    const list = _sbGetSavedPortfolios();
    const portfolioCopy = JSON.parse(JSON.stringify(state.sandbox.portfolio));
    const mirror = _sbFindMirrorEntry(list);
    if (mirror) {
      mirror.portfolio = portfolioCopy;
      mirror.savedAt = new Date().toISOString();
      _sbPutSavedPortfolios(list);
      if (!state.sandbox.portfolioName) {
        state.sandbox.portfolioName = mirror.name;
        localStorage.setItem(SANDBOX_NAME_KEY, mirror.name);
      }
    } else {
      const name = state.sandbox.portfolioName || _sbDefaultPortfolioName();
      const id = Date.now().toString();
      list.push({ id, name, date: new Date().toISOString().split('T')[0], notes: '', portfolio: portfolioCopy, savedAt: new Date().toISOString(), autoNamed: !state.sandbox.portfolioName });
      _sbPutSavedPortfolios(list);
      _sbSetAutoSaveId(id);
      if (!state.sandbox.portfolioName) {
        state.sandbox.portfolioName = name;
        localStorage.setItem(SANDBOX_NAME_KEY, name);
      }
    }
    _sbSetDirty(false);
  }

  function _sbFormatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d)) return '';
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }

  let _sbSaveMode = 'new'; // 'new' | 'update'
  let _sbUpdateSelectedId = null;

  function _sbOpenSaveDialog() {
    const dialog = document.getElementById('sb-save-dialog');
    if (!dialog) return;
    _sbSaveMode = 'new';
    _sbUpdateSelectedId = null;
    // Reset new-portfolio form
    document.getElementById('sb-save-name').value = '';
    document.getElementById('sb-save-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('sb-save-notes').value = '';
    // Show/hide mode tabs based on whether saved portfolios exist
    const hasSaved = _sbGetSavedPortfolios().length > 0;
    const tabs = document.getElementById('sb-save-mode-tabs');
    if (tabs) tabs.hidden = !hasSaved;
    _sbSetSaveMode('new');
    dialog.hidden = false;
    history.pushState({ sbDialog: 'save' }, '');
    setTimeout(() => document.getElementById('sb-save-name')?.focus(), 60);
  }

  function _sbSetSaveMode(mode) {
    _sbSaveMode = mode;
    const newPanel    = document.getElementById('sb-save-new-panel');
    const updatePanel = document.getElementById('sb-save-update-panel');
    const submitLabel = document.getElementById('sb-save-dialog-submit-label');
    const title       = document.getElementById('sb-save-dialog-title');
    document.querySelectorAll('.sb-save-mode-tab').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset.saveMode === mode);
    });
    if (mode === 'new') {
      if (newPanel)    newPanel.hidden    = false;
      if (updatePanel) updatePanel.hidden = true;
      if (submitLabel) submitLabel.textContent = 'שמור';
      if (title)       title.textContent  = 'שמירת תיק';
    } else {
      if (newPanel)    newPanel.hidden    = true;
      if (updatePanel) updatePanel.hidden = false;
      if (submitLabel) submitLabel.textContent = 'עדכן';
      if (title)       title.textContent  = 'עדכון תיק קיים';
      _sbRenderUpdateList();
    }
  }

  function _sbRenderUpdateList() {
    const container = document.getElementById('sb-save-update-list');
    if (!container) return;
    const list = _sbGetSavedPortfolios();
    if (!list.length) {
      container.innerHTML = '<p class="sb-load-empty">אין תיקים שמורים עדיין.</p>';
      return;
    }
    const currentId = _sbFindMirrorEntry(list)?.id
      || (state.sandbox.portfolioName ? list.find(p => p.name === state.sandbox.portfolioName)?.id : null);
    container.innerHTML = list.map(item => {
      const tot = _sbVisibleAmountTotal(item.portfolio);
      const totStr = tot > 0 ? `<span dir="ltr">₪ ${Math.round(tot).toLocaleString('he-IL')}</span>` : '';
      const itemIdAttr = ghEscapeAttr(item.id);
      const itemNameHtml = escapeHtml(item.name);
      const dateHtml = escapeHtml(_sbFormatSavedDate(item.date));
      const timeHtml = escapeHtml(_sbFormatTime(item.savedAt));
      const isCurrent = item.id === currentId;
      const badge = isCurrent ? ' <span class="sb-saved-current-badge">תיק נוכחי</span>' : '';
      return `<button type="button" class="sb-update-item${isCurrent ? ' is-current' : ''}" data-update-id="${itemIdAttr}">
        <span class="sb-update-item-name">${itemNameHtml}${badge}</span>
        <span class="sb-saved-meta">${dateHtml}${item.savedAt ? ' · ' + timeHtml : ''} · ${item.portfolio.length} מסלולים${_sbHiddenCountSuffix(item.portfolio)}${totStr ? ' · ' + totStr : ''}</span>
      </button>`;
    }).join('');
    container.querySelectorAll('.sb-update-item').forEach(btn => {
      btn.addEventListener('click', () => {
        _sbUpdateSelectedId = btn.dataset.updateId;
        container.querySelectorAll('.sb-update-item').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
      });
    });
    // Pre-select the current portfolio by default — one click away from "עדכן"
    if (currentId) {
      const currentBtn = [...container.querySelectorAll('.sb-update-item')].find(b => b.dataset.updateId === currentId);
      if (currentBtn) {
        _sbUpdateSelectedId = currentId;
        currentBtn.classList.add('is-selected');
      }
    }
  }

  function _sbCloseSaveDialog() {
    const d = document.getElementById('sb-save-dialog');
    if (d) d.hidden = true;
    _sbUpdateSelectedId = null;
  }

  function _sbDoSavePortfolio() {
    if (_sbSaveMode === 'update') {
      _sbDoUpdatePortfolio();
      return;
    }
    const name = (document.getElementById('sb-save-name')?.value || '').trim();
    if (!name) { document.getElementById('sb-save-name')?.focus(); return; }
    const date  = document.getElementById('sb-save-date')?.value  || new Date().toISOString().split('T')[0];
    const notes = (document.getElementById('sb-save-notes')?.value || '').trim();
    _sbSyncVisibleInputsToState();
    const portfolio = JSON.parse(JSON.stringify(state.sandbox.portfolio));
    // If the working portfolio was only auto-saved under the default name so far,
    // drop that draft entry — this explicit save replaces it, not adds to it.
    const oldAutoSaveId = state.sandbox.autoSaveId;
    const existingList = _sbGetSavedPortfolios();
    const oldEntry = oldAutoSaveId ? existingList.find(p => p.id === oldAutoSaveId) : null;
    const list = (oldEntry && oldEntry.autoNamed) ? existingList.filter(p => p.id !== oldAutoSaveId) : existingList;
    const id = Date.now().toString();
    list.push({ id, name, date, notes, portfolio, savedAt: new Date().toISOString() });
    _sbPutSavedPortfolios(list);
    state.sandbox.portfolioName = name;
    _sbSetDirty(false);
    _sbResetSaveButtonUI();
    _sbSetAutoSaveId(id);
    saveSandboxPortfolio();
    _sbCloseSaveDialog();
    _sbUpdateValueBar(state.sandbox.portfolio);
    showToast(`התיק "${name}" נשמר בהצלחה`);
  }

  function _sbDoUpdatePortfolio() {
    if (!_sbUpdateSelectedId) {
      showToast('יש לבחור תיק לעדכון', 'warn');
      return;
    }
    const oldAutoSaveId = state.sandbox.autoSaveId;
    let list = _sbGetSavedPortfolios();
    const idx = list.findIndex(p => p.id === _sbUpdateSelectedId);
    if (idx === -1) return;
    _sbSyncVisibleInputsToState();
    const target = list[idx];
    target.portfolio = JSON.parse(JSON.stringify(state.sandbox.portfolio));
    target.savedAt = new Date().toISOString();
    delete target.autoNamed;
    // Explicit save = the customer has taken ownership of this portfolio —
    // it's no longer just "whatever came in on the shared link".
    delete target.sharedSourceId;
    // Drop a leftover auto-saved draft entry now that the user explicitly picked a target to update
    const oldAutoEntry = oldAutoSaveId ? list.find(p => p.id === oldAutoSaveId) : null;
    if (oldAutoEntry && oldAutoEntry.autoNamed && oldAutoSaveId !== target.id) {
      list = list.filter(p => p.id !== oldAutoSaveId);
    }
    _sbPutSavedPortfolios(list);
    state.sandbox.portfolioName = target.name;
    _sbSetDirty(false);
    _sbResetSaveButtonUI();
    _sbSetAutoSaveId(target.id);
    saveSandboxPortfolio();
    _sbCloseSaveDialog();
    _sbUpdateValueBar(state.sandbox.portfolio);
    showToast(`התיק "${list[idx].name}" עודכן בהצלחה`);
  }

  function _sbOpenLoadDialog() {
    const dialog = document.getElementById('sb-load-dialog');
    if (!dialog) return;
    _sbEnsureCurrentPortfolioPersisted();
    _sbRenderLoadList();
    dialog.hidden = false;
    history.pushState({ sbDialog: 'load' }, '');
  }

  function _sbCloseLoadDialog() {
    const d = document.getElementById('sb-load-dialog');
    if (d) d.hidden = true;
  }

  function _sbRenderLoadList() {
    const container = document.getElementById('sb-load-list');
    if (!container) return;
    const list = _sbGetSavedPortfolios();
    if (!list.length) {
      container.innerHTML = '<p class="sb-load-empty">אין תיקים שמורים עדיין.</p>';
      return;
    }
    const currentName = state.sandbox.portfolioName;
    const hasCurrent  = state.sandbox.portfolio.length > 0;
    const canCompare  = (hasCurrent && list.length >= 1) || list.length >= 2;
    let html = '';

    if (hasCurrent) {
      const curName   = currentName || 'תיק נוכחי';
      const curNameHtml = escapeHtml(curName);
      const curTot    = _sbVisibleAmountTotal(state.sandbox.portfolio);
      const curTotStr = curTot > 0 ? '<span dir="ltr">₪\u202f' + Math.round(curTot).toLocaleString('he-IL') + '</span>' : '';
      const chk = canCompare
        ? '<label class="sb-compare-check-wrap"><input type="checkbox" class="sb-compare-check" data-compare-id="__current__" /></label>'
        : '<span class="sb-compare-check-placeholder"></span>';
      const curLastMod = state.sandbox.lastModified;
      const curModStr  = curLastMod
        ? _sbFormatSavedDate(curLastMod.split('T')[0]) + ' · ' + _sbFormatTime(curLastMod)
        : '';
      const curModHtml = escapeHtml(curModStr);
      const curMirror = _sbFindMirrorEntry(list);
      const curFromLink = curMirror && curMirror.sharedSourceId;
      html += '<div class="sb-saved-item sb-saved-item--current">'
           + '<div class="sb-saved-item-info">' + chk
           + '<div class="sb-saved-item-text">'
           + '<strong class="sb-saved-name">' + curNameHtml + '</strong>'
           + ' <span class="sb-saved-current-badge">תיק פעיל</span>'
           + (curFromLink ? ' <span class="sb-saved-link-badge" title="התיק נטען מקישור ששותף">🔗 נטען מקישור</span>' : '')
           + (curTotStr ? ' <span class="sb-saved-value-badge">' + curTotStr + '</span>' : '')
           + '<span class="sb-saved-meta">'
           + (curModStr ? 'עדכון אחרון: ' + curModHtml + ' · ' : '')
           + state.sandbox.portfolio.length + ' מסלולים' + _sbHiddenCountSuffix(state.sandbox.portfolio) + '</span>'
           + '</div></div>'
           + '<div class="sb-saved-actions">'
           + '<button type="button" class="sb-delete-current-btn" id="sb-delete-current-btn" title="נקה תיק נוכחי"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>'
           + '</div>'
           + '</div>';
    }

    const ITEM_COLORS = ['sb-item-c0', 'sb-item-c1', 'sb-item-c2', 'sb-item-c3'];
    let colorIdx = 0;
    const mirrorEntry = hasCurrent ? _sbFindMirrorEntry(list) : null;
    list.forEach(item => {
      const tot    = _sbVisibleAmountTotal(item.portfolio);
      const totStr = tot > 0 ? '<span dir="ltr">₪\u202f' + Math.round(tot).toLocaleString('he-IL') + '</span>' : '';
      // Skip only the exact entry mirroring the working portfolio (shown at top as __current__).
      // Matching by name here used to hide unrelated same-named portfolios from the list.
      if (mirrorEntry && item.id === mirrorEntry.id) return;
      const colorCls = ITEM_COLORS[colorIdx % ITEM_COLORS.length];
      colorIdx++;
      const itemIdAttr = ghEscapeAttr(item.id);
      const itemNameHtml = escapeHtml(item.name);
      const itemNameAttr = ghEscapeAttr(item.name);
      const itemNotesHtml = escapeHtml(item.notes);
      const itemDateHtml = escapeHtml(_sbFormatSavedDate(item.date));
      const itemTimeHtml = escapeHtml(_sbFormatTime(item.savedAt));
      const chk = canCompare
        ? '<label class="sb-compare-check-wrap"><input type="checkbox" class="sb-compare-check" data-compare-id="' + itemIdAttr + '" /></label>'
        : '<span class="sb-compare-check-placeholder"></span>';
      html += '<div class="sb-saved-item ' + colorCls + '">'
           + '<div class="sb-saved-item-info">' + chk
           + '<div class="sb-saved-item-text sb-load-area" data-load-id="' + itemIdAttr + '" role="button" tabindex="0" aria-label="טען תיק ' + itemNameAttr + '">'
           + '<strong class="sb-saved-name">' + itemNameHtml + '</strong>'
           + (item.sharedSourceId ? ' <span class="sb-saved-link-badge" title="התיק נטען מקישור ששותף">🔗 נטען מקישור</span>' : '')
           + (totStr ? ' <span class="sb-saved-value-badge">' + totStr + '</span>' : '')
           + '<span class="sb-saved-meta">' + itemDateHtml + (item.savedAt ? ' · ' + itemTimeHtml : '') + ' · ' + item.portfolio.length + ' מסלולים' + _sbHiddenCountSuffix(item.portfolio) + '</span>'
           + (item.notes ? '<span class="sb-saved-notes">' + itemNotesHtml + '</span>' : '')
           + '</div></div>'
           + '<div class="sb-saved-actions">'
           + '<button type="button" class="sb-delete-item-btn" data-delete-id="' + itemIdAttr + '"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>'
           + '</div></div>';
    });
    container.innerHTML = html;

    // The compare footer lives outside #sb-load-list (in the static markup) so it
    // stays pinned below the scrollable saved-portfolios list instead of requiring
    // a scroll to reach it once there are many saved portfolios.
    const footer = document.getElementById('sb-compare-multi-footer');
    if (footer) footer.hidden = true;

    if (canCompare) {
      const _updateMultiFooter = () => {
        const checked = [...container.querySelectorAll('.sb-compare-check:checked')];
        const countEl = document.getElementById('sb-compare-multi-count');
        if (!footer) return;
        const wasHidden = footer.hidden;
        footer.hidden = checked.length < 2;
        if (!footer.hidden && wasHidden) {
          footer.classList.remove('sb-pop-in');
          void footer.offsetWidth;
          footer.classList.add('sb-pop-in');
        }
        if (countEl) countEl.textContent = checked.length + ' תיקים נבחרו';
        container.querySelectorAll('.sb-compare-check:not(:checked)').forEach(cb => { cb.disabled = checked.length >= 3; });
      };
      container.querySelectorAll('.sb-compare-check').forEach(cb => cb.addEventListener('change', _updateMultiFooter));
      const multiBtn = document.getElementById('sb-compare-multi-btn');
      if (multiBtn && !multiBtn.dataset.bound) {
        multiBtn.dataset.bound = '1';
        multiBtn.addEventListener('click', () => {
          const ids = [...document.querySelectorAll('#sb-load-list .sb-compare-check:checked')].map(cb => cb.dataset.compareId);
          if (ids.length >= 2) _sbOpenCompareDialogMulti(ids);
        });
      }
    }

    container.querySelectorAll('.sb-load-area').forEach(area => {
      area.addEventListener('click',   () => _sbDoLoadPortfolio(area.dataset.loadId));
      area.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') _sbDoLoadPortfolio(area.dataset.loadId); });
    });
    container.querySelectorAll('.sb-delete-item-btn').forEach(btn =>
      btn.addEventListener('click', () => _sbDoDeletePortfolio(btn.dataset.deleteId)));
    document.getElementById('sb-delete-current-btn')?.addEventListener('click', () => {
      if (!confirm('לנקות את התיק הנוכחי מהמסך?')) return;
      _sbDiscardAutoSavedDraft();
      state.sandbox.portfolio = [];
      state.sandbox.portfolioName = '';
      _sbSetDirty(false);
      _sbSetAutoSaveId(null);
      localStorage.removeItem(SANDBOX_NAME_KEY);
      _sbHideValueBar();
      saveSandboxPortfolio();
      document.querySelectorAll('.sandbox-check.is-in-portfolio').forEach(cb => {
        cb.checked = false; cb.classList.remove('is-in-portfolio');
      });
      _sbCloseLoadDialog();
      renderSandboxPage();
    });
  }

  function _sbDoLoadPortfolio(id) {
    const list = _sbGetSavedPortfolios();
    const item = list.find(p => p.id === id);
    if (!item) return;
    if (!confirm(`לטעון את התיק "${item.name}"?\nהתיק הנוכחי יישמר ברשימה ויוחלף במסך.`)) return;
    _sbEnsureCurrentPortfolioPersisted();
    _sbCloseLoadDialog();
    state.sandbox.portfolio = JSON.parse(JSON.stringify(item.portfolio));
    state.sandbox.portfolioName = item.name;
    _sbSetDirty(false);
    _sbSetAutoSaveId(item.id);
    saveSandboxPortfolio();
    document.querySelectorAll('.sandbox-check').forEach(cb => {
      cb.checked = false; cb.classList.remove('is-in-portfolio');
    });
    state.sandbox.portfolio.forEach(it => {
      const cb = document.querySelector(`.sandbox-check[data-fundid="${it.fundId}"][data-trackid="${it.trackId}"][data-categoryid="${it.categoryId}"]`);
      if (cb) { cb.checked = true; cb.classList.add('is-in-portfolio'); }
    });
    if (state.activeCategoryId !== 'sandbox') switchCategory('sandbox');
    else renderSandboxPage();
    showToast(`התיק "${item.name}" נטען בהצלחה`);
  }

  function _sbDoDeletePortfolio(id) {
    const list = _sbGetSavedPortfolios();
    const item = list.find(p => p.id === id);
    if (!item || !confirm(`למחוק את התיק "${item.name}"?`)) return;
    _sbPutSavedPortfolios(list.filter(p => p.id !== id));
    _sbRenderLoadList();
  }

  // ── Mark modified ────────────────────────────────────────────────────────
  // Only fires when the portfolio already had a saved name and the user then
  // edited the data. The name stays put — we just flag the portfolio dirty and
  // pulse the save button so it's clear there's something to update.
  function _sbMarkPortfolioModified() {
    if (!state.sandbox.portfolioName) return;
    const wasDirty = state.sandbox.isDirty;
    _sbSetDirty(true);
    if (wasDirty) return;
    const btn = document.getElementById('sandbox-save-portfolio-btn');
    if (btn) {
      btn.classList.remove('sb-save-hidden');
      btn.removeAttribute('aria-hidden');
      btn.innerHTML = '<i class="fas fa-floppy-disk" aria-hidden="true"></i> <span class="sb-btn-label">שמור/עדכן</span>';
      void btn.offsetWidth;
      btn.classList.add('sb-save-appear', 'sb-save-pulse');
    }
  }

  // ── Print ──────────────────────────────────────────────────────────────────
  let _sbPrintHeader = null;
  let _sbPrintValueSummary = null;
  let _sbPrintFooter = null;
  let _sbComparePrintRoot = null;
  let _sbComparePrintCleanupTimer = null;
  let _sbComparePrintInProgress = false;
  let _sbComparePrintOriginalNodes = null;
  let _sbComparePrintScrollY = 0;
  // Dedicated print variant with a solid gold fill instead of the on-screen
  // logo's gradient — Android Chrome's print/PDF rasterizer can fail to
  // resolve a gradient's url() reference on an externally-loaded <img> SVG,
  // which silently drops that fill (fill=none), making "Hub" disappear.
  const SB_PRINT_LOGO_SRC = 'assets/gemelhub-logo-print.svg?v=print-logo-20260704-4';
  const SB_PRINT_LOGO_HTML = '<img src="' + SB_PRINT_LOGO_SRC + '" alt="GemelHub" class="sb-print-logo-mark">';

  function _sbWaitForPrintAssets(root) {
    const scope = root || document;
    const images = Array.from(scope.querySelectorAll('.sb-print-logo img'));
    if (!images.length) return Promise.resolve();
    return Promise.all(images.map(function(img) {
      const decodeImage = function() {
        return img.decode ? img.decode().catch(function() {}) : Promise.resolve();
      };
      if (img.complete && img.naturalWidth > 0) return decodeImage();
      return new Promise(function(resolve) {
        let done = false;
        const finish = function() {
          if (done) return;
          done = true;
          resolve();
        };
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
        setTimeout(finish, 900);
      }).then(decodeImage);
    })).then(function() {});
  }

  function _sbInjectPrintState() {
    if (_sbComparePrintInProgress || document.body.classList.contains('sb-compare-printing')) return false;
    const section = document.getElementById('sandbox-section');
    if (!section || section.style.display === 'none') return false;
    _sbSyncVisibleInputsToState();
    if (!_sbPrintHeader) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const portfolioName = escapeHtml(state.sandbox.portfolioName || _sbDefaultPortfolioName());
      _sbPrintHeader = document.createElement('div');
      _sbPrintHeader.className = 'sb-print-report-header';
      _sbPrintHeader.innerHTML = `
        <div class="sb-print-logo">${SB_PRINT_LOGO_HTML}</div>
        <div class="sb-print-portfolio-title">${portfolioName}</div>
        <div class="sb-print-meta">הופק: ${dateStr}<br>רועי רומנו, מתכנן פיננסי וסוכן פנסיוני מורשה | 052-8089808</div>
      `;
      section.insertBefore(_sbPrintHeader, section.firstChild);
    }
    if (!_sbPrintValueSummary) {
      const summaryHtml = _sbBuildPrintValueSummaryHtml(state.sandbox.portfolio);
      if (summaryHtml) {
        _sbPrintValueSummary = document.createElement('div');
        _sbPrintValueSummary.className = 'sb-print-value-summary';
        _sbPrintValueSummary.setAttribute('dir', 'rtl');
        _sbPrintValueSummary.innerHTML = summaryHtml;
        section.insertBefore(_sbPrintValueSummary, _sbPrintHeader ? _sbPrintHeader.nextSibling : section.firstChild);
      }
    }
    if (!_sbPrintFooter) {
      _sbPrintFooter = document.createElement('div');
      _sbPrintFooter.className = 'sb-print-disclaimer';
      _sbPrintFooter.textContent = 'המידע נועד לספק תמונת מצב כללית והשוואתית בלבד ואינו מהווה ייעוץ השקעות, שיווק פנסיוני או תחליף לייעוץ אישי המותאם לצרכי הלקוח. הנתונים מבוססים על מקורות פומביים ועשויים להכיל טעויות או אי-דיוקים. אין לראות בתשואות העבר התחייבות לתשואות עתידיות. לפני קבלת החלטה פיננסית מומלץ להתייעץ עם בעל רישיון.';
      section.appendChild(_sbPrintFooter);
    }
    document.body.classList.add('sb-printing');
    return true;
  }

  function _sbCleanupPrintState() {
    document.body.classList.remove('sb-printing');
    if (_sbPrintHeader && _sbPrintHeader.parentNode) {
      _sbPrintHeader.parentNode.removeChild(_sbPrintHeader);
    }
    _sbPrintHeader = null;
    if (_sbPrintValueSummary && _sbPrintValueSummary.parentNode) {
      _sbPrintValueSummary.parentNode.removeChild(_sbPrintValueSummary);
    }
    _sbPrintValueSummary = null;
    if (_sbPrintFooter && _sbPrintFooter.parentNode) {
      _sbPrintFooter.parentNode.removeChild(_sbPrintFooter);
    }
    _sbPrintFooter = null;
  }

  function _ghTrackAnalytics(eventName, params) {
    try {
      if (window.GemelHubAnalytics && typeof window.GemelHubAnalytics.track === 'function') {
        window.GemelHubAnalytics.track(eventName, params || {});
      }
    } catch (e) {}
  }

  function setupPrintListeners() {
    window.addEventListener('beforeprint', () => {
      if (!_sbComparePrintInProgress && !document.body.classList.contains('sb-compare-printing')) _sbInjectPrintState();
    });
    window.addEventListener('afterprint', _sbCleanupPrintState);
    // אין קריאה אוטומטית ל-_sbCleanupComparePrintState כאן בכוונה:
    // afterprint יודע לירות מיד במובייל (לפני שהצילום/השמירה בפועל
    // הסתיימו), מה שהיה מוחק את דוח ההשוואה עוד לפני שהתצוגה המקדימה
    // הספיקה להיפתח. שחזור הדף קורה רק בלחיצה על "חזרה לתיק" או
    // ברשת הביטחון (60 שניות) בתוך _sbPrintCompare עצמה.
  }

  function _sbPrintSummary() {
    if (!_sbInjectPrintState()) return;
    _ghTrackAnalytics('portfolio_print', {
      item_count: state.sandbox.portfolio.length || 0
    });
    _sbWaitForPrintAssets(document).then(function() {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          window.print();
        });
      });
    });
  }

  // ── Share via branded short links, with URL-hash fallback ──────────────────
  function _sbSharedPortfolioEndpoint() {
    return (typeof CONFIG !== 'undefined' && CONFIG.API && CONFIG.API.SHARED_PORTFOLIO_ENDPOINT || '').trim();
  }

  function _sbSharedPortfolioGetUrl(id) {
    const endpoint = _sbSharedPortfolioEndpoint();
    if (!endpoint || !id) return '';
    if (endpoint.includes('{id}')) return endpoint.replace('{id}', encodeURIComponent(id));
    return endpoint.replace(/\/$/, '') + '/' + encodeURIComponent(id);
  }

  function _sbSharedPortfolioPageUrl(id, type) {
    const url = new URL(location.origin + location.pathname);
    url.searchParams.set(type === 'compare' ? 'c' : 'p', id);
    return url.toString();
  }

  function _sbHashPortfolioUrl(payload) {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    return location.origin + location.pathname + '#portfolio=' + encoded;
  }

  function _sbHashCompareUrl(payload) {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    return location.origin + location.pathname + '#compare=' + encoded;
  }

  async function _sbCreateSharedPortfolioLink(type, payload) {
    const endpoint = _sbSharedPortfolioEndpoint();
    if (!endpoint) return '';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, payload: payload, createdAt: new Date().toISOString() })
    });
    if (!response.ok) throw new Error('Shared portfolio save failed');
    const result = await response.json();
    const id = result && (result.id || result.key || result.slug);
    if (result && result.url) return result.url;
    return id ? _sbSharedPortfolioPageUrl(id, type) : '';
  }

  async function _sbLoadSharedPortfolioPayload(id) {
    const endpoint = _sbSharedPortfolioEndpoint();
    if (!endpoint || !id) return null;
    const getUrl = _sbSharedPortfolioGetUrl(id);
    let response = await fetch(getUrl);
    if (!response.ok && !endpoint.includes('{id}')) {
      const url = new URL(endpoint, location.href);
      url.searchParams.set('id', id);
      response = await fetch(url.toString());
    }
    if (!response.ok) throw new Error('Shared portfolio load failed');
    const result = await response.json();
    return result && result.payload ? result : { payload: result };
  }

  function _sbOpenWhatsAppShare(text, link, suffix) {
    window.open('https://wa.me/?text=' + encodeURIComponent(text + link + (suffix || '')), '_blank');
  }

  function _sbShortenFallbackUrl(url) {
    return fetch('https://is.gd/create.php?format=simple&url=' + encodeURIComponent(url))
      .then(function(r) { return r.text(); })
      .then(function(s) { return s && s.startsWith('http') ? s.trim() : url; })
      .catch(function() { return url; });
  }

  // sharedId identifies the specific share link (the server-side share id for
  // ?p=, or the raw #portfolio= hash payload for the link-in-URL fallback) —
  // used to avoid saving the same shared portfolio into the saved list twice
  // if the recipient opens the same link again.
  function _sbApplySharedPortfolioPayload(payload, sharedId) {
    const isV2 = payload && payload.v === 2;
    const portfolio = isV2 && Array.isArray(payload.p)
      ? payload.p.map(_sbExpandMiniItem)
      : payload && Array.isArray(payload.p)
        ? payload.p
        : null;
    if (!portfolio || !portfolio.length) return false;
    const name = payload.n || 'תיק משותף';
    state.sandbox.portfolio = portfolio;
    state.sandbox.portfolioName = name;
    _sbSetDirty(false);
    saveSandboxPortfolio();
    if (state.activeCategoryId !== 'sandbox') switchCategory('sandbox');
    else renderSandboxPage();

    let alreadySaved = false;
    if (sharedId) {
      const list = _sbGetSavedPortfolios();
      const existing = list.find(p => p.sharedSourceId === sharedId);
      alreadySaved = !!existing;
      if (existing) {
        // Point autoSaveId at the existing entry so _sbEnsureCurrentPortfolioPersisted()
        // (run e.g. when opening the load dialog) treats it as already mirrored and
        // just updates it in place, instead of creating a second duplicate entry.
        _sbSetAutoSaveId(existing.id);
      } else {
        const now = new Date();
        const id = 'shared_' + now.getTime();
        list.push({
          id,
          name: name,
          date: now.toISOString().split('T')[0],
          savedAt: now.toISOString(),
          notes: 'נטען מקישור',
          portfolio: portfolio,
          sharedSourceId: sharedId,
        });
        _sbPutSavedPortfolios(list);
        _sbSetAutoSaveId(id);
      }
    } else {
      _sbSetAutoSaveId(null);
    }
    showToast(alreadySaved
      ? 'התיק "' + name + '" נטען מהקישור (כבר שמור במעבדה)'
      : 'התיק "' + name + '" נטען מהקישור ונשמר במעבדה');
    _ghTrackAnalytics('shared_portfolio_loaded', {
      item_count: portfolio.length || 0
    });
    return true;
  }

  function _sbApplySharedComparePayload(payload) {
    if (!payload || !payload.portfolios || !Array.isArray(payload.portfolios) || !payload.portfolios.length) return false;
    const isV2 = payload.v === 2;
    const list = _sbGetSavedPortfolios();
    const newIds = [];
    const now = new Date();
    const baseTs = now.getTime();
    payload.portfolios.forEach(function(port, idx) {
      if (!port.p || !port.p.length) return;
      const portfolio = isV2 ? port.p.map(_sbExpandMiniItem) : port.p;
      const name = port.n || ('תיק מקושר ' + (idx + 1));
      const id = 'shared_' + (baseTs + idx);
      list.push({ id: id, name: name, date: now.toISOString().split('T')[0], savedAt: now.toISOString(), notes: 'נטען מקישור', portfolio: portfolio });
      newIds.push(id);
    });
    if (!newIds.length) return false;
    localStorage.setItem(SB_PORTFOLIOS_KEY, JSON.stringify(list));
    if (state.activeCategoryId !== 'sandbox') switchCategory('sandbox');
    else renderSandboxPage();
    setTimeout(function() {
      if (newIds.length >= 2) _sbOpenCompareDialogMulti(newIds);
      else if (newIds.length === 1) _sbDoLoadPortfolio(newIds[0]);
    }, 500);
    showToast('נטענו ' + newIds.length + ' תיקים מקישור — ההשוואה נפתחת');
    _ghTrackAnalytics('shared_compare_loaded', {
      portfolio_count: newIds.length || 0
    });
    return true;
  }

  async function _sbSharePortfolio() {
    if (!state.sandbox.portfolio.length) { showToast('אין מסלולים לשיתוף'); return; }
    const data = {
      v: 2,
      p: state.sandbox.portfolio.map(_sbMiniItem),
      n: state.sandbox.portfolioName || ''
    };
    const fallbackUrl = _sbHashPortfolioUrl(data);
    const text = 'רציתי לשתף אותך בתיק הפיננסי שבניתי *במעבדה של מערכת ה-GemelHub של רועי רומנו*.\nלצפיה בתיק :\n';
    const suffix = '\nהקישור פעיל ל-7 ימים בלבד.';
    try {
      const sharedUrl = await _sbCreateSharedPortfolioLink('portfolio', data);
      _sbOpenWhatsAppShare(text, sharedUrl || await _sbShortenFallbackUrl(fallbackUrl), suffix);
      _ghTrackAnalytics('portfolio_share_whatsapp', {
        item_count: state.sandbox.portfolio.length || 0,
        method: sharedUrl ? 'worker' : 'fallback'
      });
    } catch(e) {
      _sbOpenWhatsAppShare(text, await _sbShortenFallbackUrl(fallbackUrl), suffix);
      _ghTrackAnalytics('portfolio_share_whatsapp', {
        item_count: state.sandbox.portfolio.length || 0,
        method: 'fallback'
      });
    }
  }

  async function _sbCheckUrlHash() {
    const params = new URLSearchParams(location.search);
    const sharedPortfolioId = params.get('p');
    const sharedCompareId = params.get('c');
    if (sharedPortfolioId || sharedCompareId) {
      try {
        const loaded = await _sbLoadSharedPortfolioPayload(sharedPortfolioId || sharedCompareId);
        const handled = sharedCompareId
          ? _sbApplySharedComparePayload(loaded && loaded.payload)
          : _sbApplySharedPortfolioPayload(loaded && loaded.payload, sharedPortfolioId);
        if (handled) {
          const cleanUrl = new URL(location.href);
          cleanUrl.searchParams.delete('p');
          cleanUrl.searchParams.delete('c');
          history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
          return true;
        }
      } catch(e) {
        showToast('לא הצלחנו לטעון את הקישור המקוצר. נסה לבקש קישור חדש.');
        return false;
      }
    }

    const hash = location.hash;
    // Single portfolio share
    if (hash.startsWith('#portfolio=')) {
      try {
        const hashPayload = hash.slice('#portfolio='.length);
        const data = JSON.parse(decodeURIComponent(escape(atob(hashPayload))));
        if (_sbApplySharedPortfolioPayload(data, hashPayload)) {
          history.replaceState(null, '', location.pathname + location.search);
          return true;
        }
      } catch(e) {}
      return false;
    }
    // Multi-portfolio compare share
    if (hash.startsWith('#compare=')) {
      try {
        const data = JSON.parse(decodeURIComponent(escape(atob(hash.slice('#compare='.length)))));
        if (_sbApplySharedComparePayload(data)) {
          history.replaceState(null, '', location.pathname + location.search);
          return true;
        }
      } catch(e) {}
    }
    return false;
  }

  // ── Compare ────────────────────────────────────────────────────────────────
  function _sbBuildSummary(portfolio) {
    let totalAmt = 0, wFee = 0, wY12 = 0, wY3 = 0, n = 0;
    portfolio.forEach(item => {
      const amt = parseFloat(item.investAmount) || 0;
      const fee = parseFloat(item.dnCumulative) || 0;
      const y12 = parseFloat(item.y12m) || 0;
      const y3  = parseFloat(item.y5)   || 0;
      totalAmt += amt; wFee += fee * amt; wY12 += y12 * amt; wY3 += y3 * amt; n++;
    });
    return {
      count: n, totalAmt,
      avgFee: totalAmt > 0 ? wFee / totalAmt : null,
      avgY12: totalAmt > 0 ? wY12 / totalAmt : null,
      avgY3:  totalAmt > 0 ? wY3  / totalAmt : null,
    };
  }

  function _sbBuildExtendedSummary(portfolio) {
    let totalAmt = 0;
    portfolio.forEach(it => { totalAmt += parseFloat(String(it.investAmount||'').replace(/,/g,'')) || 0; });
    const wavg = (field) => {
      let sum = 0, wsum = 0;
      portfolio.forEach(it => {
        const v = parseFloat(it[field]);
        if (isNaN(v)) return;
        const w = totalAmt > 0
          ? (parseFloat(String(it.investAmount||'').replace(/,/g,'')) || 0) / totalAmt
          : 1 / portfolio.length;
        sum += w * v; wsum += w;
      });
      return wsum > 0 ? sum / wsum : null;
    };
    return {
      count: portfolio.length, totalAmt,
      avgFee: wavg('dnCumulative'),
      avgY1: wavg('y1'), avgY3m: wavg('y3'),
      avgY12: wavg('y12m'), avgY3y: wavg('y5'), avgY5yr: wavg('y5yr'),
      avgStock: wavg('stock'), avgAbroad: wavg('abroad'), avgFx: wavg('fx'),
      avgDnDeposit: wavg('dnDeposit'),
    };
  }

  function _sbCompareColHtml(name, portfolio) {
    const s = _sbBuildSummary(portfolio);
    const fmt = v => v != null ? v.toFixed(2) + '%' : '—';
    const fmtAmt = v => v > 0 ? '₪ ' + Math.round(v).toLocaleString('he-IL') : '—';
    const rows = [
      ['מסלולים', s.count],
      ['סה"כ השקעה', fmtAmt(s.totalAmt)],
      ['ד"נ מצבירה ממוצע', fmt(s.avgFee)],
      ['תשואה 12 חוד׳ ממוצעת', fmt(s.avgY12)],
      ['תשואה 3 שנים ממוצעת', fmt(s.avgY3)],
    ];
    const tableRows = rows.map(([label, val]) =>
      `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(val)}</td></tr>`).join('');
    const trackList = portfolio.map(it =>
      `<div class="sb-compare-track-row">
        <span class="sb-product-dot" style="background:${ghEscapeAttr(it.color || '#999')};width:8px;height:8px;border-radius:50%;flex-shrink:0"></span>
        <span>${escapeHtml(it.provider || '')} — ${escapeHtml(it.trackLabel || it.fundName || '')}</span>
      </div>`).join('');
    return `
      <div class="sb-compare-col">
        <div class="sb-compare-col-head">${escapeHtml(name)}</div>
        <table class="sb-compare-table"><tbody>${tableRows}</tbody></table>
        <div class="sb-compare-tracks">
          <div class="sb-compare-tracks-head">מסלולים בתיק</div>
          ${trackList || '<div class="sb-compare-track-row" style="color:#aaa">—</div>'}
        </div>
      </div>`;
  }

  function _sbCompareValueSummaryHtml(items) {
    const catOrder = CONFIG.PRODUCT_CATEGORIES.map(c => c.id);
    const cards = items.map((it, ci) => {
      const portfolio = Array.isArray(it.portfolio) ? it.portfolio.filter(t => !t.hidden) : [];
      const grouped = {};
      portfolio.forEach(item => {
        if (!grouped[item.categoryId]) grouped[item.categoryId] = [];
        grouped[item.categoryId].push(item);
      });
      const allInvestedAsAmount = portfolio.length > 0 && portfolio.every(item => item.investMode === 'amount');
      const totalAmount = allInvestedAsAmount
        ? portfolio.reduce((sum, item) => sum + (parseFloat(String(item.investAmount || '').replace(/,/g, '')) || 0), 0)
        : 0;
      const totalText = totalAmount > 0
        ? `<strong><span dir="ltr">₪\u202f${Math.round(totalAmount).toLocaleString('he-IL')}</span></strong>`
        : '<strong>—</strong>';
      const rows = Object.keys(grouped)
        .sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b))
        .map(catId => {
          const tracks = grouped[catId];
          const meta = _sbGetCategoryMeta(catId);
          const label = tracks[0]?.categoryLabel || meta.label || catId;
          const amountTotal = tracks
            .filter(t => t.investMode === 'amount' && t.investAmount !== '')
            .reduce((sum, t) => sum + (parseFloat(String(t.investAmount).replace(/,/g, '')) || 0), 0);
          const pctTotal = tracks
            .filter(t => t.investMode === 'percent' && t.investPct !== '')
            .reduce((sum, t) => sum + (parseFloat(String(t.investPct).replace(/,/g, '')) || 0), 0);
          const amountText = amountTotal > 0 ? `<span dir="ltr">₪\u202f${Math.round(amountTotal).toLocaleString('he-IL')}</span>` : '';
          const pctText = pctTotal > 0 ? `${pctTotal.toFixed(pctTotal % 1 ? 1 : 0)}%` : '';
          const valueText = amountText && pctText ? `${amountText} · ${pctText}` : (amountText || pctText || 'ללא סכום');
          const managerCount = new Set(tracks.map(t => String(t.provider || '').trim()).filter(Boolean)).size;
          const managerText = managerCount > 0
            ? `<span class="sbcmp-value-managers">(${managerCount === 1 ? 'מנהל השקעות 1' : `${managerCount} מנהלי השקעות`})</span>`
            : '';
          return `<div class="sbcmp-value-row">
            <span class="sbcmp-value-cat">${escapeHtml(label)}</span>
            <strong>${valueText}</strong>
            ${managerText}
          </div>`;
        }).join('');
      return `<div class="sbcmp-value-card sbcmp-value-card-${ci}">
        <div class="sbcmp-value-card-name sbcmp-col-${ci}">${escapeHtml(it.name)}</div>
        <div class="sbcmp-value-total">
          <span>שווי התיק</span>
          ${totalText}
        </div>
        <div class="sbcmp-value-divider" aria-hidden="true"></div>
        <div class="sbcmp-value-rows">${rows || '<div class="sbcmp-value-empty">אין מסלולים בתיק</div>'}</div>
      </div>`;
    }).join('');
    return '<div class="sbcmp-section sbcmp-value-section"><div class="sbcmp-section-head">שווי ופירוט התיקים</div><div class="sbcmp-value-grid sbcmp-value-grid-' + items.length + '">' + cards + '</div></div>';
  }

  function _sbRenderCompare(items) {
    const n    = items.length;
    // Hidden routes are excluded from the comparison — same "what if" simulation as the lab table
    items = items.map(it => ({ ...it, portfolio: (it.portfolio || []).filter(t => !t.hidden) }));
    const sums = items.map(it => _sbBuildExtendedSummary(it.portfolio));
    const valueSummaryHtml = _sbCompareValueSummaryHtml(items);

    // ── Section 1: Tracks per category
    const allCats = {};
    items.forEach(it => it.portfolio.forEach(t => {
      if (!allCats[t.categoryId]) allCats[t.categoryId] = t.categoryLabel || t.categoryId;
    }));
    let tracksHtml = '<div class="sbcmp-section"><div class="sbcmp-section-head">מסלולים לפי קטגוריה</div>';
    Object.entries(allCats).forEach(([catId, catLabel]) => {
      tracksHtml += '<div class="sbcmp-cat-block"><div class="sbcmp-cat-head">' + escapeHtml(catLabel) + '</div>';
      tracksHtml += '<div class="sbcmp-cat-cols sbcmp-cat-cols-' + n + '">';
      tracksHtml += '<div class="sbcmp-col-name-row">';
      items.forEach((it, ci) => {
        tracksHtml += '<div class="sbcmp-col-name sbcmp-col-' + ci + '">' + escapeHtml(it.name) + '</div>';
      });
      tracksHtml += '</div><div class="sbcmp-tracks-row">';
      items.forEach((it, ci) => {
        const tracks = it.portfolio.filter(t => t.categoryId === catId);
        const catTot = tracks.reduce((s, t) => s + (parseFloat(String(t.investAmount||'').replace(/,/g,''))||0), 0);
        tracksHtml += '<div class="sbcmp-track-col sbcmp-track-col-' + ci + '">'; // ci from outer forEach
        if (!tracks.length) {
          tracksHtml += '<div class="sbcmp-track-empty">—</div>';
        } else {
          tracks.forEach(t => {
            const amt    = parseFloat(String(t.investAmount || '').replace(/,/g, '')) || 0;
            const pct    = catTot > 0 && tracks.length > 1 ? ' <strong class="sbcmp-pct">' + Math.round(amt / catTot * 100) + '%</strong>' : '';
            const amtStr = amt > 0 ? '<strong class="sbcmp-amt"><span dir="ltr">₪\u202f' + Math.round(amt).toLocaleString('he-IL') + '</span></strong>' : '';
            tracksHtml += '<div class="sbcmp-track-item">'
              + '<div class="sbcmp-track-info">'
              + '<div class="sbcmp-track-name" style="color:' + ghEscapeAttr(t.color || '#999') + '">' + escapeHtml(t.provider || '')
              + (t.trackLabel ? ' — ' + escapeHtml(t.trackLabel) : (t.fundName ? ' — ' + escapeHtml(t.fundName) : ''))
              + '</div>'
              + (amtStr || pct ? '<div class="sbcmp-track-meta">' + amtStr + pct + '</div>' : '')
              + '</div></div>';
          });
        }
        tracksHtml += '</div>';
      });
      // category summary row
      tracksHtml += '</div>'; // close sbcmp-tracks-row
      tracksHtml += '<div class="sbcmp-cat-summary">'
      items.forEach(it => {
        const tracks = it.portfolio.filter(t => t.categoryId === catId);
        const tot = tracks.reduce((s, t) => s + (parseFloat(String(t.investAmount||'').replace(/,/g,'')) || 0), 0);
        let wFee = 0, wSum = 0;
        tracks.forEach(t => {
          const w = parseFloat(String(t.investAmount||'').replace(/,/g,'')) || 0;
          const f = parseFloat(t.dnCumulative) || 0;
          wFee += f * w; wSum += w;
        });
        const avgFee = wSum > 0 ? (wFee / wSum).toFixed(2) + '%' : '—';
        const totStr = tot > 0 ? '<span dir="ltr">₪\u202f' + Math.round(tot).toLocaleString('he-IL') + '</span>' : '—';
        tracksHtml += '<div class="sbcmp-cat-sum-cell">'
          + '<span class="sbcmp-sum-amt">' + totStr + '</span>'
          + '<span class="sbcmp-sum-fee">ד"נ ממוצע: ' + avgFee + '</span>'
          + '</div>';
      });
      tracksHtml += '</div>'; // close sbcmp-cat-summary
      tracksHtml += '</div></div>';
    });
    tracksHtml += '</div>';

    // ── Table builder helper
    // row.isReturn: מסמן שורת תשואה (לא ד"נ, לא חשיפה) — צובעים כל ערך
    // בירוק/אדום לפי הסימן, ומסמנים את הערך הטוב יותר בין התיקים במרקר צהוב.
    const mkTable = (headLabel, rows) => {
      let t = '<table class="sbcmp-table"><thead><tr><th>' + escapeHtml(headLabel) + '</th>';
      items.forEach((it, ci) => { t += '<th class="sbcmp-th-' + ci + '">' + escapeHtml(it.name) + '</th>'; });
      if (n === 2) t += '<th class="sbcmp-diff-head">הפרש</th>';
      t += '</tr></thead><tbody>';
      rows.forEach(row => {
        t += '<tr><td class="sbcmp-row-label">' + escapeHtml(row.label) + '</td>';
        const vals = sums.map(s => s[row.key]);
        const best = row.isReturn ? Math.max(...vals.filter(v => v != null)) : null;
        vals.forEach(v => {
          if (v == null) { t += '<td>—</td>'; return; }
          const signCls = row.isReturn ? (v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : '') : '';
          const isBest = row.isReturn && v === best;
          const crown = isBest ? '<i class="fas fa-crown sbcmp-best-icon" aria-hidden="true"></i>' : '';
          t += '<td class="' + signCls + '"><span class="sbcmp-val-wrap">' + crown + v.toFixed(row.dec || 2) + '%</span></td>';
        });
        if (n === 2 && vals[0] != null && vals[1] != null) {
          const d = vals[0] - vals[1];
          const cls = d > 0.005 ? 'pos' : d < -0.005 ? 'neg' : '';
          t += '<td class="' + cls + '"><span dir="ltr">' + (d >= 0 ? '+' : '') + d.toFixed(row.dec || 2) + '%</span></td>';
        } else if (n === 2) { t += '<td>—</td>'; }
        t += '</tr>';
      });
      return t + '</tbody></table>';
    };

    // ── Section 2: Returns
    const hasDeposit = items.some(it => it.portfolio.some(t => parseFloat(t.dnDeposit) > 0));
    const feeRows = [
      { label: 'ד"נ מצבירה', key: 'avgFee', dec: 2 },
    ];
    if (hasDeposit) feeRows.push({ label: 'ד"נ מהפקדה', key: 'avgDnDeposit', dec: 2 });
    const returnsHtml = '<div class="sbcmp-section"><div class="sbcmp-section-head">תשואות ודמי ניהול (ממוצע משוקלל)</div>'
      + mkTable('תקופה', [
        { label: 'חודש אחרון', key: 'avgY1',   dec: 2, isReturn: true },
        { label: '3 חודשים',   key: 'avgY3m',  dec: 2, isReturn: true },
        { label: '12 חודשים',  key: 'avgY12',  dec: 2, isReturn: true },
        { label: '3 שנים',     key: 'avgY3y',  dec: 2, isReturn: true },
        { label: '5 שנים',     key: 'avgY5yr', dec: 2, isReturn: true },
        ...feeRows,
      ]) + '</div>';

    // ── Section 3: Exposures
    const exposuresHtml = '<div class="sbcmp-section"><div class="sbcmp-section-head">חשיפות (ממוצע משוקלל)</div>'
      + mkTable('חשיפה', [
        { label: 'מניות', key: 'avgStock',  dec: 1 },
        { label: 'חו"ל',  key: 'avgAbroad', dec: 1 },
        { label: 'מט"ח',  key: 'avgFx',     dec: 1 },
      ]) + '</div>';

    const title = n === 2
      ? 'השוואה: ' + items[0].name + ' vs ' + items[1].name
      : 'השוואת ' + n + ' תיקים';
    document.getElementById('sb-compare-title').textContent = title;
    document.getElementById('sb-compare-content').innerHTML = valueSummaryHtml + tracksHtml + returnsHtml + exposuresHtml;
    state.sandbox.compareItems = items; // stored for share
  }

  function _sbOpenCompareDialogMulti(ids) {
    const list = _sbGetSavedPortfolios();
    const items = ids.map(id => {
      if (id === '__current__') return { name: state.sandbox.portfolioName || 'תיק נוכחי', portfolio: state.sandbox.portfolio };
      return list.find(p => p.id === id);
    }).filter(Boolean);
    if (items.length < 2) return;
    _sbCloseLoadDialog();
    _sbRenderCompare(items);
    const dlg = document.getElementById('sb-compare-dialog');
    if (dlg) { dlg.hidden = false; document.body.style.overflow = 'hidden'; history.pushState({ sbDialog: 'compare' }, ''); }
  }

  function _sbCloseCompareDialog() {
    const dlg = document.getElementById('sb-compare-dialog');
    if (dlg) { dlg.hidden = true; document.body.style.overflow = ''; }
  }

  let _sbComparePrintCalledAt = 0;
  let _sbComparePrintVisHandler = null;
  let _sbComparePrintCountdownInterval = null;
  const SB_COMPARE_PRINT_SAFETY_MS = 7000;

  function _sbCleanupComparePrintState() {
    if (!_sbComparePrintInProgress && !_sbComparePrintOriginalNodes) return; // already cleaned up
    _sbComparePrintInProgress = false;
    _sbComparePrintCalledAt = 0;
    document.body.classList.remove('sb-compare-printing');
    if (_sbComparePrintCleanupTimer) {
      clearTimeout(_sbComparePrintCleanupTimer);
      _sbComparePrintCleanupTimer = null;
    }
    if (_sbComparePrintCountdownInterval) {
      clearInterval(_sbComparePrintCountdownInterval);
      _sbComparePrintCountdownInterval = null;
    }
    if (_sbComparePrintVisHandler) {
      document.removeEventListener('visibilitychange', _sbComparePrintVisHandler);
      _sbComparePrintVisHandler = null;
    }
    if (_sbComparePrintRoot && _sbComparePrintRoot.parentNode) {
      _sbComparePrintRoot.parentNode.removeChild(_sbComparePrintRoot);
    }
    _sbComparePrintRoot = null;
    if (_sbComparePrintOriginalNodes) {
      document.body.replaceChildren(..._sbComparePrintOriginalNodes);
      _sbComparePrintOriginalNodes = null;
      window.scrollTo(0, _sbComparePrintScrollY || 0);
    }
  }

  // הדפסת השוואה מתוך המסמך הראשי. במובייל הדפסה מחלון חדש עלולה להיתקע
  // בשלב "יוצר תצוגה מקדימה", לכן יוצרים אזור הדפסה זמני בדף הנוכחי
  // ומדפיסים רק אותו באמצעות CSS ייעודי.
  //
  // חשוב: אין כאן החזרה אוטומטית על בסיס afterprint/matchMedia/
  // visibilitychange. נמצא (במובייל, "שמירה כ-PDF") שהתצוגה המקדימה
  // מציגה את התוכן הנכון, אבל השמירה בפועל קורית באופן א-סינכרוני
  // מאוחר יותר — אחרי שכל האותות האלה כבר יורים ומחזירים את הדף החי,
  // כך שה-PDF שנשמר בפועל תופס את הדף המוחזר (הישן) ולא את ההשוואה.
  // אין שום אות אמין שמבטיח שה"שמירה" הסתיימה. לכן המשתמש לוחץ בעצמו
  // על "חזרה לתיק" כשסיים — וזה גם מסתתר אוטומטית ב-@media print כדי
  // שלא יופיע בתוך ההדפסה עצמה. רשת ביטחון ארוכה (60 שניות) למקרה
  // שהמשתמש שוכח.
  function _sbPrintCompare() {
    const content = document.getElementById('sb-compare-content');
    if (!content) return;
    _ghTrackAnalytics('compare_print', {
      portfolio_count: (state.sandbox.compareItems || []).length || 0
    });
    const now = new Date();
    const dateStr = now.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const title = document.getElementById('sb-compare-title')?.textContent || 'השוואת תיקים';

    _sbComparePrintInProgress = true;
    _sbCleanupComparePrintState();
    _sbComparePrintInProgress = true;
    _sbCleanupPrintState();
    _sbComparePrintRoot = document.createElement('div');
    _sbComparePrintRoot.id = 'sb-compare-print-root';
    _sbComparePrintRoot.dir = 'rtl';
    _sbComparePrintRoot.style.display = 'none';
    _sbComparePrintRoot.innerHTML =
      '<div class="sb-compare-print-return-overlay">' +
        '<button type="button" id="sb-compare-print-return-btn" class="sb-compare-print-return-btn">← חזרה לתיק</button>' +
        '<div class="sb-compare-print-return-timer" id="sb-compare-print-return-timer"></div>' +
      '</div>' +
      '<div class="sb-print-report-header">' +
        '<div class="sb-print-logo">' + SB_PRINT_LOGO_HTML + '</div>' +
        '<div class="sb-print-portfolio-title">' + escapeHtml(title) + '</div>' +
        '<div class="sb-print-meta">הופק: ' + dateStr + '<br>רועי רומנו, מתכנן פיננסי וסוכן פנסיוני מורשה | 052-8089808</div>' +
      '</div>' +
      content.innerHTML +
      '<div class="sb-print-disclaimer">המידע נועד לספק תמונת מצב כללית והשוואתית בלבד ואינו מהווה ייעוץ השקעות, שיווק פנסיוני או תחליף לייעוץ אישי המותאם לצרכי הלקוח. הנתונים מבוססים על מקורות פומביים ועשויים להכיל טעויות או אי-דיוקים. אין לראות בתשואות העבר התחייבות לתשואות עתידיות. לפני קבלת החלטה פיננסית מומלץ להתייעץ עם בעל רישיון.</div>';
    _sbComparePrintScrollY = window.scrollY || 0;
    _sbComparePrintOriginalNodes = Array.from(document.body.childNodes);
    document.body.replaceChildren(_sbComparePrintRoot);
    document.body.classList.add('sb-compare-printing');
    document.getElementById('sb-compare-print-return-btn')?.addEventListener('click', _sbCleanupComparePrintState);
    void _sbComparePrintRoot.offsetHeight;

    // חשוב: forceReflow (offsetHeight) מבטיח רק שה-layout חושב מחדש,
    // לא שהמסך בפועל צויר (paint) — window.print() שנקרא מיד עלול
    // לתפוס את הפריים המצויר הקודם (הדף החי) אם הצביעה של ה-DOM
    // החדש עוד לא הושלמה. שני requestAnimationFrame רצופים הם הדרך
    // הסטנדרטית להבטיח שפריים אחד לפחות באמת צויר לפני שממשיכים.
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        _sbWaitForPrintAssets(_sbComparePrintRoot).then(function() {
          try {
            _sbComparePrintCalledAt = Date.now();
            window.print();

            // אות יחיד ובטוח: visibilitychange חוזר ל-visible רק אחרי
            // שכל ה-overlay של המערכת (כולל שמירת קובץ בפועל) נסגר.
            // ניסיון קודם להוסיף גם afterprint כ"קיצור דרך" למקרה ביטול
            // התברר כלא בטוח — התאוריה ש-document.hidden מבדיל בין
            // שמירה לביטול לא התאמתה בפועל, וזה גרם לשמירות אמיתיות
            // להיתפס מוקדם מדי (PDF שגוי) שוב. buffer קטן (700ms) כמרווח
            // ביטחון נוסף. מקרה ביטול נשאר תלוי בכפתור הידני / ברשת
            // הביטחון — פחות נוח, אבל לא שובר שמירות אמיתיות.
            _sbComparePrintVisHandler = function() {
              if (!document.hidden) setTimeout(_sbCleanupComparePrintState, 700);
            };
            document.addEventListener('visibilitychange', _sbComparePrintVisHandler);

            // רשת ביטחון: אחרי SB_COMPARE_PRINT_SAFETY_MS חוזרים לתיק אוטומטית.
            // פשרה מכוונת: שמירה איטית שלוקחת יותר מזה עלולה להיתפס שגוי, אבל
            // זה מקרה נדיר יחסית לעומת התסכול של המתנה ארוכה בכל ביטול. הכפתור
            // המרכזי + הטיימר הנגלה נותנים למשתמש גם יציאה מיידית וגם ודאות
            // שהדף יחזור מעצמו אם לא ילחץ.
            _sbComparePrintCleanupTimer = setTimeout(_sbCleanupComparePrintState, SB_COMPARE_PRINT_SAFETY_MS);
            const countdownEl = document.getElementById('sb-compare-print-return-timer');
            if (countdownEl) {
              const deadline = Date.now() + SB_COMPARE_PRINT_SAFETY_MS;
              const tick = () => {
                const secsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
                countdownEl.textContent = `חוזר אוטומטית בעוד ${secsLeft} שנ׳`;
              };
              tick();
              _sbComparePrintCountdownInterval = setInterval(tick, 250);
            }
          } catch (error) {
            console.warn('Compare print failed', error);
            _sbCleanupComparePrintState();
            showToast('לא הצלחנו לפתוח את חלון ההדפסה. נסה שוב.');
          }
        });
      });
    });
  }

  // Mini-encode a portfolio item to compact array (v2 format)
  function _sbMiniItem(it) {
    var r2 = function(n) { return Math.round((+n||0)*100)/100; };
    return [
      it.fundId, it.fundName, it.provider,
      it.trackId, it.trackLabel,
      it.categoryId, it.categoryLabel || '',
      r2(it.y1), r2(it.y12m), r2(it.y3), r2(it.y5), r2(it.y5yr),
      r2(it.stock), r2(it.abroad), r2(it.fx),
      Math.round((+it.dnCumulative||0)*10000)/10000,
      Math.round((+it.dnDeposit||0)*10000)/10000,
      it.investAmount||0, it.investMode||'amount', it.investPct||'',
      it.hidden ? 1 : 0, it.color || ''
    ];
  }
  // Expand v2 mini-array back to full portfolio item
  function _sbExpandMiniItem(a) {
    return {
      fundId: String(a[0]), fundName: a[1], provider: a[2],
      trackId: a[3], trackLabel: a[4],
      categoryId: a[5], categoryLabel: a[6]||a[5],
      y1: String(a[7]), y12m: String(a[8]), y3: String(a[9]),
      y5: String(a[10]), y5yr: String(a[11]),
      stock: String(a[12]), abroad: String(a[13]), fx: String(a[14]),
      dnCumulative: String(a[15]), dnDeposit: String(a[16]),
      investAmount: String(a[17]||0), investMode: a[18]||'amount', investPct: String(a[19]||''),
      hidden: !!a[20], color: a[21] || ''
    };
  }

  async function _sbShareCompareWhatsApp() {
    const titleEl = document.getElementById('sb-compare-title');
    const title   = titleEl ? titleEl.textContent : 'השוואת תיקים';
    const items   = state.sandbox.compareItems || [];
    let payload = null;
    let compareUrl = location.origin + location.pathname;
    if (items.length > 0) {
      try {
        const portfolios = items
          .filter(function(it) { return it && it.portfolio && it.portfolio.length; })
          .map(function(it) { return { n: it.name || '', p: it.portfolio.map(_sbMiniItem) }; });
        if (portfolios.length > 0) {
          payload = { v: 2, portfolios: portfolios };
          compareUrl = _sbHashCompareUrl(payload);
        }
      } catch(e) {}
    }
    const text = '📊 ' + title + ', נעשה במעבדה של GemelHub — '
              + 'המערכת להשוואת נתונים פיננסיים של רועי רומנו.\n'
              + 'לטעינת ההשוואה למעבדה שלך 👇\n';
    try {
      const sharedUrl = payload ? await _sbCreateSharedPortfolioLink('compare', payload) : '';
      _sbOpenWhatsAppShare(text, sharedUrl || await _sbShortenFallbackUrl(compareUrl));
      _ghTrackAnalytics('compare_share_whatsapp', {
        portfolio_count: items.length || 0,
        method: sharedUrl ? 'worker' : 'fallback'
      });
    } catch(e) {
      _sbOpenWhatsAppShare(text, await _sbShortenFallbackUrl(compareUrl));
      _ghTrackAnalytics('compare_share_whatsapp', {
        portfolio_count: items.length || 0,
        method: 'fallback'
      });
    }
  }

  function setupSandboxPortfolioDialogs() {
    document.getElementById('sb-save-dialog-close')?.addEventListener('click', _sbCloseSaveDialog);
    document.getElementById('sb-save-dialog-cancel')?.addEventListener('click', _sbCloseSaveDialog);
    document.getElementById('sb-save-dialog-submit')?.addEventListener('click', _sbDoSavePortfolio);
    document.getElementById('sb-save-mode-tabs')?.addEventListener('click', e => {
      const tab = e.target.closest('.sb-save-mode-tab');
      if (tab) _sbSetSaveMode(tab.dataset.saveMode);
    });
    document.getElementById('sb-load-dialog-close')?.addEventListener('click', _sbCloseLoadDialog);
    document.getElementById('sb-compare-dialog-close')?.addEventListener('click', _sbCloseCompareDialog);
    document.getElementById('sb-compare-print-btn')?.addEventListener('click', _sbPrintCompare);
    document.getElementById('sb-compare-share-btn')?.addEventListener('click', _sbShareCompareWhatsApp);
    document.getElementById('sb-save-dialog')?.addEventListener('click', e => { if (e.target === e.currentTarget) _sbCloseSaveDialog(); });
    document.getElementById('sb-load-dialog')?.addEventListener('click', e => { if (e.target === e.currentTarget) _sbCloseLoadDialog(); });
    document.getElementById('sb-compare-dialog')?.addEventListener('click', e => { if (e.target === e.currentTarget) _sbCloseCompareDialog(); });
    // Enter key in save dialog
    document.getElementById('sb-save-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') _sbDoSavePortfolio(); });

    // Android back button: close open dialog instead of navigating away
    window.addEventListener('popstate', function() {
      const compareDialog = document.getElementById('sb-compare-dialog');
      const saveDialog    = document.getElementById('sb-save-dialog');
      const loadDialog    = document.getElementById('sb-load-dialog');
      const leadsModal    = document.getElementById('modal-overlay');
      if (compareDialog && !compareDialog.hidden)                        { _sbCloseCompareDialog(); return; }
      if (saveDialog    && !saveDialog.hidden)                           { _sbCloseSaveDialog();    return; }
      if (loadDialog    && !loadDialog.hidden)                           { _sbCloseLoadDialog();    return; }
      if (leadsModal    && leadsModal.style.display !== 'none')          { leadsModal.style.display = 'none'; return; }
    });
  }
  // ────────────────────────────────────────────────────────────────────────────

  function _sbInitValueBarDrag() {
    const bar = document.getElementById('sandbox-value-bar');
    if (!bar || bar._dragInited) return;
    bar._dragInited = true;
    // position: start centered at bottom
    const setDefault = () => {
      bar.style.left   = (window.innerWidth / 2 - bar.offsetWidth / 2) + 'px';
      bar.style.bottom = '28px';
      bar.style.top    = '';
      bar.style.transform = '';
    };
    bar.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      bar.classList.add('is-dragging');
      const rect = bar.getBoundingClientRect();
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;
      const onMove = mv => {
        let x = mv.clientX - offX;
        let y = mv.clientY - offY;
        x = Math.max(0, Math.min(window.innerWidth  - bar.offsetWidth,  x));
        y = Math.max(0, Math.min(window.innerHeight - bar.offsetHeight, y));
        bar.style.left   = x + 'px';
        bar.style.top    = y + 'px';
        bar.style.bottom = 'auto';
        bar.style.transform = '';
      };
      const onUp = () => {
        bar.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
    // reset position if becomes visible without explicit position
    bar.addEventListener('transitionend', () => {
      if (bar.classList.contains('is-visible') && !bar.style.top) setDefault();
    });
    window.addEventListener('resize', () => {
      if (!bar.classList.contains('is-visible')) return;
      const x = parseFloat(bar.style.left);
      if (!isNaN(x)) bar.style.left = Math.min(x, window.innerWidth - bar.offsetWidth) + 'px';
    });
  }

  // Chronological order of all 4 return periods (index = chronological rank, right→left in RTL)
  const _sbSparkPos = 'M2,82 C4,74 5,69 8,70 C11,62 14,60 17,58 C20,55 23,54 26,50 C29,47 32,50 35,45 C38,40 41,38 44,35 C46,39 48,42 50,37 C52,31 55,29 57,32 C60,24 63,23 65,25 C68,19 71,17 73,21 C76,15 79,18 81,14 C83,18 85,20 87,16 C90,12 93,16 96,11 C98,13 99,12 100,10';
  const _sbSparkNeg = 'M2,18 C4,26 5,31 8,30 C11,38 14,40 17,42 C20,45 23,46 26,50 C29,53 32,50 35,55 C38,60 41,62 44,65 C46,61 48,58 50,63 C52,69 55,71 57,68 C60,76 63,77 65,75 C68,81 71,83 73,79 C76,85 79,82 81,86 C83,82 85,80 87,84 C90,88 93,84 96,89 C98,87 99,88 100,90';

  const _sbReturnPeriods = [
    { key: 'ytd',  label: 'מתחילת שנה' },
    { key: 'y12m', label: '12 חודשים אחרונים' },
    { key: 'y3',   label: '3 שנים' },
    { key: 'y5',   label: '5 שנים' }
  ];

  function _sbBuildReturnsHero(title, items) {
    const weights = _sbWeights(items);
    const vals = {
      ytd:  _sbWeightedVal(items, weights, it => it.y3),
      y12m: _sbWeightedVal(items, weights, it => it.y12m),
      y3:   _sbWeightedVal(items, weights, it => it.y5),
      y5:   _sbWeightedVal(items, weights, it => it.y5yr)
    };
    const activeKey = vals.y12m != null ? 'y12m' : (vals.y3 != null ? 'y3' : 'ytd');
    const mainVal = vals[activeKey];
    const mainLabel = _sbReturnPeriods.find(p => p.key === activeKey).label;
    const isPos = mainVal != null && parseFloat(mainVal) >= 0;
    const sparkPath = isPos ? _sbSparkPos : _sbSparkNeg;
    const areaPath = `${sparkPath} L100,96 L2,96 Z`;
    const miniPeriods = _sbReturnPeriods.filter(p => p.key !== activeKey);
    const miniHtml = miniPeriods.map(p => {
      const v = vals[p.key];
      return `<button type="button" class="sb-returns-mini" data-returns-period="${p.key}">
        <span>${p.label}</span>
        <strong class="${v != null && parseFloat(v) >= 0 ? 'pos' : 'neg'}">${v != null ? _sbFmtPct(v) : '—'}</strong>
      </button>`;
    }).join('');
    const valsJson = _sbEscapeAttr(JSON.stringify(vals));
    return `<div class="sb-returns-hero ${isPos ? 'is-positive' : 'is-negative'}" data-returns-hero data-returns-active="${activeKey}" data-returns-vals="${valsJson}">
      <div class="sb-returns-hero-bg" aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sbHeroLineGrad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stop-color="currentColor" stop-opacity=".18"></stop>
              <stop offset="100%" stop-color="currentColor" stop-opacity=".78"></stop>
            </linearGradient>
            <linearGradient id="sbHeroAreaGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="currentColor" stop-opacity=".16"></stop>
              <stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop>
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#sbHeroAreaGrad)"></path>
          <path d="${sparkPath}" fill="none" stroke="url(#sbHeroLineGrad)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </div>
      <div class="sb-returns-hero-head">
        <span class="sb-returns-hero-kicker">${title}</span>
        <span class="sb-returns-trend" aria-hidden="true">${isPos ? '↗' : '↘'}</span>
      </div>
      <div class="sb-returns-main">
        <span class="sb-returns-main-label" data-returns-main-label>${mainLabel}</span>
        <span class="sb-returns-main-value" data-returns-main-value>${mainVal != null ? _sbFmtPct(mainVal) : '—'}</span>
      </div>
      <div class="sb-returns-mini-row" data-returns-mini-row>
        ${miniHtml}
      </div>
    </div>`;
  }

  function _sbAttachReturnsHeroEvents(root) {
    root.querySelectorAll('[data-returns-hero]').forEach(hero => {
      if (hero.dataset.returnsHeroBound === '1') return;
      hero.dataset.returnsHeroBound = '1';
      hero.addEventListener('click', e => {
        const btn = e.target.closest('[data-returns-period]');
        if (!btn) return;
        const newKey = btn.dataset.returnsPeriod;
        const vals = JSON.parse(hero.dataset.returnsVals || '{}');
        const newVal = vals[newKey];
        const newLabel = _sbReturnPeriods.find(p => p.key === newKey).label;
        const isPos = newVal != null && parseFloat(newVal) >= 0;
        hero.dataset.returnsActive = newKey;
        hero.classList.toggle('is-positive', isPos);
        hero.classList.toggle('is-negative', !isPos);
        const mainLabel = hero.querySelector('[data-returns-main-label]');
        const mainValue = hero.querySelector('[data-returns-main-value]');
        const trend = hero.querySelector('.sb-returns-trend');
        if (mainLabel) mainLabel.textContent = newLabel;
        if (mainValue) mainValue.textContent = newVal != null ? _sbFmtPct(newVal) : '—';
        if (trend) trend.textContent = isPos ? '↗' : '↘';
        const newSparkPath = isPos ? _sbSparkPos : _sbSparkNeg;
        const newAreaPath = newSparkPath + ' L100,96 L2,96 Z';
        const svgPaths = hero.querySelectorAll('.sb-returns-hero-bg svg path');
        if (svgPaths[0]) svgPaths[0].setAttribute('d', newAreaPath);
        if (svgPaths[1]) svgPaths[1].setAttribute('d', newSparkPath);
        const miniRow = hero.querySelector('[data-returns-mini-row]');
        if (miniRow) {
          const miniPeriods = _sbReturnPeriods.filter(p => p.key !== newKey);
          miniRow.innerHTML = miniPeriods.map(p => {
            const v = vals[p.key];
            return `<button type="button" class="sb-returns-mini" data-returns-period="${p.key}">
              <span>${p.label}</span>
              <strong class="${v != null && parseFloat(v) >= 0 ? 'pos' : 'neg'}">${v != null ? _sbFmtPct(v) : '—'}</strong>
            </button>`;
          }).join('');
        }
      });
    });
  }

  function _sbAllocationBar(title, visual, segments) {
    const activeSegments = segments.filter(segment => segment.pct > 0);
    return `<div class="sb-allocation-card sb-allocation-${visual}">
      <div class="sb-allocation-card-head">
        <h4>${title}</h4>
      </div>
      <div class="sb-allocation-stack">
        ${activeSegments.map(segment => {
          const pct = Math.max(1, Math.min(100, segment.pct));
          return `<div class="sb-allocation-row ${segment.bg ? `sb-allocation-row-${segment.bg}` : ''}" style="--allocation-pct:${pct.toFixed(1)}%;">
          <div class="sb-allocation-track" aria-hidden="true">
            ${segment.bg ? `<i class="sb-allocation-bg-icon sb-allocation-bg-${segment.bg}"></i>` : ''}
            <span style="width:${pct.toFixed(1)}%;background:${segment.color};"></span>
          </div>
          <div class="sb-allocation-text">
            <strong>${segment.pct.toFixed(0)}%</strong>
            <span>${segment.label}</span>
          </div>
        </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function _sbDistributionDonut(title, centerLabel, segments, variant = '') {
    const activeSegments = segments.filter(segment => segment.pct > 0);
    if (!activeSegments.length) return '';
    const hasAmounts = activeSegments.some(segment => segment.amount != null);
    const R = 54, r = 31, cx = 70, cy = 70;
    let angle = -Math.PI / 2;
    const paths = activeSegments.map((segment, index) => {
      const sweep = Math.min(segment.pct / 100, .9999) * Math.PI * 2;
      const end = angle + sweep;
      const mid = angle + sweep / 2;
      const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
      const x2 = cx + R * Math.cos(end), y2 = cy + R * Math.sin(end);
      const xi1 = cx + r * Math.cos(angle), yi1 = cy + r * Math.sin(angle);
      const xi2 = cx + r * Math.cos(end), yi2 = cy + r * Math.sin(end);
      const largeArc = sweep > Math.PI ? 1 : 0;
      angle = end;
      const amountLabel = segment.amount != null ? formatCurrencyILS(segment.amount) : '';
      const labelRadius = (R + r) / 2;
      const labelX = cx + labelRadius * Math.cos(mid);
      const labelY = cy + labelRadius * Math.sin(mid);
      const labelText = segment.pct >= 7 ? `<text class="sb-distribution-slice-label" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}">${segment.pct.toFixed(0)}%</text>` : '';
      const aria = `${segment.label} ${segment.pct.toFixed(0)}%${amountLabel ? ' ' + amountLabel : ''}`;
      return `<g class="sb-distribution-seg-wrap" data-donut-index="${index}">
        <path class="sb-distribution-seg" tabindex="0" role="button" aria-label="${_sbEscapeAttr(aria)}" d="M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${largeArc},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${xi2.toFixed(2)},${yi2.toFixed(2)} A${r},${r} 0 ${largeArc},0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z"
          fill="${segment.color}" data-donut-index="${index}" data-label="${_sbEscapeAttr(segment.label)}" data-pct="${segment.pct.toFixed(0)}%" data-amount="${_sbEscapeAttr(amountLabel)}"></path>
        ${labelText}
      </g>`;
    }).join('');
    return `<section class="sb-distribution-donut-card ${variant ? `sb-distribution-${variant}` : ''}" aria-label="${title}">
      <h3>${title}</h3>
      <div class="sb-distribution-donut-wrap">
        <div class="sb-distribution-donut-shell">
          <svg class="sb-distribution-donut" viewBox="0 0 140 140" role="img" aria-label="${title}">
            <g>${paths}</g>
            <circle class="sb-distribution-hole" cx="${cx}" cy="${cy}" r="${r - 1}"></circle>
          </svg>
          <div class="sb-distribution-center">
            <strong data-donut-center-label>${activeSegments.length}</strong>
            <span data-donut-center-pct>${centerLabel}</span>
            <em data-donut-center-amount></em>
          </div>
        </div>
        <div class="sb-distribution-legend">
          ${activeSegments.map((segment, index) => {
            const amtRtl = segment.amount != null ? `₪ ${Math.round(segment.amount).toLocaleString('he-IL')}` : '';
            return `<button type="button" class="sb-distribution-legend-row" data-donut-index="${index}" data-label="${_sbEscapeAttr(segment.label)}" data-pct="${segment.pct.toFixed(0)}%" data-amount="${_sbEscapeAttr(amtRtl)}">
            <span class="sb-product-dot" style="background:${segment.color}"></span>
            <strong>${segment.label}</strong>
            <span class="sb-distribution-legend-value">${segment.pct.toFixed(0)}%${hasAmounts && segment.amount != null ? `<em>${amtRtl}</em>` : ''}</span>
          </button>`;
          }).join('')}
        </div>
      </div>
    </section>`;
  }

  function _sbManagerDonut(segments) {
    return _sbDistributionDonut('פיזור מנהלי השקעות', 'מנהלים', segments, 'managers');
  }

  function _sbProductDonut(segments) {
    return _sbDistributionDonut('מבנה התיק', 'מוצרים', segments, 'products');
  }

  function _sbDashboardHtml(portfolio) {
    const weights = _sbWeights(portfolio);
    const wY1    = _sbWeightedVal(portfolio, weights, it => it.y1);
    const wY3    = _sbWeightedVal(portfolio, weights, it => it.y3);
    const wY5    = _sbWeightedVal(portfolio, weights, it => it.y5);
    const wY12m  = _sbWeightedVal(portfolio, weights, it => it.y12m);
    const wY5yr  = _sbWeightedVal(portfolio, weights, it => it.y5yr);
    const wDn    = _sbWeightedVal(portfolio, weights, it => it.dnCumulative);
    const wStock = _sbWeightedVal(portfolio, weights, it => it.stock);
    const wAbroad= _sbWeightedVal(portfolio, weights, it => it.abroad);
    const wFx    = _sbWeightedVal(portfolio, weights, it => it.fx);

    // total value
    const hasAmounts = portfolio.some(it => it.investMode === 'amount' && it.investAmount !== '');
    const totalValue = hasAmounts
      ? portfolio.filter(it => it.investMode === 'amount').reduce((s, it) => s + (parseFloat(String(it.investAmount).replace(/,/g, '')) || 0), 0)
      : null;
    const allInvestedAsAmount = portfolio.length > 0 && portfolio.every(item => item.investMode === 'amount');
    const categoryCount = new Set(portfolio.map(item => item.categoryId)).size;
    const percentTotal = portfolio
      .filter(item => item.investMode === 'percent')
      .reduce((sum, item) => sum + (parseFloat(String(item.investPct).replace(/,/g, '')) || 0), 0);
    const singleCategoryAsFullPercent = portfolio.length > 0
      && categoryCount === 1
      && portfolio.every(item => item.investMode === 'percent')
      && Math.abs(percentTotal - 100) < 0.01;
    const canShowPortfolioExposures = (allInvestedAsAmount && totalValue > 0) || singleCategoryAsFullPercent;

    // Allocation bars: מניות/אג"ח, חו"ל/ישראל, מט"ח/שקל
    const stockPct  = wStock  != null ? Math.min(100, Math.max(0, wStock))  : null;
    const abroadPct = wAbroad != null ? Math.min(100, Math.max(0, wAbroad)) : null;
    const fxPct     = wFx     != null ? Math.min(100, Math.max(0, wFx))     : null;
    const mkSegs = stockPct != null
      ? [{ color: '#0f766e', pct: stockPct, label: 'מניות' }, { color: '#c9b772', pct: 100 - stockPct, label: 'אג"ח / אחר' }]
      : [{ color: '#e2e8f0', pct: 100, label: 'אין נתונים' }];
    const geoSegs = abroadPct != null
      ? [{ color: '#566a7c', pct: abroadPct, label: 'חו"ל', bg: 'world' }, { color: '#0c2134', pct: 100 - abroadPct, label: 'ישראל', bg: 'israel' }]
      : [{ color: '#e2e8f0', pct: 100, label: 'אין נתונים' }];
    const fxSegs = fxPct != null
      ? [{ color: '#c9b772', pct: fxPct, label: 'מט"ח', bg: 'fx' }, { color: '#6d7480', pct: 100 - fxPct, label: 'שקל', bg: 'shekel' }]
      : [{ color: '#e2e8f0', pct: 100, label: 'אין נתונים' }];

    // Providers — deduplicated and weighted by the active portfolio weighting method
    const provMap = {};
    const provAmountMap = {};
    portfolio.forEach((item, i) => {
      const name = item.provider || 'לא ידוע';
      provMap[name] = (provMap[name] || 0) + weights[i];
      const amount = item.investMode === 'amount' ? (parseFloat(String(item.investAmount).replace(/,/g, '')) || 0) : 0;
      provAmountMap[name] = (provAmountMap[name] || 0) + amount;
    });
    const provSegs = Object.entries(provMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, w]) => ({
        color: providerColor(name),
        pct: w * 100,
        label: name,
        amount: totalValue > 0 ? (provAmountMap[name] || 0) : null
      }));

    // Product categories
    const catMap = {};
    const catAmountMap = {};
    portfolio.forEach((it, i) => {
      catMap[it.categoryId] = (catMap[it.categoryId] || 0) + weights[i];
      const amt = it.investMode === 'amount' ? (parseFloat(String(it.investAmount).replace(/,/g, '')) || 0) : 0;
      catAmountMap[it.categoryId] = (catAmountMap[it.categoryId] || 0) + amt;
    });
    const catSegs = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([catId, w]) => {
        const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId) || { label: catId, color: '#94a3b8' };
        return { color: cat.color, pct: w * 100, label: cat.label, amount: totalValue > 0 ? (catAmountMap[catId] || 0) : null };
      });

    _sbUpdateValueBar(portfolio, totalValue, catMap);
    const returnsHeroes = allInvestedAsAmount
      ? _sbBuildReturnsHero('תשואות עבר מצטברות משוקללות לכל התיק', portfolio)
      : Object.keys(portfolio.reduce((acc, item) => {
          if (!acc[item.categoryId]) acc[item.categoryId] = [];
          acc[item.categoryId].push(item);
          return acc;
        }, {}))
        .sort((a, b) => CONFIG.PRODUCT_CATEGORIES.map(c => c.id).indexOf(a) - CONFIG.PRODUCT_CATEGORIES.map(c => c.id).indexOf(b))
        .map(catId => {
          const items = portfolio.filter(item => item.categoryId === catId);
          return _sbBuildReturnsHero(`תשואות עבר - ${_sbGetCategoryMeta(catId).label}`, items);
        }).join('');
    return `<div class="sb-dashboard">
      <div class="sb-returns-hero-list">${returnsHeroes}</div>
      <div class="sb-dn-card">
        <div class="sb-dn-label">ד"נ מצבירה משוקלל</div>
        <div class="sb-dn-value ${wDn != null && parseFloat(wDn) >= 0 ? 'pos' : 'neg'}">${wDn != null ? _sbFmtPct(wDn) : '—'}</div>
      </div>
      ${canShowPortfolioExposures ? `<div class="sb-allocation-section">
        ${_sbAllocationBar('חשיפה מנייתית', 'stock', mkSegs)}
        ${_sbAllocationBar('חשיפה גיאוגרפית', 'geo', geoSegs)}
        ${_sbAllocationBar('מטבע', 'currency', fxSegs)}
      </div>
      <div class="sb-distribution-section">
        ${_sbManagerDonut(provSegs)}
        ${_sbProductDonut(catSegs)}
      </div>` : ''}
    </div>`;
  }

  function _sbAttachDistributionDonutEvents(root) {
    root.querySelectorAll('.sb-distribution-donut-card').forEach(card => {
      if (card.dataset.donutBound === '1') return;
      card.dataset.donutBound = '1';
      const shell = card.querySelector('.sb-distribution-donut-shell');
      const centerLabel = card.querySelector('[data-donut-center-label]');
      const centerPct = card.querySelector('[data-donut-center-pct]');
      const centerAmount = card.querySelector('[data-donut-center-amount]');
      const defaultLabel = centerLabel?.textContent || '';
      const defaultPct = centerPct?.textContent || '';
      const defaultAmount = centerAmount?.textContent || '';
      const segments = [...card.querySelectorAll('.sb-distribution-seg')];
      const segmentWraps = [...card.querySelectorAll('.sb-distribution-seg-wrap')];
      const rows = [...card.querySelectorAll('.sb-distribution-legend-row')];

      const setActive = (index) => {
        const seg = segments.find(item => item.dataset.donutIndex === String(index));
        const row = rows.find(item => item.dataset.donutIndex === String(index));
        if (!seg || !row || !shell) return;
        shell.classList.add('has-active');
        segments.forEach(item => item.classList.toggle('is-active', item === seg));
        segmentWraps.forEach(item => item.classList.toggle('is-active', item.dataset.donutIndex === String(index)));
        rows.forEach(item => item.classList.toggle('is-active', item === row));
        if (centerLabel) centerLabel.textContent = row.dataset.label || '';
        if (centerPct) centerPct.textContent = row.dataset.pct || '';
        if (centerAmount) centerAmount.textContent = row.dataset.amount || '';
      };
      const clearActive = () => {
        shell?.classList.remove('has-active');
        segments.forEach(item => item.classList.remove('is-active'));
        segmentWraps.forEach(item => item.classList.remove('is-active'));
        rows.forEach(item => item.classList.remove('is-active'));
        if (centerLabel) centerLabel.textContent = defaultLabel;
        if (centerPct) centerPct.textContent = defaultPct;
        if (centerAmount) centerAmount.textContent = defaultAmount;
      };

      segments.forEach(seg => {
        seg.addEventListener('mouseenter', () => setActive(seg.dataset.donutIndex));
        seg.addEventListener('focus', () => setActive(seg.dataset.donutIndex));
        seg.addEventListener('click', () => setActive(seg.dataset.donutIndex));
        seg.addEventListener('touchstart', () => setActive(seg.dataset.donutIndex), { passive: true });
        seg.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setActive(seg.dataset.donutIndex);
          }
        });
        seg.addEventListener('mouseleave', clearActive);
      });
      rows.forEach(row => {
        row.addEventListener('mouseenter', () => setActive(row.dataset.donutIndex));
        row.addEventListener('focus', () => setActive(row.dataset.donutIndex));
        row.addEventListener('click', () => setActive(row.dataset.donutIndex));
        row.addEventListener('mouseleave', clearActive);
      });
      card.addEventListener('mouseleave', clearActive);
    });
  }

  function _sbAttachEvents(section) {
    // Add more button
    section.querySelector('#sandbox-add-more-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      _sbSyncVisibleInputsToState();
      saveSandboxPortfolio();
      const existing = document.getElementById('sb-cat-picker');
      if (existing) { existing.remove(); return; }
      const cats = CONFIG.PRODUCT_CATEGORIES.filter(c => !REMOVED_CATEGORY_IDS.has(c.id));
      const popup = document.createElement('div');
      popup.id = 'sb-cat-picker';
      popup.className = 'sb-cat-picker';
      popup.innerHTML = cats.map(c =>
        '<button type="button" class="sb-cat-pick-btn" data-cat="' + c.id + '">'
        + '<span class="sb-cat-pick-icon">' + (c.icon || '📊') + '</span>'
        + '<span class="sb-cat-pick-label">' + c.label + '</span>'
        + '</button>'
      ).join('');
      const btn = e.currentTarget;
      const rect = btn.getBoundingClientRect();
      popup.style.position = 'fixed';
      popup.style.top  = (rect.bottom + 6) + 'px';
      popup.style.right = (window.innerWidth - rect.right) + 'px';
      document.body.appendChild(popup);
      popup.querySelectorAll('.sb-cat-pick-btn').forEach(pb => {
        pb.addEventListener('click', () => { popup.remove(); switchCategory(pb.dataset.cat); });
      });
      const _close = (ev) => {
        if (!popup.contains(ev.target) && ev.target !== btn) {
          popup.remove();
          document.removeEventListener('click', _close);
        }
      };
      setTimeout(() => document.addEventListener('click', _close), 0);
    });

    section.querySelector('#sandbox-return-fields-btn')?.addEventListener('click', event => {
      event.stopPropagation();
      _sbSyncVisibleInputsToState();
      state.sandbox.returnsMenuOpen = !state.sandbox.returnsMenuOpen;
      renderSandboxPage();
    });

    section.querySelectorAll('[data-sandbox-return-field]').forEach(input => {
      input.addEventListener('change', () => {
        const fieldId = input.dataset.sandboxReturnField;
        const selected = new Set(state.sandbox.selectedReturnFields);
        if (input.checked) {
          if (selected.size >= SB_MAX_RETURN_FIELDS) {
            input.checked = false;
            showToast(`ניתן להציג עד ${SB_MAX_RETURN_FIELDS} עמודות תשואה`);
            return;
          }
          selected.add(fieldId);
        } else {
          selected.delete(fieldId);
        }
        state.sandbox.selectedReturnFields = _sbNormalizeReturnFields([...selected]);
        _sbSaveReturnFields();
        _sbSyncVisibleInputsToState();
        renderSandboxPage();
      });
    });

    section.querySelectorAll('.sandbox-track-link').forEach(btn => {
      btn.addEventListener('click', () => {
        _sbSyncVisibleInputsToState();
        saveSandboxPortfolio();
        navigateToTrackTable(btn.dataset.sandboxTrackCat, btn.dataset.sandboxTrackId);
      });
    });

    section.querySelectorAll('[data-sandbox-add-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const catId = btn.dataset.sandboxAddCat;
        if (catId && !REMOVED_CATEGORY_IDS.has(catId)) {
          _sbSyncVisibleInputsToState();
          saveSandboxPortfolio();
          switchCategory(catId);
        }
      });
    });

    // Save / Load portfolio buttons
    section.querySelector('#sandbox-save-portfolio-btn')?.addEventListener('click', _sbOpenSaveDialog);
    section.querySelector('#sandbox-load-portfolio-btn')?.addEventListener('click', _sbOpenLoadDialog);
    section.querySelector('#sandbox-print-btn')?.addEventListener('click', _sbPrintSummary);
    section.querySelector('#sandbox-share-btn')?.addEventListener('click', _sbSharePortfolio);

    // Clear portfolio button
    section.querySelector('#sandbox-clear-portfolio-btn')?.addEventListener('click', () => {
      if (!confirm('לנקות את התיק מהמסך?\n\nהתיק השמור לא יימחק — ניתן לטעון אותו שוב דרך כפתור "טען תיק".')) return;
      _sbDiscardAutoSavedDraft();
      state.sandbox.portfolio = [];
      state.sandbox.portfolioName = '';
      _sbSetDirty(false);
      _sbSetAutoSaveId(null);
      _sbHideValueBar();
      saveSandboxPortfolio();
      // uncheck all checkboxes in tables
      document.querySelectorAll('.sandbox-check.is-in-portfolio').forEach(cb => {
        cb.checked = false;
        cb.classList.remove('is-in-portfolio');
      });
      renderSandboxPage();
    });

    // Remove individual item
    section.querySelectorAll('.sandbox-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.portfolioIdx, 10);
        const itemFromKey = _sbFindPortfolioItemFromElement(btn);
        const resolvedIdx = itemFromKey ? state.sandbox.portfolio.indexOf(itemFromKey) : idx;
        const removed = resolvedIdx >= 0 ? state.sandbox.portfolio.splice(resolvedIdx, 1)[0] : null;
        if (removed) {
          const cb = document.querySelector(`.sandbox-check[data-fundid="${removed.fundId}"][data-trackid="${removed.trackId}"][data-categoryid="${removed.categoryId}"]`);
          if (cb) { cb.checked = false; cb.classList.remove('is-in-portfolio'); }
          _sbMarkPortfolioModified();
        }
        // Emptying the screen ends this portfolio's identity — otherwise the stale
        // name/autoSaveId would leak into the next portfolio the user builds and
        // corrupt the old saved entry on the next auto-persist.
        if (state.sandbox.portfolio.length === 0) {
          state.sandbox.portfolioName = '';
          localStorage.removeItem(SANDBOX_NAME_KEY);
          _sbSetDirty(false);
          _sbSetAutoSaveId(null);
        }
        saveSandboxPortfolio();
        renderSandboxPage();
        if (state.sandbox.portfolio.length === 0) _sbHideValueBar();
      });
    });

    // Hide/show individual item (simulate portfolio without this track)
    section.querySelectorAll('.sandbox-hide-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = _sbFindPortfolioItemFromElement(btn);
        if (!item) return;
        item.hidden = !item.hidden;
        saveSandboxPortfolio();
        renderSandboxPage();
      });
    });

    // category invest mode toggle
    section.querySelectorAll('[data-sandbox-cat-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        _sbSyncVisibleInputsToState();
        const mode = btn.dataset.mode === 'percent' ? 'percent' : 'amount';
        const catId = btn.dataset.sandboxCatMode;
        state.sandbox.portfolio.forEach(item => {
          if (item.categoryId === catId) item.investMode = mode;
        });
        saveSandboxPortfolio();
        renderSandboxPage();
      });
    });

    // fee inputs — save on every keystroke and on blur
    section.querySelectorAll('.sandbox-fee-input').forEach(input => {
      const _saveFee = () => {
        const field = input.dataset.field;
        const item = _sbFindPortfolioItemFromElement(input);
        if (!item) return;
        if (field === 'dnCumulative') item.dnCumulative = input.value;
        else if (field === 'dnDeposit') item.dnDeposit = input.value;
        _sbMarkPortfolioModified();
        saveSandboxPortfolio();
        _sbRefreshWeightedRows(section);
      };
      input.addEventListener('input', _saveFee);
      input.addEventListener('change', _saveFee);
    });

    // invest inputs — comma formatting on input, save clean value on blur
    section.querySelectorAll('.sandbox-invest-input').forEach(input => {
      input.addEventListener('input', () => {
        const oldValue = input.value;
        const oldSelStart = input.selectionStart;
        // Count real digits (ignoring thousands separators) before the caret, so the caret can be
        // restored to the same digit after reformatting — not the same character index, which shifts
        // whenever a comma is inserted/removed and previously caused digits typed afterwards to land
        // in the wrong slot (e.g. typing 150342 landing as 150423).
        const digitsBeforeCaret = oldValue.slice(0, oldSelStart).replace(/[^\d.]/g, '').length;
        const raw = oldValue.replace(/,/g, '').replace(/[^\d.]/g, '');
        if (raw === '' || isNaN(Number(raw))) {
          // still save empty
          const item = _sbFindPortfolioItemFromElement(input);
          if (item) {
            if (item.investMode === 'percent') item.investPct = '';
            else item.investAmount = '';
            _sbMarkPortfolioModified();
            saveSandboxPortfolio();
            _sbRefreshWeightedRows(section);
          }
          return;
        }
        const formatted = Number(raw).toLocaleString('he-IL');
        input.value = formatted;
        let seen = 0, newPos = formatted.length;
        for (let i = 0; i < formatted.length; i++) {
          if (formatted[i] !== ',') seen++;
          if (seen === digitsBeforeCaret) { newPos = i + 1; break; }
        }
        try { input.setSelectionRange(newPos, newPos); } catch(e) {}
        // live save
        const item = _sbFindPortfolioItemFromElement(input);
        if (item) {
          if (item.investMode === 'percent') item.investPct = raw;
          else item.investAmount = raw;
          _sbMarkPortfolioModified();
          saveSandboxPortfolio();
          _sbRefreshWeightedRows(section);
        }
      });
      input.addEventListener('change', () => {
        const item = _sbFindPortfolioItemFromElement(input);
        if (!item) return;
        const clean = input.value.replace(/,/g, '');
        if (item.investMode === 'percent') item.investPct = clean;
        else item.investAmount = clean;
        saveSandboxPortfolio();
        _sbRefreshWeightedRows(section);
      });
    });

    // Interactive SVG donuts — segment hover + legend sync
    _sbAttachDistributionDonutEvents(section);
    _sbAttachReturnsHeroEvents(section);

    section.querySelectorAll('.sb-chart-card').forEach(card => {
      const svg = card.querySelector('.sb-donut-svg');
      if (!svg) return;
      const centerText = svg.querySelector('.sb-center-text');
      const originalCenter = svg.dataset.center || (centerText ? centerText.textContent : '');
      const segs = [...svg.querySelectorAll('.sb-seg')];
      const legendRows = [...card.querySelectorAll('.sb-legend-row')];

      const highlightSeg = (i) => {
        segs.forEach((s, j) => {
          s.style.transform = j === i ? 'scale(1.08)' : 'scale(1)';
          s.style.filter    = j === i ? 'brightness(1.15) drop-shadow(0 2px 6px rgba(0,0,0,.25))' : 'brightness(.88)';
        });
        if (centerText && segs[i]) centerText.textContent = segs[i].dataset.pct + '%';
        if (legendRows[i]) { legendRows[i].style.fontWeight = '800'; legendRows[i].style.background = 'rgba(99,102,241,.09)'; legendRows[i].style.borderRadius = '4px'; }
      };
      const resetSeg = () => {
        segs.forEach(s => { s.style.transform = ''; s.style.filter = ''; });
        if (centerText) centerText.textContent = originalCenter;
        legendRows.forEach(r => { r.style.fontWeight = ''; r.style.background = ''; });
      };

      segs.forEach((seg, i) => {
        seg.addEventListener('mouseenter', () => highlightSeg(i));
        seg.addEventListener('mouseleave', resetSeg);
      });
      legendRows.forEach((row, i) => {
        row.style.cursor = 'pointer';
        row.addEventListener('mouseenter', () => highlightSeg(i));
        row.addEventListener('mouseleave', resetSeg);
      });
    });

    // Tab key navigation between invest inputs
    const investInputs = [...section.querySelectorAll('.sandbox-invest-input')];
    investInputs.forEach((input, i) => {
      input.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        // save current value
        const item = _sbFindPortfolioItemFromElement(input);
        if (item) {
          const clean = input.value.replace(/,/g, '');
          if (item.investMode === 'percent') item.investPct = clean;
          else item.investAmount = clean;
          saveSandboxPortfolio();
          _sbRefreshWeightedRows(section);
        }
        // move to next (or first if at end)
        const next = investInputs[(i + 1) % investInputs.length];
        if (next) { next.focus(); next.select(); }
      });
    });
  }

  // Refresh only the weighted-summary rows + dashboard section without full re-render
  function _sbRefreshWeightedRows(section) {
    const portfolio = state.sandbox.portfolio;
    // Update per-category weighted rows (in tfoot)
    const grouped = {};
    portfolio.forEach(item => {
      if (!grouped[item.categoryId]) grouped[item.categoryId] = [];
      grouped[item.categoryId].push(item);
    });
    section.querySelectorAll('.sandbox-weighted-row').forEach(row => {
      const catBlock = row.closest('.sandbox-cat-block');
      if (!catBlock) return;
      const catId = catBlock.dataset.sandboxCatId;
      if (!catId) return;
      const items = grouped[catId] || [];
      const weights = _sbWeights(items);
      const wY1    = _sbWeightedVal(items, weights, it => it.y1);
      const wY3    = _sbWeightedVal(items, weights, it => it.y3);
      const wY5    = _sbWeightedVal(items, weights, it => it.y5);
      const wStock = _sbWeightedVal(items, weights, it => it.stock);
      const wAbroad= _sbWeightedVal(items, weights, it => it.abroad);
      const wFx    = _sbWeightedVal(items, weights, it => it.fx);
      const wDn    = _sbWeightedVal(items, weights, it => it.dnCumulative);
      const wDnDep = _sbWeightedVal(items, weights, it => it.dnDeposit);
      const isPension = catId.startsWith('pension_');
      const tds = row.querySelectorAll('td');
      const catAmtTotal2 = items.filter(it => it.investMode === 'amount' && it.investAmount !== '')
        .reduce((s, it) => s + (parseFloat(String(it.investAmount).replace(/,/g, '')) || 0), 0);
      const catPctTotal2 = items.filter(it => it.investMode === 'percent' && it.investPct !== '')
        .reduce((s, it) => s + (parseFloat(it.investPct) || 0), 0);
      const catAmtHas2 = items.some(it => it.investMode === 'amount' && it.investAmount !== '');
      const catPctHas2 = items.some(it => it.investMode === 'percent' && it.investPct !== '');
      const catInvDisp2 = catAmtHas2 ? formatCurrencyILS(catAmtTotal2) : catPctHas2 ? `\u200E${catPctTotal2.toFixed(0)}%` : '';
      // tds: [0]=label, [1]=blank, [2]=dn, [3]=dnDep(pension)|invest-total, [4/5]=y1, ...
      let i = 0;
      if (tds[i]) tds[i].innerHTML = `<span class="w-label">משוקלל</span>`; i++;
      if (tds[i]) tds[i].textContent = ''; i++; // מסלול blank
      if (tds[i]) { tds[i].style.fontWeight = '800'; tds[i].textContent = wDn !== null ? _sbFmtPct(wDn) : '—'; } i++;
      if (isPension) { if (tds[i]) { tds[i].style.fontWeight = '800'; tds[i].textContent = wDnDep !== null ? _sbFmtPct(wDnDep) : '—'; } i++; }
      if (tds[i]) { tds[i].style.fontWeight = '800'; tds[i].style.fontSize = '.78rem'; tds[i].style.color = 'var(--blue)'; tds[i].textContent = catInvDisp2; } i++; // invest total
      if (tds[i]) { tds[i].style.color = _sbYieldColor(wY1); tds[i].style.fontWeight = '800'; tds[i].textContent = _sbFmtPct(wY1); } i++;
      if (tds[i]) { tds[i].style.color = _sbYieldColor(wY3); tds[i].style.fontWeight = '800'; tds[i].textContent = _sbFmtPct(wY3); } i++;
      if (tds[i]) { tds[i].style.color = _sbYieldColor(wY5); tds[i].style.fontWeight = '800'; tds[i].textContent = _sbFmtPct(wY5); } i++;
      if (tds[i]) { tds[i].classList.add('sb-allocation-start'); tds[i].style.fontWeight = '800'; tds[i].innerHTML = expCell(_sbFmtPct(wStock, 1), 'stock'); } i++;
      if (tds[i]) { tds[i].style.fontWeight = '800'; tds[i].innerHTML = expCell(_sbFmtPct(wAbroad, 1), 'abroad'); } i++;
      if (tds[i]) { tds[i].style.fontWeight = '800'; tds[i].innerHTML = expCell(_sbFmtPct(wFx, 1), 'fx'); }
    });
    // Update dashboard section
    const dashEl = section.querySelector('.sb-dashboard');
    if (dashEl) {
      dashEl.outerHTML = _sbDashboardHtml(portfolio.filter(it => !it.hidden));
      _sbAttachDistributionDonutEvents(section);
    _sbAttachReturnsHeroEvents(section);
    }
  }

  // ─── HELPER: קבל מפת 12M לפי קטגוריה פעילה ──────────────────
  function getActive12MMap() {
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === state.activeCategoryId);
    if (cat && cat.pensionAPI) return state.yields12MPension;
    if (cat && cat.polisaAPI)  return state.yields12MPolisa;
    return state.yields12M;
  }

  function getActive7YMap() {
    if (state.trailing7Y?.categoryId !== state.activeCategoryId) return null;
    if (state.trailing7Y?.targetPopulation !== state.targetPopulation) return null;
    return state.trailing7Y?.map || null;
  }

  // ─── BUILD TRACK TABLE ───────────────────────────────────────
  function buildTrackTable(records, avg, latestPeriod, trackId, sortField, sortDir) {
    const monthLabel = latestPeriod ? formatReportPeriodShort(latestPeriod) : '';
    const monthCol   = monthLabel || 'חודשי'; // ללא מילת "חודש" (task 8)

    // ── תשואה שנתית ממוצעת: (1+r)^(1/n)−1 ────────────────────
    const toAnn = (cumPct, years) => {
      const n = parseFloat(cumPct);
      if (isNaN(n)) return null;
      return (Math.pow(1 + n / 100, 1 / years) - 1) * 100;
    };

    const arrow = (f) => {
      if (sortField !== f) return '<span class="sort-arrow inactive" aria-hidden="true">⇅</span>';
      return sortDir === 'desc'
        ? '<span class="sort-arrow active" aria-hidden="true">↓</span>'
        : '<span class="sort-arrow active" aria-hidden="true">↑</span>';
    };
    const ariaSort = (f) => {
      if (sortField !== f) return 'aria-sort="none"';
      return sortDir === 'desc' ? 'aria-sort="descending"' : 'aria-sort="ascending"';
    };
    const sortedThClass = (f, extraClass = '') => {
      const classes = [extraClass, sortField === f ? 'col-sorted-head' : ''].filter(Boolean);
      return classes.length ? ` class="${classes.join(' ')}"` : '';
    };

    // ממוצע חשיפות לסימון outlier
    const _12mMapPre = getActive12MMap();
    const _7yMapPre = getActive7YMap();
    const trailing7Loading = !!(state.trailing7Y?.loading && !_7yMapPre);
    const customRangeActive = state.customRange.active && !!state.customRange.yieldMap;
    const customRangeMap = customRangeActive ? state.customRange.yieldMap : null;
    const yearlyState = getYearlyTrackState(trackId);
    const yearlyActive = !!yearlyState?.active;
    const yearlyYears = yearlyActive ? (yearlyState.years || []) : [];
    const yearlyMap = yearlyActive ? yearlyState.yieldMap : null;
    const yearlyYtdSortKey = 'yearly_ytd';
    const _expAvg = (() => {
      const flds = { stock: 'STOCK_MARKET_EXPOSURE', abroad: 'FOREIGN_EXPOSURE', fx: 'FOREIGN_CURRENCY_EXPOSURE' };
      const res = {};
      for (const [key, fld] of Object.entries(flds)) {
        const vals = records.map(r => {
          const ta = parseFloat(r.TOTAL_ASSETS) || 0;
          const e  = parseFloat(r[fld]);
          return (ta > 0 && !isNaN(e)) ? (e / ta) * 100 : null;
        }).filter(v => v !== null);
        res[key] = vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
        const sortedVals = [...vals].sort((a, b) => a - b);
        const mid = Math.floor(sortedVals.length / 2);
        res[`${key}Median`] = sortedVals.length
          ? (sortedVals.length % 2 ? sortedVals[mid] : (sortedVals[mid - 1] + sortedVals[mid]) / 2)
          : null;
      }
      // ממוצע 12M
      const v12 = records.map(r => _12mMapPre?.get(String(r.FUND_ID))).filter(v => v != null && !isNaN(v));
      res.avg12m = v12.length ? v12.reduce((a,b) => a+b, 0) / v12.length : null;
      const customVals = records.map(r => customRangeMap?.get(String(r.FUND_ID))).filter(v => v != null && !isNaN(v));
      res.avgCustomRange = customVals.length ? customVals.reduce((a,b) => a+b, 0) / customVals.length : null;
      const vals7 = records.map(r => _7yMapPre?.get(String(r.FUND_ID))).filter(v => v != null && !isNaN(v));
      res.avg7y = vals7.length ? vals7.reduce((a,b) => a+b, 0) / vals7.length : null;
      const vals7Ann = vals7.map(v => toAnn(v, 7)).filter(v => v !== null && !isNaN(v));
      res.avg7yAnn = vals7Ann.length ? vals7Ann.reduce((a,b) => a+b, 0) / vals7Ann.length : null;
      return res;
    })();

    const escapeAttr = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const exposureOutliers = (values) => {
      const meta = {
        stock: { label: 'חשיפה למניות', short: 'מניות' }
      };
      return Object.entries(values).filter(([key]) => key === 'stock').map(([key, pctStr]) => {
        const avgVal = _expAvg[key];
        if (pctStr === '-' || avgVal === null) return null;
        const n = parseFloat(pctStr);
        if (isNaN(n)) return null;
        const diff = n - avgVal;
        const relativeGap = avgVal ? Math.abs(diff) / Math.abs(avgVal) : 0;
        if (relativeGap <= 0.50) return null;
        const direction = diff > 0 ? 'גבוהה' : 'נמוכה';
        return {
          key,
          direction,
          text: `${meta[key].label.replace('חשיפה ', 'חשיפה ' + direction + ' ')} ביחס לקבוצה`,
          shortText: `${meta[key].short} ${direction}`
        };
      }).filter(Boolean);
    };

    const allocationOutlierIcon = (outliers) => {
      if (!outliers.length) return '';
      const tooltip = outliers.map(item => item.text).join('\n');
      const aria = `חריגת חשיפה למניות: ${outliers.map(item => item.shortText).join(', ')}`;
      const isHigh = outliers[0]?.direction === 'גבוהה';
      const iconClass = isHigh ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
      const toneClass = isHigh ? 'is-high' : 'is-low';
      return `<span class="allocation-outlier-wrap">
        <button type="button" class="allocation-outlier-btn ${toneClass}" data-tooltip="${escapeAttr(tooltip)}" aria-label="${escapeAttr(aria)}" aria-expanded="false">
          <i class="fas ${iconClass}" aria-hidden="true"></i>
        </button>
      </span>`;
    };
    const isSp500TrackLabel = (label) => /(?:s\s*&\s*p|sp)\s*500|500\s*(?:s\s*&\s*p|sp)/i.test(String(label || ''));
    const allocationProfileFor = ({ stock, abroad, fx }) => {
      stock = parseFloat(stock);
      abroad = parseFloat(abroad);
      fx = parseFloat(fx);
      const hasStock = Number.isFinite(stock);
      const hasAbroad = Number.isFinite(abroad);
      const hasFx = Number.isFinite(fx);
      const isGeneral = hasStock && stock >= 40 && stock <= 60;
      if (hasStock && hasAbroad && hasFx && stock > 99 && abroad > 99 && fx > 99) return 'מניות חו״ל צמוד מט״ח';
      if (hasStock && hasAbroad && hasFx && stock > 75 && abroad < 5 && fx < 5) return 'מסלול מניות ישראלי';
      if (isGeneral && hasAbroad && hasFx && abroad > 75 && fx > 75) return 'כללי מוטה חו״ל צמוד מט״ח';
      if (isGeneral && hasAbroad && hasFx && abroad < 25 && fx < 25) return 'כללי מוטה ישראל';
      if (hasStock && hasAbroad && hasFx && stock > 75 && abroad > 75 && fx > 75) return 'מניות מוטה חו״ל צמוד מט״ח';
      if (hasStock && hasAbroad && hasFx && stock > 75 && abroad > 75 && fx < 20) return 'מניות מוטה חו״ל מנוטרל מטבע';
      if (hasStock && hasAbroad && hasFx && stock > 75 && abroad < 25 && fx < 25) return 'מניות מוטה ישראל';
      if (hasStock && hasAbroad && hasFx && stock === 0 && abroad > 75 && fx > 75) return 'אג״ח מוטה חו״ל צמוד מט״ח';
      if (hasStock && hasAbroad && hasFx && stock >= 10 && stock <= 25 && abroad < 25 && fx < 25) return 'אג״ח ומניות עד 25% מוטה ישראל';
      if (hasFx && fx < 20 && hasAbroad && abroad > 75) return 'חו״ל מנוטרל מטבע';
      if (hasAbroad && abroad > 75) return hasFx && fx > 75 ? 'חו״ל צמוד מט״ח' : 'חו״ל';
      if (hasAbroad && hasFx && abroad < 25 && fx < 25) return 'מוטה ישראל';
      if (hasFx && fx > 75) return 'צמוד מט״ח';
      return '';
    };
    const allocationProfileWithMedianSignal = (profile, values) => {
      if (profile) return profile;
      const defs = [
        { key: 'stock', value: parseFloat(values.stock) },
        { key: 'abroad', value: parseFloat(values.abroad) },
        { key: 'fx', value: parseFloat(values.fx) }
      ];
      const relativeOutliers = defs.map(def => {
        const med = _expAvg[`${def.key}Median`];
        if (!Number.isFinite(def.value) || !Number.isFinite(med)) return false;
        const gap = def.value - med;
        const relativeGap = Math.abs(med) > 0
          ? Math.abs(gap) / Math.abs(med)
          : (Math.abs(def.value) > 0 ? Infinity : 0);
        return relativeGap >= 0.40;
      });
      const hasRelativeOutlier = relativeOutliers.length === defs.length && relativeOutliers.every(Boolean);
      return hasRelativeOutlier ? 'אלוקציה שונה מהקבוצה' : '';
    };
    const allocationProfileIcons = (profile, trackLabel = '') => {
      const text = String(profile || '');
      if (!text) return '';
      const flagIl = '<span class="table-allocation-flag-il" aria-hidden="true"><svg viewBox="0 0 30 20" focusable="false"><rect width="30" height="20" rx="2" fill="#fff"/><rect y="3" width="30" height="2.6" fill="#2563eb"/><rect y="14.4" width="30" height="2.6" fill="#2563eb"/><path d="M15 6.6l3.4 5.8H11.6L15 6.6z" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-linejoin="round"/><path d="M15 13.4L11.6 7.6h6.8L15 13.4z" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-linejoin="round"/></svg></span>';
      const icon = (src, cls, label) => `<span class="table-allocation-icon ${cls}" aria-hidden="true"><img src="${src}" alt="" loading="lazy" /></span>`;
      const warningIcon = '<span class="table-allocation-warning" aria-hidden="true">⚠️</span>';
      const icons = [];
      if (text.includes('אלוקציה שונה')) icons.push(warningIcon);
      if (text.includes('ישראלי') || text.includes('מוטה ישראל')) {
        icons.push(flagIl);
      } else if (text.includes('חו״ל')) {
        icons.push(isSp500TrackLabel(trackLabel)
          ? icon('assets/allocation-us.png', 'table-allocation-icon-us', 'ארצות הברית')
          : icon('assets/allocation-abroad.png?v=20260530-2', 'table-allocation-icon-abroad', 'חו״ל'));
      }
      if (text.includes('צמוד מט״ח')) icons.push(icon('assets/allocation-fx.png', 'table-allocation-icon-fx', 'צמוד מט״ח'));
      if (text.includes('מנוטרל מטבע')) icons.push(icon('assets/allocation-shekel.png?v=20260605-2', 'table-allocation-icon-shekel', 'מנוטרל מטבע'));
      return icons.length
        ? `<span class="table-allocation-icons" title="${escapeAttr(text)}" aria-label="${escapeAttr(text)}">${icons.join('')}</span>`
        : '';
    };
    // issue 4: זיהוי שמות מנהל כפולים — הוסף סיומת מ-FUND_NAME
    const _nameCount = new Map();
    records.forEach(r => {
      const n = getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION);
      _nameCount.set(n, (_nameCount.get(n) || 0) + 1);
    });

    // מדליית זהב / עגבנייה — מקסימום ומינימום לכל עמודת תשואה
    const _safeMax = (arr) => { const v = arr.filter(x => x != null && isFinite(x)); return v.length ? Math.max(...v) : null; };
    const _safeMin = (arr) => { const v = arr.filter(x => x != null && isFinite(x)); return v.length > 1 ? Math.min(...v) : null; };
    const _maxVals = {
      monthly: _safeMax(records.map(r => parseFloat(r.MONTHLY_YIELD))),
      ytd:     _safeMax(records.map(r => parseFloat(r.YEAR_TO_DATE_YIELD))),
      yr1:     _safeMax(records.map(r => _12mMapPre?.get(String(r.FUND_ID)))),
      customRange: _safeMax(records.map(r => customRangeMap?.get(String(r.FUND_ID)))),
      yr3: state.yieldMode === 'annualized'
        ? _safeMax(records.map(r => toAnn(r.YIELD_TRAILING_3_YRS, 3)))
        : _safeMax(records.map(r => parseFloat(r.YIELD_TRAILING_3_YRS))),
      yr5: state.yieldMode === 'annualized'
        ? _safeMax(records.map(r => toAnn(r.YIELD_TRAILING_5_YRS, 5)))
        : _safeMax(records.map(r => parseFloat(r.YIELD_TRAILING_5_YRS))),
      yr7: state.yieldMode === 'annualized'
        ? _safeMax(records.map(r => toAnn(_7yMapPre?.get(String(r.FUND_ID)), 7)))
        : _safeMax(records.map(r => _7yMapPre?.get(String(r.FUND_ID)))),
    };
    const _minVals = {
      monthly: _safeMin(records.map(r => parseFloat(r.MONTHLY_YIELD))),
      ytd:     _safeMin(records.map(r => parseFloat(r.YEAR_TO_DATE_YIELD))),
      yr1:     _safeMin(records.map(r => _12mMapPre?.get(String(r.FUND_ID)))),
      customRange: _safeMin(records.map(r => customRangeMap?.get(String(r.FUND_ID)))),
      yr3: state.yieldMode === 'annualized'
        ? _safeMin(records.map(r => toAnn(r.YIELD_TRAILING_3_YRS, 3)))
        : _safeMin(records.map(r => parseFloat(r.YIELD_TRAILING_3_YRS))),
      yr5: state.yieldMode === 'annualized'
        ? _safeMin(records.map(r => toAnn(r.YIELD_TRAILING_5_YRS, 5)))
        : _safeMin(records.map(r => parseFloat(r.YIELD_TRAILING_5_YRS))),
      yr7: state.yieldMode === 'annualized'
        ? _safeMin(records.map(r => toAnn(_7yMapPre?.get(String(r.FUND_ID)), 7)))
        : _safeMin(records.map(r => _7yMapPre?.get(String(r.FUND_ID)))),
    };
    const _displayOptions = state.displayOptions || DEFAULT_DISPLAY_OPTIONS;
    const _heatScaleFor = (values) => {
      const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v) && isFinite(v));
      return {
        posMax: nums.filter(v => v > 0).reduce((mx, v) => Math.max(mx, v), 0),
        negMaxAbs: nums.filter(v => v < 0).reduce((mx, v) => Math.max(mx, Math.abs(v)), 0)
      };
    };
    const _heatScales = {
      monthly: _heatScaleFor(records.map(r => r.MONTHLY_YIELD)),
      ytd: _heatScaleFor(records.map(r => r.YEAR_TO_DATE_YIELD)),
      yr1: _heatScaleFor(records.map(r => _12mMapPre?.get(String(r.FUND_ID)))),
      customRange: _heatScaleFor(records.map(r => customRangeMap?.get(String(r.FUND_ID)))),
      yr3: _heatScaleFor(records.map(r => state.yieldMode === 'annualized' ? toAnn(r.YIELD_TRAILING_3_YRS, 3) : r.YIELD_TRAILING_3_YRS)),
      yr5: _heatScaleFor(records.map(r => state.yieldMode === 'annualized' ? toAnn(r.YIELD_TRAILING_5_YRS, 5) : r.YIELD_TRAILING_5_YRS)),
      yr7: _heatScaleFor(records.map(r => state.yieldMode === 'annualized' ? toAnn(_7yMapPre?.get(String(r.FUND_ID)), 7) : _7yMapPre?.get(String(r.FUND_ID)))),
    };

    const _rankMapFor = (values) => {
      const ranked = values
        .map((value, index) => ({ value: parseFloat(value), index }))
        .filter(item => !isNaN(item.value) && isFinite(item.value))
        .sort((a, b) => b.value - a.value);
      const map = new Map();
      ranked.slice(0, 3).forEach((item, i) => map.set(item.index, i + 1));
      return map;
    };

    const _rankVals = {
      monthly: _rankMapFor(records.map(r => r.MONTHLY_YIELD)),
      ytd: _rankMapFor(records.map(r => r.YEAR_TO_DATE_YIELD)),
      yr1: _rankMapFor(records.map(r => _12mMapPre?.get(String(r.FUND_ID)))),
      customRange: _rankMapFor(records.map(r => customRangeMap?.get(String(r.FUND_ID)))),
      yr3: _rankMapFor(records.map(r => state.yieldMode === 'annualized' ? toAnn(r.YIELD_TRAILING_3_YRS, 3) : r.YIELD_TRAILING_3_YRS)),
      yr5: _rankMapFor(records.map(r => state.yieldMode === 'annualized' ? toAnn(r.YIELD_TRAILING_5_YRS, 5) : r.YIELD_TRAILING_5_YRS)),
      yr7: _rankMapFor(records.map(r => state.yieldMode === 'annualized' ? toAnn(_7yMapPre?.get(String(r.FUND_ID)), 7) : _7yMapPre?.get(String(r.FUND_ID)))),
    };

    // ── ממוצע שנתי לשורת ממוצע קבוצה ───────────────────────────
    const _yearMaxVals = {};
    const _yearMinVals = {};
    const _yearRankVals = {};
    const _yearHeatScales = {};
    yearlyYears.forEach(year => {
      const vals = records.map(r => yearlyMap?.get(String(r.FUND_ID))?.get(year));
      _yearMaxVals[year] = _safeMax(vals);
      _yearMinVals[year] = _safeMin(vals);
      _yearRankVals[year] = _rankMapFor(vals);
      _yearHeatScales[year] = _heatScaleFor(vals);
    });

    const _ann3Avg = (() => {
      if (state.yieldMode !== 'annualized') return null;
      const vals = records.map(r => toAnn(r.YIELD_TRAILING_3_YRS, 3)).filter(v => v !== null && !isNaN(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    })();
    const _ann5Avg = (() => {
      if (state.yieldMode !== 'annualized') return null;
      const vals = records.map(r => toAnn(r.YIELD_TRAILING_5_YRS, 5)).filter(v => v !== null && !isNaN(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    })();
    const _winnerMarks = { gold: '🥇', trophy: '🏆', star: '⭐', crown: '👑', rocket: '🚀' };
    const _loserMarks = { tomato: '🍅', thumbsDown: '👎', warning: '⚠️', down: '⬇️', snow: '🧊' };
    const _winnerMark = () => _displayOptions.medalIcon === 'none' ? '' : (_winnerMarks[_displayOptions.medalIcon] || _winnerMarks.gold);
    const _loserMark = () => _displayOptions.loserIcon === 'none' ? '' : (_loserMarks[_displayOptions.loserIcon] || _loserMarks.tomato);
    const _gold   = (val, key) => { const n = parseFloat(val); return (!isNaN(n) && _maxVals[key] !== null && n === _maxVals[key]) ? _winnerMark() : ''; };
    const _tomato = (val, key) => { const n = parseFloat(val); return (!isNaN(n) && _minVals[key] !== null && n === _minVals[key]) ? _loserMark() : ''; };
    const _yearGold = (val, year) => { const n = parseFloat(val); return (!isNaN(n) && _yearMaxVals[year] !== null && n === _yearMaxVals[year]) ? _winnerMark() : ''; };
    const _yearTomato = (val, year) => { const n = parseFloat(val); return (!isNaN(n) && _yearMinVals[year] !== null && n === _yearMinVals[year]) ? _loserMark() : ''; };
    const _badge = (...marks) => marks.find(Boolean) || '';
    const _isWinnerBadge = (badge) => {
      const mark = String(badge || '');
      return !!mark && mark === _winnerMark();
    };
    const _heatIntensity = (val, scale) => {
      const n = parseFloat(val);
      if (isNaN(n) || !scale) return 0;
      const max = n < 0 ? scale.negMaxAbs : scale.posMax;
      if (!max) return 0.16;
      return Math.max(0.16, Math.min(0.78, 0.16 + (Math.abs(n) / max) * 0.62));
    };
    const _yieldWithBadge = (val, badge = '', extraClass = '', topRank = null, heatScale = null) => {
      const pct = formatPercent(val);
      if (pct === '-' || pct === '—') return pct;
      const parsedVal = parseFloat(val);
      const heatClass = _displayOptions.heatmap
        ? (parsedVal > 0 ? ' yield-heat-pos' : parsedVal < 0 ? ' yield-heat-neg' : ' yield-heat-zero')
        : '';
      const cls = `${extraClass ? ` ${extraClass}` : ''}${heatClass}`;
      const badgeHtml = badge ? `<span class="yield-badge" aria-hidden="true">${badge}</span>` : '';
      const highlightStyle = _displayOptions.winnerHighlightStyle || 'yellow';
      const isWinner = topRank === 1 || _isWinnerBadge(badge);
      const winnerCls = highlightStyle !== 'none' && isWinner ? ` yield-winner-marker yield-winner-marker-${highlightStyle}` : '';
      const topRankHtml = _displayOptions.topThree && topRank
        ? `<span class="yield-top-rank yield-top-rank-${topRank}" aria-hidden="true">${topRank}</span>`
        : '';
      const style = heatClass ? ` style="--heat-alpha:${_heatIntensity(parsedVal, heatScale).toFixed(3)}"` : '';
      return `<span class="yield-value-wrap${cls}"${style}><span class="yield-number-shell"><span class="yield-number${winnerCls}">${pct}</span>${badgeHtml}${topRankHtml}</span></span>`;
    };
    const sc = (f) => sortField === f ? ' col-sorted' : '';

    const _isDesktopExp = state.showExposure && !(window.matchMedia && window.matchMedia('(max-width: 1024px)').matches);
    let rows = '';
    records.forEach((r, idx) => {
      const baseName = getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION);
      const _suffix = (_nameCount.get(baseName) > 1) ? extractFundSuffix(r.FUND_NAME || '') : null;
      const name = _suffix ? baseName + ' — ' + _suffix : baseName;
      const color = providerColor(baseName);
      const fundId = r.FUND_ID || '';
      const monthly = formatPercent(r.MONTHLY_YIELD);
      const ytd     = formatPercent(r.YEAR_TO_DATE_YIELD);

      // 3 שנים / 5 שנים — מצטבר או שנתי לפי mode
      const _ann3   = toAnn(r.YIELD_TRAILING_3_YRS, 3);
      const _ann5   = toAnn(r.YIELD_TRAILING_5_YRS, 5);
      const _yr3Val = state.yieldMode === 'annualized' ? _ann3 : parseFloat(r.YIELD_TRAILING_3_YRS);
      const _yr5Val = state.yieldMode === 'annualized' ? _ann5 : parseFloat(r.YIELD_TRAILING_5_YRS);
      const yr3Disp = state.yieldMode === 'annualized'
        ? (_ann3 !== null ? _yieldWithBadge(_ann3, _badge(_gold(_ann3,'yr3'), _tomato(_ann3,'yr3')), '', _rankVals.yr3.get(idx), _heatScales.yr3) : '-')
        : _yieldWithBadge(r.YIELD_TRAILING_3_YRS, _badge(_gold(r.YIELD_TRAILING_3_YRS,'yr3'), _tomato(r.YIELD_TRAILING_3_YRS,'yr3')), '', _rankVals.yr3.get(idx), _heatScales.yr3);
      const yr5Disp = state.yieldMode === 'annualized'
        ? (_ann5 !== null ? _yieldWithBadge(_ann5, _badge(_gold(_ann5,'yr5'), _tomato(_ann5,'yr5')), '', _rankVals.yr5.get(idx), _heatScales.yr5) : '-')
        : _yieldWithBadge(r.YIELD_TRAILING_5_YRS, _badge(_gold(r.YIELD_TRAILING_5_YRS,'yr5'), _tomato(r.YIELD_TRAILING_5_YRS,'yr5')), '', _rankVals.yr5.get(idx), _heatScales.yr5);
      const y7 = _7yMapPre ? _7yMapPre.get(String(r.FUND_ID)) : undefined;
      const y7Ann = toAnn(y7, 7);
      const _yr7Val = state.yieldMode === 'annualized' ? y7Ann : y7;
      const yr7Disp = y7 === null
        ? '<span title="אין נתונים מלאים ל-84 חודשים" style="color:var(--gray-300)">—</span>'
        : _yr7Val !== undefined && _yr7Val !== null
          ? _yieldWithBadge(_yr7Val, _badge(_gold(_yr7Val,'yr7'), _tomato(_yr7Val,'yr7')), sortField === '7yr' ? yieldClass(_yr7Val) : '', _rankVals.yr7.get(idx), _heatScales.yr7)
          : (trailing7Loading ? '<span class="cell-loader"></span>' : '-');

      // ????? 12M ??????
      const _12mMap = _12mMapPre;
      const y12m = _12mMap ? _12mMap.get(String(r.FUND_ID)) : undefined;
      const yr1Cell = y12m === null
        ? '<span title="אין נתוני 12 חודשים" style="color:var(--gray-300)">—</span>'
        : y12m !== undefined
          ? _yieldWithBadge(y12m, _badge(_gold(y12m,'yr1'), _tomato(y12m,'yr1')), sortField === '1yr' ? yieldClass(y12m) : '', _rankVals.yr1.get(idx), _heatScales.yr1)
          : '-';
      const customRangeValue = customRangeMap ? customRangeMap.get(String(r.FUND_ID)) : undefined;
      const customRangeCell = customRangeValue === null
        ? '<span title="אין נתונים מלאים לכל החודשים בטווח שנבחר" style="color:var(--gray-300)">—</span>'
        : customRangeValue !== undefined
          ? _yieldWithBadge(customRangeValue, _badge(_gold(customRangeValue,'customRange'), _tomato(customRangeValue,'customRange')), sortField === 'customRange' ? yieldClass(customRangeValue) : '', _rankVals.customRange.get(idx), _heatScales.customRange)
          : '-';

      const yearlyYtdCell = `<td class="yield-cell ${(sortField===yearlyYtdSortKey?yieldClass(r.YEAR_TO_DATE_YIELD):'')}${sc(yearlyYtdSortKey)}">${_yieldWithBadge(r.YEAR_TO_DATE_YIELD, _badge(_gold(r.YEAR_TO_DATE_YIELD,'ytd'), _tomato(r.YEAR_TO_DATE_YIELD,'ytd')), '', _rankVals.ytd.get(idx), _heatScales.ytd)}</td>`;
      const yearlyCells = yearlyYears.length ? yearlyYears.map(year => {
        const value = yearlyMap?.get(String(r.FUND_ID))?.get(year);
        const sortKey = `year_${year}`;
        const content = value === null || value === undefined
          ? '<span style="color:var(--gray-300)">—</span>'
          : _yieldWithBadge(value, _badge(_yearGold(value, year), _yearTomato(value, year)), '', _yearRankVals[year]?.get(idx), _yearHeatScales[year]);
        return `<td class="yield-cell ${(sortField===sortKey?yieldClass(value):'')}${sc(sortKey)}">${content}</td>`;
      }).join('') : `<td class="yield-cell">${yearlyState?.loading ? '<span class="cell-loader"></span>' : '—'}</td>`;
      const yearlyReturnCells = `${yearlyYtdCell}${yearlyCells}`;

      const ta     = parseFloat(r.TOTAL_ASSETS) || 0;
      const stock  = calcExposurePercent(r.STOCK_MARKET_EXPOSURE, ta);
      const abroad = calcExposurePercent(r.FOREIGN_EXPOSURE, ta);
      const fx     = calcExposurePercent(r.FOREIGN_CURRENCY_EXPOSURE, ta);
      const stockRaw  = calcExposurePercentValue(r.STOCK_MARKET_EXPOSURE, ta)?.toFixed(2) ?? '';
      const abroadRaw = calcExposurePercentValue(r.FOREIGN_EXPOSURE, ta)?.toFixed(2) ?? '';
      const fxRaw     = calcExposurePercentValue(r.FOREIGN_CURRENCY_EXPOSURE, ta)?.toFixed(2) ?? '';
      const allocationValues = { stock: stockRaw, abroad: abroadRaw, fx: fxRaw };
      const allocationOutliers = exposureOutliers(allocationValues);
      const allocationIcon = allocationOutlierIcon(allocationOutliers);
      const allocationProfile = allocationProfileWithMedianSignal(
        ghAllocationProfileFor(allocationValues),
        allocationValues
      );
      const allocationProfileIcon = ghAllocationProfileIcons(allocationProfile, `${_sbGetTrackLabel(trackId)} ${r.FUND_NAME || ''} ${r.SUB_SPECIALIZATION || ''}`);
      const fundIdTagIcons = `${allocationProfileIcon}${allocationIcon}`;

      // דירוג (task 10) — rank לפי הסדר הממוין הנוכחי
      const rank = idx + 1;
      const _sbIsSelected  = isSandboxSelected(String(fundId), trackId, state.activeCategoryId || '');
      const _sbInPortfolio = isInSandboxPortfolio(String(fundId), trackId, state.activeCategoryId || '');
      const _sbInH2H = isInH2HComparison(String(fundId), state.activeCategoryId || '');
      const _sbCbClass = [
        'sandbox-check',
        _sbIsSelected ? 'is-sandbox-selected' : '',
        _sbInPortfolio ? 'is-in-sandbox is-in-portfolio' : '',
        _sbInH2H ? 'is-in-h2h' : '',
        (_sbInPortfolio && _sbInH2H) ? 'is-in-both' : ''
      ].filter(Boolean).join(' ');
      const _sbCbChecked = (_sbIsSelected || _sbInPortfolio || _sbInH2H) ? 'checked' : '';
      const _membershipTitle = renderFundMembershipIndicators(String(fundId), trackId, state.activeCategoryId || '');

      rows += `
        <tr>
          <td class="rank-cell">${rank}</td>
          <td scope="row">
            <div class="provider-cell fund-link"
              data-fundid="${escapeAttr(String(fundId))}"
              data-provider="${escapeAttr(name)}"
              data-trackid="${escapeAttr(trackId)}"
              data-tracklabel="${escapeAttr(_sbGetTrackLabel(trackId))}"
              data-categoryid="${escapeAttr(state.activeCategoryId || '')}"
              data-categorylabel="${escapeAttr(_sbGetCategoryLabel(state.activeCategoryId))}"
              data-y12m="${y12m != null ? escapeAttr(String(y12m)) : ''}"
              data-rank="${escapeAttr(String(rank))}"
              data-total="${escapeAttr(String(records.length))}"
              title="לחץ לפרטי הקופה">
              <span class="provider-status-stack"
                data-fundid="${escapeAttr(String(fundId))}"
                data-trackid="${escapeAttr(trackId)}"
                data-categoryid="${escapeAttr(state.activeCategoryId || '')}">
                <input type="checkbox" class="${_sbCbClass}"
                  data-fundid="${escapeAttr(String(fundId))}"
                  data-fundname="${escapeAttr(r.FUND_NAME || '')}"
                  data-provider="${escapeAttr(name)}"
                  data-trackid="${escapeAttr(trackId)}"
                  data-tracklabel="${escapeAttr(_sbGetTrackLabel(trackId))}"
                  data-categoryid="${escapeAttr(state.activeCategoryId || '')}"
                  data-categorylabel="${escapeAttr(_sbGetCategoryLabel(state.activeCategoryId))}"
                  data-y1="${r.MONTHLY_YIELD != null ? escapeAttr(String(r.MONTHLY_YIELD)) : ''}"
                  data-y3="${r.YEAR_TO_DATE_YIELD != null ? escapeAttr(String(r.YEAR_TO_DATE_YIELD)) : ''}"
                  data-y5="${r.YIELD_TRAILING_3_YRS != null ? escapeAttr(String(r.YIELD_TRAILING_3_YRS)) : ''}"
                  data-y12m="${y12m != null ? escapeAttr(String(y12m)) : ''}"
                  data-y5yr="${r.YIELD_TRAILING_5_YRS != null ? escapeAttr(String(r.YIELD_TRAILING_5_YRS)) : ''}"
                  data-report-period="${r.REPORT_PERIOD ? escapeAttr(String(r.REPORT_PERIOD)) : ''}"
                  data-stock="${escapeAttr(stockRaw)}"
                  data-abroad="${escapeAttr(abroadRaw)}"
                  data-fx="${escapeAttr(fxRaw)}"
                  data-color="${escapeAttr(color)}"
                  data-fund-id-tag-icons="${escapeAttr(fundIdTagIcons)}"
                  ${_sbCbChecked}
                  ${_membershipTitle ? `title="${escapeAttr(_membershipTitle)}"` : ''}
                  aria-label="הוסף ${escapeAttr(name)} למעבדה שלי" />
              </span>
              <div>
                <div class="prov-name" style="color:${color}"><span class="prov-name-text">${name}</span></div>
                <div class="prov-id"><span class="fund-id-number">#${fundId}</span><span class="fund-id-tag-icons">${fundIdTagIcons}</span></div>
              </div>
              <span class="fund-link-icon"><i class="fas fa-external-link-alt"></i></span>
            </div>
          </td>
          ${(!state.showExposure || _isDesktopExp) && !yearlyActive && customRangeActive ? `<td class="yield-cell custom-range-col ${customRangeValue != null && Number.isFinite(customRangeValue) ? yieldClass(customRangeValue) : ''}${sc('customRange')}">${customRangeCell}</td>` : ''}
          ${(!state.showExposure || _isDesktopExp) ? (yearlyActive ? yearlyReturnCells : `
          <td class="yield-cell ${(sortField==='monthly'?yieldClass(r.MONTHLY_YIELD):'')}${sc('monthly')}">${_yieldWithBadge(r.MONTHLY_YIELD, _badge(_gold(r.MONTHLY_YIELD,'monthly'), _tomato(r.MONTHLY_YIELD,'monthly')), '', _rankVals.monthly.get(idx), _heatScales.monthly)}</td>
          <td class="yield-cell ${(sortField==='ytd'?yieldClass(r.YEAR_TO_DATE_YIELD):'')}${sc('ytd')}">${_yieldWithBadge(r.YEAR_TO_DATE_YIELD, _badge(_gold(r.YEAR_TO_DATE_YIELD,'ytd'), _tomato(r.YEAR_TO_DATE_YIELD,'ytd')), '', _rankVals.ytd.get(idx), _heatScales.ytd)}</td>
          <td class="yield-cell ${sortField === '1yr' && y12m !== undefined && y12m !== null ? yieldClass(y12m) : ''}${sc('1yr')}">${yr1Cell}</td>
          <td class="yield-cell ${(sortField==='3yr'?yieldClass(_yr3Val):'')}${sc('3yr')}">${yr3Disp}</td>
          <td class="yield-cell ${(sortField==='5yr'?yieldClass(_yr5Val):'')}${sc('5yr')}">${yr5Disp}</td>
          <td class="yield-cell ${(sortField==='7yr'?yieldClass(_yr7Val):'')}${sc('7yr')}">${yr7Disp}</td>`) : ''}
          ${state.showExposure ? `<td class="exp-col${sc('stock')}">${expCell(stock, 'stock')}</td>
          <td class="exp-col${sc('abroad')}">${expCell(abroad, 'abroad')}</td>
          <td class="exp-col${sc('fx')}">${expCell(fx, 'fx')}</td>` : ''}
        </tr>`;
    });

    // שורת ממוצע
    const yearlyYtdVals = records.map(r => parseFloat(r.YEAR_TO_DATE_YIELD)).filter(v => !isNaN(v));
    const yearlyYtdAvg = yearlyYtdVals.length ? yearlyYtdVals.reduce((a, b) => a + b, 0) / yearlyYtdVals.length : null;
    const yearlyYtdAverageCell = `<td class="yield-cell ${sortField===yearlyYtdSortKey?yieldClass(yearlyYtdAvg):''}${sc(yearlyYtdSortKey)}">${yearlyYtdAvg!==null?formatPercent(yearlyYtdAvg):'-'}</td>`;
    const yearlyAverageCells = yearlyYears.length ? yearlyYears.map(year => {
      const vals = records
        .map(r => yearlyMap?.get(String(r.FUND_ID))?.get(year))
        .filter(v => v !== null && v !== undefined && !isNaN(v));
      const avgYear = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const sortKey = `year_${year}`;
      return `<td class="yield-cell ${sortField===sortKey?yieldClass(avgYear):''}${sc(sortKey)}">${avgYear!==null?formatPercent(avgYear):'-'}</td>`;
    }).join('') : '<td class="yield-cell">-</td>';
    const yearlyAverageReturnCells = `${yearlyYtdAverageCell}${yearlyAverageCells}`;

    rows += `
      <tr class="average-row">
        <td></td>
        <td>ממוצע קבוצה</td>
        ${(!state.showExposure || _isDesktopExp) && !yearlyActive && customRangeActive ? `<td class="yield-cell custom-range-col ${sortField==='customRange'?yieldClass(_expAvg.avgCustomRange):''}">${_expAvg.avgCustomRange!==null?formatPercent(_expAvg.avgCustomRange):'-'}</td>` : ''}
        ${(!state.showExposure || _isDesktopExp) ? (yearlyActive ? yearlyAverageReturnCells : `<td class="yield-cell ${sortField==='monthly'?yieldClass(avg.MONTHLY_YIELD):''}">${avg.MONTHLY_YIELD!==null?formatPercent(avg.MONTHLY_YIELD):'-'}</td>
        <td class="yield-cell ${sortField==='ytd'?yieldClass(avg.YEAR_TO_DATE_YIELD):''}">${avg.YEAR_TO_DATE_YIELD!==null?formatPercent(avg.YEAR_TO_DATE_YIELD):'-'}</td>
        <td class="yield-cell ${sortField==='1yr'?yieldClass(_expAvg.avg12m):''}">${_expAvg.avg12m!==null?formatPercent(_expAvg.avg12m):'-'}</td>
        <td class="yield-cell ${sortField==='3yr'?(state.yieldMode==='annualized'?yieldClass(_ann3Avg):yieldClass(avg.YIELD_TRAILING_3_YRS)):''}">
          ${state.yieldMode==='annualized'?(_ann3Avg!==null?formatPercent(_ann3Avg):'-'):(avg.YIELD_TRAILING_3_YRS!==null?formatPercent(avg.YIELD_TRAILING_3_YRS):'-')}
        </td>
        <td class="yield-cell ${sortField==='5yr'?(state.yieldMode==='annualized'?yieldClass(_ann5Avg):yieldClass(avg.YIELD_TRAILING_5_YRS)):''}">
          ${state.yieldMode==='annualized'?(_ann5Avg!==null?formatPercent(_ann5Avg):'-'):(avg.YIELD_TRAILING_5_YRS!==null?formatPercent(avg.YIELD_TRAILING_5_YRS):'-')}
        </td>
        <td class="yield-cell ${sortField==='7yr'?yieldClass(state.yieldMode==='annualized'?_expAvg.avg7yAnn:_expAvg.avg7y):''}">${state.yieldMode==='annualized'?(_expAvg.avg7yAnn!==null?formatPercent(_expAvg.avg7yAnn):(trailing7Loading?'<span class="cell-loader"></span>':'-')):(_expAvg.avg7y!==null?formatPercent(_expAvg.avg7y):(trailing7Loading?'<span class="cell-loader"></span>':'-'))}</td>`) : ''}
        ${state.showExposure ? `<td class="exp-col">${_expAvg.stock!==null?_expAvg.stock.toFixed(1)+'%':'-'}</td>
        <td class="exp-col">${_expAvg.abroad!==null?_expAvg.abroad.toFixed(1)+'%':'-'}</td>
        <td class="exp-col">${_expAvg.fx!==null?_expAvg.fx.toFixed(1)+'%':'-'}</td>` : ''}
      </tr>`;

    const _yr3Lbl = '3 שנים';
    const _yr5Lbl = '5 שנים';
    const _hideYieldSubLabel = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    const _yieldSubLabel = _hideYieldSubLabel
      ? ''
      : state.yieldMode === 'annualized'
      ? '<span class="th-yield-sub">ממוצע שנתי</span>'
      : '<span class="th-yield-sub">תשואה מצטברת</span>';

    const yearlyYearHeaderCells = yearlyState?.loading
      ? `<th scope="col">טוען ${yearlyState.yearCount || 5} שנים...</th>`
      : yearlyYears.length
        ? yearlyYears.map(year => {
            const sortKey = `year_${year}`;
            return `<th${sortedThClass(sortKey, 'yield-col')} data-sortfield="${sortKey}" ${ariaSort(sortKey)} scope="col">${year} ${arrow(sortKey)}</th>`;
          }).join('')
        : `<th scope="col">${yearlyState?.error === 'timeout' ? 'הטעינה ארוכה מדי, לחץ שוב לטעינה' : yearlyState?.error === 'failed' ? 'הטעינה נכשלה, לחץ שוב לטעינה' : 'לא נמצאו שנים מלאות'}</th>`;
    const yearlyHeaderCells = `<th${sortedThClass(yearlyYtdSortKey, 'yield-col')} data-sortfield="${yearlyYtdSortKey}" ${ariaSort(yearlyYtdSortKey)} scope="col">השנה ${arrow(yearlyYtdSortKey)}</th>${yearlyYearHeaderCells}`;
    const matchYearlyHeight = !yearlyActive && (
      state.compactTracksView ||
      (state.showExposure && (state.yieldMode === 'cumulative' || state.yieldMode === 'annualized'))
    );

    return `
      <table class="track-table${customRangeActive && !yearlyActive ? ' has-custom-range' : ''}${yearlyActive ? ' has-yearly-returns' : ''}${matchYearlyHeight ? ' match-yearly-height' : ''}${!state.showExposure ? ' hide-exposure' : ''}${state.showExposure && (window.matchMedia && window.matchMedia('(max-width: 1024px)').matches) ? ' exposure-only' : ''}">
        <thead>
          <tr>
            <th title="דירוג" scope="col">#</th>
            <th scope="col">מנהל</th>
            ${(!state.showExposure || _isDesktopExp) && !yearlyActive && customRangeActive ? `<th${sortedThClass('customRange', 'custom-range-col yield-col')} data-sortfield="customRange" ${ariaSort('customRange')} scope="col"><span class="custom-range-th">טווח מותאם</span> ${arrow('customRange')}<small class="custom-range-th-dates">${formatRangePeriodOnly(state.customRange.startPeriod, state.customRange.endPeriod)}</small></th>` : ''}
            ${(!state.showExposure || _isDesktopExp) ? (yearlyActive ? yearlyHeaderCells : `<th${sortedThClass('monthly', 'yield-col')} data-sortfield="monthly" ${ariaSort('monthly')} scope="col">${monthCol} ${arrow('monthly')}</th>
            <th${sortedThClass('ytd', 'yield-col')} data-sortfield="ytd" ${ariaSort('ytd')} scope="col">השנה ${arrow('ytd')}</th>
            <th${sortedThClass('1yr', 'yield-col')} data-sortfield="1yr" ${ariaSort('1yr')} scope="col">12 חוד׳ ${arrow('1yr')}</th>
            <th${sortedThClass('3yr', 'yield-col')} data-sortfield="3yr" ${ariaSort('3yr')} scope="col">${_yr3Lbl} ${arrow('3yr')}${_yieldSubLabel}</th>
            <th${sortedThClass('5yr', 'yield-col')} data-sortfield="5yr" ${ariaSort('5yr')} scope="col">${_yr5Lbl} ${arrow('5yr')}${_yieldSubLabel}</th>
            <th${sortedThClass('7yr', 'yield-col')} data-sortfield="7yr" ${ariaSort('7yr')} scope="col">7 שנים ${arrow('7yr')}${_yieldSubLabel}</th>`) : ''}
            ${state.showExposure ? `<th${sortedThClass('stock', 'exp-col')} data-sortfield="stock" ${ariaSort('stock')} scope="col">% מניות ${arrow('stock')}</th>
            <th${sortedThClass('abroad', 'exp-col')} data-sortfield="abroad" ${ariaSort('abroad')} scope="col">% חו"ל ${arrow('abroad')}</th>
            <th${sortedThClass('fx', 'exp-col')} data-sortfield="fx" ${ariaSort('fx')} scope="col">% מט"ח ${arrow('fx')}</th>` : ''}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ─── HELPERS ──────────────────────────────────────────────────

  // issue 4: חלץ מזהה ייחודי מ-FUND_NAME עבור שמות מנהל כפולים
  // מחזיר null אם אין מזהה ידוע — במקרה זה לא מוסיפים סיומת
  function extractFundSuffix(fundName) {
    const SUB_MANAGERS = ['State Street','BlackRock','fidelity','Fidelity','Apollo','ילין לפידות','אלטשולר שחם','אנליסט','מור','מיטב'];
    for (const s of SUB_MANAGERS) {
      if (fundName.toLowerCase().includes(s.toLowerCase())) return s;
    }
    return null;
  }

  function yieldClass(v) {
    const n = parseFloat(v);
    if (isNaN(n) || v === null || v === undefined) return '';
    return n > 0 ? 'yield-pos' : n < 0 ? 'yield-neg' : '';
  }

  function expCell(pct, type) {
    if (pct === '-') return '<span class="exp-dash">-</span>';
    const cleanPct = String(pct ?? '')
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .replace('%', '')
      .trim();
    const n = parseFloat(cleanPct);
    const w = Number.isFinite(n) ? Math.max(0, Math.min(n, 100)) : 0;
    const colorMap = { stock: '#6366f1', abroad: '#10b981', fx: '#f97316' };
    const color = colorMap[type] || '#6366f1';
    return `<div class="exp-wrap"><span class="exp-val">${pct}</span><div class="exp-bar-bg"><div class="exp-bar" style="width:${w}%;background:${color}"></div></div></div>`;
  }

  // ─── SEARCH AUTOCOMPLETE ──────────────────────────────────────
  function setupSearch() {
    const input    = document.getElementById('global-search');
    const dropdown = document.getElementById('search-dropdown');
    let timer;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => doSearch(input.value.trim()), 180);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDropdown();
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.hero-search')) closeDropdown();
    });

    function doSearch(q) {
      if (!q || q.length < 1) { closeDropdown(); return; }
      const ql = q.toLowerCase();

      if (!state.isHomePage) renderComparisonView();

      if (!state.searchableRecords.length) { closeDropdown(); return; }

      const seen = new Set();
      const results = [];

      state.searchableRecords.forEach(r => {
        const name  = getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION);
        const id    = String(r.FUND_ID || '');
        const sub   = (r.SUB_SPECIALIZATION || '');
        const cls   = (r.FUND_CLASSIFICATION || '');
        const fname = (r.FUND_NAME || '');

        if (name.toLowerCase().includes(ql) || id.includes(ql) ||
            sub.toLowerCase().includes(ql) || fname.toLowerCase().includes(ql)) {
          const key = `${name}|${sub}`;
          if (!seen.has(key) && results.length < 10) {
            seen.add(key);
            results.push({ name, sub, cls, fundId: id, catId: getCatIdByClassification(cls) });
          }
        }
      });

      if (results.length === 0) { closeDropdown(); return; }

      dropdown.innerHTML = results.map((res, i) => `
        <div class="sd-item" data-idx="${i}" data-catid="${res.catId || ''}" data-fundid="${res.fundId}">
          <div class="sd-name">${highlight(res.name, q)}</div>
          <div class="sd-sub">${highlight(res.sub, q)} · ${shortCls(res.cls)} · <span class="sd-id">#${highlight(res.fundId, q)}</span></div>
        </div>
      `).join('');

      dropdown.style.display = 'block';

      dropdown.querySelectorAll('.sd-item').forEach(item => {
        item.addEventListener('click', () => {
          const catId  = item.dataset.catid;
          const fundId = item.dataset.fundid;
          closeDropdown();
          input.value = '';
          if (fundId && catId) {
            window.location.href = `fund.html?id=${fundId}&cat=${catId}`;
          } else if (catId) {
            switchCategory(catId);
          }
        });
      });
    }

    function closeDropdown() {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
    }

    function highlight(text, q) {
      if (!q || !text) return text || '';
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
      return String(text).replace(re, '<mark>$1</mark>');
    }

    function shortCls(cls) {
      if (!cls) return '';
      if (cls.includes('תגמולים')) return 'קופות גמל';
      if (cls.includes('גמל להשקעה')) return 'גמל להשקעה';
      if (cls.includes('השתלמות')) return 'השתלמות';
      if (cls.includes('חסכון לילד') || cls.includes('חיסכון לכל ילד')) return 'חיסכון לילד';
      if (cls.includes('פנסיה')) return 'פנסיה';
      if (cls.includes('פוליסת')) return 'פוליסה';
      return cls.substring(0, 20);
    }
  }

  function getCatIdByClassification(cls) {
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c =>
      c.apiClassifications.some(ac => cls.includes(ac))
    );
    return cat ? cat.id : null;
  }

  function setupAdvancedSearch() {
    const openBtn = document.getElementById('advanced-search-open-btn');
    const overlay = document.getElementById('advanced-search-overlay');
    const closeBtn = document.getElementById('advanced-search-close');
    const addRowBtn = document.getElementById('advanced-search-add-row');
    const resetBtn = document.getElementById('advanced-search-reset');
    const runBtn = document.getElementById('advanced-search-run');

    if (!openBtn || !overlay || !closeBtn || !addRowBtn || !resetBtn || !runBtn) return;

    openBtn.addEventListener('click', () => openAdvancedSearch());
    closeBtn.addEventListener('click', () => closeAdvancedSearch());
    addRowBtn.addEventListener('click', () => {
      const lastParam = state.advancedSearch.params[state.advancedSearch.params.length - 1];
      if (state.advancedSearch.params.length >= 4) {
        setAdvancedSearchStatus('אפשר לבחור עד 4 פרמטרים.');
        return;
      }
      if (lastParam && !lastParam.metricId) {
        state.advancedSearch.focusParamId = lastParam.id;
        state.advancedSearch.focusTarget = 'metric';
        setAdvancedSearchStatus('בחר קודם פרמטר לפני שמוסיפים פרמטר נוסף.');
        renderAdvancedSearchRows();
        return;
      }
      const newParam = createAdvancedSearchParam();
      state.advancedSearch.params.push(newParam);
      state.advancedSearch.focusParamId = newParam.id;
      state.advancedSearch.focusTarget = 'metric';
      setAdvancedSearchStatus('');
      renderAdvancedSearchRows();
    });
    resetBtn.addEventListener('click', () => resetAdvancedSearchState({ keepOpen: true }));
    runBtn.addEventListener('click', () => runAdvancedSearch());

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAdvancedSearch();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.advancedSearch.open) closeAdvancedSearch();
    });

    overlay.querySelectorAll('[data-adv-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.advancedSearch.mode = btn.dataset.advMode === 'worst' ? 'worst' : 'best';
        syncAdvancedSearchModeButtons();
      });
    });

    syncAdvancedSearchModeButtons();
  }

  function setAdvancedSearchStatus(message = '') {
    const el = document.getElementById('advanced-search-status');
    if (el) el.textContent = message;
  }

  function updateAdvancedSearchRunButton(animate = false) {
    const btn = document.getElementById('advanced-search-run');
    if (!btn) return;
    const label = btn.querySelector('span');
    const needsRefresh = !!state.advancedSearch.hasRun && !!state.advancedSearch.needsRefresh;

    btn.classList.toggle('needs-refresh', needsRefresh);
    if (label) label.textContent = needsRefresh ? 'עדכן תוצאות' : 'מצא 5 תוצאות';

    if (animate) {
      btn.classList.remove('is-bumping');
      void btn.offsetWidth;
      btn.classList.add('is-bumping');
      window.setTimeout(() => btn.classList.remove('is-bumping'), 520);
    }
  }

  function resetAdvancedSearchState(options = {}) {
    const { keepOpen = false, autoFocus = false } = options;
    const firstParam = createAdvancedSearchParam();
    state.advancedSearch.params = [firstParam];
    state.advancedSearch.results = [];
    state.advancedSearch.loading = false;
    state.advancedSearch.emptyMessage = '';
    state.advancedSearch.needsRefresh = false;
    state.advancedSearch.focusParamId = autoFocus ? firstParam.id : null;
    state.advancedSearch.focusTarget = autoFocus ? 'metric' : null;
    setAdvancedSearchStatus('');
    if (keepOpen) {
      updateAdvancedSearchRunButton();
      renderAdvancedSearchRows();
      renderAdvancedSearchResults();
    }
  }

  function syncAdvancedSearchModeButtons() {
    document.querySelectorAll('[data-adv-mode]').forEach(btn => {
      const active = btn.dataset.advMode === state.advancedSearch.mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function openAdvancedSearch() {
    if (state.isHomePage || !state.activeCategoryId) {
      showToast('עברו קודם לקטגוריה כדי לבצע חיפוש מתקדם');
      return;
    }
    resetAdvancedSearchState();
    state.advancedSearch.open = true;
    const overlay = document.getElementById('advanced-search-overlay');
    if (overlay) {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
    }
    syncAdvancedSearchCategoryChip();
    syncAdvancedSearchModeButtons();
    renderAdvancedSearchRows();
    renderAdvancedSearchHistory();
    renderAdvancedSearchResults();
    const runBtn = document.getElementById('advanced-search-run');
    if (runBtn) {
      runBtn.classList.remove('is-gold-flashing');
      void runBtn.offsetWidth;
      runBtn.classList.add('is-gold-flashing');
    }
    ensureAdvancedSearchMetricsLoaded();
  }

  function closeAdvancedSearch() {
    state.advancedSearch.open = false;
    const overlay = document.getElementById('advanced-search-overlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function syncAdvancedSearchCategoryChip() {
    const chip = document.getElementById('advanced-search-category-chip');
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === state.activeCategoryId);
    if (chip) chip.textContent = cat ? `קטגוריה: ${cat.label}` : 'קטגוריה פעילה';
    const headCategory = document.getElementById('advanced-search-head-category');
    if (headCategory) headCategory.textContent = cat ? cat.label : '';
  }

  function getAvailableAdvancedMetrics() {
    const isPension = isPensionCategory();
    return ADVANCED_SEARCH_METRICS.filter(metric => metric.id !== 'actuarial' || isPension);
  }

  function renderAdvancedSearchRows() {
    const container = document.getElementById('advanced-search-rows');
    if (!container) return;

    const metrics = getAvailableAdvancedMetrics();
    const usedMetricIds = state.advancedSearch.params.map(param => param.metricId).filter(Boolean);

    container.innerHTML = state.advancedSearch.params.map((param, index) => {
      const metricOptions = metrics.map(metric => {
        const disabled = metric.id !== param.metricId && usedMetricIds.includes(metric.id);
        return `<option value="${metric.id}" ${param.metricId === metric.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${metric.label}</option>`;
      }).join('');

      return `
        <div class="advanced-search-row" data-adv-row="${param.id}">
          <button type="button" class="advanced-search-drag" data-adv-drag="${param.id}" draggable="true" aria-label="גרור לשינוי סדר הפרמטר">
            <i class="fas fa-grip-vertical" aria-hidden="true"></i>
          </button>
          <div class="advanced-search-field">
            <label for="adv-metric-${param.id}">פרמטר ${index + 1}</label>
            <select id="adv-metric-${param.id}" data-adv-input="metric">
              <option value="">בחר פרמטר</option>
              ${metricOptions}
            </select>
          </div>
          <div class="advanced-search-field">
            <label for="adv-direction-${param.id}">כיוון</label>
            <select id="adv-direction-${param.id}" data-adv-input="direction">
              <option value="high" ${param.direction === 'high' ? 'selected' : ''}>${ADVANCED_SEARCH_DIRECTION_LABELS.high}</option>
              <option value="low" ${param.direction === 'low' ? 'selected' : ''}>${ADVANCED_SEARCH_DIRECTION_LABELS.low}</option>
            </select>
          </div>
          <button type="button" class="advanced-search-remove" data-adv-remove="${param.id}" aria-label="הסר פרמטר">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    const reorderParamsLegacy = (dragId, targetId) => {
      if (!dragId || !targetId || dragId === targetId) return;
      const fromIndex = state.advancedSearch.params.findIndex(param => param.id === dragId);
      const toIndex = state.advancedSearch.params.findIndex(param => param.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const next = [...state.advancedSearch.params];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      state.advancedSearch.params = next;
      renderAdvancedSearchRows();
    };

    container.querySelectorAll('[data-adv-drag]').forEach(handle => {
      handle.addEventListener('dragstart', (event) => {
        state.advancedSearch.dragParamId = handle.dataset.advDrag;
        handle.classList.add('is-dragging');
        handle.closest('[data-adv-row]')?.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', handle.dataset.advDrag || '');
        }
      });

      handle.addEventListener('dragend', () => {
        state.advancedSearch.dragParamId = null;
        container.querySelectorAll('.advanced-search-row').forEach(row => row.classList.remove('is-dragging', 'is-drag-over'));
        container.querySelectorAll('.advanced-search-drag').forEach(btn => btn.classList.remove('is-dragging'));
      });
    });

    container.querySelectorAll('[data-adv-row]').forEach(row => {
      row.addEventListener('dragover', (event) => {
        if (!state.advancedSearch.dragParamId || state.advancedSearch.dragParamId === row.dataset.advRow) return;
        event.preventDefault();
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', (event) => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-over');
        reorderParamsLegacy(state.advancedSearch.dragParamId, row.dataset.advRow);
      });
    });

    const reorderParamsShadow = (dragId, targetId) => {
      if (!dragId || !targetId || dragId === targetId) return;
      const fromIndex = state.advancedSearch.params.findIndex(param => param.id === dragId);
      const toIndex = state.advancedSearch.params.findIndex(param => param.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const next = [...state.advancedSearch.params];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      state.advancedSearch.params = next;
      state.advancedSearch.reorderPulse = Date.now();
      renderAdvancedSearchRows();
    };

    container.querySelectorAll('[data-adv-drag]').forEach(handle => {
      handle.addEventListener('dragstart', (event) => {
        state.advancedSearch.dragParamId = handle.dataset.advDrag;
        handle.classList.add('is-dragging');
        handle.closest('[data-adv-row]')?.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', handle.dataset.advDrag || '');
        }
      });

      handle.addEventListener('dragend', () => {
        state.advancedSearch.dragParamId = null;
        container.querySelectorAll('.advanced-search-row').forEach(row => row.classList.remove('is-dragging', 'is-drag-over'));
        container.querySelectorAll('.advanced-search-drag').forEach(btn => btn.classList.remove('is-dragging'));
      });
    });

    container.querySelectorAll('[data-adv-row]').forEach(row => {
      row.addEventListener('dragover', (event) => {
        if (!state.advancedSearch.dragParamId || state.advancedSearch.dragParamId === row.dataset.advRow) return;
        event.preventDefault();
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', (event) => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-over');
        reorderParamsShadow(state.advancedSearch.dragParamId, row.dataset.advRow);
      });
    });

    const reorderParamsGhost = (dragId, targetId) => {
      if (!dragId || !targetId || dragId === targetId) return;
      const fromIndex = state.advancedSearch.params.findIndex(param => param.id === dragId);
      const toIndex = state.advancedSearch.params.findIndex(param => param.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const next = [...state.advancedSearch.params];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      state.advancedSearch.params = next;
      state.advancedSearch.reorderPulse = Date.now();
      renderAdvancedSearchRows();
    };

    container.querySelectorAll('[data-adv-drag]').forEach(handle => {
      handle.addEventListener('dragstart', (event) => {
        state.advancedSearch.dragParamId = handle.dataset.advDrag;
        handle.classList.add('is-dragging');
        handle.closest('[data-adv-row]')?.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', handle.dataset.advDrag || '');
        }
      });

      handle.addEventListener('dragend', () => {
        state.advancedSearch.dragParamId = null;
        container.querySelectorAll('.advanced-search-row').forEach(row => row.classList.remove('is-dragging', 'is-drag-over'));
        container.querySelectorAll('.advanced-search-drag').forEach(btn => btn.classList.remove('is-dragging'));
      });
    });

    container.querySelectorAll('[data-adv-row]').forEach(row => {
      row.addEventListener('dragover', (event) => {
        if (!state.advancedSearch.dragParamId || state.advancedSearch.dragParamId === row.dataset.advRow) return;
        event.preventDefault();
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', (event) => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-over');
        reorderParamsGhost(state.advancedSearch.dragParamId, row.dataset.advRow);
      });
    });

    const reorderParamsArchive = (dragId, targetId) => {
      if (!dragId || !targetId || dragId === targetId) return;
      const fromIndex = state.advancedSearch.params.findIndex(param => param.id === dragId);
      const toIndex = state.advancedSearch.params.findIndex(param => param.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const next = [...state.advancedSearch.params];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      state.advancedSearch.params = next;
      state.advancedSearch.reorderPulse = Date.now();
      renderAdvancedSearchRows();
    };

    container.querySelectorAll('[data-adv-drag]').forEach(handle => {
      handle.addEventListener('dragstart', (event) => {
        state.advancedSearch.dragParamId = handle.dataset.advDrag;
        handle.classList.add('is-dragging');
        handle.closest('[data-adv-row]')?.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', handle.dataset.advDrag || '');
        }
      });

      handle.addEventListener('dragend', () => {
        state.advancedSearch.dragParamId = null;
        container.querySelectorAll('.advanced-search-row').forEach(row => row.classList.remove('is-dragging', 'is-drag-over'));
        container.querySelectorAll('.advanced-search-drag').forEach(btn => btn.classList.remove('is-dragging'));
      });
    });

    container.querySelectorAll('[data-adv-row]').forEach(row => {
      row.addEventListener('dragover', (event) => {
        if (!state.advancedSearch.dragParamId || state.advancedSearch.dragParamId === row.dataset.advRow) return;
        event.preventDefault();
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', (event) => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-over');
        reorderParamsArchive(state.advancedSearch.dragParamId, row.dataset.advRow);
      });
    });

    const reorderParams = (dragId, targetId) => {
      if (!dragId || !targetId || dragId === targetId) return;
      const fromIndex = state.advancedSearch.params.findIndex(param => param.id === dragId);
      const toIndex = state.advancedSearch.params.findIndex(param => param.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const next = [...state.advancedSearch.params];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      state.advancedSearch.params = next;
      state.advancedSearch.reorderPulse = Date.now();
      renderAdvancedSearchRows();
    };

    container.querySelectorAll('[data-adv-drag]').forEach(handle => {
      handle.addEventListener('dragstart', (event) => {
        state.advancedSearch.dragParamId = handle.dataset.advDrag;
        handle.classList.add('is-dragging');
        handle.closest('[data-adv-row]')?.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', handle.dataset.advDrag || '');
        }
      });

      handle.addEventListener('dragend', () => {
        state.advancedSearch.dragParamId = null;
        container.querySelectorAll('.advanced-search-row').forEach(row => row.classList.remove('is-dragging', 'is-drag-over'));
        container.querySelectorAll('.advanced-search-drag').forEach(btn => btn.classList.remove('is-dragging'));
      });
    });

    container.querySelectorAll('[data-adv-row]').forEach(row => {
      row.addEventListener('dragover', (event) => {
        if (!state.advancedSearch.dragParamId || state.advancedSearch.dragParamId === row.dataset.advRow) return;
        event.preventDefault();
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', (event) => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-over');
        reorderParams(state.advancedSearch.dragParamId, row.dataset.advRow);
      });
    });

    container.querySelectorAll('[data-adv-input]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-adv-row]');
        const param = state.advancedSearch.params.find(item => item.id === row?.dataset.advRow);
        if (!param) return;
        const metricSelect = row.querySelector('[data-adv-input="metric"]');
        const directionSelect = row.querySelector('[data-adv-input="direction"]');
        param.metricId = metricSelect?.value || '';
        param.direction = directionSelect?.value === 'low' ? 'low' : 'high';
        if (input.dataset.advInput === 'metric') renderAdvancedSearchRows();
      });
    });

    container.querySelectorAll('[data-adv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.advancedSearch.params.length === 1) {
          state.advancedSearch.params = [createAdvancedSearchParam()];
        } else {
          state.advancedSearch.params = state.advancedSearch.params.filter(param => param.id !== btn.dataset.advRemove);
        }
        renderAdvancedSearchRows();
      });
    });
  }

  function renderAdvancedSearchResults() {
    const container = document.getElementById('advanced-search-results');
    if (!container) return;

    if (!state.advancedSearch.results.length) {
      container.innerHTML = `
        <div class="advanced-search-empty">
          בחר פרמטרים ולחץ על "מצא 5 תוצאות" כדי לקבל דירוג חכם של הקופות בקטגוריה הנוכחית.
        </div>
      `;
      return;
    }

    container.innerHTML = state.advancedSearch.results.map((item, index) => `
      <article class="advanced-search-card">
        <div class="advanced-search-card-head">
          <div>
            <span class="advanced-search-rank">${index + 1}</span>
            <h4 class="advanced-search-fund">${item.fundName}</h4>
            <div class="advanced-search-provider">${item.providerName} · ${item.trackLabel}</div>
          </div>
          <div class="advanced-search-score">
            <span class="advanced-search-score-label">ציון התאמה</span>
            <span class="advanced-search-score-value">${item.score.toFixed(0)}</span>
          </div>
        </div>
        <div class="advanced-search-card-meta">
          <span><i class="fas fa-hashtag" aria-hidden="true"></i>${item.fundId}</span>
          <span><i class="fas fa-layer-group" aria-hidden="true"></i>${item.trackLabel}</span>
          <span><i class="fas fa-building" aria-hidden="true"></i>${item.providerName}</span>
        </div>
        <ul class="advanced-search-reasons">
          ${item.reasons.map(reason => `<li>${reason}</li>`).join('')}
        </ul>
      </article>
    `).join('');
  }

  async function ensureAdvancedSearchMetricsLoaded() {
    if (state.advancedSearch.metricMaps || state.advancedSearch.metricsLoading || !state.activeCategoryId) return;

    state.advancedSearch.metricsLoading = true;
    setAdvancedSearchStatus('טוען מדדי דירוג זמינים...');
    try {
      const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === state.activeCategoryId);
      const isPension = !!(cat && cat.pensionAPI);
      const isPolisa = !!(cat && cat.polisaAPI);
      const loaders = [
        isPension ? APIModule.get12MYieldsPension() : isPolisa ? APIModule.get12MYieldsPolisa() : APIModule.get12MYields(),
        isPension ? APIModule.getAllSharpeRatiosPension() : isPolisa ? APIModule.getAllSharpeRatiosPolisa() : APIModule.getAllSharpeRatios(),
        isPension ? APIModule.getConsistencyMapPension() : isPolisa ? APIModule.getConsistencyMapPolisa() : APIModule.getConsistencyMap(),
        isPension ? APIModule.getStdDevMapPension() : isPolisa ? APIModule.getStdDevMapPolisa() : APIModule.getStdDevMap(),
        isPension ? APIModule.getMomentumMapPension() : isPolisa ? APIModule.getMomentumMapPolisa() : APIModule.getMomentumMap()
      ];

      if (isPension) {
        const periods = state.customRange.availablePeriods?.length
          ? [...state.customRange.availablePeriods].sort((a, b) => a - b)
          : [];
        const endPeriod = periods.length ? String(periods[periods.length - 1]) : '';
        const startPeriod = periods.length ? String(periods[Math.max(0, periods.length - 36)]) : '';
        loaders.push(
          startPeriod && endPeriod
            ? APIModule.getActuarialComparison(state.activeCategoryId, startPeriod, endPeriod, state.targetPopulation)
            : Promise.resolve([])
        );
      }

      const [yield12mMap, sharpeMap, positiveMap, stddevMap, momentumMap, actuarialRows = []] = await Promise.all(loaders);
      state.advancedSearch.metricMaps = {
        yield12mMap,
        sharpeMap,
        positiveMap,
        stddevMap,
        momentumMap,
        actuarialByProvider: new Map(
          (Array.isArray(actuarialRows) ? actuarialRows : []).map(row => [String(row.companyName || '').trim(), row.totalAdjustment])
        )
      };
      setAdvancedSearchStatus('');
    } catch (error) {
      console.error('Advanced search metrics failed', error);
      setAdvancedSearchStatus('לא הצלחתי לטעון את כל מדדי הדירוג. אפשר עדיין להמשיך עם המדדים הזמינים.');
    } finally {
      state.advancedSearch.metricsLoading = false;
    }
  }

  function getAdvancedSearchCandidates() {
    const candidates = [];
    const seen = new Set();

    state.organizedData.forEach(item => {
      if (state.selectedTracks.size > 0 && !state.selectedTracks.has(item.track.id)) return;
      if (item.isHiddenByDefault && !state.selectedTracks.has(item.track.id)) return;
      item.records.forEach(record => {
        const providerName = getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION);
        if (!recordPassesProviderFilters(record)) return;
        const fundId = String(record.FUND_ID || '').trim();
        if (!fundId || seen.has(fundId)) return;
        seen.add(fundId);
        candidates.push({
          record,
          trackId: item.track.id,
          trackLabel: item.track.label,
          providerName,
          fundId,
          fundName: record.FUND_NAME || record.SUB_SPECIALIZATION || providerName
        });
      });
    });

    return candidates;
  }

  function getAdvancedMetricRaw(candidate, metricId) {
    const record = candidate.record;
    const metricMaps = state.advancedSearch.metricMaps || {};

    switch (metricId) {
      case 'yield12m': {
        const value = metricMaps.yield12mMap?.get(String(record.FUND_ID));
        return value == null ? NaN : Number(value);
      }
      case 'yieldYtd':
        return Number.parseFloat(record.YEAR_TO_DATE_YIELD);
      case 'yield3y':
        return Number.parseFloat(record.YIELD_TRAILING_3_YRS);
      case 'yield5y':
        return Number.parseFloat(record.YIELD_TRAILING_5_YRS);
      case 'assets': {
        const value = Number.parseFloat(record.TOTAL_ASSETS);
        return Number.isFinite(value) && value > 0 ? value : NaN;
      }
      case 'stock': {
        const totalAssets = Number.parseFloat(record.TOTAL_ASSETS);
        const exposure = Number.parseFloat(record.STOCK_MARKET_EXPOSURE);
        return totalAssets > 0 && Number.isFinite(exposure) ? (exposure / totalAssets) * 100 : NaN;
      }
      case 'abroad': {
        const totalAssets = Number.parseFloat(record.TOTAL_ASSETS);
        const exposure = Number.parseFloat(record.FOREIGN_EXPOSURE);
        return totalAssets > 0 && Number.isFinite(exposure) ? (exposure / totalAssets) * 100 : NaN;
      }
      case 'fx': {
        const totalAssets = Number.parseFloat(record.TOTAL_ASSETS);
        const exposure = Number.parseFloat(record.FOREIGN_CURRENCY_EXPOSURE);
        return totalAssets > 0 && Number.isFinite(exposure) ? (exposure / totalAssets) * 100 : NaN;
      }
      case 'sharpe': {
        const value = metricMaps.sharpeMap?.get(String(record.FUND_ID));
        return value == null ? NaN : Number(value);
      }
      case 'positive': {
        const value = metricMaps.positiveMap?.get(String(record.FUND_ID));
        return value == null ? NaN : Number(value);
      }
      case 'stddev': {
        const value = metricMaps.stddevMap?.get(String(record.FUND_ID));
        return value == null ? NaN : Number(value);
      }
      case 'momentum': {
        const value = metricMaps.momentumMap?.get(String(record.FUND_ID));
        return value == null ? NaN : Number(value);
      }
      case 'actuarial': {
        const value = metricMaps.actuarialByProvider?.get(candidate.providerName);
        return value == null ? NaN : Number(value);
      }
      default:
        return NaN;
    }
  }

  function formatAdvancedMetricValue(metricId, raw) {
    if (!Number.isFinite(raw)) return 'אין נתון';
    if (metricId === 'assets') return formatCurrencyILS(raw * 1000000);
    if (metricId === 'sharpe') return raw.toFixed(2);
    if (metricId === 'positive') return `\u200E${Math.round(raw)}%`;
    if (metricId === 'stddev') return `\u200E${raw.toFixed(2)}%`;
    if (metricId === 'actuarial') return `\u200E${raw > 0 ? '+' : ''}${raw.toFixed(2)}%`;
    return formatPercent(raw);
  }

  function getAdvancedMetricLabel(metricId) {
    return ADVANCED_SEARCH_METRICS.find(metric => metric.id === metricId)?.label || metricId;
  }

  function flipAdvancedDirection(direction) {
    return direction === 'low' ? 'high' : 'low';
  }

  async function runAdvancedSearch() {
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    if (!selectedParams.length) {
      setAdvancedSearchStatus('בחר לפחות פרמטר אחד לחיפוש.');
      renderAdvancedSearchResults();
      return;
    }

    const uniqueMetricIds = new Set(selectedParams.map(param => param.metricId));
    if (uniqueMetricIds.size !== selectedParams.length) {
      setAdvancedSearchStatus('כל פרמטר יכול להיבחר פעם אחת בלבד.');
      return;
    }

    saveAdvancedSearchToHistory(selectedParams);

    const candidates = getAdvancedSearchCandidates();
    if (!candidates.length) {
      state.advancedSearch.results = [];
      setAdvancedSearchStatus('לא נמצאו קופות זמינות בקטגוריה ובסינון הנוכחי.');
      renderAdvancedSearchResults();
      return;
    }

    state.advancedSearch.loading = true;
    setAdvancedSearchStatus('מחשב את דירוג ההתאמה...');
    await ensureAdvancedSearchMetricsLoaded();

    const metricStats = new Map();
    selectedParams.forEach(param => {
      const values = candidates
        .map(candidate => getAdvancedMetricRaw(candidate, param.metricId))
        .filter(value => Number.isFinite(value));
      metricStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const ranked = candidates.map(candidate => {
      let weightedScoreSum = 0;
      let totalWeight = 0;
      let missingCount = 0;
      const reasons = [];

      selectedParams.forEach(param => {
        const weight = ADVANCED_SEARCH_WEIGHT_VALUES[param.weight] || 2;
        const raw = getAdvancedMetricRaw(candidate, param.metricId);
        const stats = metricStats.get(param.metricId) || { min: NaN, max: NaN };
        let normalized = 0.35;

        if (Number.isFinite(raw)) {
          if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max !== stats.min) {
            normalized = (raw - stats.min) / (stats.max - stats.min);
          } else {
            normalized = 1;
          }
          const desiredDirection = state.advancedSearch.mode === 'worst'
            ? flipAdvancedDirection(param.direction)
            : param.direction;
          if (desiredDirection === 'low') normalized = 1 - normalized;
          reasons.push({
            contribution: normalized * weight,
            text: `${getAdvancedMetricLabel(param.metricId)}: ${formatAdvancedMetricValue(param.metricId, raw)}`
          });
        } else {
          missingCount += 1;
          reasons.push({
            contribution: -1,
            text: `חסר נתון עבור ${getAdvancedMetricLabel(param.metricId)}`
          });
        }

        weightedScoreSum += normalized * weight;
        totalWeight += weight;
      });

      let score = totalWeight ? (weightedScoreSum / totalWeight) * 100 : 0;
      if (missingCount >= 2) score *= 0.78;
      else if (missingCount === 1) score *= 0.9;

      return {
        ...candidate,
        score,
        reasons: reasons
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 3)
          .map(reason => reason.text)
      };
    }).sort((a, b) => b.score - a.score).slice(0, 5);

    state.advancedSearch.loading = false;
    state.advancedSearch.results = ranked;
    setAdvancedSearchStatus(ranked.length ? `נמצאו ${ranked.length} תוצאות מובילות לפי הקריטריונים שבחרת.` : 'לא נמצאו תוצאות.');
    renderAdvancedSearchResults();
  }

  const ADVANCED_SEARCH_HISTORY_KEY = 'gemelhub_recent_searches_v1';

  function saveAdvancedSearchToHistory(params) {
    const metrics = getAvailableAdvancedMetrics();
    const snapshot = {
      ts: Date.now(),
      catId: state.activeCategoryId,
      catLabel: CONFIG.PRODUCT_CATEGORIES.find(c => c.id === state.activeCategoryId)?.label || '',
      params: params.map(p => ({
        metricId: p.metricId,
        metricLabel: metrics.find(m => m.id === p.metricId)?.label || p.metricId,
        direction: p.direction,
        weight: p.weight,
        minValue: p.minValue ?? '',
        maxValue: p.maxValue ?? ''
      }))
    };
    const getHistoryKey = item => JSON.stringify([
      item?.catId || '',
      ...(item?.params || []).map(p => [
        p.metricId,
        p.direction || 'high',
        p.weight || 'medium',
        p.minValue || '',
        p.maxValue || ''
      ])
    ]);
    let nextHistory = [snapshot];
    try {
      const raw = localStorage.getItem(ADVANCED_SEARCH_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const hist = Array.isArray(parsed) ? parsed : [];
      const snapshotKey = getHistoryKey(snapshot);
      nextHistory = [snapshot, ...hist.filter(h => getHistoryKey(h) !== snapshotKey)].slice(0, 4);
      localStorage.setItem(ADVANCED_SEARCH_HISTORY_KEY, JSON.stringify(nextHistory));
    } catch(e) {
      const hist = Array.isArray(state.advancedSearch.history) ? state.advancedSearch.history : [];
      const snapshotKey = getHistoryKey(snapshot);
      nextHistory = [snapshot, ...hist.filter(h => getHistoryKey(h) !== snapshotKey)].slice(0, 4);
    }
    state.advancedSearch.history = nextHistory;
    renderAdvancedSearchHistory();
    const historyEl = document.getElementById('advanced-search-history');
    if (historyEl) historyEl.hidden = false;
  }

  function loadAdvancedSearchHistory() {
    try {
      const raw = localStorage.getItem(ADVANCED_SEARCH_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed) && parsed.length) {
        state.advancedSearch.history = parsed;
        return parsed;
      }
    } catch(e) {}
    return Array.isArray(state.advancedSearch.history) ? state.advancedSearch.history : [];
  }

  function renderAdvancedSearchHistory() {
    const container = document.getElementById('advanced-search-history');
    if (!container) return;
    const hist = loadAdvancedSearchHistory();
    container.hidden = false;
    if (!hist.length) {
      container.innerHTML = `
        <div class="adv-hist-head">
          <div class="adv-hist-title">&#x200F;4 חיפושים אחרונים</div>
        </div>
        <p class="adv-hist-empty">לאחר הרצת חיפוש, הוא יופיע כאן לשימוש חוזר מהיר.</p>
      `;
      return;
    }
    container.innerHTML = `
      <div class="adv-hist-head">
        <div class="adv-hist-title">&#x200F;4 חיפושים אחרונים</div>
        <button type="button" class="adv-hist-clear" id="adv-hist-clear">ניקוי חיפושים</button>
      </div>
      ${hist.map((h, i) => `
        <button type="button" class="adv-hist-item" data-hist-idx="${i}">
          <span class="adv-hist-cat">${h.catLabel || h.catId}</span>
          <span class="adv-hist-params">${h.params.map(p => p.metricLabel).join(' · ')}</span>
        </button>
      `).join('')}
    `;
    container.querySelector('#adv-hist-clear')?.addEventListener('click', () => {
      state.advancedSearch.history = [];
      try { localStorage.removeItem(ADVANCED_SEARCH_HISTORY_KEY); } catch(e) {}
      renderAdvancedSearchHistory();
    });
    container.querySelectorAll('.adv-hist-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const h = hist[+btn.dataset.histIdx];
        if (!h) return;
        state.advancedSearch.params = h.params.map(p => ({
          id: Date.now() + Math.random(),
          metricId: p.metricId,
          direction: p.direction || 'high',
          weight: p.weight || 'medium',
          minValue: p.minValue || '',
          maxValue: p.maxValue || ''
        }));
        renderAdvancedSearchRows();
        runAdvancedSearch();
      });
    });
  }

  // ─── MODAL ────────────────────────────────────────────────────
  function setupModal() {
    // הגדרת modal מטופלת ע"י leads.js (setupLeadsModal)
    // כאן רק מחברים כפתורים ייחודיים לדף הראשי
    const headerBtn  = document.getElementById('btn-consult-header');
    const sidebarBtn = document.getElementById('btn-consult-sidebar');
    if (headerBtn)  headerBtn.addEventListener('click',  () => openLeadsModal('header'));
    if (sidebarBtn) sidebarBtn.addEventListener('click', () => openLeadsModal('sidebar'));
    setupLeadsModal();
  }

  // ─── SIDEBAR TOGGLE ───────────────────────────────────────────
  // The sidebar starts collapsed; the toggle button opens/closes it.
  function setupMobileSidebar() {
    // Legacy mobile button (hidden via CSS on desktop, kept for safety)
    const mobileBtn = document.getElementById('mobile-filter-btn');
    const sidebar   = document.getElementById('sidebar');
    if (!sidebar) return;

    function syncMobileSidebarStyle() {
      if (document.body.classList.contains('mobile-filter-open')) return;
      const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
      if (!isMobile) {
        sidebar.removeAttribute('style');
        return;
      }
      const isCollapsed = sidebar.classList.contains('sidebar-collapsed');
      if (isCollapsed) {
        sidebar.style.setProperty('transition', 'none', 'important');
        sidebar.style.setProperty('opacity', '0', 'important');
        sidebar.style.setProperty('visibility', 'hidden', 'important');
        sidebar.style.setProperty('pointer-events', 'none', 'important');
        sidebar.style.setProperty('transform', 'translateX(12px)', 'important');
        return;
      }
      sidebar.style.setProperty('position', 'fixed', 'important');
      const toggleBtn = document.getElementById('sidebar-toggle-btn');
      const rect = toggleBtn ? toggleBtn.getBoundingClientRect() : null;
      const top = rect ? Math.max(8, Math.ceil(rect.bottom + 6)) : 96;
      const right = rect ? Math.max(6, Math.round(window.innerWidth - rect.right)) : 8;
      sidebar.style.setProperty('top', `${top}px`, 'important');
      sidebar.style.setProperty('right', `${right}px`, 'important');
      sidebar.style.setProperty('bottom', '8px', 'important');
      sidebar.style.setProperty('left', 'auto', 'important');
      sidebar.style.setProperty('width', 'min(72vw, 292px)', 'important');
      sidebar.style.setProperty('max-width', 'min(72vw, 292px)', 'important');
      sidebar.style.setProperty('max-height', `calc(100vh - ${top + 8}px)`, 'important');
      sidebar.style.setProperty('transition', 'none', 'important');
      sidebar.style.setProperty('opacity', '1', 'important');
      sidebar.style.setProperty('visibility', 'visible', 'important');
      sidebar.style.setProperty('pointer-events', 'auto', 'important');
      sidebar.style.setProperty('transform', 'none', 'important');
    }

    new MutationObserver(syncMobileSidebarStyle).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', syncMobileSidebarStyle);
    syncMobileSidebarStyle();

    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => toggleSidebar());
    }

    // Main toggle button inside the page-title-bar
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => toggleSidebar());
    }

    function toggleSidebar() {
      const isCollapsed = sidebar.classList.toggle('sidebar-collapsed');
      if (toggleBtn) toggleBtn.classList.toggle('active', !isCollapsed);
      syncMobileSidebarStyle();
      const compareModeToggle = document.getElementById('compare-mode-toggle');
      if (compareModeToggle && isActuarialModeAvailable()) {
        compareModeToggle.hidden = isCollapsed;
        compareModeToggle.style.display = isCollapsed ? 'none' : '';
      }
      const tracksContainer = document.getElementById('tracks-container');
      if (tracksContainer && isActuarialModeAvailable()) {
        tracksContainer.classList.toggle('mode-toggle-hidden', isCollapsed);
      }
      syncTracksDensityClasses();
    }
  }

  // ─── EXPORT CSV ───────────────────────────────────────────────
  function setupExport() {
    const exportBtn = document.getElementById('btn-export');
    if (!exportBtn) return;
    exportBtn.addEventListener('click', () => {
      if (state.isHomePage || !state.organizedData.length) {
        showToast('עברו לדף קטגוריה כדי לייצא נתונים');
        return;
      }
      const rows = [['מנהל','מספר קרן','מסלול','חודשי','מתחילת שנה','3 שנים','5 שנים','% מניות','% חו"ל','% מט"ח']];
      if (getCurrentCompareMode() === 'actuarial') {
        const range = getEffectiveActuarialRange();
        const actuarialRows = [['חברה','איזון בטווח','מועד דיווח אחרון','טווח']];
        sortActuarialRows(getFilteredActuarialRows()).forEach(row => {
          actuarialRows.push([
            row.companyName,
            row.totalAdjustment != null ? formatPercent(row.totalAdjustment) : '—',
            row.latestQuarterPeriod ? formatReportPeriod(row.latestQuarterPeriod) : '—',
            formatRangeLabel(range.startPeriod, range.endPeriod)
          ]);
        });
        const actuarialCsv = '\uFEFF' + actuarialRows.map(row =>
          row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
        ).join('\n');
        const actuarialLink = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(new Blob([actuarialCsv], {type:'text/csv;charset=utf-8;'})),
          download: 'gemelhub_actuarial_comparison.csv'
        });
        actuarialLink.click();
        return;
      }

      state.organizedData.forEach(({ track, records }) => {
        applyFiltersToRecords(records).forEach(r => {
          const n  = getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION);
          const ta = parseFloat(r.TOTAL_ASSETS) || 0;
          rows.push([n, r.FUND_ID, track.label,
            formatPercent(r.MONTHLY_YIELD), formatPercent(r.YEAR_TO_DATE_YIELD),
            formatPercent(r.YIELD_TRAILING_3_YRS), formatPercent(r.YIELD_TRAILING_5_YRS),
            calcExposurePercent(r.STOCK_MARKET_EXPOSURE, ta),
            calcExposurePercent(r.FOREIGN_EXPOSURE, ta),
            calcExposurePercent(r.FOREIGN_CURRENCY_EXPOSURE, ta)
          ]);
        });
      });
      const csv = '\uFEFF' + rows.map(row =>
        row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
      ).join('\n');
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'})),
        download: 'gemul_comparison.csv'
      });
      a.click();
    });
  }

  // ─── CLEAR BUTTONS ────────────────────────────────────────────
  function setupSidebarClearButtons() {
    document.getElementById('clear-tracks').addEventListener('click', () => {
      state.selectedTracks.clear();
      document.querySelectorAll('#filter-tracks input[type=checkbox]').forEach(cb => {
        cb.checked = false;
        cb.closest('.filter-checkbox').classList.remove('checked');
      });
      saveCurrentFilterState();
      renderComparisonView();
    });
    document.getElementById('clear-providers').addEventListener('click', () => {
      state.selectedProviders.clear();
      state.excludedProviders.clear();
      document.querySelectorAll('#filter-providers input[type=checkbox]').forEach(cb => {
        cb.checked = false;
        cb.closest('.filter-checkbox').classList.remove('checked', 'excluded');
      });
      saveCurrentFilterState();
      renderComparisonView();
    });
  }

  // ─── LOADING / ERROR ──────────────────────────────────────────
  function showLoading(show) {
    const l = document.getElementById('loading-state');
    const c = document.getElementById('tracks-container');
    const area = document.getElementById('tracks-area');
    if (show && area && c?.children.length) {
      const height = area.offsetHeight;
      if (height > 120) area.style.minHeight = `${height}px`;
    }
    if (l) l.style.display = show ? 'flex' : 'none';
    if (c && !show) syncTracksDensityClasses();
    if (!show && area?.style.minHeight) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          area.style.minHeight = '';
        });
      });
    }
  }

  // ─── TOAST ────────────────────────────────────────────────────
  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 400); }, 2800);
  }

  // ─── H2H: ראש בראש ─────────────────────────────────────────

  async function switchToH2H() {
    state.isHomePage = false;
    state.activeCategoryId = 'h2h';
    updateAppPageUrl('h2h');
    setActiveTab('h2h');
    const filterBtn = document.getElementById('sidebar-toggle-btn');
    if (filterBtn) filterBtn.style.display = 'none';
    updateFilterBadge();
    showSection('h2h');
    await restoreH2HState();
    renderH2H();
  }

  function renderAdvancedSearchRows() {
    const container = document.getElementById('advanced-search-rows');
    if (!container) return;

    const metrics = getAvailableAdvancedMetrics();
    const usedMetricIds = state.advancedSearch.params.map(param => param.metricId).filter(Boolean);

    container.innerHTML = state.advancedSearch.params.map((param, index) => {
      const metricOptions = metrics.map(metric => {
        const disabled = metric.id !== param.metricId && usedMetricIds.includes(metric.id);
        return `<option value="${metric.id}" ${param.metricId === metric.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${metric.label}</option>`;
      }).join('');

      return `
        <div class="advanced-search-row" data-adv-row="${param.id}">
          <div class="advanced-search-field">
            <label for="adv-metric-${param.id}">פרמטר ${index + 1}</label>
            <select id="adv-metric-${param.id}" data-adv-input="metric">
              <option value="">בחר פרמטר</option>
              ${metricOptions}
            </select>
          </div>
          <div class="advanced-search-field">
            <label for="adv-direction-${param.id}">כיוון</label>
            <select id="adv-direction-${param.id}" data-adv-input="direction">
              <option value="high" ${param.direction === 'high' ? 'selected' : ''}>${ADVANCED_SEARCH_DIRECTION_LABELS.high}</option>
              <option value="low" ${param.direction === 'low' ? 'selected' : ''}>${ADVANCED_SEARCH_DIRECTION_LABELS.low}</option>
            </select>
          </div>
          <button type="button" class="advanced-search-remove" data-adv-remove="${param.id}" aria-label="הסר פרמטר">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-adv-input]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-adv-row]');
        const param = state.advancedSearch.params.find(item => item.id === row?.dataset.advRow);
        if (!param) return;
        param.metricId = row.querySelector('[data-adv-input="metric"]')?.value || '';
        param.direction = row.querySelector('[data-adv-input="direction"]')?.value === 'low' ? 'low' : 'high';
        if (input.dataset.advInput === 'metric') renderAdvancedSearchRows();
      });
    });

    container.querySelectorAll('[data-adv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.advancedSearch.params = state.advancedSearch.params.filter(param => param.id !== btn.dataset.advRemove);
        if (!state.advancedSearch.params.length) state.advancedSearch.params = [createAdvancedSearchParam()];
        renderAdvancedSearchRows();
      });
    });

    const addBtn = document.getElementById('advanced-search-add-row');
    if (addBtn) {
      const lastParam = state.advancedSearch.params[state.advancedSearch.params.length - 1];
      addBtn.hidden = state.advancedSearch.params.length >= 4;
      addBtn.disabled = !!lastParam && !lastParam.metricId;
    }
  }

  function renderAdvancedSearchResults() {
    const container = document.getElementById('advanced-search-results');
    if (!container) return;
    container.classList.add('compact-list');

    if (!state.advancedSearch.results.length) {
      container.innerHTML = `
        <div class="advanced-search-empty">
          בחר פרמטר אחד או יותר ולחץ על "מצא 5 תוצאות" כדי לקבל דירוג חכם של הקופות בקטגוריה הנוכחית.
        </div>
      `;
      return;
    }

    container.innerHTML = state.advancedSearch.results.map((item, index) => `
      <article class="advanced-search-card" data-fundid="${item.fundId}">
        <div class="advanced-search-card-head">
          <div>
            <span class="advanced-search-rank">${index + 1}</span>
            <h4 class="advanced-search-fund">${item.fundName}</h4>
          </div>
          <div class="advanced-search-score">
            <span class="advanced-search-score-label">ציון התאמה</span>
            <span class="advanced-search-score-value">${item.score.toFixed(0)}</span>
          </div>
        </div>
        <div class="advanced-search-card-meta">
          <span><i class="fas fa-building" aria-hidden="true"></i>${item.providerName}</span>
          <span><i class="fas fa-hashtag" aria-hidden="true"></i>${item.trackId}</span>
          <span class="advanced-search-track-name"><i class="fas fa-layer-group" aria-hidden="true"></i>${item.trackLabel}</span>
        </div>
        <ul class="advanced-search-reasons">
          ${item.reasons.map(reason => `<li>${reason}</li>`).join('')}
        </ul>
      </article>
    `).join('');

    container.querySelectorAll('.advanced-search-card').forEach(card => {
      card.addEventListener('click', () => {
        const fundId = card.dataset.fundid;
        if (!fundId || !state.activeCategoryId) return;
        window.location.href = `fund.html?id=${fundId}&cat=${state.activeCategoryId}`;
      });
    });
  }

  function renderAdvancedSearchResults() {
    const container = document.getElementById('advanced-search-results');
    if (!container) return;

    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    if (!state.advancedSearch.results.length) {
      container.innerHTML = `
        <div class="advanced-search-empty">
          בחר פרמטר אחד או יותר ולחץ על "מצא 5 תוצאות" כדי לקבל השוואה רוחבית בין הקופות.
        </div>
      `;
      return;
    }

    const colStats = new Map();
    selectedParams.forEach(param => {
      const values = state.advancedSearch.results
        .map(item => getAdvancedMetricRaw(item, param.metricId))
        .filter(value => Number.isFinite(value));
      colStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const getCellTone = (metricId, raw, direction) => {
      if (!Number.isFinite(raw)) return 'is-missing';
      const stats = colStats.get(metricId) || { min: NaN, max: NaN };
      if (!Number.isFinite(stats.min) || !Number.isFinite(stats.max) || stats.min === stats.max) return 'is-best';
      let normalized = (raw - stats.min) / (stats.max - stats.min);
      if (direction === 'low') normalized = 1 - normalized;
      if (normalized >= 0.82) return 'is-best';
      if (normalized >= 0.58) return 'is-good';
      if (normalized >= 0.34) return 'is-mid';
      return 'is-low';
    };

    const headerCols = selectedParams.map(param => `<th>${getAdvancedMetricLabel(param.metricId)}</th>`).join('');
    const bodyRows = state.advancedSearch.results.map((item, index) => {
      const metricCols = selectedParams.map(param => {
        const raw = getAdvancedMetricRaw(item, param.metricId);
        const tone = getCellTone(param.metricId, raw, param.direction);
        return `<td class="advanced-search-compare-value ${tone}">
          <span class="advanced-search-compare-label">${getAdvancedMetricLabel(param.metricId)}</span>
          <strong>${Number.isFinite(raw) ? formatAdvancedMetricValue(param.metricId, raw) : 'אין נתון'}</strong>
        </td>`;
      }).join('');

      return `
        <tr class="advanced-search-compare-row" data-fundid="${item.fundId}">
          <td class="advanced-search-compare-select">
            <input type="checkbox" class="advanced-search-select-fund" data-adv-compare-fund="${item.fundId}" aria-label="בחר את ${item.providerName} להשוואה">
          </td>
          <td class="advanced-search-compare-company">
            <span class="advanced-search-rank">${index + 1}</span>
            <div>
              <strong>${item.providerName} <span class="adv-fund-id">#${item.fundId}</span></strong>
              <small class="adv-track-label">${item.trackLabel}</small>
            </div>
          </td>
          ${metricCols}
          <td class="advanced-search-compare-score">
            <span>ציון</span>
            <strong>${item.score.toFixed(0)}</strong>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="advanced-search-compare-actions">
        <label class="advanced-search-select-all">
          <input type="checkbox" id="advanced-search-select-all-results">
          <span>בחר הכל</span>
        </label>
        <button type="button" class="advanced-search-h2h-btn" id="advanced-search-h2h-btn" disabled>
          <i class="fas fa-balance-scale" aria-hidden="true"></i>
          בצע השוואה
        </button>
        <button type="button" class="advanced-search-sandbox-btn" id="advanced-search-sandbox-btn" disabled>
          <i class="fas fa-flask" aria-hidden="true"></i>
          הוסף למעבדה שלי
        </button>
        <div class="advanced-search-selection-status" id="advanced-search-selection-status" hidden></div>
      </div>
      <div class="advanced-search-compare-wrap">
        <table class="advanced-search-compare-table">
          <thead>
            <tr>
              <th>קופה</th>
              <th class="advanced-search-compare-select">בחר</th>
              ${headerCols}
              <th>התאמה</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.advanced-search-compare-row').forEach(row => {
      row.addEventListener('click', () => {
        const fundId = row.dataset.fundid;
        if (!fundId || !state.activeCategoryId) return;
        window.location.href = `fund.html?id=${fundId}&cat=${state.activeCategoryId}`;
      });
    });
  }

  async function runAdvancedSearch() {
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    if (!selectedParams.length) {
      setAdvancedSearchStatus('בחר לפחות פרמטר אחד לחיפוש.');
      renderAdvancedSearchResults();
      return;
    }

    const uniqueMetricIds = new Set(selectedParams.map(param => param.metricId));
    if (uniqueMetricIds.size !== selectedParams.length) {
      setAdvancedSearchStatus('כל פרמטר יכול להיבחר פעם אחת בלבד.');
      return;
    }

    saveAdvancedSearchToHistory(selectedParams);

    const candidates = getAdvancedSearchCandidates();
    if (!candidates.length) {
      state.advancedSearch.results = [];
      setAdvancedSearchStatus('לא נמצאו קופות זמינות בקטגוריה ובסינון הנוכחי.');
      renderAdvancedSearchResults();
      return;
    }

    state.advancedSearch.loading = true;
    setAdvancedSearchStatus('מחשב את דירוג ההתאמה...');
    await ensureAdvancedSearchMetricsLoaded();

    const metricStats = new Map();
    selectedParams.forEach(param => {
      const values = candidates
        .map(candidate => getAdvancedMetricRaw(candidate, param.metricId))
        .filter(value => Number.isFinite(value));
      metricStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const ranked = candidates.map(candidate => {
      let scoreSum = 0;
      let totalCount = 0;
      let missingCount = 0;
      const reasons = [];

      selectedParams.forEach(param => {
        const raw = getAdvancedMetricRaw(candidate, param.metricId);
        const stats = metricStats.get(param.metricId) || { min: NaN, max: NaN };
        let normalized = 0.35;

        if (Number.isFinite(raw)) {
          if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max !== stats.min) {
            normalized = (raw - stats.min) / (stats.max - stats.min);
          } else {
            normalized = 1;
          }
          const desiredDirection = state.advancedSearch.mode === 'worst'
            ? flipAdvancedDirection(param.direction)
            : param.direction;
          if (desiredDirection === 'low') normalized = 1 - normalized;
          reasons.push({
            contribution: normalized,
            text: `<strong>${getAdvancedMetricLabel(param.metricId)}</strong>: ${formatAdvancedMetricValue(param.metricId, raw)}`
          });
        } else {
          missingCount += 1;
          reasons.push({
            contribution: -1,
            text: `חסר נתון עבור <strong>${getAdvancedMetricLabel(param.metricId)}</strong>`
          });
        }

        scoreSum += normalized;
        totalCount += 1;
      });

      let score = totalCount ? (scoreSum / totalCount) * 100 : 0;
      if (missingCount >= 2) score *= 0.78;
      else if (missingCount === 1) score *= 0.9;

      return {
        ...candidate,
        score,
        reasons: reasons
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 3)
          .map(reason => reason.text)
      };
    }).sort((a, b) => b.score - a.score).slice(0, 5);

    state.advancedSearch.loading = false;
    state.advancedSearch.results = ranked;
    setAdvancedSearchStatus(ranked.length ? `נמצאו ${ranked.length} תוצאות מובילות לפי הקריטריונים שבחרת.` : 'לא נמצאו תוצאות.');
    renderAdvancedSearchResults();
  }

  function renderAdvancedSearchRows() {
    const container = document.getElementById('advanced-search-rows');
    if (!container) return;

    const metrics = getAvailableAdvancedMetrics();
    const usedMetricIds = state.advancedSearch.params.map(param => param.metricId).filter(Boolean);

    container.innerHTML = state.advancedSearch.params.map((param, index) => {
      const metricOptions = metrics.map(metric => {
        const disabled = metric.id !== param.metricId && usedMetricIds.includes(metric.id);
        return `<option value="${metric.id}" ${param.metricId === metric.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${metric.label}</option>`;
      }).join('');

      return `
        <div class="advanced-search-row" data-adv-row="${param.id}">
          <div class="advanced-search-field">
            <label for="adv-metric-${param.id}">פרמטר ${index + 1}</label>
            <select id="adv-metric-${param.id}" data-adv-input="metric">
              <option value="">בחר פרמטר</option>
              ${metricOptions}
            </select>
          </div>
          <div class="advanced-search-field">
            <label for="adv-direction-${param.id}">כיוון</label>
            <select id="adv-direction-${param.id}" data-adv-input="direction">
              <option value="high" ${param.direction === 'high' ? 'selected' : ''}>${ADVANCED_SEARCH_DIRECTION_LABELS.high}</option>
              <option value="low" ${param.direction === 'low' ? 'selected' : ''}>${ADVANCED_SEARCH_DIRECTION_LABELS.low}</option>
            </select>
          </div>
          <button type="button" class="advanced-search-remove" data-adv-remove="${param.id}" aria-label="הסר פרמטר">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-adv-input]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-adv-row]');
        const param = state.advancedSearch.params.find(item => item.id === row?.dataset.advRow);
        if (!param) return;
        param.metricId = row.querySelector('[data-adv-input="metric"]')?.value || '';
        param.direction = row.querySelector('[data-adv-input="direction"]')?.value === 'low' ? 'low' : 'high';
        if (input.dataset.advInput === 'metric') renderAdvancedSearchRows();
      });
    });

    container.querySelectorAll('[data-adv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.advancedSearch.params = state.advancedSearch.params.filter(param => param.id !== btn.dataset.advRemove);
        if (!state.advancedSearch.params.length) state.advancedSearch.params = [createAdvancedSearchParam()];
        renderAdvancedSearchRows();
      });
    });
  }

  function renderAdvancedSearchResults() {
    const container = document.getElementById('advanced-search-results');
    if (!container) return;
    container.classList.add('compact-list');

    if (!state.advancedSearch.results.length) {
      container.innerHTML = `
        <div class="advanced-search-empty">
          בחר פרמטר אחד או יותר ולחץ על "מצא 5 תוצאות" כדי לקבל דירוג חכם של הקופות בקטגוריה הנוכחית.
        </div>
      `;
      return;
    }

    container.innerHTML = state.advancedSearch.results.map((item, index) => `
      <article class="advanced-search-card" data-fundid="${item.fundId}">
        <div class="advanced-search-card-head">
          <div>
            <h4 class="advanced-search-fund">${index + 1}. ${item.providerName}</h4>
            <div class="advanced-search-card-category">${item.categoryLabel || ''}</div>
          </div>
          <div class="advanced-search-score">
            <span class="advanced-search-score-label">ציון התאמה</span>
            <span class="advanced-search-score-value">${item.score.toFixed(0)}</span>
          </div>
        </div>
        <div class="advanced-search-card-meta">
          <span class="advanced-search-track-name"><i class="fas fa-layer-group" aria-hidden="true"></i>${item.trackLabel}</span>
          <span><i class="fas fa-hashtag" aria-hidden="true"></i>${item.fundId}</span>
        </div>
        <ul class="advanced-search-reasons">
          ${item.reasons.map(reason => `<li>${reason}</li>`).join('')}
        </ul>
      </article>
    `).join('');

    container.querySelectorAll('.advanced-search-card').forEach(card => {
      card.addEventListener('click', () => {
        const fundId = card.dataset.fundid;
        if (!fundId || !state.activeCategoryId) return;
        window.location.href = `fund.html?id=${fundId}&cat=${state.activeCategoryId}`;
      });
    });
  }

  async function runAdvancedSearch() {
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    if (!selectedParams.length) {
      setAdvancedSearchStatus('בחר לפחות פרמטר אחד לחיפוש.');
      renderAdvancedSearchResults();
      return;
    }

    const uniqueMetricIds = new Set(selectedParams.map(param => param.metricId));
    if (uniqueMetricIds.size !== selectedParams.length) {
      setAdvancedSearchStatus('כל פרמטר יכול להיבחר פעם אחת בלבד.');
      return;
    }

    const candidates = getAdvancedSearchCandidates();
    if (!candidates.length) {
      state.advancedSearch.results = [];
      setAdvancedSearchStatus('לא נמצאו קופות זמינות בקטגוריה ובסינון הנוכחי.');
      renderAdvancedSearchResults();
      return;
    }

    state.advancedSearch.loading = true;
    setAdvancedSearchStatus('מחשב את דירוג ההתאמה...');
    await ensureAdvancedSearchMetricsLoaded();

    const metricStats = new Map();
    selectedParams.forEach(param => {
      const values = candidates
        .map(candidate => getAdvancedMetricRaw(candidate, param.metricId))
        .filter(value => Number.isFinite(value));
      metricStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const ranked = candidates.map(candidate => {
      let scoreSum = 0;
      let totalCount = 0;
      let missingCount = 0;
      const reasons = [];
      const sortValues = [];

      selectedParams.forEach(param => {
        const raw = getAdvancedMetricRaw(candidate, param.metricId);
        const stats = metricStats.get(param.metricId) || { min: NaN, max: NaN };
        let normalized = 0.35;

        if (Number.isFinite(raw)) {
          if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max !== stats.min) {
            normalized = (raw - stats.min) / (stats.max - stats.min);
          } else {
            normalized = 1;
          }
          if (param.direction === 'low') normalized = 1 - normalized;
          reasons.push({
            contribution: normalized,
            text: `<strong>${getAdvancedMetricLabel(param.metricId)}</strong>: ${formatAdvancedMetricValue(param.metricId, raw)}`
          });
          sortValues.push(normalized);
        } else {
          missingCount += 1;
          reasons.push({
            contribution: -1,
            text: `חסר נתון עבור <strong>${getAdvancedMetricLabel(param.metricId)}</strong>`
          });
          sortValues.push(-1);
        }

        scoreSum += normalized;
        totalCount += 1;
      });

      let score = totalCount ? (scoreSum / totalCount) * 100 : 0;
      if (missingCount >= 2) score *= 0.78;
      else if (missingCount === 1) score *= 0.9;

      return {
        ...candidate,
        categoryLabel: candidate.fundName,
        score,
        sortValues,
        reasons: reasons
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 4)
          .map(reason => reason.text)
      };
    }).sort((a, b) => {
      for (let i = 0; i < selectedParams.length; i += 1) {
        const av = a.sortValues[i] ?? -1;
        const bv = b.sortValues[i] ?? -1;
        if (av !== bv) return bv - av;
      }
      return b.score - a.score;
    }).slice(0, 5);

    state.advancedSearch.loading = false;
    state.advancedSearch.results = ranked;
    setAdvancedSearchStatus(ranked.length ? `נמצאו ${ranked.length} תוצאות מובילות לפי הקריטריונים שבחרת.` : 'לא נמצאו תוצאות.');
    renderAdvancedSearchResults();
  }

  function renderAdvancedSearchResults() {
    const container = document.getElementById('advanced-search-results');
    if (!container) return;
    container.classList.add('compact-list');

    if (!state.advancedSearch.results.length) {
      container.innerHTML = `
        <div class="advanced-search-empty">
          בחר פרמטר אחד או יותר ולחץ על "מצא 5 תוצאות" כדי לקבל דירוג חכם של הקופות בקטגוריה הנוכחית.
        </div>
      `;
      return;
    }

    container.innerHTML = state.advancedSearch.results.map((item, index) => `
      <article class="advanced-search-card" data-fundid="${item.fundId}">
        <div class="advanced-search-card-head">
          <div class="advanced-search-title-wrap">
            <span class="advanced-search-rank">${index + 1}</span>
            <div>
              <h4 class="advanced-search-fund">${item.providerName} ${item.categoryLabel ? `· ${item.categoryLabel}` : ''}</h4>
            </div>
          </div>
          <div class="advanced-search-score">
            <span class="advanced-search-score-label">ציון התאמה</span>
            <span class="advanced-search-score-value">${item.score.toFixed(0)}</span>
          </div>
        </div>
        <div class="advanced-search-card-meta">
          <span class="advanced-search-track-name"><i class="fas fa-layer-group" aria-hidden="true"></i>${item.trackLabel}</span>
          <span><i class="fas fa-hashtag" aria-hidden="true"></i>${item.fundId}</span>
        </div>
        <ul class="advanced-search-reasons">
          ${item.reasons.map(reason => `<li>${reason}</li>`).join('')}
        </ul>
      </article>
    `).join('');

    container.querySelectorAll('.advanced-search-card').forEach(card => {
      card.addEventListener('click', () => {
        const fundId = card.dataset.fundid;
        if (!fundId || !state.activeCategoryId) return;
        window.location.href = `fund.html?id=${fundId}&cat=${state.activeCategoryId}`;
      });
    });
  }

  async function runAdvancedSearch() {
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    if (!selectedParams.length) {
      setAdvancedSearchStatus('בחר לפחות פרמטר אחד לחיפוש.');
      renderAdvancedSearchResults();
      return;
    }

    const uniqueMetricIds = new Set(selectedParams.map(param => param.metricId));
    if (uniqueMetricIds.size !== selectedParams.length) {
      setAdvancedSearchStatus('כל פרמטר יכול להיבחר פעם אחת בלבד.');
      return;
    }

    const candidates = getAdvancedSearchCandidates();
    if (!candidates.length) {
      state.advancedSearch.results = [];
      setAdvancedSearchStatus('לא נמצאו קופות זמינות בקטגוריה ובסינון הנוכחי.');
      renderAdvancedSearchResults();
      return;
    }

    state.advancedSearch.loading = true;
    setAdvancedSearchStatus('מחשב את דירוג ההתאמה...');
    await ensureAdvancedSearchMetricsLoaded();

    const metricStats = new Map();
    selectedParams.forEach(param => {
      const values = candidates
        .map(candidate => getAdvancedMetricRaw(candidate, param.metricId))
        .filter(value => Number.isFinite(value));
      metricStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const ranked = candidates.map(candidate => {
      let scoreSum = 0;
      let totalCount = 0;
      let missingCount = 0;
      const reasons = [];
      const sortValues = [];

      selectedParams.forEach(param => {
        const raw = getAdvancedMetricRaw(candidate, param.metricId);
        const stats = metricStats.get(param.metricId) || { min: NaN, max: NaN };
        let normalized = 0.35;

        if (Number.isFinite(raw)) {
          if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max !== stats.min) {
            normalized = (raw - stats.min) / (stats.max - stats.min);
          } else {
            normalized = 1;
          }
          if (param.direction === 'low') normalized = 1 - normalized;
          reasons.push({
            contribution: normalized,
            text: `<strong>${getAdvancedMetricLabel(param.metricId)}</strong>: <span class="advanced-search-reason-value">${formatAdvancedMetricValue(param.metricId, raw)}</span>`
          });
          sortValues.push(normalized);
        } else {
          missingCount += 1;
          reasons.push({
            contribution: -1,
            text: `חסר נתון עבור <strong>${getAdvancedMetricLabel(param.metricId)}</strong>`
          });
          sortValues.push(-1);
        }

        scoreSum += normalized;
        totalCount += 1;
      });

      let score = totalCount ? (scoreSum / totalCount) * 100 : 0;
      if (missingCount >= 2) score *= 0.78;
      else if (missingCount === 1) score *= 0.9;

      return {
        ...candidate,
        categoryLabel: candidate.fundName,
        score,
        sortValues,
        reasons: reasons
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 4)
          .map(reason => reason.text)
      };
    }).sort((a, b) => {
      for (let i = 0; i < selectedParams.length; i += 1) {
        const av = a.sortValues[i] ?? -1;
        const bv = b.sortValues[i] ?? -1;
        if (av !== bv) return bv - av;
      }
      return b.score - a.score;
    }).slice(0, 5);

    state.advancedSearch.loading = false;
    state.advancedSearch.results = ranked;
    setAdvancedSearchStatus(ranked.length ? `נמצאו ${ranked.length} תוצאות מובילות לפי הקריטריונים שבחרת.` : 'לא נמצאו תוצאות.');
    renderAdvancedSearchResults();
  }

  function renderAdvancedSearchRows() {
    const container = document.getElementById('advanced-search-rows');
    if (!container) return;

    const metrics = getAvailableAdvancedMetrics();
    const usedMetricIds = state.advancedSearch.params.map(param => param.metricId).filter(Boolean);

    container.innerHTML = state.advancedSearch.params.map((param, index) => {
      const metricOptions = metrics.map(metric => {
        const disabled = metric.id !== param.metricId && usedMetricIds.includes(metric.id);
        return `<option value="${metric.id}" ${param.metricId === metric.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${metric.label}</option>`;
      }).join('');

      return `
        <div class="advanced-search-row" data-adv-row="${param.id}">
          <div class="advanced-search-field">
            <label for="adv-metric-${param.id}">פרמטר ${index + 1}</label>
            <select id="adv-metric-${param.id}" data-adv-input="metric">
              <option value="">בחר פרמטר</option>
              ${metricOptions}
            </select>
          </div>
          <div class="advanced-search-field">
            <label for="adv-direction-${param.id}">כיוון</label>
            <select id="adv-direction-${param.id}" data-adv-input="direction">
              <option value="high" ${param.direction === 'high' ? 'selected' : ''}>${ADVANCED_SEARCH_DIRECTION_LABELS.high}</option>
              <option value="low" ${param.direction === 'low' ? 'selected' : ''}>${ADVANCED_SEARCH_DIRECTION_LABELS.low}</option>
            </select>
          </div>
          <button type="button" class="advanced-search-remove" data-adv-remove="${param.id}" aria-label="הסר פרמטר">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-adv-input]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-adv-row]');
        const param = state.advancedSearch.params.find(item => item.id === row?.dataset.advRow);
        if (!param) return;
        param.metricId = row.querySelector('[data-adv-input="metric"]')?.value || '';
        param.direction = row.querySelector('[data-adv-input="direction"]')?.value === 'low' ? 'low' : 'high';
        if (input.dataset.advInput === 'metric') renderAdvancedSearchRows();
      });
    });

    container.querySelectorAll('[data-adv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.advancedSearch.params = state.advancedSearch.params.filter(param => param.id !== btn.dataset.advRemove);
        if (!state.advancedSearch.params.length) state.advancedSearch.params = [createAdvancedSearchParam()];
        renderAdvancedSearchRows();
      });
    });

    const addBtn = document.getElementById('advanced-search-add-row');
    if (addBtn) addBtn.hidden = state.advancedSearch.params.length >= 4;
  }

  function renderAdvancedSearchResults() {
    const container = document.getElementById('advanced-search-results');
    if (!container) return;
    container.classList.add('compact-list');

    if (!state.advancedSearch.results.length) {
      container.innerHTML = `
        <div class="advanced-search-empty">
          בחר פרמטר אחד או יותר ולחץ על "מצא 5 תוצאות" כדי לקבל דירוג חכם של הקופות בקטגוריה הנוכחית.
        </div>
      `;
      return;
    }

    container.innerHTML = state.advancedSearch.results.map((item, index) => `
      <article class="advanced-search-card" data-fundid="${item.fundId}">
        <div class="advanced-search-card-head">
          <div class="advanced-search-title-wrap">
            <span class="advanced-search-rank">${index + 1}</span>
            <h4 class="advanced-search-fund">${item.providerName}</h4>
          </div>
          <div class="advanced-search-score">
            <span class="advanced-search-score-label">ציון התאמה</span>
            <span class="advanced-search-score-value">${item.score.toFixed(0)}</span>
          </div>
        </div>
        <div class="advanced-search-card-meta">
          <span class="advanced-search-track-name"><i class="fas fa-layer-group" aria-hidden="true"></i>${item.trackLabel}</span>
          <span><i class="fas fa-hashtag" aria-hidden="true"></i>${item.fundId}</span>
        </div>
        <ul class="advanced-search-reasons">
          ${item.reasons.map(reason => `<li>${reason}</li>`).join('')}
        </ul>
      </article>
    `).join('');

    container.querySelectorAll('.advanced-search-card').forEach(card => {
      card.addEventListener('click', () => {
        const fundId = card.dataset.fundid;
        if (!fundId || !state.activeCategoryId) return;
        window.location.href = `fund.html?id=${fundId}&cat=${state.activeCategoryId}`;
      });
    });
  }

  async function runAdvancedSearch() {
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    if (!selectedParams.length) {
      setAdvancedSearchStatus('בחר לפחות פרמטר אחד לחיפוש.');
      renderAdvancedSearchResults();
      return;
    }

    const uniqueMetricIds = new Set(selectedParams.map(param => param.metricId));
    if (uniqueMetricIds.size !== selectedParams.length) {
      setAdvancedSearchStatus('כל פרמטר יכול להיבחר פעם אחת בלבד.');
      return;
    }

    const candidates = getAdvancedSearchCandidates();
    if (!candidates.length) {
      state.advancedSearch.results = [];
      setAdvancedSearchStatus('לא נמצאו קופות זמינות בקטגוריה ובסינון הנוכחי.');
      renderAdvancedSearchResults();
      return;
    }

    state.advancedSearch.loading = true;
    setAdvancedSearchStatus('מחשב את דירוג ההתאמה...');
    await ensureAdvancedSearchMetricsLoaded();

    const metricStats = new Map();
    selectedParams.forEach(param => {
      const values = candidates
        .map(candidate => getAdvancedMetricRaw(candidate, param.metricId))
        .filter(value => Number.isFinite(value));
      metricStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const ranked = candidates.map(candidate => {
      let scoreSum = 0;
      let totalCount = 0;
      let missingCount = 0;
      const reasons = [];
      const sortValues = [];

      selectedParams.forEach(param => {
        const raw = getAdvancedMetricRaw(candidate, param.metricId);
        const stats = metricStats.get(param.metricId) || { min: NaN, max: NaN };
        let normalized = 0.35;

        if (Number.isFinite(raw)) {
          if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max !== stats.min) {
            normalized = (raw - stats.min) / (stats.max - stats.min);
          } else {
            normalized = 1;
          }
          if (param.direction === 'low') normalized = 1 - normalized;
          sortValues.push(normalized);
          reasons.push({
            text: `<strong>${getAdvancedMetricLabel(param.metricId)}</strong>: <span class="advanced-search-reason-value">${formatAdvancedMetricValue(param.metricId, raw)}</span>`
          });
        } else {
          missingCount += 1;
          sortValues.push(-1);
          reasons.push({
            text: `חסר נתון עבור <strong>${getAdvancedMetricLabel(param.metricId)}</strong>`
          });
        }

        scoreSum += normalized;
        totalCount += 1;
      });

      let score = totalCount ? (scoreSum / totalCount) * 100 : 0;
      if (missingCount >= 2) score *= 0.78;
      else if (missingCount === 1) score *= 0.9;

      return {
        ...candidate,
        score,
        sortValues,
        reasons: reasons.map(reason => reason.text)
      };
    }).sort((a, b) => {
      for (let i = 0; i < selectedParams.length; i += 1) {
        const av = a.sortValues[i] ?? -1;
        const bv = b.sortValues[i] ?? -1;
        if (av !== bv) return bv - av;
      }
      return b.score - a.score;
    }).slice(0, 5);

    state.advancedSearch.loading = false;
    state.advancedSearch.results = ranked;
    setAdvancedSearchStatus(ranked.length ? `נמצאו ${ranked.length} תוצאות מובילות לפי הקריטריונים שבחרת.` : 'לא נמצאו תוצאות.');
    renderAdvancedSearchResults();
  }

  async function compareAdvancedSearchSelection(fundIds) {
    if (!Array.isArray(fundIds) || fundIds.length < 2) {
      setAdvancedSearchStatus('בחר לפחות 2 קופות להשוואה.');
      return;
    }

    const catId = state.activeCategoryId;
    const cat = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === catId);
    if (!cat) return;

    const selectedSet = new Set(fundIds.map(String));
    const selectedResults = state.advancedSearch.results.filter(item => selectedSet.has(String(item.fundId)));
    if (selectedResults.length < 2) {
      setAdvancedSearchStatus('בחר לפחות 2 קופות להשוואה.');
      return;
    }

    setAdvancedSearchStatus('מכין את ההשוואה בראש בראש...');
    const cached = await h2hFetchCatData(catId);
    state.h2h.items = [];
    invalidateH2HYearData();
    const existingKeys = new Set(state.h2h.items.map(item => `${item.catId}::${item.record.FUND_ID}`));

    selectedResults.forEach(item => {
      const uniqueKey = `${catId}::${item.record.FUND_ID}`;
      if (existingKeys.has(uniqueKey)) return;
      existingKeys.add(uniqueKey);
      state.h2h.items.push({
        catId,
        catLabel: cat.label,
        trackId: item.trackId,
        trackLabel: item.trackLabel,
        record: item.record,
        provName: item.providerName,
        yields12M: cached?.yields12M || null,
        sharpeMap: cached?.sharpeMap || null,
        consistencyMap: cached?.consistencyMap || null,
        stdDevMap: cached?.stdDevMap || null,
        momentumMap: cached?.momentumMap || null,
        actuarialByProvider: cached?.actuarialByProvider || null,
      });
    });

    closeAdvancedSearch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    persistH2HState();
    switchToH2H();
  }

  function addAdvancedSearchSelectionToSandbox(fundIds) {
    if (!Array.isArray(fundIds) || !fundIds.length) {
      setAdvancedSearchSelectionStatus('בחר לפחות קופה אחת להוספה למעבדה.');
      return;
    }

    const catId = state.activeCategoryId;
    const cat = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === catId);
    if (!cat) return;

    const selectedSet = new Set(fundIds.map(String));
    const selectedResults = state.advancedSearch.results.filter(item => selectedSet.has(String(item.fundId)));
    let added = 0;
    let skipped = 0;

    selectedResults.forEach(item => {
      const record = item.record || {};
      const fundId = String(item.fundId || record.FUND_ID || '').trim();
      if (!fundId || isInSandboxPortfolio(fundId, item.trackId, catId)) {
        skipped += 1;
        return;
      }

      const stockRaw = calcExposurePercentValue(record.STOCK_MARKET_EXPOSURE, record.TOTAL_ASSETS)?.toFixed(2) ?? '';
      const abroadRaw = calcExposurePercentValue(record.FOREIGN_EXPOSURE, record.TOTAL_ASSETS)?.toFixed(2) ?? '';
      const fxRaw = calcExposurePercentValue(record.FOREIGN_CURRENCY_EXPOSURE, record.TOTAL_ASSETS)?.toFixed(2) ?? '';
      const y12m = state.advancedSearch.metricMaps?.yield12mMap?.get(fundId);

      state.sandbox.portfolio.push({
        fundId,
        fundName: record.FUND_NAME || item.fundName || '',
        provider: item.providerName,
        trackId: item.trackId,
        trackLabel: item.trackLabel,
        categoryId: catId,
        categoryLabel: cat.label,
        y1: record.MONTHLY_YIELD != null ? String(record.MONTHLY_YIELD) : '',
        y3: record.YEAR_TO_DATE_YIELD != null ? String(record.YEAR_TO_DATE_YIELD) : '',
        y5: record.YIELD_TRAILING_3_YRS != null ? String(record.YIELD_TRAILING_3_YRS) : '',
        y12m: y12m != null ? String(y12m) : '',
        y5yr: record.YIELD_TRAILING_5_YRS != null ? String(record.YIELD_TRAILING_5_YRS) : '',
        stock: stockRaw,
        abroad: abroadRaw,
        fx: fxRaw,
        color: providerColor(item.providerName),
        reportPeriod: record.REPORT_PERIOD ? String(record.REPORT_PERIOD) : '',
        dnCumulative: _sbDefaultFee(catId),
        dnDeposit: _sbDefaultFeeDeposit(catId),
        investAmount: '',
        investPct: '',
        investMode: 'amount'
      });
      added += 1;
    });

    state.sandbox.selections = state.sandbox.selections.filter(sel => !selectedSet.has(String(sel.fundId)));
    saveSandboxPortfolio();
    updateSandboxBar();
    _sbUpdateTabBadge();
    setAdvancedSearchStatus('');

    if (added) {
      setAdvancedSearchSelectionStatus(`נוספו ${added} מסלולים למעבדה${skipped ? ` (${skipped} כבר היו קיימים)` : ''}.`, true);
    } else {
      setAdvancedSearchSelectionStatus('המסלולים שסימנת כבר קיימים במעבדה.', true);
    }
  }

  function setAdvancedSearchSelectionStatus(message = '', showSandboxButton = false) {
    const el = document.getElementById('advanced-search-selection-status');
    if (!el) return;
    el.textContent = '';
    el.hidden = !message;
    if (!message) return;

    const text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);

    if (showSandboxButton) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'advanced-search-go-sandbox-btn';
      btn.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i><span>מעבר למעבדה</span>';
      btn.addEventListener('click', event => {
        event.stopPropagation();
        closeAdvancedSearch();
        switchToSandbox();
      });
      el.appendChild(btn);
    }
  }

  renderAdvancedSearchResults = function() {
    const container = document.getElementById('advanced-search-results');
    if (!container) return;
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);

    if (!state.advancedSearch.results.length) {
      container.innerHTML = `
        <div class="advanced-search-empty">
          בחר פרמטר אחד או יותר ולחץ על "מצא 5 תוצאות" כדי לקבל השוואה רוחבית בין הקופות.
        </div>
      `;
      return;
    }

    const colStats = new Map();
    selectedParams.forEach(param => {
      const values = state.advancedSearch.results
        .map(item => getAdvancedMetricRaw(item, param.metricId))
        .filter(value => Number.isFinite(value));
      colStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const getCellTone = (metricId, raw, direction) => {
      if (!Number.isFinite(raw)) return 'is-missing';
      const stats = colStats.get(metricId) || { min: NaN, max: NaN };
      if (!Number.isFinite(stats.min) || !Number.isFinite(stats.max) || stats.min === stats.max) return 'is-best';
      let normalized = (raw - stats.min) / (stats.max - stats.min);
      if (direction === 'low') normalized = 1 - normalized;
      if (normalized >= 0.82) return 'is-best';
      if (normalized >= 0.58) return 'is-good';
      if (normalized >= 0.34) return 'is-mid';
      return 'is-low';
    };

    const headerCols = selectedParams.map(param => `<th>${getAdvancedMetricLabel(param.metricId)}</th>`).join('');
    const bodyRows = state.advancedSearch.results.map((item, index) => {
      const metricCols = selectedParams.map(param => {
        const raw = getAdvancedMetricRaw(item, param.metricId);
        const tone = getCellTone(param.metricId, raw, param.direction);
        return `<td class="advanced-search-compare-value ${tone}">
          <span class="advanced-search-compare-label">${getAdvancedMetricLabel(param.metricId)}</span>
          <strong>${Number.isFinite(raw) ? formatAdvancedMetricValue(param.metricId, raw) : 'אין נתון'}</strong>
        </td>`;
      }).join('');

      return `
        <tr class="advanced-search-compare-row" data-fundid="${item.fundId}">
          <td class="advanced-search-compare-select">
            <input type="checkbox" class="advanced-search-select-fund" data-adv-compare-fund="${item.fundId}" aria-label="בחר את ${item.providerName} להשוואה">
          </td>
          <td class="advanced-search-compare-company">
            <span class="advanced-search-rank">${index + 1}</span>
            <div>
              <strong>${item.providerName} <span class="adv-fund-id">#${item.fundId}</span></strong>
              <small class="adv-track-label">${item.trackLabel}</small>
            </div>
          </td>
          ${metricCols}
          <td class="advanced-search-compare-score">
            <span>ציון</span>
            <strong>${item.score.toFixed(0)}</strong>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="advanced-search-compare-wrap">
        <table class="advanced-search-compare-table">
          <thead>
            <tr>
              <th>קופה</th>
              ${headerCols}
              <th>התאמה</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.advanced-search-compare-row').forEach(row => {
      row.addEventListener('click', () => {
        const fundId = row.dataset.fundid;
        if (!fundId || !state.activeCategoryId) return;
        window.location.href = `fund.html?id=${fundId}&cat=${state.activeCategoryId}`;
      });
    });
  };

  renderAdvancedSearchRows = function() {
    const container = document.getElementById('advanced-search-rows');
    if (!container) return;

    const metrics = getAvailableAdvancedMetrics();
    const usedMetricIds = state.advancedSearch.params.map(param => param.metricId).filter(Boolean);

    container.innerHTML = state.advancedSearch.params.map((param, index) => {
      const metricOptions = metrics.map(metric => {
        const disabled = metric.id !== param.metricId && usedMetricIds.includes(metric.id);
        return `<option value="${metric.id}" ${param.metricId === metric.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${metric.label}</option>`;
      }).join('');

      const rangeFields = (param.direction === 'between')
        ? `<div class="advanced-search-range-fields">
            <input type="number" step="any" placeholder="מינימום" value="${param.minValue ?? ''}" data-adv-input="minValue" />
            <input type="number" step="any" placeholder="מקסימום" value="${param.maxValue ?? ''}" data-adv-input="maxValue" />
          </div>`
        : `<div class="advanced-search-field">
            <label>&nbsp;</label>
            <div></div>
          </div>`;

      return `
        <div class="advanced-search-row" data-adv-row="${param.id}">
          <div class="advanced-search-field">
            <label for="adv-metric-${param.id}">פרמטר ${index + 1}</label>
            <select id="adv-metric-${param.id}" data-adv-input="metric">
              <option value="">בחר פרמטר</option>
              ${metricOptions}
            </select>
          </div>
          <div class="advanced-search-field">
            <label for="adv-direction-${param.id}">כיוון</label>
            <select id="adv-direction-${param.id}" data-adv-input="direction">
              <option value="high" ${param.direction === 'high' ? 'selected' : ''}>הכי גבוה</option>
              <option value="low" ${param.direction === 'low' ? 'selected' : ''}>הכי נמוך</option>
              <option value="between" ${param.direction === 'between' ? 'selected' : ''}>בין לבין</option>
            </select>
          </div>
          ${rangeFields}
          <button type="button" class="advanced-search-remove" data-adv-remove="${param.id}" aria-label="הסר פרמטר">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-adv-input]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-adv-row]');
        const param = state.advancedSearch.params.find(item => item.id === row?.dataset.advRow);
        if (!param) return;
        param.metricId = row.querySelector('[data-adv-input="metric"]')?.value || '';
        param.direction = row.querySelector('[data-adv-input="direction"]')?.value || 'high';
        param.minValue = row.querySelector('[data-adv-input="minValue"]')?.value || '';
        param.maxValue = row.querySelector('[data-adv-input="maxValue"]')?.value || '';
        renderAdvancedSearchRows();
      });
    });

    container.querySelectorAll('[data-adv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.advancedSearch.params = state.advancedSearch.params.filter(param => param.id !== btn.dataset.advRemove);
        if (!state.advancedSearch.params.length) state.advancedSearch.params = [createAdvancedSearchParam()];
        renderAdvancedSearchRows();
      });
    });

    const addBtn = document.getElementById('advanced-search-add-row');
    if (addBtn) addBtn.hidden = state.advancedSearch.params.length >= 4;
  };

  renderAdvancedSearchRows = function() {
    const container = document.getElementById('advanced-search-rows');
    if (!container) return;

    const metrics = getAvailableAdvancedMetrics();
    const usedMetricIds = state.advancedSearch.params.map(param => param.metricId).filter(Boolean);

    container.innerHTML = state.advancedSearch.params.map((param, index) => {
      const metricOptions = metrics.map(metric => {
        const disabled = metric.id !== param.metricId && usedMetricIds.includes(metric.id);
        return `<option value="${metric.id}" ${param.metricId === metric.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${metric.label}</option>`;
      }).join('');

      const rangeFields = param.direction === 'between'
        ? `<div class="advanced-search-field advanced-search-field-range">
            <label>טווח</label>
            <div class="advanced-search-range-fields">
              <input type="number" step="any" placeholder="מינימום" value="${param.minValue ?? ''}" data-adv-input="minValue" />
              <input type="number" step="any" placeholder="מקסימום" value="${param.maxValue ?? ''}" data-adv-input="maxValue" />
            </div>
          </div>`
        : `<div class="advanced-search-field advanced-search-field-range is-empty" aria-hidden="true">
            <label>&nbsp;</label>
            <div class="advanced-search-range-fields-placeholder"></div>
          </div>`;

      return `
        <div class="advanced-search-row" data-adv-row="${param.id}">
          <button type="button" class="advanced-search-drag" data-adv-drag="${param.id}" draggable="true" aria-label="גרור לשינוי סדר הפרמטר">
            <i class="fas fa-grip-vertical" aria-hidden="true"></i>
          </button>
          <div class="advanced-search-field">
            <label for="adv-metric-${param.id}">פרמטר ${index + 1}</label>
            <select id="adv-metric-${param.id}" data-adv-input="metric">
              <option value="">בחר פרמטר</option>
              ${metricOptions}
            </select>
          </div>
          <div class="advanced-search-field">
            <label for="adv-direction-${param.id}">כיוון</label>
            <select id="adv-direction-${param.id}" data-adv-input="direction">
              <option value="high" ${param.direction === 'high' ? 'selected' : ''}>הכי גבוה</option>
              <option value="low" ${param.direction === 'low' ? 'selected' : ''}>הכי נמוך</option>
              <option value="between" ${param.direction === 'between' ? 'selected' : ''}>בין לבין</option>
            </select>
          </div>
          ${rangeFields}
          <button type="button" class="advanced-search-remove" data-adv-remove="${param.id}" aria-label="הסר פרמטר">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    const reorderParams = (dragId, targetId) => {
      if (!dragId || !targetId || dragId === targetId) return;
      const fromIndex = state.advancedSearch.params.findIndex(param => param.id === dragId);
      const toIndex = state.advancedSearch.params.findIndex(param => param.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const next = [...state.advancedSearch.params];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      state.advancedSearch.params = next;
      state.advancedSearch.reorderPulse = Date.now();
      renderAdvancedSearchRows();
    };

    container.querySelectorAll('[data-adv-drag]').forEach(handle => {
      handle.addEventListener('dragstart', (event) => {
        state.advancedSearch.dragParamId = handle.dataset.advDrag;
        handle.classList.add('is-dragging');
        handle.closest('[data-adv-row]')?.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', handle.dataset.advDrag || '');
        }
      });

      handle.addEventListener('dragend', () => {
        state.advancedSearch.dragParamId = null;
        container.querySelectorAll('.advanced-search-row').forEach(row => row.classList.remove('is-dragging', 'is-drag-over'));
        container.querySelectorAll('.advanced-search-drag').forEach(btn => btn.classList.remove('is-dragging'));
      });
    });

    container.querySelectorAll('[data-adv-row]').forEach(row => {
      row.addEventListener('dragover', (event) => {
        if (!state.advancedSearch.dragParamId || state.advancedSearch.dragParamId === row.dataset.advRow) return;
        event.preventDefault();
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', (event) => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-over');
        reorderParams(state.advancedSearch.dragParamId, row.dataset.advRow);
      });
    });

    container.querySelectorAll('[data-adv-input]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-adv-row]');
        const param = state.advancedSearch.params.find(item => item.id === row?.dataset.advRow);
        if (!param) return;
        param.metricId = row.querySelector('[data-adv-input="metric"]')?.value || '';
        param.direction = row.querySelector('[data-adv-input="direction"]')?.value || 'high';
        param.minValue = row.querySelector('[data-adv-input="minValue"]')?.value || '';
        param.maxValue = row.querySelector('[data-adv-input="maxValue"]')?.value || '';
        state.advancedSearch.emptyMessage = '';
        state.advancedSearch.focusParamId = param.id;
        state.advancedSearch.focusTarget = input.dataset.advInput === 'direction' && param.direction === 'between'
          ? 'minValue'
          : null;
        renderAdvancedSearchRows();
      });
    });

    container.querySelectorAll('[data-adv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.advancedSearch.params = state.advancedSearch.params.filter(param => param.id !== btn.dataset.advRemove);
        if (!state.advancedSearch.params.length) state.advancedSearch.params = [createAdvancedSearchParam()];
        state.advancedSearch.emptyMessage = '';
        renderAdvancedSearchRows();
      });
    });

    const addBtn = document.getElementById('advanced-search-add-row');
    if (addBtn) addBtn.hidden = state.advancedSearch.params.length >= 4;

    if (state.advancedSearch.reorderPulse) {
      requestAnimationFrame(() => {
        container.querySelectorAll('.advanced-search-row').forEach(row => {
          row.classList.add('is-reordered');
          setTimeout(() => row.classList.remove('is-reordered'), 260);
        });
        state.advancedSearch.reorderPulse = null;
      });
    }

    const focusParamId = state.advancedSearch.focusParamId;
    const focusTarget = state.advancedSearch.focusTarget;
    if (focusParamId && focusTarget) {
      requestAnimationFrame(() => {
        const row = container.querySelector(`[data-adv-row="${focusParamId}"]`);
        const field = row?.querySelector(`[data-adv-input="${focusTarget}"]`);
        if (!field) return;
        field.focus();
        if (typeof field.select === 'function' && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA')) field.select();
        if (focusTarget === 'metric' && typeof field.showPicker === 'function') {
          try { field.showPicker(); } catch (err) {}
        }
        state.advancedSearch.focusParamId = null;
        state.advancedSearch.focusTarget = null;
      });
    }
  };

  runAdvancedSearch = async function() {
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    if (!selectedParams.length) {
      setAdvancedSearchStatus('בחר לפחות פרמטר אחד לחיפוש.');
      renderAdvancedSearchResults();
      return;
    }

    const uniqueMetricIds = new Set(selectedParams.map(param => param.metricId));
    if (uniqueMetricIds.size !== selectedParams.length) {
      setAdvancedSearchStatus('כל פרמטר יכול להיבחר פעם אחת בלבד.');
      return;
    }

    const candidates = getAdvancedSearchCandidates();
    if (!candidates.length) {
      state.advancedSearch.results = [];
      setAdvancedSearchStatus('לא נמצאו קופות זמינות בקטגוריה ובסינון הנוכחי.');
      renderAdvancedSearchResults();
      return;
    }

    state.advancedSearch.loading = true;
    setAdvancedSearchStatus('מחשב את דירוג ההתאמה...');
    await ensureAdvancedSearchMetricsLoaded();

    const metricStats = new Map();
    selectedParams.forEach(param => {
      const values = candidates
        .map(candidate => getAdvancedMetricRaw(candidate, param.metricId))
        .filter(value => Number.isFinite(value));
      metricStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const ranked = candidates.map(candidate => {
      let scoreSum = 0;
      let totalCount = 0;
      let missingCount = 0;
      const reasons = [];
      const sortValues = [];

      selectedParams.forEach(param => {
        const raw = getAdvancedMetricRaw(candidate, param.metricId);
        const stats = metricStats.get(param.metricId) || { min: NaN, max: NaN };
        let normalized = 0.35;

        if (Number.isFinite(raw)) {
          if (param.direction === 'between' && param.minValue !== '' && param.maxValue !== '') {
            const minTarget = Number(param.minValue);
            const maxTarget = Number(param.maxValue);
            const center = (minTarget + maxTarget) / 2;
            const span = Math.max(Math.abs(maxTarget - minTarget) / 2, 0.0001);
            normalized = raw >= minTarget && raw <= maxTarget ? 1 : Math.max(0, 1 - (Math.abs(raw - center) / span));
          } else if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max !== stats.min) {
            normalized = (raw - stats.min) / (stats.max - stats.min);
            if (param.direction === 'low') normalized = 1 - normalized;
          } else {
            normalized = 1;
          }

          sortValues.push(normalized);
          reasons.push({
            text: `<strong>${getAdvancedMetricLabel(param.metricId)}</strong>: <span class="advanced-search-reason-value">${formatAdvancedMetricValue(param.metricId, raw)}</span>`
          });
        } else {
          missingCount += 1;
          sortValues.push(-1);
          reasons.push({
            text: `חסר נתון עבור <strong>${getAdvancedMetricLabel(param.metricId)}</strong>`
          });
        }

        scoreSum += normalized;
        totalCount += 1;
      });

      let score = totalCount ? (scoreSum / totalCount) * 100 : 0;
      if (missingCount >= 2) score *= 0.78;
      else if (missingCount === 1) score *= 0.9;

      return {
        ...candidate,
        score,
        sortValues,
        reasons: reasons.map(reason => reason.text)
      };
    }).sort((a, b) => {
      for (let i = 0; i < selectedParams.length; i += 1) {
        const av = a.sortValues[i] ?? -1;
        const bv = b.sortValues[i] ?? -1;
        if (av !== bv) return bv - av;
      }
      return b.score - a.score;
    }).slice(0, 5);

    state.advancedSearch.loading = false;
    state.advancedSearch.results = ranked;
    setAdvancedSearchStatus(ranked.length ? `נמצאו ${ranked.length} תוצאות מובילות לפי הקריטריונים שבחרת.` : 'לא נמצאו תוצאות.');
    renderAdvancedSearchResults();
  };

  renderAdvancedSearchResults = function() {
    const container = document.getElementById('advanced-search-results');
    if (!container) return;
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    const emptyMessage = state.advancedSearch.emptyMessage || 'בחר פרמטר אחד או יותר ולחץ על "מצא 5 תוצאות" כדי לקבל השוואה רוחבית.';

    if (!state.advancedSearch.results.length) {
      container.innerHTML = `
        <div class="advanced-search-empty">
          ${emptyMessage}
        </div>
      `;
      return;
    }

    const colStats = new Map();
    selectedParams.forEach(param => {
      const values = state.advancedSearch.results
        .map(item => getAdvancedMetricRaw(item, param.metricId))
        .filter(value => Number.isFinite(value));
      colStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const getCellTone = (metricId, raw, direction) => {
      if (!Number.isFinite(raw)) return 'is-missing';
      const stats = colStats.get(metricId) || { min: NaN, max: NaN };
      if (!Number.isFinite(stats.min) || !Number.isFinite(stats.max) || stats.min === stats.max) return 'is-best';
      let normalized = (raw - stats.min) / (stats.max - stats.min);
      if (direction === 'low') normalized = 1 - normalized;
      if (normalized >= 0.82) return 'is-best';
      if (normalized >= 0.58) return 'is-good';
      if (normalized >= 0.34) return 'is-mid';
      return 'is-low';
    };

    const headerCols = selectedParams.map(param => `<th>${getAdvancedMetricLabel(param.metricId)}</th>`).join('');
    const bodyRows = state.advancedSearch.results.map((item, index) => {
      const metricCols = selectedParams.map(param => {
        const raw = getAdvancedMetricRaw(item, param.metricId);
        const tone = getCellTone(param.metricId, raw, param.direction);
        return `<td class="advanced-search-compare-value ${tone}">
          <strong>${Number.isFinite(raw) ? formatAdvancedMetricValue(param.metricId, raw) : 'אין נתון'}</strong>
        </td>`;
      }).join('');

      return `
        <tr class="advanced-search-compare-row" data-fundid="${item.fundId}">
          <td class="advanced-search-compare-company">
            <span class="advanced-search-rank">${index + 1}</span>
            <div>
              <strong>${item.providerName} <span class="adv-fund-id">#${item.fundId}</span></strong>
              <small class="adv-track-label"><span class="advanced-search-track-name">${item.trackLabel}</span></small>
            </div>
          </td>
          ${metricCols}
          <td class="advanced-search-compare-score">
            <span>ציון</span>
            <strong>${item.score.toFixed(0)}</strong>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="advanced-search-compare-wrap">
        <table class="advanced-search-compare-table">
          <thead>
            <tr>
              <th>קופה</th>
              ${headerCols}
              <th>התאמה</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.advanced-search-compare-row').forEach(row => {
      row.addEventListener('click', () => {
        const fundId = row.dataset.fundid;
        if (!fundId || !state.activeCategoryId) return;
        window.location.href = `fund.html?id=${fundId}&cat=${state.activeCategoryId}`;
      });
    });
  };

  renderAdvancedSearchRows = function() {
    const container = document.getElementById('advanced-search-rows');
    if (!container) return;

    const metrics = getAvailableAdvancedMetrics();
    const usedMetricIds = state.advancedSearch.params.map(param => param.metricId).filter(Boolean);

    container.innerHTML = state.advancedSearch.params.map((param, index) => {
      const metricOptions = metrics.map(metric => {
        const disabled = metric.id !== param.metricId && usedMetricIds.includes(metric.id);
        return `<option value="${metric.id}" ${param.metricId === metric.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${metric.label}</option>`;
      }).join('');

      const rangeFields = param.direction === 'between'
        ? `<div class="advanced-search-field advanced-search-field-range">
            <label>טווח</label>
            <div class="advanced-search-range-fields">
              <input type="number" step="any" placeholder="מינימום" value="${param.minValue ?? ''}" data-adv-input="minValue" />
              <input type="number" step="any" placeholder="מקסימום" value="${param.maxValue ?? ''}" data-adv-input="maxValue" />
            </div>
          </div>`
        : `<div class="advanced-search-field advanced-search-field-range is-empty" aria-hidden="true">
            <label>&nbsp;</label>
            <div class="advanced-search-range-fields-placeholder"></div>
          </div>`;

      return `
        <div class="advanced-search-row" data-adv-row="${param.id}">
          <div class="advanced-search-field">
            <label for="adv-metric-${param.id}">פרמטר ${index + 1}</label>
            <select id="adv-metric-${param.id}" data-adv-input="metric">
              <option value="">בחר פרמטר</option>
              ${metricOptions}
            </select>
          </div>
          <div class="advanced-search-field">
            <label for="adv-direction-${param.id}">כיוון</label>
            <select id="adv-direction-${param.id}" data-adv-input="direction">
              <option value="high" ${param.direction === 'high' ? 'selected' : ''}>הכי גבוה</option>
              <option value="low" ${param.direction === 'low' ? 'selected' : ''}>הכי נמוך</option>
              <option value="between" ${param.direction === 'between' ? 'selected' : ''}>בין לבין</option>
            </select>
          </div>
          ${rangeFields}
          <button type="button" class="advanced-search-remove" data-adv-remove="${param.id}" aria-label="הסר פרמטר">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-adv-input]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-adv-row]');
        const param = state.advancedSearch.params.find(item => item.id === row?.dataset.advRow);
        if (!param) return;
        param.metricId = row.querySelector('[data-adv-input="metric"]')?.value || '';
        param.direction = row.querySelector('[data-adv-input="direction"]')?.value || 'high';
        param.minValue = row.querySelector('[data-adv-input="minValue"]')?.value || '';
        param.maxValue = row.querySelector('[data-adv-input="maxValue"]')?.value || '';
        state.advancedSearch.emptyMessage = '';
        state.advancedSearch.focusParamId = param.id;
        state.advancedSearch.focusTarget = input.dataset.advInput === 'direction' && param.direction === 'between'
          ? 'minValue'
          : null;
        renderAdvancedSearchRows();
      });
    });

    container.querySelectorAll('[data-adv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.advancedSearch.params = state.advancedSearch.params.filter(param => param.id !== btn.dataset.advRemove);
        if (!state.advancedSearch.params.length) state.advancedSearch.params = [createAdvancedSearchParam()];
        state.advancedSearch.emptyMessage = '';
        renderAdvancedSearchRows();
      });
    });

    const addBtn = document.getElementById('advanced-search-add-row');
    if (addBtn) addBtn.hidden = state.advancedSearch.params.length >= 4;

    if (state.advancedSearch.reorderPulse) {
      requestAnimationFrame(() => {
        container.querySelectorAll('.advanced-search-row').forEach(row => {
          row.classList.add('is-reordered');
          setTimeout(() => row.classList.remove('is-reordered'), 260);
        });
        state.advancedSearch.reorderPulse = null;
      });
    }

    const focusParamId = state.advancedSearch.focusParamId;
    const focusTarget = state.advancedSearch.focusTarget;
    if (focusParamId && focusTarget) {
      requestAnimationFrame(() => {
        const row = container.querySelector(`[data-adv-row="${focusParamId}"]`);
        const field = row?.querySelector(`[data-adv-input="${focusTarget}"]`);
        if (!field) return;
        field.focus();
        if (typeof field.select === 'function' && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA')) {
          field.select();
        }
        if (focusTarget === 'metric' && typeof field.showPicker === 'function') {
          try { field.showPicker(); } catch (err) {}
        }
        state.advancedSearch.focusParamId = null;
        state.advancedSearch.focusTarget = null;
      });
    }
  };

  runAdvancedSearch = async function() {
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    if (!selectedParams.length) {
      state.advancedSearch.results = [];
      state.advancedSearch.emptyMessage = 'בחר לפחות פרמטר אחד כדי לקבל תוצאות.';
      setAdvancedSearchStatus('בחר לפחות פרמטר אחד לחיפוש.');
      renderAdvancedSearchResults();
      return;
    }

    const uniqueMetricIds = new Set(selectedParams.map(param => param.metricId));
    if (uniqueMetricIds.size !== selectedParams.length) {
      setAdvancedSearchStatus('כל פרמטר יכול להיבחר פעם אחת בלבד.');
      return;
    }

    saveAdvancedSearchToHistory(selectedParams);

    const candidates = getAdvancedSearchCandidates();
    if (!candidates.length) {
      state.advancedSearch.results = [];
      state.advancedSearch.emptyMessage = 'לא נמצאו קופות זמינות בקטגוריה הנוכחית.';
      setAdvancedSearchStatus('לא נמצאו קופות זמינות בקטגוריה ובסינון הנוכחי.');
      renderAdvancedSearchResults();
      return;
    }

    state.advancedSearch.loading = true;
    setAdvancedSearchStatus('מחשב את דירוג ההתאמה...');
    await ensureAdvancedSearchMetricsLoaded();

    const metricStats = new Map();
    selectedParams.forEach(param => {
      const values = candidates
        .map(candidate => getAdvancedMetricRaw(candidate, param.metricId))
        .filter(value => Number.isFinite(value));
      metricStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const passedCandidates = candidates.filter(candidate => {
      return selectedParams.every(param => {
        const raw = getAdvancedMetricRaw(candidate, param.metricId);
        if (!Number.isFinite(raw)) return false;
        if (param.direction !== 'between') return true;

        const hasMin = param.minValue !== '' && Number.isFinite(Number(param.minValue));
        const hasMax = param.maxValue !== '' && Number.isFinite(Number(param.maxValue));
        if (!hasMin && !hasMax) return true;

        const minTarget = hasMin ? Number(param.minValue) : -Infinity;
        const maxTarget = hasMax ? Number(param.maxValue) : Infinity;
        return raw >= Math.min(minTarget, maxTarget) && raw <= Math.max(minTarget, maxTarget);
      });
    });

    if (!passedCandidates.length) {
      state.advancedSearch.loading = false;
      state.advancedSearch.results = [];
      state.advancedSearch.emptyMessage = 'לא נמצאו תוצאות שמתאימות לכל הפרמטרים יחד. נסה לשנות או לעדן את החיפוש.';
      setAdvancedSearchStatus('לא נמצאו תוצאות מתאימות. נסה לשנות או לעדן את החיפוש.');
      renderAdvancedSearchResults();
      return;
    }

    const ranked = passedCandidates.map(candidate => {
      let scoreSum = 0;
      let totalCount = 0;
      const reasons = [];
      const sortValues = [];

      selectedParams.forEach(param => {
        const raw = getAdvancedMetricRaw(candidate, param.metricId);
        const stats = metricStats.get(param.metricId) || { min: NaN, max: NaN };
        let normalized = 1;

        if (param.direction === 'between') {
          const hasMin = param.minValue !== '' && Number.isFinite(Number(param.minValue));
          const hasMax = param.maxValue !== '' && Number.isFinite(Number(param.maxValue));
          if (hasMin || hasMax) {
            const minTarget = hasMin ? Number(param.minValue) : raw;
            const maxTarget = hasMax ? Number(param.maxValue) : raw;
            const center = (minTarget + maxTarget) / 2;
            const span = Math.max(Math.abs(maxTarget - minTarget) / 2, 0.0001);
            normalized = Math.max(0, 1 - (Math.abs(raw - center) / span));
            if (raw >= Math.min(minTarget, maxTarget) && raw <= Math.max(minTarget, maxTarget)) normalized = 1;
          }
        } else if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max !== stats.min) {
          normalized = (raw - stats.min) / (stats.max - stats.min);
          if (param.direction === 'low') normalized = 1 - normalized;
        }

        sortValues.push(normalized);
        reasons.push({
          text: `<strong>${getAdvancedMetricLabel(param.metricId)}</strong>: <span class="advanced-search-reason-value">${formatAdvancedMetricValue(param.metricId, raw)}</span>`
        });

        scoreSum += normalized;
        totalCount += 1;
      });

      return {
        ...candidate,
        score: totalCount ? (scoreSum / totalCount) * 100 : 0,
        sortValues,
        reasons: reasons.map(reason => reason.text)
      };
    }).sort((a, b) => {
      for (let i = 0; i < selectedParams.length; i += 1) {
        const av = a.sortValues[i] ?? -1;
        const bv = b.sortValues[i] ?? -1;
        if (av !== bv) return bv - av;
      }
      return b.score - a.score;
    }).slice(0, 5);

    state.advancedSearch.loading = false;
    state.advancedSearch.results = ranked;
    state.advancedSearch.emptyMessage = '';
    setAdvancedSearchStatus(`נמצאו ${ranked.length} תוצאות מובילות לפי הקריטריונים שבחרת.`);
    renderAdvancedSearchResults();
  };

  async function h2hFetchCatData(catId) {
    if (state.h2h.catCache[catId]) return state.h2h.catCache[catId];
    const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId);
    const isPension = !!(cat && cat.pensionAPI);
    const isPolisa  = !!(cat && cat.polisaAPI);
    const [organized, yields12M, sharpeMap, consistencyMap, stdDevMap, momentumMap, actuarialRows = []] = await Promise.all([
      APIModule.getOrganizedData({ categoryId:catId, targetPopulation:'', selectedProviders:new Set() }),
      isPension ? APIModule.get12MYieldsPension()         : isPolisa ? APIModule.get12MYieldsPolisa()        : APIModule.get12MYields(),
      isPension ? APIModule.getAllSharpeRatiosPension()   : isPolisa ? APIModule.getAllSharpeRatiosPolisa()   : APIModule.getAllSharpeRatios(),
      isPension ? APIModule.getConsistencyMapPension()    : isPolisa ? APIModule.getConsistencyMapPolisa()   : APIModule.getConsistencyMap(),
      isPension ? APIModule.getStdDevMapPension()         : isPolisa ? APIModule.getStdDevMapPolisa()        : APIModule.getStdDevMap(),
      isPension ? APIModule.getMomentumMapPension()       : isPolisa ? APIModule.getMomentumMapPolisa()      : APIModule.getMomentumMap(),
      isPension ? loadH2HActuarialRows(catId) : Promise.resolve([]),
    ]);
    state.h2h.catCache[catId] = {
      organized,
      yields12M,
      sharpeMap,
      consistencyMap,
      stdDevMap,
      momentumMap,
      actuarialByProvider: buildH2HActuarialMap(actuarialRows)
    };
    return state.h2h.catCache[catId];
  }

  async function loadH2HActuarialRows(catId) {
    const periods = await APIModule.getAvailableReportPeriods(catId);
    const sortedPeriods = (periods || []).map(Number).filter(Boolean).sort((a, b) => a - b);
    if (!sortedPeriods.length) return [];
    const endPeriod = sortedPeriods[sortedPeriods.length - 1];
    const startPeriod = sortedPeriods[Math.max(0, sortedPeriods.length - 60)];
    return APIModule.getActuarialComparison(catId, startPeriod, endPeriod, 'כלל האוכלוסיה');
  }

  function buildH2HActuarialMap(rows) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const value = Number(row.totalAdjustment);
      if (!Number.isFinite(value)) return;
      [row.companyName, row.companyKey, row.legalId].forEach(key => {
        const normalized = normalizeH2HProviderKey(key);
        if (normalized) map.set(normalized, value);
      });
    });
    return map;
  }

  function normalizeH2HProviderKey(value) {
    return String(value || '')
      .replace(/בע"מ|בע״מ|בעמ/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function persistH2HState() {
    syncH2HPersistedKeysFromItems();
    try {
      localStorage.setItem(H2H_STORAGE_KEY, JSON.stringify({
        items: state.h2h.items.map(item => ({
          catId: item.catId,
          trackId: item.trackId,
          fundId: String(item.record?.FUND_ID || '')
        })).filter(item => item.catId && item.trackId && item.fundId),
        metrics: Array.from(state.h2h.metrics || []).filter(metricId => metricId !== 'customRange'),
        yearMetrics: Array.from(state.h2h.yearMetrics || []),
        viewMode: state.h2h.viewMode || 'table',
        focusFundIds: Array.from(state.h2h.focusFundIds || []),
        sortMetricId: state.h2h.sortMetricId || ''
      }));
    } catch (error) {
      console.warn('Could not persist H2H state', error);
    }
    updateH2HTabBadge();
    syncFundMembershipIndicators();
  }

  function clearPersistedH2HState() {
    try { localStorage.removeItem(H2H_STORAGE_KEY); } catch (error) {}
    state.h2h.persistedKeys = new Set();
    updateH2HTabBadge();
    syncFundMembershipIndicators();
  }

  function getPersistedH2HItemCount() {
    try {
      const raw = localStorage.getItem(H2H_STORAGE_KEY);
      if (!raw) return state.h2h.items.length;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.items) ? parsed.items.length : state.h2h.items.length;
    } catch (error) {
      return state.h2h.items.length;
    }
  }

  function updateH2HTabBadge(total = state.h2h.items.length) {
    const tabBadge = document.querySelector('.h2h-tab .h2h-tab-badge');
    if (tabBadge) { tabBadge.textContent = total; tabBadge.style.display = total > 0 ? '' : 'none'; }
    const navBadge = document.getElementById('h2h-nav-badge');
    if (navBadge) { navBadge.textContent = total; navBadge.hidden = total === 0; }
  }

  async function restoreH2HState() {
    if (state.h2h.storageLoaded) return;
    state.h2h.storageLoaded = true;
    try {
      const raw = localStorage.getItem(H2H_STORAGE_KEY);
      if (!raw) {
        state.h2h.persistedKeys = new Set();
        updateH2HTabBadge();
        syncFundMembershipIndicators();
        return;
      }
      const parsed = JSON.parse(raw);
      const savedItems = Array.isArray(parsed?.items) ? parsed.items : [];
      if (Array.isArray(parsed?.metrics) && parsed.metrics.length) {
        const validMetricIds = new Set(H2H_METRICS.map(metric => metric.id));
        state.h2h.metrics = new Set(parsed.metrics.filter(metricId => validMetricIds.has(metricId) && metricId !== 'customRange'));
      }
      if (Array.isArray(parsed?.yearMetrics)) {
        state.h2h.yearMetrics = new Set(parsed.yearMetrics.map(String).filter(year => /^\d{4}$/.test(year)));
        // One-time default so a returning user still sees their previously-picked years without
        // having to reopen the section — after this it's purely toggle-driven, never re-forced open.
        if (state.h2h.yearMetrics.size > 0) state.h2h.yearSectionOpen = true;
      }
      if (['table', 'chart'].includes(parsed?.viewMode)) {
        state.h2h.viewMode = parsed.viewMode;
      }
      if (Array.isArray(parsed?.focusFundIds)) {
        state.h2h.focusFundIds = new Set(parsed.focusFundIds.map(String));
      }
      if (typeof parsed?.sortMetricId === 'string') {
        state.h2h.sortMetricId = parsed.sortMetricId;
      }

      const restored = [];
      const seen = new Set();
      for (const saved of savedItems) {
        if (!saved?.catId || !saved?.trackId || !saved?.fundId) continue;
        const cached = await h2hFetchCatData(saved.catId);
        const cat = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === saved.catId);
        const trackItem = cached.organized.find(item => item.track.id === saved.trackId);
        const record = trackItem?.records.find(record => String(record.FUND_ID) === String(saved.fundId));
        const uniqueKey = `${saved.catId}::${saved.fundId}`;
        if (!record || seen.has(uniqueKey)) continue;
        seen.add(uniqueKey);
        restored.push({
          catId: saved.catId,
          catLabel: cat?.label || '',
          trackId: saved.trackId,
          trackLabel: trackItem.track.label,
          record,
          provName: getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION),
          yields12M: cached.yields12M || null,
          sharpeMap: cached.sharpeMap || null,
          consistencyMap: cached.consistencyMap || null,
          stdDevMap: cached.stdDevMap || null,
          momentumMap: cached.momentumMap || null,
          actuarialByProvider: cached.actuarialByProvider || null
        });
      }
      state.h2h.items = restored;
      syncH2HPersistedKeysFromItems();
      updateH2HTabBadge();
      syncFundMembershipIndicators();
    } catch (error) {
      console.warn('Could not restore H2H state', error);
      loadH2HPersistedKeysFromStorage();
      updateH2HTabBadge();
      syncFundMembershipIndicators();
    }
  }

  function getH2HMetricRaw(item, metricId) {
    const year = parseH2HYearMetric(metricId);
    if (year) {
      const value = state.h2h.yearDataByCat?.get(item.catId)?.yieldMap?.get(String(item.record?.FUND_ID))?.get(year);
      return value == null || isNaN(value) ? NaN : value;
    }
    if (metricId === 'customRange') {
      const range = state.h2h.customRange || {};
      if (!range.active || range.signature !== getH2HItemsSignature()) return NaN;
      const value = range.yieldMapByCat?.get(item.catId)?.get(String(item.record?.FUND_ID));
      return value == null || isNaN(value) ? NaN : value;
    }
    if (metricId === '7yr_cum' || metricId === '7yr_ann') {
      const value = state.h2h.trailing7DataByCat?.get(item.catId)?.get(String(item.record?.FUND_ID));
      if (value == null || isNaN(value)) return NaN;
      return metricId === '7yr_ann' ? (Math.pow(1 + Number(value) / 100, 1 / 7) - 1) * 100 : Number(value);
    }
    const r = item.record;
    const y12 = item.yields12M;
    switch(metricId) {
      case 'monthly':   return parseFloat(r.MONTHLY_YIELD);
      case 'ytd':       return parseFloat(r.YEAR_TO_DATE_YIELD);
      case '1yr':       return y12?.get(String(r.FUND_ID)) ?? NaN;
      case '3yr_cum':   return parseFloat(r.YIELD_TRAILING_3_YRS);
      case '5yr_cum':   return parseFloat(r.YIELD_TRAILING_5_YRS);
      case '3yr_ann':   { const n=parseFloat(r.YIELD_TRAILING_3_YRS); return isNaN(n)?NaN:(Math.pow(1+n/100,1/3)-1)*100; }
      case '5yr_ann':   { const n=parseFloat(r.YIELD_TRAILING_5_YRS); return isNaN(n)?NaN:(Math.pow(1+n/100,1/5)-1)*100; }
      case 'assets':    { const t=parseFloat(r.TOTAL_ASSETS); return (isNaN(t)||t<=0)?NaN:t; } // ביחידות מיליון ₪
      case 'stock':     return calcExposurePercentValue(r.STOCK_MARKET_EXPOSURE, r.TOTAL_ASSETS) ?? NaN;
      case 'abroad':    return calcExposurePercentValue(r.FOREIGN_EXPOSURE, r.TOTAL_ASSETS) ?? NaN;
      case 'fx':        return calcExposurePercentValue(r.FOREIGN_CURRENCY_EXPOSURE, r.TOTAL_ASSETS) ?? NaN;
      case 'sharpe':    { const v=item.sharpeMap?.get(String(r.FUND_ID)); return (v==null||v===undefined)?NaN:v; }
      case 'positive':  { const v=item.consistencyMap?.get(String(r.FUND_ID)); return (v==null||v===undefined)?NaN:v; }
      case 'stddev':    { const v=item.stdDevMap?.get(String(r.FUND_ID)); return (v==null||v===undefined)?NaN:v; }
      case 'momentum':  return getH2HMomentumScore(item);
      case 'actuarial': {
        const map = item.actuarialByProvider || state.h2h.catCache[item.catId]?.actuarialByProvider;
        const keys = [
          item.provName,
          getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION),
          r.MANAGING_CORPORATION_LEGAL_ID,
          r.MANAGING_CORPORATION,
          r.CONTROLLING_CORPORATION
        ].map(normalizeH2HProviderKey).filter(Boolean);
        for (const key of keys) {
          const value = map?.get(key);
          if (Number.isFinite(value)) return value;
        }
        const v=parseFloat(r.ACTUARIAL_ADJUSTMENT);
        return isNaN(v)?NaN:v;
      }
      case 'alpha': {
        const organized = state.h2h.catCache[item.catId]?.organized;
        if (!organized) return NaN;
        const trackItem = organized.find(it => it.track.id === item.trackId);
        if (!trackItem) return NaN;
        const fundMonthly = parseFloat(r.MONTHLY_YIELD);
        if (isNaN(fundMonthly)) return NaN;
        const trackVals = trackItem.records.map(r2 => parseFloat(r2.MONTHLY_YIELD)).filter(v => !isNaN(v));
        if (!trackVals.length) return NaN;
        const trackAvg = trackVals.reduce((a,b)=>a+b,0) / trackVals.length;
        return (fundMonthly - trackAvg) * 12; // שנתי
      }
      default: return NaN;
    }
  }

  function getH2HMetricDisplay(item, metricId) {
    if (parseH2HYearMetric(metricId)) {
      if (state.h2h.yearsLoading) return 'טוען...';
      const rawYear = getH2HMetricRaw(item, metricId);
      return isNaN(rawYear) ? '-' : formatPercent(rawYear);
    }
    if ((metricId === '7yr_cum' || metricId === '7yr_ann') && state.h2h.trailing7Loading) return 'טוען...';
    const raw = getH2HMetricRaw(item, metricId);
    // סך נכסים — TOTAL_ASSETS נשמר ביחידות מיליון ₪
    if (metricId === 'assets') {
      if (isNaN(raw) || raw <= 0) return '-';
      return raw >= 1000
        ? `${(raw/1000).toFixed(2)} מיליארד`
        : `${Math.round(raw).toLocaleString('he-IL')} מיליון`;
    }
    if (metricId === 'sharpe')    return isNaN(raw) ? '-' : raw.toFixed(2);
    if (metricId === 'positive')  return isNaN(raw) ? '-' : `\u200E${Math.round(raw)}%`;
    if (metricId === 'stddev')    return isNaN(raw) ? '-' : `\u200E${raw.toFixed(2)}%`;
    if (metricId === 'momentum')  return isNaN(raw) ? '-' : `${Math.round(raw)} / 100`;
    if (metricId === 'actuarial') return isNaN(raw) ? '-' : `\u200E${raw > 0 ? '+' : ''}${raw.toFixed(2)}%`;
    if (metricId === 'alpha')     return isNaN(raw) ? '-' : `\u200E${raw > 0 ? '+' : ''}${raw.toFixed(2)}%`;
    if (['stock','abroad','fx'].includes(metricId)) return isNaN(raw) ? '-' : `\u200E${raw.toFixed(1)}%`;
    return formatPercent(raw);
  }

  function getH2HCustomRangeState() {
    if (!state.h2h.customRange) {
      state.h2h.customRange = {
        loading: false,
        availabilityLoading: false,
        active: false,
        selectionMode: 'months',
        startPeriod: '',
        endPeriod: '',
        selectedYear: '',
        availablePeriods: [],
        availableYears: [],
        yieldMapByCat: new Map(),
        signature: '',
        availabilitySignature: '',
        status: '',
        meta: '',
        userSelectedRange: false
      };
    }
    if (typeof state.h2h.customRange.userSelectedRange !== 'boolean') {
      state.h2h.customRange.userSelectedRange = false;
    }
    return state.h2h.customRange;
  }

  function getH2HCustomRangeLabel() {
    const range = getH2HCustomRangeState();
    if (!range.startPeriod || !range.endPeriod) return 'טווח מותאם';
    if (range.selectionMode === 'year' && range.selectedYear) return String(range.selectedYear);
    return `${formatReportPeriod(range.startPeriod)} – ${formatReportPeriod(range.endPeriod)}`;
  }

  function getH2HCustomRangeMonthCount() {
    const range = getH2HCustomRangeState();
    return getMonthCountBetween(range.startPeriod, range.endPeriod);
  }

  function getH2HCustomRangeMetaText() {
    const monthCount = getH2HCustomRangeMonthCount();
    return monthCount ? `${monthCount} חודשים` : '';
  }

  function getH2HCustomRangeYears(periods) {
    const byYear = new Map();
    (periods || []).forEach(period => {
      const value = Number(period);
      const year = Math.floor(value / 100);
      const month = value % 100;
      if (!year || month < 1 || month > 12) return;
      if (!byYear.has(year)) byYear.set(year, new Set());
      byYear.get(year).add(month);
    });
    return Array.from(byYear.entries())
      .filter(([, months]) => months.size === 12)
      .map(([year]) => year)
      .sort((a, b) => b - a);
  }

  function getH2HPeriodIntersection(periodLists) {
    const validLists = (periodLists || []).map(list => (list || []).map(Number).filter(Boolean));
    if (!validLists.length) return [];
    const [first, ...rest] = validLists;
    const restSets = rest.map(list => new Set(list));
    return first
      .filter(period => restSets.every(set => set.has(period)))
      .filter((period, index, arr) => arr.indexOf(period) === index)
      .sort((a, b) => b - a);
  }

  function getH2HDefaultCustomRangePeriods(periods) {
    const sortedDesc = (periods || []).map(Number).filter(Boolean).sort((a, b) => b - a);
    if (!sortedDesc.length) return { startPeriod: '', endPeriod: '' };
    const endPeriod = sortedDesc[0];
    const startPeriod = sortedDesc[Math.min(23, sortedDesc.length - 1)];
    return {
      startPeriod: String(startPeriod),
      endPeriod: String(endPeriod)
    };
  }

  function syncH2HCustomRangeFromYear(year) {
    const range = getH2HCustomRangeState();
    const safeYear = Number(year);
    if (!safeYear) return;
    range.selectedYear = String(safeYear);
    range.startPeriod = String((safeYear * 100) + 1);
    range.endPeriod = String((safeYear * 100) + 12);
  }

  function invalidateH2HCustomRangeData() {
    const range = getH2HCustomRangeState();
    range.active = false;
    range.loading = false;
    range.yieldMapByCat = new Map();
    range.signature = '';
    range.status = '';
    range.meta = '';
  }

  function refreshH2HCustomRangePanel(root = document) {
    const box = root?.querySelector?.('[data-h2h-custom-range]') || document.querySelector('[data-h2h-custom-range]');
    if (!box) return;
    const drawerBody = document.querySelector('#h2h-mp .h2h-drawer-body');
    const scrollTop = drawerBody?.scrollTop || 0;
    box.outerHTML = renderH2HCustomRangeControls();
    bindH2HCustomRangeControls(root);
    restoreH2HDrawerScroll(scrollTop);
  }

  async function ensureH2HCustomRangeAvailability(force = false) {
    const range = getH2HCustomRangeState();
    const catIds = Array.from(new Set((state.h2h.items || []).map(item => item.catId).filter(Boolean))).sort();
    const signature = catIds.join('|');
    if (!catIds.length) {
      range.availablePeriods = [];
      range.availableYears = [];
      range.availabilitySignature = '';
      return;
    }
    if (!force && range.availabilitySignature === signature) return;
    if (range.availabilityLoading) return;
    range.availabilityLoading = true;
    range.status = 'טוען תקופות זמינות...';
    refreshH2HCustomRangePanel();
    try {
      const periodLists = await Promise.all(catIds.map(catId => APIModule.getAvailableReportPeriods(catId, '')));
      const periods = getH2HPeriodIntersection(periodLists);
      range.availablePeriods = periods;
      range.availableYears = getH2HCustomRangeYears(periods);
      range.availabilitySignature = signature;
      const currentStartValid = periods.some(period => String(period) === String(range.startPeriod));
      const currentEndValid = periods.some(period => String(period) === String(range.endPeriod));
      if (periods.length && (!range.userSelectedRange || !currentStartValid || !currentEndValid)) {
        const defaults = getH2HDefaultCustomRangePeriods(periods);
        range.startPeriod = defaults.startPeriod;
        range.endPeriod = defaults.endPeriod;
        range.selectionMode = 'months';
      }
      if (!range.selectedYear && range.availableYears.length) range.selectedYear = String(range.availableYears[0]);
      range.status = periods.length ? '' : 'לא נמצאו תקופות משותפות לכל הקטגוריות שנבחרו.';
    } catch (error) {
      console.error(error);
      range.availablePeriods = [];
      range.availableYears = [];
      range.availabilitySignature = signature;
      range.status = 'לא הצלחנו לטעון את התקופות כרגע.';
    } finally {
      range.availabilityLoading = false;
      refreshH2HCustomRangePanel();
    }
  }

  async function applyH2HCustomRangeSelection() {
    const range = getH2HCustomRangeState();
    state.h2h.customRangeSectionOpen = true;
    if (range.selectionMode === 'year') syncH2HCustomRangeFromYear(range.selectedYear);
    const startPeriod = Number(range.startPeriod);
    const endPeriod = Number(range.endPeriod);
    if (!startPeriod || !endPeriod || endPeriod < startPeriod) {
      range.status = 'יש לבחור טווח תקין מהחודש המוקדם אל המאוחר.';
      renderH2H();
      return;
    }
    if (!state.h2h.metrics.has('customRange')) {
      const selectedCount = (state.h2h.metrics?.size || 0) + (state.h2h.yearMetrics?.size || 0);
      if (selectedCount >= 15) {
        range.status = 'כדי להוסיף טווח מותאם צריך להסיר מדד אחר.';
        renderH2H();
        return;
      }
      state.h2h.metrics.add('customRange');
    }
    const catIds = Array.from(new Set((state.h2h.items || []).map(item => item.catId).filter(Boolean)));
    range.loading = true;
    range.status = 'מחשב תשואה מותאמת...';
    renderH2H();
    try {
      const entries = await Promise.all(catIds.map(async catId => {
        const map = await APIModule.getCustomRangeYields(catId, startPeriod, endPeriod, '');
        return [catId, map];
      }));
      range.yieldMapByCat = new Map(entries);
      range.active = true;
      range.signature = getH2HItemsSignature();
      range.startPeriod = String(startPeriod);
      range.endPeriod = String(endPeriod);
      range.meta = `הטווח שנבחר כולל ${getMonthCountBetween(startPeriod, endPeriod)} חודשים`;
      range.status = '';
      persistH2HState();
    } catch (error) {
      console.error(error);
      range.status = 'לא הצלחנו לחשב את הטווח המותאם כרגע.';
    } finally {
      range.loading = false;
      renderH2H();
    }
  }

  function clearH2HCustomRangeSelection() {
    invalidateH2HCustomRangeData();
    getH2HCustomRangeState().userSelectedRange = false;
    state.h2h.metrics.delete('customRange');
    persistH2HState();
    renderH2H();
  }

  // ─── צבעים לקטגוריה ולמסלול בכרטיסי ראש בראש ─────────────────
  function h2hCatColor(catId) {
    const MAP = {
      gemel_tagmulim: '#0f172a',  // כחול — קופות גמל
      hashtalamot:    '#10b981',  // ירוק — קרנות השתלמות
      gemel_hashkaa:  '#7c3aed',  // סגול — גמל להשקעה
      polisot:        '#ea580c',  // כתום — פוליסות חיסכון
      polisa_chisachon:'#ea580c',
      pension_klali:  '#db2777',  // ורוד — פנסיה כללית
      pension_mkifa:  '#dc2626',  // אדום — פנסיה מקיפה
    };
    return MAP[catId] || '#475569';
  }

  function h2hTrackColor(trackLabel) {
    const lc = (trackLabel || '').toLowerCase();
    if (lc.includes('מניות'))                                     return '#10b981'; // ירוק אמרלד — מניות
    if (lc.includes('אגח') || lc.includes('שקלי') || lc.includes('אג"ח')) return '#6366f1'; // אינדיגו — אג"ח
    if (lc.includes('כללי') || lc.includes('גמישות') || lc.includes('גמיש')) return '#7c3aed'; // סגול — כללי
    if (lc.includes('חו"ל') || lc.includes('עולמי') || lc.includes('אמריק') || lc.includes('גלובל')) return '#d97706'; // חום/זהב — חו"ל
    if (lc.includes('גיל') || lc.includes('תיק'))                return '#0891b2'; // ציאן — גיל/תיק
    if (lc.includes('מסורתי') || lc.includes('שמרני'))           return '#64748b'; // אפור — שמרני
    return '#6366f1'; // אינדיגו — ברירת מחדל
  }

  function renderH2HCustomRangeControls() {
    const range = getH2HCustomRangeState();
    const periods = range.availablePeriods || [];
    const years = range.availableYears || [];
    const startPeriodOptions = periods.map(period => `<option value="${period}"${String(period) === String(range.startPeriod) ? ' selected' : ''}>${formatReportPeriod(period)}</option>`).join('');
    const endPeriodOptions = periods.map(period => `<option value="${period}"${String(period) === String(range.endPeriod) ? ' selected' : ''}>${formatReportPeriod(period)}</option>`).join('');
    const yearOptions = years.map(year => `<option value="${year}"${String(year) === String(range.selectedYear) ? ' selected' : ''}>${year}</option>`).join('');
    const mode = range.selectionMode || 'months';
    const hasItems = (state.h2h.items || []).length > 0;
    const disabled = !hasItems || range.loading || range.availabilityLoading || !periods.length || (mode === 'year' && !years.length);
    const rangeMonthMeta = getH2HCustomRangeMetaText();
    // Collapsed by default (expands on clicking the heading) — same reasoning as the year-returns
    // section above it: this box's fields shouldn't cost permanent vertical space in the panel.
    // Purely state-driven, same as the year section: no "auto-open while active" OR here, since
    // that permanently overrode the toggle and made the box impossible to fold back once a range
    // was checked/applied. Auto-opening happens as a one-time state write instead (see the
    // .h2h-mcb change handler and applyH2HCustomRangeSelection).
    const customRangeOpen = state.h2h.customRangeSectionOpen;
    return `
      <div class="h2h-custom-range-box" data-h2h-custom-range>
        <div class="h2h-custom-range-head">
          <button type="button" class="h2h-custom-range-toggle" data-h2h-toggle-custom-range aria-expanded="${customRangeOpen}">
            <strong>טווח השקעה מותאם</strong>
            <i class="fas fa-chevron-${customRangeOpen ? 'up' : 'down'}" aria-hidden="true"></i>
          </button>
          <button type="button" class="h2h-custom-range-refresh" data-h2h-range-refresh title="רענון תקופות" ${customRangeOpen ? '' : 'hidden'}>
            <i class="fas fa-rotate-right" aria-hidden="true"></i>
          </button>
        </div>
        <div class="h2h-custom-range-body" ${customRangeOpen ? '' : 'hidden'}>
        <div class="h2h-custom-range-mode" role="group" aria-label="בחירת סוג טווח">
          <button type="button" class="h2h-range-mode-btn ${mode === 'months' ? 'is-active' : ''}" data-h2h-range-mode="months">חודשים</button>
          <button type="button" class="h2h-range-mode-btn ${mode === 'year' ? 'is-active' : ''}" data-h2h-range-mode="year">שנה</button>
        </div>
        <div class="h2h-range-fields" ${mode === 'months' ? '' : 'hidden'}>
          <label>מ־
            <select data-h2h-range-start ${disabled ? 'disabled' : ''}>
              ${startPeriodOptions || '<option value="">אין תקופות</option>'}
            </select>
          </label>
          <label>עד
            <select data-h2h-range-end ${disabled ? 'disabled' : ''}>
              ${endPeriodOptions || '<option value="">אין תקופות</option>'}
            </select>
          </label>
        </div>
        <div class="h2h-range-fields" ${mode === 'year' ? '' : 'hidden'}>
          <label>שנה
            <select data-h2h-range-year ${disabled || !years.length ? 'disabled' : ''}>
              ${yearOptions || '<option value="">אין שנה מלאה</option>'}
            </select>
          </label>
        </div>
        <div class="h2h-range-actions">
          <button type="button" class="h2h-range-apply" data-h2h-range-apply ${disabled ? 'disabled' : ''}>
            ${range.loading ? 'מחשב...' : 'חשב והצג'}
          </button>
          <button type="button" class="h2h-range-clear" data-h2h-range-clear ${!range.active && !state.h2h.metrics.has('customRange') ? 'disabled' : ''}>נקה</button>
        </div>
        <div class="h2h-range-meta" data-h2h-range-meta>${rangeMonthMeta ? `${getH2HCustomRangeLabel()} · ${rangeMonthMeta}` : (range.meta || '')}</div>
        <div class="h2h-range-status">${range.status || (!hasItems ? 'בחר קופות כדי להפעיל טווח מותאם.' : '')}</div>
        </div>
      </div>`;
  }

  function renderH2HMetricsPanel() {
    const selectedCount = (state.h2h.metrics?.size || 0) + (state.h2h.yearMetrics?.size || 0);
    const limitReached = selectedCount >= 15;
    const groups = {};
    H2H_METRICS.forEach(m => { if(!groups[m.group]) groups[m.group]=[]; groups[m.group].push(m); });
    const years = getH2HAvailableYears();
    // Rendered as part of the "תשואות" group (below), not as its own trailing section — per-year
    // returns are still returns, and belong next to the other return metrics, not at the bottom
    // of the whole panel past unrelated groups like "מדדי סיכון". Collapsed by default (expands
    // on clicking its own heading) so the panel doesn't grow taller than the screen just from
    // listing ~10 years. Purely state-driven (no "auto-open while a year is active" OR here) —
    // that used to permanently win over the toggle, making the section impossible to fold back
    // once any year was checked. Auto-opening on first selection is handled as a one-time state
    // write instead (see the .h2h-ycb change handler and restoreH2HState), so afterward the toggle
    // is the only thing that controls it.
    const yearSectionOpen = state.h2h.yearSectionOpen;
    const yearsHtml = `
      <button type="button" class="h2h-mgroup-sublabel h2h-mgroup-sublabel-toggle" data-h2h-toggle-years aria-expanded="${yearSectionOpen}">
        <span>תשואה לפי שנה</span>
        <i class="fas fa-chevron-${yearSectionOpen ? 'up' : 'down'}" aria-hidden="true"></i>
      </button>
      <div class="h2h-mgroup-items h2h-year-items" ${yearSectionOpen ? '' : 'hidden'}>
        ${years.length ? years.map(year => `
          <label class="h2h-mcheckbox">
            <input type="checkbox" class="h2h-ycb" data-year="${year}" ${state.h2h.yearMetrics.has(String(year)) ? 'checked' : ''} ${!state.h2h.yearMetrics.has(String(year)) && limitReached ? 'disabled' : ''}>
            <span>${year}</span>
          </label>`).join('') : '<span class="h2h-years-empty">בחר קופות כדי להציג שנים</span>'}
      </div>`;
    return Object.entries(groups).map(([grp,metrics]) => `
      <div class="h2h-mgroup">
        <div class="h2h-mgroup-label">${grp}</div>
        <div class="h2h-mgroup-items">
          ${metrics.filter(m => m.id !== 'customRange').map(m => `
            <label class="h2h-mcheckbox">
              <input type="checkbox" class="h2h-mcb" data-metric="${m.id}" ${state.h2h.metrics.has(m.id)?'checked':''} ${!state.h2h.metrics.has(m.id) && limitReached ? 'disabled' : ''}>
              <span>${m.label}</span>
            </label>`).join('')}
        </div>
        ${grp === 'תשואות' ? yearsHtml : ''}
        ${grp === 'תשואות' ? renderH2HCustomRangeControls() : ''}
      </div>`).join('');
  }

  function getH2HAvailableYears() {
    const periods = (state.h2h.items || []).map(item => Number(item.record?.REPORT_PERIOD) || 0).filter(Boolean);
    if (!periods.length) return [];
    const latestPeriod = Math.max(...periods);
    const latestYear = Math.floor(latestPeriod / 100);
    const latestMonth = latestPeriod % 100;
    const latestAnnualYear = latestMonth === 12 ? latestYear : latestYear - 1;
    return Array.from({ length: 10 }, (_, index) => latestAnnualYear - index).filter(year => year > 1990);
  }

  function getH2HYearMetricId(year) {
    return `h2h_year_${year}`;
  }

  function parseH2HYearMetric(metricId) {
    const match = /^h2h_year_(\d{4})$/.exec(String(metricId || ''));
    return match ? Number(match[1]) : null;
  }

  function getH2HItemsSignature() {
    return (state.h2h.items || [])
      .map(item => `${item.catId}:${item.record?.FUND_ID || ''}`)
      .sort()
      .join('|');
  }

  function invalidateH2HYearData() {
    state.h2h.yearDataByCat = new Map();
    state.h2h.yearsSignature = '';
    state.h2h.yearsRequestId += 1;
    state.h2h.yearsLoading = false;
  }

  function invalidateH2HTrailing7Data() {
    state.h2h.trailing7DataByCat = new Map();
    state.h2h.trailing7Signature = '';
    state.h2h.trailing7RequestId += 1;
    state.h2h.trailing7Loading = false;
  }

  function h2hNeedsYearData() {
    return !!state.h2h.yearMetrics.size || state.h2h.viewMode === 'chart';
  }

  function h2hNeedsTrailing7Data() {
    return !!(state.h2h.metrics?.has('7yr_cum') || state.h2h.metrics?.has('7yr_ann'));
  }

  async function ensureH2HTrailing7DataLoaded() {
    if (!h2hNeedsTrailing7Data() || !state.h2h.items.length || state.h2h.trailing7Loading) return;
    const signature = getH2HItemsSignature();
    if (state.h2h.trailing7Signature === signature) return;
    const requestId = ++state.h2h.trailing7RequestId;
    state.h2h.trailing7Loading = true;
    renderH2H();
    try {
      const catIds = Array.from(new Set(state.h2h.items.map(item => item.catId).filter(Boolean)));
      const entries = await Promise.all(catIds.map(async catId => {
        const map = await APIModule.getTrailing7Yields(catId, '');
        return [catId, map];
      }));
      if (state.h2h.trailing7RequestId !== requestId) return;
      state.h2h.trailing7DataByCat = new Map(entries);
      state.h2h.trailing7Signature = signature;
    } catch (error) {
      console.error(error);
      if (state.h2h.trailing7RequestId !== requestId) return;
      state.h2h.trailing7DataByCat = new Map();
      state.h2h.trailing7Signature = signature;
    } finally {
      if (state.h2h.trailing7RequestId === requestId) {
        state.h2h.trailing7Loading = false;
        renderH2H();
      }
    }
  }

  async function ensureH2HYearDataLoaded() {
    if (!h2hNeedsYearData() || !state.h2h.items.length || state.h2h.yearsLoading) return;
    const signature = getH2HItemsSignature();
    if (state.h2h.yearsSignature === signature) return;
    const requestId = ++state.h2h.yearsRequestId;
    state.h2h.yearsLoading = true;
    renderH2H();
    try {
      const grouped = new Map();
      state.h2h.items.forEach(item => {
        if (!grouped.has(item.catId)) grouped.set(item.catId, []);
        grouped.get(item.catId).push(item.record);
      });
      const entries = await Promise.all(Array.from(grouped.entries()).map(async ([catId, records]) => {
        const result = await APIModule.getYearlyYieldsForFunds(records, catId, '', 10);
        return [catId, result];
      }));
      if (state.h2h.yearsRequestId !== requestId) return;
      state.h2h.yearDataByCat = new Map(entries);
      state.h2h.yearsSignature = signature;
    } catch (error) {
      console.error(error);
      if (state.h2h.yearsRequestId !== requestId) return;
      state.h2h.yearDataByCat = new Map();
      state.h2h.yearsSignature = signature;
    } finally {
      if (state.h2h.yearsRequestId === requestId) {
        state.h2h.yearsLoading = false;
        renderH2H();
      }
    }
  }

  function getH2HMomentumScore(item) {
    const organized = state.h2h.catCache[item.catId]?.organized || [];
    const trackItem = organized.find(it => it.track.id === item.trackId);
    const peers = trackItem?.records || [];
    if (!peers.length) return NaN;

    const pctRank = (myVal, arr) => {
      if (myVal === null || myVal === undefined || isNaN(myVal)) return 50;
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      if (!valid.length) return 50;
      return Math.round(valid.filter(v => v < myVal).length / valid.length * 100);
    };

    const fundId = String(item.record.FUND_ID);
    const mapValue = (map, id) => map ? (map.get(String(id)) ?? null) : null;
    const numberOrNull = value => {
      const num = parseFloat(value);
      return Number.isFinite(num) ? num : null;
    };

    const all6m = peers.map(p => mapValue(item.momentumMap, p.FUND_ID));
    const all1y = peers.map(p => mapValue(item.yields12M, p.FUND_ID));
    const all3y = peers.map(p => numberOrNull(p.YIELD_TRAILING_3_YRS));
    const all5y = peers.map(p => numberOrNull(p.YIELD_TRAILING_5_YRS));
    const allConsistency = peers.map(p => mapValue(item.consistencyMap, p.FUND_ID));
    const allSharpe = peers.map(p => mapValue(item.sharpeMap, p.FUND_ID));

    const score = Math.round(
      pctRank(mapValue(item.momentumMap, fundId), all6m) * 0.25 +
      pctRank(mapValue(item.yields12M, fundId), all1y) * 0.20 +
      pctRank(numberOrNull(item.record.YIELD_TRAILING_3_YRS), all3y) * 0.15 +
      pctRank(numberOrNull(item.record.YIELD_TRAILING_5_YRS), all5y) * 0.10 +
      pctRank(mapValue(item.consistencyMap, fundId), allConsistency) * 0.15 +
      pctRank(mapValue(item.sharpeMap, fundId), allSharpe) * 0.15
    );

    return Math.min(100, Math.max(0, score));
  }

  function renderH2HTable() {
    const items = state.h2h.items;
    if (!items.length) return '';
    const activeMetrics = [
      ...H2H_METRICS.filter(m => state.h2h.metrics.has(m.id)),
      ...Array.from(state.h2h.yearMetrics || [])
        .sort((a, b) => Number(b) - Number(a))
        .map(year => ({ id: getH2HYearMetricId(year), label: `תשואה שנת ${year}`, group: 'תשואות לפי שנים' }))
    ];
    if (!activeMetrics.length) return '<div class="h2h-no-metrics">בחר לפחות מדד אחד מהחלונית למעלה</div>';

    // Best / worst per metric row (סטיית תקן — נמוך עדיף; שאר — גבוה עדיף)
    const SKIP_RANKING = new Set(['stock','abroad','fx','actuarial']);
    const LOWER_IS_BETTER = new Set(['stddev']);
    const bestIdx = {}, worstIdx = {};
    activeMetrics.forEach(m => {
      if (SKIP_RANKING.has(m.id)) return;
      const vals = items.map((it,i) => ({ v:getH2HMetricRaw(it,m.id), i })).filter(x => !isNaN(x.v) && isFinite(x.v));
      if (vals.length > 1) {
        if (LOWER_IS_BETTER.has(m.id)) {
          bestIdx[m.id]  = vals.reduce((a,b) => b.v<a.v?b:a).i;
          worstIdx[m.id] = vals.reduce((a,b) => b.v>a.v?b:a).i;
        } else {
          bestIdx[m.id]  = vals.reduce((a,b) => b.v>a.v?b:a).i;
          worstIdx[m.id] = vals.reduce((a,b) => b.v<a.v?b:a).i;
        }
      }
    });

    const fundCols = items.map((item,i) => {
      const fundUrl = `fund.html?id=${encodeURIComponent(item.record.FUND_ID)}&cat=${encodeURIComponent(item.catId)}`;
      const allocationProfile = ghAllocationProfileFor(ghExposureFromItem(item));
      const allocationIcon = ghAllocationProfileIcons(allocationProfile, item.trackLabel || '');
      return `
      <th class="h2h-fund-th" draggable="true" data-h2h-drag-idx="${i}">
        <div class="h2h-fund-card" title="אפשר לגרור לשינוי מיקום">
          <span class="h2h-drag-handle" aria-hidden="true" title="גרור לשינוי מיקום"><i class="fas fa-grip-vertical"></i></span>
          <button class="h2h-rm-btn" data-idx="${i}" title="הסר">×</button>
          <a class="h2h-fund-link" href="${fundUrl}" draggable="false" title="מעבר לדף הקופה">
            <div class="h2h-fund-card-top">
              <span class="h2h-dot" style="background:${providerColor(item.provName)}"></span>
              <span class="h2h-fund-pname">${item.provName}</span>
              ${allocationIcon}
            </div>
            <div class="h2h-fund-line">
              <span>${item.catLabel}</span>
              <span>${item.trackLabel}</span>
              <span>#${item.record.FUND_ID}</span>
            </div>
          </a>
        </div>
      </th>`;
    }).join('');

    const rows = activeMetrics.map(m => {
      const cells = items.map((item,i) => {
        const disp = getH2HMetricDisplay(item, m.id);
        const raw  = getH2HMetricRaw(item, m.id);
        const isBest  = bestIdx[m.id]  === i;
        const isWorst = worstIdx[m.id] === i;
        const isYearMetric = !!parseH2HYearMetric(m.id);
        const isColorable = isYearMetric || ['monthly','ytd','1yr','3yr_cum','5yr_cum','3yr_ann','5yr_ann','momentum','alpha','actuarial'].includes(m.id);
        const colorCls = isColorable && !isNaN(raw) ? (raw>0?' h2h-pos':raw<0?' h2h-neg':'') : '';
        const rankCls  = isBest ? ' h2h-best' : isWorst ? ' h2h-worst' : '';
        return `<td class="h2h-val${colorCls}${rankCls}${heat.cls}"${heat.style}>${isBest?'🏅 ':''}${disp}</td>`;
        return `<td class="h2h-val${colorCls}${rankCls}">${isBest?'🥇 ':''}${disp}</td>`;
      }).join('');
      return `<tr><td class="h2h-mlabel">${m.label}</td>${cells}</tr>`;
    }).join('');

    const insights = renderH2HInsights(activeMetrics, items, metricStats);
    return `
      ${insights}
      <div class="h2h-tbl-scroll">
        <table class="h2h-tbl">
          <thead><tr><th class="h2h-mlabel-th">מדד</th>${fundCols}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function reorderH2HItems(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= state.h2h.items.length || toIndex >= state.h2h.items.length) return;
    const [moved] = state.h2h.items.splice(fromIndex, 1);
    state.h2h.items.splice(toIndex, 0, moved);
    persistH2HState();
    renderH2H();
  }

  function sortH2HItemsByMetric(metricId) {
    if (!metricId || state.h2h.items.length < 2) return;
    state.h2h.sortMetricId = metricId;
    state.h2h.items.sort((a, b) => {
      const av = getH2HMetricRaw(a, metricId);
      const bv = getH2HMetricRaw(b, metricId);
      const aFinite = Number.isFinite(av);
      const bFinite = Number.isFinite(bv);
      if (aFinite && bFinite) return bv - av;
      if (aFinite) return -1;
      if (bFinite) return 1;
      return 0;
    });
    persistH2HState();
    renderH2H();
  }

  function removeH2HMetric(metricId) {
    const year = parseH2HYearMetric(metricId);
    if (year) state.h2h.yearMetrics.delete(String(year));
    else state.h2h.metrics.delete(metricId);
    if (metricId === 'customRange') invalidateH2HCustomRangeData();
    if (state.h2h.sortMetricId === metricId) state.h2h.sortMetricId = '';
    persistH2HState();
    renderH2H();
  }

  function bindH2HTableInteractions(root) {
    root.querySelectorAll('[data-h2h-sort-metric]').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        sortH2HItemsByMetric(btn.dataset.h2hSortMetric);
      });
    });

    root.querySelectorAll('[data-h2h-remove-metric]').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeH2HMetric(btn.dataset.h2hRemoveMetric);
      });
    });

    root.querySelectorAll('.h2h-rm-btn').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const removeIndex = parseInt(btn.dataset.idx, 10);
        const removed = state.h2h.items[removeIndex];
        state.h2h.items.splice(removeIndex, 1);
        if (removed?.record?.FUND_ID) {
          const removedFundId = String(removed.record.FUND_ID);
          state.h2h.focusFundIds?.delete(removedFundId);
        }
        invalidateH2HYearData();
        invalidateH2HTrailing7Data();
        invalidateH2HCustomRangeData();
        persistH2HState();
        renderH2H();
      });
    });

    root.querySelectorAll('.h2h-fund-th').forEach(cell => {
      const card = cell.querySelector('.h2h-fund-card');
      card?.querySelector('.h2h-drag-handle')?.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const fromIndex = Number(cell.dataset.h2hDragIdx);
        state.h2h.pointerDrag = {
          fromIndex,
          startX: event.clientX,
          startY: event.clientY,
          active: false
        };
        card.setPointerCapture?.(event.pointerId);
      });
      card?.addEventListener('pointermove', (event) => {
        const drag = state.h2h.pointerDrag;
        if (!drag || drag.fromIndex !== Number(cell.dataset.h2hDragIdx)) return;
        const moved = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
        if (moved < 8 && !drag.active) return;
        event.preventDefault();
        drag.active = true;
        card.classList.add('is-dragging');
        root.querySelectorAll('.h2h-fund-card').forEach(item => item.classList.remove('is-drag-over'));
        const targetCell = document.elementFromPoint(event.clientX, event.clientY)?.closest('.h2h-fund-th');
        const targetCard = targetCell?.querySelector('.h2h-fund-card');
        if (targetCell && targetCell !== cell) targetCard?.classList.add('is-drag-over');
      });
      card?.addEventListener('pointerup', (event) => {
        const drag = state.h2h.pointerDrag;
        state.h2h.pointerDrag = null;
        root.querySelectorAll('.h2h-fund-card').forEach(item => item.classList.remove('is-dragging', 'is-drag-over'));
        if (!drag?.active) return;
        state.h2h.suppressClick = true;
        window.setTimeout(() => { state.h2h.suppressClick = false; }, 0);
        event.preventDefault();
        event.stopPropagation();
        const targetCell = document.elementFromPoint(event.clientX, event.clientY)?.closest('.h2h-fund-th');
        const toIndex = Number(targetCell?.dataset.h2hDragIdx);
        reorderH2HItems(drag.fromIndex, toIndex);
      });
      card?.querySelector('.h2h-fund-link')?.addEventListener('click', (event) => {
        if (!state.h2h.suppressClick) return;
        event.preventDefault();
        event.stopPropagation();
      });
      card?.addEventListener('pointercancel', () => {
        state.h2h.pointerDrag = null;
        root.querySelectorAll('.h2h-fund-card').forEach(item => item.classList.remove('is-dragging', 'is-drag-over'));
      });
      cell.addEventListener('dragstart', (event) => {
        const idx = cell.dataset.h2hDragIdx;
        state.h2h.dragIndex = Number(idx);
        card?.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', idx);
      });
      cell.addEventListener('dragend', () => {
        state.h2h.dragIndex = null;
        root.querySelectorAll('.h2h-fund-card').forEach(item => item.classList.remove('is-dragging', 'is-drag-over'));
      });
      cell.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (Number(cell.dataset.h2hDragIdx) !== state.h2h.dragIndex) card?.classList.add('is-drag-over');
      });
      cell.addEventListener('dragleave', (event) => {
        if (!cell.contains(event.relatedTarget)) card?.classList.remove('is-drag-over');
      });
      cell.addEventListener('drop', (event) => {
        event.preventDefault();
        card?.classList.remove('is-drag-over');
        const fromIndex = Number(event.dataTransfer.getData('text/plain') || state.h2h.dragIndex);
        const toIndex = Number(cell.dataset.h2hDragIdx);
        reorderH2HItems(fromIndex, toIndex);
      });
    });
  }

  function renderH2H() {
    const ws = document.getElementById('h2h-workspace');
    if (!ws) return;
    const hasItems = state.h2h.items.length > 0;
    const activeMetricCount = (state.h2h.metrics?.size || 0) + (state.h2h.yearMetrics?.size || 0);
    ws.classList.toggle('h2h-metrics-open', !!state.h2h.metricsOpen);
    ws.innerHTML = `
      <div class="h2h-topbar">
        <button class="tbl-ctrl-btn h2h-metrics-tog-btn" id="h2h-mtog">
          <i class="fas fa-sliders"></i> בחירת מדדים
          <i class="fas fa-chevron-${state.h2h.metricsOpen?'up':'down'}" style="font-size:.55rem;"></i>
        </button>
        ${hasItems ? `<button class="h2h-add-btn" id="h2h-add-btn">
          <i class="fas fa-plus-circle"></i> הוסף קופה להשוואה
        </button>` : ''}
        ${!hasItems ? `<div class="h2h-inline-stats" aria-label="סטטוס השוואה">
          <span><strong>${state.h2h.items.length}</strong> קופות בהשוואה</span>
          <span><strong>${activeMetricCount}</strong> מדדים פעילים</span>
        </div>` : ''}
      </div>
      <div class="h2h-metrics-backdrop" id="h2h-mp-backdrop" style="display:${state.h2h.metricsOpen?'':'none'}"></div>
      <div class="h2h-metrics-panel h2h-metrics-drawer" id="h2h-mp" style="display:${state.h2h.metricsOpen?'':'none'}">
        <div class="h2h-drawer-head">
          <strong>בחירת מדדים</strong>
          <span class="h2h-metrics-limit">ניתן לבחור עד 15 פרמטרים להשוואה (${activeMetricCount}/15)</span>
          <button type="button" class="h2h-drawer-close" id="h2h-mp-close" aria-label="סגור">×</button>
        </div>
        <div class="h2h-drawer-body">${renderH2HMetricsPanel()}</div>
      </div>
      ${!hasItems ? `
        <div class="h2h-empty">
          <i class="fas fa-scale-balanced h2h-empty-icon"></i>
          <div class="h2h-empty-title">ראש בראש — השוואה מותאמת אישית</div>
          <div class="h2h-empty-sub">בחר קופות מכל סוג מוצר ומסלול השקעה והשווה ביניהן לפי המדדים שחשובים לך</div>
          <button class="h2h-add-btn h2h-add-btn-lg" id="h2h-add-btn-2">
            <i class="fas fa-plus-circle"></i> הוסף קופה ראשונה
          </button>
        </div>
      ` : renderH2HActiveView()}
    `;

    // Bind events
    document.getElementById('h2h-mtog')?.addEventListener('click', () => {
      state.h2h.metricsOpen = !state.h2h.metricsOpen;
      const panel = document.getElementById('h2h-mp');
      const backdrop = document.getElementById('h2h-mp-backdrop');
      ws.classList.toggle('h2h-metrics-open', !!state.h2h.metricsOpen);
      if (panel) panel.style.display = state.h2h.metricsOpen ? '' : 'none';
      if (backdrop) backdrop.style.display = state.h2h.metricsOpen ? '' : 'none';
      const btn = document.getElementById('h2h-mtog');
      if (btn) btn.querySelector('.fa-chevron-up,.fa-chevron-down').className =
        `fas fa-chevron-${state.h2h.metricsOpen?'up':'down'}`;
    });
    document.getElementById('h2h-mp-close')?.addEventListener('click', () => {
      state.h2h.metricsOpen = false;
      renderH2H();
    });
    document.getElementById('h2h-mp-backdrop')?.addEventListener('click', () => {
      state.h2h.metricsOpen = false;
      renderH2H();
    });
    document.getElementById('h2h-add-btn')?.addEventListener('click', openH2HWizard);
    document.getElementById('h2h-add-btn-2')?.addEventListener('click', openH2HWizard);

    // Metric checkboxes
    ws.querySelectorAll('.h2h-mcb').forEach(cb => {
      cb.addEventListener('change', () => {
        const drawerBody = document.querySelector('#h2h-mp .h2h-drawer-body');
        const drawerScrollTop = drawerBody?.scrollTop || 0;
        const selectedCount = (state.h2h.metrics?.size || 0) + (state.h2h.yearMetrics?.size || 0);
        if (cb.checked && selectedCount >= 15 && !state.h2h.metrics.has(cb.dataset.metric)) {
          cb.checked = false;
          return;
        }
        if (cb.checked) state.h2h.metrics.add(cb.dataset.metric);
        else state.h2h.metrics.delete(cb.dataset.metric);
        // re-render table area only
        const tbl = ws.querySelector('.h2h-results, .h2h-board-scroll, .h2h-tbl-scroll, .h2h-chart-panel, .h2h-chart-empty');
        const noM  = ws.querySelector('.h2h-no-metrics');
        const target = tbl || noM;
        const newHtml = renderH2HActiveView();
        if (target) target.outerHTML = newHtml;
        else if (state.h2h.items.length > 0) ws.insertAdjacentHTML('beforeend', newHtml);
        persistH2HState();
        refreshH2HMetricsDrawerChrome(ws);
        restoreH2HDrawerScroll(drawerScrollTop);
        bindH2HTableInteractions(ws);
      });
    });
    ws.querySelectorAll('.h2h-ycb').forEach(cb => {
      cb.addEventListener('change', () => {
        const drawerBody = document.querySelector('#h2h-mp .h2h-drawer-body');
        const drawerScrollTop = drawerBody?.scrollTop || 0;
        const year = String(cb.dataset.year || '');
        if (!year) return;
        const selectedCount = (state.h2h.metrics?.size || 0) + (state.h2h.yearMetrics?.size || 0);
        if (cb.checked && selectedCount >= 15 && !state.h2h.yearMetrics.has(year)) {
          cb.checked = false;
          return;
        }
        if (cb.checked) state.h2h.yearMetrics.add(year);
        else state.h2h.yearMetrics.delete(year);
        persistH2HState();
        renderH2H();
        restoreH2HDrawerScroll(drawerScrollTop);
        if (h2hNeedsYearData()) ensureH2HYearDataLoaded();
      });
    });
    if (hasItems && h2hNeedsYearData()) ensureH2HYearDataLoaded();

    bindH2HTableInteractions(ws);
  }

  function openH2HWizard() {
    const existing = document.getElementById('h2h-wiz-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'h2h-wiz-overlay';
    overlay.className = 'h2h-wiz-overlay';
    overlay.innerHTML = `
      <div class="h2h-wiz-panel">
        <div class="h2h-wiz-hdr">
          <span class="h2h-wiz-title">הוסף קופה להשוואה</span>
          <button class="h2h-wiz-x" id="h2h-wiz-x">✕</button>
        </div>
        <div class="h2h-wiz-body" id="h2h-wiz-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#h2h-wiz-x').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    h2hStep1(overlay.querySelector('#h2h-wiz-body'));
  }

  function h2hStep1(body) {
    const cats = CONFIG.PRODUCT_CATEGORIES.filter(c => c.id !== 'hisachon_yeled' && !REMOVED_CATEGORY_IDS.has(c.id));
    body.innerHTML = `
      <div class="h2h-step">
        <div class="h2h-step-label">שלב 1 מתוך 3 — בחר סוג מוצר</div>
        <div class="h2h-cat-grid">
          ${cats.map(c => `
            <button class="h2h-cat-card" data-catid="${c.id}">
              <span class="h2h-cat-icon">${c.icon}</span>
              <span class="h2h-cat-lbl">${c.label}</span>
            </button>`).join('')}
        </div>
      </div>`;
    body.querySelectorAll('.h2h-cat-card').forEach(btn =>
      btn.addEventListener('click', () => h2hStep2(body, btn.dataset.catid)));
  }

  async function h2hStep2(body, catId) {
    body.innerHTML = `
      <div class="h2h-step">
        <button class="h2h-back-btn">→ חזרה</button>
        <div class="h2h-step-label">שלב 2 מתוך 3 — בחר מסלול השקעה</div>
        <div class="h2h-loading"><div class="spinner-sm"></div><span>טוען נתונים...</span></div>
      </div>`;
    body.querySelector('.h2h-back-btn').addEventListener('click', () => h2hStep1(body));
    try {
      const { organized } = await h2hFetchCatData(catId);
      state.h2h.wizardOrganized = organized;
      body.innerHTML = `
        <div class="h2h-step">
          <button class="h2h-back-btn">→ חזרה</button>
          <div class="h2h-step-label">שלב 2 מתוך 3 — בחר מסלול השקעה</div>
          <div class="h2h-track-list">
            ${organized.map(item => `
              <button class="h2h-track-btn" data-trackid="${item.track.id}">
                <span class="h2h-track-lbl">${item.track.label}</span>
                <span class="h2h-track-cnt">${item.records.length} קופות</span>
              </button>`).join('')}
          </div>
        </div>`;
      body.querySelector('.h2h-back-btn').addEventListener('click', () => h2hStep1(body));
      body.querySelectorAll('.h2h-track-btn').forEach(btn =>
        btn.addEventListener('click', () => h2hStep3(body, catId, btn.dataset.trackid)));
    } catch(e) {
      body.querySelector('.h2h-loading').innerHTML = `<p style="color:var(--red);padding:16px">שגיאה בטעינת נתונים: ${e.message}</p>`;
    }
  }

  function h2hStep3(body, catId, trackId) {
    const trackItem = state.h2h.wizardOrganized?.find(it => it.track.id === trackId);
    if (!trackItem) return;
    const records = trackItem.records;
    body.innerHTML = `
      <div class="h2h-step">
        <button class="h2h-back-btn">→ חזרה</button>
        <div class="h2h-step-label">שלב 3 מתוך 3 — בחר מנהל השקעות</div>
        <input class="h2h-fund-search" placeholder="חיפוש לפי שם או מספר קופה..." type="text">
        <div class="h2h-fund-list">
          ${records.map(r => {
            const prov = getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION);
            const color = providerColor(prov);
            return `
              <button class="h2h-fund-btn" data-fundid="${r.FUND_ID}">
                <span class="h2h-dot" style="background:${color}"></span>
                <div class="h2h-fund-btn-text">
                  <div class="h2h-fund-btn-prov">${prov}</div>
                  <div class="h2h-fund-btn-id">#${r.FUND_ID} · ${r.FUND_NAME||''}</div>
                </div>
              </button>`;
          }).join('')}
        </div>
      </div>`;
    body.querySelector('.h2h-back-btn').addEventListener('click', () => h2hStep2(body, catId));
    const search = body.querySelector('.h2h-fund-search');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      body.querySelectorAll('.h2h-fund-btn').forEach(btn => {
        btn.style.display = btn.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    body.querySelectorAll('.h2h-fund-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const record = records.find(r => String(r.FUND_ID) === String(btn.dataset.fundid));
        if (!record) return;
        const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId);
        const cached = state.h2h.catCache[catId];
        state.h2h.items.push({
          catId, catLabel: cat?.label || '',
          trackId: trackId, trackLabel: trackItem.track.label,
          record, provName: getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION),
          yields12M:      cached?.yields12M      || null,
          sharpeMap:      cached?.sharpeMap      || null,
          consistencyMap: cached?.consistencyMap || null,
          stdDevMap:      cached?.stdDevMap      || null,
          momentumMap:    cached?.momentumMap    || null,
          actuarialByProvider: cached?.actuarialByProvider || null,
        });
        invalidateH2HYearData();
        document.getElementById('h2h-wiz-overlay')?.remove();
        renderH2H();
      });
    });
  }

  function getH2HWizardSelection() {
    if (!state.h2h.wizardSelection) state.h2h.wizardSelection = { catIds: [], trackKeys: [], fundKeys: [] };
    return state.h2h.wizardSelection;
  }

  function renderH2HStepHeader({ step, title, canContinue = false, continueLabel = 'המשך לשלב הבא', backLabel = '' }) {
    return `
      <div class="h2h-step-sticky-head">
        <div class="h2h-step-topbar">
          ${backLabel ? `<button class="h2h-back-btn" data-h2h-back="1">${backLabel}</button>` : '<span></span>'}
          <button class="h2h-continue-btn" data-h2h-next="1" ${canContinue ? '' : 'disabled'}>${continueLabel}</button>
        </div>
        <div class="h2h-step-label">${step}</div>
        <div class="h2h-step-title">${title}</div>
      </div>
    `;
  }

  function renderH2HWizardColumns(groups, renderItem) {
    return `
      <div class="h2h-wiz-columns">
        ${groups.map(group => `
          <div class="h2h-wiz-col">
            <div class="h2h-wiz-col-head">
              <div class="h2h-wiz-col-title">${group.catLabel}</div>
              <div class="h2h-wiz-col-sub">${group.items.length} אפשרויות</div>
            </div>
            <div class="${group.listClass}">
              ${group.items.map(item => renderItem(item)).join('')}
            </div>
          </div>`).join('')}
      </div>
    `;
  }

  openH2HWizard = function() {
    const existing = document.getElementById('h2h-wiz-overlay');
    if (existing) existing.remove();
    state.h2h.wizardSelection = { catIds: [], trackKeys: [], fundKeys: [] };
    state.h2h.wizardTrackOptions = [];
    state.h2h.wizardFundOptions = [];
    const overlay = document.createElement('div');
    overlay.id = 'h2h-wiz-overlay';
    overlay.className = 'h2h-wiz-overlay';
    overlay.innerHTML = `
      <div class="h2h-wiz-panel">
        <div class="h2h-wiz-hdr">
          <span class="h2h-wiz-title">הוסף קופה להשוואה</span>
          <button class="h2h-wiz-x" id="h2h-wiz-x">✕</button>
        </div>
        <div class="h2h-wiz-body" id="h2h-wiz-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#h2h-wiz-x').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    h2hStep1(overlay.querySelector('#h2h-wiz-body'));
  };

  h2hStep1 = function(body) {
    const cats = CONFIG.PRODUCT_CATEGORIES.filter(c => c.id !== 'hisachon_yeled' && !REMOVED_CATEGORY_IDS.has(c.id));
    const selection = getH2HWizardSelection();
    body.innerHTML = `
      <div class="h2h-step">
        ${renderH2HStepHeader({
          step: 'שלב 1 מתוך 3',
          title: 'בחר סוג מוצר אחד או יותר',
          canContinue: selection.catIds.length > 0
        })}
        <div class="h2h-cat-grid">
          ${cats.map(c => `
            <button class="h2h-cat-card ${selection.catIds.includes(c.id) ? 'is-selected' : ''}" data-catid="${c.id}">
              <span class="h2h-cat-icon">${c.icon}</span>
              <span class="h2h-cat-lbl">${c.label}</span>
            </button>`).join('')}
        </div>
      </div>`;
    body.querySelectorAll('.h2h-cat-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const catId = btn.dataset.catid;
        const nextIds = selection.catIds.includes(catId)
          ? selection.catIds.filter(id => id !== catId)
          : [...selection.catIds, catId];
        state.h2h.wizardSelection = { ...selection, catIds: nextIds, trackKeys: [], fundKeys: [] };
        h2hStep1(body);
      });
    });
    body.querySelector('[data-h2h-next]')?.addEventListener('click', () => {
      if (!getH2HWizardSelection().catIds.length) return;
      h2hStep2(body);
    });
  };

  h2hStep2 = async function(body) {
    const selection = getH2HWizardSelection();
    const selectedCatIds = selection.catIds || [];
    if (!selectedCatIds.length) {
      h2hStep1(body);
      return;
    }
    body.innerHTML = `
      <div class="h2h-step">
        ${renderH2HStepHeader({
          step: 'שלב 2 מתוך 3',
          title: 'בחר מסלול השקעה אחד או יותר',
          backLabel: 'חזרה'
        })}
        <div class="h2h-loading"><div class="spinner-sm"></div><span>טוען נתונים...</span></div>
      </div>`;
    body.querySelector('[data-h2h-back]')?.addEventListener('click', () => h2hStep1(body));
    try {
      const dataSets = await Promise.all(selectedCatIds.map(catId => h2hFetchCatData(catId).then(data => ({ catId, data }))));
      const groupedTrackOptions = dataSets.map(({ catId, data }) => {
        const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId);
        return {
          catId,
          catLabel: cat?.label || '',
          listClass: 'h2h-track-list',
          items: data.organized.map(item => ({
            key: `${catId}::${item.track.id}`,
            catId,
            catLabel: cat?.label || '',
            trackId: item.track.id,
            trackLabel: item.track.label,
            count: item.records.length
          }))
        };
      }).filter(group => group.items.length > 0);
      const trackOptions = groupedTrackOptions.flatMap(group => group.items);
      state.h2h.wizardTrackOptions = trackOptions;
      body.innerHTML = `
        <div class="h2h-step">
          ${renderH2HStepHeader({
            step: 'שלב 2 מתוך 3',
            title: 'בחר מסלול השקעה אחד או יותר',
            backLabel: 'חזרה',
            continueLabel: 'המשך לבחירת קופות',
            canContinue: selection.trackKeys.length > 0
          })}
          <div class="h2h-track-list">
            ${trackOptions.map(item => `
              <button class="h2h-track-btn ${selection.trackKeys.includes(item.key) ? 'is-selected' : ''}" data-trackkey="${item.key}">
                <span class="h2h-track-meta">
                  <span class="h2h-track-lbl">${item.trackLabel}</span>
                  <span class="h2h-track-cat">${item.catLabel}</span>
                </span>
                <span class="h2h-track-cnt">${item.count} קופות</span>
              </button>`).join('')}
          </div>
        </div>`;
      body.querySelector('[data-h2h-back]')?.addEventListener('click', () => h2hStep1(body));
      body.querySelectorAll('.h2h-track-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.trackkey;
          const nextKeys = selection.trackKeys.includes(key)
            ? selection.trackKeys.filter(id => id !== key)
            : [...selection.trackKeys, key];
          state.h2h.wizardSelection = { ...selection, trackKeys: nextKeys, fundKeys: [] };
          h2hStep2(body);
        });
      });
      body.querySelector('[data-h2h-next]')?.addEventListener('click', () => {
        if (!getH2HWizardSelection().trackKeys.length) return;
        h2hStep3(body);
      });
    } catch(e) {
      body.querySelector('.h2h-loading').innerHTML = `<p style="color:var(--red);padding:16px">שגיאה בטעינת נתונים: ${e.message}</p>`;
    }
  };

  h2hStep3 = function(body) {
    const selection = getH2HWizardSelection();
    const selectedTrackOptions = state.h2h.wizardTrackOptions.filter(item => selection.trackKeys.includes(item.key));
    if (!selectedTrackOptions.length) {
      h2hStep2(body);
      return;
    }
    const fundOptions = selectedTrackOptions.flatMap(item => {
      const organized = state.h2h.catCache[item.catId]?.organized || [];
      const trackItem = organized.find(track => track.track.id === item.trackId);
      const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === item.catId);
      return (trackItem?.records || []).map(record => ({
        key: `${item.catId}::${item.trackId}::${record.FUND_ID}`,
        catId: item.catId,
        catLabel: cat?.label || '',
        trackId: item.trackId,
        trackLabel: item.trackLabel,
        record,
        provName: getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION)
      }));
    });
    state.h2h.wizardFundOptions = fundOptions;
    body.innerHTML = `
      <div class="h2h-step">
        ${renderH2HStepHeader({
          step: 'שלב 3 מתוך 3',
          title: 'בחר קופה אחת או יותר',
          backLabel: 'חזרה',
          continueLabel: 'הוסף להשוואה',
          canContinue: selection.fundKeys.length > 0
        })}
        <input class="h2h-fund-search" placeholder="חיפוש לפי שם או מספר קופה..." type="text">
        <div class="h2h-fund-list">
          ${fundOptions.map(item => {
            const color = providerColor(item.provName);
            return `
              <button class="h2h-fund-btn ${selection.fundKeys.includes(item.key) ? 'is-selected' : ''}" data-fundkey="${item.key}">
                <span class="h2h-dot" style="background:${color}"></span>
                <div class="h2h-fund-btn-text">
                  <div class="h2h-fund-btn-prov">${item.provName}</div>
                  <div class="h2h-fund-btn-id">#${item.record.FUND_ID} · ${item.record.FUND_NAME||''}</div>
                  <div class="h2h-fund-btn-sub">${item.catLabel} · ${item.trackLabel}</div>
                </div>
              </button>`;
          }).join('')}
        </div>
      </div>`;
    body.querySelector('[data-h2h-back]')?.addEventListener('click', () => h2hStep2(body));
    const search = body.querySelector('.h2h-fund-search');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      body.querySelectorAll('.h2h-fund-btn').forEach(btn => {
        btn.style.display = btn.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    body.querySelectorAll('.h2h-fund-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.fundkey;
        const nextKeys = selection.fundKeys.includes(key)
          ? selection.fundKeys.filter(id => id !== key)
          : [...selection.fundKeys, key];
        state.h2h.wizardSelection = { ...selection, fundKeys: nextKeys };
        h2hStep3(body);
      });
    });
    body.querySelector('[data-h2h-next]')?.addEventListener('click', () => {
      const finalSelection = getH2HWizardSelection();
      const selectedFunds = state.h2h.wizardFundOptions.filter(item => finalSelection.fundKeys.includes(item.key));
      if (!selectedFunds.length) return;
      const existingKeys = new Set(state.h2h.items.map(item => `${item.catId}::${item.record.FUND_ID}`));
      selectedFunds.forEach(item => {
        const uniqueKey = `${item.catId}::${item.record.FUND_ID}`;
        if (existingKeys.has(uniqueKey)) return;
        existingKeys.add(uniqueKey);
        const cached = state.h2h.catCache[item.catId];
        state.h2h.items.push({
          catId: item.catId,
          catLabel: item.catLabel,
          trackId: item.trackId,
          trackLabel: item.trackLabel,
          record: item.record,
          provName: item.provName,
          yields12M: cached?.yields12M || null,
          sharpeMap: cached?.sharpeMap || null,
          consistencyMap: cached?.consistencyMap || null,
          stdDevMap: cached?.stdDevMap || null,
          momentumMap: cached?.momentumMap || null,
          actuarialByProvider: cached?.actuarialByProvider || null,
        });
      });
      invalidateH2HYearData();
      invalidateH2HTrailing7Data();
      invalidateH2HCustomRangeData();
      document.getElementById('h2h-wiz-overlay')?.remove();
      persistH2HState();
      renderH2H();
    });
  };

  h2hStep2 = async function(body) {
    const selection = getH2HWizardSelection();
    const selectedCatIds = selection.catIds || [];
    if (!selectedCatIds.length) {
      h2hStep1(body);
      return;
    }
    body.innerHTML = `
      <div class="h2h-step">
        ${renderH2HStepHeader({
          step: 'שלב 2 מתוך 3',
          title: 'בחר מסלול השקעה אחד או יותר',
          backLabel: 'חזרה'
        })}
        <div class="h2h-loading"><div class="spinner-sm"></div><span>טוען נתונים...</span></div>
      </div>`;
    body.querySelector('[data-h2h-back]')?.addEventListener('click', () => h2hStep1(body));
    try {
      const dataSets = await Promise.all(selectedCatIds.map(catId => h2hFetchCatData(catId).then(data => ({ catId, data }))));
      const groupedTrackOptions = dataSets.map(({ catId, data }) => {
        const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === catId);
        return {
          catId,
          catLabel: cat?.label || '',
          listClass: 'h2h-track-list',
          items: data.organized.map(item => ({
            key: `${catId}::${item.track.id}`,
            catId,
            catLabel: cat?.label || '',
            trackId: item.track.id,
            trackLabel: item.track.label,
            count: item.records.length
          }))
        };
      }).filter(group => group.items.length > 0);
      const trackOptions = groupedTrackOptions.flatMap(group => group.items);
      state.h2h.wizardTrackOptions = trackOptions;
      body.innerHTML = `
        <div class="h2h-step">
          ${renderH2HStepHeader({
            step: 'שלב 2 מתוך 3',
            title: 'בחר מסלול השקעה אחד או יותר',
            backLabel: 'חזרה',
            continueLabel: 'המשך לבחירת קופות',
            canContinue: selection.trackKeys.length > 0
          })}
          ${renderH2HWizardColumns(groupedTrackOptions, item => `
            <button class="h2h-track-btn ${selection.trackKeys.includes(item.key) ? 'is-selected' : ''}" data-trackkey="${item.key}">
              <span class="h2h-track-meta">
                <span class="h2h-track-lbl">${item.trackLabel}</span>
                <span class="h2h-track-cat">${item.catLabel}</span>
              </span>
              <span class="h2h-track-cnt">${item.count} קופות</span>
            </button>`)}
        </div>`;
      body.querySelector('[data-h2h-back]')?.addEventListener('click', () => h2hStep1(body));
      body.querySelectorAll('.h2h-track-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.trackkey;
          const nextKeys = selection.trackKeys.includes(key)
            ? selection.trackKeys.filter(id => id !== key)
            : [...selection.trackKeys, key];
          state.h2h.wizardSelection = { ...selection, trackKeys: nextKeys, fundKeys: [] };
          h2hStep2(body);
        });
      });
      body.querySelector('[data-h2h-next]')?.addEventListener('click', () => {
        if (!getH2HWizardSelection().trackKeys.length) return;
        h2hStep3(body);
      });
    } catch (e) {
      body.querySelector('.h2h-loading').innerHTML = `<p style="color:var(--red);padding:16px">שגיאה בטעינת נתונים: ${e.message}</p>`;
    }
  };

  h2hStep3 = function(body) {
    const selection = getH2HWizardSelection();
    const selectedTrackOptions = state.h2h.wizardTrackOptions.filter(item => selection.trackKeys.includes(item.key));
    if (!selectedTrackOptions.length) {
      h2hStep2(body);
      return;
    }
    const groupedFundOptions = selectedTrackOptions.reduce((groups, item) => {
      const organized = state.h2h.catCache[item.catId]?.organized || [];
      const trackItem = organized.find(track => track.track.id === item.trackId);
      const cat = CONFIG.PRODUCT_CATEGORIES.find(c => c.id === item.catId);
      let existingGroup = groups.find(group => group.catId === item.catId);
      if (!existingGroup) {
        existingGroup = {
          catId: item.catId,
          catLabel: cat?.label || '',
          listClass: 'h2h-fund-list',
          managerMap: new Map(),
          items: []
        };
        groups.push(existingGroup);
      }

      (trackItem?.records || []).forEach(record => {
        const provName = getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION);
        if (!existingGroup.managerMap.has(provName)) {
          existingGroup.managerMap.set(provName, {
            key: `${item.catId}::provider::${encodeURIComponent(provName)}`,
            catId: item.catId,
            catLabel: cat?.label || '',
            provName,
            items: [],
            trackLabels: []
          });
        }
        const manager = existingGroup.managerMap.get(provName);
        manager.items.push({
          key: `${item.catId}::${item.trackId}::${record.FUND_ID}`,
          catId: item.catId,
          catLabel: cat?.label || '',
          trackId: item.trackId,
          trackLabel: item.trackLabel,
          record,
          provName
        });
        if (!manager.trackLabels.includes(item.trackLabel)) manager.trackLabels.push(item.trackLabel);
      });
      return groups;
    }, []).map(group => {
      group.items = Array.from(group.managerMap.values())
        .sort((a, b) => a.provName.localeCompare(b.provName, 'he'));
      delete group.managerMap;
      return group;
    });
    const fundOptions = groupedFundOptions.flatMap(group => group.items);
    state.h2h.wizardFundOptions = fundOptions;
    body.innerHTML = `
      <div class="h2h-step">
        ${renderH2HStepHeader({
          step: 'שלב 3 מתוך 3',
          title: 'בחר מנהל השקעות אחד או יותר',
          backLabel: 'חזרה',
          continueLabel: 'הוסף להשוואה',
          canContinue: selection.fundKeys.length > 0
        })}
        <input class="h2h-fund-search" placeholder="חיפוש לפי שם מנהל או מסלול..." type="text">
        ${renderH2HWizardColumns(groupedFundOptions, item => {
          const color = providerColor(item.provName);
          const tracksLabel = item.trackLabels.join(', ');
          const trackCount = item.trackLabels.length;
          return `
            <button class="h2h-fund-btn ${selection.fundKeys.includes(item.key) ? 'is-selected' : ''}" data-fundkey="${item.key}">
              <span class="h2h-dot" style="background:${color}"></span>
              <div class="h2h-fund-btn-text">
                <div class="h2h-fund-btn-prov">${item.provName}</div>
                <div class="h2h-fund-btn-id">${item.catLabel} · ${tracksLabel}</div>
                <div class="h2h-fund-btn-sub">${trackCount > 1 ? `${trackCount} מסלולים יתווספו להשוואה` : 'מסלול אחד יתווסף להשוואה'}</div>
              </div>
            </button>`;
        })}
      </div>`;
    body.querySelector('[data-h2h-back]')?.addEventListener('click', () => h2hStep2(body));
    const search = body.querySelector('.h2h-fund-search');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      body.querySelectorAll('.h2h-fund-btn').forEach(btn => {
        btn.style.display = btn.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    body.querySelectorAll('.h2h-fund-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.fundkey;
        const nextKeys = selection.fundKeys.includes(key)
          ? selection.fundKeys.filter(id => id !== key)
          : [...selection.fundKeys, key];
        state.h2h.wizardSelection = { ...selection, fundKeys: nextKeys };
        h2hStep3(body);
      });
    });
    body.querySelector('[data-h2h-next]')?.addEventListener('click', () => {
      const finalSelection = getH2HWizardSelection();
      const selectedFunds = state.h2h.wizardFundOptions
        .filter(item => finalSelection.fundKeys.includes(item.key))
        .flatMap(item => item.items);
      if (!selectedFunds.length) return;
      const existingKeys = new Set(state.h2h.items.map(item => `${item.catId}::${item.record.FUND_ID}`));
      selectedFunds.forEach(item => {
        const uniqueKey = `${item.catId}::${item.record.FUND_ID}`;
        if (existingKeys.has(uniqueKey)) return;
        existingKeys.add(uniqueKey);
        const cached = state.h2h.catCache[item.catId];
        state.h2h.items.push({
          catId: item.catId,
          catLabel: item.catLabel,
          trackId: item.trackId,
          trackLabel: item.trackLabel,
          record: item.record,
          provName: item.provName,
          yields12M: cached?.yields12M || null,
          sharpeMap: cached?.sharpeMap || null,
          consistencyMap: cached?.consistencyMap || null,
          stdDevMap: cached?.stdDevMap || null,
          momentumMap: cached?.momentumMap || null,
          actuarialByProvider: cached?.actuarialByProvider || null,
        });
      });
      invalidateH2HYearData();
      document.getElementById('h2h-wiz-overlay')?.remove();
      persistH2HState();
      renderH2H();
    });
  };

  function getH2HActiveMetrics() {
    return [
      ...H2H_METRICS.filter(metric => state.h2h.metrics.has(metric.id)),
      ...Array.from(state.h2h.yearMetrics || [])
        .sort((a, b) => Number(b) - Number(a))
        .map(year => ({ id: getH2HYearMetricId(year), label: `תשואה שנת ${year}`, shortLabel: String(year), group: 'תשואות לפי שנים' }))
    ];
  }

  function formatH2HReportPeriodShort(period) {
    const value = Number(period);
    const year = Math.floor(value / 100);
    const month = value % 100;
    const months = ['', 'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יונ׳', 'יול׳', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
    if (!year || month < 1 || month > 12) return '';
    return `${months[month]}${String(year).slice(-2)}`;
  }

  function getH2HMetricShortLabel(metric) {
    if (!metric) return '';
    if (metric.id === 'monthly') {
      const latestPeriod = Math.max(...(state.h2h.items || []).map(item => Number(item.record?.REPORT_PERIOD) || 0));
      return formatH2HReportPeriodShort(latestPeriod) || metric.shortLabel || metric.label;
    }
    if (metric.id === 'customRange') return getH2HCustomRangeLabel();
    return metric.shortLabel || metric.label;
  }

  function getH2HMetricHeadSubLabel(metric) {
    const id = metric?.id || '';
    if (id === 'customRange') return getH2HCustomRangeMetaText();
    if (id === '3yr_cum' || id === '5yr_cum' || id === '7yr_cum') return 'מצטבר';
    if (id === '3yr_ann' || id === '5yr_ann' || id === '7yr_ann') return 'ממוצע שנתי';
    return '';
  }

  // Distinguishes the cumulative/annualized sub-label so it can render as a colored pill
  // instead of plain text; other sub-labels (e.g. the custom-range date-meta text) stay plain.
  function getH2HMetricHeadSubLabelKind(metric) {
    const id = metric?.id || '';
    if (id === '3yr_cum' || id === '5yr_cum' || id === '7yr_cum') return 'cum';
    if (id === '3yr_ann' || id === '5yr_ann' || id === '7yr_ann') return 'ann';
    return '';
  }

  function getH2HRanking(activeMetrics, items) {
    const lowerIsBetter = new Set(['stddev']);
    const bestIdx = {};
    const worstIdx = {};
    activeMetrics.forEach(metric => {
      const vals = items.map((item, index) => ({ value: getH2HMetricRaw(item, metric.id), index })).filter(entry => Number.isFinite(entry.value));
      if (vals.length < 2) return;
      if (lowerIsBetter.has(metric.id)) {
        bestIdx[metric.id] = vals.reduce((best, entry) => entry.value < best.value ? entry : best).index;
        worstIdx[metric.id] = vals.reduce((worst, entry) => entry.value > worst.value ? entry : worst).index;
      } else {
        bestIdx[metric.id] = vals.reduce((best, entry) => entry.value > best.value ? entry : best).index;
        worstIdx[metric.id] = vals.reduce((worst, entry) => entry.value < worst.value ? entry : worst).index;
      }
    });
    return { bestIdx, worstIdx };
  }

  function getH2HDisplayOptionMarks() {
    const options = state.displayOptions || DEFAULT_DISPLAY_OPTIONS;
    const winnerMarks = { gold: '🥇', trophy: '🏆', star: '⭐', crown: '👑', rocket: '🚀' };
    const loserMarks = { tomato: '🍅', thumbsDown: '👎', warning: '⚠️', down: '⬇️', snow: '🧊' };
    return {
      winner: options.medalIcon === 'none' ? '' : (winnerMarks[options.medalIcon] || winnerMarks.gold),
      loser: options.loserIcon === 'none' ? '' : (loserMarks[options.loserIcon] || loserMarks.tomato)
    };
  }

  function getH2HHeatScales(activeMetrics, items) {
    const scales = {};
    activeMetrics.forEach(metric => {
      const values = items
        .map(item => getH2HMetricRaw(item, metric.id))
        .filter(value => Number.isFinite(value));
      scales[metric.id] = {
        posMax: values.filter(value => value > 0).reduce((max, value) => Math.max(max, value), 0),
        negMaxAbs: values.filter(value => value < 0).reduce((max, value) => Math.max(max, Math.abs(value)), 0)
      };
    });
    return scales;
  }

  function getH2HHeatCellAttrs(raw, scale) {
    if (!Number.isFinite(raw)) return { cls: '', style: '' };
    const max = raw < 0 ? scale?.negMaxAbs : scale?.posMax;
    const alpha = max ? Math.max(0.14, Math.min(0.72, 0.14 + (Math.abs(raw) / max) * 0.58)) : 0.14;
    const cls = raw > 0 ? ' h2h-heat-pos' : raw < 0 ? ' h2h-heat-neg' : ' h2h-heat-zero';
    return { cls, style: ` style="--h2h-heat-alpha:${alpha.toFixed(3)}"` };
  }

  // Shared by the live table and the print table, so both order metrics identically.
  function getH2HMetricBlockMeta(metric) {
    const id = metric.id || '';
    if (id === 'assets') return { key: 'identity', label: 'תעודת זהות', order: 10 };
    // Custom range is the metric the user actively picked a bespoke period for — when active it
    // leads the "מבחן התשואה" group (right after identity, ahead of monthly/ytd/1yr/etc.), since
    // it belongs to that group rather than in front of it.
    if (id === 'customRange') return { key: 'returns', label: 'מבחן התשואה', order: 15 };
    if (id === 'monthly') return { key: 'returns', label: 'מבחן התשואה', order: 20 };
    if (id === 'ytd') return { key: 'returns', label: 'מבחן התשואה', order: 21 };
    if (id === '1yr') return { key: 'returns', label: 'מבחן התשואה', order: 22 };
    // Per-year returns sit right next to monthly/ytd/1yr (22.x) — all short single-period
    // returns together — before the multi-year cumulative cluster (23-23.6) and its annualized
    // counterpart cluster (25-25.6), matching the metrics-panel order.
    if (parseH2HYearMetric(id)) return { key: 'returns', label: 'מבחן התשואה', order: 22 + (3000 - Number(parseH2HYearMetric(id))) / 1000 };
    if (id === '3yr_cum') return { key: 'returns', label: 'מבחן התשואה', order: 23 };
    if (id === '5yr_cum') return { key: 'returns', label: 'מבחן התשואה', order: 23.3 };
    if (id === '7yr_cum') return { key: 'returns', label: 'מבחן התשואה', order: 23.6 };
    if (id === '3yr_ann') return { key: 'returns', label: 'מבחן התשואה', order: 25 };
    if (id === '5yr_ann') return { key: 'returns', label: 'מבחן התשואה', order: 25.3 };
    if (id === '7yr_ann') return { key: 'returns', label: 'מבחן התשואה', order: 25.6 };
    if (id === 'sharpe') return { key: 'risk', label: 'סיכון ואלוקציה', order: 40 };
    if (id === 'stock') return { key: 'risk', label: 'סיכון ואלוקציה', order: 41 };
    if (id === 'abroad') return { key: 'risk', label: 'סיכון ואלוקציה', order: 42 };
    if (id === 'fx') return { key: 'risk', label: 'סיכון ואלוקציה', order: 43 };
    if (id === 'stddev') return { key: 'risk', label: 'סיכון ואלוקציה', order: 44 };
    if (id === 'positive') return { key: 'risk', label: 'סיכון ואלוקציה', order: 45 };
    if (id === 'momentum') return { key: 'risk', label: 'סיכון ואלוקציה', order: 46 };
    if (id === 'actuarial') return { key: 'risk', label: 'סיכון ואלוקציה', order: 47 };
    if (id === 'alpha') return { key: 'risk', label: 'סיכון ואלוקציה', order: 48 };
    return { key: 'risk', label: 'סיכון ואלוקציה', order: 90 };
  }

  renderH2HTable = function() {
    const items = state.h2h.items;
    if (!items.length) return '';
    const activeMetrics = getH2HActiveMetrics()
      .map(metric => ({ ...metric, _block: getH2HMetricBlockMeta(metric) }))
      .sort((a, b) => a._block.order - b._block.order)
      .slice(0, 15);
    if (!activeMetrics.length) return '<div class="h2h-no-metrics">בחר לפחות מדד אחד מהחלונית למעלה</div>';
    const displayOptions = state.displayOptions || DEFAULT_DISPLAY_OPTIONS;
    const { bestIdx, worstIdx } = getH2HRanking(activeMetrics, items);
    const heatScales = getH2HHeatScales(activeMetrics, items);
    const marks = getH2HDisplayOptionMarks();
    const lowerIsBetter = new Set(['stddev']);
    const metricScales = {};
    activeMetrics.forEach(metric => {
      const vals = items
        .map(item => getH2HMetricRaw(item, metric.id))
        .filter(value => Number.isFinite(value));
      const min = vals.length ? Math.min(...vals) : 0;
      const max = vals.length ? Math.max(...vals) : 0;
      metricScales[metric.id] = { min, max };
    });
    const valueBarPct = (metric, raw) => {
      if (!Number.isFinite(raw)) return 0;
      const scale = metricScales[metric.id] || { min: raw, max: raw };
      if (['stock', 'abroad', 'fx'].includes(metric.id)) {
        return Math.max(4, Math.min(100, Math.round(raw)));
      }
      if (scale.max === scale.min) return 62;
      if (lowerIsBetter.has(metric.id)) {
        const ratio = (scale.max - raw) / (scale.max - scale.min);
        return Math.max(8, Math.min(100, Math.round(ratio * 100)));
      }
      if (scale.max <= 0) {
        const ratio = (raw - scale.min) / (scale.max - scale.min);
        return Math.max(8, Math.min(100, Math.round(ratio * 100)));
      }
      const maxAbs = Math.max(Math.abs(scale.max), 0.01);
      const ratio = raw > 0 ? raw / maxAbs : 0;
      return Math.max(8, Math.min(100, Math.round(ratio * 100)));
    };
    const getH2HMetricHeadLabel = metric => {
      if (!metric) return '';
      if (metric.id === 'positive') return 'חודשים חיוביים';
      return getH2HMetricShortLabel(metric);
    };
    const _h2hHeadMeasureCtx = document.createElement('canvas').getContext('2d');
    const metricColumnWidth = metric => {
      if (metric.id === 'customRange') return 150;
      if (['3yr_cum','3yr_ann','5yr_cum','5yr_ann','7yr_cum','7yr_ann'].includes(metric.id)) return 96;
      const label = String(getH2HMetricHeadLabel(metric) || '');
      _h2hHeadMeasureCtx.font = "900 12.16px 'Heebo',Arial,sans-serif";
      const textW = _h2hHeadMeasureCtx.measureText(label).width;
      // Every column header card also carries a fixed-size "remove column" (×) button plus its own
      // padding/gaps and a reserved slot for the sort-arrow icon that only appears on hover/active —
      // that overhead (not just the label text) has to fit inside the column, or short labels like
      // year numbers get clipped down to "...16" even though the character-count math looked fine.
      const overhead = 54;
      return Math.max(64, Math.min(140, Math.ceil(textW + overhead)));
    };
    const metricGridTemplate = activeMetrics.map(metric => `${metricColumnWidth(metric)}px`).join(' ');
    const metricGroups = [];
    activeMetrics.forEach(metric => {
      const current = metricGroups[metricGroups.length - 1];
      if (!current || current.key !== metric._block.key) {
        metricGroups.push({ key: metric._block.key, label: metric._block.label, count: 1 });
      } else {
        current.count += 1;
      }
    });
    const groupHead = metricGroups.map(group => `
      <div class="h2h-group-head h2h-group-${group.key}" style="grid-column: span ${group.count}">
        <span>${group.label}</span>
      </div>`).join('');
    const metricHead = activeMetrics.map((metric, metricIndex) => {
      const prev = activeMetrics[metricIndex - 1];
      const blockStart = prev && prev._block.key !== metric._block.key ? ' h2h-block-start' : '';
      const isSorted = state.h2h.sortMetricId === metric.id;
      const metricSubLabel = getH2HMetricHeadSubLabel(metric);
      const metricSubLabelKind = getH2HMetricHeadSubLabelKind(metric);
      const metricSubLabelHtml = metricSubLabel
        ? (metricSubLabelKind ? `<small class="h2h-sub-pill h2h-sub-pill-${metricSubLabelKind}">${metricSubLabel}</small>` : `<small>${metricSubLabel}</small>`)
        : '';
      return `
      <div class="h2h-metric-head-card${blockStart}">
        <button type="button" class="h2h-metric-sort-btn${isSorted ? ' is-active' : ''}${metricSubLabel ? ' has-sub' : ''}" data-h2h-sort-metric="${metric.id}" title="מיין ${metric.label} מהגבוה לנמוך">
          <span>${getH2HMetricHeadLabel(metric)}</span>
          ${metricSubLabelHtml}
          <i class="fas fa-arrow-down-wide-short" aria-hidden="true"></i>
        </button>
        <button type="button" class="h2h-metric-remove-btn" data-h2h-remove-metric="${metric.id}" title="הסר עמודה" aria-label="הסר את ${metric.label}">×</button>
      </div>`;
    }).join('');
    const crownEligibleMetricIds = activeMetrics
      .filter(metric => !['stock', 'abroad', 'fx'].includes(metric.id))
      .map(metric => metric.id);
    const winCounts = items.map((item, index) => ({
      item,
      index,
      wins: crownEligibleMetricIds.filter(metricId => bestIdx[metricId] === index).length
    })).sort((a, b) => b.wins - a.wins);
    const championIndex = winCounts[0]?.wins > 0 ? winCounts[0].index : -1;
    const leaderStrip = items.length && winCounts.some(entry => entry.wins > 0)
      ? `<div class="h2h-leader-strip" aria-label="דירוג קופות מובילות">
          <div class="h2h-leader-head">
            <span class="h2h-leader-kicker">דירוג קופות מובילות</span>
          </div>
          <div class="h2h-leader-podium">
            ${winCounts.slice(0, 3).map((entry, rankIndex) => {
              const wonMetricLabels = crownEligibleMetricIds
                .filter(metricId => bestIdx[metricId] === entry.index)
                .map(metricId => getH2HMetricShortLabel(activeMetrics.find(metric => metric.id === metricId) || { id: metricId, label: metricId }));
              const rankClass = rankIndex === 0 ? 'is-first' : rankIndex === 1 ? 'is-second' : 'is-third';
              const rankLabel = rankIndex === 0 ? 'מקום ראשון' : rankIndex === 1 ? 'מקום שני' : 'מקום שלישי';
              return `
              <article class="h2h-leader-card ${rankClass}">
                <div class="h2h-leader-rank">
                  <b>${rankIndex + 1}</b>
                  <span>${rankLabel}</span>
                </div>
                <div class="h2h-leader-card-main">
                  <strong>${entry.item.provName}</strong>
                  <em>${entry.item.trackLabel || entry.item.catLabel || ''}</em>
                </div>
                <div class="h2h-leader-card-score">
                  <strong>${entry.wins}</strong>
                  <span>${entry.wins === 1 ? 'מדד מוביל' : 'מדדים מובילים'}</span>
                </div>
                ${wonMetricLabels.length ? `<div class="h2h-leader-metrics">${wonMetricLabels.map(label => `<span>${label}</span>`).join('')}</div>` : ''}
              </article>`;
            }).join('')}
          </div>
        </div>`
      : '';
    const rows = items.map((item, index) => {
      const fundUrl = `fund.html?id=${encodeURIComponent(item.record.FUND_ID)}&cat=${encodeURIComponent(item.catId)}`;
      const allocationProfile = ghAllocationProfileFor(ghExposureFromItem(item));
      const allocationIcon = ghAllocationProfileIcons(allocationProfile, item.trackLabel || '');
      const metricCells = activeMetrics.map((metric, metricIndex) => {
        const raw = getH2HMetricRaw(item, metric.id);
        const isBest = bestIdx[metric.id] === index;
        const isWorst = worstIdx[metric.id] === index;
        const prev = activeMetrics[metricIndex - 1];
        const blockStart = prev && prev._block.key !== metric._block.key ? ' h2h-block-start' : '';
        const isYearMetric = !!parseH2HYearMetric(metric.id);
        const rankCls = isBest ? ' h2h-best' : isWorst ? ' h2h-worst' : '';
        const signedColorMetrics = new Set(['monthly','ytd','1yr','3yr_cum','5yr_cum','3yr_ann','5yr_ann','7yr_cum','7yr_ann','customRange','sharpe','positive','momentum','alpha','actuarial']);
        const lowerIsBetterMetrics = new Set(['stddev']);
        let colorCls = '';
        if (Number.isFinite(raw)) {
          if (isYearMetric || signedColorMetrics.has(metric.id)) {
            colorCls = raw > 0 ? ' h2h-pos' : raw < 0 ? ' h2h-neg' : '';
          } else if (lowerIsBetterMetrics.has(metric.id)) {
            colorCls = isBest ? ' h2h-pos' : isWorst ? ' h2h-neg' : '';
          }
        }
        const heat = displayOptions.heatmap ? getH2HHeatCellAttrs(raw, heatScales[metric.id]) : { cls: '', style: '' };
        const isAllocationMetric = ['stock', 'abroad', 'fx'].includes(metric.id);
        const allocationColorMap = { stock: '#6366f1', abroad: '#10b981', fx: '#f97316' };
        const heatStyle = heat.style ? heat.style.replace(/^ style="/, '').replace(/"$/, '') : '';
        const styleVars = [
          heatStyle,
          isAllocationMetric ? `--h2h-bar-color:${allocationColorMap[metric.id] || '#c9b772'}` : ''
        ].filter(Boolean).join(';');
        const styleAttr = styleVars ? ` style="${styleVars}"` : '';
        const allocationBar = isAllocationMetric && Number.isFinite(raw)
          ? `<span class="h2h-mini-bar h2h-allocation-bar" aria-hidden="true"><span style="width:${valueBarPct(metric, raw)}%"></span></span>`
          : '';
        const showWinnerMark = isBest && !isAllocationMetric;
        const winnerMark = showWinnerMark
          ? `<span class="h2h-winner-crown" aria-hidden="true">👑</span>`
          : '<span class="h2h-winner-crown-placeholder" aria-hidden="true"></span>';
        return `<div class="h2h-val h2h-val-visual${isAllocationMetric ? ' h2h-allocation-val' : ''}${blockStart}${colorCls}${rankCls}${heat.cls}"${styleAttr}>
          <span class="h2h-cell-metric-name">${getH2HMetricShortLabel(metric)}</span>
          <span class="h2h-value-shell h2h-value-shell-visual">
            <span class="h2h-value-line">
              ${winnerMark}
              <span class="h2h-number">${getH2HMetricDisplay(item, metric.id)}</span>
            </span>
            ${allocationBar}
          </span>
        </div>`;
      }).join('');
      const safeCatId = String(item.catId || 'general').replace(/[^a-z0-9_-]/gi, '-');
      return `<div class="h2h-board-row ${index === championIndex ? 'is-champion' : ''}">
      <div class="h2h-fund-th h2h-fund-row-th" draggable="true" data-h2h-drag-idx="${index}">
        <div class="h2h-fund-card" title="אפשר לגרור לשינוי מיקום">
          <span class="h2h-drag-handle" aria-hidden="true" title="גרור לשינוי מיקום"><i class="fas fa-grip-vertical"></i></span>
          <button class="h2h-rm-btn" data-idx="${index}" title="הסר">×</button>
          <a class="h2h-fund-link" href="${fundUrl}" draggable="false" title="מעבר לדף הקופה">
            <div class="h2h-fund-card-top">
              <span class="h2h-fund-pname" style="color:${providerColor(item.provName)}">${item.provName}</span>
            </div>
            <div class="h2h-fund-line h2h-fund-line-category">
              <span class="h2h-category-pill h2h-cat-${safeCatId}">${item.catLabel}</span>
            </div>
            <div class="h2h-fund-line h2h-fund-line-details">
              <strong>${item.trackLabel}</strong>
              <span class="h2h-fund-id-line"><b>#${item.record.FUND_ID}${allocationIcon}</b></span>
            </div>
          </a>
        </div>
      </div>
      <div class="h2h-board-metrics">${metricCells}</div>
      </div>`;
    }).join('');
    return `
      <div class="h2h-results">
        ${leaderStrip}
        <div class="h2h-board-scroll">
          <div class="h2h-board" style="--h2h-metric-count:${activeMetrics.length};--h2h-metric-columns:${metricGridTemplate}">
            <div class="h2h-board-head">
              <div class="h2h-fund-axis"><span>קופה</span></div>
              <div class="h2h-metrics-head-wrap">
                <div class="h2h-board-groups">${groupHead}</div>
                <div class="h2h-board-metrics">${metricHead}</div>
              </div>
            </div>
            ${rows}
          </div>
        </div>
      </div>`;
  };

  function getH2HFocusItems(limit = 6) {
    const items = state.h2h.items || [];
    if (items.length <= limit) return items;
    const focused = items.filter(item => state.h2h.focusFundIds?.has(String(item.record?.FUND_ID)));
    return focused.length ? focused : items.slice(0, limit);
  }

  function renderH2HFocusControls() {
    const items = state.h2h.items || [];
    if (items.length <= 6 || state.h2h.viewMode === 'table') return '';
    const visible = getH2HFocusItems();
    const visibleIds = new Set(visible.map(item => String(item.record?.FUND_ID)));
    return `
      <div class="h2h-focusbar">
        <div class="h2h-focusbar-head">
          <strong>קופות בפוקוס</strong>
          <span>מציג ${visible.length} מתוך ${items.length}</span>
        </div>
        <div class="h2h-focuschips">
          ${items.map(item => {
            const id = String(item.record?.FUND_ID);
            return `<button type="button" class="h2h-focuschip ${visibleIds.has(id) ? 'is-active' : ''}" data-h2h-focus="${id}"><span class="h2h-dot" style="background:${providerColor(item.provName)}"></span>${item.provName}</button>`;
          }).join('')}
          <button type="button" class="h2h-focus-action" data-h2h-focus-clear="1">נקה פוקוס</button>
        </div>
      </div>`;
  }

  function getH2HItemYearSeries(item) {
    const years = getH2HAvailableYears().slice(0, 10).sort((a, b) => a - b);
    return years.map(year => ({
      key: String(year),
      label: String(year),
      title: `שנת ${year}`,
      value: state.h2h.yearDataByCat?.get(item.catId)?.yieldMap?.get(String(item.record?.FUND_ID))?.get(year)
    })).filter(point => Number.isFinite(point.value));
  }

  function getH2HItemChartSeries(item) {
    const annualSeries = getH2HItemYearSeries(item);
    const reportPeriod = Number(item.record?.REPORT_PERIOD) || 0;
    const ytdValue = parseFloat(item.record?.YEAR_TO_DATE_YIELD);
    if (reportPeriod && Number.isFinite(ytdValue)) {
      annualSeries.push({
        key: `ytd-${reportPeriod}`,
        label: `עד ${formatReportPeriod(reportPeriod)}`,
        title: `מתחילת השנה עד ${formatReportPeriod(reportPeriod)}`,
        value: ytdValue,
        isYtd: true
      });
    }
    return annualSeries;
  }

  function getH2HChartColor(index) {
    const palette = [
      '#0f172a', '#dc2626', '#10b981', '#9333ea', '#f59e0b',
      '#0891b2', '#db2777', '#475569', '#65a30d', '#ea580c'
    ];
    return palette[index % palette.length];
  }

  function getH2HChartLineDash(index) {
    const patterns = ['', '6 4', '2 4', '10 4 2 4'];
    return patterns[Math.floor(index / 10) % patterns.length];
  }

  function getH2HChartLabel(item) {
    return `${item.provName} · ${item.catLabel} · ${item.trackLabel} · #${item.record?.FUND_ID || ''}`;
  }

  function renderH2HChartView() {
    const items = getH2HFocusItems(6);
    const seriesByItem = items.map(item => ({ item, series: getH2HItemChartSeries(item) })).filter(entry => entry.series.length >= 2);
    if (state.h2h.yearsLoading) return `${renderH2HFocusControls()}<div class="h2h-chart-empty">טוען נתוני שנים...</div>`;
    if (!seriesByItem.length) return `${renderH2HFocusControls()}<div class="h2h-chart-empty">אין מספיק נתוני שנים להצגת גרף</div>`;
    const pointOrder = new Map();
    seriesByItem.forEach(entry => {
      entry.series.forEach(point => {
        if (!pointOrder.has(point.key)) pointOrder.set(point.key, point);
      });
    });
    const pointsAxis = Array.from(pointOrder.values());
    const values = seriesByItem.flatMap(entry => entry.series.map(point => point.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const plot = { x: 66, y: 22, w: 730, h: 290 };
    const xFor = key => plot.x + (pointsAxis.length === 1 ? plot.w : (pointsAxis.findIndex(point => point.key === key) / (pointsAxis.length - 1)) * plot.w);
    const yFor = value => plot.y + plot.h - ((value - min) / span) * plot.h;
    const grid = pointsAxis.map(point => {
      const x = xFor(point.key);
      return `<line x1="${x}" y1="${plot.y}" x2="${x}" y2="${plot.y + plot.h}" class="h2h-chart-grid"></line><text x="${x}" y="${plot.y + plot.h + 24}" class="h2h-chart-year ${point.isYtd ? 'is-ytd' : ''}">${point.label}</text>`;
    }).join('');
    const yLabelValues = Array.from(new Set([max, ...(min < 0 && max > 0 ? [0] : []), min]));
    const yLabels = yLabelValues.map(value => `<text x="${plot.x - 12}" y="${yFor(value) + 4}" class="h2h-chart-ylabel ${value === 0 ? 'is-zero' : ''}">${value > 0 ? '+' : ''}${value.toFixed(1)}%</text>`).join('');
    const zeroY = min < 0 && max > 0 ? yFor(0) : null;
    const negativeBand = zeroY !== null
      ? `<rect class="h2h-chart-negative-band" x="${plot.x}" y="${zeroY}" width="${plot.w}" height="${plot.y + plot.h - zeroY}"></rect><line x1="${plot.x}" y1="${zeroY}" x2="${plot.x + plot.w}" y2="${zeroY}" class="h2h-chart-zero"></line>`
      : '';
    const lines = seriesByItem.map((entry, index) => {
      const color = getH2HChartColor(index);
      const dash = getH2HChartLineDash(index);
      const itemLabel = getH2HChartLabel(entry.item);
      const points = entry.series.map(point => `${xFor(point.key).toFixed(1)},${yFor(point.value).toFixed(1)}`).join(' ');
      const circles = entry.series.map(point => {
        const x = xFor(point.key).toFixed(1);
        const y = yFor(point.value).toFixed(1);
        const valueLabel = `${point.value > 0 ? '+' : ''}${point.value.toFixed(2)}%`;
        const tone = point.value < 0 ? 'is-negative' : point.value > 0 ? 'is-positive' : 'is-zero';
        const fundId = String(entry.item.record?.FUND_ID || '');
        return `<circle class="h2h-chart-point ${point.isYtd ? 'is-ytd' : ''} ${tone}" tabindex="0" role="button" aria-label="${itemLabel} · ${point.title}: ${valueLabel}" data-h2h-point="1" data-fund-id="${fundId}" data-point-key="${point.key}" cx="${x}" cy="${y}" r="${point.isYtd ? 5 : 4}" fill="${color}"><title>${itemLabel} · ${point.title}: ${valueLabel}</title></circle>`;
      }).join('');
      return `<g class="h2h-chart-series"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ''}></polyline>${circles}</g>`;
    }).join('');
    const hoverGroups = pointsAxis.map(point => {
      const x = xFor(point.key);
      const nearest = seriesByItem
        .map((entry, index) => {
          const p = entry.series.find(item => item.key === point.key);
          if (!p) return null;
          return { entry, index, point: p, y: yFor(p.value) };
        })
        .filter(Boolean)
        .sort((a, b) => a.y - b.y);
      if (!nearest.length) return '';
      const labelWidth = 118;
      const labelX = Math.min(plot.x + plot.w - labelWidth - 8, Math.max(plot.x + 8, x - labelWidth - 8));
      const labelStep = 18;
      const labelTop = Math.max(
        plot.y + 12,
        Math.min(plot.y + plot.h - 8 - ((nearest.length - 1) * labelStep), nearest[0].y - 18)
      );
      const labels = nearest.map((item, rowIndex) => {
        const color = getH2HChartColor(item.index);
        const valueLabel = `${item.point.value > 0 ? '+' : ''}${item.point.value.toFixed(2)}%`;
        const managerLabel = item.entry.item.provName || '';
        const trackLabel = item.entry.item.trackLabel || '';
        const labelText = `${managerLabel} · ${trackLabel}`;
        const labelY = labelTop + (rowIndex * labelStep);
        return `
          <g class="h2h-chart-hover-label">
            <foreignObject x="${labelX}" y="${labelY - 14}" width="${labelWidth}" height="19">
              <div xmlns="http://www.w3.org/1999/xhtml" class="h2h-chart-hover-pill" style="--pill-color:${color}">
                <span class="h2h-chart-hover-meta">${labelText}</span>
                <span class="h2h-chart-hover-return">${valueLabel}</span>
              </div>
            </foreignObject>
          </g>`;
      }).join('');
      return `
        <g class="h2h-chart-hover-group" tabindex="0">
          <rect class="h2h-chart-hover-hit" x="${x - 18}" y="${plot.y}" width="36" height="${plot.h + 32}"></rect>
          <line x1="${x}" y1="${plot.y}" x2="${x}" y2="${plot.y + plot.h}" class="h2h-chart-hover-line"></line>
          ${labels}
        </g>`;
    }).join('');
    const legend = seriesByItem.map((entry, index) => `
      <span class="h2h-chart-legend-item">
        <span class="h2h-chart-legend-swatch" style="background:${getH2HChartColor(index)}"></span>
        <span class="h2h-chart-legend-text">
          <strong>${entry.item.provName}</strong>
          <small>${entry.item.catLabel} · ${entry.item.trackLabel} · #${entry.item.record?.FUND_ID || ''}</small>
        </span>
      </span>`).join('');
    const yearRange = pointsAxis.length ? `${pointsAxis[0].label} - ${pointsAxis[pointsAxis.length - 1].label}` : '';
    return `
      ${renderH2HFocusControls()}
      <div class="h2h-chart-panel">
        <div class="h2h-chart-head">
          <strong>תשואות שנתיות + עד חודש הדיווח האחרון</strong>
          <span>כל נקודה מציגה תשואה שנתית; הנקודה האחרונה היא מתחילת השנה עד הדיווח האחרון${yearRange ? ` · ${yearRange}` : ''}</span>
        </div>
        <svg class="h2h-line-chart" viewBox="0 0 860 370" role="img" aria-label="גרף תשואות שנתיות לפי שנה">
          ${negativeBand}
          ${grid}
          ${yLabels}
          <line x1="${plot.x}" y1="${plot.y}" x2="${plot.x}" y2="${plot.y + plot.h}" class="h2h-chart-axis"></line>
          <line x1="${plot.x}" y1="${plot.y + plot.h}" x2="${plot.x + plot.w}" y2="${plot.y + plot.h}" class="h2h-chart-axis"></line>
          ${lines}
          ${hoverGroups}
        </svg>
        <div class="h2h-chart-legend">${legend}</div>
      </div>`;
  }

  function renderH2HActiveView() {
    state.h2h.viewMode = 'table';
    return renderH2HTable();
  }

  function refreshH2HMetricsDrawerChrome(root = document) {
    const selectedCount = (state.h2h.metrics?.size || 0) + (state.h2h.yearMetrics?.size || 0);
    const limit = root.querySelector('.h2h-drawer-head .h2h-metrics-limit');
    if (limit) limit.textContent = `ניתן לבחור עד 15 פרמטרים להשוואה (${selectedCount}/15)`;
    const inlineStats = root.querySelector('.h2h-topbar-main .h2h-inline-stats');
    if (inlineStats) {
      inlineStats.innerHTML = `
        <span><strong>${state.h2h.items.length}</strong> קופות בהשוואה</span>
        <span><strong>${selectedCount}</strong> מדדים פעילים</span>`;
    }
    root.querySelectorAll('.h2h-mcb').forEach(input => {
      input.disabled = !input.checked && selectedCount >= 15;
    });
    root.querySelectorAll('.h2h-ycb').forEach(input => {
      input.disabled = !input.checked && selectedCount >= 15;
    });
  }

  function restoreH2HDrawerScroll(scrollTop) {
    requestAnimationFrame(() => {
      const body = document.querySelector('#h2h-mp .h2h-drawer-body');
      if (body) body.scrollTop = scrollTop;
    });
  }

  // The desktop drawer is `position: sticky`, so its CSS max-height (calc(100vh - ...)) only
  // keeps it on-screen once scrolling has actually pinned it near the top. Before that (e.g. right
  // after opening, at whatever scroll position the page happens to be at), its natural in-flow top
  // offset can already eat most of the viewport, and a height budget sized for "near the top" then
  // pushes the panel's bottom past the screen. Measuring the real top and capping height to it
  // (regardless of sticky state) is what actually guarantees it never runs off-screen.
  function h2hSyncMetricsDrawerMaxHeight() {
    const panel = document.getElementById('h2h-mp');
    if (!panel || !state.h2h.metricsOpen) return;
    if (window.matchMedia('(max-width: 860px)').matches) {
      panel.style.maxHeight = '';
      return;
    }
    const rect = panel.getBoundingClientRect();
    const top = Math.max(rect.top, 0);
    panel.style.maxHeight = Math.max(200, Math.floor(window.innerHeight - top - 12)) + 'px';
  }

  if (!state._h2hDrawerHeightHooked) {
    state._h2hDrawerHeightHooked = true;
    window.addEventListener('resize', h2hSyncMetricsDrawerMaxHeight);
  }

  function bindH2HCustomRangeControls(root) {
    const panel = root?.querySelector('[data-h2h-custom-range]');
    if (!panel) return;
    const range = getH2HCustomRangeState();
    const startSelect = panel.querySelector('[data-h2h-range-start]');
    const endSelect = panel.querySelector('[data-h2h-range-end]');
    const yearSelect = panel.querySelector('[data-h2h-range-year]');
    const metaEl = panel.querySelector('[data-h2h-range-meta]');
    const updateRangeMeta = () => {
      if (!metaEl) return;
      const rangeMonthMeta = getH2HCustomRangeMetaText();
      metaEl.textContent = rangeMonthMeta ? `${getH2HCustomRangeLabel()} · ${rangeMonthMeta}` : (range.meta || '');
    };
    const syncVisibleRangeMode = () => {
      const mode = range.selectionMode === 'year' ? 'year' : 'months';
      panel.querySelectorAll('[data-h2h-range-mode]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.h2hRangeMode === mode);
      });
      panel.querySelectorAll('.h2h-range-fields').forEach(fields => {
        const hasYearSelect = !!fields.querySelector('[data-h2h-range-year]');
        fields.hidden = mode === 'year' ? !hasYearSelect : hasYearSelect;
      });
      updateRangeMeta();
    };
    if (startSelect && range.startPeriod) startSelect.value = String(range.startPeriod);
    if (endSelect && range.endPeriod) endSelect.value = String(range.endPeriod);
    if (yearSelect && range.selectedYear) yearSelect.value = String(range.selectedYear);

    panel.querySelectorAll('[data-h2h-range-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        range.selectionMode = btn.dataset.h2hRangeMode === 'year' ? 'year' : 'months';
        range.userSelectedRange = true;
        if (range.selectionMode === 'year') syncH2HCustomRangeFromYear(range.selectedYear || range.availableYears?.[0]);
        if (startSelect && range.startPeriod) startSelect.value = String(range.startPeriod);
        if (endSelect && range.endPeriod) endSelect.value = String(range.endPeriod);
        if (yearSelect && range.selectedYear) yearSelect.value = String(range.selectedYear);
        syncVisibleRangeMode();
      });
    });
    startSelect?.addEventListener('change', () => { range.startPeriod = startSelect.value; range.selectionMode = 'months'; range.userSelectedRange = true; updateRangeMeta(); });
    endSelect?.addEventListener('change', () => { range.endPeriod = endSelect.value; range.selectionMode = 'months'; range.userSelectedRange = true; updateRangeMeta(); });
    yearSelect?.addEventListener('change', () => {
      range.selectionMode = 'year';
      range.userSelectedRange = true;
      syncH2HCustomRangeFromYear(yearSelect.value);
      if (startSelect && range.startPeriod) startSelect.value = String(range.startPeriod);
      if (endSelect && range.endPeriod) endSelect.value = String(range.endPeriod);
      syncVisibleRangeMode();
    });
    panel.querySelector('[data-h2h-range-refresh]')?.addEventListener('click', () => ensureH2HCustomRangeAvailability(true));
    panel.querySelector('[data-h2h-toggle-custom-range]')?.addEventListener('click', () => {
      state.h2h.customRangeSectionOpen = !state.h2h.customRangeSectionOpen;
      panel.outerHTML = renderH2HCustomRangeControls();
      bindH2HCustomRangeControls(document);
    });
    panel.querySelector('[data-h2h-range-apply]')?.addEventListener('click', applyH2HCustomRangeSelection);
    panel.querySelector('[data-h2h-range-clear]')?.addEventListener('click', clearH2HCustomRangeSelection);
  }

  // Matches the .sbcmp-th-0..11 palette in CSS — cycles so every fund column gets a distinct
  // background even past 4 funds, instead of leaving later columns uncolored.
  const H2H_PRINT_COL_COLOR_COUNT = 12;

  // בונה טבלת הדפסה נפרדת מה-DOM האינטראקטיבי של הלוח (לא outerHTML של הלוח החי) —
  // באותה צורה בדיוק כמו טבלת ההשוואה בסנדבוקס (mkTable ליד _sbRenderCompare): קופות
  // ככותרות עמודה (ציר ה-X), מדדים כשורות מימין. מכיוון שהמחרוזת נבנית מאפס, אין שום
  // סיכוי שכפתור/ידית-גרירה/תפריט יתגלגלו להדפסה בטעות — הם פשוט לא קיימים בה.
  function _h2hBuildPrintTableHtml() {
    const items = state.h2h.items || [];
    if (!items.length) return '';
    const activeMetrics = getH2HActiveMetrics()
      .map(metric => ({ ...metric, _block: getH2HMetricBlockMeta(metric) }))
      .sort((a, b) => a._block.order - b._block.order)
      .slice(0, 15);
    if (!activeMetrics.length) return '';
    const { bestIdx } = getH2HRanking(activeMetrics, items);
    const signedMetrics = new Set(['monthly', 'ytd', '1yr', '3yr_cum', '5yr_cum', '3yr_ann', '5yr_ann', '7yr_cum', '7yr_ann', 'customRange', 'sharpe', 'positive', 'momentum', 'alpha', 'actuarial']);
    const lowerIsBetterMetrics = new Set(['stddev']);
    const allocationMetrics = new Set(['stock', 'abroad', 'fx']);

    let head = '<tr><th>מדד</th>';
    items.forEach((item, ci) => {
      const colorCls = ` sbcmp-th-${ci % H2H_PRINT_COL_COLOR_COUNT}`;
      head += `<th class="h2h-print-th${colorCls}">`
        + `<div class="h2h-print-col-provider">${escapeHtml(item.provName || '')}</div>`
        + `<div class="h2h-print-col-category">${escapeHtml(item.catLabel || '')}</div>`
        + `<div class="h2h-print-col-track">${escapeHtml(item.trackLabel || '')} · #${escapeHtml(String(item.record?.FUND_ID || ''))}</div>`
        + '</th>';
    });
    head += '</tr>';

    const rows = activeMetrics.map(metric => {
      const subLabelKind = getH2HMetricHeadSubLabelKind(metric);
      const subLabelHtml = subLabelKind
        ? ` <span class="h2h-sub-pill h2h-sub-pill-${subLabelKind}">${escapeHtml(getH2HMetricHeadSubLabel(metric))}</span>`
        : '';
      let row = `<tr><td class="sbcmp-row-label">${escapeHtml(getH2HMetricShortLabel(metric) || metric.label)}${subLabelHtml}</td>`;
      items.forEach((item, index) => {
        const raw = getH2HMetricRaw(item, metric.id);
        const isBest = bestIdx[metric.id] === index;
        let signCls = '';
        if (Number.isFinite(raw)) {
          if (signedMetrics.has(metric.id) || parseH2HYearMetric(metric.id)) signCls = raw > 0 ? 'pos' : raw < 0 ? 'neg' : '';
          else if (lowerIsBetterMetrics.has(metric.id)) signCls = isBest ? 'pos' : '';
        }
        const rankMark = isBest && !allocationMetrics.has(metric.id)
          ? '<i class="fas fa-crown sbcmp-best-icon" aria-hidden="true"></i>'
          : '';
        row += `<td class="${signCls}"><span class="sbcmp-val-wrap">${rankMark}${getH2HMetricDisplay(item, metric.id)}</span></td>`;
      });
      return row + '</tr>';
    }).join('');

    // דירוג קופות מובילות — אותו חישוב בדיוק כמו ה-leaderStrip בלוח החי (renderH2HTable):
    // ספירת "ניצחונות" לפי מדד (לא כולל מניות/חו"ל/מט"ח, שאין להם "טוב יותר" חד-משמעי).
    const crownEligibleMetricIds = activeMetrics
      .filter(metric => !allocationMetrics.has(metric.id))
      .map(metric => metric.id);
    const winCounts = items.map((item, index) => ({
      item,
      index,
      wins: crownEligibleMetricIds.filter(metricId => bestIdx[metricId] === index).length
    })).sort((a, b) => b.wins - a.wins);
    const leaderStripHtml = winCounts.some(entry => entry.wins > 0)
      ? '<div class="h2h-leader-strip">'
        + '<div class="h2h-leader-head"><span class="h2h-leader-kicker">דירוג קופות מובילות</span></div>'
        + '<div class="h2h-leader-podium">'
        + winCounts.slice(0, 3).map((entry, rankIndex) => {
          const wonMetricLabels = crownEligibleMetricIds
            .filter(metricId => bestIdx[metricId] === entry.index)
            .map(metricId => getH2HMetricShortLabel(activeMetrics.find(metric => metric.id === metricId) || { id: metricId, label: metricId }));
          const rankClass = rankIndex === 0 ? 'is-first' : rankIndex === 1 ? 'is-second' : 'is-third';
          const rankLabel = rankIndex === 0 ? 'מקום ראשון' : rankIndex === 1 ? 'מקום שני' : 'מקום שלישי';
          return `<article class="h2h-leader-card ${rankClass}">`
            + `<div class="h2h-leader-rank"><b>${rankIndex + 1}</b><span>${rankLabel}</span></div>`
            + `<div class="h2h-leader-card-main"><strong>${escapeHtml(entry.item.provName || '')}</strong><em>${escapeHtml(entry.item.trackLabel || entry.item.catLabel || '')}</em></div>`
            + `<div class="h2h-leader-card-score"><strong>${entry.wins}</strong><span>${entry.wins === 1 ? 'מדד מוביל' : 'מדדים מובילים'}</span></div>`
            + (wonMetricLabels.length ? `<div class="h2h-leader-metrics">${wonMetricLabels.map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div>` : '')
            + '</article>';
        }).join('')
        + '</div></div>'
      : '';

    return '<div class="sbcmp-section"><div class="sbcmp-section-head">השוואת קופות</div>'
      + '<table class="sbcmp-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>'
      + (leaderStripHtml ? '<div class="sbcmp-section">' + leaderStripHtml + '</div>' : '');
  }

  // הדפסת "ראש בראש" — משתמשת באותה תשתית שהוכחה עצמה בהדפסת "השווה תיקים"
  // בסנדבוקס (אותם קלאסים/מזהים: body.sb-compare-printing, #sb-compare-print-root
  // וכו'), כולל אותו CSS. אין הפעלה אוטומטית מבוססת afterprint/matchMedia —
  // ראה את ההערות המפורטות ליד _sbPrintCompare למה זה לא אמין במובייל.
  function _h2hPrintCompare() {
    const tableHtml = _h2hBuildPrintTableHtml();
    if (!tableHtml) return;
    _ghTrackAnalytics('h2h_print', { fund_count: (state.h2h.items || []).length || 0 });
    const now = new Date();
    const dateStr = now.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

    _sbComparePrintInProgress = true;
    _sbCleanupComparePrintState();
    _sbComparePrintInProgress = true;
    _sbCleanupPrintState();
    _sbComparePrintRoot = document.createElement('div');
    _sbComparePrintRoot.id = 'sb-compare-print-root';
    _sbComparePrintRoot.className = 'h2h-print-root';
    _sbComparePrintRoot.dir = 'rtl';
    _sbComparePrintRoot.style.display = 'none';
    _sbComparePrintRoot.innerHTML =
      '<div class="sb-compare-print-return-overlay">' +
        '<button type="button" id="sb-compare-print-return-btn" class="sb-compare-print-return-btn">← חזרה להשוואה</button>' +
        '<div class="sb-compare-print-return-timer" id="sb-compare-print-return-timer"></div>' +
      '</div>' +
      '<div class="sb-print-report-header">' +
        '<div class="sb-print-logo">' + SB_PRINT_LOGO_HTML + '</div>' +
        '<div class="sb-print-portfolio-title">השוואה ראש בראש</div>' +
        '<div class="sb-print-meta">הופק: ' + dateStr + '<br>רועי רומנו, מתכנן פיננסי וסוכן פנסיוני מורשה | 052-8089808</div>' +
      '</div>' +
      tableHtml +
      '<div class="sb-print-disclaimer">המידע נועד לספק תמונת מצב כללית והשוואתית בלבד ואינו מהווה ייעוץ השקעות, שיווק פנסיוני או תחליף לייעוץ אישי המותאם לצרכי הלקוח. הנתונים מבוססים על מקורות פומביים ועשויים להכיל טעויות או אי-דיוקים. אין לראות בתשואות העבר התחייבות לתשואות עתידיות. לפני קבלת החלטה פיננסית מומלץ להתייעץ עם בעל רישיון.</div>';
    _sbComparePrintScrollY = window.scrollY || 0;
    _sbComparePrintOriginalNodes = Array.from(document.body.childNodes);
    document.body.replaceChildren(_sbComparePrintRoot);
    document.body.classList.add('sb-compare-printing');
    document.getElementById('sb-compare-print-return-btn')?.addEventListener('click', _sbCleanupComparePrintState);
    void _sbComparePrintRoot.offsetHeight;

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        _sbWaitForPrintAssets(_sbComparePrintRoot).then(function() {
          try {
            window.print();
            _sbComparePrintVisHandler = function() {
              if (!document.hidden) setTimeout(_sbCleanupComparePrintState, 700);
            };
            document.addEventListener('visibilitychange', _sbComparePrintVisHandler);
            _sbComparePrintCleanupTimer = setTimeout(_sbCleanupComparePrintState, SB_COMPARE_PRINT_SAFETY_MS);
            const countdownEl = document.getElementById('sb-compare-print-return-timer');
            if (countdownEl) {
              const deadline = Date.now() + SB_COMPARE_PRINT_SAFETY_MS;
              const tick = () => {
                const secsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
                countdownEl.textContent = `חוזר אוטומטית בעוד ${secsLeft} שנ׳`;
              };
              tick();
              _sbComparePrintCountdownInterval = setInterval(tick, 250);
            }
          } catch (error) {
            console.warn('H2H print failed', error);
            _sbCleanupComparePrintState();
            showToast('לא הצלחנו לפתוח את חלון ההדפסה. נסה שוב.');
          }
        });
      });
    });
  }

  renderH2H = function() {
    const ws = document.getElementById('h2h-workspace');
    if (!ws) return;
    const hasItems = state.h2h.items.length > 0;
    const activeMetricCount = (state.h2h.metrics?.size || 0) + (state.h2h.yearMetrics?.size || 0);
    // The drawer/table entrance animations should only play the moment the panel actually opens —
    // not on every re-render while it's already open (metric/year toggles rebuild this markup too,
    // and replaying a translateX+opacity entrance on each click reads as a jarring "page refresh").
    // ws itself survives the innerHTML rebuild below, so its classList doubles as "was it open on
    // the previous render" — comparing that to the new state is enough to detect a true open edge,
    // no timers needed.
    const wasMetricsOpen = ws.classList.contains('h2h-metrics-open');
    const justOpenedMetrics = !wasMetricsOpen && !!state.h2h.metricsOpen;
    ws.classList.toggle('h2h-metrics-open', !!state.h2h.metricsOpen);
    ws.classList.toggle('h2h-metrics-just-opened', justOpenedMetrics);
    if (justOpenedMetrics) setTimeout(() => ws.classList.remove('h2h-metrics-just-opened'), 300);
    ws.innerHTML = `
      <div class="h2h-topbar">
        <div class="h2h-topbar-actions">
          <button class="h2h-add-btn" id="h2h-add-btn">
            <i class="fas fa-plus-circle"></i> הוסף קופה
          </button>
          <button class="tbl-ctrl-btn h2h-metrics-tog-btn" id="h2h-mtog">
            <i class="fas fa-sliders"></i> בחירת מדדים
            <i class="fas fa-chevron-${state.h2h.metricsOpen ? 'up' : 'down'}" style="font-size:.55rem;"></i>
          </button>
          <button class="h2h-clear-btn" id="h2h-clear-btn" ${hasItems ? '' : 'disabled'}>
            <i class="fas fa-trash-alt"></i> נקה השוואה
          </button>
          <button class="tbl-ctrl-btn h2h-print-btn" id="h2h-print-btn" title="הדפס השוואה" ${hasItems ? '' : 'disabled'}>
            <i class="fas fa-print"></i> הדפסה
          </button>
        </div>
        <div class="h2h-topbar-main">
          <div class="h2h-inline-stats" aria-label="סטטוס השוואה">
            <span><strong>${state.h2h.items.length}</strong> קופות בהשוואה</span>
            <span><strong>${activeMetricCount}</strong> מדדים פעילים</span>
          </div>
        </div>
      </div>
      <div class="h2h-metrics-backdrop" id="h2h-mp-backdrop" style="display:${state.h2h.metricsOpen ? '' : 'none'}"></div>
      <div class="h2h-metrics-panel h2h-metrics-drawer" id="h2h-mp" style="display:${state.h2h.metricsOpen ? '' : 'none'}">
        <div class="h2h-drawer-head">
          <strong>בחירת מדדים</strong>
          <span class="h2h-metrics-limit">ניתן לבחור עד 15 פרמטרים להשוואה (${activeMetricCount}/15)</span>
          <button type="button" class="h2h-drawer-close" id="h2h-mp-close" aria-label="סגור">×</button>
        </div>
        <div class="h2h-drawer-body">${renderH2HMetricsPanel()}</div>
      </div>
      ${!hasItems ? `
        <div class="h2h-empty">
          <i class="fas fa-scale-balanced h2h-empty-icon"></i>
          <div class="h2h-empty-title">ראש בראש — השוואה מותאמת אישית</div>
          <div class="h2h-empty-sub">בחר קופות מכל סוג מוצר ומסלול השקעה והשווה ביניהן לפי המדדים שחשובים לך</div>
          <button class="h2h-add-btn h2h-add-btn-lg" id="h2h-add-btn-2">
            <i class="fas fa-plus-circle"></i> הוסף קופה ראשונה
          </button>
        </div>
      ` : renderH2HActiveView()}
    `;

    document.getElementById('h2h-mtog')?.addEventListener('click', () => {
      state.h2h.metricsOpen = !state.h2h.metricsOpen;
      renderH2H();
    });
    document.getElementById('h2h-mp-close')?.addEventListener('click', () => {
      state.h2h.metricsOpen = false;
      renderH2H();
    });
    document.getElementById('h2h-mp-backdrop')?.addEventListener('click', () => {
      state.h2h.metricsOpen = false;
      renderH2H();
    });
    bindH2HCustomRangeControls(ws);
    if (state.h2h.metricsOutsideHandler) {
      document.removeEventListener('pointerdown', state.h2h.metricsOutsideHandler, true);
      state.h2h.metricsOutsideHandler = null;
    }
    if (state.h2h.metricsOpen) {
      state.h2h.metricsOutsideHandler = event => {
        const panel = document.getElementById('h2h-mp');
        const toggle = document.getElementById('h2h-mtog');
        const mobileMetricsNav = document.querySelector('[data-mobile-app-action="sidebar-filter"]');
        if (panel?.contains(event.target) || toggle?.contains(event.target) || mobileMetricsNav?.contains(event.target)) return;
        document.removeEventListener('pointerdown', state.h2h.metricsOutsideHandler, true);
        state.h2h.metricsOutsideHandler = null;
        state.h2h.metricsOpen = false;
        renderH2H();
      };
      setTimeout(() => document.addEventListener('pointerdown', state.h2h.metricsOutsideHandler, true), 0);
    }

    document.getElementById('h2h-add-btn')?.addEventListener('click', openH2HWizard);
    document.getElementById('h2h-add-btn-2')?.addEventListener('click', openH2HWizard);
    document.getElementById('h2h-clear-btn')?.addEventListener('click', () => {
      state.h2h.items = [];
      state.h2h.focusFundIds = new Set();
      invalidateH2HYearData();
      invalidateH2HTrailing7Data();
      invalidateH2HCustomRangeData();
      clearPersistedH2HState();
      renderH2H();
    });
    document.getElementById('h2h-print-btn')?.addEventListener('click', _h2hPrintCompare);

    ws.querySelectorAll('.h2h-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.h2h.viewMode = btn.dataset.h2hView || 'table';
        persistH2HState();
        renderH2H();
        if (h2hNeedsYearData()) ensureH2HYearDataLoaded();
      });
    });

    ws.querySelectorAll('[data-h2h-focus]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = String(btn.dataset.h2hFocus || '');
        if (!id) return;
        if (!state.h2h.focusFundIds) state.h2h.focusFundIds = new Set();
        if (state.h2h.focusFundIds.has(id)) state.h2h.focusFundIds.delete(id);
        else state.h2h.focusFundIds.add(id);
        persistH2HState();
        renderH2H();
        if (h2hNeedsYearData()) ensureH2HYearDataLoaded();
      });
    });

    ws.querySelector('[data-h2h-focus-clear]')?.addEventListener('click', () => {
      state.h2h.focusFundIds = new Set();
      persistH2HState();
      renderH2H();
      if (h2hNeedsYearData()) ensureH2HYearDataLoaded();
    });


    ws.querySelectorAll('.h2h-mcb').forEach(cb => {
      cb.addEventListener('change', () => {
        const drawerBody = document.querySelector('#h2h-mp .h2h-drawer-body');
        const drawerScrollTop = drawerBody?.scrollTop || 0;
        const selectedCount = (state.h2h.metrics?.size || 0) + (state.h2h.yearMetrics?.size || 0);
        if (cb.checked && selectedCount >= 15 && !state.h2h.metrics.has(cb.dataset.metric)) {
          cb.checked = false;
          return;
        }
        if (cb.checked) state.h2h.metrics.add(cb.dataset.metric);
        else state.h2h.metrics.delete(cb.dataset.metric);
        if (cb.dataset.metric === 'customRange') {
          if (cb.checked) {
            state.h2h.customRangeSectionOpen = true;
            const rangeBox = ws.querySelector('[data-h2h-custom-range]');
            if (rangeBox) rangeBox.outerHTML = renderH2HCustomRangeControls();
            if (!getH2HCustomRangeState().active) ensureH2HCustomRangeAvailability();
          } else {
            invalidateH2HCustomRangeData();
          }
        }
        if (cb.checked && (cb.dataset.metric === '7yr_cum' || cb.dataset.metric === '7yr_ann')) {
          ensureH2HTrailing7DataLoaded();
        }
        const tbl = ws.querySelector('.h2h-results, .h2h-board-scroll, .h2h-tbl-scroll, .h2h-chart-panel, .h2h-chart-empty');
        const noM = ws.querySelector('.h2h-no-metrics');
        const newHtml = renderH2HActiveView();
        if (tbl) tbl.outerHTML = newHtml;
        else if (noM) noM.outerHTML = newHtml;
        else if (state.h2h.items.length > 0) ws.insertAdjacentHTML('beforeend', newHtml);
        persistH2HState();
        refreshH2HMetricsDrawerChrome(ws);
        bindH2HCustomRangeControls(ws);
        restoreH2HDrawerScroll(drawerScrollTop);
        bindH2HTableInteractions(ws);
      });
    });
    ws.querySelectorAll('.h2h-ycb').forEach(cb => {
      cb.addEventListener('change', () => {
        const drawerBody = document.querySelector('#h2h-mp .h2h-drawer-body');
        const drawerScrollTop = drawerBody?.scrollTop || 0;
        const year = String(cb.dataset.year || '');
        if (!year) return;
        const selectedCount = (state.h2h.metrics?.size || 0) + (state.h2h.yearMetrics?.size || 0);
        if (cb.checked && selectedCount >= 15 && !state.h2h.yearMetrics.has(year)) {
          cb.checked = false;
          return;
        }
        if (cb.checked) {
          state.h2h.yearMetrics.add(year);
          state.h2h.yearSectionOpen = true;
        } else {
          state.h2h.yearMetrics.delete(year);
          // Closed follows "no year selected" as its default, not just its initial state — so
          // unchecking the last year collapses it again instead of leaving it stuck open forever.
          if (state.h2h.yearMetrics.size === 0) state.h2h.yearSectionOpen = false;
        }
        persistH2HState();
        renderH2H();
        restoreH2HDrawerScroll(drawerScrollTop);
        if (h2hNeedsYearData()) ensureH2HYearDataLoaded();
      });
    });
    ws.querySelector('[data-h2h-toggle-years]')?.addEventListener('click', () => {
      const drawerBody = document.querySelector('#h2h-mp .h2h-drawer-body');
      const drawerScrollTop = drawerBody?.scrollTop || 0;
      state.h2h.yearSectionOpen = !state.h2h.yearSectionOpen;
      renderH2H();
      restoreH2HDrawerScroll(drawerScrollTop);
    });
    if (hasItems && h2hNeedsYearData()) ensureH2HYearDataLoaded();
    if (hasItems && h2hNeedsTrailing7Data()) ensureH2HTrailing7DataLoaded();
    if (hasItems && state.h2h.metricsOpen) ensureH2HCustomRangeAvailability();
    if (state.h2h.metricsOpen) h2hSyncMetricsDrawerMaxHeight();

    bindH2HTableInteractions(ws);
    syncMobileAppNav('h2h');
  };

  function parseNumberInput(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatCurrencyILS(value) {
    const num = Number(value) || 0;
    return `\u200E${Math.round(num).toLocaleString('he-IL')} ₪`;
  }

  function formatPercentPlain(value, digits = 2) {
    const num = Number(value);
    return Number.isFinite(num) ? `\u200E${num.toFixed(digits)}%` : '—';
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || 0, min), max);
  }

  function getRiskLabel(score) {
    const safeScore = Number(score) || 0;
    if (safeScore < 26) return 'נמוכה';
    if (safeScore < 51) return 'בינונית';
    if (safeScore < 76) return 'גבוהה';
    return 'גבוהה מאוד';
  }

  function deriveRiskScore({ stockPct = 0, abroadPct = 0, fxPct = 0 }) {
    const score = (Number(stockPct) || 0) * 0.62
      + (Number(abroadPct) || 0) * 0.18
      + (Number(fxPct) || 0) * 0.20;
    return Math.round(clamp(score, 0, 100));
  }

  function getCashToolCategoryMeta(categoryId) {
    const cat = CONFIG.PRODUCT_CATEGORIES.find(item => item.id === categoryId);
    return {
      categoryId,
      categoryLabel: cat?.label || '',
      productLabel: cat?.label || ''
    };
  }

  function loadCashToolDraft() {
    try {
      const raw = localStorage.getItem(CASH_TOOL_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state.cashTool = {
        ...createDefaultCashToolState(),
        ...parsed,
        initialized: true,
        loading: false,
        catalog: [],
        form: {
          ...createDefaultCashToolForm(),
          ...(parsed.form || {})
        }
      };
    } catch (error) {
      console.warn('Failed to load cash tool draft', error);
    }
  }

  function persistCashToolDraft(showSavedToast = false) {
    try {
      localStorage.setItem(CASH_TOOL_DRAFT_KEY, JSON.stringify({
        totalCash: state.cashTool.totalCash,
        allocations: state.cashTool.allocations,
        nextId: state.cashTool.nextId,
        editingId: state.cashTool.editingId,
        form: state.cashTool.form
      }));
      if (showSavedToast) showToast('התיק נשמר מקומית במחשב שלך');
    } catch (error) {
      console.warn('Failed to save cash tool draft', error);
      if (showSavedToast) showToast('לא הצלחנו לשמור את הטיוטה כרגע');
    }
  }

  function ensureCashToolState() {
    if (!state.cashTool.initialized) loadCashToolDraft();
    if (!state.cashTool.initialized) state.cashTool.initialized = true;
  }

  function getCashToolSummary() {
    const totalCash = parseNumberInput(state.cashTool.totalCash) || 0;
    const allocations = state.cashTool.allocations || [];
    const allocated = allocations.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const remaining = totalCash - allocated;
    const weightedAverage = (getter) => {
      const valid = allocations.filter(item => {
        const value = getter(item);
        return Number(item.amount) > 0 && value !== null && value !== undefined && !Number.isNaN(value);
      });
      const validAmount = valid.reduce((sum, item) => sum + Number(item.amount), 0);
      if (!validAmount) return null;
      return valid.reduce((sum, item) => sum + (getter(item) * Number(item.amount)), 0) / validAmount;
    };
    const managers = new Map();
    const products = new Map();
    allocations.forEach(item => {
      const amount = Number(item.amount) || 0;
      if (amount <= 0) return;
      managers.set(item.providerName, (managers.get(item.providerName) || 0) + amount);
      products.set(item.productLabel, (products.get(item.productLabel) || 0) + amount);
    });
    const riskScore = weightedAverage(item => Number(item.riskScore) || 0) || 0;
    const weightedHistoricalAverage = (getter) => {
      const valid = allocations.filter(item => (item.historySource === 'historical' || item.sourceType === 'existing') && Number(item.amount) > 0 && getter(item) != null && !Number.isNaN(getter(item)));
      const validAmount = valid.reduce((sum, item) => sum + Number(item.amount), 0);
      if (!validAmount) return null;
      return valid.reduce((sum, item) => sum + (getter(item) * Number(item.amount)), 0) / validAmount;
    };
    const weightedExpectedAverage = (getter) => {
      const valid = allocations.filter(item => Number(item.amount) > 0 && getter(item) != null && !Number.isNaN(getter(item)));
      const validAmount = valid.reduce((sum, item) => sum + Number(item.amount), 0);
      if (!validAmount) return null;
      return valid.reduce((sum, item) => sum + (getter(item) * Number(item.amount)), 0) / validAmount;
    };
    return {
      totalCash,
      allocated,
      remaining,
      feePercent: weightedAverage(item => item.feePercent == null ? null : Number(item.feePercent)),
      stockPct: weightedAverage(item => Number(item.stockPct)),
      abroadPct: weightedAverage(item => Number(item.abroadPct)),
      fxPct: weightedAverage(item => Number(item.fxPct)),
      oneYear: weightedHistoricalAverage(item => item.returns?.y1),
      threeYear: weightedHistoricalAverage(item => item.returns?.y3),
      fiveYear: weightedHistoricalAverage(item => item.returns?.y5),
      expectedReturn: weightedExpectedAverage(item => item.expectedReturn),
      riskScore,
      riskLabel: getRiskLabel(riskScore),
      managerDistribution: Array.from(managers.entries()).sort((a, b) => b[1] - a[1]),
      productDistribution: Array.from(products.entries()).sort((a, b) => b[1] - a[1]),
      allocationCount: allocations.length
    };
  }

  function buildDistributionBars(items, totalAmount, emptyLabel) {
    if (!items.length || !totalAmount) {
      return `<div class="cash-tool-empty-inline">${emptyLabel}</div>`;
    }
    return items.map(([label, amount]) => {
      const pct = (amount / totalAmount) * 100;
      return `
        <div class="cash-tool-dist-row">
          <div class="cash-tool-dist-head">
            <span class="cash-tool-dist-label">${label}</span>
            <span class="cash-tool-dist-value">${formatCurrencyILS(amount)} · ${pct.toFixed(0)}%</span>
          </div>
          <div class="cash-tool-dist-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
        </div>`;
    }).join('');
  }

  function getCashToolCatalogFilters() {
    const categoryId = state.cashTool.form.existingCategoryId;
    const categoryItems = state.cashTool.catalog.filter(item => item.categoryId === categoryId);
    const providers = Array.from(new Set(categoryItems.map(item => item.providerName))).sort((a, b) => a.localeCompare(b, 'he'));
    const providerName = providers.includes(state.cashTool.form.existingProviderName)
      ? state.cashTool.form.existingProviderName
      : (providers[0] || '');
    const funds = categoryItems
      .filter(item => !providerName || item.providerName === providerName)
      .sort((a, b) => a.trackLabel.localeCompare(b.trackLabel, 'he'));
    const fundId = funds.some(item => item.fundId === state.cashTool.form.existingFundId)
      ? state.cashTool.form.existingFundId
      : (funds[0]?.fundId || '');

    state.cashTool.form.existingProviderName = providerName;
    state.cashTool.form.existingFundId = fundId;

    return {
      providers,
      funds,
      selectedFund: funds.find(item => item.fundId === fundId) || null
    };
  }

  async function loadCashToolCatalog() {
    if (state.cashTool.catalog.length || state.cashTool.loading) return;
    state.cashTool.loading = true;
    renderCashToolPage();
    try {
      const dataSets = await Promise.all(CASH_TOOL_EXISTING_CATEGORY_IDS.map(catId => h2hFetchCatData(catId)));
      const catalog = [];
      dataSets.forEach((data, index) => {
        const categoryId = CASH_TOOL_EXISTING_CATEGORY_IDS[index];
        const meta = getCashToolCategoryMeta(categoryId);
        data.organized.forEach(trackItem => {
          trackItem.records.forEach(record => {
            const fundId = String(record.FUND_ID || '');
            const stockPct = calcExposurePercentValue(record.STOCK_MARKET_EXPOSURE, record.TOTAL_ASSETS);
            const abroadPct = calcExposurePercentValue(record.FOREIGN_EXPOSURE, record.TOTAL_ASSETS);
            const fxPct = calcExposurePercentValue(record.FOREIGN_CURRENCY_EXPOSURE, record.TOTAL_ASSETS);
            const riskScore = deriveRiskScore({ stockPct, abroadPct, fxPct });
            catalog.push({
              categoryId,
              categoryLabel: meta.categoryLabel,
              productLabel: meta.productLabel,
              fundId,
              providerName: getProviderDisplayName(record.CONTROLLING_CORPORATION, record.MANAGING_CORPORATION),
              trackLabel: trackItem.track.label,
              fundName: record.FUND_NAME || '',
              reportPeriod: record.REPORT_PERIOD || '',
              oneYear: data.yields12M?.get(fundId) ?? null,
              threeYear: Number.isFinite(parseFloat(record.YIELD_TRAILING_3_YRS)) ? parseFloat(record.YIELD_TRAILING_3_YRS) : null,
              fiveYear: Number.isFinite(parseFloat(record.YIELD_TRAILING_5_YRS)) ? parseFloat(record.YIELD_TRAILING_5_YRS) : null,
              stockPct,
              abroadPct,
              fxPct,
              riskScore,
              riskLabel: getRiskLabel(riskScore),
              sharpe: data.sharpeMap?.get(fundId) ?? null
            });
          });
        });
      });
      state.cashTool.catalog = catalog.sort((a, b) => {
        if (a.categoryLabel !== b.categoryLabel) return a.categoryLabel.localeCompare(b.categoryLabel, 'he');
        if (a.providerName !== b.providerName) return a.providerName.localeCompare(b.providerName, 'he');
        return a.trackLabel.localeCompare(b.trackLabel, 'he');
      });
      getCashToolCatalogFilters();
    } catch (error) {
      console.error(error);
      showToast('לא הצלחנו לטעון כרגע את קטלוג המוצרים');
    } finally {
      state.cashTool.loading = false;
      renderCashToolPage();
    }
  }

  async function showCashToolPage() {
    ensureCashToolState();
    renderCashToolPage();
    await loadCashToolCatalog();
  }

  function updateCashToolFormFromDom() {
    const root = document.getElementById('cash-tool-root');
    if (!root) return;
    const getVal = (selector) => root.querySelector(selector)?.value ?? '';
    state.cashTool.form = {
      ...state.cashTool.form,
      sourceType: getVal('input[name="cash-tool-source"]:checked') || state.cashTool.form.sourceType,
      existingCategoryId: getVal('#cash-existing-category') || state.cashTool.form.existingCategoryId,
      existingProviderName: getVal('#cash-existing-provider') || state.cashTool.form.existingProviderName,
      existingFundId: getVal('#cash-existing-fund') || state.cashTool.form.existingFundId,
      amount: getVal('#cash-allocation-amount'),
      allocationPercent: getVal('#cash-allocation-percent'),
      feePercent: getVal('#cash-allocation-fee'),
      notes: getVal('#cash-allocation-notes'),
      manualProductType: getVal('#cash-manual-type') || state.cashTool.form.manualProductType,
      manualName: getVal('#cash-manual-name'),
      manualProviderName: getVal('#cash-manual-provider'),
      riskScore: getVal('#cash-manual-risk') || state.cashTool.form.riskScore,
      stockPct: getVal('#cash-manual-stock'),
      abroadPct: getVal('#cash-manual-abroad'),
      fxPct: getVal('#cash-manual-fx'),
      expectedReturn: getVal('#cash-manual-return')
    };
  }

  function startCashToolEdit(entryId) {
    const allocation = state.cashTool.allocations.find(item => item.id === entryId);
    if (!allocation) return;
    state.cashTool.editingId = entryId;
    if (allocation.sourceType === 'existing') {
      state.cashTool.form = {
        ...createDefaultCashToolForm(),
        sourceType: 'existing',
        existingCategoryId: allocation.categoryId,
        existingProviderName: allocation.providerName,
        existingFundId: allocation.fundId,
        amount: String(allocation.amount ?? ''),
        allocationPercent: allocation.allocationPercent != null ? String(allocation.allocationPercent) : '',
        feePercent: allocation.feePercent ?? '',
        notes: allocation.notes || ''
      };
    } else {
      state.cashTool.form = {
        ...createDefaultCashToolForm(),
        sourceType: 'manual',
        manualProductType: allocation.manualProductType || 'manual_other',
        manualName: allocation.trackLabel || '',
        manualProviderName: allocation.providerName === 'מוצר ידני' ? '' : allocation.providerName,
        amount: String(allocation.amount ?? ''),
        allocationPercent: allocation.allocationPercent != null ? String(allocation.allocationPercent) : '',
        feePercent: allocation.feePercent ?? '',
        notes: allocation.notes || '',
        riskScore: allocation.riskScore ?? 35,
        stockPct: allocation.stockPct ?? 0,
        abroadPct: allocation.abroadPct ?? 0,
        fxPct: allocation.fxPct ?? 0,
        expectedReturn: allocation.expectedReturn ?? ''
      };
    }
    renderCashToolPage();
  }

  function resetCashToolForm() {
    state.cashTool.editingId = null;
    state.cashTool.form = createDefaultCashToolForm();
    getCashToolCatalogFilters();
  }

  function upsertCashToolAllocation() {
    updateCashToolFormFromDom();
    const form = state.cashTool.form;
    const totalCash = parseNumberInput(state.cashTool.totalCash) || 0;
    const allocationPercent = parseNumberInput(form.allocationPercent);
    let amount = parseNumberInput(form.amount);
    if ((!amount || amount <= 0) && allocationPercent != null && totalCash > 0) {
      amount = totalCash * (allocationPercent / 100);
    }
    const feePercent = parseNumberInput(form.feePercent);
    if (!amount || amount <= 0) {
      showToast('יש להזין סכום השקעה או אחוז הקצאה תקין');
      return;
    }

    let entry;
    if (form.sourceType === 'existing') {
      const selected = state.cashTool.catalog.find(item =>
        item.categoryId === form.existingCategoryId && item.fundId === form.existingFundId
      );
      if (!selected) {
        showToast('יש לבחור מוצר קיים מהרשימה');
        return;
      }
      entry = {
        id: state.cashTool.editingId || state.cashTool.nextId++,
        sourceType: 'existing',
        categoryId: selected.categoryId,
        productLabel: selected.productLabel,
        categoryLabel: selected.categoryLabel,
        providerName: selected.providerName,
        trackLabel: selected.trackLabel,
        fundName: selected.fundName,
        fundId: selected.fundId,
        amount,
        allocationPercent,
        feePercent,
        notes: form.notes.trim(),
        riskScore: selected.riskScore,
        riskLabel: selected.riskLabel,
        stockPct: selected.stockPct,
        abroadPct: selected.abroadPct,
        fxPct: selected.fxPct,
        returns: {
          y1: selected.oneYear,
          y3: selected.threeYear,
          y5: selected.fiveYear
        },
        historySource: 'historical',
        expectedReturn: null,
        reportPeriod: selected.reportPeriod
      };
    } else {
      const stockPct = clamp(parseNumberInput(form.stockPct) ?? 0, 0, 100);
      const abroadPct = clamp(parseNumberInput(form.abroadPct) ?? 0, 0, 100);
      const fxPct = clamp(parseNumberInput(form.fxPct) ?? 0, 0, 100);
      const riskScore = clamp(parseNumberInput(form.riskScore) ?? 35, 0, 100);
      const expectedReturn = parseNumberInput(form.expectedReturn);
      const manualType = CASH_TOOL_MANUAL_PRODUCTS.find(item => item.id === form.manualProductType);
      entry = {
        id: state.cashTool.editingId || state.cashTool.nextId++,
        sourceType: 'manual',
        manualProductType: form.manualProductType,
        categoryId: form.manualProductType,
        productLabel: manualType?.label || 'מוצר ידני',
        categoryLabel: 'מוצר ידני',
        providerName: form.manualProviderName.trim() || 'מוצר ידני',
        trackLabel: form.manualName.trim() || manualType?.label || 'מוצר ידני',
        fundName: form.manualName.trim() || manualType?.label || 'מוצר ידני',
        fundId: `manual-${Date.now()}`,
        amount,
        allocationPercent,
        feePercent,
        notes: form.notes.trim(),
        riskScore,
        riskLabel: getRiskLabel(riskScore),
        stockPct,
        abroadPct,
        fxPct,
        returns: { y1: null, y3: null, y5: null },
        historySource: 'manual_expected_only',
        expectedReturn,
        reportPeriod: null
      };
    }

    const index = state.cashTool.allocations.findIndex(item => item.id === entry.id);
    if (index >= 0) state.cashTool.allocations.splice(index, 1, entry);
    else state.cashTool.allocations.push(entry);
    resetCashToolForm();
    persistCashToolDraft();
    renderCashToolPage();
    showToast(index >= 0 ? 'השורה עודכנה בתיק' : 'הרכיב נוסף לתיק');
  }

  function removeCashToolAllocation(entryId) {
    state.cashTool.allocations = state.cashTool.allocations.filter(item => item.id !== entryId);
    if (state.cashTool.editingId === entryId) resetCashToolForm();
    persistCashToolDraft();
    renderCashToolPage();
  }

  function clearCashToolDraft() {
    state.cashTool = createDefaultCashToolState();
    state.cashTool.initialized = true;
    try { localStorage.removeItem(CASH_TOOL_DRAFT_KEY); } catch (error) { /* noop */ }
    renderCashToolPage();
    showToast('הטיוטה נוקתה');
  }

  function buildCashToolDonut(items, totalAmount, modifierClass = '') {
    if (!items.length || totalAmount <= 0) {
      return `<div class="cash-tool-donut cash-tool-donut-empty ${modifierClass}"><span>אין\nנתונים</span></div>`;
    }
    const palette = ['#0f172a', '#6366f1', '#10b981', '#818cf8', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    let cursor = 0;
    const segments = items.slice(0, 6).map(([label, amount], index) => {
      const pct = (amount / totalAmount) * 100;
      const start = cursor;
      cursor += pct;
      return { label, amount, pct, color: palette[index % palette.length], start, end: cursor };
    });
    const background = segments.length
      ? `conic-gradient(${segments.map(seg => `${seg.color} ${seg.start.toFixed(1)}% ${seg.end.toFixed(1)}%`).join(', ')})`
      : '#e2e8f0';
    return `
      <div class="cash-tool-donut-wrap">
        <div class="cash-tool-donut ${modifierClass}" style="background:${background}">
          <span>${segments.length}</span>
        </div>
        <div class="cash-tool-donut-legend">
          ${segments.map(seg => `<div class="cash-tool-donut-item"><i style="background:${seg.color}"></i><span>${seg.label}</span><strong>${seg.pct.toFixed(0)}%</strong></div>`).join('')}
        </div>
      </div>`;
  }

  function buildCashToolExposureBars(summary) {
    const bars = [
      ['מניות', summary.stockPct, '#6366f1'],
      ['חו"ל', summary.abroadPct, '#10b981'],
      ['מט"ח', summary.fxPct, '#f97316']
    ];
    return bars.map(([label, value, color]) => `
      <div class="cash-tool-mini-bar-row">
        <span>${label}</span>
        <div class="cash-tool-mini-bar-track"><i style="width:${clamp(value || 0, 0, 100)}%;background:${color};"></i></div>
        <strong>${formatPercentPlain(value, 1)}</strong>
      </div>`).join('');
  }

  function buildCashToolAllocationRows() {
    if (!state.cashTool.allocations.length) {
      return `<div class="cash-tool-empty-state">
        <i class="fas fa-layer-group" aria-hidden="true"></i>
        <strong>עדיין לא נוספו רכיבים לתיק</strong>
        <span>הוסיפו רכיב ראשון דרך הבנאי הדביק בצד. אפשר לעבוד עם סכום או עם אחוזי הקצאה.</span>
      </div>`;
    }

    return state.cashTool.allocations.map(item => {
      const returnSummary = item.historySource === 'historical'
        ? [
            `שנה: ${formatPercentPlain(item.returns?.y1)}`,
            `3 שנים: ${formatPercentPlain(item.returns?.y3)}`,
            `5 שנים: ${formatPercentPlain(item.returns?.y5)}`
          ].join(' · ')
        : `תשואה צפויה בלבד: ${formatPercentPlain(item.expectedReturn)}`;
      const allocationPct = item.allocationPercent != null ? `${Number(item.allocationPercent).toFixed(1)}%` : '';
      return `
        <div class="cash-tool-allocation-card">
          <div class="cash-tool-allocation-main">
            <div class="cash-tool-allocation-title-row">
              <div>
                <h4>${item.productLabel}</h4>
                <p>${item.providerName} · ${item.trackLabel}</p>
              </div>
              <div class="cash-tool-allocation-amount-wrap">
                <div class="cash-tool-allocation-amount">${formatCurrencyILS(item.amount)}</div>
                ${allocationPct ? `<small>${allocationPct} מהתיק</small>` : ''}
              </div>
            </div>
            <div class="cash-tool-chip-row">
              <span class="cash-tool-chip">${item.riskLabel} · ${item.riskScore}/100</span>
              <span class="cash-tool-chip">דמי ניהול: ${item.feePercent != null ? formatPercentPlain(item.feePercent) : 'לא הוזנו'}</span>
              <span class="cash-tool-chip">מניות: ${formatPercentPlain(item.stockPct, 1)}</span>
              <span class="cash-tool-chip">חו"ל: ${formatPercentPlain(item.abroadPct, 1)}</span>
              <span class="cash-tool-chip">מט"ח: ${formatPercentPlain(item.fxPct, 1)}</span>
            </div>
            <div class="cash-tool-allocation-meta">${returnSummary}</div>
            ${item.notes ? `<div class="cash-tool-allocation-note">${item.notes}</div>` : ''}
          </div>
          <div class="cash-tool-allocation-actions">
            <button type="button" class="cash-secondary-btn" data-cash-edit="${item.id}">עריכה</button>
            <button type="button" class="cash-danger-btn" data-cash-remove="${item.id}">הסר</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderCashToolPage() {
    const root = document.getElementById('cash-tool-root');
    if (!root) return;

    ensureCashToolState();
    const summary = getCashToolSummary();
    const isEditing = state.cashTool.editingId !== null;
    const sourceType = state.cashTool.form.sourceType || 'existing';
    const categoryOptions = CASH_TOOL_EXISTING_CATEGORY_IDS.map(getCashToolCategoryMeta);
    const { providers, funds, selectedFund } = getCashToolCatalogFilters();
    const selectedManualType = CASH_TOOL_MANUAL_PRODUCTS.find(item => item.id === state.cashTool.form.manualProductType);
    const coveragePct = summary.totalCash > 0 ? clamp((summary.allocated / summary.totalCash) * 100, 0, 100) : 0;
    const topManagers = summary.managerDistribution.slice(0, 5);
    const topProducts = summary.productDistribution.slice(0, 5);

    if (state.cashTool.loading && !state.cashTool.catalog.length) {
      root.innerHTML = `<div class="cash-tool-loading"><div class="spinner"></div><p>טוען את קטלוג המוצרים הרלוונטיים לבניית התיק...</p></div>`;
      return;
    }

    root.innerHTML = `
      <div class="cash-tool-shell">
        <section class="cash-tool-toolbar">
          <div class="cash-tool-toolbar-main">
            <div class="cash-tool-toolbar-copy">
              <span class="cash-tool-kicker">הוסר</span>
              <h2>בונים תיק מהר, על מסך אחד</h2>
            </div>
            <label class="cash-tool-total-box cash-tool-total-box-compact">
              <span>סכום פנוי</span>
              <input type="number" min="0" step="1000" id="cash-total-input" value="${state.cashTool.totalCash}" placeholder="300000" />
            </label>
            <div class="cash-tool-action-buttons">
              <button type="button" class="cash-primary-btn" id="cash-save-draft-btn">שמור</button>
              <button type="button" class="cash-secondary-btn" id="cash-print-btn">הדפס</button>
              <button type="button" class="cash-secondary-btn" id="cash-clear-btn">נקה</button>
            </div>
          </div>
        </section>

        <div class="cash-tool-compact-layout">
          <aside class="cash-tool-sticky-rail">
            <section class="cash-tool-builder-card cash-tool-builder-card-compact">
              <div class="cash-tool-section-head cash-tool-section-head-tight">
                <div>
                  <h3>${isEditing ? 'עדכון רכיב' : 'הוספת רכיב'}</h3>
                  <p>קומפקטי, מהיר, עם סכום או אחוז.</p>
                </div>
                ${isEditing ? '<span class="cash-tool-edit-badge">עריכה</span>' : ''}
              </div>

              <div class="cash-tool-source-switch cash-tool-source-switch-compact">
                <label class="cash-tool-source-option ${sourceType === 'existing' ? 'is-active' : ''}">
                  <input type="radio" name="cash-tool-source" value="existing" ${sourceType === 'existing' ? 'checked' : ''} />
                  <span>מהאתר</span>
                </label>
                <label class="cash-tool-source-option ${sourceType === 'manual' ? 'is-active' : ''}">
                  <input type="radio" name="cash-tool-source" value="manual" ${sourceType === 'manual' ? 'checked' : ''} />
                  <span>ידני</span>
                </label>
              </div>

              ${sourceType === 'existing' ? `
                <div class="cash-tool-form-grid cash-tool-form-grid-compact">
                  <label>
                    <span>מוצר</span>
                    <select id="cash-existing-category">
                      ${categoryOptions.map(option => `<option value="${option.categoryId}" ${option.categoryId === state.cashTool.form.existingCategoryId ? 'selected' : ''}>${option.productLabel}</option>`).join('')}
                    </select>
                  </label>
                  <label>
                    <span>מנהל</span>
                    <select id="cash-existing-provider">
                      ${providers.map(provider => `<option value="${provider}" ${provider === state.cashTool.form.existingProviderName ? 'selected' : ''}>${provider}</option>`).join('')}
                    </select>
                  </label>
                  <label class="cash-tool-field-span-2">
                    <span>מסלול</span>
                    <select id="cash-existing-fund">
                      ${funds.map(fund => `<option value="${fund.fundId}" ${fund.fundId === state.cashTool.form.existingFundId ? 'selected' : ''}>${fund.trackLabel}</option>`).join('')}
                    </select>
                  </label>
                </div>
                ${selectedFund ? `
                  <div class="cash-tool-selection-preview cash-tool-selection-preview-compact">
                    <strong>${selectedFund.providerName} · ${selectedFund.trackLabel}</strong>
                    <div class="cash-tool-chip-row">
                      <span class="cash-tool-chip">סיכון ${selectedFund.riskScore}</span>
                      <span class="cash-tool-chip">מניות ${formatPercentPlain(selectedFund.stockPct, 0)}</span>
                      <span class="cash-tool-chip">שנה ${formatPercentPlain(selectedFund.oneYear)}</span>
                    </div>
                  </div>` : ''}
              ` : `
                <div class="cash-tool-form-grid cash-tool-form-grid-compact">
                  <label>
                    <span>מוצר</span>
                    <select id="cash-manual-type">
                      ${CASH_TOOL_MANUAL_PRODUCTS.map(option => `<option value="${option.id}" ${option.id === state.cashTool.form.manualProductType ? 'selected' : ''}>${option.label}</option>`).join('')}
                    </select>
                  </label>
                  <label>
                    <span>שם</span>
                    <input type="text" id="cash-manual-name" value="${state.cashTool.form.manualName || ''}" placeholder="${selectedManualType?.label || 'שם מוצר'}" />
                  </label>
                  <label class="cash-tool-field-span-2">
                    <span>מנהל</span>
                    <input type="text" id="cash-manual-provider" value="${state.cashTool.form.manualProviderName || ''}" placeholder="שם חופשי" />
                  </label>
                  <label>
                    <span>סיכון</span>
                    <input type="range" min="0" max="100" step="1" id="cash-manual-risk" value="${state.cashTool.form.riskScore}" />
                    <small>${getRiskLabel(state.cashTool.form.riskScore)} · ${state.cashTool.form.riskScore}/100</small>
                  </label>
                  <label>
                    <span>% מניות</span>
                    <input type="number" min="0" max="100" step="0.1" id="cash-manual-stock" value="${state.cashTool.form.stockPct}" />
                  </label>
                  <label>
                    <span>% חו"ל</span>
                    <input type="number" min="0" max="100" step="0.1" id="cash-manual-abroad" value="${state.cashTool.form.abroadPct}" />
                  </label>
                  <label>
                    <span>% מט"ח</span>
                    <input type="number" min="0" max="100" step="0.1" id="cash-manual-fx" value="${state.cashTool.form.fxPct}" />
                  </label>
                  <label class="cash-tool-field-span-2">
                    <span>תשואה צפויה בלבד</span>
                    <input type="number" step="0.01" id="cash-manual-return" value="${state.cashTool.form.expectedReturn}" placeholder="לא תשמש כהיסטורית" />
                  </label>
                </div>
              `}

              <div class="cash-tool-form-grid cash-tool-form-grid-compact cash-tool-form-grid-bottom">
                <label>
                  <span>סכום</span>
                  <input type="number" min="0" step="1000" id="cash-allocation-amount" value="${state.cashTool.form.amount}" placeholder="75000" />
                </label>
                <label>
                  <span>או % מהתיק</span>
                  <input type="number" min="0" max="100" step="0.1" id="cash-allocation-percent" value="${state.cashTool.form.allocationPercent || ''}" placeholder="25" />
                </label>
                <label>
                  <span>דמי ניהול</span>
                  <input type="number" min="0" step="0.01" id="cash-allocation-fee" value="${state.cashTool.form.feePercent}" placeholder="0.75" />
                </label>
                <label class="cash-tool-field-span-2">
                  <span>הערה</span>
                  <textarea id="cash-allocation-notes" rows="2" placeholder="אופציונלי">${state.cashTool.form.notes || ''}</textarea>
                </label>
              </div>

              <div class="cash-tool-builder-actions cash-tool-builder-actions-sticky">
                <button type="button" class="cash-primary-btn" id="cash-add-allocation-btn">${isEditing ? 'עדכן' : 'הוסף'}</button>
                <button type="button" class="cash-secondary-btn" id="cash-add-similar-btn">הוסף מסלול נוסף</button>
                ${isEditing ? '<button type="button" class="cash-secondary-btn" id="cash-cancel-edit-btn">בטל</button>' : ''}
              </div>
            </section>

            <section class="cash-tool-dashboard-card">
              <div class="cash-tool-dashboard-top">
                <div>
                  <span>הוקצה</span>
                  <strong>${formatCurrencyILS(summary.allocated)}</strong>
                  <small>${summary.totalCash ? `נותרו ${formatCurrencyILS(summary.remaining)}` : 'הזן סכום פנוי'}</small>
                </div>
                <div class="cash-tool-progress-ring">
                  <div class="cash-tool-progress"><span style="width:${coveragePct.toFixed(1)}%"></span></div>
                  <b>${coveragePct.toFixed(0)}%</b>
                </div>
              </div>
              <div class="cash-tool-mini-stats">
                <div><span>סיכון</span><strong>${summary.riskScore.toFixed(0)}</strong></div>
                <div><span>דמי ניהול</span><strong>${formatPercentPlain(summary.feePercent)}</strong></div>
                <div><span>צפוי קדימה</span><strong>${formatPercentPlain(summary.expectedReturn)}</strong></div>
                <div><span>תשואה היסטורית 1Y</span><strong>${formatPercentPlain(summary.oneYear)}</strong></div>
              </div>
              <div class="cash-tool-side-block">
                <h4>חשיפות ממוצעות</h4>
                ${buildCashToolExposureBars(summary)}
              </div>
              <div class="cash-tool-dashboard-visuals">
                <div class="cash-tool-visual-card">
                  <h4>מנהלים</h4>
                  ${buildCashToolDonut(topManagers, summary.allocated, 'is-managers')}
                </div>
                <div class="cash-tool-visual-card">
                  <h4>מוצרים</h4>
                  ${buildCashToolDonut(topProducts, summary.allocated, 'is-products')}
                </div>
              </div>
            </section>
          </aside>

          <section class="cash-tool-allocations-wrap cash-tool-allocations-wrap-compact">
            <div class="cash-tool-section-head">
              <div>
                <h3>רכיבי התיק</h3>
                <p>${summary.allocationCount ? `${summary.allocationCount} שורות פעילות` : 'עדיין אין שורות בתיק'}</p>
              </div>
              <div class="cash-tool-history-note">תשואה צפויה ידנית לא נכנסת לחישוב ההיסטורי.</div>
            </div>
          <div class="cash-tool-allocation-list">${buildCashToolAllocationRows()}</div>
          </section>
        </div>
      </div>`;

    root.querySelector('#cash-total-input')?.addEventListener('change', (event) => {
      state.cashTool.totalCash = event.target.value;
      persistCashToolDraft();
      renderCashToolPage();
    });
    root.querySelector('#cash-save-draft-btn')?.addEventListener('click', () => persistCashToolDraft(true));
    root.querySelector('#cash-print-btn')?.addEventListener('click', () => {
      _ghTrackAnalytics('cash_tool_print', {
        allocation_count: state.cashTool.allocations.length || 0
      });
      window.print();
    });
    root.querySelector('#cash-clear-btn')?.addEventListener('click', clearCashToolDraft);
    root.querySelector('#cash-add-allocation-btn')?.addEventListener('click', upsertCashToolAllocation);
    root.querySelector('#cash-add-similar-btn')?.addEventListener('click', () => {
      updateCashToolFormFromDom();
      state.cashTool.editingId = null;
      state.cashTool.form.amount = '';
      state.cashTool.form.allocationPercent = '';
      state.cashTool.form.notes = '';
      renderCashToolPage();
      showToast('אפשר לבחור עכשיו מסלול נוסף באותו מוצר');
    });
    root.querySelector('#cash-cancel-edit-btn')?.addEventListener('click', () => {
      resetCashToolForm();
      renderCashToolPage();
    });

    root.querySelectorAll('[data-cash-edit]').forEach(btn => {
      btn.addEventListener('click', () => startCashToolEdit(Number(btn.dataset.cashEdit)));
    });
    root.querySelectorAll('[data-cash-remove]').forEach(btn => {
      btn.addEventListener('click', () => removeCashToolAllocation(Number(btn.dataset.cashRemove)));
    });
    root.querySelectorAll('input[name="cash-tool-source"]').forEach(input => {
      input.addEventListener('change', () => {
        updateCashToolFormFromDom();
        state.cashTool.editingId = null;
        renderCashToolPage();
      });
    });
    root.querySelector('#cash-existing-category')?.addEventListener('change', () => {
      updateCashToolFormFromDom();
      state.cashTool.form.existingProviderName = '';
      state.cashTool.form.existingFundId = '';
      renderCashToolPage();
    });
    root.querySelector('#cash-existing-provider')?.addEventListener('change', () => {
      updateCashToolFormFromDom();
      state.cashTool.form.existingFundId = '';
      renderCashToolPage();
    });
    root.querySelector('#cash-existing-fund')?.addEventListener('change', () => {
      updateCashToolFormFromDom();
      renderCashToolPage();
    });
    root.querySelector('#cash-manual-type')?.addEventListener('change', () => {
      updateCashToolFormFromDom();
      renderCashToolPage();
    });
    root.querySelector('#cash-manual-risk')?.addEventListener('input', (event) => {
      state.cashTool.form.riskScore = event.target.value;
      const helper = event.target.parentElement?.querySelector('small');
      if (helper) helper.textContent = `${getRiskLabel(event.target.value)} · ${event.target.value}/100`;
    });
  }

  renderAdvancedSearchRows = function() {
    const container = document.getElementById('advanced-search-rows');
    if (!container) return;

    const metrics = getAvailableAdvancedMetrics();
    const usedMetricIds = state.advancedSearch.params.map(param => param.metricId).filter(Boolean);

    container.innerHTML = state.advancedSearch.params.map((param, index) => {
      const metricOptions = metrics.map(metric => {
        const disabled = metric.id !== param.metricId && usedMetricIds.includes(metric.id);
        return `<option value="${metric.id}" ${param.metricId === metric.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${metric.label}</option>`;
      }).join('');

      const rangeFields = param.direction === 'between'
        ? `<div class="advanced-search-field advanced-search-field-range">
            <label>טווח</label>
            <div class="advanced-search-range-fields">
              <input type="number" step="any" placeholder="מינימום" value="${param.minValue ?? ''}" data-adv-input="minValue" />
              <input type="number" step="any" placeholder="מקסימום" value="${param.maxValue ?? ''}" data-adv-input="maxValue" />
            </div>
          </div>`
        : `<div class="advanced-search-field advanced-search-field-range is-empty" aria-hidden="true">
            <label>&nbsp;</label>
            <div class="advanced-search-range-fields-placeholder"></div>
          </div>`;

      return `
        <div class="advanced-search-row" data-adv-row="${param.id}">
          <button type="button" class="advanced-search-drag" data-adv-drag="${param.id}" draggable="true" aria-label="גרור לשינוי סדר הפרמטר">
            <i class="fas fa-grip-vertical" aria-hidden="true"></i>
          </button>
          <div class="advanced-search-field">
            <label for="adv-metric-${param.id}">פרמטר ${index + 1}</label>
            <select id="adv-metric-${param.id}" data-adv-input="metric">
              <option value="">בחר פרמטר</option>
              ${metricOptions}
            </select>
          </div>
          <div class="advanced-search-field">
            <label for="adv-direction-${param.id}">כיוון</label>
            <select id="adv-direction-${param.id}" data-adv-input="direction">
              <option value="high" ${param.direction === 'high' ? 'selected' : ''}>הכי גבוה</option>
              <option value="low" ${param.direction === 'low' ? 'selected' : ''}>הכי נמוך</option>
              <option value="between" ${param.direction === 'between' ? 'selected' : ''}>בין לבין</option>
            </select>
          </div>
          ${rangeFields}
          <button type="button" class="advanced-search-remove" data-adv-remove="${param.id}" aria-label="הסר פרמטר">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    const reorderParams = (dragId, targetId) => {
      if (!dragId || !targetId || dragId === targetId) return;
      const fromIndex = state.advancedSearch.params.findIndex(param => param.id === dragId);
      const toIndex = state.advancedSearch.params.findIndex(param => param.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const next = [...state.advancedSearch.params];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      state.advancedSearch.params = next;
      state.advancedSearch.reorderPulse = Date.now();
      renderAdvancedSearchRows();
    };

    container.querySelectorAll('[data-adv-drag]').forEach(handle => {
      handle.addEventListener('dragstart', (event) => {
        state.advancedSearch.dragParamId = handle.dataset.advDrag;
        handle.classList.add('is-dragging');
        handle.closest('[data-adv-row]')?.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', handle.dataset.advDrag || '');
        }
      });

      handle.addEventListener('dragend', () => {
        state.advancedSearch.dragParamId = null;
        container.querySelectorAll('.advanced-search-row').forEach(row => row.classList.remove('is-dragging', 'is-drag-over'));
        container.querySelectorAll('.advanced-search-drag').forEach(btn => btn.classList.remove('is-dragging'));
      });
    });

    container.querySelectorAll('[data-adv-row]').forEach(row => {
      row.addEventListener('dragover', (event) => {
        if (!state.advancedSearch.dragParamId || state.advancedSearch.dragParamId === row.dataset.advRow) return;
        event.preventDefault();
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', (event) => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-over');
        reorderParams(state.advancedSearch.dragParamId, row.dataset.advRow);
      });
    });

    container.querySelectorAll('[data-adv-input]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-adv-row]');
        const param = state.advancedSearch.params.find(item => item.id === row?.dataset.advRow);
        if (!param) return;
        param.metricId = row.querySelector('[data-adv-input="metric"]')?.value || '';
        param.direction = row.querySelector('[data-adv-input="direction"]')?.value || 'high';
        param.minValue = row.querySelector('[data-adv-input="minValue"]')?.value || '';
        param.maxValue = row.querySelector('[data-adv-input="maxValue"]')?.value || '';
        state.advancedSearch.emptyMessage = '';
        state.advancedSearch.focusParamId = param.id;
        state.advancedSearch.focusTarget = input.dataset.advInput === 'direction' && param.direction === 'between'
          ? 'minValue'
          : null;
        renderAdvancedSearchRows();
      });
    });

    container.querySelectorAll('[data-adv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.advancedSearch.params = state.advancedSearch.params.filter(param => param.id !== btn.dataset.advRemove);
        if (!state.advancedSearch.params.length) state.advancedSearch.params = [createAdvancedSearchParam()];
        state.advancedSearch.emptyMessage = '';
        renderAdvancedSearchRows();
      });
    });

    const addBtn = document.getElementById('advanced-search-add-row');
    if (addBtn) addBtn.hidden = state.advancedSearch.params.length >= 4;

    if (state.advancedSearch.reorderPulse) {
      requestAnimationFrame(() => {
        container.querySelectorAll('.advanced-search-row').forEach(row => {
          row.classList.add('is-reordered');
          setTimeout(() => row.classList.remove('is-reordered'), 260);
        });
        state.advancedSearch.reorderPulse = null;
      });
    }

    const focusParamId = state.advancedSearch.focusParamId;
    const focusTarget = state.advancedSearch.focusTarget;
    if (focusParamId && focusTarget) {
      requestAnimationFrame(() => {
        const row = container.querySelector(`[data-adv-row="${focusParamId}"]`);
        const field = row?.querySelector(`[data-adv-input="${focusTarget}"]`);
        if (!field) return;
        field.focus();
        if (typeof field.select === 'function' && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA')) field.select();
        if (focusTarget === 'metric' && typeof field.showPicker === 'function') {
          try { field.showPicker(); } catch (err) {}
        }
        state.advancedSearch.focusParamId = null;
        state.advancedSearch.focusTarget = null;
      });
    }
  };

  runAdvancedSearch = async function() {
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    if (!selectedParams.length) {
      state.advancedSearch.results = [];
      state.advancedSearch.emptyMessage = 'בחר לפחות פרמטר אחד כדי לקבל תוצאות.';
      state.advancedSearch.needsRefresh = false;
      updateAdvancedSearchRunButton();
      setAdvancedSearchStatus('בחר לפחות פרמטר אחד לחיפוש.');
      renderAdvancedSearchResults();
      return;
    }

    const uniqueMetricIds = new Set(selectedParams.map(param => param.metricId));
    if (uniqueMetricIds.size !== selectedParams.length) {
      setAdvancedSearchStatus('כל פרמטר יכול להיבחר פעם אחת בלבד.');
      return;
    }

    saveAdvancedSearchToHistory(selectedParams);

    const candidates = getAdvancedSearchCandidates();
    if (!candidates.length) {
      state.advancedSearch.results = [];
      state.advancedSearch.emptyMessage = 'לא נמצאו קופות זמינות בקטגוריה הנוכחית.';
      state.advancedSearch.needsRefresh = false;
      updateAdvancedSearchRunButton();
      setAdvancedSearchStatus('לא נמצאו קופות זמינות בקטגוריה ובסינון הנוכחי.');
      renderAdvancedSearchResults();
      return;
    }

    state.advancedSearch.loading = true;
    setAdvancedSearchStatus('מחשב את דירוג ההתאמה...');
    await ensureAdvancedSearchMetricsLoaded();

    const metricStats = new Map();
    selectedParams.forEach(param => {
      const values = candidates
        .map(candidate => getAdvancedMetricRaw(candidate, param.metricId))
        .filter(value => Number.isFinite(value));
      metricStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const passedCandidates = candidates.filter(candidate => {
      return selectedParams.every(param => {
        const raw = getAdvancedMetricRaw(candidate, param.metricId);
        if (!Number.isFinite(raw)) return false;
        if (param.direction !== 'between') return true;

        const hasMin = param.minValue !== '' && Number.isFinite(Number(param.minValue));
        const hasMax = param.maxValue !== '' && Number.isFinite(Number(param.maxValue));
        if (!hasMin && !hasMax) return true;

        const minTarget = hasMin ? Number(param.minValue) : -Infinity;
        const maxTarget = hasMax ? Number(param.maxValue) : Infinity;
        return raw >= Math.min(minTarget, maxTarget) && raw <= Math.max(minTarget, maxTarget);
      });
    });

    if (!passedCandidates.length) {
      state.advancedSearch.loading = false;
      state.advancedSearch.results = [];
      state.advancedSearch.emptyMessage = 'לא נמצאו תוצאות שמתאימות לכל הפרמטרים יחד. נסה לשנות או לעדן את החיפוש.';
      state.advancedSearch.needsRefresh = false;
      updateAdvancedSearchRunButton();
      setAdvancedSearchStatus('לא נמצאו תוצאות מתאימות. נסה לשנות או לעדן את החיפוש.');
      renderAdvancedSearchResults();
      return;
    }

    const ranked = passedCandidates.map(candidate => {
      let scoreSum = 0;
      let totalCount = 0;
      const reasons = [];
      const sortValues = [];

      selectedParams.forEach(param => {
        const raw = getAdvancedMetricRaw(candidate, param.metricId);
        const stats = metricStats.get(param.metricId) || { min: NaN, max: NaN };
        let normalized = 1;

        if (param.direction === 'between') {
          const hasMin = param.minValue !== '' && Number.isFinite(Number(param.minValue));
          const hasMax = param.maxValue !== '' && Number.isFinite(Number(param.maxValue));
          if (hasMin || hasMax) {
            const minTarget = hasMin ? Number(param.minValue) : raw;
            const maxTarget = hasMax ? Number(param.maxValue) : raw;
            const center = (minTarget + maxTarget) / 2;
            const span = Math.max(Math.abs(maxTarget - minTarget) / 2, 0.0001);
            normalized = Math.max(0, 1 - (Math.abs(raw - center) / span));
            if (raw >= Math.min(minTarget, maxTarget) && raw <= Math.max(minTarget, maxTarget)) normalized = 1;
          }
        } else if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max !== stats.min) {
          normalized = (raw - stats.min) / (stats.max - stats.min);
          if (param.direction === 'low') normalized = 1 - normalized;
        }

        sortValues.push(normalized);
        reasons.push({
          text: `<strong>${getAdvancedMetricLabel(param.metricId)}</strong>: <span class="advanced-search-reason-value">${formatAdvancedMetricValue(param.metricId, raw)}</span>`
        });

        scoreSum += normalized;
        totalCount += 1;
      });

      return {
        ...candidate,
        score: totalCount ? (scoreSum / totalCount) * 100 : 0,
        sortValues,
        reasons: reasons.map(reason => reason.text)
      };
    }).sort((a, b) => {
      for (let i = 0; i < selectedParams.length; i += 1) {
        const av = a.sortValues[i] ?? -1;
        const bv = b.sortValues[i] ?? -1;
        if (av !== bv) return bv - av;
      }
      return b.score - a.score;
    }).slice(0, 5);

    state.advancedSearch.loading = false;
    state.advancedSearch.results = ranked;
    state.advancedSearch.emptyMessage = '';
    state.advancedSearch.needsRefresh = false;
    updateAdvancedSearchRunButton();
    setAdvancedSearchStatus('');
    renderAdvancedSearchResults();
  };

  renderAdvancedSearchRows = function() {
    const container = document.getElementById('advanced-search-rows');
    if (!container) return;

    const metrics = getAvailableAdvancedMetrics();
    const usedMetricIds = state.advancedSearch.params.map(param => param.metricId).filter(Boolean);
    const previousRects = new Map(
      [...container.querySelectorAll('[data-adv-row]')].map(row => [row.dataset.advRow, row.getBoundingClientRect()])
    );

    container.innerHTML = state.advancedSearch.params.map((param, index) => {
      const metricOptions = metrics.map(metric => {
        const disabled = metric.id !== param.metricId && usedMetricIds.includes(metric.id);
        return `<option value="${metric.id}" ${param.metricId === metric.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${metric.label}</option>`;
      }).join('');

      const rangeFields = param.direction === 'between'
        ? `<div class="advanced-search-field advanced-search-field-range">
            <label>טווח</label>
            <div class="advanced-search-range-fields">
              <input type="number" step="any" placeholder="מינימום" value="${param.minValue ?? ''}" data-adv-input="minValue" />
              <input type="number" step="any" placeholder="מקסימום" value="${param.maxValue ?? ''}" data-adv-input="maxValue" />
            </div>
          </div>`
        : `<div class="advanced-search-field advanced-search-field-range is-empty" aria-hidden="true">
            <label>&nbsp;</label>
            <div class="advanced-search-range-fields-placeholder"></div>
          </div>`;

      return `
        <div class="advanced-search-row" data-adv-row="${param.id}">
          <div class="advanced-search-field">
            <label for="adv-metric-${param.id}">פרמטר ${index + 1}</label>
            <select id="adv-metric-${param.id}" data-adv-input="metric">
              <option value="">בחר פרמטר</option>
              ${metricOptions}
            </select>
          </div>
          <div class="advanced-search-field">
            <label for="adv-direction-${param.id}">כיוון</label>
            <select id="adv-direction-${param.id}" data-adv-input="direction">
              <option value="high" ${param.direction === 'high' ? 'selected' : ''}>הכי גבוה</option>
              <option value="low" ${param.direction === 'low' ? 'selected' : ''}>הכי נמוך</option>
              <option value="between" ${param.direction === 'between' ? 'selected' : ''}>בין לבין</option>
            </select>
          </div>
          ${rangeFields}
          <button type="button" class="advanced-search-drag" data-adv-drag="${param.id}" draggable="true" aria-label="גרור לשינוי סדר הפרמטר">
            <i class="fas fa-grip-vertical" aria-hidden="true"></i>
          </button>
          <button type="button" class="advanced-search-remove" data-adv-remove="${param.id}" aria-label="הסר פרמטר">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    const reorderParams = (dragId, targetId) => {
      if (!dragId || !targetId || dragId === targetId) return;
      const fromIndex = state.advancedSearch.params.findIndex(param => param.id === dragId);
      const toIndex = state.advancedSearch.params.findIndex(param => param.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const next = [...state.advancedSearch.params];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      state.advancedSearch.params = next;
      state.advancedSearch.needsRefresh = !!state.advancedSearch.hasRun;
      state.advancedSearch.reorderPulse = Date.now();
      updateAdvancedSearchRunButton(!!state.advancedSearch.hasRun);
      renderAdvancedSearchRows();
    };

    container.querySelectorAll('[data-adv-drag]').forEach(handle => {
      handle.addEventListener('dragstart', (event) => {
        state.advancedSearch.dragParamId = handle.dataset.advDrag;
        handle.classList.add('is-dragging');
        const row = handle.closest('[data-adv-row]');
        row?.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', handle.dataset.advDrag || '');
          const transparentPixel = new Image();
          transparentPixel.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
          event.dataTransfer.setDragImage(transparentPixel, 0, 0);
        }
      });

      handle.addEventListener('dragend', () => {
        state.advancedSearch.dragParamId = null;
        container.querySelectorAll('.advanced-search-row').forEach(row => row.classList.remove('is-dragging', 'is-drag-over'));
        container.querySelectorAll('.advanced-search-drag').forEach(btn => btn.classList.remove('is-dragging'));
      });
    });

    container.querySelectorAll('[data-adv-row]').forEach(row => {
      row.addEventListener('dragover', (event) => {
        if (!state.advancedSearch.dragParamId || state.advancedSearch.dragParamId === row.dataset.advRow) return;
        event.preventDefault();
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', (event) => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-over');
        reorderParams(state.advancedSearch.dragParamId, row.dataset.advRow);
      });
    });

    container.querySelectorAll('[data-adv-input]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-adv-row]');
        const param = state.advancedSearch.params.find(item => item.id === row?.dataset.advRow);
        if (!param) return;
        param.metricId = row.querySelector('[data-adv-input="metric"]')?.value || '';
        param.direction = row.querySelector('[data-adv-input="direction"]')?.value || 'high';
        param.minValue = row.querySelector('[data-adv-input="minValue"]')?.value || '';
        param.maxValue = row.querySelector('[data-adv-input="maxValue"]')?.value || '';
        state.advancedSearch.emptyMessage = '';
        state.advancedSearch.needsRefresh = false;
        updateAdvancedSearchRunButton(false);
        state.advancedSearch.focusParamId = param.id;
        state.advancedSearch.focusTarget = input.dataset.advInput === 'direction' && param.direction === 'between'
          ? 'minValue'
          : null;
        renderAdvancedSearchRows();
      });
    });

    container.querySelectorAll('[data-adv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.advancedSearch.params = state.advancedSearch.params.filter(param => param.id !== btn.dataset.advRemove);
        if (!state.advancedSearch.params.length) state.advancedSearch.params = [createAdvancedSearchParam()];
        state.advancedSearch.emptyMessage = '';
        state.advancedSearch.needsRefresh = false;
        updateAdvancedSearchRunButton(false);
        renderAdvancedSearchRows();
      });
    });

    const addBtn = document.getElementById('advanced-search-add-row');
    if (addBtn) {
      const lastParam = state.advancedSearch.params[state.advancedSearch.params.length - 1];
      addBtn.hidden = state.advancedSearch.params.length >= 4;
      addBtn.disabled = !!lastParam && !lastParam.metricId;
    }

    updateAdvancedSearchRunButton();

    requestAnimationFrame(() => {
      container.querySelectorAll('[data-adv-row]').forEach(row => {
        const previousRect = previousRects.get(row.dataset.advRow);
        if (!previousRect) return;
        const nextRect = row.getBoundingClientRect();
        const deltaY = previousRect.top - nextRect.top;
        if (!deltaY) return;
        row.classList.add('is-flipping');
        row.style.transform = `translateY(${deltaY}px)`;
        requestAnimationFrame(() => {
          row.style.transform = '';
          window.setTimeout(() => row.classList.remove('is-flipping'), 320);
        });
      });
    });

    if (state.advancedSearch.reorderPulse) {
      requestAnimationFrame(() => {
        container.querySelectorAll('.advanced-search-row').forEach(row => {
          row.classList.add('is-reordered');
          setTimeout(() => row.classList.remove('is-reordered'), 320);
        });
        state.advancedSearch.reorderPulse = null;
      });
    }

    const focusParamId = state.advancedSearch.focusParamId;
    const focusTarget = state.advancedSearch.focusTarget;
    if (focusParamId && focusTarget) {
      requestAnimationFrame(() => {
        const row = container.querySelector(`[data-adv-row="${focusParamId}"]`);
        const field = row?.querySelector(`[data-adv-input="${focusTarget}"]`);
        if (!field) return;
        field.focus();
        if (typeof field.select === 'function' && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA')) field.select();
        if (focusTarget === 'metric' && typeof field.showPicker === 'function') {
          try { field.showPicker(); } catch (err) {}
        }
        state.advancedSearch.focusParamId = null;
        state.advancedSearch.focusTarget = null;
      });
    }
  };

  function updateAdvancedSearchRunButton(animate = false) {
    const btn = document.getElementById('advanced-search-run');
    if (!btn) return;
    const label = btn.querySelector('span');
    const needsRefresh = !!state.advancedSearch.hasRun && !!state.advancedSearch.needsRefresh;

    btn.classList.toggle('needs-refresh', needsRefresh);
    if (label) label.textContent = needsRefresh ? 'עדכן תוצאות' : 'מצא 5 תוצאות';

    if (animate && needsRefresh) {
      btn.classList.remove('is-bumping');
      void btn.offsetWidth;
      btn.classList.add('is-bumping');
      window.setTimeout(() => btn.classList.remove('is-bumping'), 520);
    }
  }

  resetAdvancedSearchState = function(options = {}) {
    const { keepOpen = false, autoFocus = false } = options;
    const firstParam = createAdvancedSearchParam();
    state.advancedSearch.params = [firstParam];
    state.advancedSearch.results = [];
    state.advancedSearch.loading = false;
    state.advancedSearch.emptyMessage = '';
    state.advancedSearch.hasRun = false;
    state.advancedSearch.needsRefresh = false;
    state.advancedSearch.focusParamId = autoFocus ? firstParam.id : null;
    state.advancedSearch.focusTarget = autoFocus ? 'metric' : null;
    setAdvancedSearchStatus('');
    if (keepOpen) {
      updateAdvancedSearchRunButton(false);
      renderAdvancedSearchRows();
      renderAdvancedSearchResults();
    }
  };

  const baseRunAdvancedSearchFinal = runAdvancedSearch;
  runAdvancedSearch = async function() {
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    if (selectedParams.length) {
      state.advancedSearch.hasRun = true;
    }
    await baseRunAdvancedSearchFinal();
    updateAdvancedSearchRunButton(false);
  };

  renderAdvancedSearchRows = function() {
    const container = document.getElementById('advanced-search-rows');
    if (!container) return;

    const metrics = getAvailableAdvancedMetrics();
    const usedMetricIds = state.advancedSearch.params.map(param => param.metricId).filter(Boolean);
    const previousRects = new Map(
      [...container.querySelectorAll('[data-adv-row]')].map(row => [row.dataset.advRow, row.getBoundingClientRect()])
    );

    container.innerHTML = state.advancedSearch.params.map((param, index) => {
      const metricOptions = metrics.map(metric => {
        const disabled = metric.id !== param.metricId && usedMetricIds.includes(metric.id);
        return `<option value="${metric.id}" ${param.metricId === metric.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${metric.label}</option>`;
      }).join('');

      const rangeFields = param.direction === 'between'
        ? `<div class="advanced-search-field advanced-search-field-range">
            <label>טווח</label>
            <div class="advanced-search-range-fields">
              <input type="number" step="any" placeholder="מינימום" value="${param.minValue ?? ''}" data-adv-input="minValue" />
              <input type="number" step="any" placeholder="מקסימום" value="${param.maxValue ?? ''}" data-adv-input="maxValue" />
            </div>
          </div>`
        : `<div class="advanced-search-field advanced-search-field-range is-empty" aria-hidden="true">
            <label>&nbsp;</label>
            <div class="advanced-search-range-fields-placeholder"></div>
          </div>`;

      return `
        <div class="advanced-search-row" data-adv-row="${param.id}">
          <button type="button" class="advanced-search-drag" data-adv-drag="${param.id}" draggable="true" aria-label="גרור לשינוי סדר הפרמטר">
            <i class="fas fa-grip-vertical" aria-hidden="true"></i>
          </button>
          <div class="advanced-search-field">
            <label for="adv-metric-${param.id}">פרמטר ${index + 1}</label>
            <select id="adv-metric-${param.id}" data-adv-input="metric">
              <option value="">בחר פרמטר</option>
              ${metricOptions}
            </select>
          </div>
          <div class="advanced-search-field">
            <label for="adv-direction-${param.id}">כיוון</label>
            <select id="adv-direction-${param.id}" data-adv-input="direction">
              <option value="high" ${param.direction === 'high' ? 'selected' : ''}>הכי גבוה</option>
              <option value="low" ${param.direction === 'low' ? 'selected' : ''}>הכי נמוך</option>
              <option value="between" ${param.direction === 'between' ? 'selected' : ''}>בין לבין</option>
            </select>
          </div>
          ${rangeFields}
          <button type="button" class="advanced-search-remove" data-adv-remove="${param.id}" aria-label="הסר פרמטר">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    const reorderParams = (dragId, targetId) => {
      if (!dragId || !targetId || dragId === targetId) return;
      const fromIndex = state.advancedSearch.params.findIndex(param => param.id === dragId);
      const toIndex = state.advancedSearch.params.findIndex(param => param.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const next = [...state.advancedSearch.params];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      state.advancedSearch.params = next;
      state.advancedSearch.needsRefresh = !!state.advancedSearch.hasRun;
      state.advancedSearch.reorderPulse = Date.now();
      updateAdvancedSearchRunButton(!!state.advancedSearch.hasRun);
      renderAdvancedSearchRows();
    };

    container.querySelectorAll('[data-adv-drag]').forEach(handle => {
      handle.addEventListener('dragstart', (event) => {
        state.advancedSearch.dragParamId = handle.dataset.advDrag;
        handle.classList.add('is-dragging');
        const row = handle.closest('[data-adv-row]');
        row?.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', handle.dataset.advDrag || '');
          if (row) {
            const ghost = row.cloneNode(true);
            ghost.classList.add('advanced-search-drag-ghost');
            ghost.style.position = 'fixed';
            ghost.style.top = '-9999px';
            ghost.style.left = '-9999px';
            ghost.style.width = `${row.offsetWidth}px`;
            document.body.appendChild(ghost);
            event.dataTransfer.setDragImage(ghost, Math.min(row.offsetWidth / 2, 180), Math.min(row.offsetHeight / 2, 32));
            window.setTimeout(() => ghost.remove(), 0);
          }
        }
      });

      handle.addEventListener('dragend', () => {
        state.advancedSearch.dragParamId = null;
        container.querySelectorAll('.advanced-search-row').forEach(row => row.classList.remove('is-dragging', 'is-drag-over'));
        container.querySelectorAll('.advanced-search-drag').forEach(btn => btn.classList.remove('is-dragging'));
      });
    });

    container.querySelectorAll('[data-adv-row]').forEach(row => {
      row.addEventListener('dragover', (event) => {
        if (!state.advancedSearch.dragParamId || state.advancedSearch.dragParamId === row.dataset.advRow) return;
        event.preventDefault();
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', (event) => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-over');
        reorderParams(state.advancedSearch.dragParamId, row.dataset.advRow);
      });
    });

    container.querySelectorAll('[data-adv-input]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-adv-row]');
        const param = state.advancedSearch.params.find(item => item.id === row?.dataset.advRow);
        if (!param) return;
        param.metricId = row.querySelector('[data-adv-input="metric"]')?.value || '';
        param.direction = row.querySelector('[data-adv-input="direction"]')?.value || 'high';
        param.minValue = row.querySelector('[data-adv-input="minValue"]')?.value || '';
        param.maxValue = row.querySelector('[data-adv-input="maxValue"]')?.value || '';
        state.advancedSearch.emptyMessage = '';
        state.advancedSearch.focusParamId = param.id;
        state.advancedSearch.focusTarget = input.dataset.advInput === 'direction' && param.direction === 'between'
          ? 'minValue'
          : null;
        updateAdvancedSearchRunButton(false);
        renderAdvancedSearchRows();
      });
    });

    container.querySelectorAll('[data-adv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.advancedSearch.params = state.advancedSearch.params.filter(param => param.id !== btn.dataset.advRemove);
        if (!state.advancedSearch.params.length) state.advancedSearch.params = [createAdvancedSearchParam()];
        state.advancedSearch.emptyMessage = '';
        updateAdvancedSearchRunButton(false);
        renderAdvancedSearchRows();
      });
    });

    const addBtn = document.getElementById('advanced-search-add-row');
    if (addBtn) addBtn.hidden = state.advancedSearch.params.length >= 4;

    updateAdvancedSearchRunButton(false);

    requestAnimationFrame(() => {
      container.querySelectorAll('[data-adv-row]').forEach(row => {
        const previousRect = previousRects.get(row.dataset.advRow);
        if (!previousRect) return;
        const nextRect = row.getBoundingClientRect();
        const deltaY = previousRect.top - nextRect.top;
        if (!deltaY) return;
        row.classList.add('is-flipping');
        row.style.transform = `translateY(${deltaY}px)`;
        requestAnimationFrame(() => {
          row.style.transform = '';
          window.setTimeout(() => row.classList.remove('is-flipping'), 320);
        });
      });
    });

    if (state.advancedSearch.reorderPulse) {
      requestAnimationFrame(() => {
        container.querySelectorAll('.advanced-search-row').forEach(row => {
          row.classList.add('is-reordered');
          setTimeout(() => row.classList.remove('is-reordered'), 320);
        });
        state.advancedSearch.reorderPulse = null;
      });
    }

    const focusParamId = state.advancedSearch.focusParamId;
    const focusTarget = state.advancedSearch.focusTarget;
    if (focusParamId && focusTarget) {
      requestAnimationFrame(() => {
        const row = container.querySelector(`[data-adv-row="${focusParamId}"]`);
        const field = row?.querySelector(`[data-adv-input="${focusTarget}"]`);
        if (!field) return;
        field.focus();
        if (typeof field.select === 'function' && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA')) field.select();
        if (focusTarget === 'metric' && typeof field.showPicker === 'function') {
          try { field.showPicker(); } catch (err) {}
        }
        state.advancedSearch.focusParamId = null;
        state.advancedSearch.focusTarget = null;
      });
    }
  };

  renderAdvancedSearchResults = function() {
    const container = document.getElementById('advanced-search-results');
    if (!container) return;
    const selectedParams = state.advancedSearch.params.filter(param => param.metricId);
    const emptyMessage = state.advancedSearch.emptyMessage || 'בחר פרמטר אחד או יותר ולחץ על "מצא 5 תוצאות" כדי לקבל השוואה רוחבית.';

    if (!state.advancedSearch.results.length) {
      container.innerHTML = `<div class="advanced-search-empty">${emptyMessage}</div>`;
      return;
    }

    const colStats = new Map();
    selectedParams.forEach(param => {
      const values = state.advancedSearch.results
        .map(item => getAdvancedMetricRaw(item, param.metricId))
        .filter(value => Number.isFinite(value));
      colStats.set(param.metricId, {
        min: values.length ? Math.min(...values) : NaN,
        max: values.length ? Math.max(...values) : NaN
      });
    });

    const getCellTone = (metricId, raw, direction) => {
      if (!Number.isFinite(raw)) return 'is-missing';
      const stats = colStats.get(metricId) || { min: NaN, max: NaN };
      if (!Number.isFinite(stats.min) || !Number.isFinite(stats.max) || stats.min === stats.max) return 'is-best';
      let normalized = (raw - stats.min) / (stats.max - stats.min);
      if (direction === 'low') normalized = 1 - normalized;
      if (normalized >= 0.82) return 'is-best';
      if (normalized >= 0.58) return 'is-good';
      if (normalized >= 0.34) return 'is-mid';
      return 'is-low';
    };

    const formatHeaderLabel = label => {
      const words = String(label || '').trim().split(/\s+/).filter(Boolean);
      if (words.length <= 2) return label;
      return `${words.slice(0, 2).join(' ')}<br><span>${words.slice(2).join(' ')}</span>`;
    };
    const headerCols = selectedParams.map(param => `
      <th class="advanced-search-compare-value-head">${formatHeaderLabel(getAdvancedMetricLabel(param.metricId))}</th>
    `).join('');
    const bodyRows = state.advancedSearch.results.map((item, index) => {
      const metricCols = selectedParams.map(param => {
        const raw = getAdvancedMetricRaw(item, param.metricId);
        const tone = getCellTone(param.metricId, raw, param.direction);
        return `<td class="advanced-search-compare-value ${tone}">
          <strong>${Number.isFinite(raw) ? formatAdvancedMetricValue(param.metricId, raw) : 'אין נתון'}</strong>
        </td>`;
      }).join('');

      return `
        <tr class="advanced-search-compare-row" data-fundid="${item.fundId}">
          <td class="advanced-search-compare-rank">
            <span class="advanced-search-rank">${index + 1}</span>
          </td>
          <td class="advanced-search-compare-select">
            <input type="checkbox" class="advanced-search-select-fund" data-adv-compare-fund="${item.fundId}" aria-label="בחר את ${item.providerName} להשוואה">
          </td>
          <td class="advanced-search-compare-company">
            <div>
              <strong>${item.providerName} <span class="adv-fund-id">#${item.fundId}</span></strong>
              <small class="adv-track-label"><span class="advanced-search-track-name">${item.trackLabel}</span></small>
            </div>
          </td>
          ${metricCols}
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="advanced-search-compare-actions">
        <label class="advanced-search-select-all">
          <input type="checkbox" id="advanced-search-select-all-results">
          <span>בחר הכל</span>
        </label>
        <button type="button" class="advanced-search-h2h-btn" id="advanced-search-h2h-btn" disabled>
          <i class="fas fa-balance-scale" aria-hidden="true"></i>
          בצע השוואה
        </button>
        <button type="button" class="advanced-search-sandbox-btn" id="advanced-search-sandbox-btn" disabled>
          <i class="fas fa-flask" aria-hidden="true"></i>
          הוסף למעבדה שלי
        </button>
        <div class="advanced-search-selection-status" id="advanced-search-selection-status" hidden></div>
      </div>
      <div class="advanced-search-compare-wrap">
        <table class="advanced-search-compare-table">
          <colgroup>
            <col class="advanced-search-rank-col">
            <col class="advanced-search-select-col">
            <col class="advanced-search-company-col">
            ${selectedParams.map(() => '<col class="advanced-search-value-col">').join('')}
          </colgroup>
          <thead>
            <tr>
              <th class="advanced-search-compare-rank">#</th>
              <th class="advanced-search-compare-select">בחר</th>
              <th>קופה</th>
              ${headerCols}
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;

    const compareBtn = container.querySelector('#advanced-search-h2h-btn');
    const sandboxBtn = container.querySelector('#advanced-search-sandbox-btn');
    const selectAll = container.querySelector('#advanced-search-select-all-results');
    const checkboxes = [...container.querySelectorAll('[data-adv-compare-fund]')];
    const syncSelectionUi = () => {
      const selectedCount = checkboxes.filter(cb => cb.checked).length;
      if (compareBtn) {
        compareBtn.disabled = selectedCount < 2;
        compareBtn.innerHTML = `<i class="fas fa-balance-scale" aria-hidden="true"></i> בצע השוואה${selectedCount ? ` (${selectedCount})` : ''}`;
      }
      if (sandboxBtn) {
        sandboxBtn.disabled = selectedCount < 1;
        sandboxBtn.innerHTML = `<i class="fas fa-flask" aria-hidden="true"></i> הוסף למעבדה שלי${selectedCount ? ` (${selectedCount})` : ''}`;
      }
      if (selectAll) {
        selectAll.checked = selectedCount === checkboxes.length;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
      }
    };

    checkboxes.forEach(cb => {
      cb.addEventListener('click', event => event.stopPropagation());
      cb.addEventListener('change', syncSelectionUi);
    });

    selectAll?.addEventListener('click', event => event.stopPropagation());
    selectAll?.addEventListener('change', () => {
      checkboxes.forEach(cb => { cb.checked = selectAll.checked; });
      syncSelectionUi();
    });

    compareBtn?.addEventListener('click', event => {
      event.stopPropagation();
      const selectedFundIds = checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.advCompareFund);
      compareAdvancedSearchSelection(selectedFundIds).catch(error => {
        console.error('Advanced search H2H compare failed', error);
        setAdvancedSearchStatus('לא הצלחתי לפתוח את ההשוואה. נסה שוב בעוד רגע.');
      });
    });
    sandboxBtn?.addEventListener('click', event => {
      event.stopPropagation();
      const selectedFundIds = checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.advCompareFund);
      addAdvancedSearchSelectionToSandbox(selectedFundIds);
      syncSelectionUi();
    });
    syncSelectionUi();

    container.querySelectorAll('.advanced-search-compare-row').forEach(row => {
      row.addEventListener('click', event => {
        if (event.target.closest('input, button, label')) return;
        const fundId = row.dataset.fundid;
        if (!fundId || !state.activeCategoryId) return;
        window.location.href = `fund.html?id=${fundId}&cat=${state.activeCategoryId}`;
      });
    });
  };

  window.startRotatingCtaPopup = startRotatingCtaPopup;
  window.stopRotatingCtaPopup = stopRotatingCtaPopup;

  const RECENT_VIEWED_FUNDS_KEY = 'gemelhub_recent_viewed_funds_v1';
  const RECENT_VIEWED_FUNDS_TIP_KEY = 'gemelhub_recent_viewed_funds_tip_seen_v1';
  const RECENT_VIEWED_FUNDS_LIMIT = 8;

  function getRecentViewedFunds() {
    try {
      const raw = localStorage.getItem(RECENT_VIEWED_FUNDS_KEY);
      const items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items.filter(item => item && item.fundId).slice(0, RECENT_VIEWED_FUNDS_LIMIT) : [];
    } catch (error) {
      return [];
    }
  }

  function saveRecentViewedFunds(items) {
    try {
      localStorage.setItem(RECENT_VIEWED_FUNDS_KEY, JSON.stringify(items.slice(0, RECENT_VIEWED_FUNDS_LIMIT)));
    } catch (error) {}
  }

  function addRecentViewedFund(item) {
    if (!item?.fundId) return;
    const nextItem = {
      fundId: String(item.fundId || ''),
      catId: String(item.catId || item.categoryId || ''),
      providerName: String(item.providerName || item.provider || ''),
      trackId: String(item.trackId || ''),
      trackLabel: String(item.trackLabel || ''),
      categoryLabel: String(item.categoryLabel || ''),
      y12m: item.y12m === null || item.y12m === undefined ? '' : String(item.y12m),
      rank: item.rank === null || item.rank === undefined ? '' : String(item.rank),
      total: item.total === null || item.total === undefined ? '' : String(item.total),
      viewedAt: Date.now()
    };
    const uniqueKey = `${nextItem.catId}::${nextItem.fundId}`;
    const items = getRecentViewedFunds().filter(existing => `${existing.catId || ''}::${existing.fundId}` !== uniqueKey);
    saveRecentViewedFunds([nextItem, ...items]);
    renderMobileRecentFunds();
  }

  function formatRecentFundReturn(value) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? formatPercent(num) : '-';
  }

  function renderMobileRecentFunds() {
    const list = document.getElementById('mobile-recent-funds-list');
    if (!list) return;
    const items = getRecentViewedFunds();
    const drawer = document.getElementById('mobile-recent-funds-drawer');
    if (drawer) {
      const visibleRows = Math.max(1, Math.min(items.length || 1, RECENT_VIEWED_FUNDS_LIMIT));
      drawer.style.setProperty('--recent-panel-h', `${34 + (visibleRows * 66)}px`);
    }
    const clearBtn = document.getElementById('mobile-recent-funds-clear');
    if (clearBtn) clearBtn.disabled = !items.length;
    if (!items.length) {
      list.innerHTML = '<div class="mobile-recent-funds-empty">קופות שצפית בהן יופיעו כאן</div>';
      return;
    }
    list.innerHTML = items.map(item => {
      const y12 = parseFloat(item.y12m);
      const tone = Number.isFinite(y12) ? (y12 >= 0 ? 'is-positive' : 'is-negative') : '';
      const title = [item.providerName, item.trackLabel].filter(Boolean).join(' · ') || `קופה #${item.fundId}`;
      const category = item.categoryLabel || item.trackLabel || '';
      const rank = item.rank ? `מקום ${escapeHtml(item.rank)}${item.total ? ` מתוך ${escapeHtml(item.total)}` : ''}` : 'דירוג לא זמין';
      return `
        <article class="mobile-recent-fund-item" data-fundid="${escapeHtml(item.fundId)}" data-catid="${escapeHtml(item.catId || '')}" data-trackid="${escapeHtml(item.trackId || '')}" role="listitem">
          <button type="button" class="mobile-recent-fund-main" data-recent-fund-open>
            <span class="mobile-recent-fund-name">${escapeHtml(title)}</span>
            <span class="mobile-recent-fund-category" data-recent-track-open>${escapeHtml(category)}</span>
          </button>
          <button type="button" class="mobile-recent-fund-metrics" data-recent-fund-open aria-label="פתח את דף הקופה">
            <span class="mobile-recent-fund-return-label">תשואה 12 חודשים</span>
            <span class="mobile-recent-fund-return ${tone}">${escapeHtml(formatRecentFundReturn(item.y12m))}</span>
            <span class="mobile-recent-fund-rank">${rank}</span>
          </button>
        </article>
      `;
    }).join('');
    list.querySelectorAll('.mobile-recent-fund-item').forEach(button => {
      const openFund = () => {
        const fundId = button.dataset.fundid;
        const catId = button.dataset.catid || '';
        if (!fundId) return;
        const current = getRecentViewedFunds().find(item => String(item.fundId) === String(fundId) && String(item.catId || '') === String(catId));
        if (current) addRecentViewedFund(current);
        window.location.href = `fund.html?id=${encodeURIComponent(fundId)}&cat=${encodeURIComponent(catId)}`;
      };
      button.querySelectorAll('[data-recent-fund-open]').forEach(el => {
        el.addEventListener('click', openFund);
      });
      button.querySelector('[data-recent-track-open]')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const catId = button.dataset.catid || '';
        const trackId = button.dataset.trackid || '';
        if (!catId) return;
        window.location.href = `index.html?cat=${encodeURIComponent(catId)}${trackId ? `&focusTrack=${encodeURIComponent(trackId)}` : ''}`;
      });
    });
  }

  function setupMobileRecentFundsDrawer() {
    const drawer = document.getElementById('mobile-recent-funds-drawer');
    const handle = document.getElementById('mobile-recent-funds-handle');
    if (!drawer || !handle) return;

    const setOpen = open => {
      drawer.classList.toggle('is-open', open);
      handle.setAttribute('aria-expanded', open ? 'true' : 'false');
      handle.setAttribute('aria-label', open ? 'סגור קופות שנצפו לאחרונה' : 'פתח קופות שנצפו לאחרונה');
    };

    document.getElementById('mobile-recent-funds-clear')?.addEventListener('click', event => {
      event.stopPropagation();
      saveRecentViewedFunds([]);
      renderMobileRecentFunds();
    });

    let startY = 0;
    let dragDelta = 0;
    let dragged = false;

    const beginDrag = y => {
      startY = y;
      dragDelta = 0;
      dragged = false;
    };

    const moveDrag = y => {
      if (!startY) return;
      dragDelta = y - startY;
      if (Math.abs(dragDelta) > 10) dragged = true;
    };

    const endDrag = () => {
      if (dragged) {
        setOpen(dragDelta < 0);
        setTimeout(() => { dragged = false; }, 0);
      }
      startY = 0;
      dragDelta = 0;
    };

    handle.addEventListener('pointerdown', event => {
      beginDrag(event.clientY);
      handle.setPointerCapture?.(event.pointerId);
    });

    handle.addEventListener('pointermove', event => {
      moveDrag(event.clientY);
    });

    handle.addEventListener('pointerup', event => {
      handle.releasePointerCapture?.(event.pointerId);
      endDrag();
    });

    handle.addEventListener('touchstart', event => {
      beginDrag(event.touches?.[0]?.clientY || 0);
    }, { passive: true });

    handle.addEventListener('touchmove', event => {
      moveDrag(event.touches?.[0]?.clientY || 0);
    }, { passive: true });

    handle.addEventListener('touchend', endDrag);

    handle.addEventListener('mousedown', event => {
      beginDrag(event.clientY);
    });

    document.addEventListener('mousemove', event => {
      moveDrag(event.clientY);
    });

    document.addEventListener('mouseup', endDrag);

    handle.addEventListener('click', () => {
      if (dragged) return;
      setOpen(!drawer.classList.contains('is-open'));
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setOpen(false);
    });

    renderMobileRecentFunds();
    showMobileRecentFundsTipOnce(drawer);
  }

  function showMobileRecentFundsTipOnce(drawer) {
    try {
      if (!drawer || localStorage.getItem(RECENT_VIEWED_FUNDS_TIP_KEY) === '1') return;
      localStorage.setItem(RECENT_VIEWED_FUNDS_TIP_KEY, '1');
      const tip = document.createElement('div');
      tip.className = 'mobile-recent-funds-tip';
      tip.innerHTML = '<i class="far fa-clock" aria-hidden="true"></i><span>היסטוריית חיפושים</span>';
      drawer.appendChild(tip);
      requestAnimationFrame(() => tip.classList.add('is-visible'));
      setTimeout(() => {
        tip.classList.remove('is-visible');
        setTimeout(() => tip.remove(), 220);
      }, 3000);
    } catch (error) {}
  }

  function setupMobileFundSearch() {
    const panel   = document.getElementById('mob-fund-search-panel');
    const input   = document.getElementById('mob-fund-search-input');
    const results = document.getElementById('mob-fund-search-results');
    const closeBtn= document.getElementById('mob-fund-search-close');
    const backdrop= document.getElementById('mob-fund-search-backdrop');
    if (!panel || !input) return;

    function highlight(text, q) {
      if (!q || !text) return String(text || '');
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
      return String(text).replace(re, '<mark style="background:#fef08a;border-radius:2px;">$1</mark>');
    }

    function doMobileSearch(q) {
      if (!q || q.length < 1) { results.innerHTML = ''; return; }
      const ql = q.toLowerCase();
      const recs = state.searchableRecords || [];
      if (!recs.length) { results.innerHTML = '<div class="mob-search-no-results">הנתונים טוענים, נסה שוב עוד רגע</div>'; return; }

      const seen = new Set();
      const hits = [];
      recs.forEach(r => {
        const name  = getProviderDisplayName(r.CONTROLLING_CORPORATION, r.MANAGING_CORPORATION);
        const id    = String(r.FUND_ID || '');
        const sub   = r.SUB_SPECIALIZATION || '';
        const cls   = r.FUND_CLASSIFICATION || '';
        const fname = r.FUND_NAME || '';
        if (name.toLowerCase().includes(ql) || id.includes(ql) ||
            sub.toLowerCase().includes(ql) || fname.toLowerCase().includes(ql)) {
          const key = `${id}`;
          if (!seen.has(key) && hits.length < 15) {
            seen.add(key);
            const catId = getCatIdByClassification(cls);
            if (catId) hits.push({ name, sub, cls, fundId: id, catId });
          }
        }
      });

      if (!hits.length) {
        results.innerHTML = '<div class="mob-search-no-results">לא נמצאו תוצאות</div>';
        return;
      }

      results.innerHTML = hits.map(h => `
        <div class="mob-search-item" data-fundid="${h.fundId}" data-catid="${h.catId}">
          <div class="mob-search-item-name">${highlight(h.name, q)}</div>
          <div class="mob-search-item-sub">${highlight(h.sub || h.cls, q)} · <span class="mob-search-id">#${highlight(h.fundId, q)}</span></div>
        </div>
      `).join('');

      results.querySelectorAll('.mob-search-item').forEach(item => {
        item.addEventListener('click', () => {
          const fundId = item.dataset.fundid;
          const catId  = item.dataset.catid;
          closePanel();
          if (fundId && catId) {
            const hit = hits.find(h => String(h.fundId) === String(fundId) && String(h.catId) === String(catId));
            if (hit) {
              addRecentViewedFund({
                fundId,
                catId,
                providerName: hit.name,
                trackLabel: hit.sub || '',
                categoryLabel: _sbGetCategoryLabel(catId)
              });
            }
            window.location.href = `fund.html?id=${encodeURIComponent(fundId)}&cat=${encodeURIComponent(catId)}`;
          }
        });
      });
    }

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => doMobileSearch(input.value.trim()), 180);
    });

    function closePanel() {
      panel.hidden = true;
      input.value = '';
      results.innerHTML = '';
    }

    closeBtn.addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) closePanel(); });

    window.openMobileFundSearch = function() {
      panel.hidden = false;
      input.value = '';
      results.innerHTML = '';
      input.focus();
    };
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  if (!location.hash || sessionStorage.getItem('gemelhubScrollTop') === '1') {
    sessionStorage.removeItem('gemelhubScrollTop');
    window.scrollTo(0, 0);
  }
  App.init();
  // Hero is no longer sticky, so sticky offsets should start at the viewport top.
  function updateHeroH() {
    document.documentElement.style.setProperty('--hero-h', '0px');
  }
  updateHeroH();
  window.addEventListener('resize', updateHeroH);
  window.addEventListener('pageshow', () => {
    if (!location.hash) {
      window.scrollTo(0, 0);
    }
  });
});
