// ==========================================
// CONFIGURATION FILE - GemulHub
// ==========================================

const CONFIG = {
  API: {
    BASE_URL: 'https://data.gov.il/api/3/action/datastore_search',
    GEMEL_RESOURCE_ID: 'a30dcbea-a1d2-482c-ae29-8f781f5025fb',
    GEMEL_2023_RESOURCE_ID: '2016d770-f094-4a2e-983e-797c26479720',
    GEMEL_1999_2022_RESOURCE_ID: '91c849ed-ddc4-472b-bd09-0f5486cea35c',
    PENSION_RESOURCE_ID: '6d47d6b5-cb08-488b-b333-f1e717b1e1bd',
    PENSION_2023_RESOURCE_ID: '4694d5a7-5284-4f3d-a2cb-5887f43fb55e',
    PENSION_1999_2022_RESOURCE_ID: 'a66926f3-e396-4984-a4db-75486751c2f7',
    POLISA_RESOURCE_ID: 'c6c62cc7-fe02-4b18-8f3e-813abfbb4647',
    POLISA_2023_RESOURCE_ID: '672090ba-7893-4496-a07c-dc7e822cbf18',
    POLISA_1999_2022_RESOURCE_ID: '584e6b69-174f-46c9-b8db-03925b4c68c6',
    LIMIT: 32000,
    LEADS_ENDPOINT: 'https://formspree.io/f/xdapqnyr'
  },

  FEATURES: {
    CUSTOM_RANGE: {
      enabled: true,
      accessLabel: 'פרימיום',
      futureGate: 'premium_or_registered'
    }
  },

  // יצרנים מורשים להצגה
  ALLOWED_PROVIDERS: [
    'הראל', 'מיטב', 'מגדל', 'כלל', 'מנורה', 'הפניקס',
    'מור', 'אינפיניטי', 'ילין לפידות', 'אלטשולר שחם',
    'אנליסט', 'איילון', 'אי.די.אי', 'הכשרה', 'פסגות',
    'ישיר - איי.די.איי',
    'הכשרה - ילין לפידות', 'הכשרה - אלטשולר שחם',
    'הכשרה - אנליסט', 'הכשרה - מור', 'הכשרה - מיטב'
  ],

  // מיפוי שם חברה לשם תצוגה קצר
  PROVIDER_DISPLAY_NAMES: {
    'הראל השקעות בביטוח ושירותים פיננסיים בע"מ': 'הראל',
    'הראל פנסיה וגמל בע"מ':                       'הראל',
    'מיטב דש השקעות בע"מ':                        'מיטב',
    'מיטב גמל ופנסיה בע"מ':                       'מיטב',
    'מגדל אחזקות ביטוח ופיננסים בע"מ':           'מגדל',
    'מגדל מקפת קרנות פנסיה וקופות גמל בע"מ':     'מגדל',
    'כלל ביטוח ופיננסים בע"מ':                    'כלל',
    'כלל פנסיה וגמל בע"מ':                        'כלל',
    'מנורה מבטחים ביטוח בע"מ':                    'מנורה',
    'מנורה מבטחים פנסיה וגמל בע"מ':              'מנורה',
    'הפניקס אחזקות בע"מ':                         'הפניקס',
    'הפניקס פנסיה, גמל וקרנות השתלמות בע"מ':     'הפניקס',
    'מור השקעות בניהול קרנות פנסיה בע"מ':         'מור',
    'אינפיניטי אי.אם.אס בע"מ':                    'אינפיניטי',
    'ילין לפידות ניהול קרנות בע"מ':               'ילין לפידות',
    'אלטשולר שחם גמל ופנסיה בע"מ':               'אלטשולר שחם',
    'אלטשולר שחם':                                 'אלטשולר שחם',
    'אנליסט אי.אם.אס בע"מ':                       'אנליסט',
    'איילון אחזקות בע"מ':                                    'איילון',
    'איילון חברה לביטוח בע"מ':                             'איילון',
    'אי.די.אי ביטוח בע"מ':                                 'אי.די.אי',
    'הכשרה ביטוח בע"מ':                                    'הכשרה',
    'פסגות השקעות בע"מ':                                   'פסגות',
    // פוליסות חיסכון
    'ישיר -איי. די. איי. חברה לביטוח בע"מ':               'ישיר - איי.די.איי',
    'הכשרה חברה לביטוח בע"מ':                             'הכשרה',
    'מנורה מבטחים ביטוח בע"מ':                            'מנורה',
    'הפניקס חברה לביטוח בע"מ':                            'הפניקס',
    'מגדל חברה לביטוח בע"מ':                              'מגדל',
    'הראל חברה לביטוח בע"מ':                              'הראל',
    'כלל חברה לביטוח בע"מ':                               'כלל',
    'הכשרה - ילין לפידות':                                'הכשרה - ילין לפידות',
    'הכשרה - אלטשולר שחם':                               'הכשרה - אלטשולר שחם',
    'הכשרה - אנליסט':                                     'הכשרה - אנליסט',
    'הכשרה - מור':                                        'הכשרה - מור',
    'הכשרה - מיטב':                                       'הכשרה - מיטב'
  },

  // ══════════════════════════════════════════════════
  // קטגוריות מוצרים
  // ══════════════════════════════════════════════════
  PRODUCT_CATEGORIES: [
    {
      id: 'gemel_tagmulim',
      label: 'קופות גמל',
      subLabel: 'תגמולים ואישית לפיצויים',
      apiClassifications: ['תגמולים ואישית לפיצויים'],
      icon: '💼',
      color: '#0f172a',
      // מסלול כללי מוסתר ברירת מחדל — מופיע אחרון בסרגל
      hiddenDefaultTracks: ['kaklali'],
      topOrderTracks: [],
      // רק מסלולים רלוונטיים (מסלולי גיל + השקעה, ללא ילד)
      trackList: ['ad_gil_50','gil_50_60','gil_60_plus','maniот','sp500','halachti',
                  'ashrai_agach','ashrai_agach_maniот','okev_mimdim','ksafi_shekel','okev_maniот',
                  'meshulab_sahar','maniот_sahar','agach_mimshalot','agach_sahar',
                  'okev_agach','kaklali']
    },
    {
      id: 'gemel_hashkaa',
      label: 'גמל להשקעה',
      subLabel: 'קופות גמל להשקעה',
      apiClassifications: ['קופת גמל להשקעה'],
      icon: '📈',
      color: '#10b981',
      hiddenDefaultTracks: [],
      // בגמל להשקעה: כללי מופיע ראשון, מניות שני
      topOrderTracks: ['kaklali', 'maniот'],
      // הגבל רק למסלולים הרלוונטיים (ללא מסלולי ילד/הלכה/סיכון)
      trackList: ['kaklali','maniот','sp500','halachti','ashrai_agach','ashrai_agach_maniот','okev_mimdim',
                  'ksafi_shekel','okev_maniот','meshulab_sahar','maniот_sahar',
                  'agach_mimshalot','agach_sahar','okev_agach']
    },
    {
      id: 'hashtalamot',
      label: 'קרנות השתלמות',
      subLabel: 'קרנות השתלמות',
      apiClassifications: ['קרנות השתלמות'],
      icon: '🎓',
      color: '#9333ea',
      hiddenDefaultTracks: [],
      // בהשתלמות: כללי ראשון, מניות שני
      topOrderTracks: ['kaklali', 'maniот'],
      excludedFundIds: ['1290'],
      trackList: ['kaklali','maniот','sp500','halachti','ashrai_agach','ashrai_agach_maniот','okev_mimdim',
                  'ksafi_shekel','okev_maniот','meshulab_sahar','maniот_sahar',
                  'agach_mimshalot','agach_sahar','okev_agach']
    },
    {
      id: 'hisachon_yeled',
      label: 'חיסכון לכל ילד',
      subLabel: 'חיסכון לכל ילד',
      apiClassifications: ['קופת גמל להשקעה - חסכון לילד'],
      icon: '👶',
      color: '#f59e0b',
      hiddenDefaultTracks: [],
      topOrderTracks: [],
      // מסלולים ייחודיים לחיסכון לכל ילד בלבד — task 8: הוספת yeled_low
      trackList: ['yeled_stocks', 'yeled_general', 'yeled_low', 'yeled_halacha', 'yeled_islam']
    },
    {
      id: 'polisa_chisachon',
      label: 'פוליסות חיסכון',
      subLabel: 'פוליסות שהונפקו החל משנת 2004',
      apiClassifications: ['פוליסות שהונפקו החל משנת 2004'],
      icon: '📋',
      color: '#7c3aed',
      hiddenDefaultTracks: [],
      topOrderTracks: [],
      polisaAPI: true,
      trackList: [
        'polisa_kaklali','polisa_maniот','polisa_ashrai_maniот',
        'polisa_sp500','polisa_okev_maniот','polisa_okev_gmish',
        'polisa_okev_agach','polisa_okev_agach_maniот',
        'polisa_maniот_sahar','polisa_meshulab_sahar','polisa_agach_sahar',
        'polisa_agach_mimshalot','polisa_ashrai_agach','polisa_halacha','polisa_ksafi'
      ]
    },
    {
      id: 'pension_mekafit',
      label: 'פנסיה מקיפה',
      subLabel: 'קרנות פנסיה מקיפה',
      apiClassifications: ['קרנות חדשות'],
      icon: '🏦',
      color: '#dc2626',
      hiddenDefaultTracks: [],
      topOrderTracks: [],
      pensionAPI: true,
      trackList: [
        'pension_gil_50','pension_gil_50_60','pension_gil_60_plus',
        'pension_maniот','pension_sp500','pension_maniот_sahar',
        'pension_meshulab_sahar','pension_agach_sahar',
        'pension_okev_maniот','pension_okev_mimdim','pension_okev_agach',
        'pension_halachti','pension_ashrai','pension_kayemet',
        'pension_kaklali','pension_ksafi',
        'pension_kabala_basic','pension_kabala_halacha','pension_kabala_kayam'
      ]
    },
    {
      id: 'pension_mashlima',
      label: 'פנסיה כללית',
      subLabel: 'קרנות פנסיה כללית ומשלימה',
      apiClassifications: ['קרנות כלליות'],
      icon: '🏧',
      color: '#0891b2',
      hiddenDefaultTracks: [],
      topOrderTracks: [],
      pensionAPI: true,
      trackList: [
        'pension_gil_50','pension_gil_50_60','pension_gil_60_plus',
        'pension_maniот','pension_sp500','pension_maniот_sahar',
        'pension_meshulab_sahar','pension_agach_sahar',
        'pension_okev_maniот','pension_okev_mimdim','pension_okev_agach',
        'pension_halachti','pension_ashrai','pension_kayemet',
        'pension_kaklali','pension_ksafi',
        'pension_kabala_basic','pension_kabala_halacha','pension_kabala_kayam'
      ]
    },
    {
      id: 'removed_legacy_category',
      label: '',
      subLabel: '',
      apiClassifications: [],
      icon: '🧩',
      color: '#0f766e',
      toolPage: false
    }
  ],

  // ══════════════════════════════════════════════════
  // מסלולי השקעה — SUB_SPECIALIZATION מדויק מה-API
  // ══════════════════════════════════════════════════
  INVESTMENT_TRACKS: [
    // ── מסלולי גיל ──
    {
      id: 'ad_gil_50',
      label: 'עד גיל 50',
      subSpecializationKeys: ['עד 50']
    },
    {
      id: 'gil_50_60',
      label: 'גיל 50-60',
      subSpecializationKeys: ['50-60']
    },
    {
      id: 'gil_60_plus',
      label: 'גיל 60 ומעלה',
      subSpecializationKeys: ['60 ומעלה']
    },
    // ── מסלולי השקעה עיקריים ──
    {
      id: 'maniот',
      label: 'מניות',
      subSpecializationKeys: ['מניות', 'מניות ']
    },
    {
      id: 'sp500',
      label: 'עוקב S&P 500',
      subSpecializationKeys: ['עוקב מדד s&p 500']
    },
    {
      id: 'halachti',
      label: 'הלכתי',
      subSpecializationKeys: ['הלכה יהודית']
    },
    {
      id: 'ashrai_agach',
      label: 'אשראי ואג"ח',
      subSpecializationKeys: ['אשראי ואג"ח', 'אשראי ואגח'],
      // קרנות עם "מניות" או "25%" בשם שייכות למסלול ashrai_agach_maniот בלבד
      fundNameExcludes: ['מניות', '25%']
    },
    {
      id: 'ashrai_agach_maniот',
      label: 'אשראי ואג"ח + מניות עד 25%',
      subSpecializationKeys: ['אשראי ואג"ח', 'אשראי ואגח'],
      // רק קרנות ששם הקופה שלהן מכיל "מניות" או "25%"
      fundNameIncludes: ['מניות', '25%']
    },
    {
      id: 'okev_mimdim',
      label: 'עוקב מדדים גמיש',
      subSpecializationKeys: ['עוקב מדדים - גמיש', 'עוקב מדדים גמיש']
    },
    {
      id: 'ksafi_shekel',
      label: 'כספי שקלי',
      subSpecializationKeys: ['כספי (שקלי)']
    },
    {
      id: 'okev_maniот',
      label: 'עוקב מדדי מניות',
      subSpecializationKeys: ['עוקב מדדי מניות']
    },
    {
      id: 'meshulab_sahar',
      label: 'משולב סחיר',
      subSpecializationKeys: ['משולב סחיר']
    },
    {
      id: 'maniот_sahar',
      label: 'מניות סחיר',
      subSpecializationKeys: ['מניות סחיר']
    },
    {
      id: 'agach_mimshalot',
      label: 'אג"ח ממשלות',
      subSpecializationKeys: ['אג"ח ממשלות']
    },
    {
      id: 'agach_sahar',
      label: 'אג"ח סחיר',
      subSpecializationKeys: ['אג"ח סחיר']
    },
    {
      id: 'okev_agach',
      label: 'עוקב מדדי אג"ח',
      subSpecializationKeys: ['עוקב מדדי אג"ח']
    },
    // ── מסלול כללי ── מוסתר ברירת מחדל בתגמולים
    {
      id: 'kaklali',
      label: 'כללי',
      subSpecializationKeys: ['כללי']
    },

    // ════════════════════════════════════════
    // מסלולי חיסכון לכל ילד (trackList ייחודי)
    // ════════════════════════════════════════
    {
      id: 'yeled_stocks',
      label: 'סיכון גבוה (מניות)',
      // בחיסכון לכל ילד: SUB_SPECIALIZATION = "חיסכון לילד -חוסכים המעדיפים סיכון גבוה"
      subSpecializationKeys: [
        'חיסכון לילד -חוסכים המעדיפים סיכון גבוה',
        'חיסכון לילד - חוסכים המעדיפים סיכון גבוה',
        'סיכון גבוה'
      ]
    },
    {
      id: 'yeled_general',
      label: 'סיכון בינוני (כללי)',
      subSpecializationKeys: [
        'חיסכון לילד -חוסכים המעדיפים סיכון בינוני',
        'חיסכון לילד - חוסכים המעדיפים סיכון בינוני',
        'סיכון בינוני'
      ]
    },
    {
      id: 'yeled_low',
      label: 'סיכון מועט',
      subSpecializationKeys: [
        'חיסכון לילד -חוסכים המעדיפים סיכון מועט',
        'חיסכון לילד - חוסכים המעדיפים סיכון מועט',
        'סיכון מועט'
      ]
    },
    {
      id: 'yeled_halacha',
      label: 'הלכה יהודית',
      subSpecializationKeys: [
        'חיסכון לילד - מסלול הלכה יהודית',
        'חיסכון לילד -מסלול הלכה יהודית',
        'הלכה יהודית'
      ]
    },
    {
      id: 'yeled_islam',
      label: 'הלכה איסלאמית',
      subSpecializationKeys: [
        'חיסכון לילד - מסלול הלכה איסלאמית',
        'חיסכון לילד -מסלול הלכה איסלאמית',
        'חיסכון לילד - הלכה איסלאמית',
        'חיסכון לילד -הלכה איסלאמית',
        'חיסכון לילד -חוסכים המעדיפים שריעה',
        'חיסכון לילד - חוסכים המעדיפים שריעה',
        'חיסכון לילד -חוסכים המעדיפים הלכה איסלאמית',
        'חיסכון לילד - חוסכים המעדיפים הלכה איסלאמית',
        'שריעה',
        'הלכה איסלאמית',
        'מסלול שריעה'
      ]
    },

    // ── מסלולי פנסיה — התאמה לפי FUND_NAME (אין SUB_SPECIALIZATION) ──

    // מסלולי גיל
    // חשוב: '50 ומטה' בלבד — לא 'לבני 50' כי זה יתפוס גם '50 עד 60' / '50-60'
    {
      id: 'pension_gil_50',
      label: 'לבני 50 ומטה',
      fundNameIncludes: ['50 ומטה'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    {
      id: 'pension_gil_50_60',
      label: 'לבני 50-60',
      fundNameIncludes: ['50-60', '50 עד 60'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    {
      id: 'pension_gil_60_plus',
      label: 'לבני 60 ומעלה',
      fundNameIncludes: ['60 ומעלה'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },

    // מסלולי השקעה עיקריים
    {
      id: 'pension_maniот',
      label: 'מניות',
      fundNameIncludes: ['מניות'],
      fundNameExcludes: ['עוקב', 'סחיר', 'מקבלי', 'קצבה', 'קיצבה', 's&p', 'sp500', 'sp 500']
    },
    {
      id: 'pension_maniот_sahar',
      label: 'מניות סחיר',
      fundNameIncludes: ['מניות סחיר'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    {
      id: 'pension_meshulab_sahar',
      label: 'משולב סחיר',
      fundNameIncludes: ['משולב סחיר'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    {
      id: 'pension_agach_sahar',
      label: 'אג"ח סחיר',
      fundNameIncludes: ['אג"ח סחיר', 'אגח סחיר'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    {
      id: 'pension_sp500',
      label: 'עוקב S&P 500',
      fundNameIncludes: ['s&p', 'sp500', 'sp 500', 'מדד s', 'standard & poor', 'standard&poor'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    {
      id: 'pension_okev_maniот',
      label: 'עוקב מדדי מניות',
      fundNameIncludes: ['עוקב מדדי מניות'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    // עוקב מדדים גמיש — לא קיים עדיין בנתוני הפנסיה, נשמר להמשך
    {
      id: 'pension_okev_mimdim',
      label: 'עוקב מדדים גמיש',
      fundNameIncludes: ['עוקב מדדים גמיש', 'מדדים - גמיש'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    {
      id: 'pension_okev_agach',
      label: 'עוקב מדדי אג"ח',
      fundNameIncludes: ['עוקב מדדי אג'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    {
      id: 'pension_halachti',
      label: 'הלכה',
      fundNameIncludes: ['הלכה'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה', 'קיימים']
    },
    {
      id: 'pension_ashrai',
      label: 'אשראי ואג"ח',
      fundNameIncludes: ['אשראי'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    {
      id: 'pension_kayemet',
      label: 'קיימות',
      fundNameIncludes: ['קיימות'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },
    // כללי: 'כללי' תואם גם 'כללית' בשם הקרן → חייבים לסנן החוצה כל מסלולי ההשקעה
    {
      id: 'pension_kaklali',
      label: 'כללי',
      fundNameIncludes: ['כללי'],
      fundNameExcludes: ['מניות', 'הלכה', 'אשראי', 'כספי', 'קצבה', 'קיצבה',
                         'מקבלי', 'סחיר', 'עוקב', 'קיימות', 'לבני',
                         'ומטה', 'ומעלה', 'עד 60', '50-60', 's&p']
    },
    {
      id: 'pension_ksafi',
      label: 'כספי (שקלי)',
      fundNameIncludes: ['כספי'],
      fundNameExcludes: ['מקבלי', 'קצבה', 'קיצבה']
    },

    // יעד לפרישה (נשמר לשימוש עתידי — לא ב-trackList)
    {
      id: 'pension_yad_prishe',
      label: 'יעד לפרישה',
      fundNameIncludes: ['לפרישה']
    },

    // ── מסלולי מקבלי קצבה — תת-קבוצה ──
    {
      id: 'pension_kabala_basic',
      label: 'בסיסי למקבלי קצבה',
      group: 'kabala',
      groupLabel: 'מקבלי קצבה',
      fundNameIncludes: ['בסיסי למקבלי'],
      fundNameExcludes: []
    },
    // pension_halachti מוחרג ע"י 'קיימים' ו'קצבה', pension_kabala_halacha תופס 'הלכה למקבלי'
    {
      id: 'pension_kabala_halacha',
      label: 'הלכה למקבלי קצבה/קיימים',
      group: 'kabala',
      groupLabel: 'מקבלי קצבה',
      fundNameIncludes: ['הלכה למקבלי'],
      fundNameExcludes: []
    },
    // כל מקבלי קצבה שאינם 'בסיסי' ואינם 'הלכה'
    {
      id: 'pension_kabala_kayam',
      label: 'למקבלי קצבה קיימים',
      group: 'kabala',
      groupLabel: 'מקבלי קצבה',
      fundNameIncludes: ['מקבלי קצבה', 'מקבלי קיצבה'],
      fundNameExcludes: ['בסיסי', 'הלכה']
    },

    // ── פוליסות חיסכון ──────────────────────────────────────────
    { id: 'polisa_kaklali',
      label: 'כללי',
      fundNameIncludes: ['כללי'],
      fundNameExcludes: ['פאסיבי',' 2','Apollo','שריעה','למקבלי','קצבה'] },

    { id: 'polisa_maniот',
      label: 'מניות',
      fundNameIncludes: ['מניות'],
      fundNameExcludes: ['סחיר','עוקב','למקבלי','S&P','s&p','אג"ח','25%','ממשלות','ממשלת','קצבה'] },

    { id: 'polisa_ashrai_maniот',
      label: 'אשראי ואג"ח עם מניות (עד 25%)',
      fundNameIncludes: ['אשראי ואג"ח עם מניות', 'אשראי אג"ח עם מניות'],
      fundNameExcludes: ['מדדים','עוקב','סחיר'] },

    { id: 'polisa_sp500',
      label: 'עוקב מדד S&P 500',
      fundNameIncludes: ['s&p','S&P'] },

    { id: 'polisa_okev_maniот',
      label: 'עוקב מדדי מניות',
      fundNameIncludes: ['עוקב מדדי מניות'],
      fundNameExcludes: ['אג"ח'] },

    { id: 'polisa_okev_gmish',
      label: 'עוקב מדדים גמיש',
      fundNameIncludes: ['גמיש'] },

    { id: 'polisa_okev_agach',
      label: 'עוקב מדדי אג"ח',
      fundNameIncludes: ['עוקב מדדי אג"ח'],
      fundNameExcludes: ['מניות'] },

    { id: 'polisa_okev_agach_maniот',
      label: 'עוקב מדדים — אג"ח עם מניות (עד 25%)',
      fundNameIncludes: ['מדדים אג"ח עם מניות', 'מדדים- אג"ח עם מניות'],
      fundNameExcludes: ['אשראי','סחיר'] },

    { id: 'polisa_maniот_sahar',
      label: 'מניות סחיר',
      fundNameIncludes: ['מניות סחיר'] },

    { id: 'polisa_meshulab_sahar',
      label: 'משולב סחיר',
      fundNameIncludes: ['משולב סחיר'] },

    { id: 'polisa_agach_sahar',
      label: 'אג"ח סחיר',
      fundNameIncludes: ['אג"ח סחיר'],
      fundNameExcludes: ['ממשלתי'] },

    { id: 'polisa_agach_mimshalot',
      label: 'אג"ח ממשלות',
      fundNameIncludes: ['ממשלות', 'ממשלתי'],
      fundNameExcludes: ['מקבלי', 'קצבה'] },

    { id: 'polisa_ashrai_agach',
      label: 'אשראי ואג"ח',
      fundNameIncludes: ['אשראי ואג"ח'],
      fundNameExcludes: ['מניות'] },

    { id: 'polisa_halacha',
      label: 'הלכה',
      fundNameIncludes: ['הלכה'],
      fundNameExcludes: ['למקבלי','קצבה','שריעה'] },

    { id: 'polisa_ksafi',
      label: 'כספי (שקלי)',
      fundNameIncludes: ['כספי','שקלי'] }
  ],

  // שמות חודשים עברית
  MONTH_NAMES: {
    1: 'ינואר', 2: 'פברואר', 3: 'מרץ', 4: 'אפריל',
    5: 'מאי', 6: 'יוני', 7: 'יולי', 8: 'אוגוסט',
    9: 'ספטמבר', 10: 'אוקטובר', 11: 'נובמבר', 12: 'דצמבר'
  }
};

// ─────────────────────────────────────────
// פונקציות עזר גלובליות
// ─────────────────────────────────────────

function getProviderDisplayName(controllingCorp, managingCorp) {
  const controlling = controllingCorp || '';
  const managing = managingCorp || '';
  const combined = `${controlling} ${managing}`;

  if (combined.includes('הכשרה') && combined.includes('אלטשולר שחם')) {
    return 'הכשרה - אלטשולר שחם';
  }
  if (combined.includes('הכשרה') && combined.includes('ילין לפידות')) {
    return 'הכשרה - ילין לפידות';
  }
  if (combined.includes('הכשרה') && combined.includes('מיטב')) {
    return 'הכשרה - מיטב';
  }
  if (combined.includes('הכשרה') && combined.includes('מור')) {
    return 'הכשרה - מור';
  }
  if (combined.includes('הכשרה') && combined.includes('אנליסט')) {
    return 'הכשרה - אנליסט';
  }

  for (const src of [controllingCorp, managingCorp]) {
    if (!src) continue;
    for (const [key, val] of Object.entries(CONFIG.PROVIDER_DISPLAY_NAMES)) {
      if (src === key || src.includes(key) || key.includes(src)) return val;
    }
    for (const allowed of CONFIG.ALLOWED_PROVIDERS) {
      if (src.includes(allowed)) return allowed;
    }
  }
  const raw = controllingCorp || managingCorp || '';
  return raw.replace(/\s*בע"מ\s*/g, '').trim().substring(0, 22);
}

function isProviderAllowed(controllingCorp, managingCorp) {
  const name = getProviderDisplayName(controllingCorp, managingCorp);
  return CONFIG.ALLOWED_PROVIDERS.some(p =>
    name === p || name.includes(p) || p.includes(name)
  );
}

function formatReportPeriod(period) {
  if (!period) return '';
  const s = String(period);
  const year = s.substring(2, 4);
  const month = parseInt(s.substring(4, 6));
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

function formatPercent(val) {
  if (val === null || val === undefined || val === '') return '-';
  const n = parseFloat(val);
  if (isNaN(n)) return '-';
  return `\u200E${n.toFixed(2)}%`;
}

function calcExposurePercent(exposureVal, totalAssets) {
  const pct = calcExposurePercentValue(exposureVal, totalAssets);
  return pct === null ? '-' : `\u200E${pct.toFixed(1)}%`;
}

function calcExposurePercentValue(exposureVal, totalAssets) {
  const e = parseFloat(exposureVal);
  const t = parseFloat(totalAssets);
  if (!Number.isFinite(e) || !Number.isFinite(t) || t <= 0) return null;
  const pct = (e / t) * 100;
  return Number.isFinite(pct) ? pct : null;
}
