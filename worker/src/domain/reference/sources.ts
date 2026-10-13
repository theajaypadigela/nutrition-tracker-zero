/**
 * The registry of sources behind every number the engine shows (WEEKLY_BREAKDOWN_PLAN.md 4, Appendix A).
 * Every `Target` carries a `basis` that is a key here, so the app can show a title and a link for any
 * target, and a test fails if a basis has no source. The links are the ones the plan's Appendix A lists.
 */
export interface Source {
  title: string;
  publisher: string;
  /** The year the plan's Appendix A gives, or null for a web page that states none. */
  year: number | null;
  url: string;
}

export const SOURCES = {
  'nasem2023-eer': {
    title: 'Dietary Reference Intakes for Energy: development of prediction equations for estimated energy requirements',
    publisher: 'National Academies of Sciences, Engineering, and Medicine',
    year: 2023,
    url: 'https://www.nationalacademies.org/read/26818/chapter/7',
  },
  'nasem2023-activity': {
    title: 'Dietary Reference Intakes for Energy: applications (physical activity levels)',
    publisher: 'National Academies of Sciences, Engineering, and Medicine',
    year: 2023,
    url: 'https://www.nationalacademies.org/read/26818/chapter/9',
  },
  'mifflin1990': {
    title: 'A new predictive equation for resting energy expenditure in healthy individuals',
    publisher: 'American Journal of Clinical Nutrition',
    year: 1990,
    url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
  },
  'nasem-dri-appendix-j': {
    title: 'Dietary Reference Intakes summary tables (EAR, RDA or AI, and Upper Level)',
    publisher: 'National Academies of Sciences, Engineering, and Medicine',
    year: 2019,
    url: 'https://www.nationalacademies.org/read/25353/chapter/28',
  },
  'nasem2019-cdrr': {
    title: 'Dietary Reference Intakes for Sodium and Potassium: Chronic Disease Risk Reduction intake',
    publisher: 'National Academies of Sciences, Engineering, and Medicine',
    year: 2019,
    url: 'https://nap.nationalacademies.org/read/25353/chapter/1',
  },
  'nasem2019-potassium-ai': {
    title: 'Dietary Reference Intakes for Sodium and Potassium: potassium Adequate Intake',
    publisher: 'National Academies of Sciences, Engineering, and Medicine',
    year: 2019,
    url: 'https://nap.nationalacademies.org/read/25353/chapter/1',
  },
  'who-sodium': {
    title: 'Sodium reduction (fact sheet)',
    publisher: 'World Health Organization',
    year: null,
    url: 'https://www.who.int/news-room/fact-sheets/detail/sodium-reduction',
  },
  'nasem-amdr': {
    title: 'Dietary Reference Intakes for macronutrients: Acceptable Macronutrient Distribution Ranges and carbohydrate RDA',
    publisher: 'National Academies (as published by Health Canada)',
    year: 2005,
    url: 'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients-dietary-reference-intakes-tables-2005.html',
  },
  'nasem-fibre-ai': {
    title: 'Dietary Reference Intakes for macronutrients: fibre Adequate Intake of 14 g per 1,000 kcal (WHO: at least 25 g)',
    publisher: 'National Academies (as published by Health Canada); World Health Organization',
    year: 2005,
    url: 'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients-dietary-reference-intakes-tables-2005.html',
  },
  'protein-per-kg': {
    title: 'Protein per kilogram: RDA 0.8 g/kg inside the 1.2-1.6 g/kg of the US 2025-2030 guidance and the ISSN 1.4-2.0 g/kg position',
    publisher: 'National Academies; US HHS and USDA; International Society of Sports Nutrition',
    year: 2026,
    url: 'https://cdn.realfood.gov/DGA.pdf',
  },
  'icmr-nin2020': {
    title: 'Nutrient Requirements for Indians: Recommended Dietary Allowances and Estimated Average Requirements (brief note and short report)',
    publisher: 'ICMR-National Institute of Nutrition',
    year: 2020,
    url: 'https://www.nin.res.in/rdabook/brief_note.pdf',
  },
  'dgi2024': {
    title: 'Dietary Guidelines for Indians',
    publisher: 'ICMR-National Institute of Nutrition',
    year: 2024,
    url: 'https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI_2024.pdf',
  },
  'who-fat': {
    title: 'Total fat intake for the prevention of unhealthy weight gain in adults and children: WHO guideline',
    publisher: 'World Health Organization',
    year: 2023,
    url: 'https://www.who.int/publications/i/item/9789240073654',
  },
  'who-sugars': {
    title: 'Guideline: sugars intake for adults and children',
    publisher: 'World Health Organization',
    year: 2015,
    url: 'https://www.who.int/publications/i/item/9789241549028',
  },
  'who-saturated-fat': {
    title: 'Saturated fatty acid and trans-fatty acid intake for adults and children: WHO guideline',
    publisher: 'World Health Organization',
    year: 2023,
    url: 'https://www.who.int/publications/i/item/9789240073630',
  },
  'nasem2001-iron-veg': {
    title: 'Dietary Reference Intakes for vitamin A, vitamin K, arsenic, boron, chromium, copper, iodine, iron, manganese, molybdenum, nickel, silicon, vanadium and zinc: iron',
    publisher: 'Institute of Medicine',
    year: 2001,
    url: 'https://www.nationalacademies.org/read/10026/chapter/11',
  },
  'nasem2001-zinc-veg': {
    title: 'Dietary Reference Intakes for vitamin A, vitamin K, arsenic, boron, chromium, copper, iodine, iron, manganese, molybdenum, nickel, silicon, vanadium and zinc: zinc',
    publisher: 'Institute of Medicine',
    year: 2001,
    url: 'https://www.nationalacademies.org/read/10026/chapter/14',
  },
  'iom2000-assessment': {
    title: 'Dietary Reference Intakes: applications in dietary assessment (using the DRIs for individuals; within-person variation)',
    publisher: 'Institute of Medicine',
    year: 2000,
    url: 'https://www.nationalacademies.org/read/9956/chapter/8',
  },
  'aha-acc-tos-2013': {
    title: '2013 AHA/ACC/TOS guideline for the management of overweight and obesity in adults',
    publisher: 'American Heart Association, American College of Cardiology and The Obesity Society',
    year: 2014,
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5819889/',
  },
  'nhlbi-practical-guide': {
    title: 'The Practical Guide: identification, evaluation, and treatment of overweight and obesity in adults',
    publisher: 'NHLBI and NAASO',
    year: 2000,
    url: 'https://www.nhlbi.nih.gov/files/docs/guidelines/prctgd_c.pdf',
  },
  'iraki2019-surplus': {
    title: 'Nutrition recommendations for bodybuilders in the off-season: a narrative review',
    publisher: 'Sports (Basel)',
    year: 2019,
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/',
  },
  'nhs-gain-weight': {
    title: 'Healthy ways to gain weight',
    publisher: 'NHS',
    year: null,
    url: 'https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/healthy-ways-to-gain-weight/',
  },
  'hall2011': {
    title: 'Quantification of the effect of energy imbalance on bodyweight',
    publisher: 'The Lancet',
    year: 2011,
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/',
  },
  'hei2020': {
    title: 'Developing the Healthy Eating Index (HEI-2020 component standards)',
    publisher: 'US National Cancer Institute',
    year: null,
    url: 'https://epi.grants.cancer.gov/hei/developing.html',
  },
  'us-label-dv': {
    title: 'Nutrition labeling of food (21 CFR 101.9): Daily Values',
    publisher: 'US Code of Federal Regulations',
    year: 2025,
    url: 'https://www.govinfo.gov/content/pkg/CFR-2025-title21-vol2/xml/CFR-2025-title21-vol2-sec101-9.xml',
  },
  'custom-target': {
    title: 'A target you typed',
    publisher: 'You',
    year: null,
    url: '',
  },
  'care-team-target': {
    title: 'A target from your care team, as you typed it',
    publisher: 'Your care team',
    year: null,
    url: '',
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

export const isSourceId = (id: string): id is SourceId => id in SOURCES;
