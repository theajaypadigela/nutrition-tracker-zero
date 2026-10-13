# Review packet: personal targets and the weekly report

Generated from the code on 2026-10-13 (engine 1.1.0) by `cd worker && npm run review:packet`. **Nothing here has been reviewed yet.**
Every number below is the engine's real output and every sentence is the app's real wording, so a comment on this page is a comment on
the app. The design and the evidence behind it are in [WEEKLY_BREAKDOWN_PLAN.md](../WEEKLY_BREAKDOWN_PLAN.md); section references below
point there.

**Who reads what.**

| Reviewer | Start with | What we need |
|---|---|---|
| Dietitian | Sections 1, 2, 3 and 5 | Are the targets, floors, caps and gates sensible for adults in India and the US? Is any sentence wrong, alarming or advice we must not give? |
| Eating-disorder expertise | Section 2 (the gates), section 5 (all wording), especially low-pressure mode | Could any screen or sentence push someone toward restriction? Is the safety wording right? |
| Privacy and legal | Section 6 and the README's privacy section | Is the data inventory complete and the consent wording adequate (DPDP Act, Google Play, Apple)? |
| Second reader of the tables | Section 4 | Re-derive each value from the official book; a test snapshots each table's hash, so a correction shows as a diff. |

## 1. What the engine gives ten people, on both reference sets

Energy is the National Academies 2023 equation on both sets, shown as a range; the target moves only for a loss or gain goal, inside
the floors and caps of plan 4.3. A goal that is not offered is held at maintenance, with a warning.

### US and Canada (National Academies)

| Person | Goal applied | Energy kcal: steady weight (range) -> target (range) | Protein g | Fat g (range) | Carbs g (range) | Fibre g | Sodium mg | Potassium mg | Iron mg | Calcium mg | Warnings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Woman 30, 160 cm, 60 kg, low active, eat well | general_health | 2,150 (1,910-2,390) -> 2,150 (1,910-2,390) | 60 | 72 (48-84) | 316 (242-349) | 30 | 2,300 | 2,600 | 18 (RDA) | 1,000 | - |
| Vegetarian woman 30, 158 cm, 52 kg, eat well | general_health | 2,040 (1,800-2,280) -> 2,040 (1,800-2,280) | 52 | 68 (45-79) | 305 (230-332) | 29 | 2,300 | 2,600 | 32.4 (RDA) | 1,000 | iron_plant_based |
| Man 45, 172 cm, 85 kg, inactive, lose (standard) | lose | 2,580 (2,240-2,920) -> 2,190 (1,850-2,530) | 119 | 73 (49-85) | 264 (246-356) | 31 | 2,300 | 3,400 | 8 (RDA) | 1,000 | - |
| Man 25, 180 cm, 70 kg, active, build muscle | build_muscle | 3,020 (2,680-3,360) -> 3,320 (2,980-3,660) | 112 | 111 (74-129) | 469 (374-540) | 46 | 2,300 | 3,400 | 8 (RDA) | 1,000 | - |
| Woman 68, 155 cm, 58 kg, inactive, maintain, vegetarian | maintain | 1,670 (1,430-1,920) -> 1,670 (1,430-1,920) | 70 | 56 (37-65) | 223 (188-271) | 25 | 2,300 | 2,600 | 14.4 (RDA) | 1,200 | iron_plant_based |
| Sex not given 40, 165 cm, 75 kg, lose (gentle) | lose | 2,470 (2,180-2,760) -> 2,220 (1,930-2,510) | 105 | 74 (49-86) | 284 (250-361) | 31 | 2,300 | 3,000 | 13 (RDA) | 1,000 | - |
| Woman 35, 160 cm, 45 kg (BMI 17.6), gain | gain | 1,930 (1,690-2,170) -> 2,220 (1,980-2,460) | 56 | 74 (49-86) | 333 (250-361) | 31 | 2,300 | 2,600 | 18 (RDA) | 1,000 | underweight_notice |
| Woman 50, 150 cm, 95 kg (BMI 42), inactive, lose (faster) | lose | 2,200 (1,960-2,450) -> 1,760 (1,520-2,010) | 95 | 59 (39-68) | 214 (198-286) | 25 | 2,300 | 2,600 | 18 (RDA) | 1,000 | - |
| Man 75, 170 cm, 80 kg (BMI 27.7), inactive, lose | lose -> maintain | 2,170 (1,830-2,520) -> 2,170 (1,830-2,520) | 96 | 72 (48-84) | 284 (244-353) | 30 | 2,300 | 3,400 | 8 (RDA) | 1,200 | lose_65plus_needs_obesity |
| Woman 24, 165 cm, 63 kg (BMI 23.1), lose | lose -> maintain | 2,260 (2,020-2,500) -> 2,260 (2,020-2,500) | 63 | 75 (50-88) | 333 (254-367) | 32 | 2,300 | 2,600 | 18 (RDA) | 1,000 | lose_not_indicated_bmi |

### India (ICMR-NIN, 2020)

| Person | Goal applied | Energy kcal: steady weight (range) -> target (range) | Protein g | Fat g (range) | Carbs g (range) | Fibre g | Sodium mg | Potassium mg | Iron mg | Calcium mg | Warnings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Woman 30, 160 cm, 60 kg, low active, eat well | general_health | 2,150 (1,910-2,390) -> 2,150 (1,910-2,390) | 60 | 72 (36-84) | 316 (242-349) | 32 | 2,000 | 3,500 | 15 (EAR) | 1,000 | - |
| Vegetarian woman 30, 158 cm, 52 kg, eat well | general_health | 2,040 (1,800-2,280) -> 2,040 (1,800-2,280) | 52 | 68 (34-79) | 305 (230-332) | 31 | 2,000 | 3,500 | 15 (EAR) | 1,000 | - |
| Man 45, 172 cm, 85 kg, inactive, lose (standard) | lose | 2,580 (2,240-2,920) -> 2,190 (1,850-2,530) | 119 | 73 (37-85) | 264 (246-356) | 33 | 2,000 | 3,500 | 11 (EAR) | 1,000 | - |
| Man 25, 180 cm, 70 kg, active, build muscle | build_muscle | 3,020 (2,680-3,360) -> 3,320 (2,980-3,660) | 112 | 111 (55-129) | 469 (374-540) | 50 | 2,000 | 3,500 | 11 (EAR) | 1,000 | - |
| Woman 68, 155 cm, 58 kg, inactive, maintain, vegetarian | maintain | 1,670 (1,430-1,920) -> 1,670 (1,430-1,920) | 70 | 56 (28-65) | 223 (188-271) | 25 | 2,000 | 3,500 | 11 (EAR) | 1,200 | - |
| Sex not given 40, 165 cm, 75 kg, lose (gentle) | lose | 2,470 (2,180-2,760) -> 2,220 (1,930-2,510) | 105 | 74 (37-86) | 284 (250-361) | 33 | 2,000 | 3,500 | 13 (EAR) | 1,000 | - |
| Woman 35, 160 cm, 45 kg (BMI 17.6), gain | gain | 1,930 (1,690-2,170) -> 2,220 (1,980-2,460) | 56 | 74 (37-86) | 333 (250-361) | 33 | 2,000 | 3,500 | 15 (EAR) | 1,000 | underweight_notice |
| Woman 50, 150 cm, 95 kg (BMI 42), inactive, lose (faster) | lose | 2,200 (1,960-2,450) -> 1,760 (1,520-2,010) | 95 | 59 (29-68) | 214 (198-286) | 26 | 2,000 | 3,500 | 15 (EAR) | 1,000 | - |
| Man 75, 170 cm, 80 kg (BMI 27.7), inactive, lose | lose | 2,170 (1,830-2,520) -> 1,850 (1,510-2,200) | 112 | 62 (31-72) | 212 (208-301) | 28 | 2,000 | 3,500 | 11 (EAR) | 1,200 | - |
| Woman 24, 165 cm, 63 kg (BMI 23.1), lose | lose | 2,260 (2,020-2,500) -> 1,920 (1,680-2,160) | 88 | 64 (32-75) | 248 (216-312) | 29 | 2,000 | 3,500 | 15 (EAR) | 1,000 | - |

## 2. The gates: who gets personal targets (plan 8.1)

A gate puts the profile in reference-only mode: amounts only, no targets, no energy verdict, and nothing stored that says why. The
safety answers are used once and never stored.

| Situation | Mode | Goal applied | Warnings | Goals offered |
|---|---|---|---|---|
| Age 18 | reference_only | - | reference_only, under_19 | - |
| Pregnant or breastfeeding | reference_only | - | reference_only | - |
| Eating disorder, now or in the past (also turns low-pressure mode on) | reference_only | - | reference_only | - |
| A clinician's diet or calorie target | reference_only | - | reference_only | - |
| A medicine that interacts with food | personalised | general_health | medicine_amounts_only | general_health, maintain, gain, build_muscle |
| BMI 15.6 | reference_only | - | reference_only, bmi_out_of_range | - |
| BMI 60.5 | reference_only | - | reference_only, bmi_out_of_range | - |
| Lose at BMI 23.4 (US set) | personalised | lose -> maintain | lose_not_indicated_bmi | general_health, maintain, gain, build_muscle |
| Lose at BMI 23.4 (India set) | personalised | lose | - | general_health, maintain, lose, build_muscle |
| Gain at BMI 26.2 | personalised | gain -> maintain | gain_not_indicated_bmi | general_health, maintain, lose, build_muscle |
| Lose at 70, BMI 27.3 | personalised | lose -> maintain | lose_65plus_needs_obesity | general_health, maintain, build_muscle |
| Lose at 70, BMI 31.3 | personalised | lose | - | general_health, maintain, lose, build_muscle |
| Lose at 82, BMI 31.3 | personalised | lose -> maintain | lose_needs_clinician_80plus | general_health, maintain, build_muscle |

## 3. The weekly report's edges (plan 5.4, 7.2, 7.3, 7.6, 7.7)

All are design choices [A] unless marked; each sits in one config object and is covered by tests.

| Edge | Value |
|---|---|
| A day looks incomplete under | 500 kcal, or 60% of the person's own energy target |
| ... or with more than this share of its items unknown | 33% |
| Days needed before anything is judged | 3 |
| Coverage treated as complete / partial | 90% / 50% |
| "On target" from / "a little low" from | 90% / 75% of the target |
| "Well above the limit" past | 1.25x the limit |
| Energy "near your target" | within 10% |
| A day probably mistyped above (female / male / average) | 3,500 / 4,200 / 3,850 kcal |
| Low-intake notice (and no score) from | 3 days under the sex-specific floor (1,200 kcal women or unknown, 1,500 men) |
| An amount worth a check: one item over | 2,000 kcal |
| ... or more than | 6 katori, 6 bowl, 4 plate, 6 serving, 8 cup, 8 glass, 15 tbsp, 20 tsp, 12 slice, 30 piece; 10 of any other unit |
| ... or more than (weight, volume) | 1,500 g, 2 kg, 3,000 ml, 3 l |
| Trends: earlier weeks needed / noise band | 3 weeks with at least 3 counted days / the larger of 10% of their mean and one standard deviation |
| The Nutrient mix score | Off in a deployment unless NUTRIENT_SCORE is "1" |

## 4. The reference tables the engine reads (for re-deriving)

Values are per day. RDA: Recommended Dietary Allowance; AI: Adequate Intake; EAR: Estimated Average Requirement; UL: upper level.
Each table's source is in the registry below; the ICMR-NIN values were typed from a secondary copy of the 2020 report and need a check
against the official book.

### National Academies (US and Canada), by age band 19-30, 31-50, 51-70, over 70

| Nutrient | Unit | Women 19-30 | Women 31-50 | Women 51-70 | Women >70 | Men 19-30 | Men 31-50 | Men 51-70 | Men >70 | UL (scope) | Source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| vitaminA | mcg RAE | 700 RDA (EAR 500) | 700 RDA (EAR 500) | 700 RDA (EAR 500) | 700 RDA (EAR 500) | 900 RDA (EAR 625) | 900 RDA (EAR 625) | 900 RDA (EAR 625) | 900 RDA (EAR 625) | 3,000 / 3,000 / 3,000 / 3,000 (preformed_only) | nasem-dri-appendix-j |
| vitaminC | mg | 75 RDA (EAR 60) | 75 RDA (EAR 60) | 75 RDA (EAR 60) | 75 RDA (EAR 60) | 90 RDA (EAR 75) | 90 RDA (EAR 75) | 90 RDA (EAR 75) | 90 RDA (EAR 75) | 2,000 / 2,000 / 2,000 / 2,000 (all_sources) | nasem-dri-appendix-j |
| vitaminD | mcg | 15 RDA (EAR 10) | 15 RDA (EAR 10) | 15 RDA (EAR 10) | 20 RDA (EAR 10) | 15 RDA (EAR 10) | 15 RDA (EAR 10) | 15 RDA (EAR 10) | 20 RDA (EAR 10) | 100 / 100 / 100 / 100 (all_sources) | nasem-dri-appendix-j |
| vitaminE | mg | 15 RDA (EAR 12) | 15 RDA (EAR 12) | 15 RDA (EAR 12) | 15 RDA (EAR 12) | 15 RDA (EAR 12) | 15 RDA (EAR 12) | 15 RDA (EAR 12) | 15 RDA (EAR 12) | 1,000 / 1,000 / 1,000 / 1,000 (supplements_only) | nasem-dri-appendix-j |
| vitaminK | mcg | 90 AI | 90 AI | 90 AI | 90 AI | 120 AI | 120 AI | 120 AI | 120 AI | - | nasem-dri-appendix-j |
| vitaminB12 | mcg | 2.4 RDA (EAR 2) | 2.4 RDA (EAR 2) | 2.4 RDA (EAR 2) | 2.4 RDA (EAR 2) | 2.4 RDA (EAR 2) | 2.4 RDA (EAR 2) | 2.4 RDA (EAR 2) | 2.4 RDA (EAR 2) | - | nasem-dri-appendix-j |
| folate | mcg DFE | 400 RDA (EAR 320) | 400 RDA (EAR 320) | 400 RDA (EAR 320) | 400 RDA (EAR 320) | 400 RDA (EAR 320) | 400 RDA (EAR 320) | 400 RDA (EAR 320) | 400 RDA (EAR 320) | 1,000 / 1,000 / 1,000 / 1,000 (supplements_only) | nasem-dri-appendix-j |
| calcium | mg | 1,000 RDA (EAR 800) | 1,000 RDA (EAR 800) | 1,200 RDA (EAR 1,000) | 1,200 RDA (EAR 1,000) | 1,000 RDA (EAR 800) | 1,000 RDA (EAR 800) | 1,000 RDA (EAR 800) | 1,200 RDA (EAR 1,000) | 2,500 / 2,500 / 2,000 / 2,000 (all_sources) | nasem-dri-appendix-j |
| iron | mg | 18 RDA (EAR 8.1) | 18 RDA (EAR 8.1) | 8 RDA (EAR 5) | 8 RDA (EAR 5) | 8 RDA (EAR 6) | 8 RDA (EAR 6) | 8 RDA (EAR 6) | 8 RDA (EAR 6) | 45 / 45 / 45 / 45 (all_sources) | nasem-dri-appendix-j |
| magnesium | mg | 310 RDA (EAR 255) | 320 RDA (EAR 265) | 320 RDA (EAR 265) | 320 RDA (EAR 265) | 400 RDA (EAR 330) | 420 RDA (EAR 350) | 420 RDA (EAR 350) | 420 RDA (EAR 350) | 350 / 350 / 350 / 350 (supplements_only) | nasem-dri-appendix-j |
| zinc | mg | 8 RDA (EAR 6.8) | 8 RDA (EAR 6.8) | 8 RDA (EAR 6.8) | 8 RDA (EAR 6.8) | 11 RDA (EAR 9.4) | 11 RDA (EAR 9.4) | 11 RDA (EAR 9.4) | 11 RDA (EAR 9.4) | 40 / 40 / 40 / 40 (all_sources) | nasem-dri-appendix-j |
| potassium | mg | 2,600 AI | 2,600 AI | 2,600 AI | 2,600 AI | 3,400 AI | 3,400 AI | 3,400 AI | 3,400 AI | - | nasem2019-potassium-ai |

### ICMR-NIN 2020 (India), by age band 19-59 and 60 and over

| Nutrient | Unit | Women 19-59 | Women 60+ | Men 19-59 | Men 60+ | UL (scope) |
|---|---|---|---|---|---|---|
| vitaminA | mcg RE | 840 RDA (EAR 390) | 840 RDA (EAR 390) | 1,000 RDA (EAR 460) | 1,000 RDA (EAR 460) | 3,000 (preformed_only) |
| vitaminC | mg | 65 RDA (EAR 55) | 65 RDA (EAR 55) | 80 RDA (EAR 65) | 80 RDA (EAR 65) | 2,000 (all_sources) |
| vitaminD | mcg | 15 RDA (EAR 10) | 20 RDA (EAR 10) | 15 RDA (EAR 10) | 20 RDA (EAR 10) | 100 (all_sources) |
| vitaminE | mg | 10 AI | 10 AI | 10 AI | 10 AI | - |
| vitaminK | mcg | 55 AI | 55 AI | 55 AI | 55 AI | - |
| vitaminB12 | mcg | 2.2 RDA (EAR 2) | 2.2 RDA (EAR 2) | 2.2 RDA (EAR 2) | 2.2 RDA (EAR 2) | - |
| folate | mcg DFE | 220 RDA (EAR 180) | 200 RDA (EAR 180) | 300 RDA (EAR 250) | 300 RDA (EAR 250) | 1,000 (supplements_only) |
| calcium | mg | 1,000 RDA (EAR 800) | 1,200 RDA (EAR 1,000) | 1,000 RDA (EAR 800) | 1,200 RDA (EAR 1,000) | 2,500 (all_sources) |
| iron | mg | 29 RDA (EAR 15) | 19 RDA (EAR 11) | 19 RDA (EAR 11) | 19 RDA (EAR 11) | 45 (all_sources) |
| magnesium | mg | 370 RDA (EAR 310) | 370 RDA (EAR 310) | 440 RDA (EAR 370) | 440 RDA (EAR 370) | 350 (supplements_only) |
| zinc | mg | 13.2 RDA (EAR 11) | 13.2 RDA (EAR 11) | 17 RDA (EAR 14.1) | 17 RDA (EAR 14) | 40 (all_sources) |
| potassium | mg | 3,500 AI | 3,500 AI | 3,500 AI | 3,500 AI | - |

### Sources

| Id | Title | Publisher | Year | Link |
|---|---|---|---|---|
| nasem2023-eer | Dietary Reference Intakes for Energy: development of prediction equations for estimated energy requirements | National Academies of Sciences, Engineering, and Medicine | 2023 | https://www.nationalacademies.org/read/26818/chapter/7 |
| nasem2023-activity | Dietary Reference Intakes for Energy: applications (physical activity levels) | National Academies of Sciences, Engineering, and Medicine | 2023 | https://www.nationalacademies.org/read/26818/chapter/9 |
| mifflin1990 | A new predictive equation for resting energy expenditure in healthy individuals | American Journal of Clinical Nutrition | 1990 | https://pubmed.ncbi.nlm.nih.gov/2305711/ |
| nasem-dri-appendix-j | Dietary Reference Intakes summary tables (EAR, RDA or AI, and Upper Level) | National Academies of Sciences, Engineering, and Medicine | 2019 | https://www.nationalacademies.org/read/25353/chapter/28 |
| nasem2019-cdrr | Dietary Reference Intakes for Sodium and Potassium: Chronic Disease Risk Reduction intake | National Academies of Sciences, Engineering, and Medicine | 2019 | https://nap.nationalacademies.org/read/25353/chapter/1 |
| nasem2019-potassium-ai | Dietary Reference Intakes for Sodium and Potassium: potassium Adequate Intake | National Academies of Sciences, Engineering, and Medicine | 2019 | https://nap.nationalacademies.org/read/25353/chapter/1 |
| who-sodium | Sodium reduction (fact sheet) | World Health Organization |  | https://www.who.int/news-room/fact-sheets/detail/sodium-reduction |
| nasem-amdr | Dietary Reference Intakes for macronutrients: Acceptable Macronutrient Distribution Ranges and carbohydrate RDA | National Academies (as published by Health Canada) | 2005 | https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients-dietary-reference-intakes-tables-2005.html |
| nasem-fibre-ai | Dietary Reference Intakes for macronutrients: fibre Adequate Intake of 14 g per 1,000 kcal (WHO: at least 25 g) | National Academies (as published by Health Canada); World Health Organization | 2005 | https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients-dietary-reference-intakes-tables-2005.html |
| protein-per-kg | Protein per kilogram: RDA 0.8 g/kg inside the 1.2-1.6 g/kg of the US 2025-2030 guidance and the ISSN 1.4-2.0 g/kg position | National Academies; US HHS and USDA; International Society of Sports Nutrition | 2026 | https://cdn.realfood.gov/DGA.pdf |
| icmr-nin2020 | Nutrient Requirements for Indians: Recommended Dietary Allowances and Estimated Average Requirements (brief note and short report) | ICMR-National Institute of Nutrition | 2020 | https://www.nin.res.in/rdabook/brief_note.pdf |
| dgi2024 | Dietary Guidelines for Indians | ICMR-National Institute of Nutrition | 2024 | https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI_2024.pdf |
| who-fat | Total fat intake for the prevention of unhealthy weight gain in adults and children: WHO guideline | World Health Organization | 2023 | https://www.who.int/publications/i/item/9789240073654 |
| who-sugars | Guideline: sugars intake for adults and children | World Health Organization | 2015 | https://www.who.int/publications/i/item/9789241549028 |
| who-saturated-fat | Saturated fatty acid and trans-fatty acid intake for adults and children: WHO guideline | World Health Organization | 2023 | https://www.who.int/publications/i/item/9789240073630 |
| nasem2001-iron-veg | Dietary Reference Intakes for vitamin A, vitamin K, arsenic, boron, chromium, copper, iodine, iron, manganese, molybdenum, nickel, silicon, vanadium and zinc: iron | Institute of Medicine | 2001 | https://www.nationalacademies.org/read/10026/chapter/11 |
| nasem2001-zinc-veg | Dietary Reference Intakes for vitamin A, vitamin K, arsenic, boron, chromium, copper, iodine, iron, manganese, molybdenum, nickel, silicon, vanadium and zinc: zinc | Institute of Medicine | 2001 | https://www.nationalacademies.org/read/10026/chapter/14 |
| iom2000-assessment | Dietary Reference Intakes: applications in dietary assessment (using the DRIs for individuals; within-person variation) | Institute of Medicine | 2000 | https://www.nationalacademies.org/read/9956/chapter/8 |
| aha-acc-tos-2013 | 2013 AHA/ACC/TOS guideline for the management of overweight and obesity in adults | American Heart Association, American College of Cardiology and The Obesity Society | 2014 | https://pmc.ncbi.nlm.nih.gov/articles/PMC5819889/ |
| nhlbi-practical-guide | The Practical Guide: identification, evaluation, and treatment of overweight and obesity in adults | NHLBI and NAASO | 2000 | https://www.nhlbi.nih.gov/files/docs/guidelines/prctgd_c.pdf |
| iraki2019-surplus | Nutrition recommendations for bodybuilders in the off-season: a narrative review | Sports (Basel) | 2019 | https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/ |
| nhs-gain-weight | Healthy ways to gain weight | NHS |  | https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/healthy-ways-to-gain-weight/ |
| hall2011 | Quantification of the effect of energy imbalance on bodyweight | The Lancet | 2011 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/ |
| hei2020 | Developing the Healthy Eating Index (HEI-2020 component standards) | US National Cancer Institute |  | https://epi.grants.cancer.gov/hei/developing.html |
| us-label-dv | Nutrition labeling of food (21 CFR 101.9): Daily Values | US Code of Federal Regulations | 2025 | https://www.govinfo.gov/content/pkg/CFR-2025-title21-vol2/xml/CFR-2025-title21-vol2-sec101-9.xml |
| custom-target | A target you typed | You |  |  |
| care-team-target | A target from your care team, as you typed it | Your care team |  |  |

## 5. Every sentence the person can see in these screens

From `app/src/i18n/strings.ts`. `{name}` holes are filled with numbers or words by the app. A test already bans moralising words
("good", "bad", "cheat", "fail" and others), diagnoses, condition names outside the safety question, and any digit in low-pressure mode.

### disclaimer

| Key | Text |
|---|---|
| disclaimer.id | estimates-v1 |
| disclaimer.footer | Estimates from what you logged, not medical advice. |
| disclaimer.howWeCalculate | How we calculate this |
| disclaimer.full | This app gives general information based on what you log and published reference values. It does not diagnose, treat or prevent any condition and cannot replace advice from a doctor or dietitian. Talk to one before changing your diet if you are pregnant or breastfeeding, have a medical condition, take regular medicines, or have had an eating disorder. |
| disclaimer.projection | A rough guide. Real results vary a lot from person to person. |
| disclaimer.reference | General reference, not personal |
| disclaimer.referenceLong | General reference, not personal: values for a typical adult on a 2,000 kcal diet. |

### health

| Key | Text |
|---|---|
| health.card.title | Make your targets personal |
| health.card.body | About 2 minutes. Skip any time. |
| health.card.action | Start |
| health.card.dismiss | Not now |
| health.intro.title | Personal targets |
| health.intro.lead | Your calorie and nutrient targets can be worked out for you, instead of one fixed set for everyone. |
| health.intro.asks.title | What we ask |
| health.intro.asks.body | Your birth year, the sex used for calculations, your height and weight, how active you are, and your goal. Every question can be skipped. |
| health.intro.why.title | Why |
| health.intro.why.body | Each answer changes a number or a message. Nothing else is asked. |
| health.intro.stored.title | What is stored |
| health.intro.stored.body | Those answers and your weigh-ins, on our server, behind a secret that only your phone holds. Your answer to the safety question is never stored. |
| health.intro.who.title | Who else sees it |
| health.intro.who.body | Nobody. The daily voice call never receives any of it. The call itself is handled by Vapi and the speech and language services it uses, as before. |
| health.intro.consent | I have read what is stored and why. |
| health.intro.continue | Continue |
| health.intro.skip | Skip for now |
| health.safety.title | Before we set targets |
| health.safety.lead | Does any of this apply to you right now? |
| health.safety.pregnant | I am pregnant or breastfeeding |
| health.safety.eatingDisorder | I have, or have had, an eating disorder |
| health.safety.clinician | A doctor or dietitian has given me a specific diet or calorie target (for example for diabetes treated with insulin or tablets, kidney, heart or liver disease, cancer treatment, or after weight-loss surgery) |
| health.safety.none | None of these |
| health.safety.preferNot | I would rather not say |
| health.safety.medicineTitle | Separately |
| health.safety.medicine | I take a medicine that can interact with food (for example blood thinners such as warfarin, lithium, or some blood-pressure tablets) |
| health.safety.medicineHint | This does not change your targets. It only turns off advice about vitamin K, potassium and sodium. |
| health.safety.continue | Continue |
| health.safety.note | Your answers here are used once to decide what we can offer. They are not stored. |
| health.about.title | About you |
| health.about.birthYear | Birth year |
| health.about.birthMonth | Birth month (optional) |
| health.about.birthMonthHint | Only sharpens the age-band edges. |
| health.about.sexTitle | Sex used for calculations |
| health.about.sexHint | Reference values differ for female and male bodies. Which should we use? |
| health.about.female | Female |
| health.about.male | Male |
| health.about.average | Prefer not to say: use the average of both |
| health.about.height | Height |
| health.about.weight | Weight |
| health.about.weightHint | Your best estimate is fine. |
| health.about.isThatRight | Is that right? Please check it. |
| health.about.continue | Continue |
| health.under19.title | Personal targets are for adults |
| health.under19.body | Personal targets are for adults 19 and over, because the reference values and equations we use are for adults. You can still log food. |
| health.under19.action | Back to the app |
| health.activity.title | How active are you? |
| health.activity.lead | Pick the habit that fits best. If you are between two, choose the lower one; your weight trend will show if that is too low. |
| health.activity.note | People cannot reliably place themselves in these groups, so your target is shown as a range. |
| health.activity.inactive.title | Inactive |
| health.activity.inactive.body | Mostly sitting or light chores; little planned exercise. |
| health.activity.low_active.title | Low active |
| health.activity.low_active.body | Regular walking or light exercise on most days. |
| health.activity.active.title | Active |
| health.activity.active.body | Regular exercise, or a job on your feet. |
| health.activity.very_active.title | Very active |
| health.activity.very_active.body | Hard physical work or heavy training on most days. |
| health.activity.stepsHelper | I know my daily steps |
| health.activity.stepsHint | This only picks a card for you. Step counts are not a precise way to measure activity. |
| health.activity.continue | Continue |
| health.goal.title | What is your goal? |
| health.goal.general_health.title | Eat well |
| health.goal.general_health.body | General health: targets for the nutrients, with your energy as a guide. |
| health.goal.maintain.title | Maintain weight |
| health.goal.maintain.body | Keep your weight steady. |
| health.goal.lose.title | Lose weight |
| health.goal.lose.body | A gradual, bounded change in energy. |
| health.goal.gain.title | Gain weight |
| health.goal.gain.body | A modest surplus, gradually. |
| health.goal.build_muscle.title | Build muscle |
| health.goal.build_muscle.body | A small surplus and more protein. |
| health.goal.notOffered | Not offered for your height and weight. |
| health.goal.paceTitle | Pace |
| health.goal.gentle | Gentle |
| health.goal.standard | Standard |
| health.goal.faster | Faster |
| health.goal.paceNote | Your weight changes more slowly as time passes, and your body adapts. A rough guide only. |
| health.goal.continue | Continue |
| health.pattern.title | How do you eat? |
| health.pattern.lead | This only decides which nutrients to watch more closely. |
| health.pattern.omnivore | Everything |
| health.pattern.pescatarian | Fish but no meat |
| health.pattern.eggetarian | Eggs but no meat or fish |
| health.pattern.vegetarian | Vegetarian (dairy, no eggs) |
| health.pattern.vegan | Vegan |
| health.pattern.referenceTitle | Reference values |
| health.pattern.referenceHint | The tables the targets are read from. |
| health.pattern.soon | Coming later |
| health.pattern.referenceNotes.nasem | The tables used in the US and Canada. Sodium is limited to 2,300 mg a day. |
| health.pattern.referenceNotes.icmr_nin | The tables used in India (ICMR-NIN, 2020). A lower sodium limit, and iron, zinc and vitamin B12 read against the average requirement. |
| health.pattern.continue | Continue |
| health.review.title | Your targets |
| health.review.lead | Here is what we worked out. Nothing is saved until you press Save. |
| health.review.energy | Energy |
| health.review.protein | Protein |
| health.review.fibre | Fibre |
| health.review.sodium | Sodium |
| health.review.rangeNote | Your real needs could be anywhere in this range. After three or four weeks, your weight trend tells you more than this number does. |
| health.review.hideNumbers | Hide numbers |
| health.review.hideNumbersHint | No calorie, weight or score numbers on any screen. You can change this any time in Settings. |
| health.review.save | Save my targets |
| health.review.saving | Saving… |
| health.review.estimatesDisagree | The estimates disagree more than usual for your body size. |
| health.review.underweight | Your BMI is under 18.5. A doctor or dietitian can help you find a healthy weight and plan. |
| health.review.goalHeld | You chose to lose weight, which is not offered for your height and weight, so your target keeps your weight steady. |
| health.how.title | How we calculate this |
| health.how.intro | Every number here comes from published reference values and equations. Nothing is guessed by a model, and nothing here is medical advice. |
| health.how.energy.title | Energy |
| health.how.energy.body | The 2023 equation from the US National Academies, for your age, height, weight and activity. It is an estimate for someone whose weight is steady, with a typical error of about 240 to 340 kcal either side, so it is shown as a range. People cannot reliably place themselves in an activity group, and the equation comes from studies in high-income countries. Your weight trend over three or four weeks tells you more than this number does. |
| health.how.goal.title | Losing or gaining weight |
| health.how.goal.body | A gradual change in energy, kept inside limits: a loss never goes below a floor of 1,200 kcal (women) or 1,500 kcal (men), never more than a quarter of your estimate, and never faster than about 1% of your body weight a week. Real change is slower than a simple sum suggests, because your body adapts. |
| health.how.macros.title | Protein, fat, carbohydrate and fibre |
| health.how.macros.body | Protein is set per kilogram of body weight, higher for a loss goal, for building muscle and for older adults. Fat is about 30% of your energy, and carbohydrate is what is left, never under 130 g. Fibre is 14 g for every 1,000 kcal, and at least 25 g. Total sugars have no target: no authority limits them. Saturated fat and added sugars are limits of 10% of your energy each. |
| health.how.minerals.title | Sodium, potassium, vitamins and minerals |
| health.how.minerals.body | Sodium is a limit of 2,300 mg a day. Potassium and the rest are reference intakes for your sex and age band from the US National Academies. Iron is 1.8 times higher if you eat no meat, because iron from plants is absorbed less well. Some reference values are an Adequate Intake, an observed typical intake, so falling short of one says little about what you need. |
| health.how.india.macros.title | Protein, fat, carbohydrate and fibre |
| health.how.india.macros.body | Protein is set per kilogram of body weight, higher for a loss goal, for building muscle and for older adults, and never under the Indian allowance of 0.83 g per kilogram. Fat is about 30% of your energy, inside the usual 15% to 35%, and carbohydrate is what is left, never under 130 g. Fibre is 15 g for every 1,000 kcal, and at least 25 g. Total sugars have no target. Saturated fat is a limit of 10% of your energy and added sugars of 5%. |
| health.how.india.minerals.title | Sodium, potassium, vitamins and minerals |
| health.how.india.minerals.body | Sodium is a limit of 2,000 mg a day, about 5 g of salt. Potassium and the rest are reference intakes for your sex and age (19 to 59, or 60 and over) from India's ICMR-NIN tables of 2020. For iron, zinc and vitamin B12 the target is the Estimated Average Requirement, the level at which about half of people would still need more, because ICMR's own model diets do not reach the full allowance. Iron has no extra allowance for a plant-based diet: ICMR's figure already assumes about 8% absorption. Some reference values are an Adequate Intake, an observed typical intake, so falling short of one says little about what you need. |
| health.how.limits.title | What this cannot know |
| health.how.limits.body | It does not see supplements, fortified foods, sunlight, cooking oil or most restaurant meals. Logged amounts usually run a little low. Vitamins vary a lot from day to day, so they are judged over four weeks, not one. |
| health.how.tags | Each target is tagged: R a reference value from a standards body, E an estimate with known error, G guidance from a professional body, A a design choice that no standard dictates. |
| health.referenceOnly.title | No personal targets |
| health.referenceOnly.body | We are not setting personal targets for you. You can still log food, and the app shows what you logged. |
| health.referenceOnly.careTeam | If a doctor or dietitian gave you numbers, you can add them and see your logs against them. |
| health.referenceOnly.careTeamAction | Add my care-team numbers |
| health.referenceOnly.talk | A doctor or dietitian can help with what is right for you. |
| health.referenceOnly.done | Done |
| health.recovery.title | Save your recovery code |
| health.recovery.body | This code unlocks your personal targets on a new phone or after a reinstall. It is shown once. Keep it in a password manager. |
| health.recovery.warn | If you lose it, your personal data cannot be reached and you would start again with a new profile. |
| health.recovery.notStored | This phone could not keep the code in its secure storage, so you will need to type it the next time you open the app. Save it now. |
| health.recovery.share | Save or share the code |
| health.recovery.saved | I have saved it |
| health.recovery.entryTitle | Enter your recovery code |
| health.recovery.entryBody | This profile has a recovery code. Enter it to unlock your personal targets on this phone. |
| health.recovery.entryField | Recovery code |
| health.recovery.entryAction | Unlock |
| health.recovery.entryWrong | That is not this profile's code. Check it and try again. |
| health.recovery.startOver | I do not have it |
| health.recovery.claimAction | Set up a new code |
| health.recovery.claimRefused | This profile already has a code, so a new one cannot be set up. Without the code, your personal targets cannot be reached from this phone. |
| health.recovery.claimClosed | A new code cannot be set up from the app. Ask the person who runs the app to issue you one, then enter it above. |
| health.recovery.startOverBody | Without the code, your personal targets cannot be reached from this phone. Your food log is unaffected. |
| health.targets.title | Your targets |
| health.targets.subtitle | And how we calculate them |
| health.targets.recommended | Recommended |
| health.targets.custom | Custom |
| health.targets.careTeam | From your care team |
| health.targets.reset | Reset to recommended |
| health.targets.groups.energy | Energy |
| health.targets.groups.macros | Macros and fibre |
| health.targets.groups.limits | Keep in check |
| health.targets.groups.minerals | Vitamins and minerals |
| health.targets.evidence.R | A reference value from a standards body |
| health.targets.evidence.E | An estimate, with known error |
| health.targets.evidence.G | Guidance from a professional body |
| health.targets.evidence.A | A design choice, not a standard |
| health.targets.sources | Sources |
| health.targets.weightTrend | Your weight trend is a better guide than this number. |
| health.targets.staleWeight | Based on your weight in {month}. |
| health.targets.checkIn | You have been on a weight-loss target for a while. Time to check in: continue, keep your weight steady, or talk to a doctor or dietitian. |
| health.targets.checkInAction | Check in |
| health.targets.locked | Your recovery code is needed to see your personal targets on this phone. |
| health.targets.empty | No personal targets yet. |
| health.targets.setUp | Set up personal targets |
| health.settings.section | Personal targets |
| health.settings.profile | Personal targets |
| health.settings.profileSet | Edit your answers |
| health.settings.profileNone | Make your targets personal |
| health.settings.targets | Your targets |
| health.settings.targetsHint | And how we calculate them |
| health.settings.hideNumbers | Hide numbers |
| health.settings.hideNumbersHint | No calorie, weight or score numbers anywhere |
| health.settings.export | Export my health data |
| health.settings.deleteHealth | Delete my health data |
| health.settings.deleteHealthTitle | Delete your health data? |
| health.settings.deleteHealthBody | Your answers, weigh-ins, targets, care-team numbers and day marks are removed now, and from backups within 30 days. Your food log and the daily targets you typed yourself stay. |
| health.settings.deleteProfile | Delete this profile |
| health.settings.deleteProfileTitle | Delete this profile? |
| health.settings.deleteProfileBody | Everything is removed now, and from backups within 30 days: your food log, call history, targets and health data. Foods you added stay in the shared list without your name. |
| health.settings.cancel | Cancel |
| health.settings.confirm | Delete |
| health.settings.unlock | Unlock with your recovery code |

### report

| Key | Text |
|---|---|
| report.title | Report |
| report.week.this | This week |
| report.week.last | Last week |
| report.week.ago | {n} weeks ago |
| report.week.previous | Previous week |
| report.week.next | Next week |
| report.basedOn | Based on {n} of 7 days |
| report.todayNote | Today is not counted until it is over. |
| report.confidence.good | Solid |
| report.confidence.fair | Fair |
| report.confidence.rough | Rough |
| report.confidence.insufficient | Not enough data |
| report.confidenceLabel | How sure: {level} |
| report.dayState.valid | logged |
| report.dayState.confirmed | marked complete |
| report.dayState.partial | looks incomplete |
| report.dayState.empty | not logged |
| report.dayState.skipped | left out |
| report.dayState.in_progress | today, not counted until it is over |
| report.dayState.future | not yet |
| report.pending.one | 1 item is waiting for a food value and is not counted. |
| report.pending.many | {n} items are waiting for food values and are not counted. |
| report.pending.action | Open Pending |
| report.notEnough.none | You have not logged a finished day yet. A summary needs at least {min}. |
| report.notEnough.some | You logged {n} of 7 days. A summary needs at least {min}. What follows is what you logged so far, with no verdicts. |
| report.notEnough.one | You logged 1 of 7 days. A summary needs at least {min}. What follows is what you logged so far, with no verdicts. |
| report.generic | Compared with a general reference for a typical adult. Make your targets personal to compare with your own. |
| report.referenceOnly | No personal targets, so these are amounts only. |
| report.referenceOnlyCareTeam | Bars are drawn against the numbers you typed from your care team. |
| report.locked | Your recovery code is needed to see your personal report on this phone. |
| report.unlock | Unlock |
| report.stoodOut | What stood out |
| report.nothingStoodOut | Nothing stood out this week. |
| report.loading | Loading your week… |
| report.insights.low_intake | On {n} days you logged under {floor} kcal. If that is what you ate, a doctor or dietitian can help you eat enough. If meals are missing, adding them gives a better picture. |
| report.insights.underweight | Your BMI is under 18.5. A doctor or dietitian can help you find a healthy weight and plan. |
| report.insights.rapid_loss | Your weight has been dropping faster than the usual 0.5 to 1% a week. Slowing down is usually safer; a doctor or dietitian can advise. |
| report.insights.weight_vs_plan | Your trend weight changed {d} kg in {w} weeks; your plan expects about {e} kg. |
| report.insights.few_days | You logged {n} of 7 days. A summary needs at least {min}. |
| report.insights.incomplete_days | {day} looks incomplete (about {kcal} kcal). Is that everything you ate? |
| report.insights.incomplete_days_more | {day} and {more} other days look incomplete. Is that everything you ate? |
| report.insights.pending_items | {n} items are waiting for food values and are not counted. |
| report.insights.pending_items_one | 1 item is waiting for a food value and is not counted. |
| report.insights.partial_data | Some foods have no {nutrient} value, so this is a minimum. |
| report.insights.implausible_day | {day}'s total is about {kcal} kcal. Check the quantities? |
| report.insights.energy_above | You logged about {mean} kcal a day, {pct}% above your target of {target}. Logs usually run low. |
| report.insights.energy_below | You logged about {mean} kcal a day, {pct}% below your target of {target}. Logs usually run low. |
| report.insights.energy_near | You logged within 10% of your target on {k} of {n} days. |
| report.insights.protein_gap | Protein averaged {mean} g a day against a target of {target} g. |
| report.insights.sodium_over | Sodium averaged {mean} mg a day against a limit of {limit} mg. |
| report.insights.sodium_over_least | Sodium was at least {mean} mg a day against a limit of {limit} mg. |
| report.insights.sodium_sources | Most came from {sources}. |
| report.insights.fibre_low | Fibre averaged {mean} g a day against a target of {target} g. |
| report.insights.potassium_low_sodium_high | Potassium (from fruit, vegetables and pulses) helps balance sodium. Yours was {mean} mg against {target} mg. |
| report.insights.mineral_gap | {nutrient} averaged {mean} {unit} a day against a reference of {reference} {unit}. |
| report.insights.mineral_note_iron | Supplements and fortified foods may not be in your log. |
| report.insights.mineral_note_zinc | Supplements and fortified foods may not be in your log. |
| report.insights.vitamin_window | Over the last four weeks, {nutrient} averaged {mean} {unit} a day against a reference of {reference} {unit}. Vitamins vary a lot from day to day, so this is a rough estimate. |
| report.insights.vitamin_note_vitaminD | Sunlight and supplements are not counted here. |
| report.insights.weekend_pattern | Weekend days averaged {pct}% {direction} energy than weekdays. |
| report.insights.target_met | {nutrient} reached your target on every logged day. |
| report.insights.improving | {nutrient} is up from {from} to {to} {unit} a day over four weeks. |
| report.insights.check_amounts | {quantity} {unit} of {name} on {day} looks unusual. Is that right? |
| report.insights.check_amounts_more | {quantity} {unit} of {name} on {day}, and {more} other amounts, look unusual. Are they right? |
| report.insightActions.incomplete_days | Open the day |
| report.insightActions.implausible_day | Open the day |
| report.insightActions.check_amounts | Open the day |
| report.insightActions.pending_items | Open Pending |
| report.insightActions.sodium_over | See sources |
| report.insightActions.partial_data | See details |
| report.insightActions.vitamin_window | See the four-week view |
| report.intake.title | Logged per day |
| report.intake.basis | Average of the {n} days that count |
| report.intake.basisOne | The 1 day that counts |
| report.intake.soFar | Logged so far, per day that counts |
| report.intake.none | No finished day to average yet. |
| report.intake.atLeast | at least {value} |
| report.intake.notEnough | Not enough data |
| report.intake.share | {pct}% of energy |
| report.intake.trend | Compared with your last {weeks} weeks: {list}. |
| report.intake.trendMixed | Compared with earlier weeks: {list}. |
| report.intake.higher | {name} higher |
| report.intake.lower | {name} lower |
| report.intake.same | {name} about the same |
| report.intake.trendSoon | Comparisons with earlier weeks appear after three weeks with at least three counted days each. |
| report.intake.note | Logged amounts usually run a little low. |
| report.quality.title | What is missing or uncertain |
| report.quality.gaps | {n} foods behind this week are missing values this report uses: {pct}% of what you logged. |
| report.quality.gapsOne | 1 food behind this week is missing values this report uses: {pct}% of what you logged. |
| report.quality.gapsNames | The largest: {names}. |
| report.quality.gapsMissing | Missing most often: {list}. |
| report.quality.gapsAction | Fill in values |
| report.quality.gapsNone | Every food behind this week has the values this report uses. |
| report.quality.amountsTitle | Amounts worth a check |
| report.quality.amountsHint | A call can mishear an amount. Each one still counts until you change it. |
| report.quality.amount | {quantity} {unit} of {name}, {day} |
| report.quality.why.large_energy | about {kcal} kcal in one item |
| report.quality.why.many_servings | more helpings than usual |
| report.quality.why.large_weight | a lot for one item |
| report.quality.amountAction | Open the day |
| report.quality.sources | Where the numbers come from: {list}. |
| report.quality.source.label | pack labels {pct}% |
| report.quality.source.database | food databases {pct}% |
| report.quality.source.recipe | recipes {pct}% |
| report.quality.source.estimate | guesses {pct}% |
| report.quality.source.none | not recorded {pct}% |
| report.quality.sourcesHint | A guess or an unrecorded source makes every figure rougher. Say where a food's numbers come from when you edit it. |
| report.energy.title | Energy |
| report.energy.logged | You logged about {mean} kcal a day |
| report.energy.none | No finished day to average yet. |
| report.energy.aboutRange | about {target} kcal ({low} to {high}) |
| report.energy.exact | {target} kcal |
| report.energy.band | Within 10% of {target} on {k} of {n} days |
| report.energy.logsLow | Logs usually run low; your weight is the better guide. |
| report.energy.careTeam | The target is the number your care team gave you. |
| report.energy.target | Target |
| report.energy.chart | Energy by day against the target of {target} kcal |
| report.groups.getEnough | Get enough |
| report.groups.getEnoughHint | Judged on the days you logged |
| report.groups.keepInCheck | Keep in check |
| report.groups.amountsOnly | Amounts only |
| report.groups.sugarNote | Total sugars include the sugars in fruit and milk, and no authority sets a limit for them. |
| report.line.noFigure | No figure |
| report.line.loggedSoFar | Logged so far |
| report.line.atLeast | at least {value} |
| report.line.perDay | a day |
| report.line.target | target {value} |
| report.line.yourTarget | your target {value} |
| report.line.careTeamTarget | care-team target {value} |
| report.line.limit | limit {value} |
| report.line.reference | reference {value} |
| report.line.average | average requirement {value} |
| report.line.range | usual range {low} to {high} |
| report.line.noReference | no reference |
| report.line.daysMet | {k} of {n} days |
| report.line.daysWithin | within it on {k} of {n} days |
| report.line.percent | {pct}% |
| report.line.percentOf | of reference |
| report.line.shareOfEnergy | {pct}% of energy |
| report.line.notEnough | Not enough data: foods with a value cover {pct}% of what you logged. |
| report.line.partial | Some foods have no value, so this is a minimum. |
| report.line.a11y | {name}, {value} a day |
| report.assessment.onTarget | On target |
| report.assessment.withinLimit | Within the limit |
| report.assessment.nearTarget | Near your target |
| report.assessment.aLittleLow | A little low |
| report.assessment.belowTarget | Below target |
| report.assessment.belowYourTarget | Below your target |
| report.assessment.aboveLimit | Above the limit |
| report.assessment.aboveYourTarget | Above your target |
| report.assessment.wellAbove | Well above the limit |
| report.assessment.inRange | In the usual range |
| report.assessment.aboveRange | Above the usual range |
| report.assessment.belowRange | Below the usual range |
| report.assessment.notEnough | Not enough data |
| report.assessment.someMissing | Some foods have no value |
| report.assessment.amountOnly | Amount only |
| report.kindHint.limit | A limit: stay at or under |
| report.kindHint.range | A usual range, as a share of energy |
| report.kindHint.energy | An estimate, not a target to hit |
| report.kindHint.amount | No reference: shown, not judged |
| report.kindHint.minimum | A reference: aim to reach at least |
| report.weight.title | Weight |
| report.weight.latest | {kg} kg |
| report.weight.trend | Trend {kg} kg |
| report.weight.noTrend | The trend smooths out one day's water, so a single weigh-in barely moves it. |
| report.weight.rateDown | The trend is falling by about {rate} kg a week. |
| report.weight.rateUp | The trend is rising by about {rate} kg a week. |
| report.weight.rateFlat | The trend is steady. |
| report.weight.rateSoon | A weekly rate appears after three weeks of weigh-ins. |
| report.weight.noise | Weight moves up and down by about {noise} kg from day to day, so the trend is the better guide. |
| report.weight.plan | Over {w} weeks your trend weight changed {d} kg. Your plan expects a change of about {low} to {high} kg. |
| report.weight.chart | Weight trend, from {from} to {to} |
| report.weight.add | Add a weigh-in |
| report.weight.empty | No weigh-ins yet. Add one to see your trend. |
| report.weight.history | Last weeks |
| report.weight.weighIns | {n} weigh-ins |
| report.weight.weighInsOne | 1 weigh-in |
| report.weighIn.title | Add a weigh-in |
| report.weighIn.lead | Your best estimate is fine. A weigh-in only moves your targets when it differs from the weight they used by 3% or 2 kg, whichever is more. |
| report.weighIn.weight | Weight |
| report.weighIn.kg | kg |
| report.weighIn.lb | lb |
| report.weighIn.st | st + lb |
| report.weighIn.stones | Stones |
| report.weighIn.pounds | Pounds |
| report.weighIn.save | Save weigh-in |
| report.weighIn.saving | Saving… |
| report.weighIn.check | Please check the weight. |
| report.weighIn.largeTitle | Is that right? |
| report.weighIn.largeBody | That is quite different from the day before. |
| report.weighIn.yes | Yes, save it |
| report.weighIn.saved | Weigh-in saved. |
| report.weighIn.changed | Your targets were updated. |
| report.weighIn.because | because your weight changed |
| report.weighIn.calories | Calories {from} to {to} |
| report.weighIn.protein | Protein {from} g to {to} g |
| report.weighPrompt.title | Update your weight? |
| report.weighPrompt.body | It has been a while since your last weigh-in. Skip it if you like: nothing changes if you do. |
| report.weighPrompt.action | Update |
| report.weighPrompt.dismiss | Not now |
| report.calibration.title | Experimental |
| report.calibration.lead | Your logs and your weight trend over the last four weeks suggest you may use about {kcal} kcal a day, give or take {unc}. Your targets use {current}. |
| report.calibration.logsLow | Logs usually run low, so the real figure is probably higher. |
| report.calibration.notApplied | This is a rough, unproven estimate, so nothing was changed. |
| report.fourWeek.title | Vitamins over four weeks |
| report.fourWeek.hint | These vary a lot from day to day, so they are judged over four weeks, not one. |
| report.fourWeek.window | Last four weeks |
| report.fourWeek.notEnough | Not enough logged days in the last four weeks to compare. |
| report.fourWeek.open | Four-week view |
| report.score.title | Nutrient mix |
| report.score.about | about {n} |
| report.score.atLeast | at least {n} |
| report.score.of | out of 100 |
| report.score.basedOn | Based on {n} of 7 days |
| report.score.explain | How well the mix of what you logged, per calorie, matches your reference intakes. It is a summary of what you logged, not an assessment of your health. |
| report.score.disclaimer | A summary of the foods you logged against reference intakes. It is not a measure of your health. |
| report.score.notMeasured | It does not measure how much you ate: the energy card and the amounts above do that. It does not predict anything about your health. |
| report.score.higher | Higher than your last four weeks |
| report.score.lower | Lower than your last four weeks |
| report.score.same | About the same as your last four weeks |
| report.score.range | Leaving out any one day, it would be between {low} and {high}. |
| report.score.exact | Exactly {value} out of 100, from {points} of {outOf} points. |
| report.score.parts | What it is made of |
| report.score.part | {points} of {outOf} |
| report.score.unknownPart | Not enough data |
| report.score.partCoverage | foods with a value cover {pct}% |
| report.score.unknownNote | The parts without enough data earn nothing, so this is a minimum. Filling in food values raises it. |
| report.score.names.protein | Protein |
| report.score.names.fibre | Fibre |
| report.score.names.potassium | Potassium |
| report.score.names.calcium | Calcium |
| report.score.names.iron | Iron |
| report.score.names.magnesium | Magnesium |
| report.score.names.zinc | Zinc |
| report.score.names.sodium | Sodium |
| report.score.names.saturated_fat | Saturated fat |
| report.score.names.added_sugars | Added sugars |
| report.score.history | Last eight weeks |
| report.score.historyGap | a week with fewer than 3 logged days is left blank |
| report.score.withheld.off | The score is turned off. |
| report.score.withheld.few_days | Not enough days to give a score yet. |
| report.score.withheld.unknown_foods | No score yet: some foods are still unknown. Open Pending to sort that out. |
| report.score.withheld.incomplete_days | No score yet: some days look incomplete. |
| report.score.withheld.thin_data | Not enough nutrient data to score. It fills in as the foods you eat most get their values. |
| report.score.withheld.low_intake | No score is shown next to a very low logged intake. |
| report.score.withheld.generic | A score needs personal targets. |
| report.score.withheld.reference_only | No score is shown without personal targets. |
| report.score.withheld.numbers_hidden | Numbers are hidden. |
| report.score.open | See the parts |
| report.score.close | Close |
| report.detail.subtitleWeek | This week |
| report.detail.subtitleFour | Last four weeks |
| report.detail.average | Average per logged day |
| report.detail.averageLeast | At least, per logged day |
| report.detail.basedOn | based on {n} days |
| report.detail.basedOnOne | based on 1 day |
| report.detail.daily | This week, day by day |
| report.detail.leftOut | left out |
| report.detail.highest | Highest day |
| report.detail.lowest | Lowest day |
| report.detail.daysMet | Met the target on {k} of {n} days |
| report.detail.daysWithin | Within the limit on {k} of {n} days |
| report.detail.sources | Top sources this week |
| report.detail.sourcesNone | No logged food has a value for this yet. |
| report.detail.how | How this target is calculated |
| report.detail.data | Data |
| report.detail.dataAll | Every food you logged has a value for this. |
| report.detail.dataSome | Foods with a value cover {pct}% of what you logged. |
| report.detail.setTarget | Set target |
| report.detail.setReference | Set reference |
| report.detail.history | Last eight weeks, as a share of the target |
| report.detail.compared | Compared with earlier weeks |
| report.detail.trendHigher | Higher than your last {weeks} weeks, which averaged {previous} a day. |
| report.detail.trendLower | Lower than your last {weeks} weeks, which averaged {previous} a day. |
| report.detail.trendSame | About the same as your last {weeks} weeks ({previous} a day). |
| report.detail.reference | General reference |
| report.detail.yourTarget | Your target |
| report.detail.careTeam | From your care team |
| report.detail.recommended | Recommended |
| report.sentence.fewDays | {n} logged days so far. A week needs at least {min} to be compared with a reference. |
| report.sentence.fewDaysOne | 1 logged day so far. A week needs at least {min} to be compared with a reference. |
| report.sentence.meetsLimit | {name} averaged {least}{mean} a day, within {ref}. |
| report.sentence.meetsMinimum | {name} averaged {least}{mean} a day, in line with {ref}. |
| report.sentence.close | {name} averaged {mean} a day, a little under {ref}. |
| report.sentence.below | {name} averaged {mean} a day, below {ref}. |
| report.sentence.over | {name} averaged {least}{mean} a day, above {ref}. |
| report.sentence.wellOver | {name} averaged {least}{mean} a day, well above {ref}. |
| report.sentence.inRange | {name} averaged {mean} a day, inside the usual range of {low} to {high}. |
| report.sentence.aboveRange | {name} averaged {least}{mean} a day, above the usual range of {low} to {high}. |
| report.sentence.belowRange | {name} averaged {least}{mean} a day, below the usual range of {low} to {high}. |
| report.sentence.unknownLow | Too few of the foods you logged have a {lower} value to say anything. Adding values to the foods you eat most fixes that. |
| report.sentence.unknownSome | Some foods have no {lower} value, so {mean} a day is a minimum and the week cannot be called low. |
| report.sentence.amount | {name} is shown, not judged: no authority sets a reference for it. |
| report.sentence.fourWeeks | {name} varies a lot from day to day, so it is judged over four weeks, not one. |
| report.sentence.noReference | No reference is set for {lower}. Set one to compare. |
| report.sentence.energyReference | Calories are compared with a general reference only. Make your targets personal to see how the week compares. |
| report.sentence.noFigure | No logged day has a {lower} value, so there is no figure for it. |
| report.sentence.refGeneric | the general reference of {value} |
| report.sentence.refTarget | your target of {value} |
| report.sentence.refCareTeam | your care-team target of {value} |
| report.sentence.refLimit | the limit of {value} |
| report.sentence.refYourLimit | your limit of {value} |
| report.sentence.refAverage | the average requirement of {value} |
| report.all.title | All nutrients |
| report.all.subtitle | Averages over the days you logged |
| report.all.search | Search vitamins, minerals, macros… |
| report.all.filters.all | All |
| report.all.filters.onTarget | On target |
| report.all.filters.worthALook | Worth a look |
| report.all.filters.notJudged | Not judged |
| report.all.count | {n} nutrients |
| report.all.countOne | 1 nutrient |
| report.all.amount | Amount |
| report.all.percent | % |
| report.all.noMatches | No matches |
| report.all.tryAnother | Try a different search. |
| report.all.emptyGroup | Nothing in this group for the week. |
| report.all.loading | Loading nutrients… |
| report.all.groups.energy_and_macros | Energy and macros |
| report.all.groups.get_enough | Get enough |
| report.all.groups.keep_in_check | Keep in check |
| report.all.groups.vitamins_and_minerals | Vitamins and minerals |
| report.all.link | All nutrients |
| report.all.linkHint | Every nutrient, day by day |
| report.all.targetsLink | Your targets |
| report.all.targetsHint | And how we calculate them |
| report.all.goalsLink | Daily targets |
| report.all.goalsHint | Set the numbers the reports compare against |
| report.all.note | Logged amounts usually run a little low. |

### day

| Key | Text |
|---|---|
| day.mark | Mark this day |
| day.marked.complete | Marked complete |
| day.marked.partial | Marked incomplete |
| day.marked.skip | Left out |
| day.sheet.title | Mark this day |
| day.sheet.lead | This only changes how the day counts in your weekly figures. Nothing is deleted. |
| day.sheet.complete | It is complete |
| day.sheet.completeHint | Count this day, even if it has little or nothing logged. |
| day.sheet.partial | It looks incomplete |
| day.sheet.partialHint | Leave it out of the weekly figures until you add what is missing. |
| day.sheet.skip | Leave this day out |
| day.sheet.skipHint | Illness, travel, a festival, or a day you do not want counted. |
| day.sheet.clear | Clear the mark |
| day.sheet.current | Current mark |
| day.open | Open the day |
| day.incomplete.title | This day looks incomplete |
| day.incomplete.low | About {kcal} kcal is logged, so it is left out of your weekly figures. Is that everything you ate? |
| day.incomplete.marked | You marked this day incomplete. It is left out of your weekly figures until you add what is missing. |
| day.incomplete.complete | It is complete |
| day.incomplete.leaveOut | Leave this day out |
| day.incomplete.clear | Clear the mark |

### item

| Key | Text |
|---|---|
| item.weight | about {value} {unit} |
| item.check | Check the amount |
| item.checkHint.large_energy | More energy than one dish usually has. A misheard amount? |
| item.checkHint.many_servings | More helpings than usual. A misheard amount? |
| item.checkHint.large_weight | A lot for one item. A misheard amount? |

### food

| Key | Text |
|---|---|
| food.issues.sugar_over_carbs | Sugars ({sugar} g) are more than carbohydrate ({carbs} g). Sugars are part of carbohydrate. |
| food.issues.fibre_over_carbs | Fibre ({fiber} g) is more than carbohydrate ({carbs} g). Fibre is part of carbohydrate. |
| food.issues.sat_fat_over_fat | Saturated fat ({saturatedFat} g) is more than total fat ({fat} g). |
| food.issues.added_over_sugar | Added sugars ({addedSugar} g) are more than total sugars ({sugar} g). |
| food.issues.macros_over_100g | Protein, carbohydrate and fat add up to {total} g in {base}, which cannot be much more than 100 g. |
| food.issues.calories_over_900 | {calories} kcal in {base} is more than pure fat has, about 900. Please check the number. |
| food.issues.sodium_over_40000 | {sodium} mg of sodium in {base} is more than pure salt has, about 39,000. Please check the number. |
| food.issues.calories_vs_macros | Protein, carbohydrate and fat suggest about {expected} kcal, but the calories say {calories}. Labels can differ a little. Please check the calories. |
| food.issues.serving_calories_high | {calories} kcal in one {base} is a lot. Is that right? |
| food.issues.serving_sodium_high | {sodium} mg of sodium in one {base} is a lot. Is that right? |
| food.issues.serving_nutrient_high | {nutrient}: {value} {nutrientUnit} in one {base} is more than ten times the daily reference of {reference} {nutrientUnit}. Is that right? |
| food.issues.unit_weight_implausible | One {unit} comes to {amount} g (or ml) here. Is that right? |
| food.issues.raw_serving_unit | These numbers are for raw or dry food, but a {unit} is usually measured cooked. Enter the raw amount that goes into one {unit}, or add the cooked dish as a food of its own. |
| food.issues.all_empty | Every value is empty, so this food will count as 0 calories and 0 of everything. Is that right? |
| food.issues.calories_empty | Calories are 0, but protein, carbohydrate and fat suggest about {expected} kcal. Please check the calories. |
| food.checkTitle | Please check before saving |
| food.refused | These numbers cannot all be true, so the food was not saved. |
| food.saveAnyway | Save anyway |
| food.saveAnywayTitle | Save with these warnings? |
| food.saveAnywayBody | Values you save are shared with everyone and fix all past and future logs of this food. |
| food.fixFirst | Fix the numbers that cannot be true to save. |
| food.form.title | The numbers are for the food |
| food.form.hint | Cooked rice has about a third of the energy of dry rice, gram for gram. Logs are of food as eaten. |
| food.form.as_eaten | As eaten |
| food.form.raw | Raw or dry, before cooking |
| food.form.unsure | Not sure |
| food.form.label.as_eaten | As eaten |
| food.form.label.raw | Raw or dry |
| food.conversion.inGrams | 1 {unit} = {amount} {measure} |
| food.conversion.rawNote | This food's numbers are for it raw or dry. A {unit} is usually measured cooked, so enter how much raw food goes into one {unit}. |
| food.source.title | Where do these numbers come from? |
| food.source.hint | It helps people tell a label from a guess. |
| food.source.label | A pack label |
| food.source.database | A food database |
| food.source.recipe | A recipe I worked out |
| food.source.estimate | A guess |
| food.source.unsure | Not sure |
| food.source.reviewed | Numbers last saved {date} |
| food.source.none | No source recorded |
| food.gaps.title | Foods with gaps |
| food.gaps.intro | Foods you ate in the last four weeks that are missing values the weekly view uses. Filling these in, starting at the top, lets more of your week count. |
| food.gaps.share | {pct}% of what you logged |
| food.gaps.missing | Missing: {list} |
| food.gaps.complete | {pct}% of the energy you logged is from foods that have every value. |
| food.gaps.empty | Every food you logged has the values the weekly view needs. |
| food.gaps.action | Fill in values |
| food.gaps.loading | Looking at what you logged… |
| food.gaps.eaten | logged {n} times |
| food.gaps.eatenOne | logged once |

### foodEntry

| Key | Text |
|---|---|
| foodEntry.modes.manual | Enter manually |
| foodEntry.modes.paste | Paste data |
| foodEntry.saveAndLog | Add food and log it |
| foodEntry.fields.title | Nutrients per {base} |
| foodEntry.fields.titleNoBase | Nutrients |
| foodEntry.fields.hint | Fill in what you know. A field left empty is saved as 0. |
| foodEntry.fields.hintEdit | Fill in what you know. A field left empty is saved as 0, except the ones marked Unknown: nobody has given those a value, and they stay unknown until you do. |
| foodEntry.fields.unknown | Unknown |
| foodEntry.fields.filled | {n} of {total} filled |
| foodEntry.fields.placeholder | 0 |
| foodEntry.fields.groups.label | On a pack label |
| foodEntry.fields.groups.minerals | Minerals |
| foodEntry.fields.groups.vitamins | Vitamins |
| foodEntry.fields.groups.other | Other |
| foodEntry.errors.number | Enter a number |
| foodEntry.errors.tooLarge | The most allowed is {max} |
| foodEntry.paste.copyTitle | Get the data from an assistant |
| foodEntry.paste.copyBody | Copy the prompt, paste it into ChatGPT, Gemini, Claude or any assistant, and tell it which food. It answers in the format this app reads. |
| foodEntry.paste.copy | Copy prompt |
| foodEntry.paste.copied | Prompt copied |
| foodEntry.paste.copyError | Could not copy the prompt. Show it, then press and hold the text to copy it. |
| foodEntry.paste.showPrompt | Show the prompt |
| foodEntry.paste.hidePrompt | Hide the prompt |
| foodEntry.paste.pasteTitle | Paste its answer |
| foodEntry.paste.pasteBody | Paste the whole reply. The form fills in, and you check the numbers before saving. |
| foodEntry.paste.placeholder | Paste the assistant's reply here |
| foodEntry.paste.fromClipboard | Paste from clipboard |
| foodEntry.paste.noClipboard | There is nothing on the clipboard to paste. |
| foodEntry.paste.fill | Fill in the form |
| foodEntry.paste.clear | Clear |
| foodEntry.paste.problems | This could not be read |
| foodEntry.paste.problemsMore | {n} more problems are not shown. |
| foodEntry.paste.problemsHint | Fix them in the box, or ask the assistant to answer again with the prompt. |
| foodEntry.paste.skipped | Left out, because this app does not track them: {list}. |
| foodEntry.paste.filledOne | Filled in 1 value from the pasted data. Check it below, then save. |
| foodEntry.paste.filled | Filled in {n} values from the pasted data. Check them below, then save. |
| foodEntry.paste.nameKept | The data is for "{pasted}", but the name stays "{name}". |
| foodEntry.dataIssues.empty | Nothing has been pasted yet. |
| foodEntry.dataIssues.no_data | No nutrition data was found. Copy the assistant's whole reply, starting at the opening { of the data. |
| foodEntry.dataIssues.syntax | The data is cut off or has a typing slip on line {line}, near "{near}": expected {expected}. Ask the assistant to answer again, or fix that spot. |
| foodEntry.dataIssues.several | The data holds {count} foods. Paste one food at a time. |
| foodEntry.dataIssues.bad_number | "{field}" should be a number, but it says "{value}". |
| foodEntry.dataIssues.negative | "{field}" cannot be below 0, but it says {value}. |
| foodEntry.dataIssues.too_large | "{field}" is too large ({value}). The most allowed is {max}. |
| foodEntry.dataIssues.wrong_unit | "{field}" is in a different unit than the app reads. Use {expected} instead. |
| foodEntry.dataIssues.bad_per | "per" says "{value}", which the app does not have. It must be one of: {allowed}. |
| foodEntry.dataIssues.bad_form | "form" says "{value}". It must be "as_eaten" or "raw". |
| foodEntry.dataIssues.no_values | No nutrient values were found. Expect fields like {examples}. |
| foodEntry.prompt.intro | Give the nutrition facts of the food named on the last line. Reply with one JSON object, in exactly the format below. |
| foodEntry.prompt.rules.0 | Reply with the JSON object only, in a code block, with no other words. |
| foodEntry.prompt.rules.1 | Every nutrient is a plain number with no unit and no quotes. Use a dot for decimals. |
| foodEntry.prompt.rules.2 | Use 0 for a nutrient the food does not contain or that you do not know. Never write null, text or a range. |
| foodEntry.prompt.rules.3 | Fields ending in _g are in grams, _mg in milligrams and _mcg in micrograms. calories_kcal is in kilocalories. |
| foodEntry.prompt.rules.4 | "form" is "as_eaten" for food as it is eaten (cooked or ready to eat) and "raw" for raw or dry food before cooking. |
| foodEntry.prompt.rules.5 | "source" is always "estimate". |
| foodEntry.prompt.perAny | "per" is the amount of food all the numbers are for. It must be exactly one of: {list}. |
| foodEntry.prompt.perFixed | Set "per" to "{unit}" and give every number for that amount of the food. |
| foodEntry.prompt.formatLead | Use exactly these fields: |
| foodEntry.prompt.exampleName | the name of the food |
| foodEntry.prompt.examplePer | one of the per values above |
| foodEntry.prompt.foodLabel | Food: |
| foodEntry.prompt.foodPlaceholder | write the food and the amount here |

### log

| Key | Text |
|---|---|
| log.title | Log food |
| log.meal | Meal |
| log.mealClear | Tap again to log without a meal |
| log.noMealHint | No meal chosen: these are listed under Other. |
| log.groupOther | Other |
| log.searchPrompt | Search or add a food |
| log.searchLabel | Search foods or add a new one |
| log.usual | Your usual {meal} |
| log.usualAny | Your most logged foods |
| log.common | Common at {meal} |
| log.commonAny | Common foods |
| log.toAdd | To add |
| log.toAddCount | {n} to add |
| log.empty | Nothing here yet. Tap a food above, or search for one. |
| log.noValues | No values yet |
| log.unitNotSetUp | Unit not set up |
| log.loadFailed | Your own foods could not be loaded, so this list may not be yours yet. |
| log.retry | Try again |
| log.addOne | Add 1 item |
| log.addMany | Add {n} items |
| log.addOneTo | Add 1 item to {meal} |
| log.addManyTo | Add {n} items to {meal} |
| log.addNone | Add items |
| log.pickOne | Add at least one food. |
| log.checkAmounts | Check the highlighted amounts. |
| log.quantity | Quantity |
| log.quantityError | Must be above 0 |
| log.decrease | Decrease the amount of {name} |
| log.increase | Increase the amount of {name} |
| log.remove | Remove {name} |
| log.unitOf | Unit for {name}: {unit} |
| log.addedFood | "{name}" is added to your foods and to this list. |
| log.picker.title | Choose a food |
| log.picker.subtitleMeal | For {meal} |
| log.picker.subtitleNone | No meal chosen |
| log.picker.search | Search foods |
| log.picker.also | Also logged by you |
| log.picker.all | All foods |
| log.picker.moreHint | Search to find the rest. |
| log.picker.usually | Usually {amount} |
| log.picker.none | No match for "{query}" |
| log.picker.noneBody | Add it as a new food, and it will be here next time. |
| log.picker.add | Add new food item |
| log.picker.addNamed | Add "{query}" as a new food item |
| log.picker.addHint | Enter its nutrition values, or paste them. |
| log.picker.withoutValues | Log "{query}" without values |
| log.picker.withoutValuesHint | It is saved, and counts once its values are added. |
| log.units.title | Unit |
| log.units.forFood | Set up for this food |
| log.units.all | All units |
| log.units.other | Something else |
| log.units.otherPlaceholder | e.g. ladle, handful |
| log.units.use | Use |

### appearance

| Key | Text |
|---|---|
| appearance.title | Appearance |
| appearance.hint | System follows your phone's light or dark setting. |
| appearance.system | System |
| appearance.light | Light |
| appearance.dark | Dark |

### lowPressure

| Key | Text |
|---|---|
| lowPressure.todayTitle | Foods and meals |
| lowPressure.todayBody | Numbers are hidden. You can show them again in Settings. |
| lowPressure.reportTitle | This week |
| lowPressure.reportBody | Numbers are hidden. Here is what stood out. |
| lowPressure.nothing | Nothing stood out this week. |
| lowPressure.basedOn | Based on the days you logged. |
| lowPressure.energyHidden | Energy and amounts are hidden. |
| lowPressure.insights.low_intake | On several days you logged very little. If that is what you ate, a doctor or dietitian can help you eat enough. If meals are missing, adding them gives a better picture. |
| lowPressure.insights.underweight | A doctor or dietitian can help you find a healthy weight and plan. |
| lowPressure.insights.rapid_loss | Your weight has been dropping quickly. Slowing down is usually safer; a doctor or dietitian can advise. |
| lowPressure.insights.few_days | You logged only a few days. A summary needs more. |
| lowPressure.insights.incomplete_days | Some days look incomplete. Is that everything you ate? |
| lowPressure.insights.pending_items | Some items are waiting for food values and are not counted. |
| lowPressure.insights.partial_data | Some foods have no value for a nutrient, so this is a minimum. |
| lowPressure.insights.fibre_low | Fibre was on the low side this week. |
| lowPressure.insights.sodium_over | Sodium was above the usual limit this week. |
| lowPressure.insights.check_amounts | Some amounts look unusual. Worth a check? |
| lowPressure.dayIncomplete | Very little is logged, so it is left out of your weekly figures. Is that everything you ate? |

## 6. What is stored, and who can read it (plan 8.3)

| Data | Where | Needs the profile's secret to read | Leaves our system |
|---|---|---|---|
| Name, time zone, call time, Vapi public key | D1 users | No (shared token), unless REQUIRE_SECRET | Name and local time go to Vapi in the call prompt |
| Food log and day marks | D1 log_items, day_status | No, unless REQUIRE_SECRET | Up to 30 of today's items go into the call prompt |
| Call transcripts (emptied after 30 days) | D1 calls | No, unless REQUIRE_SECRET | No |
| Health profile, weigh-ins, target sets | D1 health_profiles, weight_entries, target_sets | Yes | No |
| Care-team numbers | D1 user_goals (origin care_team) | Yes (hidden and untouchable without it) | No |
| The weekly report | Computed on request, never stored | Yes, for any profile with a secret | No |
| Safety-check answers | Nowhere (used once) | - | No |
| The secret itself | Phone Keychain/Keystore; SHA-256 in D1 | - | No |

