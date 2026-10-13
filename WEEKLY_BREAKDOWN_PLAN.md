# Personalised targets and an evidence-based weekly breakdown

**Status:** written 2026-10-12 as a proposal; **implemented the same day** (Phases 0 to 6) with every decision in section 12 taken as recommended, because none was answered; a second round on 2026-10-13 put the averages and what is missing ahead of the score (the Nutrient mix is now off unless the deployment sets `NUTRIENT_SCORE`), split the engine into `targets/`, `intake/`, `quality/` and `report/`, added raw-or-as-eaten foods and amount checks, closed the findings of an independent security review, and finished the device pass. What is built, how to run it and what is still not done are in the README (*Personal targets, the weekly report and privacy*) and [REMAINING_WORK.md](REMAINING_WORK.md). Not done, and not something code can do: the dietitian, eating-disorder-expertise and privacy/legal reviews (8.7, 11.7; [docs/REVIEW_PACKET.md](docs/REVIEW_PACKET.md) is prepared for them), a second person re-deriving every reference table, and the Hindi strings (Q23). The Python reference implementations of Appendices E and F are kept as test fixtures in `worker/test/reference/` and the engine is checked against them (and, for the India set, against an extended copy).
**Scope:** research, a review of the current code, and a phased implementation plan for the weekly breakdown, goal setting and scoring.
**Where to look:** plain-language product decisions are collected in section 12; engineering detail is in sections 4, 5, 7, 9 and 11.

## Contents

- [1. Research findings](#1-research-findings)
- [2. Problems with the current weekly breakdown](#2-problems-with-the-current-weekly-breakdown)
- [3. Recommended user profile and onboarding fields](#3-recommended-user-profile-and-onboarding-fields)
- [4. Proposed formulas and calculation methods](#4-proposed-formulas-and-calculation-methods)
- [5. Redesigned weekly breakdown and scoring model](#5-redesigned-weekly-breakdown-and-scoring-model)
- [6. How goals should be personalised](#6-how-goals-should-be-personalised)
- [7. Handling of missing, incomplete or unreliable data](#7-handling-of-missing-incomplete-or-unreliable-data)
- [8. Safety, privacy and medical disclaimers](#8-safety-privacy-and-medical-disclaimers)
- [9. Required database, API and UI changes](#9-required-database-api-and-ui-changes)
- [10. Phased implementation plan](#10-phased-implementation-plan)
- [11. Testing and validation requirements](#11-testing-and-validation-requirements)
- [12. Open questions and decisions needed before implementation](#12-open-questions-and-decisions-needed-before-implementation)
- [Appendix A. Sources](#appendix-a-sources)
- [Appendix B. Reference intakes used by the engine](#appendix-b-reference-intakes-used-by-the-engine)
- [Appendix C. Example requests and responses](#appendix-c-example-requests-and-responses)
- [Appendix D. Glossary](#appendix-d-glossary)
- [Appendix E. Reference implementation of the targets engine](#appendix-e-reference-implementation-of-the-targets-engine)
- [Appendix F. Reference implementation of the weekly report](#appendix-f-reference-implementation-of-the-weekly-report)

## Summary

### The problem

The weekly breakdown grades everyone against one fixed diet (2,500 kcal, 180 g protein, 250 g carbs), treats days nobody logged as days nobody ate, counts a nutrient nobody entered as zero, and averages the result into a letter grade. Running the app's real code on synthetic weeks (section 2.2) shows how far that is from meaningful:

- A week with **nothing logged** and a week eaten **perfectly but logged on only four days** both score **50, "D / Needs attention"**.
- A week at **174% of the sodium limit and 225% of the sugar limit** scores **80, "A- / Strong week"**.
- A **sedentary 55-year-old woman eating a sensible 1,800 kcal diet** scores **67, "C"**, because she is graded against a diet that was never hers.
- A **1,000 kcal-a-day crash diet** scores the same as an empty week. Nothing notices it.
- A week where Monday and Tuesday were perfect shows **"D" on Wednesday morning**, because today counts as a full day of goals.

### What this plan proposes

1. **A short, skippable health profile** (birth year, sex used for calculations, height, weight, activity level, goal and pace, eating pattern) behind a safety check. No gender, no diagnoses, no free text, and the safety answers are never stored (section 3).
2. **A deterministic targets engine** in the Worker (no AI, as PLAN.md requires): the 2023 US National Academies energy equation shown as a range and cross-checked, a goal adjustment with safety floors and caps, protein per kilogram, fibre per 1,000 kcal, sodium and potassium, and vitamin and mineral reference intakes by age and sex. Every number is tagged **R** (reference value), **E** (estimate), **G** (guidance) or **A** (assumption), and links to its source (sections 1 and 4).
3. **Eligibility gates** so the app never sets a calorie or weight target for someone under 19, pregnant or breastfeeding, with an eating-disorder history, on a clinician's diet, or severely underweight or overweight; weight loss is not offered at a healthy BMI or to older adults without obesity; and a **low-pressure mode** hides numbers (section 8).
4. **A weekly report built around data quality** (sections 5 and 7): how many days count, how sure we are, **unknown is never zero**, and a partial total is a *lower bound* (it can prove "over a limit" or "target met", never "under" or "within").
5. **Insights before scores**: up to three plain sentences, nutrient groups ("Get enough", "Keep in check"), top food sources, a four-week view for the vitamins that vary too much to judge in a week, and 8-week trends. No letter grades, no moral words, no red for eating less.
6. **A transparent score, only when the data supports it**: a density-based "Nutrient mix" (protein, fibre, potassium, four minerals and sodium; saturated fat and added sugars in Phase 4), each part tied to a published standard. Unknown parts earn nothing, so the score can never rise because data is missing; it reads "at least N" when something is unknown and is withheld on thin data or a low-intake week. A prototype of the model found and fixed seven flaws before any code was written (5.9). **Expect it to be absent for a while**, until the foods people eat most have mineral and sodium values.
7. **Privacy that matches the new data**: the "friends-only, non-sensitive" assumption in the README and PLAN.md stops being true once body measurements are stored. A per-profile secret, export, erase (no profile-delete exists today), and a test that keeps health data out of the voice assistant (section 8.3).
8. **Seven phases, about 26 to 39 working days**, starting with a one-to-two-day Phase 0 that fixes the worst behaviour without any new data (section 10).

### What this plan deliberately does not do

No AI or LLM calls. No diagnosis, treatment or condition-specific advice. No food recommendations. No supplement tracking. No targets for pregnancy, breastfeeding, or anyone under 19. No change to the voice assistant, which never discusses nutrition and never needs health data. No claim that the score predicts health.

### What I need from you

The decisions in section 12 are written with a recommendation each. These six matter most:

| ID | Decision | Recommendation |
|---|---|---|
| Q1 | Keep a score at all? | A decomposed one ("Nutrient mix"), hideable, shown only with enough data |
| Q2 | Which reference standard for your users (NASEM or ICMR-NIN)? | The profile chooses; NASEM first, ICMR-NIN in Phase 6 (iron, zinc and B12 judged against the EAR there) |
| Q3 | Energy equation | NASEM 2023 shown as a range, with Mifflin-St Jeor as a cross-check |
| Q14 | Add saturated fat, added sugars, B12 and folate to foods, and how to fill them in | Add the four; people enter them from labels; no bulk copy of the Indian food tables without permission |
| Q16 | Where health data lives | Server, behind a per-profile secret, minimal fields |
| Q18 | Professional review before wider release | A dietitian, an eating-disorder-aware reader and a privacy/legal reader |

### How to read this document

| If you want... | Read |
|---|---|
| The evidence, with links | 1, Appendix A |
| What is wrong today, with proof | 2 |
| What to ask people | 3 |
| The formulas | 4, Appendix B and E |
| The new weekly screen and score | 5, Appendix C and F |
| Goals, overrides and check-ins | 6 |
| How missing data is handled | 7 |
| Safety, privacy, regulation | 8 |
| What it costs to build | 9, 10 |
| How it is tested | 11 |
| What to decide | 12 |

**Evidence tags used throughout.** **[R]** a reference value or formal recommendation from a standards body (for example the US National Academies, WHO). **[E]** an estimate from a validated prediction equation or model with known error. **[G]** guidance: a professional-society position or a meta-analysis, evidence-informed but not a formal standard. **[A]** an assumption: a design choice in this plan that no standard dictates. Where the app shows a number to a user, the tag travels with it.

**Not medical or legal advice.** This is a product and engineering plan. Sections 8 and 12 list what needs a dietitian's, an eating-disorder-aware reader's and a lawyer's review before anyone outside your circle uses the result.

## 1. Research findings

### 1.0 How the research was done, and how to read it

Seven focused literature reviews ran in parallel (energy equations, weight-change safety, macronutrients, micronutrients and dietary assessment, diet-quality scoring and analytics, safety/privacy/regulation, India-specific standards). Each recorded, for every number, the source, a URL that was actually opened, a short verbatim quote and a flag: **verified** (read in the source itself), **snippet** (seen only in a search result) or **memory** (not checked). I then re-checked a sample myself: the NASEM 2023 equations reproduce NASEM's two published worked examples to the kilocalorie (4.2); the NASEM Appendix J tables were re-extracted from the publisher's page and passed 28 spot checks; the US food-labelling rules quoted in 4.6 and 7.4 (calorie factors, the 20% tolerance, the Daily Values) were read in the regulation itself; the two FDA guidance documents, the text of India's Data Protection Act, the 2020-2025 Dietary Guidelines and four NICE guidelines were read at the source; the Cloudflare retention and limit facts used in 8.3 and 9.1 were read in Cloudflare's documentation; and every PubMed and PubMed Central identifier was matched to its paper in Europe PMC (six identifiers typed from memory during drafting were wrong, and are corrected). Appendix A says exactly what was and was not checked.

- **Sources are primary**: national-academy and WHO/FAO reports, government and professional-society guidelines, regulations and statutes, and peer-reviewed papers. Appendix A lists every source with its link, and what could not be verified.
- **Dates matter.** Several sources are new: NASEM's energy report (2023) replaced the 2005 equations; the US Dietary Guidelines 2025-2030 appeared in January 2026; the FDA's wellness and clinical-decision-support guidances were reissued in January 2026; NICE's obesity guideline NG246 appeared in January 2025; India's DPDP Rules were notified in November 2025. Where something has been superseded, the text says so.
- **Strength of evidence** is named in words in this section (consensus reference value, guideline, position stand, systematic review, single study, expert opinion). The evidence tags **[R] [E] [G] [A]** are used from section 4 on, where a number becomes part of the engine.
- **What the evidence cannot tell us** is stated each time, because a nutrition score built on shaky ground is worse than none.

### 1.1 Energy needs

| Finding | Strength | Source |
|---|---|---|
| The current US/Canada standard for adult energy requirement is one equation per sex and activity category, for ages 19+ and all body sizes, using age, height, weight and activity category. It replaces the 2005 equations ("last updated in 2005"). | Consensus reference | [NASEM 2023, DRI for Energy, ch. 5](https://www.nationalacademies.org/read/26818/chapter/7) (landing page: [NAP](https://nap.nationalacademies.org/catalog/26818/dietary-reference-intakes-for-energy)) |
| The four activity categories are **quartiles of measured activity in a doubly-labelled-water sample** (inactive below PAL 1.53, low active 1.53-1.68, active 1.68-1.85, very active 1.85-2.50), not lifestyle definitions. NASEM: "a valid, reliable tool does not exist to enable accurate classification of an individual's PAL category"; steps and questionnaires correlate weakly. | Consensus reference | [NASEM 2023, ch. 7](https://www.nationalacademies.org/read/26818/chapter/9) |
| **Individual error is large.** Standard error of a predicted value: 342 kcal/day (men), 241 (women); a 95% interval is roughly 670 and 472 kcal/day either side. Typical accuracy against doubly-labelled water is about 60-77% of people within 10%. | Consensus reference; small DLW studies | NASEM 2023 ch. 5; [Korean adults](https://pubmed.ncbi.nlm.nih.gov/28765776/); [Brazilian older adults](https://pubmed.ncbi.nlm.nih.gov/32814851/) |
| The equations "are not designed for" weight loss or gain. NASEM's own starting point for a loss is the estimate minus 1.96 standard errors, followed by monitoring weight and adjusting. | Consensus reference | NASEM 2023 ch. 7 |
| **Mifflin-St Jeor** remains the best-supported resting-metabolic-rate equation: most often within 10% of measured in non-obese and obese adults (82% in a 2013 community sample; 75% in people with obesity); less accurate in athletes. Used here only as a cross-check. | Systematic review; single studies | [Mifflin 1990](https://pubmed.ncbi.nlm.nih.gov/2305711/), [Frankenfield 2005](https://pubmed.ncbi.nlm.nih.gov/15883556/), [2013](https://pubmed.ncbi.nlm.nih.gov/23631843/), [Madden 2016](https://pubmed.ncbi.nlm.nih.gov/26923904/) |
| The popular multipliers (1.2 / 1.375 / 1.55 / 1.725 / 1.9) have **no verifiable origin or validation** that the reviews could find. Applied to Mifflin-St Jeor and mapped to the four NASEM categories, they gave totals 11% to 31% lower (on average 18%) than NASEM's own equation for the thirteen personalised personas of section 4.8 (reproducible with Appendix E). | Absence of evidence in the literature; computed here | Appendix A.4; section 4.8 |
| Doubly-labelled-water data show adult energy expenditure is stable from 20 to 60 and falls about 0.7% a year after 60, once body composition is accounted for. | Single large study | [Pontzer 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8370708/) |
| **India is not in NASEM's data** (non-high-income countries were excluded). ICMR-NIN 2020 lowered the BMR formula by 10% (men) and 9% (women) and sedentary PAL to 1.40. Small Indian studies found BMR 6-9% below the FAO/WHO/UNU prediction and a PAL of about 1.35 in 19 young urban men, but another found no ethnic difference once lean mass was accounted for. **Contested.** | Consensus reference; small single studies | [ICMR-NIN brief note](https://www.nin.res.in/rdabook/brief_note.pdf), [FAO 2004](https://www.fao.org/4/y5686e/y5686e07.htm), [Sinha 2021](https://pubmed.ncbi.nlm.nih.gov/33099580/), [Soares 1998](https://pubmed.ncbi.nlm.nih.gov/9624224/) |
| **Self-reported intake runs low**: 15-34% below biomarker-measured energy in US adults aged 50-74 (more with obesity); about 25% of US adults are flagged as under-reporters. Goldberg cut-offs have limited power for one person. Cohort practice excludes averages under 500 (women) or 800 (men) and over 3,500 (women) or 4,200 (men) kcal/day. No source supports a 5,000 kcal cut-off. | Biomarker study; large survey; review | [Park 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5972568/), [Murakami 2015](https://pubmed.ncbi.nlm.nih.gov/26299892/), [Black 2000](https://pubmed.ncbi.nlm.nih.gov/11033980/), [Banna 2017](https://www.frontiersin.org/articles/10.3389/fnut.2017.00045/full), [Rhee 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4325679/) |
| Expenditure falls more than weight alone predicts during weight loss: about 80-120 kcal/day at 15% restriction over two years, and 275-500 kcal/day after extreme loss. The size is contested. | RCT; single study; systematic review | [Redman 2018](https://pubmed.ncbi.nlm.nih.gov/29576535/), [Fothergill 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4989512/), [Nunes 2022](https://pubmed.ncbi.nlm.nih.gov/33762040/) |

**What this means for the app.** Use the NASEM 2023 equations; show a **range**, not a point; never present the number as a prescription; describe the activity question honestly (people cannot reliably place themselves); keep Mifflin-St Jeor as a cross-check; expect Indian users to sit toward the lower part of the range and let the weight trend (Phase 5) correct it; treat logged calories as a lower bound on intake.

### 1.2 Weight-change goals, calorie floors, and who should not get self-directed targets

| Finding | Strength | Source |
|---|---|---|
| **Rate of loss**: about 1-2 lb (0.45-0.9 kg) a week (CDC); 5-10% of starting weight in six months (NIDDK and the 2013 AHA/ACC/TOS guideline); NHLBI 2000: deficit of 500-1,000 kcal/day, or 300-500 for people only overweight; NHS: about 600 kcal/day below current intake. **NICE NG246 (2025) gives no numeric deficit or rate.** | Guidelines | [CDC](https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html), [NIDDK](https://www.niddk.nih.gov/health-information/weight-management/choosing-a-safe-successful-weight-loss-program), [NHLBI](https://www.nhlbi.nih.gov/files/docs/guidelines/prctgd_c.pdf), [AHA/ACC/TOS](https://pmc.ncbi.nlm.nih.gov/articles/PMC5819889/), [NHS](https://www.nhs.uk/better-health/lose-weight/calorie-counting/), [NICE](https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet) |
| **There is no universal "never below 1,200 kcal" rule.** AHA/ACC/TOS: diets "usually" 1,200-1,500 kcal/day for women and 1,500-1,800 for men, or a 500/750 kcal or 30% deficit. NICE: 800-1,200 kcal is a "low-energy diet" only within a specialist service; **under 800 is a very-low-calorie diet needing medical supervision** (AHA/ACC/TOS, NHLBI and NICE agree). | Guidelines | same |
| **The "3,500 kcal = 1 lb" rule is wrong mainly because it is static.** In 103 supervised adults it overpredicted loss by 37% (27.6 lb against 20.1 lb); the dynamic model overpredicted by 8%. Hall's rule of thumb: every 100 kJ/day (24 kcal/kg/day) of intake change gives about 1 kg of eventual weight change, half in about a year and 95% in about three. The adult model is fully published. We cannot measure a person's baseline requirement better than about 5% (about 125 kcal/day). | Modelling, validated against trials | [Hall 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/), [Hall and Chow 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3859816/), [Thomas 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC4024447/), [NIDDK Body Weight Planner](https://www.niddk.nih.gov/bwp) |
| **Gaining**: novice and intermediate lifters 10-20% above maintenance for 0.25-0.5% of body weight a week; advanced 5-10%. A 360-480 kcal/day surplus is typical for athletes. For underweight adults the NHS suggests adding 300-500 kcal/day. No systematic review of lean-mass gain rates by training status was found. | Position stand; narrative reviews | [ISSN 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/), [Iraki 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/), [Slater 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6710320/), [NHS](https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/healthy-ways-to-gain-weight/) |
| **BMI cut-offs disagree for South Asians.** WHO: overweight 25, obesity 30; WHO's 2004 Asian consultation kept those and added "action points" at 23 and 27.5; NICE (2025) uses overweight 23-27.4 and obesity 27.5 for South Asian and other listed groups; the Indian expert consensus uses overweight 23-24.9 and obesity 25; the ICMR-NIN guidelines use 23 and 27.5. Waist-to-height ratio 0.5 (increased) and 0.6 (high) works for both sexes and all ethnicities when BMI is under 35. BMI alone should not confirm obesity. | Guidelines; consensus | [NICE](https://www.nice.org.uk/guidance/ng246/chapter/Identifying-and-assessing-overweight-obesity-and-central-adiposity), [WHO 2004](https://pubmed.ncbi.nlm.nih.gov/14726171/), [Misra 2009](https://pubmed.ncbi.nlm.nih.gov/19582986/), [Misra 2025](https://www.cmcendovellore.org/pub/2025/revised-definition-of-obesity-in-asian-indians-living-in-india.pdf), [Rubino 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11870235/) |
| Which weight to use for per-kilogram protein in obesity is **unsettled**: actual, adjusted, or capped at BMI 30. A 2025 joint advisory uses adjusted weight; the reference weights behind the RDA are 70 and 57 kg. | Expert advisory | [Mozaffarian 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12264624/) |
| **Public programmes are stricter than a self-directed app would be.** NHS Digital Weight Management Programme: age 18+, BMI 30+ (27.5+ for some ethnic groups) plus diabetes or hypertension; excludes frailty, pregnancy, an active eating disorder and bariatric surgery within two years. CDC National DPP: 18+, BMI 25+ (23+ for Asian Americans), not pregnant, no diabetes diagnosis. NIDDK's planner is for adults, not pregnancy or breastfeeding. | Programme criteria | [NHS DWMP criteria](https://primarycare.northeastlondon.icb.nhs.uk/wp-content/uploads/2023/12/DWMP-GP-toolkit-Final.pdf), [CDC NDPP](https://www.cdc.gov/diabetes-prevention/eligible-lifestyle-change-program/index.html), NIDDK |
| **Where intentional weight loss needs a clinician**: pregnancy (NICE NG247: not recommended); age 65+ (ESPEN: only in obese older people with weight-related problems, with exercise; a trial found diet-induced loss cost lean mass and hip bone); an eating disorder now or in the past; type 1 diabetes, or type 2 on insulin or sulfonylureas (hypoglycaemia); kidney disease (KDIGO: protein 0.8 g/kg, sodium under 2 g, dietitian); heart failure; cirrhosis; cancer treatment; bariatric surgery. | Guidelines; consensus; RCT | [NICE NG247](https://www.nice.org.uk/guidance/ng247/chapter/Recommendations), [ESPEN 2019](https://pubmed.ncbi.nlm.nih.gov/30005900/), [Villareal 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3114602/), [NICE NG69](https://www.nice.org.uk/guidance/ng69/chapter/Recommendations), [ADA/EASD 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC7011201/), [KDIGO 2024](https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf), [EASL 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6657019/) |
| **Some medicines make nutrient nudges unsafe**: warfarin (keep vitamin K steady), lithium (keep salt and fluid steady), ACE inhibitors, ARBs and potassium-sparing drugs (no potassium salt substitutes without a doctor), GLP-1 medicines (intake falls 16-39%; protein and micronutrient floors matter). | Drug information; expert advisory | [MedlinePlus: warfarin](https://medlineplus.gov/druginfo/meds/a682277.html), [lithium](https://medlineplus.gov/druginfo/meds/a681039.html), [lisinopril](https://medlineplus.gov/druginfo/meds/a692051.html), Mozaffarian 2025 |

**What this means for the app.** Replace the fixed defaults with a bounded, goal-specific energy target; use **floors of 1,200 (women) and 1,500 (men) kcal as the lowest target the app shows**, labelled as the lower edge of the guideline ranges and not as a universal rule, and an absolute wall at 800; replace any "weeks to goal" arithmetic with the dynamic rule of thumb and a range; gate loss and gain goals by BMI, age and the safety check (8.1); treat the medicine interaction as a switch that turns off vitamin K, potassium and sodium verdicts and nudges.

### 1.3 Macronutrients and the nutrients to limit

| Topic | What the standards say | Source |
|---|---|---|
| **US Dietary Guidelines 2025-2030** (January 2026, a 10-page document) | Protein "serving goal" **1.2-1.6 g/kg/day** (its evidence is 30 trials, mostly adults with overweight on calorie restriction; the American Society for Nutrition cautions that what is optimal for one group should not be assumed optimal for all). Saturated fat not above 10% of calories. Sodium under 2,300 mg (age 14+). Added sugars: "no amount" recommended, no more than 10 g in a meal. Alcohol: "consume less" (the numeric limit is gone). **No fibre number.** Full-fat dairy preferred. People with chronic disease should adapt it with a clinician. | [DGA 2025-2030](https://cdn.realfood.gov/DGA.pdf), [Scientific Foundation](https://cdn.realfood.gov/Scientific%20Report_508.pdf), [ASN](https://nutrition.org/new-perspective-in-the-journal-of-nutrition-reviews-protein-recommendations-in-the-2025-2030-dietary-guidelines/) |
| **Protein** | RDA 0.8 g/kg (EAR 0.66; EFSA 0.83). Exercising adults 1.4-2.0 (ISSN); the often-quoted "1.6 plateau" is 1.62 with a 95% interval of 1.03-2.20 and applies to resistance training with supplementation. Older adults at least 1.0-1.2. Kidney disease 0.8, avoiding more than 1.3. **No upper limit exists** for protein or any macronutrient. | [NASEM macronutrients](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients-dietary-reference-intakes-tables-2005.html), [ISSN 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/), [Morton 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867436/), [PROT-AGE](https://pubmed.ncbi.nlm.nih.gov/23867520/), [ESPEN 2014](https://pubmed.ncbi.nlm.nih.gov/24814383/), KDIGO |
| **Carbohydrate and fat** | Acceptable ranges (percent of energy): carbohydrate 45-65, fat 20-35, protein 10-35. Carbohydrate RDA 130 g. WHO 2023 sets **no carbohydrate amount**, only quality (whole grains, vegetables, fruit, pulses) and fibre at least 25 g; total fat at most 30% (conditional, for preventing weight gain, "not an upper value to be achieved"); saturated fat under 10%; trans fat under 1%. Fat floor: 15% of energy, 20% for women of reproductive age (FAO/WHO). No body-weight-based fat minimum exists. | NASEM; [WHO carbohydrate](https://www.who.int/publications/i/item/9789240073593), [WHO fat](https://www.who.int/publications/i/item/9789240073654), [WHO saturated and trans fat](https://www.who.int/publications/i/item/9789240073630), [FAO/WHO 2010](https://www.fao.org/3/i1953e/i1953e.pdf) |
| **Fibre** | NASEM Adequate Intake **14 g per 1,000 kcal** (38 g men and 25 g women aged 19-50; 30 and 21 g from 51). WHO: at least 25 g. DGA 2025-2030: no number. ICMR-NIN: about 30 g per 2,000 kcal. | NASEM; WHO |
| **Sugars** | **No authority limits total sugars.** WHO limits *free* sugars (below 10% of energy, strong; below 5%, conditional) and defines them to **exclude sugars in intact fruit and vegetables and lactose in milk**. AHA 2009: women 100 kcal (about 25 g), men 150 kcal (about 37 g). So the app's "40 g sugar" limit is not standards-based. | [WHO 2015](https://www.who.int/publications/i/item/9789241549028), [AHA 2009](https://pubmed.ncbi.nlm.nih.gov/19704096/) |
| **Sodium and potassium** | Three sodium numbers exist: WHO under 2,000 mg (strong; WHO notes a debate below 2 g); NASEM's Chronic Disease Risk Reduction level 2,300 mg ("the intake above which reduction is expected to reduce chronic disease risk"); NASEM's 1,500 mg is an adequacy value, not a target. Potassium Adequate Intake 3,400 mg (men) and 2,600 mg (women) (2019); WHO 3,510; EFSA 3,500. **The US label Daily Value of 4,700 mg is the superseded 2005 figure.** No upper limit for potassium. | [NASEM 2019](https://nap.nationalacademies.org/read/25353/chapter/1), [WHO sodium](https://www.who.int/news-room/fact-sheets/detail/sodium-reduction), [WHO healthy diet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet) |
| **Diet patterns** | Vegetarian and vegan patterns (Academy position paper, 2025): nutrients of concern are vitamin B12, iodine, iron, choline and vitamin D (plus calcium for vegans). No authority gives a vegetarian-specific macronutrient target. A low-carbohydrate user falls outside the 45-65% range by design. The DASH pattern: fat 27%, saturated fat 6%, protein 18%, carbohydrate 55%, fibre 30 g. | [AND 2025](https://andeal.org/files/files/Vegetarian/VegetarianPP_2025.pdf), [NHLBI DASH](https://www.nhlbi.nih.gov/files/docs/public/heart/new_dash.pdf) |

**What this means for the app.** Derive macronutrient targets from the energy target and body weight instead of fixing grams; make **protein** per kilogram with a defensible default and clamp it to the acceptable range; make **fat a range** and carbohydrate the remainder; set **fibre by calories**; do not grade total sugars; keep **sodium as a limit at 2,300 mg** (2,000 mg available) and potassium as an adequacy target; use the Adequate Intake, not the label Daily Value, for potassium.

### 1.4 Vitamins and minerals, and what a week of intake can say

| Finding | Strength | Source |
|---|---|---|
| The consolidated adult tables (Estimated Average Requirement, Recommended Dietary Allowance or Adequate Intake, Upper Level, by age band and sex) are NASEM's, last updated nutrient by nutrient between 1997 and 2019. No micronutrient update after 2019 was found. The tables are in Appendix B. | Consensus reference | [NASEM, Appendix J of the 2019 sodium and potassium report](https://www.nationalacademies.org/read/25353/chapter/28) |
| **An RDA is not a pass/fail line for one person.** Intake below the RDA but above the EAR "probably needs to be improved"; below the EAR the probability of adequacy is 50% or less; for nutrients with only an Adequate Intake, intake below it supports **no** conclusion. "Dietary intake data alone cannot be used to ascertain an individual's nutritional status." The EAR cut-point is a method for groups. | Consensus reference | [IOM 2000, ch. 3](https://www.nationalacademies.org/read/9956/chapter/8) and [summary](https://www.nationalacademies.org/read/9956/chapter/3) |
| **Several Upper Levels apply only to supplements or fortified foods** (vitamin E, folic acid, niacin, magnesium) or only to preformed vitamin A, not carotenoids. Only calcium, iron, zinc, vitamin C and vitamin D have limits that cover food-sourced intake. | Consensus reference | NASEM Appendix J |
| **Usual intake takes many days to estimate, and day-to-day variation differs enormously by nutrient** (within-person coefficient of variation, US adults): energy 34%, protein 42%, potassium 38%, magnesium 38%, fibre 49-51%, calcium 51-54%, iron 51-53%, zinc 61-63%, vitamin E 76%, vitamin C 87-92%, vitamin A 115-152%, vitamin B12 212-294%. For a 7-day mean (computed from those figures) the 80% error band is about ±16% for energy, ±20% protein, ±25% calcium, ±26% iron, ±30% zinc, ±42% vitamin C, ±74% vitamin A and ±142% vitamin B12. IOM warns its methods are "unreliable" above a coefficient of 60-70%. | Consensus reference; computed | [IOM 2000, ch. 3](https://www.nationalacademies.org/read/9956/chapter/8) and [App. B](https://www.nationalacademies.org/read/9956/chapter/19); [Basiotis 1987](https://pubmed.ncbi.nlm.nih.gov/3655942/); [Nelson 1989](https://pubmed.ncbi.nlm.nih.gov/2750688/) |
| **The first logged day under-reports.** In a validation against doubly-labelled water the first recall reported 1,501 kcal against 2,115 actual. | Single study | [Ma 2009](https://pubmed.ncbi.nlm.nih.gov/19576535/) |
| **Nutrients of public-health concern** (US, 2020-2025): calcium, potassium, fibre, vitamin D (underconsumed); iron in pregnancy. Modelled global inadequate intake from food: iodine 68%, vitamin E 67%, calcium 66%, iron 65%, riboflavin 55%, folate 54%, vitamin C 53%. | Guideline; modelling | [DGA 2020-2025](https://odphp.health.gov/sites/default/files/2026-02/dietary_guidelines_for_americans-2020-2025.pdf), [Passarelli 2024](https://pubmed.ncbi.nlm.nih.gov/39218000/) |
| **Vegetarians**: the National Academies state iron requirements are 1.8 times higher (10% absorption against 18%) and zinc requirements "may be as much as 50 percent greater", without enough data for an algorithm. | Consensus reference | [NASEM 2001 iron](https://www.nationalacademies.org/read/10026/chapter/11), [zinc](https://www.nationalacademies.org/read/10026/chapter/14) |
| **Labels use a different number.** The US Daily Value is one figure for everyone aged 4+ (roughly the highest RDA among groups), so it overstates need for many people: iron 18 mg for all, potassium 4,700 mg. Use sex- and age-specific values for personal targets, the Daily Value only to read labels. | Regulation | [21 CFR 101.9](https://www.govinfo.gov/content/pkg/CFR-2025-title21-vol2/xml/CFR-2025-title21-vol2-sec101-9.xml) |
| **Blank is not zero.** USDA: a missing value "does not indicate a zero value". FAO/INFOODS: "missing values are never assigned a 0 value, unless evidence exists that the value can be presumed zero" and "lead to a bias of nutrient intake estimations". | Official guidance | [USDA FoodData Central](https://fdc.nal.usda.gov/GBFPD_Documentation), [FAO/INFOODS 2012](https://www.fao.org/docrep/017/ap810e/ap810e.pdf) |

**What this means for the app.** Compare intake with the sex- and age-specific value, never the label Daily Value; show intake as a percentage of the reference **with an uncertainty label**, not a pass/fail; **judge from one week only the nutrients that vary little day to day** (protein, fibre, potassium, magnesium, calcium, iron, zinc); give vitamins A, C and E (and, without data, D and K) a **four-week** view; flag Upper Levels only where they cover food; and never add an unknown value as zero.

### 1.5 Diet-quality scores, trends and feedback design

| Finding | Strength | Source |
|---|---|---|
| **The Healthy Eating Index-2020** scores 13 components out of 100 (adequacy 60, moderation 40), almost all as **densities per 1,000 kcal**, with linear scoring between a minimum and a maximum standard. It is the same scoring as HEI-2015. Sodium is 10 points at or below 1.1 g per 1,000 kcal and 0 at 2.0 g or more; added sugars 10 at or below 6.5% of energy and 0 at 26% or more; saturated fat 10 at or below 8% and 0 at 16% or more. No HEI for the 2025-2030 guidelines has been found. | Official scoring | [NCI HEI standards](https://epi.grants.cancer.gov/hei/developing.html), [Shams-White 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10524328/) |
| **HEI cannot be computed from the app's 17 nutrients**: 12 of 13 components need food-group servings, fatty-acid classes or added sugars; only sodium overlaps. Any score here is a new, **unvalidated** construct, and says so. | Inference from the standard | NCI |
| HEI is "independent of quantity" by design, so it cannot flag under-eating, and its method pools nutrient and energy totals over the period before dividing. | Official method; validation paper | [Reedy 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6718954/) |
| **Nutrient-based indices**: Mean Adequacy Ratio (each ratio capped at 1, then averaged) and Mean Probability of Adequacy ignore excess intake; **PANDiet** combines an adequacy sub-score and a moderation sub-score by averaging, and its published ranges depend on the reference values used. None has outcome validation. | Index papers | [Verger 2012](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0042155) |
| **Construction criteria** for such scores: include adequacy and moderation; use intake measures adjusted for energy; prefer normative cut-offs; decompose the composite; test sensitivity to cut-offs, weights and missing-data rules; accompany scores with uncertainty bounds; beware compensation between components and "forgetting that an imputation has been carried out". | Review; handbook | [Burggraf 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6130981/), [OECD/JRC Handbook 2008](https://www.oecd.org/content/dam/oecd/en/publications/reports/2008/08/handbook-on-constructing-composite-indicators-methodology-and-user-guide_g1gh9301/9789264043466-en.pdf) |
| **What is known about outcomes**: in two US cohorts (119,315 adults), the top quintile of HEI-2015 had 19% lower total mortality than the bottom (hazard ratio 0.81), AHEI 0.80, Mediterranean 0.82; a meta-analysis of HEI, AHEI and DASH found risk ratios of about 0.78. **Not known**: whether changing one's score changes outcomes; any evidence a **one-week** score from self-logged app data predicts anything; outcome evidence for a nutrient-only index; Indian validation; the effect of showing a score. | Cohorts; meta-analysis | [Shan 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9857813/), [Schwingshackl 2018](https://pubmed.ncbi.nlm.nih.gov/29111090/) |
| **Self-reports under-record energy, but nutrient densities hold up**: in a biomarker study mean protein and sodium densities from 24-hour recalls and food records were similar to biomarker values, while absolute energy was 15-34% low. This is the argument for density-based scoring of self-logged data. | Biomarker study | [Park 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5972568/) |
| **Weekends differ**: about +82 kcal/day on each of Friday-Sunday against Monday-Thursday in US adults (+115 for ages 19-50). Weight follows: highest Sunday/Monday, lowest Friday, a weekly swing of about 0.35% (0.3 kg). | Single studies | [Haines 2003](https://pubmed.ncbi.nlm.nih.gov/12917498/), [Turicchi 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7192384/), [Orsama 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC5644907/) |
| **Smoothing and calibration**: a daily weight is mostly water; the Hacker's Diet exponentially weighted trend (a 10% step toward each new weight) is the common method but has **no peer-reviewed validation as a trend estimator**. A model that infers *changes* in intake from weights alone was within 40 kcal/day on average of the reference method over two years, with a 215 kcal/day individual error, under supervised conditions. **No validation of app-style "adaptive TDEE" from logged intake plus weight was found.** Illustrative arithmetic: with a typical 0.4 kg uncertainty in a weight change, energy balance is uncertain by about 440 kcal/day over 7 days, 220 over 14 and 110 over 28, before any under-reporting. | Single studies; derived | [Sanghvi 2015](https://pubmed.ncbi.nlm.nih.gov/26040640/), [Racette 2012](https://pubmed.ncbi.nlm.nih.gov/22127229/), [Hacker's Diet](https://www.fourmilab.ch/hackdiet/e4/signalnoise.html) |
| **Feedback design**: self-monitoring is consistently associated with weight loss (the evidence is weak and mostly observational); combining it with another control technique works best. **No good evidence exists on numeric grades, letter grades, feedback frequency or "good versus bad food" framing.** | Systematic reviews; meta-regression | [Burke 2011](https://pubmed.ncbi.nlm.nih.gov/21185970/), [Patel 2021](https://pubmed.ncbi.nlm.nih.gov/33624440/), [Michie 2009](https://pubmed.ncbi.nlm.nih.gov/19916637/) |

**What this means for the app.** Score on **nutrient density, pooled over the assessed days** (HEI and PANDiet lineage), with energy and the safety rules handling quantity; **cap each adequacy ratio at full credit** and score limits separately; show components, never only a total; test the score's sensitivity; make every claim descriptive ("matches your reference intakes") and never predictive; label the figure "average of the days you logged", not "usual intake"; show weekday and weekend separately when there is data; present any energy-need estimate as a range; do not claim the weight-trend method is validated.

### 1.6 India-specific references

| Finding | Source |
|---|---|
| **ICMR-NIN Nutrient Requirements for Indians (2020)** is the national reference. Adults are not age-banded: they are given for a **reference man (65 kg) and woman (55 kg) by activity** (sedentary, moderate, heavy), plus an elderly table. Energy: 2,110 / 2,710 / 3,470 kcal (men) and 1,660 / 2,130 / 2,720 (women), about 32 / 42 / 53 and 30 / 39 / 49 kcal per kg, "to be adjusted for the actual weight and physical activity". Protein 0.83 g/kg (1.0 for low-quality cereal diets). Sodium 2,000 mg; potassium 3,500 mg. | [ICMR-NIN brief note](https://www.nin.res.in/rdabook/brief_note.pdf), [short report](https://drklbcollege.ac.in/wp-content/uploads/2020/03/DOC-20220614-WA0002_-1.pdf) |
| **It differs from NASEM by 20% or more** for several nutrients: iron 19 and 29 mg against 8 and 18; zinc 17 and 13.2 against 11 and 8; riboflavin, B6 and thiamine higher; folate, vitamin E, vitamin K and selenium lower. ICMR gives low absorption from cereal-and-pulse diets as the reason for iron and zinc. **Vitamin A is not comparable** (retinol equivalents with a 6:1 carotene factor against NASEM's 12:1). | same |
| **ICMR-NIN's own model "balanced diets" fall below its allowances**: for a sedentary woman iron 23.8 mg against an RDA of 29; for a sedentary man zinc 13.5 mg against an EAR of 14.1; for vegetarians vitamin B12 1.5 µg against an EAR of 2.0. **A "percent of RDA" grade would under-score typical adequate Indian diets** for iron, zinc and B12. ICMR's documents also disagree on whether individuals should plan to the EAR or the RDA. | same |
| **Dietary Guidelines for Indians (2024)**: added sugar under 5% of energy (20-25 g); salt at most 5 g; total fat up to 30%; cooking oil 20-50 g; plate of 50-55% carbohydrate, 10-15% protein, 20-30% fat; **avoid protein supplements to build muscle**; weight-loss diets not below 1,000 kcal/day, about 0.5 kg a week; BMI normal 18.5-23, overweight over 23-27.5, obese over 27.5; waist over 90 cm (men) and 80 cm (women). | [DGI 2024](https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI_2024.pdf) |
| **A katori is 115, 155, 200 or 360 ml** in the guidelines' own annexure ("1 cup / katori = 200 ml" in one figure). Portion size is therefore uncertain for the unit the app logs most. | DGI 2024, Annexure I |
| **IFCT 2017** (the Indian food composition tables) is a free PDF of 528 raw foods by 151 components, with **no cooked dishes** (no idli, dal or roti rows), blanks meaning "below detectable limit", and a licence that forbids storing or reproducing it electronically "for creating a product" without NIN's written permission. A shared foods table seeded from it would need that permission. | [IFCT 2017](https://nin.res.in/ebooks/IFCT2017.pdf) |
| **FSSAI labels** declare energy, protein, carbohydrate, total and **added sugars**, fats, saturated and trans fat, and **sodium**, and give per-serve percentages against 2,000 kcal, 67 g fat, 22 g saturated fat, 50 g added sugar and 2,000 mg sodium. People can copy added sugar, saturated fat and sodium from Indian packs. | [FSSAI Labelling and Display Regulations, compendium of 9 Sep 2025](https://fssai.gov.in/upload/uploadfiles/files/Comp_Labelling%20Display_Version%20VIII_09_09_2025.pdf) |
| **Who the users are.** 29% of women and 17% of men aged 15-49 never eat fish, chicken or meat; anaemia affects 57% of women and 25% of men; adults aged 20+: diabetes 11.4%, prediabetes 15.3%, hypertension 35.5%, generalised obesity 28.6%; underweight (BMI under 18.5) about 16-19%. Pooled estimates (weak, heterogeneous) put iron, B12 and vitamin D deficiency at more than half of adults. | [NFHS-5](https://dhsprogram.com/pubs/pdf/FR375/FR375.pdf), [ICMR-INDIAB-17](https://pubmed.ncbi.nlm.nih.gov/37301218/), [Venkatesh 2021](https://pubmed.ncbi.nlm.nih.gov/35059191/) |

**What this means for the app.** The Indian reference set is a real, selectable alternative, not a footnote; its iron, zinc and B12 targets cannot be met by ICMR's own model diets, so on that set those nutrients should be judged against the **EAR**, ICMR's own planning guidance; the safety check is justified by Indian disease prevalence; the weekly view should foreground iron, B12, vitamin D, folate, calcium, zinc, protein quality, fibre, sodium and added sugar; the shared foods table cannot be filled from IFCT without permission.

### 1.7 Safety, eating-disorder risk, privacy and regulation

| Topic | Finding | Source |
|---|---|---|
| **Calorie-tracking apps and disordered eating** | Consistent cross-sectional associations: students (N=493), people with an eating disorder (N=105; about 75% used MyFitnessPal and 73% of those felt it contributed), men (N=122; large effect sizes), adults (N=1,357; weight/shape motives go with more reported harm). Two 2025 systematic reviews (27 and 38 studies): causality and direction unknown, not replicated experimentally. One randomised trial (n=200 low-risk women, one month) found no change. **Not established**: causality, long-term effects, which features matter, effects outside Western samples. NICE itself includes clinician-led dietary self-monitoring in eating-disorder treatment: tracking is not inherently harmful; context and supervision matter. | [Simpson 2017](https://pubmed.ncbi.nlm.nih.gov/28214452/), [Levinson 2017](https://pubmed.ncbi.nlm.nih.gov/28843591/), [Linardon 2019](https://pubmed.ncbi.nlm.nih.gov/30772765/), [Messer 2021](https://pubmed.ncbi.nlm.nih.gov/34543856/), [Hahn 2021](https://pubmed.ncbi.nlm.nih.gov/34427188/), [Anderberg 2025](https://pubmed.ncbi.nlm.nih.gov/39671845/), [Moody 2025](https://pubmed.ncbi.nlm.nih.gov/40640999/) |
| **Design cues** | Qualitative work lists fixation on numbers, rigid diet, dependency, "negative" messages and competition as harms, and names colour for good and bad, streaks and logging reminders as risky features; suggests non-numeric tracking, fewer reminders, encouraging breaks. An expert consensus rated weight focus, prescribed plans and calorie monitoring as likely to raise risk, and health focus, flexibility and psychosocial support as likely to lower it. | [Eikey 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8485346/), [Jebeile 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10005214/) |
| **Screening** | Symptom screeners are weak gates: the US task force finds the evidence insufficient for screening people without symptoms; NICE says never use SCOFF as the sole method; SCOFF's pooled sensitivity 0.86 and specificity 0.83 give a positive predictive value of roughly 5-14% at 1-3% prevalence (computed). None of the NHS, CDC or NIDDK programmes uses a symptom screener; they use exclusion statements and "talk to a professional". | [USPSTF 2022](https://pubmed.ncbi.nlm.nih.gov/35289876/), NICE NG69, [Kutz 2020](https://pubmed.ncbi.nlm.nih.gov/31705473/) |
| **Disclaimers** | Required by both app stores, but weak as safety tools: a review of 15 experiments found media disclaimers "ineffective ... and in some cases actually harmful" for body image; none was found for health apps. | [McComb 2020](https://pubmed.ncbi.nlm.nih.gov/31778888/), [Apple guidelines](https://developer.apple.com/app-store/review/guidelines/), [Google Play](https://support.google.com/googleplay/android-developer/answer/16679511) |
| **Sex and gender** | No authoritative guidance exists on which sex value to use for energy or nutrient calculation for trans and non-binary adults; NASEM says the evidence is "lacking". The practical convention: a plainly labelled "sex used for calculations", an optional separate gender item, a manual override, and a statement of what was used. | [NASEM 2022](https://www.nationalacademies.org/read/26424/chapter/2), [NASEM 2023, ch. 9](https://www.nationalacademies.org/read/26818/chapter/11) |
| **Device regulation** | The FDA's General Wellness guidance (6 Jan 2026) treats claims to "promote or maintain a healthy weight, encourage healthy eating, or assist with weight loss goals" as wellness, and its Example 3, software that "monitors and records food consumption to manage dietary activity for weight management", as **not a device**; claims to treat or diagnose obesity or an eating disorder are outside it. Patient-facing recommendations are not exempt as clinical decision support (29 Jan 2026). EU MDR needs a medical purpose; software "intended to alleviate certain eating disorder behaviours" is an example of a medical device. India's CDSCO guidance excludes software "merely intended for general wellness, promoting a healthy lifestyle ... provided it is not intended for any medical purposes". | [FDA wellness](https://www.fda.gov/media/90652/download), [FDA CDS](https://www.fda.gov/media/109618/download), [MDCG 2019-11](https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en?filename=mdcg_2019_11_en.pdf), [CDSCO](https://cdsco.gov.in/opencms/export/sites/CDSCO_WEB/Pdf-documents/Guidance-document-on-Medical-Device-Software-under-MDR-2017.pdf) |
| **Privacy law** | India's DPDP Act 2023 and Rules 2025: notice and consent, security safeguards, breach notification (to the Board within 72 hours), erasure, and for anyone under 18 verifiable parental consent and **no tracking or behavioural monitoring**. Health data is **not** a special category in DPDP. **Its core duties start on 13 May 2027** (18 months after 13 Nov 2025; a shorter timeline was proposed but not confirmed). The US FTC Health Breach Notification Rule covers apps that track "diet" and treats unauthorised disclosure as a breach. GDPR treats health data as special-category and needs explicit consent. | [DPDP Act](https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf), [DPDP Rules](https://egazette.gov.in/WriteReadData/2025/267650.pdf), [FTC rule](https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule), [GDPR](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679) |
| **App stores** | Apple 5.1.2(i): disclose sharing with third parties "including with third-party AI" and get explicit permission (this reaches the Vapi/OpenAI voice feature); 1.4.1: remind users to check with a doctor. Google Play: a mandatory Health apps declaration ("Nutrition and Weight Management" is a category) and a "not a medical device" disclaimer. | Apple, Google |
| **Platform security** | Cloudflare D1 is encrypted at rest and in transit, but Time Travel keeps restorable history for 7 days (Free) or 30 days (Paid), so an erased row clears from backups only after that. A static token compiled into an app is the textbook case OWASP rates Easy to exploit, Easy to detect and Severe in impact; it recommends revocable per-user tokens. Keychain data on iOS can survive an uninstall. | [Cloudflare security](https://developers.cloudflare.com/d1/reference/data-security/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [OWASP M1](https://owasp.github.io/www-project-mobile-top-10/2023-risks/m1-improper-credential-usage.html), [React Native security](https://reactnative.dev/docs/security) |
| **Voice processor** | Vapi records calls and stores logs, transcripts and prompts by default; its privacy policy says recordings, transcripts and logs "may be retained to help train and improve the AI models"; its HIPAA guidance says not to put health information in an assistant prompt; Zero Data Retention is available. Each user here brings their own Vapi account, so retention settings are theirs. | [Vapi privacy](https://vapi.ai/privacy), [data flow](https://docs.vapi.ai/security-and-privacy/data-flow), [HIPAA](https://docs.vapi.ai/security-and-privacy/hipaa), [Zero Data Retention](https://docs.vapi.ai/security-and-privacy/zero-data-retention) |

**What this means for the app.** Build safety into **gates and defaults, not disclaimers**; use one self-declaration question instead of a symptom screener; offer a numbers-off mode and avoid streaks and red for under- or over-eating; keep to general-wellness claims; keep health data out of the voice assistant and say so; put a per-profile secret in front of any body measurement; design now for DPDP even though it is not yet in force; and design out the under-18 case (data of children carries the heaviest obligations).

### 1.8 Where authorities disagree, and what this plan chooses

| Topic | Positions | This plan |
|---|---|---|
| Protein | RDA 0.8 g/kg (NASEM; EFSA 0.83) · US 2025-2030: 1.2-1.6 · ISSN exercisers 1.4-2.0 · older adults 1.0-1.2 · kidney disease 0.8 | Default 1.0, goal and age adjusted within 0.8-2.0, clamped to 10-35% of energy (4.4) |
| Carbohydrate | NASEM 45-65% · EFSA 45-60% · WHO: no amount, 40-70% associated with lowest mortality · US 2025-2030 allows lower carbohydrate with a clinician | Remainder after protein and fat; floor 130 g; 45-65% as the usual range |
| Total fat | NASEM 20-35% · WHO at most 30% (conditional) · FAO 15-35% · ICMR 15-35% | 30% default, 20-35% range, never below 20% (15% absolute) |
| Saturated fat | WHO and US at most 10% · AHA 5-6% for LDL lowering (not verified) · HEI full marks at 8% | At most 10% (Phase 4); HEI standard in the score |
| Added sugar | WHO and US 2020-2025 under 10% · WHO under 5% (conditional) · ICMR under 5% · US 2025-2030 "no amount", 10 g per meal · FSSAI label reference 50 g | Under 10% of energy, 5% as the aspiration (Phase 4); total sugars shown, not judged |
| Sodium | WHO under 2,000 mg · NASEM reduction level 2,300 · US 2,300 · NASEM Adequate Intake 1,500 · ICMR and FSSAI 2,000 | 2,300 mg limit by default; 2,000 mg on the Indian reference set; 1,500 never a target |
| Potassium | NASEM Adequate Intake 3,400 / 2,600 · WHO 3,510 · EFSA 3,500 · ICMR 3,500 · US label 4,700 (superseded) | NASEM Adequate Intake by sex |
| Fibre | NASEM 14 g per 1,000 kcal · WHO 25 g · ICMR about 15 g per 1,000 kcal · US 2025-2030 none | 14 g per 1,000 kcal, at least 25 g |
| Energy equation | NASEM 2023 · Mifflin-St Jeor times multipliers · ICMR per kilogram by activity · Schofield/FAO | NASEM 2023, with Mifflin as a cross-check and a range |
| Calorie floor | AHA/ACC/TOS 1,200-1,500 / 1,500-1,800 · NICE 800-1,200 specialist only · NHLBI 1,000-1,200 / 1,200-1,600 · no universal rule | 1,200 / 1,500, wall at 800 |
| BMI for "overweight" in South Asians | 25 (WHO) · 23 (NICE, WHO action point, ICMR, Indian consensus) · "obese" 25 (Indian consensus) or 27.5 (NICE, ICMR) | Loss available from 25 (international) or 23 (Indian reference set); labels name the standard |
| Individual target: EAR or RDA | NASEM: RDA · ICMR documents: both | RDA by default; EAR for iron, zinc, B12 and riboflavin on the Indian set |

## 2. Problems with the current weekly breakdown

This section describes the code as it is in the working tree on 2026-10-11 (the redesign is uncommitted; the logic below is unchanged by it). Every claim has a file reference, and the behaviour claims were checked by running the app's real `statusOf` / `scoreOf` / `buildWeeklyNutrients` on synthetic weeks (2.2).

### 2.1 What exists today

| Layer | File | What it does |
|---|---|---|
| Worker | [worker/src/domain/nutrients.ts](worker/src/domain/nutrients.ts) | The 17-nutrient catalogue and one hard-coded default goal per nutrient (lines 3-9; the ten vitamins and minerals have `defaultGoal: null`, lines 10-19) |
| Worker | [worker/src/domain/nutrition.ts](worker/src/domain/nutrition.ts) | Per-item nutrients computed at read time; `sumNutrients` returns `{ value, missingItems }` per nutrient (lines 59-75) |
| Worker | [worker/src/routes/days.ts](worker/src/routes/days.ts) | `GET /days?from&to`: per-day totals plus the goals, up to 62 days |
| Worker | [worker/src/routes/settings.ts](worker/src/routes/settings.ts) | `GET/PUT /me/goals`: one number per nutrient; defaults merged in `goalsFromRows` (lines 46-50) |
| Worker | [worker/migrations/0001_init.sql](worker/migrations/0001_init.sql) | `users` (name, timezone, call settings only), `user_goals(user_id, nutrient, target)`, shared `foods` table with the 17 nutrient columns |
| App | [app/src/utils/week.ts](app/src/utils/week.ts) | `buildWeeklyNutrients`: prorates the goal, zero-fills missing days |
| App | [app/src/utils/nutrition.ts](app/src/utils/nutrition.ts) | `statusOf`, `scoreOf`, `gradeOf`, `verdictOf`, `inferDirection`: all of the scoring |
| App | [app/src/screens/WeeklySummaryScreen.tsx](app/src/screens/WeeklySummaryScreen.tsx) | The "Weekly breakdown": score card, search, status filters, a row per nutrient |
| App | [app/src/components/report/](app/src/components/report/) | `ScoreCard`, `NutrientRow`, `NutrientDetail`, `DayChart`, `GoalSheet`, `WeekNutrientRow` |
| App | [app/src/screens/ReportScreen.tsx](app/src/screens/ReportScreen.tsx) | The Report tab: calories, three macros, three "other" nutrients for the week so far |
| App | [app/src/components/today/SummaryCard.tsx](app/src/components/today/SummaryCard.tsx) | The daily calorie ring and six small bars |
| App | [app/src/screens/GoalsScreen.tsx](app/src/screens/GoalsScreen.tsx) | Free-text daily goal per nutrient; empty means "use the default" |
| Tests | [app/__tests__/nutrition.test.ts](app/__tests__/nutrition.test.ts), [worker/test/unit/nutrition.test.ts](worker/test/unit/nutrition.test.ts) | Pin today's thresholds, grade boundaries and proration |

How the score is made today: each nutrient with a goal gets a status from `amount / goal` (week-so-far total over daily goal x days elapsed), the status becomes 100, 70 or 30 points, and the score is the plain average ([nutrition.ts:16-32, 57-64](app/src/utils/nutrition.ts#L16-L32)). The grade is a lookup on that average ([nutrition.ts:74-81](app/src/utils/nutrition.ts#L74-L81)).

### 2.2 What the current logic does with realistic weeks

I ran the real functions (copied unchanged to a scratch folder) over synthetic weeks, with the app's own defaults as goals and the same "only nutrients with a goal count" filter as [WeeklySummaryScreen.tsx:54](app/src/screens/WeeklySummaryScreen.tsx#L54). Monday 5 Oct to Sunday 11 Oct 2026.

| # | Week | Score | Grade / verdict | Why this is a problem |
|---|---|---|---|---|
| A | Every default goal met exactly, all 7 days logged | 100 | A / "Excellent week" | The only way to get a top score is to match one fixed diet |
| B | **Nothing logged** all week | 50 | D / "Needs attention" | Sugar and sodium read "within limit" at 0 g |
| C | Eaten perfectly on 4 days, the other 3 **simply not logged** | 50 | D / "Needs attention" | Identical to B: the score cannot tell "didn't log" from "didn't eat" |
| D | Wednesday 9 am, Monday and Tuesday perfect, today not logged yet | 50 | D / "Needs attention" | Today counts as a full day of goal, so the current week looks bad until the evening |
| E | Everything on target, but **sodium 174%** and **sugar 225%** of the limit every day | 80 | A- / "Strong week" | Equal weights and full compensation: two limits blown, still a strong week |
| F | **200% of calories** (5,000 kcal/day), protein and carbs at 200% | 80 | A- / "Strong week" | "More is better" for protein and carbs with no upper bound |
| G | Crash diet: 1,000 kcal/day, 50 g protein | 50 | D / "Needs attention" | Same score as B, no safety signal at all |
| H | A sedentary 55-year-old woman eating a sensible ~1,800 kcal diet (70 g protein, 25 g fibre, 1,900 mg sodium) | 67 | C / "Mixed week" | She is graded against a 2,500 kcal / 180 g protein goal that was never hers |

### 2.3 Problem register

Severity: **High** = can mislead a user about their health or break trust; **Medium** = wrong or unhelpful but not harmful; **Low** = polish. "Fix" points to the section of this plan that addresses it.

**A. Goals are not personal, structured or safe**

| ID | Problem | Evidence | Severity | Fix |
|---|---|---|---|---|
| P1 | Every user gets the same fixed goals (2,500 kcal, 180 g protein, 250 g carbs, 70 g fat, 30 g fibre, 40 g sugar, 2,300 mg sodium). `users` has no age, sex, height, weight, activity or goal field. 180 g protein is 2.25 g/kg for an 80 kg adult and 3.3 g/kg for a 55 kg adult. The macros do not even add up to the calorie goal (250x4 + 180x4 + 70x9 = 2,350, not 2,500). | [nutrients.ts:3-9](worker/src/domain/nutrients.ts#L3-L9), duplicated in [MetaContext.tsx:12-18](app/src/state/MetaContext.tsx#L12-L18) and [TodayScreen.tsx:22](app/src/screens/TodayScreen.tsx#L22); [0001_init.sql:4-14](worker/migrations/0001_init.sql#L4-L14) | High | 3, 4, 6 |
| P2 | Ten vitamins and minerals have no default goal, so they are excluded from the score and show "No goal". The headline score covers 7 of 17 nutrients unless the user types ten targets by hand, with no guidance on what to type. | [nutrients.ts:10-19](worker/src/domain/nutrients.ts#L10-L19), [WeeklySummaryScreen.tsx:53-54](app/src/screens/WeeklySummaryScreen.tsx#L53-L54), [GoalsScreen.tsx:79-87](app/src/screens/GoalsScreen.tsx#L79-L87) | High | 4.6 |
| P3 | A goal is a bare number. There is no notion of minimum, limit, range or upper limit; direction is guessed from the display label. Fat is a "window" in the weekly view but a "limit" on Report and Today, so the same nutrient has two meanings. | [nutrition.ts:92-111](app/src/utils/nutrition.ts#L92-L111) vs [ReportScreen.tsx:70](app/src/screens/ReportScreen.tsx#L70), [SummaryCard.tsx:12](app/src/components/today/SummaryCard.tsx#L12) | High | 4.7, 5.4 |
| P4 | No guardrails. The API accepts any goal from just above 0 to 100,000; the goal sheet slider allows 25% to 250% of the current value. A 300 kcal/day goal is accepted and then shown as "on track" when eaten. | [settings.ts:133](worker/src/routes/settings.ts#L133), [GoalSheet.tsx:73-75](app/src/components/report/GoalSheet.tsx#L73-L75) | High | 4.3, 6, 8 |
| P5 | Goals are overwritten in place, so history is lost and last month is judged against today's goals. | `user_goals` has no timestamp ([0001_init.sql:83-88](worker/migrations/0001_init.sql#L83-L88)) | Medium | 6, 9.1 |

**B. The score is not evidence-based**

| ID | Problem | Evidence | Severity | Fix |
|---|---|---|---|---|
| P6 | The thresholds (80% / 100% / 115%, 90-110%, 75-125%) and the 100 / 70 / 30 points are not taken from any standard. The scale cannot go below 30. The grade table has no F and no A+. "Hit rate" counts nutrients, not days. | [nutrition.ts:16-32, 57-81](app/src/utils/nutrition.ts#L16-L32) | High | 5.5 |
| P7 | Equal weights with full compensation: sodium at 174% and sugar at 225% still scores "A- / Strong week" (scenario E). Protein and carbs count as "good" at any amount above the goal (F). | `scoreOf`, `statusOf` | High | 5.4, 5.5 |
| P8 | The score treats "not logged" as "not eaten" (B, C), and rewards an empty log on the limit nutrients. | [week.ts:29, 36](app/src/utils/week.ts#L29) | High | 5.3, 7 |
| P9 | A 1,000 kcal/day week and an empty week look identical (G). The app cannot notice a dangerously low intake. | same | High | 7, 8 |
| P10 | Letter grades and words like "Needs attention", "Off goal" and a red "bad" imply a precision and a moral judgement the data cannot support. No study has tested numeric or letter grades, so there is no evidence they help; calorie-tracking apps are associated with disordered-eating symptoms in cross-sectional studies (causality unknown), and an expert consensus lists weight focus and calorie monitoring among strategies likely to raise risk (1.7). | [ScoreCard.tsx:76-89](app/src/components/report/ScoreCard.tsx#L76-L89), [nutrition.ts:66-81](app/src/utils/nutrition.ts#L66-L81) | High | 5, 8 |

**C. Missing, partial and unreliable data**

| ID | Problem | Evidence | Severity | Fix |
|---|---|---|---|---|
| P11 | **Unknown is silently counted as zero.** Only calories is required on a food, so most foods lack most vitamins and minerals. The Worker reports `{ value: 0, missingItems: 3 }` for a nutrient nobody entered, and the app reads only `.value`. A user who sets a vitamin D goal is told they are "100% below goal" because the foods have no vitamin D value. | [validate.ts:48](worker/src/validate.ts#L48), [worker/test/unit/nutrition.test.ts:73](worker/test/unit/nutrition.test.ts#L73), [week.ts:29](app/src/utils/week.ts#L29) | High | 7 |
| P12 | Items waiting for a food or unit contribute nothing, and only the Report tab says so ("still unknown and not counted"). The weekly breakdown says nothing, and nowhere says how much energy is missing. | [ReportScreen.tsx:122-129](app/src/screens/ReportScreen.tsx#L122-L129) | Medium | 5.2, 7 |
| P13 | Days with nothing logged count as zero intake against a prorated goal. `loggedDays` exists but only feeds a "daily average" figure on one detail screen. | [week.ts:26, 36](app/src/utils/week.ts#L26), [NutrientDetail.tsx:56](app/src/components/report/NutrientDetail.tsx#L56) | High | 5.3, 7 |
| P14 | Today is counted as a whole day of goal, so any mid-week or mid-day view is biased low (scenario D). | [week.ts:7-11](app/src/utils/week.ts#L7-L11) | Medium | 5.3 |
| P15 | No plausibility checks. Quantity and nutrient values are only capped at 100,000. Food values are typed in, shared by everyone, and have no source or "verified" mark, so one typo (10x calories) silently changes every user's totals. Nothing checks that calories roughly match protein, carbs and fat. | [items.ts:15](worker/src/domain/items.ts#L15), [validate.ts:22](worker/src/validate.ts#L22), `foods` table | High | 7, 9.1 |
| P16 | Two definitions of "today". Report and Weekly breakdown take "today" from the device's time zone; the Today screen takes it from the profile's time zone (the one the daily call uses). On a phone set to a different zone than the profile (travel, or the Asia/Kolkata default on a phone elsewhere) the screens can disagree about which day, and which week, it is. | [ReportScreen.tsx:36](app/src/screens/ReportScreen.tsx#L36), [WeeklySummaryScreen.tsx:36](app/src/screens/WeeklySummaryScreen.tsx#L36) vs [TodayScreen.tsx:28](app/src/screens/TodayScreen.tsx#L28) | Medium | 9.2 (the Worker decides "today" from the profile's zone) |

**D. Coverage and usefulness**

| ID | Problem | Evidence | Severity | Fix |
|---|---|---|---|---|
| P17 | The nutrients that guidelines single out are not tracked: saturated fat, added sugars, trans fat, cholesterol, vitamin B12, folate, omega-3. "Sugar" is total sugars (it includes fruit and milk) but every guideline limits added or free sugars, so the 40 g "limit" penalises fruit and dairy. | [0001_init.sql:39-41](worker/migrations/0001_init.sql#L39-L41) | Medium | 4.4, 9.1 |
| P18 | The weekly view is a flat list of 17 equal rows. It does not prioritise, does not say what to do, does not show where a nutrient came from, and compares only against the current week (a 7-bar chart per nutrient). | [WeeklySummaryScreen.tsx:200-206](app/src/screens/WeeklySummaryScreen.tsx#L200-L206) | Medium | 5.2, 5.6 |

**E. Privacy and architecture**

| ID | Problem | Evidence | Severity | Fix |
|---|---|---|---|---|
| P19 | The auth model was accepted for "friends-only, non-sensitive data": one shared token compiled into the APK, and `GET /profiles` lists every profile. Body measurements and health flags are not non-sensitive. | [README.md:223](README.md#L223), [PLAN.md:557](PLAN.md#L557), [profiles.ts:10-16](worker/src/routes/profiles.ts#L10-L16) | High (blocks the profile feature) | 8.3 |
| P20 | Scoring rules live in the app and the Worker only supplies sums, so they cannot be tested next to the data, the catalogue is duplicated (`FALLBACK_META` has 7 of 17 nutrients), and two screens can disagree (P3). | [nutrition.ts](app/src/utils/nutrition.ts), [MetaContext.tsx:7-20](app/src/state/MetaContext.tsx#L7-L20) | Medium | 9.2 |

### 2.4 What is worth keeping

- **Pure, tested functions** and read-time computation: fixing a food corrects every past log (PLAN.md section 7). The new engine keeps this.
- **The `missingItems` count** already exists on every total. It is the seed of the data-quality model in section 7; it only needs to be used.
- **Monday-first weeks, time zones and the 62-day range endpoint.** They are enough for a 4-8 week trend.
- **The "no AI" rule** (PLAN.md sections 4 and 12). Everything proposed here is deterministic, rule-based and testable.
- **The voice assistant never discusses nutrition** ([prompt.ts:97](worker/src/vapi/prompt.ts#L97)), so it never needs the new profile data. That should stay true (section 8.3).

## 3. Recommended user profile and onboarding fields

### 3.1 Principles

1. **Ask only what changes a number or a message.** Each field below names the formula or rule that uses it. If nothing uses it, we do not ask.
2. **Every question can be skipped, and skipping is safe.** A profile with missing required fields falls back to *generic mode* (section 7.5): reference values for a 2,000 kcal diet, no personalised energy target, no score.
3. **Prefer the less sensitive form of the same fact:** birth year instead of date of birth, a "sex used for calculations" instead of gender identity, an activity category instead of exercise logs, a yes/no safety screen instead of a list of diagnoses, one yes/no for "a medicine that interacts with diet" instead of a list of drugs.
4. **Health conditions are never free text and are never sent to anyone else.** The safety screen only decides a mode (section 8.1); the server stores the mode and, at most, one yes/no flag, not the reason.
5. **Do not use a symptom questionnaire.** The research (1.7) shows eating-disorder screeners are poor gates for a consumer app; the app asks one self-declaration question and signposts instead.

### 3.2 Fields

| Field | Used by | How it is asked | Required for personalised targets | Validation (hard / soft) | Stored as |
|---|---|---|---|---|---|
| **Birth year** (month optional) | Age bands for reference intakes (19-30, 31-50, 51-70, over 70), the energy equation, the under-19 and 65+ rules | Year wheel; "month is optional and only sharpens age-band edges" | Yes | Hard: age 19-100 (under 19: nothing but the mode is stored, section 8.1). Soft: over 80 shows a note | `birth_year`, `birth_month` |
| **Sex used for calculations** | Equation constants and every sex-specific reference intake | "Reference values differ for female and male bodies. Which should we use? Female / Male / Prefer not to say (we use the average of both)". No gender question | Yes | Enum | `sex_for_calc` (`female` / `male` / `average`) |
| **Height** | Energy equation, BMI | cm, or ft + in (converted at once) | Yes | Hard: 120-230 cm. Soft: outside 140-200 cm asks "is that right?" | `height_cm` |
| **Weight** | Energy equation, protein per kg, BMI, eligibility; changes over time | kg, lb, or st + lb; later a one-tap weigh-in | Yes | Hard: 25-350 kg. Soft: BMI under 16 or over 50 asks "is that right?" (BMI under 16 or over 60 puts the profile in reference-only mode, 8.1) | `weight_entries` (latest used) |
| **Activity level** | The activity category of the energy equation | Four cards with everyday examples (4.2) and an optional "I know my daily steps" helper | Yes | Enum | `activity_level` (`inactive`, `low_active`, `active`, `very_active`) |
| **Primary goal** | Energy adjustment, protein target, which cards lead the weekly view | Five cards: Eat well (general health), Maintain weight, Lose weight, Gain weight, Build muscle | Yes (defaults to general health) | Enum; Lose and Gain are gated by section 8.1 | `goal` |
| **Pace** (Lose / Gain only) | Size of the deficit or surplus | Three steps (gentle, standard, faster) with the daily calories and a plain sentence ("about a quarter to half a kilo a week at first, slowing down") | No | Engine bounds (4.3) | `pace` |
| **Eating pattern** | Which micronutrients the weekly view emphasises; the iron adjustment for plant-based patterns (decision Q4) | "How do you eat?" Everything / Eggs but no meat or fish / Vegetarian (dairy, no eggs) / Vegan / Fish but no meat | No (defaults to everything) | Enum | `diet_pattern` |
| **Reference standard** | Which table of reference intakes the engine reads (decision Q2); also which BMI cut-offs gate weight-loss goals | "Use US/Canada (NASEM) or India (ICMR-NIN)". Defaults from the phone's region | No | Enum | `reference_set` |
| **Safety check** | Decides the mode (section 8.1) | Checklist, section 3.4 | Yes (cannot be skipped; "None of these" is one tap) | n/a | `target_mode` only |
| **A medicine that interacts with diet** | Turns off verdicts and nudges for vitamin K, potassium and sodium (8.1) | One yes/no inside the safety check, with examples (blood thinners such as warfarin, lithium, some blood-pressure tablets) | No | bool | `diet_interacting_medicine` |
| **Hide numbers** | Low-pressure display (section 8.2) | A toggle on the last step and in Settings, off by default | No | bool | `numbers_hidden` |
| **Consent** | Records that the person saw what is stored, why, and who else processes the voice calls | One screen, versioned text (section 8.3) | Yes, to save | n/a | `consent_version`, `consented_at` |

Weight is the only field that should be refreshed regularly. A weigh-in prompt appears at most once every four weeks, can be dismissed, and is never shown in low-pressure mode.

### 3.3 What we deliberately do not ask

| Not asked | Why |
|---|---|
| Gender identity, ethnicity | No calculation here uses them. "Sex used for calculations" covers the equations; BMI cut-offs follow the reference standard (section 4.1). NASEM's own guidance says gender data are for research designs, and that evidence on energy needs of transgender adults is lacking (1.7) |
| Body-fat percentage, waist, measurements | Self-reported values are unreliable and nothing in the engine needs them in v1 |
| Specific diagnoses, a list of medications, test results | The app is not a clinical tool. The safety check only needs "does a clinician already set your diet" and one yes/no for a diet-interacting medicine |
| Symptom questions about eating (SCOFF, EAT-26 and similar) | Weak as a gate in a consumer setting: the US task force finds evidence insufficient; NICE says never use them alone; most positives would be false (1.7) |
| Allergies and food dislikes | The app makes no food recommendations (the "no AI" rule), so nothing would use them |
| Exact date of birth, address, phone, email | Not needed. Birth year is enough |
| Menstrual cycle, hormones | No evidence-based adjustment exists at this level; collecting it would add risk without benefit |

### 3.4 The safety check (draft wording, for clinical review)

> **Before we set targets**
> Does any of this apply to you right now?
> - I am pregnant or breastfeeding
> - I have, or have had, an eating disorder
> - A doctor or dietitian has given me a specific diet or calorie target (for example for diabetes treated with insulin or tablets, kidney, heart or liver disease, cancer treatment, or after weight-loss surgery)
> - None of these
> - I would rather not say
>
> Separately: **I take a medicine that can interact with food** (for example blood thinners such as warfarin, lithium, or some blood-pressure tablets). *Yes / No*

Any of the first three puts the profile in **reference-only mode**: the app still tracks food and shows what was logged (amounts and coverage), but sets no calorie, weight or macro targets, shows no verdicts and no score, and **stores only the mode**, not which answer was given. It offers an **"I have targets from my care team"** path where the person types their own numbers (decision Q7, 6.7). "I would rather not say" is treated as "none of these", with the conservative pace default and the standard disclaimers (decision Q8). A birth year under 19 stops the flow before any body data is entered. The medicine question never changes the mode; it removes verdicts, insights and nudges for **vitamin K, potassium and sodium** and shows the amounts without a target.

### 3.5 Onboarding flow

The existing onboarding ([OnboardingScreen.tsx](app/src/screens/OnboardingScreen.tsx)) sets only call time and time zone. The health profile is a separate, skippable flow that follows it and can be reopened from Settings.

| Step | Screen | What the engine does meanwhile |
|---|---|---|
| 0 | "Personal targets" intro and notice: what we ask, why, what is stored, who processes voice calls (8.3), and "Continue" or "Skip for now" | Nothing; generic mode if skipped |
| 1 | Safety check (3.4) | Sets the mode; reference-only skips steps 3-5 |
| 2 | About you: birth year, sex used for calculations, height, weight | Computes BMI and age band; soft validation |
| 3 | Activity level (four cards) | Computes the maintenance estimate |
| 4 | Goal and pace, with a live preview such as "About 2,150 kcal a day (a typical range is 1,910 to 2,390)" | Applies the goal adjustment, floors and caps (section 4.3) |
| 5 | Eating pattern and reference standard | Selects reference tables |
| 6 | Review: energy, protein, fibre, sodium, and the one-line reason for each, a link to "How we calculate this", the consent text, a "hide numbers" toggle, and "Save" | Saves the profile and the first target set, recording the consent version |

The preview uses `POST /me/targets/preview` (section 9.3), so the Worker's engine is the only place the formulas live.

### 3.6 Existing profiles

A profile with no health row keeps working. After the Phase 0 fixes (section 10) it shows generic reference targets, clearly labelled, and a dismissible card on Today and Report: "Make your targets personal (about 2 minutes)". Custom goals people already typed stay as **custom overrides** and keep winning over recommended values until they reset them.

### 3.7 Where this differs from the field list in the request

| Requested | Recommended | Reason |
|---|---|---|
| Age | Birth year (month optional); adults from 19 | Stays correct without re-asking; 19 is where the adult reference intakes and energy equations begin (decision Q6) |
| Sex | Sex used for calculations, with an "average" option; no gender question | The equations and reference intakes are sex-specific; nothing else is |
| Height, weight | Same, with weigh-ins over time | Weight changes the answer; a single number goes stale |
| Activity level | Four standard categories with examples; steps helper optional | They match the categories the energy equations were built on (1.1), with the honest caveat that people cannot reliably place themselves |
| Dietary preferences or restrictions | Eating pattern only, plus the diet-interacting medicine yes/no | Allergies and dislikes change no number; patterns change which nutrients need attention; some medicines make certain nudges unsafe |
| Primary goal | Five goals plus a three-step pace | A rate is what actually sets the deficit, and it is the part that must be bounded for safety |
| *(not requested)* | Safety check, reference standard, hide-numbers, consent | Needed for safe, transparent and private operation (section 8) |

## 4. Proposed formulas and calculation methods

Every number below carries a tag: **[R]** reference value or formal recommendation from a standards body; **[E]** an estimate from a validated prediction equation, with known error; **[G]** guidance (a professional-society position, a guideline range, a meta-analysis); **[A]** an assumption, a design choice that no standard dictates. Section 4.10 lists every constant with its tag and anchor, so a reviewer can see at once which parts are standards and which are ours.

The engine is a set of pure functions in the Worker (section 9.2). It is **deterministic**, uses **no AI**, and every result carries the engine version, the inputs it used and a one-sentence reason per target.

### 4.0 The pipeline

```
profile + latest weight + today's date
  |
  +-- gates (8.1) ---------> mode: personalised | reference_only | generic;  which goals are available;  warnings
  v
  4.1 derived values        age band, BMI, reference weight
  v
  4.2 maintenance energy    NASEM 2023 equation by sex and activity category, with a range
  v
  4.3 goal adjustment       deficit or surplus, bounded by floors, caps and a rate limit  ->  energy target
  v
  4.4 macronutrients        protein (per kg), fat (share of energy), carbohydrate (remainder), fibre, sugars, saturated fat
  4.5 sodium, potassium
  4.6 vitamins, minerals    reference intakes by sex and age band, with upper levels and scopes
  v
  4.7 TargetSet             typed targets, each with its reason, source and evidence tag
```

### 4.1 Inputs and derived values

| Quantity | Rule | Tag |
|---|---|---|
| Age (years) | `year - birth_year`, minus one if the birth month is known and has not yet been reached; with no month, assume 1 July. Age bands for reference intakes: 19-30, 31-50, 51-70, over 70 | [R] NASEM bands |
| BMI | weight (kg) / height (m)^2. Used **only** to gate goals (8.1), to pick the protein reference weight and the muscle-gain surplus; never shown as a verdict | [R] definition |
| Reference weight for protein | actual weight if BMI is 30 or less; otherwise the weight at BMI 30 (`30 x height^2`). Capping avoids multiplying protein targets by body fat; the choice is contested (1.2), so the rule is shown to the user and is easy to change | [A] |
| Sex used for calculations | `female`, `male`, or `average`. **Average** means the mean of the male and female result at every step (energy, standard error, potassium, every reference intake) | [A] (decision Q5) |
| Units | Stored metric; forms accept lb, st, ft-in. 1 lb = 0.45359237 kg; 1 in = 2.54 cm | n/a |

### 4.2 Energy: the maintenance estimate

**Equation** (NASEM 2023, Table 5-5; adults 19 and over, all BMIs; kcal/day; age in years, height in cm, weight in kg). This is the estimated energy requirement for a weight-stable adult. **[R] coefficients, [E] result.**

| Sex | Activity category | Equation |
|---|---|---|
| Men | Inactive | 753.07 - 10.83 x age + 6.50 x height + 14.10 x weight |
| Men | Low active | 581.47 - 10.83 x age + 8.30 x height + 14.94 x weight |
| Men | Active | 1,004.82 - 10.83 x age + 6.52 x height + 15.91 x weight |
| Men | Very active | -517.88 - 10.83 x age + 15.61 x height + 19.11 x weight |
| Women | Inactive | 584.90 - 7.01 x age + 5.72 x height + 11.71 x weight |
| Women | Low active | 575.77 - 7.01 x age + 6.60 x height + 12.14 x weight |
| Women | Active | 710.25 - 7.01 x age + 6.54 x height + 12.34 x weight |
| Women | Very active | 511.83 - 7.01 x age + 9.07 x height + 12.56 x weight |

The coefficients were reproduced against NASEM's own worked examples: a 22-year-old woman, 165 cm, 63 kg, low active gives **2,275** kcal (published 2,275), and a 45-year-old man, 175 cm, 100 kg, low active gives **3,041** (published 3,041).

**Monotone guard [A].** The published men's "very active" equation falls *below* "active" for short, light men (heights of 140 and 150 cm, weights 35 to 75 kg in the test grid; 336 of about 40,000 category comparisons), an artefact of its steep height term. The engine never lets a higher activity category lower the estimate: it takes the maximum over the selected category and the ones below it. A test pins this (11.2).

**Range.** The equation's standard error for a predicted value is **342 kcal/day for men and 241 for women** [R] (NASEM Table 5-8); for `average` the mean, 291. The app shows the estimate rounded to 10 kcal with a **typical range of plus or minus one standard error** (about two thirds of people) and states that the 95% range is about twice as wide. In plain words: "About 2,150 kcal a day. Your real needs could be anywhere from about 1,900 to 2,400. After three or four weeks, your weight trend tells you more than this number does."

**Cross-check [A].** The engine also computes Mifflin-St Jeor times NASEM's own Table 7-1 activity values (1.4, 1.6, 1.75, 2.05) [R]. If the two differ by more than 15% of the NASEM value, the targets screen adds "the estimates disagree more than usual for your body size". This happens for very small older women (the `Small` persona below: 1,470 against 1,180) and is informational, never blocking.

**The activity question.** NASEM's four categories are quartiles of measured activity in a research sample, and NASEM says people cannot be reliably classified by questionnaire or step count (1.1). The cards therefore describe habits plainly and say so:

| Card | Plain description | NASEM's own example (Table 7-1) |
|---|---|---|
| Inactive | Mostly sitting or light chores; little planned exercise | Daily activities only: about 30 minutes of walking plus roughly 90 minutes of light household activity |
| Low active | Regular walking or light exercise on most days | Daily activities plus 60-80 minutes of brisk walking |
| Active | Regular exercise, or a job on your feet | Daily activities plus about 30-50 minutes of walking, 45 minutes of moderate cycling and 40 minutes of doubles tennis |
| Very active | Hard physical work or heavy training on most days | Daily activities plus cycling, jogging and tennis amounting to well over two hours |

"If you are between two, choose the lower one; your weight trend will show if that is too low" **[A]**. The optional steps helper maps under 5,000 steps to *inactive*, 5,000-9,999 to *low active*, 10,000-12,499 to *active* and 12,500 or more to *very active*, from published step-count bands that were **not calibrated** to these categories (Tudor-Locke and Bassett 2004), so it only pre-selects a card **[A]**.

**India and other populations.** NASEM's data come from high-income countries (1.1); evidence on Indian adults is small and contested. v1 uses the same equations for everyone, relies on the range, and lets the weight trend (Phase 5) correct it. An ICMR-NIN per-kilogram energy path (Indian reference set, Phase 6) is decision Q3.

**Out of scope.** Under 19, pregnancy and lactation (NASEM has separate equations and add-ons; 8.1).

### 4.3 Goal adjustment: from maintenance to a daily target

The target is `maintenance + delta`, rounded to 10 kcal. `delta` depends on the goal. All limits below are **[A] anchored on [G]** sources; none is a formal standard (1.2 shows there is no universal rule).

| Goal | Rule | Bounds | Anchors |
|---|---|---|---|
| Eat well, Maintain | `delta = 0` | none | [R] the equation itself |
| **Lose** | `deficit = clamp(share x maintenance, 200, max)`; share and max by pace: **gentle 10% (max 300)**, **standard 15% (max 500)**, **faster 20% (max 600)** | Never more than **25% of maintenance** nor **750 kcal**; the target never below the **floor**; the static first-weeks rate (`deficit x 7 / 7,700` kg a week) never above **1% of body weight** nor **1 kg**; a deficit under 150 kcal means loss is not offered (goal becomes Maintain, with the reason) | NHLBI 300-500 kcal for overweight and 500-1,000 for obesity; AHA/ACC/TOS 500 or 750 kcal or 30%; NHS about 600; CDC 1-2 lb a week; NASEM's own starting point for loss is the estimate minus 1.96 standard errors, about 21-22% for a typical man or woman |
| **Gain weight** | `surplus = clamp(15% x maintenance, 250, 500)` | At most **+20%** of maintenance | NHS +300-500 kcal for underweight adults; Iraki 2019 10-20% for novices |
| **Build muscle** | BMI under 25: `clamp(10%, 150, 300)`; BMI 25-29.9: `clamp(5%, 100, 200)`; BMI 30 or more: 0 (maintenance, with higher protein) | | Iraki 2019 (novice 10-20%, advanced 5-10%), Slater 2019 (360-480 kcal); no training-status question is asked, so the low end is used; the general guidance is to avoid large surpluses with excess weight |
| **Floors** | **1,200 kcal** (female), **1,500** (male), **1,350** (average); **800 kcal is an absolute wall** (the very-low-calorie-diet line) | If `maintenance - deficit` falls under the floor, the deficit shrinks (warning `floor_limited_deficit`) | AHA/ACC/TOS "usual" ranges 1,200-1,500 and 1,500-1,800; NICE and AHA/ACC/TOS: under 800 only under medical supervision |

**Availability gates** (from the safety check and profile, 8.1): Lose needs BMI of **25** or more on the international reference set, **23** or more on the Indian one [G: NICE, CDC NDPP], and is not offered from age 80, nor from 65 unless BMI is in the obesity range (30, or 27.5 on the Indian set) [G: ESPEN]; Gain is not offered when BMI is in the overweight range or above; neither is offered to a BMI under 18.5 for Lose. A blocked goal does not fail: the engine applies Maintain, says why, and lists the goals that are available.

**The deficit is a starting point, not a prediction.** The static first-weeks rate is for display. Real change is slower and levels off (4.9). Every loss goal shows "check in after 12 weeks": the safety check is re-confirmed, and the person is asked whether to continue, maintain or talk to a professional **[A]**.

### 4.4 Macronutrients

Given the energy target `E` (kcal), the reference weight `Wref` (4.1) and the goal:

| Step | Rule | Tag |
|---|---|---|
| 1. Protein per kg | Eat well and Maintain **1.0 g/kg**; Lose **1.4**; Gain **1.2**; Build muscle **1.6**; age 65 or over: at least **1.2** | [A] inside [G] ranges: RDA 0.8 [R]; US 2025-2030 1.2-1.6; ISSN 1.4-2.0; PROT-AGE and ESPEN 1.0-1.2 for older adults |
| 2. Protein clamp | `P = clamp(g/kg x Wref, max(0.8 x Wref, 10% E / 4), min(2.0 x Wref, 35% E / 4))` grams. The bounds are the RDA [R], the lower and upper edges of the acceptable range [R], and a cap at 2.0 g/kg [G: ISSN; the upper bound of the 1.62 plateau's interval is 2.20] | mixed |
| 3. Fat | `F = 30% x E / 9` grams; accepted range 20-35% of energy; never below 20% (15% is the absolute floor) | [A] default inside [R] range (NASEM 20-35; WHO at most 30% conditional; FAO floors) |
| 4. Carbohydrate | `C = (E - 4P - 9F) / 4` grams; **floor 130 g**; usual range 45-65% of energy | [R] RDA 130 g and range |
| 5. If the floor binds | `C = 130`, then `F = (E - 4P - 4C) / 9`; if fat falls under 20% of energy, fat is held at 20% and protein reduced toward its lower bound | [A] ordering |
| 6. Fibre | `max(14 g x E / 1,000, 25 g)` | [R] NASEM 14 g per 1,000 kcal; [R] WHO at least 25 g |
| 7. Sugars | **No target for total sugars** (no authority limits them). Phase 4 adds **added sugars**: limit **10% of energy**, aspiration **5%** | [R] WHO strong and conditional |
| 8. Saturated fat (Phase 4) | limit **10% of energy** | [R] WHO, US |

Notes: the macronutrient energy sums to `E` within rounding (a test, 11.2). A low-carbohydrate or ketogenic pattern is not offered in v1: such users fall outside the 45-65% range by design and would see a misleading verdict; a pattern setting that moves the range is a follow-up, not part of this plan. The Indian reference set changes the protein base to 0.83 g/kg and the fibre density, sodium, added-sugar and fat limits (Phase 6).

### 4.5 Sodium and potassium

| Target | Rule | Tag |
|---|---|---|
| Sodium | **Limit 2,300 mg a day** (kind `limit`). An optional stricter 2,000 mg (WHO) is the default on the Indian reference set. The 1,500 mg Adequate Intake is **not** a target. Not scaled by energy. Heavy sweating is not modelled; the explainer notes the US guidance that highly active people may need more | [R] NASEM 2019 Chronic Disease Risk Reduction level; US 2025-2030; [R] WHO |
| Potassium | **Adequate Intake** 3,400 mg (male), 2,600 mg (female), 3,000 (average) (kind `minimum`). No upper limit | [R] NASEM 2019 |
| With the diet-interacting-medicine flag | Both are shown as amounts only: no target, verdict or nudge | [G] drug information (1.2) |

### 4.6 Vitamins and minerals

**Lookup.** Each nutrient's reference intake is the NASEM Recommended Dietary Allowance, or Adequate Intake where there is no RDA, for the person's sex and age band (the adult values for the nine tracked nutrients are in **Appendix B**; `average` takes the mean of the two sexes). The type (RDA or AI) is carried with the value, so the app never says "deficient" about an AI. **[R]**

**Adjustments.**
- **Iron on a plant-based pattern** (eggs-but-no-meat, vegetarian, vegan): the reference is multiplied by **1.8**, exactly as the National Academies state for vegetarian diets (10% absorption against 18%); an explanation line says so. Zinc: no multiplier (the Academies found "not sufficient data to set algorithms"); a note says the need "may be as much as 50 percent greater". **[R]**, decision Q4.
- **Vitamin D**: 15 µg (20 µg over 70). The reference assumes minimal sun exposure; sunlight and supplements are not counted, and the explainer says so. **[R]**
- **Vitamin C**: smokers need 35 mg more; not asked in v1.

**Upper levels** are attached to a target only where they cover food-sourced intake and the app can measure it: **calcium, iron, zinc, vitamin C, vitamin D** (kind `minimum` with an `upperLevel` of scope `all_sources`). Not flagged from food totals: vitamin A (the limit is for preformed retinol; carotenoids do not count), vitamin E, folic acid, niacin and magnesium (supplement-only limits). **[R]**

**Which window judges which nutrient.** From the day-to-day variation figures (1.4), the **weekly** view and score judge only nutrients with a within-person coefficient of variation of about 65% or less: protein, fibre, potassium, calcium, iron, magnesium, zinc. **Vitamins A, C and E** (coefficients 76-152%), and **D and K** (no figures, assumed similar), are shown for the week as amounts and judged over a **rolling four-week window** (up to 28 days, assessed days only) with an "estimate" label. **[A]** anchored on [R] IOM.

**Measurement caveats the app must state** (they shape the explainer text and the insight notes):

| Nutrient | What the app cannot see or what to watch |
|---|---|
| Vitamin A | Units: µg RAE (NASEM) against retinol equivalents (ICMR; carotenoids counted at 6:1 instead of 12:1) and IU on labels; a typed value may be any of them |
| Vitamin D | Sunlight and supplements not counted; 40 IU = 1 µg |
| Vitamin E | NASEM counts only alpha-tocopherol forms; labels may be total tocopherols |
| Vitamin K | Reference is an Adequate Intake; phylloquinone against menaquinone |
| Iron, zinc, calcium | Absorption varies with the diet (phytate, vitamin C); supplements and fortified foods may not be in the log |
| Magnesium | The 350 mg limit is for supplements only |

**Generic mode (no health profile).** For a 2,000 kcal diet, the standard reference energy used by US and Indian food labels: protein 50 g, carbohydrate 275 g, fat 78 g, fibre 28 g, sodium 2,300 mg (US label values), and the micronutrients of an *average adult aged 31-50* from the NASEM table (vitamin A 800 µg RAE, vitamin C 82.5 mg, vitamin D 15 µg, vitamin E 15 mg, vitamin K 105 µg, calcium 1,000 mg, iron 13 mg, magnesium 370 mg, zinc 9.5 mg, potassium 3,000 mg). They are labelled "General reference, not personal". A `reference_only` profile gets none of these values (8.1). **[R] label and NASEM values; [A] the choice of the average adult.**

### 4.7 The target object

Every target the engine returns is typed (section 9.3):

| Kind | Meaning | Examples |
|---|---|---|
| `energy` | An estimate with a range | Daily calories |
| `minimum` | Get at least this much (reference intake) | Protein, fibre, potassium, vitamins, minerals |
| `limit` | Stay at or under this | Sodium; later added sugars, saturated fat |
| `range` | Stay inside this share of energy | Fat 20-35%, carbohydrate 45-65% |

Each carries `value`, optional `low` / `high`, the `evidence` tag, a `basis` key into the sources registry, a one-sentence `how`, whether it is `scored`, and `origin` (`recommended`, `custom` or `care_team`). **Rounding for display:** energy to 10 kcal, protein, fat, carbohydrate and fibre to 1 g, sodium and potassium to 50 mg, micronutrients to two significant figures; never more precision than the underlying uncertainty supports.

### 4.8 Worked examples

Computed by the independent reference implementation (Appendix E). Sixteen personas: eleven are personalised, two ask for weight loss and are held at Maintain with the reason shown (`Under`, `Healthy`), and three land in reference-only mode (`U19`, `Preg`, `ED`; section 8.1). "Maintenance" is the NASEM estimate with its typical range (plus or minus one standard error); "Mifflin x PAL" is the cross-check of 4.2; protein grams per kilogram use actual body weight. The same personas are the golden vectors of section 11.1; their micronutrient references are in Appendix B.

| Persona | Who (sex, age, height, weight, activity) | BMI | Goal asked | Maintenance, kcal (typical range) | Mifflin x PAL | Target, kcal (change) | Protein g (g per kg of body weight) | Fat g (share) | Carbohydrate g (share) | Fibre g | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Asha | F, 30, 160 cm, 60 kg, low active | 23.4 | Eat well | 2,150 (1,910-2,390) | 2,060 | 2,150 | 60 (1.00) | 72 (30%) | 316 (59%) | 30 |  |
| Ravi | M, 30, 175 cm, 75 kg, low active | 24.5 | Build muscle | 2,830 (2,490-3,170) | 2,720 | 3,110 (+280) | 120 (1.60) | 104 (30%) | 424 (55%) | 44 |  |
| Meena | F, 55, 155 cm, 75 kg, inactive | 31.2 | Lose | 1,960 (1,720-2,210) | 1,800 | 1,670 (-290) | 101 (1.35) | 56 (30%) | 191 (46%) | 25 |  |
| Vikram | M, 45, 170 cm, 95 kg, active | 32.9 | Lose | 3,140 (2,800-3,480) | 3,140 | 2,670 (-470) | 121 (1.28) | 89 (30%) | 346 (52%) | 37 |  |
| Kamala | F, 72, 150 cm, 52 kg, low active | 23.1 | Maintain | 1,690 (1,450-1,930) | 1,500 | 1,690 | 62 (1.20) | 56 (30%) | 233 (55%) | 25 |  |
| Hari | M, 68, 168 cm, 70 kg, active, vegan | 24.8 | Eat well | 2,480 (2,140-2,820) | 2,480 | 2,480 | 84 (1.20) | 83 (30%) | 350 (56%) | 35 | iron x 1.8 (plant-based) |
| Arjun | M, 24, 178 cm, 58 kg, low active | 18.3 | Gain | 2,670 (2,320-3,010) | 2,520 | 3,070 (+400) | 77 (1.32) | 102 (30%) | 460 (60%) | 43 | BMI under 18.5: underweight notice |
| Priya | F, 28, 165 cm, 58 kg, active | 21.3 | Build muscle | 2,310 (2,070-2,550) | 2,290 | 2,540 (+230) | 93 (1.60) | 85 (30%) | 352 (55%) | 36 |  |
| Lata | F, 60, 150 cm, 70 kg, inactive | 31.1 | Lose (faster) | 1,840 (1,600-2,080) | 1,650 | 1,470 (-370) | 94 (1.35) | 49 (30%) | 163 (44%) | 25 |  |
| Small | F, 64, 135 cm, 48 kg, inactive | 26.3 | Lose (faster) | 1,470 (1,230-1,710) | 1,180 | 1,200 (-270) | 67 (1.40) | 40 (30%) | 143 (48%) | 25 | calorie floor limits the deficit |
| Sam | avg, 35, 170 cm, 70 kg, low active | 24.2 | Maintain | 2,480 (2,190-2,770) | 2,420 | 2,480 | 70 (1.00) | 83 (30%) | 364 (59%) | 35 |  |
| U19 | F, 17, 160 cm, 55 kg, low active | 21.5 | Lose | Reference-only: under 19 | no targets | no targets | | | | | no calorie, weight or macro targets, no score |
| Preg | F, 32, 160 cm, 62 kg, low active | 24.2 | Maintain | Reference-only: pregnant or breastfeeding | no targets | no targets | | | | | no calorie, weight or macro targets, no score |
| ED | F, 35, 165 cm, 58 kg, low active | 21.3 | Lose | Reference-only: eating-disorder history | no targets | no targets | | | | | no calorie, weight or macro targets, no score |
| Under | M, 40, 175 cm, 54 kg, low active | 17.6 | Lose -> Maintain | 2,410 (2,070-2,750) | 2,300 | 2,410 | 60 (1.12) | 80 (30%) | 362 (60%) | 34 | weight loss not indicated at this BMI; Maintain applied; BMI under 18.5: underweight notice |
| Healthy | F, 30, 165 cm, 60 kg, low active | 22.0 | Lose -> Maintain | 2,180 (1,940-2,420) | 2,110 | 2,180 | 60 (1.00) | 73 (30%) | 322 (59%) | 31 | weight loss not indicated at this BMI; Maintain applied |

Micronutrient references are in Appendix B (for example Asha: calcium 1,000 mg, iron 18 mg, magnesium 310 mg, zinc 8 mg, potassium 2,600 mg; Hari, a vegan 68-year-old man: iron 8 x 1.8 = **14.4 mg**; Kamala, 72: vitamin D 20 µg and calcium 1,200 mg).

**Arithmetic for Asha** (eat well): maintenance = 575.77 - 7.01 x 30 + 6.60 x 160 + 12.14 x 60 = 2,149.9, shown as **2,150** (range 2,150 plus or minus 241). Target equals maintenance. Protein 1.0 x 60 = **60 g** (11% of energy); fat 30% x 2,150 / 9 = **72 g**; carbohydrate (2,150 - 240 - 645) / 4 = **316 g**; fibre max(14 x 2.15, 25) = **30 g**.

**Arithmetic for Meena** (lose, standard pace): maintenance 1,960. Deficit = clamp(15% x 1,960 = 294, 200, 500), within 25% (490) and 750, so **-290**; target **1,670**, above her floor of 1,200. Static first-weeks rate 294 x 7 / 7,700 = 0.27 kg a week, under her cap of 0.75 kg. BMI 31.2 is over 30, so the protein reference weight is 30 x 1.55^2 = 72.1 kg and protein is 1.4 x 72.1 = **101 g** (1.35 g/kg of her actual weight).

**What the table shows.** The floor binds only for very small people (`Small`: a faster pace would give 1,176; the engine holds 1,200 and shortens the deficit from 294 to 270). The `Under` and `Healthy` personas choose Lose but are placed on Maintain with the reason shown. For some body sizes the two estimates differ by more than 15% (`Small`: 1,470 against 1,180, a gap of 20% of the NASEM value), the case that triggers the "estimates disagree" note.

### 4.9 Projecting weight change, and calibrating

**Do not use "3,500 kcal = 1 lb".** It ignores that the deficit shrinks as weight falls and expenditure adapts (1.2). A defensible, simple projection from the published dynamic model **[E]**:

- Eventual change: `deficit / k`, with **k = 24 kcal per kg per day** (Hall's rule of thumb, conservative) to **20** (the linearised model for people with excess weight): a 290 kcal/day deficit gives 12-14.5 kg.
- Time course: `change(t) = eventual x (1 - exp(-t / 500 days))`, half the change in about a year.
- Allow 1-2 kg of early glycogen and water loss in the first two weeks, not presented as fat.
- Stop at the goal weight; valid for modest changes (about 10-15% of body weight).
- Show a range, with a lower line for 50-70% adherence, and say that real results vary by about 4 kg between people after several years.

| Persona | Daily deficit | After 12 weeks | After 6 months | After 12 months | 3,500-rule would say |
|---|---|---|---|---|---|
| Meena | 290 kcal | 1.9-2.2 kg | 3.7-4.4 kg | 6.3-7.5 kg | 3.2 / 6.9 / 13.7 kg |
| Vikram | 470 kcal | 3.0-3.6 kg | 6.0-7.2 kg | 10.1-12.2 kg | 5.1 / 11.1 / 22.3 kg |

**Calibration (Phase 5, experimental, behind a flag).** The weight trend is the exponentially weighted moving average `trend = trend + 0.1 x (weight - trend)` (the Hacker's Diet method; **not validated** as a trend estimator, 1.5) with a noise band of about 0.35% of body weight for the Monday-to-Friday swing. A change in the person's energy balance can be inferred from weights alone with an individual error of about 215 kcal/day under supervised conditions (CALERIE), and from logged intake plus weights with **no published validation**. The app therefore shows a calibration *suggestion* only after at least four weeks of mostly complete logs, with its uncertainty (about 110 kcal/day after 28 days from weight noise alone, before any under-reporting), never applies it automatically, and says the estimate is experimental.

### 4.10 Register of constants

Every constant the engine uses, with its tag and what it rests on. Changing any [A] row is a product decision; changing an [R] row needs a source.

| Constant | Value | Tag | Rests on |
|---|---|---|---|
| Energy equation | NASEM 2023 Table 5-5 | [R] / [E] | NASEM 2023 |
| Equation standard error | 342 (men), 241 (women) kcal | [R] | NASEM Table 5-8 |
| Monotone activity guard | max over lower categories | [A] | artefact in NASEM men's equation |
| Estimates-disagree threshold | 15% | [A] | |
| Minimum age, personalised | 19 | [R] domain | adult DRI and equation domain (Q6) |
| BMI range, personalised | 16 to 60 | [A] | NICE CG32 (BMI under 16: refeeding and malnutrition risk) |
| Loss deficit shares / caps | 10 / 15 / 20% ; 300 / 500 / 600 kcal | [A] | NHLBI, AHA/ACC/TOS, NHS |
| Deficit cap | 25% of maintenance, 750 kcal | [A] | AHA/ACC/TOS (30%; 500-750), NASEM start (about 21-22%) |
| Weekly loss cap | 1% of body weight, 1 kg | [A] | CDC, NHLBI |
| Minimum useful deficit | 150 kcal | [A] | |
| Floors | 1,200 F / 1,500 M / 1,350 avg ; wall 800 | [G] / [A] | AHA/ACC/TOS ranges; VLCD definition |
| Gain surplus | 15%, 250-500 kcal, cap +20% | [A] | NHS, Iraki |
| Muscle surplus | 10 / 5 / 0% by BMI | [A] | Iraki, Slater |
| Loss availability BMI | 25 (international), 23 (Indian set) | [G] | NICE, CDC NDPP |
| Loss age rules | not from 80; from 65 only if obese | [G] | ESPEN 2019 |
| Protein g/kg | 1.0 / 1.4 / 1.2 / 1.6 ; 1.2 if 65+ | [A] inside [G] | RDA 0.8 [R]; US 2025-2030; ISSN; PROT-AGE |
| Protein cap | 2.0 g/kg | [G] | ISSN, Morton |
| Protein reference weight | weight at BMI 30 | [A] | contested (1.2) |
| Fat default / range / floor | 30% / 20-35% / 20% (15% absolute) | [A] in [R] | NASEM, WHO, FAO |
| Carbohydrate floor / range | 130 g / 45-65% | [R] | NASEM |
| Fibre | 14 g per 1,000 kcal, at least 25 g | [R] | NASEM, WHO |
| Sodium limit | 2,300 mg (2,000 optional) | [R] | NASEM 2019, WHO |
| Potassium | 3,400 M / 2,600 F | [R] | NASEM 2019 |
| Added sugars (Phase 4) | 10%, aspiration 5% | [R] | WHO |
| Saturated fat (Phase 4) | 10% | [R] | WHO, US |
| Micronutrient references | NASEM RDA / AI by band and sex | [R] | NASEM Appendix J |
| Iron, plant-based patterns | x 1.8 | [R] | NASEM 2001 |
| Judged-over-a-week nutrients | coefficient of variation up to about 65% | [A] | IOM 2000 within-person variation |
| Weight-projection constants | k 20-24 kcal/kg/day, tau 500 days | [E] | Hall 2011 |
| Weight trend smoothing | 0.1 | [A] | Hacker's Diet, unvalidated |
| Re-confirmation of loss goal | 12 weeks | [A] | NICE low-energy-diet limit |

## 5. Redesigned weekly breakdown and scoring model

The weekly view changes from "a grade, then 17 equal rows" to "how complete is this week, what stood out, how the nutrients that matter for you did, and (when the data supports it) one decomposed score". All of it is computed by the Worker from the target set and the week's items (section 9) with the rules below.

### 5.1 Design principles

Each principle is tied to what the research found (section 1) or to a failure in section 2.

1. **Insights before scores.** The first screen answers "what should I know about this week?" in at most three sentences. Self-monitoring works best combined with other techniques such as goals and feedback, and no evidence supports grades (1.5).
2. **Describe, do not judge.** Neutral, specific wording. No letter grade, no "good week / bad week", no red for eating less or more than a target. Expert consensus lists weight focus and calorie monitoring among strategies likely to raise eating-disorder risk (1.7).
3. **Say how sure we are.** Coverage and a confidence label sit above every number (7.6). Logged intake runs 15-34% low against biomarkers (1.1).
4. **Unknown is not zero**, and a partial total is a lower bound (7.1).
5. **Keep quantity and quality apart.** The nutrient score measures the *mix* of what was logged per calorie; energy against the goal, the low-intake rule and the absolute nutrient rows measure *how much*. Neither can hide the other's problem.
6. **A score must not rise when data goes missing**, must not be skewed by under-reporting or partial logging, and must be withheld on a very low intake. Flaws of exactly this kind were found in a prototype and fixed before any code was written (5.9).
7. **Every number is traceable.** Tap a row to see its target, how the target was calculated, the source and its evidence tag (R, E, G or A, section 4).
8. **Compare a person with their own targets and their own past**, never with other people.
9. **Fewer, better.** Three insights and six to eight priority nutrients up front; everything else one tap away.
10. **Make the next step small and obvious** (resolve a pending item, mark a day, fill a value).

### 5.2 What the person sees

**Report tab (this week).** Top to bottom:

```
 Report
 This week · Oct 5 - Oct 11
 [<]  This week  [>]

 +---------------------------------------------+
 | Based on 5 of 7 days            Fair        |   coverage card (7.6)
 | Mon Tue Wed Thu Fri Sat Sun                  |
 |  o   o   o   .   o   o   -                  |   o logged  . not logged  - left out
 | 2 items are waiting for food values  Open    |
 +---------------------------------------------+

 What stood out
 +---------------------------------------------+
 | Sodium averaged 3,100 mg a day              |   insight (5.6), up to three
 | The reference limit is 2,300 mg. Most came   |
 | from pickle, papad and packaged snacks.      |
 |                                See sources > |
 +---------------------------------------------+
 | Protein reached your target on 4 of 5 days   |
 +---------------------------------------------+
 | Fibre averaged 19 g a day (target 30 g)      |
 +---------------------------------------------+

 Energy                  about 2,150 kcal (1,910 to 2,390)
 +---------------------------------------------+
 | You logged about 1,940 kcal a day            |   energy card (not in low-pressure mode)
 | Mon Tue Wed Thu Fri Sat Sun  (bars + range)  |
 | Within 10% of 2,150 on 2 of 5 days           |
 | Logs usually run low; your weight is the     |
 | better guide.                                |
 +---------------------------------------------+

 Get enough            (judged on the days you logged)
   Protein    58 g   of 60 g    =========-  97%    4 of 5 days
   Fibre      19 g   of 30 g    ======----  63%    1 of 5 days
   Potassium  at least 2.1 g of 2.6 g   (partial data)
   Calcium    Not enough data (3 of 12 foods have a value)
 Keep in check
   Sodium     3,100 mg   limit 2,300 mg   ===========> 135%
 Amounts only
   Total sugars  62 g   (includes sugars in fruit and milk; no authority limits total sugars)
 Vitamins A, C, D, E, K           4-week view  >

 Nutrient mix                              about 85  >
 [sparkline: last 8 weeks]       Based on 5 of 7 days

 All nutrients >            Your targets >
 Estimates from what you logged, not medical advice. How we calculate this
```

**Nutrient detail** (tap a row):

```
 < Sodium
 3,100 mg a day on average, based on 5 days
 [Seven day cells: Mon 2,400  Tue 3,900  Wed 2,800  Thu -  Fri 3,600  Sat 2,800  Sun left out]
 Limit 2,300 mg a day            within the limit on 1 of 5 days
 Top sources this week           pickle 31%   papad 18%   packaged snacks 14%
 How this target is calculated   Chronic disease risk reduction level, US National Academies 2019  [R]
 Data                            Every food you logged has a sodium value
 Compared with your last 4 weeks about the same
```

(The food names above are illustrative; the app names the person's own top sources.)

**Four states that replace the content, never decorate it:**
- **Not enough data** (fewer than 3 assessed days): the coverage card, "logged so far" averages **without** status chips, and one sentence about what would help.
- **Generic** (no health profile): averages against generic reference values for a typical adult, labelled "General reference, not personal"; no energy verdict, no score (7.5, 8.1).
- **Reference-only** (a safety gate fired, 8.1): coverage and amounts only, with **no** targets, verdicts, energy card or score; bars appear only against numbers the person typed from their care team (6.7).
- **Low-pressure mode** (numbers hidden, 8.2): no energy card, no weights, no score, no percentages; up to three insights worded **without numbers**, limited to variety, fibre, sodium and what is missing from the log.

**All nutrients** (the existing Weekly breakdown screen, renamed): the grouped list with the search box and assessment filters kept, rebuilt on the same report. Groups: Energy and macros, Get enough, Keep in check, Vitamins and minerals.

### 5.3 Which nutrients lead

Six to eight rows lead the Report tab, chosen by goal; the rest are in All nutrients. The order is a design choice **[A]** informed by what the guidelines and surveys single out as commonly under- or over-consumed (1.3, 1.4, 1.6).

| Goal | Leads with |
|---|---|
| Eat well, Maintain | Protein, fibre, potassium, sodium, then the two judged minerals with the lowest ratio and enough data |
| Lose | Energy and protein first (protein protects lean mass while eating less), then fibre and sodium |
| Gain, Build muscle | Energy and protein first, then fibre and the lowest judged mineral |
| Plant-based patterns | Adds iron, zinc, calcium and (once tracked) vitamin B12 to the candidates |
| Indian reference set | Adds iron, calcium, vitamin D and B12; sodium |

### 5.4 Assessing a nutrient

Every target has a `kind` (section 4.7). The assessment uses the **mean over assessed days of the nutrient's window** (one week; four weeks for vitamins A, C, D, E and K, 4.6), the coverage rule (7.3), and the same rule per day for "days meeting". The 90% and 75% edges are **[A]**: the first sits inside normal day-to-day and measurement noise, the second is close to the Estimated Average Requirement for many nutrients (the level at which half of people would still need more; 1.4).

| Kind | State | Rule | Label | Tone |
|---|---|---|---|---|
| minimum (protein, fibre, potassium, vitamins, minerals) | meets | at least 90% of target | On target | success |
| | close | 75% to under 90% | A little low | neutral |
| | below | under 75%, and coverage at least 90% | Below target | warning |
| | unknown | coverage rule (7.3) | Not enough data / Some foods have no value | muted |
| limit (sodium; later saturated fat, added sugars) | meets | at or under the limit | Within the limit | success |
| | over | over the limit, up to 1.25x | Above the limit | warning |
| | well over | over 1.25x | Well above the limit | warning |
| range (macro share of energy) | in range | inside the range | In the usual range | success |
| | outside | below or above | Below / above the usual range | neutral |
| energy | near | within 10% of the target | Near your target | success |
| | above / below | outside that band | Above / below your target | neutral; warning if below the safety floor (8.1) |

Red (`danger`) is **not** used for any of these. It is kept for exceeding an upper level that is a safety ceiling (for the few nutrients where it applies to food-sourced intake) and for data problems such as an impossible value (5.8). For a nutrient with only an Adequate Intake, "below" reads "Below the reference" and carries the IOM caveat that no probability of inadequacy can be given; with the diet-interacting-medicine flag, vitamin K, potassium and sodium show amounts only.

### 5.5 The nutrient mix score

**What it is.** A 0 to 100 summary of how well the *mix* of what was logged, per calorie, covers the person's reference intakes and stays inside the sodium standard. It is shown only when the data supports it, always with its parts, never as a grade, and called **"Nutrient mix"**. It is an educational summary of what was logged, not an assessment of health, and not validated against outcomes (1.5).

**Why per calorie.** Self-reported energy runs 15-34% low against biomarkers, but nutrient *densities* match biomarker values (1.5). The Healthy Eating Index and PANDiet are built on densities and adequacy-plus-moderation sub-scores, and reviews of such scores recommend energy-adjusted intake measures. A density score is therefore robust to under-logging and partial logging, and does not reward eating less or eating more. What it cannot see, it must not claim to: **how much** was eaten is judged by the energy card, the absolute rows and the low-intake rule, and the score is withheld when intake is very low.

**Calculation** (over the assessed days of the week, 7.2; all sums are of *known* amounts, 7.3):

```
density(n)         = sum of known intake of n  /  sum of ALL logged energy  x 1,000      (per 1,000 kcal; pooled over the days, not a mean of daily ratios)
target density(n) = reference intake of n  /  (energy target / 1,000)                     ("what you would need per 1,000 kcal to meet it at your target energy")
credit(n)          = min( 1 ,  density(n) / ( 0.9 x target density(n) ) )                  (full credit from 90%, the same edge as "On target")
sodium credit      = clamp( (2,000 - density) / 900 , 0 , 1 )                              (HEI-2020: full at 1,100 mg per 1,000 kcal or less, zero at 2,000 or more)
points             = credit x the component's points
```

| Component | Points | Standard |
|---|---|---|
| Protein | 10 | credit(protein); target from 4.4 [R/G] |
| Fibre | 10 | credit(fibre); target from 4.4 [R] |
| Potassium | 5 | credit(potassium); NASEM Adequate Intake by sex [R] |
| Calcium, iron, magnesium, zinc | 5 each (20) | credit(n); NASEM RDA by age and sex [R]. Chosen because their day-to-day variation is low enough to judge from a week (4.6); the equal weighting is Mean Adequacy Ratio style [E] |
| Sodium | 10 | HEI-2020 density standard above [R] |
| *Saturated fat (Phase 4)* | *10* | *linear: full at 8% of energy or less, zero at 16% or more; HEI-2020 [R]* |
| *Added sugars (Phase 4)* | *10* | *linear: full at 6.5% of energy or less, zero at 26% or more; HEI-2020 [R]* |

So the maximum is 55 points now (75 with Phase 4) and the score is `100 x points earned / maximum`. Vitamins A, C, D, E and K are **not** in the weekly score: they vary too much day to day (1.4) and have their own four-week view.

**Unknown parts earn nothing and stay in the denominator** (the lower-bound rule of 7.1 applied to the score):

1. **Adequacy components** (protein, fibre, potassium, each mineral) use the known amounts over *all* logged energy. A food with no value can only add to the truth, so the credit is a valid minimum. A component counts only if its coverage is at least 80% (7.3); otherwise it is **unknown** and earns 0.
2. **Sodium is a limit**, and a partial total can prove "over" but never "within". It earns points only if **every** logged item has a sodium value, or if the known sodium already earns zero. Otherwise it is unknown and earns 0. (Coverage for a limit is the lower of the energy share and the item share, because pickles, papad and chutneys are few calories and much sodium.)
3. **If everything is known the score is "about N"**, rounded to the nearest 5. **If any component is unknown it is "at least N"**, rounded down to the nearest 5, with the unknown components named and a link to fill them in. If the unknown components are worth **more than a quarter of the points**, the score is withheld ("Not enough nutrient data to score").
4. **No score beside a very low intake.** If three or more logged days are under the safety floor (the `low_intake` notice, 5.6), the score is withheld: a nutrition score next to a very low intake is the wrong message, and a density score cannot tell a good diet eaten from a good diet barely eaten.

Rules 1 to 3 make "missing data can never raise the score" true by construction. They came out of the prototype (5.9): a first version averaged the components that remained, so a week with missing values could score *higher*; a randomised check over 4,000 weeks with values blanked at random found that design **raised the score in 1,436 of the 2,331 weeks it still scored, by up to 10 points**, while the final rules raised it in none of the 1,594 weeks they scored. The price is honest: **expect the score to be absent or "at least" for a good while**, because most foods have no mineral or sodium values yet. It lights up as the foods a person eats most get filled in, and the "foods with gaps" worklist (Phase 4) is how. The energy card, the nutrient rows and the insights work with whatever data exists.

**Withholding.** The score is not shown, with the reason, when: fewer than 3 assessed days; incomplete days or unresolved foods; thin nutrient data (the unknown share above); generic or reference-only mode; low-pressure mode; the `low_intake` notice is active.

**Showing it.** The card shows the rounded value ("about 90" or "at least 80"); the breakdown shows the exact value, the points per component, each component's coverage and which components are unknown. With 4 or 5 assessed days the breakdown also shows the range obtained by leaving out each day in turn (a jackknife), so a score that depends on one day is visibly fragile (with 3 days the score is labelled Rough and no range is shown, because each subset would rest on two days); this is the uncertainty bound the composite-indicator handbook asks for (1.5). The trend sparkline compares the week with the mean of the previous four weeks that had at least 3 assessed days, and says "about the same" unless the difference exceeds the larger of 5 points and one standard deviation of those weeks **[A]**.

**What it is not.** It does not replace the energy card or the nutrient rows. It is not predictive: food-pattern indices such as the Healthy Eating Index are associated with lower mortality in large cohorts, but a nutrient-only index like this one has not been tested that way, nothing shows a one-week score from self-logged data predicts anything, and the research found no evidence on the effect of showing a score. The copy says "matches your reference intakes" and never "healthy" or "unhealthy".

### 5.6 Insights

A small, fixed, deterministic rule set (no AI) turns the week into up to three sentences. Every rule has a trigger, a priority, a template and an evidence tag, and is unit-tested. Higher priority wins; ties go to the larger gap; at most one insight per nutrient. In generic and reference-only modes only the safety rules (priority 1) and the data rules (priority 2) run.

| Priority | ID | Trigger | Template (draft, for review) |
|---|---|---|---|
| 1 Safety | `low_intake` | 3 or more non-empty days under the sex-specific floor (4.3), in any state | "On {n} days you logged under {floor} kcal. If that is what you ate, a doctor or dietitian can help you eat enough. If meals are missing, adding them gives a better picture." |
| 1 | `rapid_loss` (Phase 5) | weight trend falling faster than 1% of body weight a week for 2 weeks | "Your weight has been dropping faster than the usual 0.5 to 1% a week. Slowing down is usually safer; a clinician can advise." |
| 1 | `underweight` | BMI under 18.5 from the latest weight | "Your BMI is under 18.5. A clinician can help you find a healthy weight and plan." |
| 2 Data | `few_days` | under 3 assessed days | "You logged {n} of 7 days. A summary needs at least 3." |
| 2 | `incomplete_days` | one or more `partial` days | "{day} looks incomplete (about {kcal} kcal). Is that everything you ate?" |
| 2 | `pending_items` | any pending items | "{n} items are waiting for food values and are not counted." |
| 2 | `partial_data` | a leading nutrient has coverage under 90% | "Some foods have no {nutrient} value, so this is a minimum." |
| 2 | `implausible_day` | a day over 3,500 kcal (female calculation) or 4,200 (male; 3,850 average) | "{day}'s total is about {kcal} kcal. Check the quantities?" |
| 3 Goal | `energy_above` / `energy_below` / `energy_near` | week mean outside or inside the 10% band | "You logged about {mean} kcal a day, {pct}% {above/below} your target of {target}. Logs usually run low." / "...within 10% of your target on {k} of {n} days." |
| 3 | `protein_gap` | protein mean under 90% of target, coverage 90% or more | "Protein averaged {x} g a day against a target of {y} g." |
| 3 | `weight_vs_plan` (Phase 5) | at least 3 weeks and 6 weigh-ins | "Your trend weight changed {d} kg in {w} weeks; your plan expects about {e}." |
| 4 Nutrient | `sodium_over` | sodium mean over the limit (not with the medicine flag) | "Sodium averaged {x} mg a day against a limit of {y} mg. {Top sources}." |
| 4 | `fibre_low` | fibre mean under 90% of target | "Fibre averaged {x} g a day against a target of {y} g." |
| 4 | `potassium_low_sodium_high` | both flagged (not with the medicine flag) | "Potassium (from fruit, vegetables and pulses) helps balance sodium. Yours was {x} against {y}." |
| 4 | `mineral_gap` | up to two judged minerals under 75% with coverage 90% or more | "{Nutrient} averaged {x} against a reference of {y}. {Note}." Note: iron or zinc "supplements and fortified foods may not be in your log" |
| 4 | `vitamin_window` | a vitamin under 75% over the four-week window with coverage 90% or more | "Over the last four weeks, {nutrient} averaged {x} against a reference of {y}. Vitamins vary a lot from day to day, so this is a rough estimate. {Note}" Note for vitamin D: "sunlight and supplements are not counted here" |
| 4 | `weekend_pattern` | 2 or more weekend and 3 or more weekday assessed days, difference over 15% | "Weekend days averaged {pct}% {more/less} energy than weekdays." (descriptive) |
| 5 Positive | `target_met` | a priority nutrient met on every assessed day | "{Nutrient} reached your target on every logged day." |
| 5 | `improving` | a leading nutrient up by more than its noise band against the previous four weeks | "{Nutrient} is up from {a} to {b} over four weeks." |

**Upper levels.** A flag for "above the upper level" is limited to the nutrients whose Tolerable Upper Intake Level covers intake from all sources and that the app measures reliably in food: calcium, iron, zinc, vitamin C, vitamin D (4.6). Vitamin A (the upper level applies to preformed retinol, which the app cannot separate from carotenoids), vitamin E and magnesium (supplement-only upper levels) are never flagged from food totals.

**Copy rules** are in 5.8.

### 5.7 Trends and history

- **Eight weeks of history** come with the weekly report: for each week, assessed days, energy as a percentage of target, protein as a percentage of target, and the score. One query covers 56 days, inside the 62-day limit of `GET /days`.
- **Sparklines** on the Report tab for the three or four leading nutrients and the score, with the target as a reference line; a week with fewer than 3 assessed days is a gap, not a zero.
- **"Higher / lower / about the same"** only when a difference exceeds the noise band (5.5).
- **Vitamins** are shown over the rolling four weeks, never the single week.
- **Weight (Phase 5).** Weigh-ins are smoothed with an exponentially weighted moving average so a single day's water shifts do not move the trend, a rate is shown only with at least 3 weeks and 6 weigh-ins, and Monday-to-Friday swings of about 0.35% are described as normal (1.5).

### 5.8 Colour, tone and wording

| Meaning | Tone (existing kit) | Used for |
|---|---|---|
| On target, within a limit | `success` (green) | Meets, within the limit, near the energy target |
| Worth a look | `warning` (amber) | Below target (full data), above a limit, energy under the safety floor |
| Neutral, informational | `neutral` / `muted` | A little low, outside a range, not enough data, partial data |
| Problem | `danger` (red) | Only: an upper level that is a safety ceiling exceeded; an impossible food value |

Wording rules, enforced by a string-lint test (11.6):
- Use **"target", "reference", "limit", "average", "logged"**. Never "good", "bad", "clean", "cheat", "guilt", "fail", "off track", "needs attention", "streak", "perfect".
- Numbers come with their unit and their basis ("2,300 mg a day, the National Academies' sodium reduction level").
- No streaks, no daily logging reminders in this view, and a prompt to take a break is allowed (1.7).
- No instruction to eat less or more; describe the gap and the data. The one exception is the safety wording, which points to a professional.
- No advice about specific foods beyond naming the top sources from the person's own log.
- Every screen with a target or a score ends with: "Estimates from what you logged, not medical advice. How we calculate this".
- Non-colour cues for every state (labels, icons, bar markers), so nothing depends on colour alone.

### 5.9 Design check: the old app and the new model on the same weeks

Section 2.2 ran eight weeks through the current code. The same kinds of week, run through a prototype of the model above (Python, scratch, not production code; a persona whose targets come from the engine, Asha in 4.8 with a 2,150 kcal target, eating an ordinary vegetarian Indian diet of about 1,800 kcal a day), behave like this. The "Current app" column quotes the result 2.2 found for the matching scenario, where the app's own default goals were met exactly; the "Proposed model" column is the prototype on Asha's week, so the two columns compare kinds of week, not identical meals. The point of the check was to find design flaws before building. It found seven, all fixed above: (1) a density-only score that ignored starvation (now the low-intake rule); (2) a score that rose as data vanished, first because components dropped out of the denominator and then, found by a randomised check, because averaging the components that remained still rewarded gaps (now unknown parts earn nothing); (3) day validity that ignored the person's own target; (4) no low-intake notice when a week is withheld; (5) full credit only at 100% of a reference while the label said "on target" at 90%; (6) an absolute-adequacy score that would under-score everyone because logs run low (the reason for the density design); (7) energy-weighted coverage that hides sodium carried by low-calorie foods (now item coverage for limits).

| Week | Current app | Proposed model |
|---|---|---|
| An ordinary 1,800 kcal vegetarian diet, all 7 days logged | About 67, C (scenario H, a similar diet): graded against goals that are not hers | Confidence Good; score 90; protein and potassium on target, fibre a little low (26 of 30 g); sodium above the limit (2,520 mg); energy below target (1,800 of 2,150 kcal); calcium and iron below |
| Nothing logged | 50, "D / Needs attention" | Not enough data; no score; one prompt |
| Same diet on 4 days, 3 not logged | 50, "D" (same as nothing) | Confidence Fair; same averages and score as seven days (the empty days are not counted as zero) |
| Wednesday 9 am, two days logged, today in progress | 50, "D" | Not enough data until a third day; today is "so far" and not judged |
| Same diet, sodium 4,000 mg a day | 80, "A- / Strong week" even with two limits blown (scenario E) | Score drops from 90 to 78 (the sodium component falls from 6.7 to 0 of 10); "Sodium averaged 4,000 mg a day against a limit of 2,300 mg" |
| Double the food (about 3,600 kcal) | 80, "A-" | Score 90 (quantity is judged elsewhere); the energy card shows well above target and the nutrient rows show sodium far over the limit |
| Crash diet, about 1,000 kcal a day | 50, "D" (same as nothing) | Days classed "looks incomplete"; score withheld; **low-intake notice on 7 of 7 days** |
| Same crash diet, every day marked complete by the person | 50, "D" | Days count; protein, fibre, potassium, calcium, iron below target; score withheld (low intake); the same notice leads |
| Vitamin and mineral values missing on half the foods | (counted as zero) | Those nutrients show "Not enough data"; score withheld ("thin data") instead of rising |
| 40% of items pending | (silently dropped) | Days "look incomplete"; score withheld with "unknown foods" and a link to Pending |
| A realistic varied week | n/a | Score 91, range 91 to 92 across leave-one-day-out |

## 6. How goals should be personalised

### 6.1 Three kinds of target, always labelled

| Kind | Where it comes from | Can the person change it? | Label in the app |
|---|---|---|---|
| **Recommended** | Computed by the engine from the profile (section 4), with its reason and source | Not directly; change the profile | "Recommended" |
| **Custom** | The person overrides one number | Yes, within the bounds in 6.4; "Reset to recommended" is always there | "Custom" |
| **From my care team** | The person types the numbers a doctor or dietitian gave them (Q7) | Yes; used as typed, with only a sanity check (6.4) | "From your care team" |

Reports always say which kind a target is, because "you met your target" means something different for each. A custom or care-team target changes what the bar is drawn against and nothing else: it does not change the score's standards (5.5), which are fixed reference values.

### 6.2 The life of a target set

A **target set** is an immutable, versioned snapshot (`target_sets`, 9.1). The report judges each day against the set that was in force that day, so changing a goal or weight never rewrites last month.

A new set is created, effective today in the person's time zone, when:

| Trigger | Rule |
|---|---|
| First profile save | Always |
| Any profile input changes (height, activity, goal, pace, eating pattern, reference standard, sex used for calculations) | Always |
| A weigh-in differs from the weight the set used by 3% or 2 kg, whichever is larger **[A]** | Recompute energy and protein; micronutrients are unaffected |
| Age crosses a reference band (30 to 31, 50 to 51, 70 to 71) | Recompute micronutrients; checked on the first request after the birthday month |
| The safety check changes | The mode may change (8.1) |
| A loss goal reaches 12 weeks | The safety check is re-asked and the person chooses (8.1, G11) |
| The engine version changes | **Not automatic.** The person is offered "Updated targets are available" with a short list of what changes |

When a set changes, the app shows what changed and why in two lines ("Calories 1,900 to 1,850 because your weight changed"), never silently. A weigh-in that moves the weight by less than the threshold is stored and shown in the trend but changes no target, which keeps targets from wobbling with the scale.

### 6.3 What each goal personalises

| Goal | Energy | Protein | What "this week" measures | Check-in and exit |
|---|---|---|---|---|
| **Eat well** (general health) | Maintenance estimate | Per 4.4, general-adult value | Nutrient adequacy and limits; the score trend | None; weight is optional |
| **Maintain weight** | Maintenance estimate | Per 4.4 | Energy near target on most days; weight stable over 4 weeks (Phase 5) | If the weight trend drifts by more than 3% in 4 weeks, offer to adjust |
| **Lose weight** | Maintenance minus a bounded deficit (4.3), never under the floor | Higher per kg to protect lean mass (4.4) | Energy near target, protein met; observed against planned weight change (Phase 5) | At 12 weeks the safety check is re-asked; when BMI reaches the lower edge of the allowed range or the person's target weight, suggest Maintain |
| **Gain weight** | Maintenance plus a modest surplus (4.3) | Per 4.4 | Energy near target; weight trend upward at the planned rate (Phase 5) | After the planned weeks, suggest a review |
| **Build muscle** | Maintenance plus a small surplus | Higher per kg (4.4) | Protein met on most days; energy near target; weight trend (Phase 5) | Same as Gain |

Goals never change a micronutrient or a limit. They change energy, protein and the order of the report (5.3). Where a goal is not offered (8.1, G6 to G9), the engine applies Maintain, says why, and lists the goals that are available.

### 6.4 Overrides and their bounds

A custom value is the person's choice: any positive number is saved (2026-10-13: the bounds below used to refuse values, and now only warn). Outside the bounds below, the app says why in plain words, while the number is typed and next to the saved target, and the recommended value stays in view. The bounds address the failure in P4 (any positive number accepted *silently*). They are **[A]**, tied to the standards named. A saved value outside them is labelled "outside the usual bounds", never changed.

| Target | Usual low | Usual high | Outside the bounds (saved in every case) |
|---|---|---|---|
| Energy (personalised mode) | The sex-specific floor: 1,200 kcal (female), 1,500 (male), 1,350 (average) [G] | 125% of the maintenance estimate, to the nearest 10 kcal [A]. If the person is very active, the better answer is a higher activity category | A warning with the reason; below the floor it says a doctor or dietitian can help set a target that low. Without personal targets the placeholders are 1,200 and 6,000 kcal |
| Protein | The Recommended Dietary Allowance for the reference weight (0.8 g/kg) [R] | 2.0 g/kg of reference weight [G] | Below: a warning. Above: a note ("no authority sets an upper limit for healthy adults; 2.0 g/kg is the highest figure guidelines treat as typical; with kidney disease talk to your care team first") |
| Fat, carbohydrate | The low edge of the usual share of energy (20-35% and 45-65%) | The high edge | A warning naming the usual range in grams |
| Fibre | 50% of the recommended value | 300% of it | A warning |
| Total sugars | None (no authority limits total sugars, 1.3) | None | Saved as a personal limit, labelled Custom |
| Sodium limit | 1,500 mg, the Adequate Intake [R] | 2,300 mg, the reduction level [R] | Below 1,500: a note (a limit under the adequacy level asks for less than the body usually needs). Above 2,300: a warning |
| A vitamin or mineral | 50% of the recommended value | The Tolerable Upper Intake Level where it covers food-sourced intake (calcium, iron, zinc, vitamin C, vitamin D), otherwise 300% of the recommended value [R / A] | A warning |

Only a number that cannot be a target (not a number, zero or less, over 100,000) is refused. Care-team numbers (6.7) keep their typo guard.

### 6.5 Pace and target weight

- **Pace** (Lose and Gain only) is a three-step choice limited to the engine's safe range (4.3). It shows the resulting daily calories and a plain sentence about the expected change, with its uncertainty (4.9).
- **Target weight** is optional. If set, its BMI must be at or above the lower edge of the allowed range for the reference standard (not under 18.5). When the weight trend reaches it, the app proposes Maintain.
- Neither is available in reference-only mode or low-pressure mode.

### 6.6 Check-ins

At most one prompt every four weeks: "Update your weight?" It can be dismissed, never appears in low-pressure mode, and a missed weigh-in changes nothing. There are no streaks, no reminders about weight, and no "you are behind" messages.

### 6.7 Targets from a care team

For a `reference_only` profile that chose "I have targets from my care team", the person types a number for any of: energy, protein, carbohydrate, fat, fibre, sodium, potassium, and any vitamin or mineral. The app:

- accepts them as typed after a sanity check only: energy 500 to 6,000 kcal, every other value positive and no more than ten times the generic reference value (a typo guard, not a clinical judgement);
- labels them "From your care team" everywhere;
- draws bars against them and reports amounts, but computes **no energy verdict beyond "near / above / below", no weight advice and no score** (5.5, 8.1);
- never adjusts them when weight changes, and still shows the notices in 8.6 that do not depend on targets.

### 6.8 Profiles on a shared phone

Each profile has its own health profile, secret and target sets. Switching profiles clears the health context from memory. The profile picker shows names only (as it does now), and no health data is readable without the profile's secret (8.3).

## 7. Handling of missing, incomplete or unreliable data

Self-logged food data is incomplete by nature, and in this app it is more incomplete than usual: nutrient values are typed in by people, most foods lack most vitamins and minerals, and a food nobody has entered yet counts for nothing. The current screens turn every gap into a confident number (section 2, P8 to P16). The rules below make the gaps visible and keep them from becoming conclusions. They were run on synthetic weeks in a prototype of the model (5.9).

### 7.1 Principles

1. **Unknown is not zero.** A missing day, an unknown food and a blank nutrient are three different kinds of unknown. None of them is ever added as 0. (USDA and FAO/INFOODS say the same of food-composition tables, 1.4.)
2. **A partial total is a lower bound.** If some contributions are unknown, the true total is at least what was summed. A lower bound can prove "over" (a limit already exceeded) and can prove "enough" (a minimum already reached). It can never prove "under". This one rule removes most false alarms.
3. **Never impute.** No averages are borrowed from similar foods or similar days. Imputation would hide exactly the gaps a person can fix, and score constructors warn against "forgetting that an imputation has been carried out" (1.5).
4. **Judge less when we know less.** Fewer days, lower coverage or lower confidence mean fewer verdicts, not smaller ones.
5. **Say what we did not count, and how to fix it.** Every omission names its cause and links to the fix (mark the day, resolve the pending item, add a food value).
6. **Describe the log, not the person.** Copy says "you logged", never "you ate".

### 7.2 What state is a day in?

A day is classified from its items, the person's target and the person's own marks. All thresholds are design choices **[A]**; they sit in one config object and are covered by tests.

| State | Rule | In weekly averages | Shown as |
|---|---|---|---|
| `future` | After today | no | blank |
| `in_progress` | Today, not marked complete | no (never judged) | "Today so far" |
| `skipped` | Marked "leave this day out" (illness, travel, a festival) | no | "Left out" |
| `confirmed` | Marked complete, even with few or no items (a fasting day) | **yes** | "Complete" |
| `empty` | No items, not marked | no | "Not logged" |
| `partial` | Marked partial; **or** more than one third of its items are pending; **or** logged energy is under the larger of **500 kcal** and **60% of the person's energy target** (generic and reference-only modes have no personal target, so only the 500 kcal floor applies) | no | "Looks incomplete" with a one-tap "It is complete" |
| `valid` | Everything else | **yes** | "Logged" |

Why these edges:
- **"Under 60% of the person's own target"** catches a half-logged day without hiding real low-intake days, because the person can confirm the day. It is relative to the target, not absolute, so it works for a 1,300 kcal plan and a 3,000 kcal plan alike. A day that is `partial` for being low is also counted for the low-intake notice below.
- **"More than one third pending"** means a third of what was eaten has no values; the day cannot be assessed until the foods are resolved.
- **Low intake is reported separately from validity.** Every non-empty day under the safety floor (1,200 kcal female or unknown, 1,500 male, 1,350 average; section 4.3) is counted for the `low_intake` notice (8.6), whatever its state. A crash-diet week is classed `partial` for averages and still triggers the notice (scenario in 5.9).
- **Implausibly high days** (over 3,500 kcal on the female calculation, 4,200 on the male, 3,850 on the average and when there is no profile) are counted, but flagged "check the quantities?", because a typo is more likely than a day that large. These are the upper cut-offs cohort studies use to exclude implausible averages (1.1); applied to a single day they are only a prompt, since a festival day can legitimately be large. No source supports a higher cut-off.

### 7.3 What do we know about a nutrient? Coverage and the lower-bound rule

For each nutrient and week, **coverage** is the share of logged energy that comes from foods which have a value for that nutrient, over the assessed days. Weighting by energy, not by item count, stops a pending cup of tea from outweighing a main meal.

| Coverage | Meaning | Assessments allowed |
|---|---|---|
| 90% or more | Treated as complete | all: meets, close, below, over limit |
| 50% to under 90% | Partial: the total is a lower bound | A **minimum** can be shown as **met** (the known amount already reaches it) but never as below; a **limit** can be shown as **exceeded** but never as within the limit. Everything else becomes "unknown (some foods have no value)" |
| Under 50% | Not enough data | none: "Not enough data (3 of 12 foods have a value)" with a link to fill them in |

The 90% and 50% edges are **[A]**. The asymmetry is the lower-bound rule from 7.1: with partial data, 3,100 mg of sodium is already over the limit whatever the rest holds, and 70 g of protein already meets a 60 g target, but 400 mg of calcium says nothing about whether the week was low, and 1,800 mg of sodium says nothing about whether the week stayed within the limit.

**For a limit nutrient, coverage is the lower of two shares**: the share of logged energy from foods with a value, and the share of logged *items* with a value. Pickles, papad, chutneys, sauces and salt are few calories and much sodium, so an energy-weighted share can read 98% while a fifth of the sodium is missing.

Zero is data too: a food entered with vitamin D = 0 counts as known, a blank counts as unknown. The food editor and the API keep the distinction already in place (`null` vs `0`, [nutrients.ts](worker/src/domain/nutrients.ts)).

The components of the score use the same rule with a stricter 80% edge (5.5).

### 7.4 Checking the food data itself

The shared foods table is the largest source of silent error: one wrong edit changes every user's totals (P15). Checks run in the food editor and on the API, and never block a save unless the numbers are impossible.

**Hard rules: reject with a specific message** (the values cannot all be true):
- sugars greater than carbohydrate; fibre greater than carbohydrate; saturated fat greater than total fat; added sugars greater than sugars;
- for a `100 g` or `100 ml` base: protein + carbohydrate + fat over about 102 g; calories over 900 (pure fat is about 900 kcal per 100 g); sodium over 40,000 mg (pure salt is about 39,000 mg of sodium per 100 g).

**Soft rules: warn, let the person confirm**:
- **Calories versus macros.** Energy is expected near 4 x protein + 4 x carbohydrate + 9 x fat kcal, the general Atwater factors that US food-labelling regulations specify (21 CFR 101.9(c)(1)(i)(B), which also allows subtracting insoluble fibre; the check is loose enough that this does not matter). Labelled calories, total sugars, fats and sodium may exceed the declared value by up to 20% (21 CFR 101.9(g)(5)), so the check warns outside roughly 75% to 125% and is skipped under 20 kcal, where rounding dominates. This one check catches most typos in the field that matters most.
- **Implausible per-serving values** (heuristics **[A]**): over 1,500 kcal in one katori, cup, piece or slice; over 5,000 mg sodium; a vitamin or mineral over ten times its daily reference in one serving.
- **Unit conversions** that put one "piece" at an implausible weight, using the conversion row already stored.

**Provenance, not authority.** Each food records where its numbers came from (`label`, `database`, `recipe`, `estimate`) and when someone last reviewed them (migration 0003). The app does not rank foods by trust in v1; it uses provenance for the "foods with gaps" list (4.1) and shows it on the food screen so people can tell a label from a guess. A change history for foods (previous values and who changed them) is a cheap addition if a bad edit ever slips through.

**Where values may come from.** Indian packs carry energy, protein, carbohydrate, total and added sugars, fats, saturated fat and sodium (FSSAI labelling regulations), so people can copy the new nutrients of migration 0003 from a label. The Indian Food Composition Tables (IFCT 2017) are a free PDF of 528 raw foods with no cooked dishes (no idli, dal or roti), and their licence forbids storing or reproducing them electronically "for creating a product" without the National Institute of Nutrition's written permission; seeding the shared table from them needs that permission (decision Q14).

### 7.5 When there is no profile, or a gate fired

| Mode | What the weekly view shows |
|---|---|
| `generic` (no health profile yet) | Coverage, averages on the days that count, and each nutrient against **generic reference values** for a 2,000 kcal adult diet (4.6), labelled "General reference, not personal". No energy verdict, no weight advice, no score, and a card that explains how to get personal targets in about two minutes |
| `reference_only` (a gate fired, 8.1) | Coverage and amounts only: **no** targets, no verdicts, no energy target, no score. The care-team path (6.7) turns on bars against the person's own numbers |

Both keep the low-intake notice (floor 1,200 kcal when sex is unknown) and the data-quality messages, and both can use low-pressure mode.

### 7.6 How sure are we? The confidence label

The weekly card carries one of four labels, from the number of assessed days, the pending share and whether a weekend day is included. The edges are **[A]**, set with the evidence on how many days of records a stable weekly mean needs (1.4: within-person variation); they are tuned in one place.

| Label | Rule | What is shown |
|---|---|---|
| Not enough data | Under 3 assessed days | Coverage card and "logged so far" figures, **no verdicts, no score**, a plain prompt |
| Rough | 3 assessed days | Averages and insights with "based on 3 days"; score only if the data allows |
| Fair | 4 or 5 assessed days, or 6 or 7 with more than 10% pending items or no weekend day | Everything, with the label |
| Good | 6 or 7 assessed days, at most 10% pending items, at least one weekend day | Everything |

Whatever the label, the report says "Estimates from what you logged; real intake is usually a little higher" and never presents a value to a false precision (energy to the nearest 10 kcal, grams to the nearest whole gram above 10 g, a score to the nearest 5 on the card and to the nearest point only inside the breakdown).

### 7.7 Unreliable information

**About the person**
- **Self-reported height and weight** are close but biased in many people (weight is commonly a little under-reported and height a little over-reported), so the interface says "your best estimate is fine" and the energy estimate is shown as a band, not a point (4.2).
- **Hard and soft limits** on every field (3.2). A soft limit asks "is that right?"; a hard limit blocks.
- **A stale weight** (older than 90 days) puts a quiet note on the targets screen ("based on your weight in July"); it never blocks.
- **Implausible changes** between weigh-ins (over 3 kg in a day) ask for a re-check before they move the targets.
- **Unrealistic goals** are bounded by the engine (4.3), not by a warning alone.
- **Age cannot be verified.** Someone can enter a false birth year to pass the age gate. This is accepted: the gate is a safeguard and a statement of intent, not an identity check; the standard disclaimers apply to everyone.

**About what was logged**

| Known problem | Evidence | What the app does |
|---|---|---|
| **Logs run low.** Self-reported energy is 15-34% below biomarker-measured energy in US adults aged 50-74 (more with obesity); about a quarter of US adults are flagged as under-reporters; the first logged day reports least | Biomarker and doubly-labelled-water studies (1.1, 1.4) | Wording ("real intake is usually a little higher", "your weight is the better guide"); the score uses nutrient *densities*, which match biomarker values far better than absolute amounts (5.5); "below target" on energy is neutral in tone, never red; nutrient totals are lower bounds; **no automatic correction upward**, and no per-person under-reporter flag in v1 (the published cut-offs have limited power for one person) |
| **Portions are loose.** A katori is 115, 155, 200 or 360 ml in the national guidelines' own annexure, so the unit people say most can differ threefold | DGI 2024 (1.6) | The food editor shows what one katori (or piece) of that food is taken to be; people can edit a food's unit conversions, which already exists. Per-person portion sizes are not added in v1 |
| **Supplements, fortified foods, cooking oil, restaurant meals** are rarely logged | General dietary-assessment limits | Notes on the nutrients most affected (iron, zinc, vitamin D, B12; 4.6) and on sodium |
| **Weekends differ** (about +82 kcal a day on Friday to Sunday against Monday to Thursday in US adults) | 1.5 | Weekday and weekend are shown separately when both have data; a weekend day is part of the "Good" label |
| **Typos** | Section 2, P15 | The checks in 7.4 and the "check the quantities?" prompt |

### 7.8 What the person sees

| Situation | Message (draft, for review) | Action offered |
|---|---|---|
| Fewer than 3 assessed days | "You logged 2 of 7 days. A summary needs at least 3." | Add a day |
| A day looks incomplete | "Thursday looks incomplete (about 700 kcal). Is that everything you ate?" | It is complete / Add food / Leave out |
| Pending items | "6 items are waiting for food values and are not counted." | Open Pending |
| Partial nutrient data | "Some foods have no vitamin D value, so this is a minimum." | Fill in values |
| Not enough nutrient data | "Not enough data for calcium (3 of 12 foods have a value)." | Foods with gaps |
| Over a limit on partial data | "Sodium was at least 3,100 mg a day." | See sources |
| Very low logged intake | "On 5 days you logged under 1,200 kcal. If that is what you ate, a doctor or dietitian can help you eat enough. If meals are missing, adding them gives a better picture." | Add food / Learn more |
| Possible typo | "Tuesday's total is about 4,400 kcal. Check the quantities?" | Open the day |

### 7.9 What we never do

- Add an unknown as zero, or fill it with a typical value.
- Correct logged energy upward for assumed under-reporting.
- Show a score, a grade or a verdict from fewer than 3 assessed days or from thin nutrient data.
- Treat "no data" as "good" (the current app does this for sugar and sodium on an empty week).
- Let a day with unresolved items silently count as complete.
- Change a past week because a weight or goal changed (targets are versioned, 6).

## 8. Safety, privacy and medical disclaimers

This section is a design for a dietitian and a privacy or legal reader to review (decision Q18). It is not clinical or legal advice. Three ideas run through it:

1. **Safety lives in gates and defaults, not in disclaimers.** Required by both app stores, disclaimers are the weakest safety tool: the one review of experiments found media disclaimers "ineffective ... and in some cases actually harmful", and none exists for health apps (1.7). A gate that never produces a risky target works whether or not anyone reads anything.
2. **Ask the least, store the least, and keep it away from the voice assistant.** Each field in section 3 changes a number or a message; the safety answers are not stored at all.
3. **Everything the app says is general wellness information**: estimates from what was logged, compared with published reference values, never a diagnosis or a treatment.

### 8.1 Who gets personal targets: three modes and the gates

| Mode | When | What the person sees |
|---|---|---|
| `personalised` | A complete health profile and no gate fired | The full model: an energy target with its range, macro and micronutrient targets, the weekly report, and a score when the data supports one |
| `generic` | No health profile (skipped, or not started) | Reference values for a typical adult on a 2,000 kcal diet, labelled "General reference, not personal" (4.6). No energy verdict, no weight advice, no score |
| `reference_only` | A gate below fired | What the person logged, as amounts and coverage. **No** targets, verdicts, energy target or score from the app. Optional: "I have targets from my care team" (the person types their own numbers; the app uses them verbatim) |

`generic` means "we know nothing about you". `reference_only` means "we know a reason not to set targets for you", so adult reference values are not shown to someone who has just told us they are under 19, pregnant, or following a clinician's diet.

**The gates.** They are evaluated by the Worker (`eligibility.ts`) on every profile save and every goal change, and the app shows the reason. Evidence tags are as in section 4.

| # | Signal | Rule | Result | Basis |
|---|---|---|---|---|
| G1 | Age from birth year | Under 19 | `reference_only`. **No body data is stored**; the flow stops with "Personal targets are for adults 19 and over, because the reference values and equations we use are for adults. You can still log food." | Adult reference intakes and energy equations start at 19 [R] (NASEM); the NHS, CDC and NIDDK programmes are adults only; India's data-protection law treats under-18s as children (DPDP s.2(f), s.9) [R]; NICE NG246 1.1.2 warns about the vulnerability of young people to eating disorders. A person aged 18 is an adult in Indian law but outside the equations' domain, so the cut is 19 (Q6) |
| G2 | Safety check: pregnant or breastfeeding | Yes | `reference_only` | NICE NG247 does not recommend weight loss in pregnancy; pregnancy and lactation need different energy and nutrient values that this plan does not model [G] |
| G3 | Safety check: an eating disorder now or in the past | Yes | `reference_only`, **low-pressure mode on by default** (8.2), a plain message to talk to a clinician | NICE NG69 and NG246 list eating disorders among reasons for clinician involvement; the NHS Digital Weight Management Programme excludes an active eating disorder; the expert consensus rates calorie monitoring and weight focus as likely to raise risk (1.7) [G] |
| G4 | Safety check: a doctor or dietitian has set a diet or calorie target | Yes (insulin or sulfonylurea-treated diabetes, kidney, heart or liver disease, cancer treatment, bariatric surgery) | `reference_only` plus the care-team path | The conditions' own guidelines set protein, sodium, potassium and energy individually and warn about hypoglycaemia or lean-mass loss (1.2) [G] |
| G5 | BMI | Under 16 or over 60, after an "is that right?" prompt | `reference_only`. Body measurements are **not** stored | NICE CG32 flags BMI under 16 as refeeding and malnutrition risk [G]; above 60 a typing error is more likely than a person, and people in that range are in clinical care [A] |
| G6 | BMI | 16 to under 18.5 | `personalised`, but **Lose is not offered**; an `underweight` notice says a clinician can help; Gain stays available | NICE CG32 (BMI under 18.5 as a malnutrition criterion) and the NHS "talk to your GP" advice [G] |
| G7 | Goal Lose | BMI under 25 (international set) or 23 (Indian set) | Not offered; Maintain is applied with the reason shown | NICE NG246 and the CDC National DPP use these thresholds [G] |
| G8 | Goal Lose | Age 80 or over; or age 65 to 79 with BMI under 30 (27.5 on the Indian set) | Not offered; Maintain applied | ESPEN: intentional loss only in obese older adults with exercise; a trial found diet-induced loss cost lean mass and hip bone (1.2) [G] |
| G9 | Goal Gain | BMI 25 or more (23 on the Indian set) | Not offered; Maintain applied | Section 4.3 [A] |
| G10 | Any loss target | Floors and caps | The target is never under **1,200 kcal** (female), **1,500** (male), **1,350** (average); nothing under **800** in any circumstance; the deficit never exceeds 25% of maintenance or 750 kcal; the first-weeks rate never exceeds 1% of body weight or 1 kg a week; a deficit under 150 kcal is not a loss goal | AHA/ACC/TOS "usual" ranges (the floors are the lower edges, not a universal rule); under 800 kcal is a very-low-calorie diet needing medical supervision (NICE, AHA/ACC/TOS, NHLBI) (4.3) [G / A] |
| G11 | Loss goal in force | 12 weeks | The safety check is re-asked and the person chooses to continue, maintain or talk to a professional | NICE keeps low-energy diets within 12 weeks and specialist care [A] |
| G12 | Safety check: "a medicine that interacts with food" | Yes | Mode unchanged. Vitamin K, potassium and sodium show **amounts only**: no verdict, insight or nudge | Warfarin (steady vitamin K), lithium (steady salt and fluid), ACE inhibitors, ARBs and potassium-sparing drugs (potassium) (1.2) [G] |
| G13 | Logged intake | Three or more non-empty days under the sex-specific floor in a week | A `low_intake` notice ("talk to a professional" wording, 8.6) and the **score is withheld** (5.5) | Section 7.2; the floors above [G / A] |

**How the answers are handled.** The safety answers travel in the request body of `POST /me/targets/preview` and `PUT /me/profile`, are used to compute the mode, and are **not stored**. The server keeps `target_mode`, the medicine yes/no, and nothing about which answer caused the mode (decision Q16). Re-asking (G11, a change of goal, or the person editing their answers in Settings) replaces the mode. "I would rather not say" is treated as "none of these", with the conservative pace default and the standard disclaimers (Q8).

**What the gates cannot do.** They run on self-declaration, so they stop people who tell us and nobody else. A false birth year passes G1; someone who has an undiagnosed eating disorder, or takes a drug they did not think to mention, passes everything. That is why the energy figure is a range, the floors and caps exist whatever the answers, the notices in 8.6 do not depend on the answers, and the wording never speaks as if the app knew the person. SCOFF-style screeners are deliberately not used: they are weak gates for people without symptoms (pooled sensitivity 0.86 and specificity 0.83 give a positive predictive value of roughly 5-14% at 1-3% prevalence), the US task force finds the evidence insufficient, NICE says never to use them alone, and no public weight-management programme uses one (1.7).

### 8.2 Low-pressure mode: designing for the people calorie numbers can hurt

**The evidence, stated plainly.** Calorie-tracking apps are consistently associated with more eating-disorder symptoms in cross-sectional studies; causality, direction and long-term effects are unknown, and the one randomised trial (low-risk women, one month) found no change. NICE includes clinician-led dietary self-monitoring in eating-disorder treatment, so tracking is not inherently harmful: context and supervision matter. Qualitative work and an expert consensus point to design features that may raise risk (a focus on numbers and weight, colour for "good" and "bad", streaks, logging reminders) and features that may lower it (health focus, flexibility, breaks). **No study has tested the mode below.** It is a precaution that follows those cues.

**What low-pressure mode does** (`numbers_hidden = 1`):

| Place | Normal | Low-pressure |
|---|---|---|
| Today | Calorie ring and numbers | Foods and meals only; no ring, no calorie totals |
| Report | Energy card, rows with amounts and percentages, score, sparklines | No energy card, no percentages, no score, no weights. Up to three insights worded **without numbers** (variety, fibre, sodium, what is missing from the log) |
| Targets and Goals | Targets, ranges, sources | Not shown; "How this app calculates things" stays readable |
| Weigh-ins | A prompt at most every four weeks | Never prompted; the weight line is hidden |
| Safety notices | Wording with numbers (8.6) | The same notices, worded without numbers |

**When it is on.** Off by default and offered on the last onboarding step and in Settings; **on automatically** after the eating-disorder-history answer; the person can always switch it off. It is available in every mode, including `generic`.

**What the app does in every mode** (not only here): neutral colours for eating less or more than a target (5.8); no streaks, badges, "perfect week" language or leaderboards; no instruction to eat less or more; no weight-loss framing on screens that do not need it; weigh-in prompts at most every four weeks and never a "you are behind" message. The daily call is the app's logging reminder; the call time is already optional in the API (`callTime` may be `null`), and a visible "pause the daily call" action in Settings is recommended (Phase 6) so that taking a break is one tap.

### 8.3 Privacy and data protection

#### 8.3.1 What is stored, and where it goes

| Data | Stored in | Why | Leaves our system? |
|---|---|---|---|
| Name, time zone, call time, Vapi public key (exist today) | D1 `users` | The profile and the daily call | Name and local time go to Vapi in the call prompt |
| Food log: raw name, quantity, unit, meal (exists) | D1 `log_items` | The log | Up to 30 of today's items go into the call prompt, to Vapi and its model provider |
| Call record, **including the transcript** (exists) | D1 `calls.transcript` | Showing what happened when a call saves nothing | No. Worker logs never carry transcripts (webhook.ts) |
| Health profile: birth year (month), sex used for calculations, height, activity, goal, pace, eating pattern, reference set, mode, medicine flag, hide-numbers | D1 `health_profiles` | Targets | **No** |
| Weigh-ins | D1 `weight_entries` | Trend, recalculation | **No** |
| Target sets (inputs and outputs) | D1 `target_sets` | History and "why this number" | **No** |
| Day marks | D1 `day_status` | The report | **No** |
| Safety-check answers | Nowhere: used once, only the resulting mode is kept | Gates | **No** |
| The per-profile secret | The phone's Keychain or Keystore; SHA-256 in D1 | Access (8.3.2) | **No** |
| The voice call | Vapi and the vendors it routes to (in this configuration Deepgram for speech recognition and OpenAI for the language model) | The call | **Yes**. The assistant is built with `recordingEnabled: false` and with call summaries and success evaluation off; transcripts and logs follow the Vapi account's settings |

**The boundary that never moves:** nothing from the health profile, weigh-ins or targets is put in the voice prompt, the first message or the call metadata. Vapi's own guidance says not to put health information in an assistant prompt, and the prompt already tells the model never to discuss calories or health advice. A canary test enforces the boundary (11.8).

#### 8.3.2 Access control: the shared token is not enough for body measurements

**The problem.** Every request carries one bearer token, `APP_TOKEN`, compiled into every copy of the app, plus an `X-User-Id` header, and `GET /profiles` lists every profile's id and name. Anyone who extracts the token from the APK can read or overwrite any profile. That was an accepted risk for "friends only, non-sensitive" data (README, PLAN.md); it stops being acceptable once height, weight and goals are stored. OWASP rates a hard-coded credential Easy to exploit, Easy to detect and Severe in impact, and recommends rotation and revocable per-user tokens.

**The design.**
- At `POST /profiles` the Worker creates a 256-bit random secret (the repo's `randomToken()`), returns it **once**, and stores only its SHA-256 in `users.secret_hash`.
- The app keeps it in the Keychain or Keystore (react-native-keychain), never in plain storage, and sends it as `X-Profile-Secret` on health-scoped routes. The Worker compares hashes in constant time (the repo's `safeEqual`) and answers 403 otherwise.
- **Health-scoped routes:** `/me/profile`, `/me/targets`, `/me/weights`, `/me/export`, `/me/health-data`, `/me` (delete), and `/reports/weekly`, because a report reveals targets and energy. Food routes, `GET /days` and the Vapi webhook (which has its own per-user `webhook_token`) are unchanged in Phase 2, so existing profiles and older app versions keep working.
- **Recovery code.** The secret is shown once as a recovery code to store in a password manager. A new phone or a reinstall asks for it. Losing it makes the health data unreachable; the person starts a new profile (decision Q17). The iOS Keychain can survive an uninstall, so a fresh install may find an old secret: the app verifies it with the server and offers "start over" if it no longer matches.
- **Existing profiles** claim a secret with `POST /me/secret`, which works only while `secret_hash IS NULL`. Whoever claims first wins, so a hostile friend could claim another's profile before they do and block their health features (not their food log). The owner can clear a hash with one SQL statement (a documented runbook). Accepted for a friends-only app.
- **Residual risk, stated.** Food logs and call transcripts remain reachable with the shared token alone. Extending the secret to every user route is a hardening step for Phase 6, after all friends have updated (it needs a grace period, because the Vapi webhook and older app versions do not send it).

#### 8.3.3 Export, erasure and retention

- `GET /me/export` returns everything stored about the person's health profile, weigh-ins, target sets and day marks as JSON.
- `DELETE /me/health-data` removes exactly those rows and leaves the food log.
- `DELETE /me` deletes the whole profile. **No delete route exists today**, which Apple's guideline 5.1.1(v) requires of an app that lets people create an account. Because `calls`, `log_items` and `user_goals` reference `users(id)` **without** `ON DELETE CASCADE`, the handler deletes explicitly, in one batch: `log_items`, `calls` (including transcripts), `user_goals`, then sets `foods.added_by`, `food_aliases.added_by` and `food_units.added_by` to null, then deletes the `users` row, which cascades through the new health tables. Foods the person added stay in the shared list without their name, and the notice says so.
- **Backups.** Cloudflare D1 encrypts data at rest and in transit, but its Time Travel history is always on and keeps restorable states for 7 days (Free plan) or 30 days (Paid), visible only to the database owner. Erased rows therefore leave backups after that window, and the notice must say "removed now, and from backups within 30 days".
- **Retention.** Kept until the person deletes it; no expiry in v1. Recommended in Phase 6: purge `calls.transcript` after 30 days, since it is only used to explain a failed call. The DPDP Act asks for erasure when consent is withdrawn or the purpose is no longer served (s.8(7), s.12(3)); a retention rule for idle profiles is a question for Q18.
- **Logs.** No request bodies, no profile fields, no transcripts, no weights in Worker logs (11.8).

#### 8.3.4 The voice assistant and the people behind it

The current call already sends the profile's name, the local time and up to 30 of today's food items to Vapi and, through it, to a speech-recognition and a language-model provider. Those foods are personal and arguably health-adjacent data. The plan's response is to **disclose, ask permission, and send nothing new**:

- The consent screen names Vapi and its providers and says what they receive. Apple's 5.1.2(i) requires disclosing where personal data is shared with third parties "including with third-party AI" and obtaining explicit permission, which reaches this feature.
- The README recommends Vapi's **Zero Data Retention** setting for each account (it prevents Vapi keeping recordings, transcripts, messages, summaries and structured outputs; Vapi's default is to store logs and transcripts and its privacy policy says they may be used to improve models). Each friend uses their own Vapi account, so retention is each person's own setting; the owner can recommend, not enforce.
- The call metadata carries the internal user id; it carries nothing else and stays that way.

#### 8.3.5 Laws and store rules that bear on this

Read as a design checklist, not legal advice (Q18). "Applies when" is the reading to confirm with a lawyer.

| Rule | Applies when | What it asks | The plan's response |
|---|---|---|---|
| **India, DPDP Act 2023 and Rules 2025** | Processing digital personal data in India (s.3(a)); the Act does not apply to data an individual processes "for any personal or domestic purpose" (s.3(c)(i)). Whether an app shared with friends falls inside that is a legal question. **The core duties start on 13 May 2027** (18 months after 13 Nov 2025), so they are not yet in force; a shorter timeline was proposed and could not be confirmed | Notice and consent in plain language; reasonable security safeguards (s.8(5); penalty up to Rs 250 crore); notice of a breach to the Board and to each affected person (s.8(6); the Rules ask the Board within 72 hours); erasure on withdrawal (s.8(7), s.12(3)); for under-18s, verifiable parental consent and **no tracking or behavioural monitoring** (s.9). Health data is **not** a special category in the Act | Design for it now: the notice and consent screen, per-profile secret, export and erase, breach runbook, and the 19-and-over gate with nothing stored for younger people |
| **EU and UK GDPR** | Only if the app is offered to people in the EU or UK (Art 3(2)) | Health data is special-category (Art 9): explicit consent; breach notice in 72 hours (Art 33); erasure (Art 17); a data-protection impact assessment for large-scale processing (Art 35) | Not targeted. The design is compatible; a lawyer reads it before any EU user is invited |
| **US FTC Health Breach Notification Rule** (2024 amendment) | Apps that track "diet" and sell to US consumers | An unauthorised **disclosure** is a breach, not only a hack; notice within 60 days. Enforcement history: GoodRx, Premom, WW/Kurbo (which also required deleting data and algorithms) | No advertising or analytics SDKs; nothing leaves except to the processors named above |
| **Washington My Health My Data Act** and similar state laws | Consumer health data of Washington residents, including measurements | Consent to collect; right to delete | Same answer; whether it reaches an Indian friends-only app is a legal question |
| **Apple App Store** | Publishing on iOS | 1.4.1: remind users to check with a doctor; 5.1.1(i)-(iii),(v): retention and deletion policy, consent and withdrawal, data minimisation, **in-app account deletion**; 5.1.2(i): disclosure of third-party AI; 5.1.3: health data is sensitive; 1.4.5: no risky challenges | The disclaimer (8.5), consent screen, `DELETE /me`, minimal fields |
| **Google Play** | Publishing on Android | A mandatory Health apps declaration ("Nutrition and Weight Management" is a category) and a "not a medical device" disclaimer; the Data safety form | Fill both honestly; the data inventory above is the source |

#### 8.3.6 Security practices

Secrets only in the Keychain or Keystore; hashed at rest; constant-time comparison; no health fields or request bodies in logs; no third-party analytics; HTTPS only. A one-page **breach runbook** (Phase 6): who decides, how to rotate `APP_TOKEN` and clear secret hashes, what to tell affected people, and the DPDP Board notice and the US 60-day clock if either applies.

### 8.4 Regulatory posture: staying in "general wellness"

| Regulator | Where the line is | What the plan does |
|---|---|---|
| **US FDA**, General Wellness guidance (6 Jan 2026) | Claims to "promote or maintain a healthy weight, encourage healthy eating, or assist with weight loss goals" are wellness; software that "monitors and records food consumption to manage dietary activity for weight management" is not a device (its Example 3). Claims to **treat or diagnose obesity or an eating disorder** are outside it. Software that gives recommendations to patients or caregivers, not clinicians, does not qualify for the clinical-decision-support exclusion (guidance of 29 Jan 2026); FDA's wellness and enforcement-discretion policies still apply to it | Wellness wording only; no condition-specific targets; the care-team path uses the person's own numbers and computes nothing clinical |
| **EU MDR 2017/745**, Rule 11 and MDCG 2019-11 | Software is a medical device if it has a medical purpose, for example informing diagnosis or therapy decisions; "software intended to alleviate certain eating disorder behaviours" is MDCG's own example | No diagnosis, no treatment claim, no use for therapy decisions |
| **India CDSCO** medical device software guidance | Excludes software "merely intended for general wellness, promoting a healthy lifestyle ... provided it is not intended for any medical purposes" (final status unconfirmed) | Same |

**What would change the posture** (all of them need a regulatory look first): claims such as "manage diabetes", "lower blood pressure" or "treat obesity"; calculating targets for a clinical condition; accepting lab values or diagnoses; features for clinicians; any claim that the score measures health.

**Wording.** Use "target", "reference", "limit", "estimate", "what you logged". Avoid "prescription", "treatment", "diagnosis", "cure", "deficiency", "at risk of", disease names, and any sentence that tells a person what to eat. The string-lint test (11.6) enforces the list. Decision Q19 records the posture.

### 8.5 Disclaimers: wording, placement, and what they cannot do

They are included because the stores require them (Apple 1.4.1 asks apps to remind users to check with a doctor; Google asks for a "not a medical device" statement and a prompt to consult a professional) and because they are honest. They are not the safety mechanism (the gates in 8.1 are).

| Where | Text (draft, for review) |
|---|---|
| Every screen with a target, a score or a projection (a one-line footer) | "Estimates from what you logged, not medical advice. How we calculate this" |
| The score card and its breakdown | "A summary of the foods you logged against reference intakes. It is not a measure of your health." |
| The consent screen and the Targets screen (the full text) | "This app gives general information based on what you log and published reference values. It does not diagnose, treat or prevent any condition and cannot replace advice from a doctor or dietitian. Talk to one before changing your diet if you are pregnant or breastfeeding, have a medical condition, take regular medicines, or have had an eating disorder." |
| Every weight projection | "A rough guide. Real results vary a lot from person to person." |
| The "How we calculate this" page | The formulas, each number's evidence tag and source, and the list of things the app cannot know |

### 8.6 When the app says "talk to a professional"

These notices do not depend on the safety answers. Each is short, plain, never alarming, and points to "a doctor or dietitian". None names a disease.

| Trigger | Gist of the message | Shown in |
|---|---|---|
| Three or more non-empty days under the floor (`low_intake`) | "On {n} days you logged under {floor} kcal. If that is what you ate, a doctor or dietitian can help you eat enough. If meals are missing, adding them gives a better picture." | Every mode; without numbers in low-pressure mode |
| BMI under 18.5 (G6) | "Your BMI is under 18.5. A doctor or dietitian can help you find a healthy weight and plan." | Targets, Report |
| Weight falling faster than 1% of body weight a week for two weeks (Phase 5) | "Your weight has been dropping faster than the usual 0.5 to 1% a week. Slowing down is usually safer; a doctor or dietitian can advise." | Report |
| A loss goal reaches 12 weeks (G11) | A check-in: continue, maintain, or talk to a professional | Goals |
| Any gate G1-G5 | The reason in one sentence and "you can still log food" | Onboarding, Targets |
| The medicine flag (G12) | "Because you take a medicine that can interact with food, we show amounts for vitamin K, potassium and sodium without targets." | Report |
| An intake above an upper level from food (calcium, iron, zinc, vitamin C, vitamin D) | The number and the level, "the level applies to long-run intake from all sources including supplements" | All-nutrients detail |
| The two energy estimates disagree by more than 15% (4.2) | "The estimates disagree more than usual for your body size." | Targets (information only) |

**What the app never says:** that a person is deficient, anaemic, diabetic or at risk of anything; that a food is good or bad; or what to eat or skip.

### 8.7 Before anyone outside your circle uses it

A dietitian reads the gate matrix, the floors and caps, the pace defaults and every string; a person with eating-disorder expertise reads low-pressure mode, the safety check and the notices; a privacy and legal reader goes through 8.3 to 8.5 and the store declarations; a security pass covers the secret flow and the logs. The list, owners and gates are in 11.7 and decisions Q18 and Q19 (section 12). Until then the owner's circle is the audience, and the standard disclaimers apply to everyone.

## 9. Required database, API and UI changes

Everything here is additive: existing tables, routes and screens keep working until the phase that replaces them (section 10). The engine lives **only in the Worker**, as pure functions next to the data, so the formulas exist in one place and are tested in one place (this also removes P20). The app renders what the Worker returns.

### 9.1 Database

Two migrations, applied in order by `wrangler d1 migrations apply`. They were applied on top of the real `0001_init.sql` in a throwaway SQLite database (version 3.50) to check that every constraint rejects what it should, that a personalised row cannot omit a body field while a reference-only row stores none, and how deletion behaves (below).

**`0002_health_profile.sql`** (Phase 2): access control, profile, weigh-ins, target versions, day status, goal origin.

```sql
-- PROPOSED worker/migrations/0002_health_profile.sql (see WEEKLY_BREAKDOWN_PLAN.md section 9.1).
-- D1 runs each migration file in a transaction; no BEGIN/COMMIT here. Nothing below touches existing rows.

-- 1. Access control for health data: a per-profile secret. Only its SHA-256 is stored; the 32-byte token is
--    shown once at creation and kept in the phone's secure storage (section 8.3.2).
ALTER TABLE users ADD COLUMN secret_hash TEXT;

-- 2. What the person told us. Only fields that change a number or a message. A user without a row keeps
--    today's behaviour (generic mode). A 'reference_only' row stores NO body or goal data (nothing is kept
--    about someone who is under 19, pregnant, has an eating-disorder history, or follows a clinician's diet;
--    and not which of those it was, section 8.1); a 'personalised' row must have every body and goal field.
CREATE TABLE health_profiles (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_mode     TEXT NOT NULL CHECK (target_mode IN ('personalised', 'reference_only')),
  birth_year      INTEGER CHECK (birth_year BETWEEN 1900 AND 2100),
  birth_month     INTEGER CHECK (birth_month BETWEEN 1 AND 12),                    -- optional: tightens age-band edges
  sex_for_calc    TEXT CHECK (sex_for_calc IN ('female', 'male', 'average')),      -- equation selector, not an identity
  height_cm       REAL CHECK (height_cm BETWEEN 120 AND 230),
  activity_level  TEXT CHECK (activity_level IN ('inactive', 'low_active', 'active', 'very_active')),
  goal            TEXT CHECK (goal IN ('general_health', 'maintain', 'lose', 'gain', 'build_muscle')),
  pace            TEXT NOT NULL DEFAULT 'standard' CHECK (pace IN ('gentle', 'standard', 'faster')),  -- lose / gain only
  diet_pattern    TEXT NOT NULL DEFAULT 'omnivore'
                  CHECK (diet_pattern IN ('omnivore', 'eggetarian', 'vegetarian', 'vegan', 'pescatarian')),
  reference_set   TEXT NOT NULL DEFAULT 'nasem' CHECK (reference_set IN ('nasem', 'icmr_nin')),
  diet_interacting_medicine INTEGER NOT NULL DEFAULT 0 CHECK (diet_interacting_medicine IN (0, 1)),  -- turns off K, potassium, sodium verdicts
  numbers_hidden  INTEGER NOT NULL DEFAULT 0 CHECK (numbers_hidden IN (0, 1)),     -- low-pressure display (section 8.2)
  consent_version TEXT NOT NULL,
  consented_at    TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (target_mode = 'reference_only'
         OR (birth_year IS NOT NULL AND sex_for_calc IS NOT NULL AND height_cm IS NOT NULL
             AND activity_level IS NOT NULL AND goal IS NOT NULL))
);

-- 3. Weigh-ins. One per day; the latest one feeds the energy estimate, the series feeds the trend.
CREATE TABLE weight_entries (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date  TEXT NOT NULL,
  weight_kg   REAL NOT NULL CHECK (weight_kg BETWEEN 25 AND 350),
  created_at  TEXT NOT NULL,
  UNIQUE (user_id, local_date)
);

-- 4. Immutable versions of the computed targets (personalised profiles only). A day is judged against the
--    set in force on that day, so changing weight or goal never rewrites last month's report.
CREATE TABLE target_sets (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from  TEXT NOT NULL,        -- 'YYYY-MM-DD' in the user's time zone
  engine_version  TEXT NOT NULL,        -- which formulas produced it, e.g. '1.0.0'
  reference_set   TEXT NOT NULL,
  inputs_json     TEXT NOT NULL,        -- the inputs exactly as used (age band, sex_for_calc, height, weight, activity, goal, pace, pattern)
  targets_json    TEXT NOT NULL,        -- the Target[] the report used
  created_at      TEXT NOT NULL
);
CREATE INDEX target_sets_user_from ON target_sets (user_id, effective_from);

-- 5. "This day is complete / partial / leave it out of my reports" (illness, travel, fasting, festival).
CREATE TABLE day_status (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date  TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('complete', 'partial', 'skip')),
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, local_date)
);

-- 6. Custom goals keep working as overrides of the recommended value. Remember when they were set, and
--    whether the person typed them or took them from their care team (section 6.7).
ALTER TABLE user_goals ADD COLUMN updated_at TEXT;
ALTER TABLE user_goals ADD COLUMN origin TEXT NOT NULL DEFAULT 'custom' CHECK (origin IN ('custom', 'care_team'));
```

**`0003_food_nutrients.sql`** (Phase 4): the nutrients the guidelines weight most and the app cannot see, and where a food's numbers came from.

```sql
-- PROPOSED worker/migrations/0003_food_nutrients.sql (see WEEKLY_BREAKDOWN_PLAN.md section 9.1, Phase 4).
-- Nutrients the guidelines weight most and the app cannot see yet (first wave), and where a food's numbers
-- came from. All nullable: null still means "unknown", never zero.
ALTER TABLE foods ADD COLUMN saturated_fat_g REAL;
ALTER TABLE foods ADD COLUMN added_sugar_g   REAL;
ALTER TABLE foods ADD COLUMN vitamin_b12_mcg REAL;
ALTER TABLE foods ADD COLUMN folate_mcg      REAL;
ALTER TABLE foods ADD COLUMN source TEXT CHECK (source IS NULL OR source IN ('label', 'database', 'recipe', 'estimate'));
ALTER TABLE foods ADD COLUMN reviewed_at TEXT;
```

Design notes:
- **`health_profiles` is one row, optional.** No row means "generic mode": today's behaviour plus the Phase 0 fixes. A `reference_only` row stores only the mode, the flags and the consent: nothing about *why*, and no body data (8.1).
- **`target_sets` is append-only and exists only for personalised profiles.** A report resolves the set in force on each day (`effective_from <= day`, latest wins), so history is never rewritten by a later weigh-in. The inputs are stored next to the outputs, so any past target can be explained and re-derived.
- **Nothing derived is stored except `target_sets`.** Weekly reports are computed at read time, exactly like nutrition totals today (PLAN.md section 6: "nutrition is never stored on log items"), so correcting a food still corrects every past week.
- **Custom goals stay in `user_goals`** and keep meaning "override the recommended value"; `origin` separates what the person typed from numbers from their care team (6.7), and `updated_at` lets the UI say "set 3 weeks ago".
- **New food nutrients are nullable and null still means unknown**, never zero. The catalogue in [nutrients.ts](worker/src/domain/nutrients.ts) drives parsing, validation and row mapping, so adding a nutrient is a catalogue entry plus the migration.
- **No health data in `calls`, `log_items` or `foods`.** Weight and profile never touch tables the voice flow reads.
- **Deleting a profile needs an explicit, ordered batch.** In `0001`, `calls`, `log_items` and `user_goals` reference `users(id)` *without* `ON DELETE CASCADE`, and `foods.added_by` references it too; a plain `DELETE FROM users` fails (tested). `DELETE /me` therefore runs, in one `db.batch`: delete `log_items`, `calls`, `user_goals`; set `added_by` to null on `foods`, `food_aliases` and `food_units`; then delete the `users` row, which cascades through the four new tables (tested). `DELETE /me/health-data` deletes `health_profiles`, `weight_entries`, `target_sets` and `day_status` for the caller and leaves the log (tested). The Workers integration test confirms the same on D1 itself.
- **Time Travel** keeps erased rows restorable by the database owner for 7 (Free) or 30 (Paid) days (8.3.3).

**Platform budget (Cloudflare D1, Workers).** On the Free plan: 5 million rows read and 100,000 written per day, 5 GB total storage, a 500 MB database, 50 queries per Worker invocation, 100 bound parameters per query, 10 ms of CPU per request (PLAN.md section 3). Rows read count *scanned* rows. The food index already reads the whole `foods`, `food_aliases` and `food_units` tables on every request ([queries.ts](worker/src/db/queries.ts) lines 76-78), so a weekly report costs roughly the catalogue (say 500 foods and 2,000 aliases and units) plus the items for 56 days (about 700) plus a few small tables: **about 3,500 to 5,000 rows read, under ten queries**, or about 1,000 reports a day inside the free allowance. Writes add a handful of rows per profile change. No new index is needed (`log_items_user_date` covers the range read); `day_status`, `weight_entries` and `target_sets` are keyed by user.

### 9.2 Worker code layout (new files)

```
worker/src/domain/reference/
  sources.ts        registry: id -> { title, publisher, year, url }   every Target points at one
  nasem.ts          reference-intake tables by age band and sex (EAR/RDA/AI/UL), AMDR, fibre, sodium, potassium
  icmr.ts           ICMR-NIN 2020 tables (Phase 6, decision Q2)
  scoring.ts        standards for the density-based score components
worker/src/domain/targets/
  types.ts          Target, TargetSet, HealthProfileInput (the source of the types in 9.3)
  profile.ts        parse and validate HealthProfileInput; age, BMI, unit conversion
  eligibility.ts    safety gates (8.1) -> mode + warnings
  energy.ts         maintenance estimate, monotone guard, uncertainty band, cross-check
  goal.ts           deficit / surplus rules, floors and caps, pace preview
  macros.ts         protein, fat, carbohydrate, fibre, sodium, potassium, (later) sugars and saturated fat
  micros.ts         lookups by age band, sex, reference set; adjustments; upper levels and their scope
  engine.ts         computeTargets(profile, weight, today, options) -> TargetSet
worker/src/domain/report/
  days.ts           classify each day (7.2), coverage (7.3), low-intake and implausible-day flags
  assess.ts         per-nutrient assessment by target kind; the lower-bound rule
  score.ts          density components, points, withholding rules, jackknife range
  insights.ts       the rule catalogue (5.6) -> Insight[]  (ids and parameters, not text)
  trend.ts          eight-week history; four-week vitamin window; weight smoothing (Phase 5)
  weekly.ts         buildWeeklyReport(inputs) -> WeeklyReport
worker/src/routes/
  profile.ts        GET/PUT /me/profile, GET /me/targets, POST /me/targets/preview, GET /me/export,
                    DELETE /me/health-data, DELETE /me
  weights.ts        GET/POST /me/weights, DELETE /me/weights/:date                      (Phase 5 for the UI; the route can ship in Phase 2)
  reports.ts        GET /reports/weekly
  days.ts           + PUT/DELETE /days/:date/status                                      (existing file)
  meta.ts           + per-nutrient kind and group, engine version, reference sets        (existing file)
  settings.ts       GET/PUT /me/goals read the recommended set and mark overrides        (existing file)
  profiles.ts       POST /profiles also returns the one-time secret                      (existing file)
```

All new routes are registered in [worker/src/index.ts](worker/src/index.ts) like the existing ones. Each handler stays within the repo's budget of about six D1 round trips (PLAN.md section 7): the weekly report loads, in one `db.batch`, the food index (3 statements), the items for up to 56 days, `day_status`, the target sets, the profile and the weigh-ins, then computes in memory.

### 9.3 API

Conventions as today: `Authorization: Bearer <APP_TOKEN>`, `X-User-Id`, errors as `{ "error": { "code", "message" } }`. Health-scoped routes also require `X-Profile-Secret` (8.3.2).

| Route | Purpose |
|---|---|
| `GET /meta` (extended) | Adds per nutrient `kind`, `group`, `window`, `evidence`, `basis`; the engine version; the available reference sets. Replaces `defaultGoal` as the source of truth |
| `GET /me/profile` · `PUT /me/profile` | The health profile (3.2). `PUT` takes the profile and a transient `safety` block (never stored), validates, runs the gates, computes and stores a new target set, and returns `{ profile, targetSet, warnings }`. A reference-only outcome stores the mode and returns no targets |
| `POST /me/targets/preview` | The same computation without saving, for the live preview in onboarding and for "what if" edits. Needs no secret before a profile exists |
| `GET /me/targets?date=` | The target set in force on that date, each target with `how`, `basis`, `evidence`, and any custom or care-team override |
| `GET/PUT /me/goals` (kept) | Returns recommended and custom side by side (`origin`), each goal's usual bounds and a `warning` for a saved number outside them; `PUT` saves any positive override and returns a note for one outside the bounds of 6.4 |
| `GET /me/weights?from&to` · `POST /me/weights {date, weightKg}` · `DELETE /me/weights/:date` | Weigh-ins; a new weight may create a new target set (6.2) |
| `PUT /days/:date/status {status}` · `DELETE` | `complete`, `partial` or `skip` for a day; `DELETE` clears it |
| `GET /reports/weekly?start=YYYY-MM-DD&weeks=8` | The whole weekly view model (below), including up to 8 weeks of history |
| `GET /me/export` | Everything stored about the person's health profile, weigh-ins, target sets and day marks, as JSON |
| `DELETE /me/health-data` | Erases exactly those rows; the food log stays |
| `DELETE /me` | Deletes the whole profile (the ordered batch in 9.1). Required by Apple's guideline 5.1.1(v); none exists today |
| `POST /profiles` (changed) | Also returns a one-time `secret` (shown once, stored in the phone's secure storage and as a recovery code) |
| `POST /me/secret` (new) | One-time claim for profiles created before this change; works only while `secret_hash IS NULL` |

The types the app consumes (abridged; the Worker file `domain/targets/types.ts` is the source):

```ts
type Mode = 'personalised' | 'generic' | 'reference_only';
type TargetKind = 'energy' | 'minimum' | 'limit' | 'range';
type Evidence = 'R' | 'E' | 'G' | 'A';             // reference value | estimate | guidance | assumption (section 1)

interface Target {
  nutrient: NutrientKey;
  kind: TargetKind;
  unit: string;
  value: number;                                    // what the bar is drawn against, per day
  low?: number; high?: number;                      // energy typical range, or the edges of a range target
  refType: 'RDA' | 'AI' | 'limit' | 'range' | 'estimate';   // an AI never gets "deficient" wording (4.6)
  upperLevel?: number;                              // only where it covers food-sourced intake (4.6)
  window: 'week' | 'four_weeks';                    // which window judges it (4.6)
  evidence: Evidence;
  basis: string;                                    // key into sources.ts; the app shows title and link
  how: string;                                      // one plain sentence for "How was this calculated?"
  scored: boolean;
  verdicts: boolean;                                // false with the medicine flag: amounts only
  origin: 'recommended' | 'custom' | 'care_team';
}

interface TargetSet {
  id: string; effectiveFrom: string; engineVersion: string;
  referenceSet: 'nasem' | 'icmr_nin';
  mode: Mode;
  inputs: { ageBand: string; sexForCalc: string; heightCm: number; weightKg: number; bmi: number;
            activity: string; goal: string; goalApplied: string; pace: string; pattern: string };
  energy: { maintenance: number; target: number; low: number; high: number; method: 'nasem2023';
            floorApplied: boolean; crossCheck: { mifflinPal: number; disagree: boolean } } | null;
  targets: Target[];
  warnings: { id: string; severity: 'info' | 'caution' | 'stop' }[];
}

interface NutrientReport {
  nutrient: NutrientKey;
  target: Target | null;                            // null in reference-only mode without care-team targets
  meanPerAssessedDay: number | null;                // null when data coverage is too low to say anything
  isLowerBound: boolean;                            // some foods had no value: the total can only be higher
  dataCoverage: number;                             // 0..1: share of logged energy from foods that have a value
  daysMeeting: number; assessedDays: number;
  dayValues: (number | null)[];                     // seven entries, Monday first
  assessment: 'meets' | 'close' | 'below' | 'over' | 'well_over' | 'in_range' | 'outside' | 'unknown' | 'amount_only';
  topSources: { foodId: string; name: string; share: number }[];   // up to three
}

interface ScoreComponent {
  id: 'protein' | 'fibre' | 'potassium' | 'calcium' | 'iron' | 'magnesium' | 'zinc' | 'sodium' | 'saturated_fat' | 'added_sugars';
  points: number; outOf: number; coverage: number; scorable: boolean;
  density?: number; standard: string;               // per 1,000 kcal; the standard that was applied
}

type Withheld = 'few_days' | 'unknown_foods' | 'incomplete_days' | 'thin_data' | 'low_intake'
              | 'generic' | 'reference_only' | 'numbers_hidden';

interface WeeklyReport {
  engineVersion: string;
  week: { start: string; end: string; today: string; isCurrent: boolean };
  mode: Mode;
  targetSet: { id: string | null; effectiveFrom: string | null };
  display: { numbersHidden: boolean };
  coverage: {
    days: { date: string; state: 'valid' | 'confirmed' | 'partial' | 'empty' | 'skipped' | 'in_progress' | 'future';
            kcal: number | null; lowIntake: boolean; veryHigh: boolean }[];
    assessedDays: number; weekendAssessedDays: number; pendingItems: number;
    confidence: 'good' | 'fair' | 'rough' | 'insufficient';
  };
  energy: { meanKcal: number | null; target: number; low: number; high: number;
            daysInBand: number; assessedDays: number } | null;               // null: low-pressure, generic, reference-only
  nutrients: NutrientReport[];                      // judged over the week
  fourWeek: NutrientReport[];                       // vitamins A, C, D, E, K over the rolling four weeks
  score: { value: number | null; shown: number | null;                      // shown = nearest 5 (rounded down when isMinimum)
           isMinimum: boolean;                                               // a component is unknown: "at least N" (5.5)
           points: number; outOf: number; range: [number, number] | null;   // leave-one-day-out, with 4 or 5 assessed days
           components: ScoreComponent[]; withheld?: Withheld };
  insights: { id: string; priority: 1 | 2 | 3 | 4 | 5; nutrient?: NutrientKey;
              params: Record<string, number | string> }[];                   // text is rendered by the app from id and params
  history: { weekStart: string; assessedDays: number; energyPct: number | null;
             proteinPct: number | null; score: number | null }[];
  disclaimerId: string;
}
```

Insight text is rendered **in the app** from `id` and `params` through one strings table, so copy can change without a Worker deploy, can be translated (Q23), and is covered by the string lint (11.6). Example request and response bodies for the routes the app calls first are in Appendix C, produced by running the engine on the personas in section 4.8.

### 9.4 App

**New**
- `src/screens/profile/` (`HealthIntroScreen`, `SafetyCheckScreen`, `AboutYouScreen`, `ActivityScreen`, `GoalScreen`, `PatternScreen`, `ReviewScreen`), reopened from Settings.
- `src/screens/TargetsScreen.tsx`: "Your targets and how we calculate them", the sources list, reset to recommended, care-team numbers.
- `src/components/report/`: `CoverageCard`, `InsightCard`, `NutrientGroup`, `NutrientLine`, `DayStrip` (seven cells: met, not met, not assessed, not logged), `ScoreBreakdown`, `Sparkline` (react-native-svg is already a dependency), `TopSources`, `FourWeekCard`.
- `src/components/today/DayStatusSheet.tsx`: mark a day complete, partial, or leave it out.
- `src/components/weight/WeighInSheet.tsx` and a weight line on the weekly view (Phase 5).
- `src/state/HealthContext.tsx`: the profile and the target set in force, fed by `/me/profile`; clears on profile switch.
- `src/i18n/strings.ts`: every user-facing string of the health and report modules in one table (the string lint reads it, 11.6).

**Changed**
- [WeeklySummaryScreen.tsx](app/src/screens/WeeklySummaryScreen.tsx): rebuilt around the report (5.2). It becomes "All nutrients", reached from the Report tab.
- [ReportScreen.tsx](app/src/screens/ReportScreen.tsx): becomes the weekly summary (coverage, energy, up to three insights, priority nutrients, score) with a link to all nutrients.
- [GoalsScreen.tsx](app/src/screens/GoalsScreen.tsx): shows recommended values with their reasons, marks overrides, enforces the bounds of 6.4, and offers "reset to recommended".
- [SummaryCard.tsx](app/src/components/today/SummaryCard.tsx): reads `kind` from the targets instead of a hard-coded list; hides the ring when numbers are hidden; adds the day-status entry point.
- [TodayScreen.tsx](app/src/screens/TodayScreen.tsx): drops `DEFAULT_TARGET_CALORIES`.
- [FoodEditorScreen.tsx](app/src/screens/FoodEditorScreen.tsx): the calories-versus-macros check and plausibility warnings (7.4), the new nutrient fields, and the "where are these numbers from" choice.
- [SettingsScreen.tsx](app/src/screens/SettingsScreen.tsx): a Health section (profile, targets, hide numbers, export, delete health data, delete profile) and, in Phase 6, "pause the daily call".
- [ProfileContext.tsx](app/src/state/ProfileContext.tsx) and [client.ts](app/src/api/client.ts): store the per-profile secret in secure storage and send it on health-scoped calls.
- [MetaContext.tsx](app/src/state/MetaContext.tsx): `FALLBACK_META` stops duplicating goals.
- [api/types.ts](app/src/api/types.ts): the types in 9.3.
- Navigation ([RootNavigator.tsx](app/src/navigation/RootNavigator.tsx), [types.ts](app/src/navigation/types.ts)): the health-profile stack and `Targets`.
- A new dependency for secure storage (react-native-keychain, or an equivalent); no analytics or advertising SDK (8.3.6).

**Removed (Phase 3)**
- `gradeOf`, `verdictOf`, `scoreOf`, `statusOf`, `inferDirection`, `helperText` from [utils/nutrition.ts](app/src/utils/nutrition.ts), and `buildWeeklyNutrients` / `daysElapsed` from [utils/week.ts](app/src/utils/week.ts): their job moves to the Worker. `fmtNum` and the week-label helpers stay.
- The grade ring in [ScoreCard.tsx](app/src/components/report/ScoreCard.tsx).

The design system needs one addition: a neutral tone for "not enough data" and "below target" (the kit has `muted` and `neutral` already), so red is reserved for exceeding a safety ceiling and for data problems (5.8).

### 9.5 Compatibility and rollout

- **Older app versions** keep working: they ignore new response fields. `GET /days` and `GET /me/goals` keep their shapes. Because the Worker will read goals from the target set when a profile exists, an older app's daily ring shows the personalised calorie target too.
- **Feature flag:** a profile with a `health_profiles` row gets the new report; one without gets the Phase 0 report. Nothing needs a flag in the database.
- **Per-profile secret** is introduced in Phase 2 and enforced only on health-scoped routes, so existing profiles and the Vapi webhook keep working while friends update. Enforcement on every user route is an optional Phase 6 step after a grace period (8.3.2).
- **Phase 0 ships on its own**, before any of this (section 10).
- **Rollback** is dropping the new routes from `index.ts`; the tables can stay.

## 10. Phased implementation plan

Sizes are rough estimates for one developer working with Claude Code, in working days, and exclude waiting time for the reviews in Phase 6 (a dietitian's read of the copy and gates, an eating-disorder-aware read, a privacy and legal read). Total: about **26 to 39 working days**. Each phase ends with the app runnable and the tests green, as PLAN.md does. Decision IDs (Q1 and so on) are in section 12; **nothing in this plan has been started**.

```
Phase 0  stop the misleading output        (no profile needed)            1-2 d   ship first, on its own
Phase 1  reference data + engine           (Worker, no UI)                4-6 d
Phase 2  profile, access control, targets  (migration 0002, onboarding)   6-9 d
Phase 3  weekly report v2                  (Worker route, new screens)    6-8 d
Phase 4  data quality + new nutrients      (migration 0003)               3-5 d   + ongoing food entry
Phase 5  weight log + calibration          (optional)                     3-4 d
Phase 6  hardening, ICMR set, review       (accessibility, copy, privacy) 3-5 d
```

Order of dependence: 0 stands alone; 1 feeds 2 and 3; 2 must precede any storage of body data; 3 needs 1 and 2; 4 and 5 can follow 3 in either order; 6 closes.

### Phase 0: stop the misleading output (1-2 days)

Needs no new data and removes the worst of section 2 immediately. Ship it on its own.

1. **Pin today's behaviour first.** Turn the scenario table in 2.2 into Jest characterisation tests that call the real functions. They document the bug and are flipped in step 2.
2. **Fix the arithmetic of the week** in [week.ts](app/src/utils/week.ts) and [WeeklySummaryScreen.tsx](app/src/screens/WeeklySummaryScreen.tsx):
   - do not count today as a day of goal until it is over (P14);
   - average over days that have something logged, and show "N of 7 days logged" (P8, P13);
   - hide the score and grade when fewer than 3 days are logged and say why (P8).
3. **Stop showing unknown as zero.** Use the `missingItems` the API already returns: a nutrient with missing items shows its total with "at least" and a "some foods have no value" note, and never gets a verdict from a partial total (P11).
4. **Remove the letter grade and the verdict words** ("Excellent week" ... "Needs attention") from [ScoreCard.tsx](app/src/components/report/ScoreCard.tsx) and [nutrition.ts](app/src/utils/nutrition.ts). Keep the plain count "x of y nutrients on track" until Phase 3 (P10).
5. **One meaning per nutrient.** Move direction (`minimum`, `limit`, `range`) into the Worker catalogue and `GET /meta`, and delete `inferDirection` (P3). Fat becomes a range everywhere.
6. **Guardrails on goals** in [settings.ts](worker/src/routes/settings.ts) and [GoalSheet.tsx](app/src/components/report/GoalSheet.tsx): reject calorie goals under 800 kcal, warn under 1,200 (placeholders until the engine has sex-specific floors, 4.3), and cap the slider (P4).
7. **Replace the fixed defaults** (2,500 kcal, 180 g protein, ...) with generic reference values and label them "General reference, not personal" (4.6 has the generic table). Existing custom goals are untouched (P1).
8. **Add the low-intake notice** (7.2, 8.6): three or more non-empty days under 1,200 kcal in the week produce the one-sentence notice. It needs no profile.
9. **Fix "today"** so both screens use the profile's time zone (P16).

**Exit criteria:** scenarios B and C no longer produce the same output; D no longer reads "Needs attention"; E shows two limits exceeded; G shows the low-intake notice; no screen shows a letter grade; `npm test` passes in `app/` and `worker/`.
**Risk:** low. **Rollback:** revert the commit.

### Phase 1: reference data and the engine (4-6 days)

Pure TypeScript in `worker/src/domain/reference`, `targets` and `report` (9.2). No routes, no UI, no database. Appendices E and F are the executable specifications of the targets half and the report half: the second implementations that the tests compare against.

1. Source registry and reference tables (`sources.ts`, `nasem.ts`), each value carrying its source id and evidence tag. Appendix B is the table to type from, and 11.3 checks it.
2. `profile.ts`, `eligibility.ts`, `energy.ts`, `goal.ts`, `macros.ts`, `micros.ts`, `engine.ts`.
3. `days.ts`, `assess.ts`, `score.ts`, `insights.ts`, `trend.ts`, `weekly.ts`.
4. Tests: the golden vectors of 11.1, the grid sweep of 11.2, the reference-table checks of 11.3, the gate tests of 11.4, the report scenarios of 11.5.

**Exit criteria:** `computeTargets` returns a complete, explained `TargetSet` for the sixteen personas of section 4.8, matching the hand-checked numbers and NASEM's two published worked examples; the grid sweep finds no NaN, no negative target and no energy target under the floor; a 56-day report builds in under 5 ms on the dev machine.
**Risk:** the reference tables are the main source of error; the table tests and a second-person check of every row guard it. **Rollback:** nothing is wired in.

### Phase 2: profile, access control and targets (6-9 days)

1. Migration `0002_health_profile.sql` (9.1).
2. **Access control first** (8.3.2): per-profile secret, recovery code, `POST /me/secret` claim, health-scoped routes refuse without it. **No body measurement is stored before this works.**
3. Routes `profile.ts` (profile, targets, preview, export, `DELETE /me/health-data`, `DELETE /me`), `weights.ts` (read and write), `/me/goals` reading the target set.
4. App: the health-profile stack (3.5) with the notice and consent on its first screen, `HealthContext`, `TargetsScreen`, the new `GoalsScreen`, the Settings health section, secure storage of the secret, the recovery-code screen.
5. Safety gates wired end to end (8.1), including reference-only mode, low-pressure mode on the eating-disorder answer, and the care-team path (6.7).
6. Today's ring reads the target set; `DEFAULT_TARGET_CALORIES` goes.

**Exit criteria:** a new profile completes onboarding and gets an explained target set; an under-19, a pregnant, an eating-disorder-history, a clinician-diet and a BMI-under-16 profile each land in the mode section 8.1 says, with nothing stored beyond the mode; a BMI-under-18.5 profile gets no loss goal; user A cannot read user B's profile with the shared token alone; export, `DELETE /me/health-data` and `DELETE /me` work; the voice assistant prompt still contains no profile data (test in 11.8).
**Risk:** the secret flow touches every health route and the reinstall path. Mitigation: enforce on health-scoped routes only; test the Keychain-survives-uninstall case by hand. **Rollback:** drop the routes; the tables can stay.

### Phase 3: weekly report v2 (6-8 days)

1. `GET /reports/weekly` over the engine from Phase 1.
2. App: the Report tab as the weekly summary, `WeeklySummaryScreen` as "All nutrients", the coverage card, insights, nutrient groups, day strips, top sources, the four-week vitamin card, the score breakdown with its jackknife range, 8-week sparklines, the low-pressure display (8.2), the strings table.
3. Delete the old scoring code (9.4, Removed) and the Phase 0 characterisation tests, replaced by the new scenario tests.
4. Copy and tone checks (11.6).

**Exit criteria:** the scenario table of 2.2 re-run on the new engine gives the outputs listed in 5.9; every screen is usable at 360 dp with 1.3x font in light and dark (the README's own check); the report never shows a letter grade or a verdict word; a real week on the owner's profile reads sensibly.
**Risk:** moderate; this is the visible change. Ship it to the owner's profile first. **Rollback:** the profile-row flag (9.5).

### Phase 4: data quality and new nutrients (3-5 days, then ongoing)

1. `day_status` route and the Today sheet (complete, partial, leave out).
2. Food-editor checks (7.4): calories versus macros, plausibility warnings, "where are these numbers from".
3. Migration `0003_food_nutrients.sql`: saturated fat, added sugars, vitamin B12 and folate join the catalogue, the editor and the score (the moderation components switch on once enough foods have values).
4. A "foods with gaps" list next to Pending, ordered by how much of the person's recent intake each food represents, so the data gets filled where it matters.

**Exit criteria:** a typo of 10x calories on a food raises a warning before saving; `dataCoverage` and the score components for the new nutrients respond to entered values; the worklist ranks foods by share of logged energy.
**Risk:** low; additive. The work that never finishes is people entering values (decision Q14).

### Phase 5: weight log and calibration (3-4 days, optional)

1. Weigh-in sheet and the weight line on the weekly view; smoothed trend.
2. Target recompute on a material weight change (6.2).
3. Pace feedback: planned against observed change, shown as information with its uncertainty; the `rapid_loss` and `weight_vs_plan` insights.
4. *Experimental, behind a flag:* a calibration suggestion from logged intake and the weight trend (4.9), shown only after enough weeks of good data and never applied automatically.

**Exit criteria:** a weigh-in updates the trend and, past the threshold, creates a new target set effective that day; past weeks still use their old sets.

### Phase 6: hardening, localisation and review (3-5 days, plus the reviewers' time)

1. The ICMR-NIN reference set and the picker (decision Q2); Hindi strings for the explainers if wanted (Q23).
2. Accessibility pass: screen-reader labels for every status, no information by colour alone, large-font layouts.
3. Dietitian review of every user-facing string and gate; review of low-pressure mode and the safety wording by someone with eating-disorder expertise; privacy and legal review (Q18); store-listing health declarations.
4. Security pass on the secret flow; log review (no body metrics in logs); the breach runbook (8.3.6); optional enforcement of the secret on every user route after a grace period (8.3.2); purge `calls.transcript` after 30 days (8.3.3); a "pause the daily call" action (8.2).
5. README and PLAN.md updates: the "non-sensitive data" statements become false and must be rewritten.

**Exit criteria:** the review checklist in 11.7 is signed off; no open High item in sections 8 and 11.

## 11. Testing and validation requirements

The repo already has the right habits: pure functions with unit tests ([app/__tests__/nutrition.test.ts](app/__tests__/nutrition.test.ts), [worker/test/unit/](worker/test/unit/)), integration tests in the Workers runtime against local D1 (`@cloudflare/vitest-plugin`, migrations applied from the `migrations` folder, so new migration files are picked up automatically), and a palette test that enforces WCAG contrast. This plan extends those habits. Three principles: **the engine is tested as numbers, the screens are tested as sentences**, **nothing about health is trusted because one implementation says so**, and **every rule that exists to prevent a harm has a test that tries to cause it**.

Much of this was already exercised while writing the plan, with Python throwaway code (the reference implementations in Appendices E and F). Those results are the starting vectors; they are not a substitute for the TypeScript tests.

### 11.1 Golden vectors: two implementations must agree

The expected values are computed **independently of the TypeScript** (the Python reference implementations of Appendices E and F, plus a hand check of a sample in a spreadsheet by someone other than the implementer) and stored as fixtures. The test fails if the Worker disagrees by more than rounding. The vectors are:

1. **The sixteen personas of section 4.8**: maintenance with its range, target, protein, fat, carbohydrate and fibre, the cross-check value, and the mode and warnings (including the three reference-only personas and the two held at Maintain). Their micronutrient references are in Appendix B.
2. **NASEM's two published worked examples**: a 22-year-old woman, 165 cm, 63 kg, low active gives 2,275 kcal; a 45-year-old man, 175 cm, 100 kg, low active gives 3,041.
3. **The age-band edges** of every reference table (18 and 19; 30 and 31; 50 and 51; 70 and 71) for both sexes.
4. **The weight-projection rows** of 4.9 (Meena, Vikram) at 12 weeks, 6 months and 12 months.
5. **The report scenarios of 5.9** as week fixtures with their expected outputs: the ordinary week scores 90; the same week with sodium 4,000 mg scores 78; doubling every quantity still scores 90; the realistic varied week scores 91 with a leave-one-day-out range of 90.9 to 92.0; "nothing logged", "today in progress", "crash diet" and "40% pending" each withhold the score with the reason named there.

### 11.2 Invariants and a grid sweep

A sweep over age 19-100 (step 3), height 140-200 cm (step 10), weight 35-200 kg (step 5), three sex settings, four activity levels, five goals and three paces (**1,199,520 inputs**) asserts for every input that:

- no target is `NaN`, infinite or negative, and every number is finite and rounded as specified;
- a loss target is never below the sex-specific floor or the 800 kcal wall, never more than 25% or 750 kcal below maintenance, and never implies a first-weeks rate above 1% of body weight or 1 kg a week; a gain target is never below maintenance nor more than 20% above; Maintain and Eat well equal maintenance;
- energy is non-decreasing in weight, holding the rest fixed;
- **a higher activity category never lowers the estimate** (the monotone guard of 4.2). The raw published equations break this for 336 of the 39,984 category comparisons in the test grid (men, active to very active, 140 and 150 cm), so the test must fail if the guard is removed;
- macro energy reconciles with the target (within 12 kcal), carbohydrate is at least 130 g, the fat share is inside 20-35%, protein per kilogram of reference weight is between 0.8 and 2.0;
- an input outside the eligibility rules never yields a personalised target (it yields `reference_only`);
- the same input twice gives the same output (determinism), and the output serialises to JSON and back unchanged.

The Python reference runs this grid in about twenty seconds and found **no failures**. The TypeScript test can run the full grid or every other step to stay within a few seconds.

### 11.3 Reference-data integrity

Structural tests on the tables in `domain/reference`:

- age bands cover 19 to 100 with no gap and no overlap, for both sexes;
- every value has a `basis` that exists in `sources.ts`, an evidence tag, and a unit that matches the nutrient catalogue;
- units and conversions are explicit (retinol activity equivalents, micrograms of vitamin D versus IU, alpha-tocopherol equivalents), with a test per conversion;
- a content hash of each table is committed; changing a number changes the hash, so every edit shows up in review;
- a documented spot-check of at least 20 values against the NIH Office of Dietary Supplements fact sheets, repeated whenever a table is edited and at least yearly. (The first extraction of the NASEM tables for this plan passed 28 spot checks against the publisher's page.)

### 11.4 Safety-gate tests

One test per row of the matrix in section 8.1, asserting the mode, the warning ids and the absence of a personalised target:

- **G1:** the day before and the day of the 19th birthday; an under-19 outcome stores no body data, no birth year and no goal.
- **G2 to G4:** each safety answer lands in `reference_only`, and **nothing about which answer was given is stored** (inspect every table and the `inputs_json` of any target set after the call). The eating-disorder answer also turns low-pressure mode on.
- **G5, G6:** BMI at 15.9, 16.0, 18.4 and 18.5 and at 60.0 and 60.1; at 16 to 18.4 Lose is refused and an underweight notice appears.
- **G7 to G9:** a loss goal at BMI 24.9 and 25.0 (international) and 22.9 and 23.0 (Indian set); ages 64, 65, 79 and 80 with BMI either side of 30 (27.5); a gain goal at the overweight edge. A refused goal returns Maintain with the reason and the list of available goals.
- **G10:** every pace at every persona respects the floor, the wall, the 25% and 750 kcal caps and the weekly-rate cap; a deficit under 150 kcal becomes Maintain.
- **G11:** a loss goal at 12 weeks asks for the safety check again.
- **G12:** with the medicine flag, vitamin K, potassium and sodium return amounts with `verdicts: false` and no insight mentions them.
- **G13:** three non-empty days under the floor produce the `low_intake` insight, withhold the score, and do so in every mode, with and without numbers hidden.
- **Overrides (6.4):** a calorie override below the floor (rejected), above 125% of maintenance (rejected), and inside the bounds (accepted and marked custom); the protein, sodium and micronutrient bounds likewise; a value saved before the change is kept and labelled.
- **Care-team targets (6.7):** accepted as typed within the sanity check, labelled, never adjusted, and no score.
- "Prefer not to say" behaves as decided (Q8); reference-only mode never returns a score or an energy target; low-pressure mode never returns a number the person asked to hide.

### 11.5 Weekly report tests

- **Scenarios.** The eight scenarios of section 2.2 re-run on the new engine, asserting the outputs in 5.9 (this replaces the Phase 0 characterisation tests).
- **Properties of the score**, over randomised weeks with a fixed seed (the prototype ran each 1,500 to 4,000 times with no violations):
  1. **Missing data never raises the score.** Blank values at random in a scored week; the displayed score is never higher than before (it can drop, become "at least N", or be withheld).
  2. **Scale invariance.** Multiply every logged quantity by any factor from 0.9 to 3; the score is unchanged (it is density-based), while the energy card, the absolute rows and the low-intake rule respond.
  3. **Monotone in the right direction.** More sodium, or less protein, fibre, potassium or calcium, never raises the score.
  4. **Bounds.** The score is between 0 and 100, and the leave-one-day-out range contains it.
  5. A day identical to the week's mean, added to the week, leaves the score unchanged (pooling).
- **Missing data:** a nutrient unknown on some foods is a lower bound; "over a limit" and "meets a minimum" are allowed from a lower bound, "below" and "within a limit" are not (7.3); coverage under the threshold gives `unknown`; a food with a value of 0 is treated differently from a food with no value; for a limit, coverage is the lower of the energy share and the item share.
- **Days:** unlogged versus partial versus skipped versus complete-with-nothing (a fasting day); today in progress; a day marked complete after the call; pending items; the 500 kcal and 60%-of-target edges; very high days (3,500 / 4,200 / 3,850).
- **Time:** week boundaries at Monday in different time zones; a DST change inside the week; a profile that changes time zone mid-week; target sets that change mid-week (each day uses the set in force that day); "today" taken from the profile's zone (P16).
- **Score:** every component at, just under and just over each standard; the sodium standard at 1,100 and 2,000 mg per 1,000 kcal; "at least" versus "about"; the one-quarter withholding edge; the three-days edge of the low-intake rule.
- **Insights:** each rule fires on its trigger and not otherwise; at most three are shown; safety insights outrank the rest; at most one per nutrient; no insight text contains a banned word (11.6); generic and reference-only modes run only the safety and data rules.

### 11.6 Copy, tone and accessibility

- **String lint:** a test over every user-facing string in the health and report modules fails on moralising or alarming words (good, bad, clean, cheat, guilt, fail, "off track", "needs attention", streak, perfect) and on the words "diagnosis", "deficient" and "at risk". A second test requires the standard disclaimer id on every screen that shows a target, a score or a projection. A third requires that **no string reachable in low-pressure mode contains a digit**.
- **Colour:** the palette test stays; add cases for the new neutral tone. Red appears only for an exceeded safety ceiling and data problems (5.8).
- **Screen-reader labels:** every status has a text label, never colour alone; every chart has a text summary.
- **Layout:** the existing checks (360 dp, 1.3x font, light and dark) extended to the new screens, including the longest insight text.
- **Reading level:** every explainer is checked against a plain-language target (about grade 8) by a person, not a tool.

### 11.7 Expert review and external validation

These are not unit tests and each needs an owner and a date:

1. A registered dietitian reviews the sixteen personas' outputs, the full set of user-facing strings, the floors, caps and pace defaults, and signs the gate matrix.
2. Energy estimates for the personas are compared with the NIH Body Weight Planner (NIDDK) and with the published equations by hand.
3. A second person re-derives every row of every reference table from the cited source.
4. A person with eating-disorder expertise (a clinician, or a reviewer from an eating-disorder organisation) reads low-pressure mode, the safety-check wording, the notices and the insight copy.
5. A privacy and legal read of section 8 (not legal advice here; Q18), including the DPDP, store and HBNR questions in 8.3.5.
6. A small trial with 5 to 10 real users in the owner's circle, including at least two who do not log every day, to check that the coverage messages make sense and that "at least" and "not enough data" are understood.

### 11.8 Privacy and security tests

- The Vapi assistant builder and prompt ([assistant.ts](worker/src/vapi/assistant.ts), [prompt.ts](worker/src/vapi/prompt.ts)) are called with a profile that has distinctive canary values (for example weight 73.7 kg, birth year 1981, height 171.3 cm); the serialised assistant, first message and metadata must contain none of them. The same canary scan runs over every log line the Worker can emit, over `/profiles`, `/foods`, `/uncached` and the webhook responses.
- With the shared token alone, `GET /me/profile`, `/me/targets`, `/me/weights`, `/me/export` and `/reports/weekly` return 403 for another user's id; the existing "no response contains a stored Vapi key" scan is extended to health fields.
- **Erasure.** `DELETE /me/health-data` removes exactly the four health tables' rows for the caller and leaves the food log; `DELETE /me` removes the whole profile in the ordered batch of 9.1 (a plain `DELETE FROM users` must be shown to fail first, so the test documents why the batch is needed), nulls `added_by` on the shared foods, aliases and units, and leaves nothing that references the user (`PRAGMA foreign_key_check` is empty).
- Export contains all and only the caller's rows.
- The secret is stored hashed, compared in constant time (reuse `safeEqual`), never logged, never returned after creation; a second `POST /me/secret` is refused.
- Request bodies of `PUT /me/profile` and `POST /me/targets/preview` are never logged, and the safety block is not persisted anywhere.

### 11.9 Migrations, performance and operations

- Apply `0001`, seed realistic data, apply `0002` and `0003`, and run the existing integration suite unchanged: it must still pass (this proves the migrations are additive). The constraint and deletion checks of 9.1 become tests.
- The weekly report handler stays within about ten D1 statements and one `db.batch` for reads; a test counts statements. At about 3,500 to 5,000 rows read per report, the free plan's 5 million rows a day is not a constraint, but the rows-read figure is logged for the first deploys.
- A micro-benchmark of `buildWeeklyReport` for 56 days with 12 items a day is logged in CI as information, with a loose ceiling, because the free tier allows 10 ms of CPU (PLAN.md section 3).
- After deploy: Workers Logs checked for CPU time on the report route, and for any log line containing a profile field name.

### 11.10 Test files to add

```
worker/test/unit/reference.test.ts        tables, bands, conversions, hashes
worker/test/unit/targets/energy.test.ts   golden vectors, NASEM examples, monotone guard
worker/test/unit/targets/goal.test.ts     deficits, surpluses, floors, caps, pace
worker/test/unit/targets/macros.test.ts
worker/test/unit/targets/eligibility.test.ts   one test per gate row
worker/test/unit/targets/sweep.test.ts    invariants over the grid
worker/test/unit/report/days.test.ts
worker/test/unit/report/assess.test.ts
worker/test/unit/report/score.test.ts     components, "at least", properties
worker/test/unit/report/insights.test.ts
worker/test/integration/profile.test.ts   routes, secret, export, erase, nothing stored for gates
worker/test/integration/reports.test.ts   end to end on seeded data
worker/test/integration/privacy.test.ts   canary scans, ordered delete
app/__tests__/report.test.tsx             states of the new cards and screens
app/__tests__/copy.test.ts                string lint, no digits in low-pressure strings
app/__tests__/onboardingHealth.test.tsx   steps, gates, unit conversion
```

### 11.11 Acceptance gates

| Phase | Gate |
|---|---|
| 0 | Characterisation tests flipped; scenarios B, C, D, E, G behave as section 10 says; both suites green |
| 1 | Golden vectors, grid sweep, table, gate and score-property tests green; the second implementation agrees |
| 2 | Gate-matrix tests, secret, export and erase tests, canary scans green; a dietitian has seen the gate matrix |
| 3 | Scenario tests, copy lint and layout checks green; a real week on the owner's profile reads sensibly |
| 4 | Food-check and coverage tests green; worklist ordering test green |
| 5 | Trend and recompute tests green; past weeks unchanged by a new target set |
| 6 | Section 11.7 items signed off; no open High item |

## 12. Open questions and decisions needed before implementation

Each item has a recommendation, so you can answer "yes, as recommended" and move on. **Bold IDs block a phase** (the phase is named); the rest can be settled while the phase is underway. Where this plan departs from your original list of recommendations, the reason is in the "Why it matters" column.

### A. Product

| ID | Decision | Options | Recommendation | Why it matters |
|---|---|---|---|---|
| **Q1** (Phase 3) | Keep a score at all? | (a) none; (b) a decomposed 0-100 score shown only with enough data and never as a grade; (c) keep the letter grade | **(b)**, secondary to the insights, hideable, called "Nutrient mix" | The research supports food-based diet-quality scores for outcomes but not a nutrient-only one, and finds no evidence that grades help. A decomposed score is useful for your own trend if it is withheld when data is thin and optional (1.5, 5.5). Expect it to be absent or "at least N" for a while (5.5) |
| Q2 (Phase 6; the Phase 1 tables) | Which reference standard is the default for your users? | NASEM (US/Canada) / ICMR-NIN (India) / let the profile choose | **Profile choice, defaulting by phone region, with NASEM built first** and ICMR-NIN in Phase 6, judging iron, zinc, vitamin B12 and riboflavin against the Estimated Average Requirement there | The two differ by 20% or more on several nutrients (1.6), and your users are mostly in India; ICMR's own model diets fall short of its iron, zinc and B12 allowances, so grading against them would under-score typical adequate diets. NASEM is the only source with complete, checkable tables for the energy, macro and upper-level rules |
| Q3 | Energy equation | NASEM 2023 (US/Canada) / Mifflin-St Jeor times activity multipliers / ICMR-NIN per kilogram by activity | **NASEM 2023, shown as a range, with Mifflin-St Jeor as a cross-check;** ICMR-NIN per-kilogram energy as the Indian-set option in Phase 6 | Sets every calorie target (4.2). NASEM is the current standard and its equations reproduce its own examples to the kilocalorie; the popular multipliers have no verifiable origin; Indian-specific energy evidence is small and contested, so the range and the weight trend carry that uncertainty |
| Q4 | Adopt the "vegetarians need more iron and zinc" adjustments? | Apply (iron x1.8, zinc +50%) / show the standard values with a note | **Iron x1.8 for eggs-but-no-meat, vegetarian and vegan patterns, as NASEM states it; zinc: the standard value plus a note** | The Academies give an algorithm for iron (10% against 18% absorption) but "not sufficient data" for zinc (4.6). Visible in the weekly view for a large part of your users |
| Q5 | Sex handling | Female / male / "prefer not to say" using the average of both / free choice of equation | **Female / male / average**, with a manual override of the energy target | Equations and reference intakes are sex-specific; no authoritative guidance exists for trans and non-binary people (1.7) |
| Q6 | Who is in scope | 18+ / 19+ ; pregnancy and lactation later | **19 and over; pregnancy and lactation get reference-only mode in v1** | NASEM's adult reference intakes and energy equations start at 19; an 18-year-old is an adult in Indian law but outside them. Pregnancy needs different values and clinician input (8.1). Under 19, nothing is stored |
| Q7 | "I have targets from my care team" path | Offer / do not | **Offer**: the person types the numbers, the app uses them as typed, computes no score | Safest answer for people under medical nutrition therapy (6.7) |
| Q8 | A "prefer not to say" answer to the safety check | Treat as none / treat as reference-only | **Treat as none**, with the conservative pace default and the standard disclaimers | A privacy-respecting default; the check is self-declaration anyway (8.1) |
| Q9 | Weight tracking in v1 | In (Phase 5) / out | **Phase 5, optional** | Without it, targets are only as fresh as the first weight; with it, trends and recompute work |
| Q10 | Allow weight-loss goals | Allow with caps / do not offer | **Allow, within the caps in 4.3 and the gates G6 to G11 in 8.1** | It is the most common goal and the riskiest; the caps and gates are the safety design |
| Q11 | Low-pressure ("hide numbers") mode | Off by default with a visible option / ask during onboarding / on for flagged profiles | **Off by default, offered on the last onboarding step and in Settings; on automatically for the eating-disorder-history answer** | Calorie tracking is associated with disordered-eating symptoms in some people; the mode itself is untested (1.7, 8.2) |

### B. Data

| ID | Decision | Options | Recommendation | Why it matters |
|---|---|---|---|---|
| Q12 | Valid-day rules | The rules in 7.2 / simpler "logged or not" | **The 7.2 rules**: a day is assessed if it has no pending-heavy gap and is not under the larger of 500 kcal and 60% of the person's target, or the person marked it complete | Fixes the "not logged is not eaten" problem |
| Q13 | Minimum days for a weekly summary and for a score | 3 or 4 valid days | **3**, with the confidence label "Rough" at 3 and a leave-one-day-out range at 4 or 5 days (5.5, 7.6) | Too few days make the average meaningless; too many hide the report from people who log a few days a week. Within-person variation says 3 days is thin for most nutrients, which is why the label and the range are shown |
| **Q14** (Phase 4) | New food nutrients and how they get filled in | Add saturated fat, added sugars, B12, folate / add more / none; typed by people only / copied from a trusted table such as IFCT | **Add the four**; typed by people from labels (Indian packs carry added sugar, saturated fat and sodium) with a `source` marker. **Do not bulk-copy IFCT 2017** without the National Institute of Nutrition's written permission: its licence forbids storing or reproducing it electronically "for creating a product" (7.4). PLAN.md's "values entered by people only" rule stays | Without them the score cannot include the nutrients the guidelines weight most; and the score needs mineral and sodium values to light up at all (5.5) |
| Q15 | What to do when a nutrient has no data | Hide / show "unknown" / impute | **Show unknown; never impute** (7.1) | Imputing would hide exactly the gaps the user can fix |

### C. Privacy, safety and legal

| ID | Decision | Options | Recommendation | Why it matters |
|---|---|---|---|---|
| **Q16** (Phase 2) | Where health data lives | Server with a per-profile secret / phone only (server sees derived targets) / keep the shared token | **Server with a per-profile secret and minimal fields**; export and erase built in; the safety answers never stored; secret on every user route as an optional Phase 6 step | The current "friends-only, non-sensitive" assumption (README, PLAN.md) stops being true (8.3.2) |
| Q17 | Recovery after reinstall | Recovery code shown once / re-enter name only (current) | **Recovery code**, shown once at creation and storable in a password manager | The secret cannot be re-derived; the profile list must stop being enough to take over a profile |
| Q18 | Professional and legal review before wide release | Dietitian read of copy and gates; eating-disorder-aware read; privacy / legal read | **All three, before anyone outside your circle uses it** | Section 8 is a design, not legal or clinical advice. Open legal questions: whether an app shared with friends falls under the DPDP "personal or domestic purpose" exclusion, and whether the US health-breach rule or state laws reach it (8.3.5) |
| Q19 | Regulatory posture | "General wellness" wording only / seek medical-device status | **General wellness only**; no diagnosis, no treatment claims, no condition-specific advice (8.4) | Keeps the product out of device regulation in the US, EU and India |
| Q24 | Retention | Transcripts: keep / purge after 30 days; idle profiles: no rule / prompt the owner | **Purge `calls.transcript` after 30 days; no expiry for health data; no idle-profile rule in v1** | Data minimisation (DPDP s.8(7)); transcripts are only used to explain a failed call (8.3.3) |

### D. Technical

| ID | Decision | Options | Recommendation | Why it matters |
|---|---|---|---|---|
| Q20 | Where the engine lives | Worker only / shared package used by Worker and app | **Worker only**; the app calls `preview` | One implementation to test; it also keeps the formulas out of the APK |
| Q21 | Re-computing history when the engine improves | Never / on demand / automatically | **On demand**: a report states the engine version; old target sets are kept | Avoids silently changing past weeks |
| Q22 | Rollout | Replace for everyone / per-profile row as the flag | **Per-profile**: the new report appears when a health profile exists (9.5) | Lets the owner's profile go first |
| Q23 | Units and languages | kg/cm only / lb, ft-in, st / Hindi | **Both unit systems in the forms, metric stored**; strings in one table from the start; Hindi optional in Phase 6 | The forms are where unit mistakes happen |

### E. Things I could not settle from the sources

These are limits of the evidence or of what could be verified, and what the plan does about each. None blocks a phase, but each should be known to whoever builds this.

| Open point | What is known | What the plan does |
|---|---|---|
| Whether the NASEM equations suit Indian adults | The equations come from high-income-country data; small Indian studies disagree (BMR 6-9% below prediction in some, no difference after lean mass in another); ICMR-NIN lowered its BMR formula 9-10% (1.1) | Shows a range, tells people their weight trend is the better guide, offers the ICMR per-kilogram option in Phase 6, and lets the weight trend correct targets (Phase 5) |
| Protein reference weight in obesity | Actual, adjusted and capped weights are all in use; no consensus (1.2) | Caps at the weight for BMI 30 **[A]**; the rule is stated and easy to change |
| Whether showing a score, a grade or feedback at any frequency helps | No good evidence either way (1.5) | The score is optional, decomposed and withheld on thin data; the plan makes no claim for it |
| Whether low-pressure mode helps | Untested; follows qualitative cues and an expert consensus (1.7) | Offered as a precaution, not described as a treatment |
| The weight-trend smoother and "adaptive" calorie calibration | The exponential smoother has no peer-reviewed validation; no validation of calibration from logged intake plus weights was found (1.5) | Experimental, behind a flag, shown with its uncertainty, never applied automatically (Phase 5) |
| The numeric edges of the report | The 90% and 75% bands, 80% and 90% coverage, the one-quarter unknown share, 3 days, the 60% day edge, the 3,500 / 4,200 kcal prompts are design choices tied to the evidence, not standards | Listed in 4.10 and 7; all live in one config object with tests; tune them with real weeks |
| Vitamins D and K day-to-day variation | The coefficients of variation are not published in the tables used; A, C, E are high (1.4) | Treated like the other high-variation vitamins: a four-week view |
| Which sex value suits trans and non-binary adults | No authority gives guidance (1.7) | A "sex used for calculations" field, an average option and a manual energy override |
| Individual targets: EAR or RDA | NASEM: RDA; ICMR's documents say both (1.6) | RDA by default; EAR for iron, zinc, B12 and riboflavin on the Indian set |
| India's DPDP timeline and scope | The core duties start 13 May 2027 on the published schedule; a shorter timeline was proposed and could not be confirmed; applicability to a friends-only app is a legal question (8.3.5) | Designed for now; confirm with a lawyer (Q18) |
| India's CDSCO software guidance | Final status unconfirmed (8.4) | Stay inside "general wellness"; revisit before any clinical claim |
| US health-breach rule and state laws for an India-based app | Applicability not settled; the penalty level was not verified | No third-party disclosure beyond the voice processors; ask counsel if US users appear |
| Eating-disorder organisations' position on tracking apps | No statement was found from NEDA, AED or FEAST | The plan relies on the research and NICE; the review in 11.7 asks an expert directly |
| Sources not read at the source | The original SCOFF figures, the NHS Digital Weight Management Programme page (read through a regional NHS copy), the AHA 5-6% saturated-fat figure, OpenAI's retention policy, Google's Data safety text | Marked "could not verify" in Appendix A; none carries a number the engine uses |
| Supplements, fortified foods and sunlight | Not tracked | Stated in the explainers for iron, zinc, B12 and vitamin D (4.6) |

## Appendix A. Sources

Every link in section 1 is listed here, with the citation it stands for. Sections 2 to 12 refer to sources by their number in section 1.

### A.1 How the sources were checked

- **Matched** (papers): the PubMed or PubMed Central identifier was looked up in Europe PMC, and the authors, year and title were compared with the claim the paper supports. Six identifiers typed from memory during drafting turned out to point at unrelated papers and were corrected before this appendix was built. The checks looked at identity, not at full text.
- **Read** (reports, laws, web pages): the page or document was opened in the final pass and the passage that the plan relies on was read in the source itself (the FDA guidance PDFs, the Act text, the CFR section, NICE and CDC pages, the 2020-2025 Dietary Guidelines, and others marked below).
- **Link resolves**: a script fetched the page and received a normal response in October 2026. The plan's numbers from these sources were read by the research reviews described in 1.0 (which recorded for each number whether it was read at the source, seen in a search snippet, or recalled), not re-read in the final pass.
- **Not reachable**: the fetch tools used here could not open the site (FAO's server certificate; a block page). The source was read in the research pass.
- A superseded or dead address was replaced where found (the 2020-2025 Dietary Guidelines moved from dietaryguidelines.gov to odphp.health.gov).

### A.2 Papers and reports in the biomedical literature

Alphabetical by first author. All entries were matched against Europe PMC.

| Citation | Used in | Link |
|---|---|---|
| Anderberg I, Kemps E, Prichard I. The link between the use of diet and fitness monitoring apps, body image and disordered eating symptomology: A systematic review. Body image 2025;52:101836. | 1.7 | [link](https://pubmed.ncbi.nlm.nih.gov/39671845/) |
| Anjana RM, Unnikrishnan R, Deepa M, et al. Metabolic non-communicable disease health report of India: the ICMR-INDIAB national cross-sectional study (ICMR-INDIAB-17). The lancet. Diabetes & endocrinology 2023;11:474-489. | 1.6 | [link](https://pubmed.ncbi.nlm.nih.gov/37301218/) |
| Aragon AA, Schoenfeld BJ, Wildman R, et al. International society of sports nutrition position stand: diets and body composition. Journal of the International Society of Sports Nutrition 2017;14:16. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/) |
| Banna JC, McCrory MA, Fialkowski MK, et al. Examining Plausibility of Self-Reported Energy Intake Data: Considerations for Method Selection. Frontiers in nutrition 2017;4:45. | 1.1 | [link](https://www.frontiersin.org/articles/10.3389/fnut.2017.00045/full) |
| Basiotis PP, Welsh SO, Cronin FJ, et al. Number of days of food intake records required to estimate individual and group nutrient intakes with defined confidence. The Journal of nutrition 1987;117:1638-1641. | 1.4 | [link](https://pubmed.ncbi.nlm.nih.gov/3655942/) |
| Batista LD, De França NAG, Pfrimer K, et al. Estimating total daily energy requirements in community-dwelling older adults: validity of previous predictive equations and modeling of a new approach. European journal of clinical nutrition 2021;75:133-140. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/32814851/) |
| Bauer J, Biolo G, Cederholm T, et al. Evidence-based recommendations for optimal dietary protein intake in older people: a position paper from the PROT-AGE Study Group. Journal of the American Medical Directors Association 2013;14:542-559. | 1.3 | [link](https://pubmed.ncbi.nlm.nih.gov/23867520/) |
| Black AE. Critical evaluation of energy intake using the Goldberg cut-off for energy intake:basal metabolic rate. A practical guide to its calculation, use and limitations. International journal of obesity and related metabolic disorders : journal of the International Association for the Study of Obesity 2000;24:1119-1130. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/11033980/) |
| Burggraf C, Teuber R, Brosig S, et al. Review of a priori dietary quality indices in relation to their construction criteria. Nutrition reviews 2018;76:747-764. | 1.5 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC6130981/) |
| Burke LE, Wang J, Sevick MA. Self-monitoring in weight loss: a systematic review of the literature. Journal of the American Dietetic Association 2011;111:92-102. | 1.5 | [link](https://pubmed.ncbi.nlm.nih.gov/21185970/) |
| Deutz NE, Bauer JM, Barazzoni R, et al. Protein intake and exercise for optimal muscle function with aging: recommendations from the ESPEN Expert Group. Clinical nutrition (Edinburgh, Scotland) 2014;33:929-936. | 1.3 | [link](https://pubmed.ncbi.nlm.nih.gov/24814383/) |
| Eikey E. Effects of diet and fitness apps on eating disorder behaviours: qualitative study. BJPsych open 2021;7. | 1.7 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC8485346/) |
| European Association for the Study of the Liver. EASL Clinical Practice Guidelines on nutrition in chronic liver disease. Journal of hepatology 2019;70:172-193. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC6657019/) |
| Evert AB, Dennison M, Gardner CD, et al. Nutrition Therapy for Adults With Diabetes or Prediabetes: A Consensus Report. Diabetes care 2019;42:731-754. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC7011201/) |
| Fothergill E, Guo J, Howard L, et al. Persistent metabolic adaptation 6 years after "The Biggest Loser" competition. Obesity (Silver Spring, Md.) 2016;24:1612-1619. | 1.1 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC4989512/) |
| Frankenfield D, Roth-Yousey L, Compher C. Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review. Journal of the American Dietetic Association 2005;105:775-789. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/15883556/) |
| Frankenfield DC. Bias and accuracy of resting metabolic rate equations in non-obese and obese adults. Clinical nutrition (Edinburgh, Scotland) 2013;32:976-982. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/23631843/) |
| Hahn SL, Kaciroti N, Eisenberg D, et al. Introducing Dietary Self-Monitoring to Undergraduate Women via a Calorie Counting App Has No Effect on Mental Health or Health Behaviors: Results From a Randomized Controlled Trial. Journal of the Academy of Nutrition and Dietetics 2021;121:2377-2388. | 1.7 | [link](https://pubmed.ncbi.nlm.nih.gov/34427188/) |
| Haines PS, Hama MY, Guilkey DK, et al. Weekend eating in the United States is linked with greater energy, fat, and alcohol intake. Obesity research 2003;11:945-949. | 1.5 | [link](https://pubmed.ncbi.nlm.nih.gov/12917498/) |
| Hall KD, Chow CC. Why is the 3500 kcal per pound weight loss rule wrong?. International journal of obesity (2005) 2013;37:1614. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC3859816/) |
| Hall KD, Sacks G, Chandramohan D, et al. Quantification of the effect of energy imbalance on bodyweight. Lancet (London, England) 2011;378:826-837. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/) |
| Iraki J, Fitschen P, Espinar S, et al. Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review. Sports (Basel, Switzerland) 2019;7:E154. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/) |
| Jebeile H, McMaster CM, Johnson BJ, et al. Identifying Factors Which Influence Eating Disorder Risk during Behavioral Weight Management: A Consensus Study. Nutrients 2023;15:1085. | 1.7 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC10005214/) |
| Jensen MD, Ryan DH, Apovian CM, et al. 2013 AHA/ACC/TOS guideline for the management of overweight and obesity in adults: a report of the American College of Cardiology/American Heart Association Task Force on Practice Guidelines and The Obesity Society. Circulation 2014;129:S102-38. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC5819889/) |
| Johnson RK, Appel LJ, Brands M, et al. Dietary sugars intake and cardiovascular health: a scientific statement from the American Heart Association. Circulation 2009;120:1011-1020. | 1.3 | [link](https://pubmed.ncbi.nlm.nih.gov/19704096/) |
| Jäger R, Kerksick CM, Campbell BI, et al. International Society of Sports Nutrition Position Stand: protein and exercise. Journal of the International Society of Sports Nutrition 2017;14:20. | 1.3 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/) |
| Kim EK, Kim JH, Kim MH, et al. Validation of dietary reference intake equations for estimating energy requirements in Korean adults by using the doubly labeled water method. Nutrition research and practice 2017;11:300-306. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/28765776/) |
| Kutz AM, Marsh AG, Gunderson CG, et al. Eating Disorder Screening: a Systematic Review and Meta-analysis of Diagnostic Test Characteristics of the SCOFF. Journal of general internal medicine 2020;35:885-893. | 1.7 | [link](https://pubmed.ncbi.nlm.nih.gov/31705473/) |
| Levinson CA, Fewell L, Brosof LC. My Fitness Pal calorie tracker usage in the eating disorders. Eating behaviors 2017;27:14-16. | 1.7 | [link](https://pubmed.ncbi.nlm.nih.gov/28843591/) |
| Linardon J, Messer M. My fitness pal usage in men: Associations with eating disorder symptoms and psychosocial impairment. Eating behaviors 2019;33:13-17. | 1.7 | [link](https://pubmed.ncbi.nlm.nih.gov/30772765/) |
| Ma Y, Olendzki BC, Pagoto SL, et al. Number of 24-hour diet recalls needed to estimate energy intake. Annals of epidemiology 2009;19:553-559. | 1.4 | [link](https://pubmed.ncbi.nlm.nih.gov/19576535/) |
| Madden AM, Mulrooney HM, Shah S. Estimation of energy expenditure using prediction equations in overweight and obese adults: a systematic review. Journal of human nutrition and dietetics : the official journal of the British Dietetic Association 2016;29:458-476. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/26923904/) |
| McComb SE, Mills JS. A systematic review on the effects of media disclaimers on young women's body image and mood. Body image 2020;32:34-52. | 1.7 | [link](https://pubmed.ncbi.nlm.nih.gov/31778888/) |
| Messer M, McClure Z, Norton B, et al. Using an app to count calories: Motives, perceptions, and connections to thinness- and muscularity-oriented disordered eating. Eating behaviors 2021;43:101568. | 1.7 | [link](https://pubmed.ncbi.nlm.nih.gov/34543856/) |
| Michie S, Abraham C, Whittington C, et al. Effective techniques in healthy eating and physical activity interventions: a meta-regression. Health psychology : official journal of the Division of Health Psychology, American Psychological Association 2009;28:690-701. | 1.5 | [link](https://pubmed.ncbi.nlm.nih.gov/19916637/) |
| Mifflin MD, St Jeor ST, Hill LA, et al. A new predictive equation for resting energy expenditure in healthy individuals. The American journal of clinical nutrition 1990;51:241-247. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/2305711/) |
| Misra A, Chowbey P, Makkar BM, et al. Consensus statement for diagnosis of obesity, abdominal obesity and the metabolic syndrome for Asian Indians and recommendations for physical activity, medical and surgical management. The Journal of the Association of Physicians of India 2009;57:163-170. | 1.2 | [link](https://pubmed.ncbi.nlm.nih.gov/19582986/) |
| Moody S, Ross L, Opitz MC, et al. Associations Between the Use of Fitness and Diet Tracking Technology and Disordered Eating Behaviour: A Systematic Review. European eating disorders review : the journal of the Eating Disorders Association 2025;33:1288-1313. | 1.7 | [link](https://pubmed.ncbi.nlm.nih.gov/40640999/) |
| Morton RW, Murphy KT, McKellar SR, et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults. British journal of sports medicine 2018;52:376-384. | 1.3 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867436/) |
| Mozaffarian D, Agarwal M, Aggarwal M, et al. Nutritional priorities to support GLP-1 therapy for obesity: A joint advisory from the American College of Lifestyle Medicine, the American Society for Nutrition, the Obesity Medicine Association, and the Obesity Society. Obesity pillars 2025;15:100181. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC12264624/) |
| Murakami K, Livingstone MB. Prevalence and characteristics of misreporting of energy intake in US adults: NHANES 2003-2012. The British journal of nutrition 2015;114:1294-1303. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/26299892/) |
| Nelson M, Black AE, Morris JA, et al. Between- and within-subject variation in nutrient intake from infancy to old age: estimating the number of days required to rank dietary intakes with desired precision. The American journal of clinical nutrition 1989;50:155-167. | 1.4 | [link](https://pubmed.ncbi.nlm.nih.gov/2750688/) |
| Nunes CL, Casanova N, Francisco R, et al. Does adaptive thermogenesis occur after weight loss in adults? A systematic review. The British journal of nutrition 2022;127:451-469. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/33762040/) |
| Orsama AL, Mattila E, Ermes M, et al. Weight rhythms: weight increases during weekends and decreases during weekdays. Obesity facts 2014;7:36-47. | 1.5 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC5644907/) |
| Park Y, Dodd KW, Kipnis V, et al. Comparison of self-reported dietary intakes from the Automated Self-Administered 24-h recall, 4-d food records, and food-frequency questionnaires against recovery biomarkers. The American journal of clinical nutrition 2018;107:80-93. | 1.1, 1.5 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC5972568/) |
| Passarelli S, Free CM, Shepon A, et al. Global estimation of dietary micronutrient inadequacies: a modelling analysis. The Lancet. Global health 2024;12:e1590-e1599. | 1.4 | [link](https://pubmed.ncbi.nlm.nih.gov/39218000/) |
| Patel ML, Wakayama LN, Bennett GG. Self-Monitoring via Digital Health in Weight Loss Interventions: A Systematic Review Among Adults with Overweight or Obesity. Obesity (Silver Spring, Md.) 2021;29:478-499. | 1.5 | [link](https://pubmed.ncbi.nlm.nih.gov/33624440/) |
| Pontzer H, Yamada Y, Sagayama H, et al. Daily energy expenditure through the human life course. Science (New York, N.Y.) 2021;373:808-812. | 1.1 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC8370708/) |
| Racette SB, Das SK, Bhapkar M, et al. Approaches for quantifying energy intake and %calorie restriction during calorie restriction interventions in humans: the multicenter CALERIE study. American journal of physiology. Endocrinology and metabolism 2012;302:E441-8. | 1.5 | [link](https://pubmed.ncbi.nlm.nih.gov/22127229/) |
| Redman LM, Smith SR, Burton JH, et al. Metabolic Slowing and Reduced Oxidative Damage with Sustained Caloric Restriction Support the Rate of Living and Oxidative Damage Theories of Aging. Cell metabolism 2018;27:805-815.e4. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/29576535/) |
| Reedy J, Lerman JL, Krebs-Smith SM, et al. Evaluation of the Healthy Eating Index-2015. Journal of the Academy of Nutrition and Dietetics 2018;118:1622-1633. | 1.5 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC6718954/) |
| Rhee JJ, Sampson L, Cho E, et al. Comparison of methods to account for implausible reporting of energy intake in epidemiologic studies. American journal of epidemiology 2015;181:225-233. | 1.1 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC4325679/) |
| Rubino F, Cummings DE, Eckel RH, et al. Definition and diagnostic criteria of clinical obesity. The lancet. Diabetes & endocrinology 2025;13:221-262. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC11870235/) |
| Sanghvi A, Redman LM, Martin CK, et al. Validation of an inexpensive and accurate mathematical method to measure long-term changes in free-living energy intake. The American journal of clinical nutrition 2015;102:353-358. | 1.5 | [link](https://pubmed.ncbi.nlm.nih.gov/26040640/) |
| Schwingshackl L, Bogensberger B, Hoffmann G. Diet Quality as Assessed by the Healthy Eating Index, Alternate Healthy Eating Index, Dietary Approaches to Stop Hypertension Score, and Health Outcomes: An Updated Systematic Review and Meta-Analysis of Cohort Studies. Journal of the Academy of Nutrition and Dietetics 2018;118:74-100.e11. | 1.5 | [link](https://pubmed.ncbi.nlm.nih.gov/29111090/) |
| Shams-White MM, Pannucci TE, Lerman JL, et al. Healthy Eating Index-2020: Review and Update Process to Reflect the Dietary Guidelines for Americans,2020-2025. Journal of the Academy of Nutrition and Dietetics 2023;123:1280-1288. | 1.5 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC10524328/) |
| Shan Z, Wang F, Li Y, et al. Healthy Eating Patterns and Risk of Total and Cause-Specific Mortality. JAMA internal medicine 2023;183:142-153. | 1.5 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC9857813/) |
| Simpson CC, Mazzeo SE. Calorie counting and fitness tracking technology: Associations with eating disorder symptomatology. Eating behaviors 2017;26:89-92. | 1.7 | [link](https://pubmed.ncbi.nlm.nih.gov/28214452/) |
| Sinha S, Kurpad AV, Kuriyan R. Total energy expenditure (TEE) of young adults from urban South India: revisiting their daily energy requirement. European journal of clinical nutrition 2021;75:845-851. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/33099580/) |
| Slater GJ, Dieter BP, Marsh DJ, et al. Is an Energy Surplus Required to Maximize Skeletal Muscle Hypertrophy Associated With Resistance Training. Frontiers in nutrition 2019;6:131. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC6710320/) |
| Soares MJ, Piers LS, O'Dea K, et al. No evidence for an ethnic influence on basal metabolism: an examination of data from India and Australia. The British journal of nutrition 1998;79:333-341. | 1.1 | [link](https://pubmed.ncbi.nlm.nih.gov/9624224/) |
| Thomas DM, Martin CK, Lettieri S, et al. Can a weight loss of one pound a week be achieved with a 3500-kcal deficit? Commentary on a commonly accepted rule. International journal of obesity (2005) 2013;37:1611-1613. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC4024447/) |
| Turicchi J, O'Driscoll R, Horgan G, et al. Weekly, seasonal and holiday body weight fluctuation patterns among individuals engaged in a European multi-centre behavioural weight loss maintenance intervention. PloS one 2020;15:e0232152. | 1.5 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC7192384/) |
| US Preventive Services Task Force, Davidson KW, Barry MJ, et al. Screening for Eating Disorders in Adolescents and Adults: US Preventive Services Task Force Recommendation Statement. JAMA 2022;327:1061-1067. | 1.7 | [link](https://pubmed.ncbi.nlm.nih.gov/35289876/) |
| Venkatesh U, Sharma A, Ananthan VA, et al. Micronutrient's deficiency in India: a systematic review and meta-analysis. Journal of nutritional science 2021;10:e110. | 1.6 | [link](https://pubmed.ncbi.nlm.nih.gov/35059191/) |
| Verger EO, Mariotti F, Holmes BA, et al. Evaluation of a diet quality index based on the probability of adequate nutrient intake (PANDiet) using national French and US dietary surveys. PloS one 2012;7:e42155. | 1.5 | [link](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0042155) |
| Villareal DT, Chode S, Parimi N, et al. Weight loss, exercise, or both and physical function in obese older adults. The New England journal of medicine 2011;364:1218-1229. | 1.2 | [link](https://pmc.ncbi.nlm.nih.gov/articles/PMC3114602/) |
| Volkert D, Beck AM, Cederholm T, et al. ESPEN guideline on clinical nutrition and hydration in geriatrics. Clinical nutrition (Edinburgh, Scotland) 2019;38:10-47. | 1.2 | [link](https://pubmed.ncbi.nlm.nih.gov/30005900/) |
| WHO Expert Consultation. Appropriate body-mass index for Asian populations and its implications for policy and intervention strategies. Lancet (London, England) 2004;363:157-163. | 1.2 | [link](https://pubmed.ncbi.nlm.nih.gov/14726171/) |

### A.3 Standards, guidelines, regulations, tools and web pages

**Energy**

| Source | Used in | Link | Checked |
|---|---|---|---|
| National Academies of Sciences, Engineering, and Medicine (2023). *Dietary Reference Intakes for Energy*, chapter 5, “Development of Prediction Equations for Estimated Energy Requirements”. | 1.1 | [link](https://www.nationalacademies.org/read/26818/chapter/7) | Read |
| National Academies Press catalogue page for *Dietary Reference Intakes for Energy* (2023). | 1.1 | [link](https://nap.nationalacademies.org/catalog/26818/dietary-reference-intakes-for-energy) | Link resolves |
| *Dietary Reference Intakes for Energy* (2023), chapter 7, “Applications of the Dietary Reference Intakes for Energy”. | 1.1 | [link](https://www.nationalacademies.org/read/26818/chapter/9) | Read |
| FAO/WHO/UNU (2004). *Human energy requirements: report of a joint FAO/WHO/UNU expert consultation (2001)*, chapter 5. | 1.1 | [link](https://www.fao.org/4/y5686e/y5686e07.htm) | Not reachable |

**Weight change**

| Source | Used in | Link | Checked |
|---|---|---|---|
| US Centers for Disease Control and Prevention. *Losing weight* (web page: gradual loss of about 1 to 2 pounds a week). | 1.2 | [link](https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html) | Read |
| NIDDK. *Choosing a Safe and Successful Weight-Loss Program* (web page). | 1.2 | [link](https://www.niddk.nih.gov/health-information/weight-management/choosing-a-safe-successful-weight-loss-program) | Link resolves |
| NHLBI and NAASO (2000). *The Practical Guide: Identification, Evaluation, and Treatment of Overweight and Obesity in Adults*. | 1.2 | [link](https://www.nhlbi.nih.gov/files/docs/guidelines/prctgd_c.pdf) | Link resolves |
| NHS Better Health. *Calorie counting* (web page). | 1.2 | [link](https://www.nhs.uk/better-health/lose-weight/calorie-counting/) | Link resolves |
| NICE (2025). NG246 *Overweight and obesity management*: Physical activity and diet. | 1.2 | [link](https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet) | Link resolves |
| NIDDK. *Body Weight Planner* (online tool built on the Hall dynamic model). | 1.2 | [link](https://www.niddk.nih.gov/bwp) | Link resolves |
| NHS. *Healthy ways to gain weight* (web page). | 1.2 | [link](https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/healthy-ways-to-gain-weight/) | Link resolves |
| NICE (2025). NG246 *Overweight and obesity management*: Identifying and assessing overweight, obesity and central adiposity (recommendations 1.9.10 to 1.9.12: South Asian thresholds of 23 and 27.5). | 1.2 | [link](https://www.nice.org.uk/guidance/ng246/chapter/Identifying-and-assessing-overweight-obesity-and-central-adiposity) | Read |
| Misra A and colleagues (2025). *Revised definition of obesity in Asian Indians living in India* (consensus document, hosted by CMC Vellore). | 1.2 | [link](https://www.cmcendovellore.org/pub/2025/revised-definition-of-obesity-in-asian-indians-living-in-india.pdf) | Link resolves |
| NHS England Digital Weight Management Programme, GP toolkit (as published by North East London ICB, December 2023): eligibility and exclusions. | 1.2 | [link](https://primarycare.northeastlondon.icb.nhs.uk/wp-content/uploads/2023/12/DWMP-GP-toolkit-Final.pdf) | Link resolves |
| CDC. *National Diabetes Prevention Program: eligibility for the lifestyle change program* (web page). | 1.2 | [link](https://www.cdc.gov/diabetes-prevention/eligible-lifestyle-change-program/index.html) | Read |
| NICE (2025). NG247 *Maternal and child nutrition: nutrition and weight management in pregnancy, and nutrition in children 0 to 5 years*, recommendation 1.2.15 (intentional weight loss in pregnancy is not recommended). | 1.2 | [link](https://www.nice.org.uk/guidance/ng247/chapter/Recommendations) | Read |
| KDIGO (2024). *Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease*. | 1.2 | [link](https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf) | Link resolves |
| MedlinePlus (US National Library of Medicine). Drug information: warfarin. | 1.2 | [link](https://medlineplus.gov/druginfo/meds/a682277.html) | Link resolves |
| MedlinePlus. Drug information: lithium. | 1.2 | [link](https://medlineplus.gov/druginfo/meds/a681039.html) | Link resolves |
| MedlinePlus. Drug information: lisinopril. | 1.2 | [link](https://medlineplus.gov/druginfo/meds/a692051.html) | Link resolves |
| NICE (2006). CG32 *Nutrition support for adults: oral nutrition support, enteral tube feeding and parenteral nutrition*, recommendations 1.3.1 and the refeeding-risk criteria (BMI under 18.5; under 16). | 8, 9 | [link](https://www.nice.org.uk/guidance/cg32/chapter/Recommendations) | Read |

**Macronutrients and nutrients to limit**

| Source | Used in | Link | Checked |
|---|---|---|---|
| US Departments of Health and Human Services and of Agriculture (January 2026). *Dietary Guidelines for Americans, 2025-2030*. | 1.3 | [link](https://cdn.realfood.gov/DGA.pdf) | Link resolves |
| *Scientific Foundation for the Dietary Guidelines for Americans, 2025-2030* (January 2026). | 1.3 | [link](https://cdn.realfood.gov/Scientific%20Report_508.pdf) | Link resolves |
| American Society for Nutrition. News item on a *Journal of Nutrition* perspective reviewing the protein recommendations in the 2025-2030 Dietary Guidelines. | 1.3 | [link](https://nutrition.org/new-perspective-in-the-journal-of-nutrition-reviews-protein-recommendations-in-the-2025-2030-dietary-guidelines/) | Link resolves |
| Health Canada. *Dietary reference intakes tables: reference values for macronutrients* (the 2005 National Academies values). | 1.3 | [link](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients-dietary-reference-intakes-tables-2005.html) | Read |
| WHO (2023). *Carbohydrate intake for adults and children: WHO guideline*. | 1.3 | [link](https://www.who.int/publications/i/item/9789240073593) | Link resolves |
| WHO (2023). *Total fat intake for the prevention of unhealthy weight gain in adults and children: WHO guideline*. | 1.3 | [link](https://www.who.int/publications/i/item/9789240073654) | Link resolves |
| WHO (2023). *Saturated fatty acid and trans-fatty acid intake for adults and children: WHO guideline*. | 1.3 | [link](https://www.who.int/publications/i/item/9789240073630) | Link resolves |
| FAO/WHO (2010). *Fats and fatty acids in human nutrition: report of an expert consultation* (FAO Food and Nutrition Paper 91). | 1.3 | [link](https://www.fao.org/3/i1953e/i1953e.pdf) | Not reachable |
| WHO (2015). *Guideline: sugars intake for adults and children*. | 1.3 | [link](https://www.who.int/publications/i/item/9789241549028) | Link resolves |
| National Academies (2019). *Dietary Reference Intakes for Sodium and Potassium*. | 1.3 | [link](https://nap.nationalacademies.org/read/25353/chapter/1) | Link resolves |
| WHO. *Sodium reduction* (fact sheet). | 1.3 | [link](https://www.who.int/news-room/fact-sheets/detail/sodium-reduction) | Link resolves |
| WHO. *Healthy diet* (fact sheet). | 1.3 | [link](https://www.who.int/news-room/fact-sheets/detail/healthy-diet) | Link resolves |
| Academy of Nutrition and Dietetics (2025). Position paper on vegetarian and vegan dietary patterns. | 1.3 | [link](https://andeal.org/files/files/Vegetarian/VegetarianPP_2025.pdf) | Link resolves |
| NHLBI. *Your Guide to Lowering Your Blood Pressure with DASH*. | 1.3 | [link](https://www.nhlbi.nih.gov/files/docs/public/heart/new_dash.pdf) | Link resolves |

**Vitamins, minerals and dietary assessment**

| Source | Used in | Link | Checked |
|---|---|---|---|
| National Academies (2019). *Dietary Reference Intakes for Sodium and Potassium*, Appendix J, “Dietary Reference Intakes Summary Tables” (the consolidated EAR, RDA/AI and UL tables). | 1.4 | [link](https://www.nationalacademies.org/read/25353/chapter/28) | Read |
| Institute of Medicine (2000). *Dietary Reference Intakes: Applications in Dietary Assessment*, chapter 3, “Using Dietary Reference Intakes for Nutrient Assessment of Individuals”. | 1.4 | [link](https://www.nationalacademies.org/read/9956/chapter/8) | Read |
| Institute of Medicine (2000). *Dietary Reference Intakes: Applications in Dietary Assessment*, summary. | 1.4 | [link](https://www.nationalacademies.org/read/9956/chapter/3) | Read |
| Institute of Medicine (2000). *Dietary Reference Intakes: Applications in Dietary Assessment*, Appendix B (within-person variation, tables B-2 and B-4). | 1.4 | [link](https://www.nationalacademies.org/read/9956/chapter/19) | Link resolves |
| US Departments of Agriculture and of Health and Human Services (2020). *Dietary Guidelines for Americans, 2020-2025* (nutrients of public health concern). | 1.4 | [link](https://odphp.health.gov/sites/default/files/2026-02/dietary_guidelines_for_americans-2020-2025.pdf) | Read |
| Institute of Medicine (2001). *Dietary Reference Intakes for Vitamin A, Vitamin K, Arsenic, Boron, Chromium, Copper, Iodine, Iron, Manganese, Molybdenum, Nickel, Silicon, Vanadium, and Zinc*, chapter 11 (iron). | 1.4 | [link](https://www.nationalacademies.org/read/10026/chapter/11) | Link resolves |
| Same report (2001), chapter 14 (zinc). | 1.4 | [link](https://www.nationalacademies.org/read/10026/chapter/14) | Link resolves |
| US *Code of Federal Regulations*, Title 21, section 101.9, “Nutrition labeling of food” (2025 edition): Daily Values, the general calorie factors in (c)(1)(i)(B) and the 20% rule in (g)(5). | 1.4 | [link](https://www.govinfo.gov/content/pkg/CFR-2025-title21-vol2/xml/CFR-2025-title21-vol2-sec101-9.xml) | Read |
| USDA FoodData Central. *Global Branded Food Products Database Documentation* (a missing nutrient value “does not indicate a zero value”). | 1.4 | [link](https://fdc.nal.usda.gov/GBFPD_Documentation) | Read |
| FAO/INFOODS (2012). *Guidelines for checking food composition data prior to the publication of a user table/database, version 1.0*. | 1.4 | [link](https://www.fao.org/docrep/017/ap810e/ap810e.pdf) | Not reachable |

**Diet-quality scores and feedback**

| Source | Used in | Link | Checked |
|---|---|---|---|
| US National Cancer Institute. *Developing the Healthy Eating Index* (HEI-2020 component standards). | 1.5 | [link](https://epi.grants.cancer.gov/hei/developing.html) | Link resolves |
| OECD and European Commission Joint Research Centre (2008). *Handbook on Constructing Composite Indicators: Methodology and User Guide*. | 1.5 | [link](https://www.oecd.org/content/dam/oecd/en/publications/reports/2008/08/handbook-on-constructing-composite-indicators-methodology-and-user-guide_g1gh9301/9789264043466-en.pdf) | Link resolves |
| Walker J. *The Hacker's Diet*, chapter “Signal and noise” (the exponentially weighted weight trend). | 1.5 | [link](https://www.fourmilab.ch/hackdiet/e4/signalnoise.html) | Link resolves |

**India**

| Source | Used in | Link | Checked |
|---|---|---|---|
| ICMR-NIN (2020). *Nutrient Requirements for Indians: Recommended Dietary Allowances and Estimated Average Requirements*, brief note. | 1.1, 1.6 | [link](https://www.nin.res.in/rdabook/brief_note.pdf) | Link resolves |
| A copy of the ICMR-NIN 2020 short report on nutrient requirements, hosted by a college website (used for the tables; secondary copy). | 1.6 | [link](https://drklbcollege.ac.in/wp-content/uploads/2020/03/DOC-20220614-WA0002_-1.pdf) | Link resolves |
| ICMR-NIN (2024). *Dietary Guidelines for Indians*. | 1.6 | [link](https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI_2024.pdf) | Link resolves |
| National Institute of Nutrition (2017). *Indian Food Composition Tables* (IFCT 2017). | 1.6 | [link](https://nin.res.in/ebooks/IFCT2017.pdf) | Link resolves |
| FSSAI. *Food Safety and Standards (Labelling and Display) Regulations, 2020*, compendium of 9 September 2025. | 1.6 | [link](https://fssai.gov.in/upload/uploadfiles/files/Comp_Labelling%20Display_Version%20VIII_09_09_2025.pdf) | Link resolves |
| International Institute for Population Sciences and ICF (2021). *National Family Health Survey (NFHS-5), India, 2019-21*, national report. | 1.6 | [link](https://dhsprogram.com/pubs/pdf/FR375/FR375.pdf) | Link resolves |

**Safety, privacy and regulation**

| Source | Used in | Link | Checked |
|---|---|---|---|
| NICE (2017). NG69 *Eating disorders: recognition and treatment*, recommendations 1.2.5 and 1.2.6. | 1.2 | [link](https://www.nice.org.uk/guidance/ng69/chapter/Recommendations) | Read |
| Apple. *App Store Review Guidelines* (guidelines 1.4.1, 1.4.5, 5.1.1, 5.1.2 and 5.1.3). | 1.7 | [link](https://developer.apple.com/app-store/review/guidelines/) | Read |
| Google. *Health Content and Services* (Play Console Help). | 1.7 | [link](https://support.google.com/googleplay/android-developer/answer/16679511) | Read |
| National Academies (2022). *Measuring Sex, Gender Identity, and Sexual Orientation*, chapter 2. | 1.7 | [link](https://www.nationalacademies.org/read/26424/chapter/2) | Link resolves |
| *Dietary Reference Intakes for Energy* (2023), chapter 9, “Research Recommendations” (the note that evidence on energy requirements in transgender populations is lacking). | 1.7 | [link](https://www.nationalacademies.org/read/26818/chapter/11) | Read |
| US FDA (6 January 2026). *General Wellness: Policy for Low Risk Devices*, guidance for industry and FDA staff. | 1.7 | [link](https://www.fda.gov/media/90652/download) | Read |
| US FDA (29 January 2026). *Clinical Decision Support Software*, guidance for industry and FDA staff. | 1.7 | [link](https://www.fda.gov/media/109618/download) | Read |
| Medical Device Coordination Group (EU). MDCG 2019-11, *Guidance on qualification and classification of software in Regulation (EU) 2017/745 and (EU) 2017/746*. | 1.7 | [link](https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en?filename=mdcg_2019_11_en.pdf) | Link resolves |
| CDSCO (India). *Guidance document on medical device software under the Medical Devices Rules, 2017*. | 1.7 | [link](https://cdsco.gov.in/opencms/export/sites/CDSCO_WEB/Pdf-documents/Guidance-document-on-Medical-Device-Software-under-MDR-2017.pdf) | Link resolves |
| Government of India (2023). *The Digital Personal Data Protection Act, 2023* (Act 22 of 2023), India Code copy. The text was read from the PRS Legislative Research copy (prsindia.org). | 1.7 | [link](https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf) | Read |
| Government of India (2025). *Digital Personal Data Protection Rules, 2025* (Gazette of India notification). | 1.7 | [link](https://egazette.gov.in/WriteReadData/2025/267650.pdf) | Link resolves |
| US Federal Trade Commission (30 May 2024). *Health Breach Notification Rule*, final rule, 89 Federal Register. | 1.7 | [link](https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule) | Link resolves |
| European Union (2016). *General Data Protection Regulation*, Regulation (EU) 2016/679. | 1.7 | [link](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679) | Link resolves |
| Cloudflare. D1 documentation: data security (encryption at rest and in transit). | 1.7 | [link](https://developers.cloudflare.com/d1/reference/data-security/) | Read |
| Cloudflare. D1 documentation: Time Travel and backups (7 or 30 days). | 1.7 | [link](https://developers.cloudflare.com/d1/reference/time-travel/) | Read |
| OWASP. *Mobile Top 10 2023*, M1: Improper Credential Usage. | 1.7 | [link](https://owasp.github.io/www-project-mobile-top-10/2023-risks/m1-improper-credential-usage.html) | Link resolves |
| React Native documentation: Security. | 1.7 | [link](https://reactnative.dev/docs/security) | Link resolves |
| Vapi. Privacy policy. | 1.7 | [link](https://vapi.ai/privacy) | Read |
| Vapi documentation: data flow. | 1.7 | [link](https://docs.vapi.ai/security-and-privacy/data-flow) | Link resolves |
| Vapi documentation: HIPAA compliance. | 1.7 | [link](https://docs.vapi.ai/security-and-privacy/hipaa) | Read |
| Vapi documentation: Zero Data Retention. | 1.7 | [link](https://docs.vapi.ai/security-and-privacy/zero-data-retention) | Read |
| PRS Legislative Research copy of the Digital Personal Data Protection Act, 2023 (text read: sections 2(f), 3, 8, 9, 12 and the Schedule). | 8, 9 | [link](https://prsindia.org/files/bills_acts/acts_parliament/2023/Digital_Personal_Data_Protection_Act,_2023.pdf) | Read |

**Platform**

| Source | Used in | Link | Checked |
|---|---|---|---|
| Cloudflare. D1 documentation: pricing (Free plan: 5 million rows read and 100,000 rows written a day; 5 GB storage). | 8, 9 | [link](https://developers.cloudflare.com/d1/platform/pricing/) | Read |
| Cloudflare. D1 documentation: limits (queries per invocation 50 Free and 1,000 Paid; 100 bound parameters; 500 MB database on Free). | 8, 9 | [link](https://developers.cloudflare.com/d1/platform/limits/) | Read |

### A.4 What could not be verified

None of these supports a number the engine uses; where an item matters, section 12(E) says what the plan does.

- **Not reachable in the final pass:** the three FAO pages above. India Code's copy of the Data Protection Act returned an access error; the Act's text was read from the PRS copy.
- **Not found:** statements on calorie-tracking apps from NEDA, the Academy for Eating Disorders or FEAST; evidence that disclaimers change behaviour in health apps; an authoritative calorie floor for consumer apps.
- **Not read at the source:** the original SCOFF validation; the NHS England programme page itself (read through a regional NHS copy); the Endocrine Society guidance; the AHA 5-6% saturated-fat figure; the 2005 IOM originals and the ADA and ACSM texts; the NIH Office of Dietary Supplements fact sheets; EFSA changes after 2017; the full ICMR-NIN report (the brief note and a short-report copy were used); Passarelli's South Asia numbers; FSSAI changes after September 2025; the origin of the popular 1.2 to 1.9 activity multipliers (none was found).
- **Legal and regulatory status not settled:** whether India shortened the Data Protection Rules' 18-month phase-in (a proposal was reported, not confirmed); the final status of CDSCO's software guidance; the current US Health Breach Notification Rule penalty; whether that rule or Washington's My Health My Data Act reaches an India-based app; OpenAI's retention terms; the wording of Google's Data safety form.
- **No validation exists** (so none can be cited) for the exponential weight smoother as a trend estimator, for "adaptive" calorie targets inferred from logged intake plus weights, for any one-week score from self-logged data, for HEI against the 2025-2030 guidelines, or for the effect of showing scores or grades.

## Appendix B. Reference intakes used by the engine

Adult Dietary Reference Intakes for the eleven vitamins, minerals and electrolytes the app tracks, copied from the National Academies' consolidated tables (Appendix J of the 2019 sodium and potassium report; the underlying reports are 1997-2019). The tables were re-extracted from the publisher's page for this plan and checked against 28 values by hand; **the engine's implementation must be checked again against the source (11.3)**. The first number in each cell is the **RDA** (meets the needs of nearly all healthy people) or, where marked †, the **Adequate Intake** (an observed-intake estimate with no probability of adequacy). The Estimated Average Requirement (EAR) is in parentheses. Rows are by sex used for calculations; `average` takes the mean of the two rows at every step (4.1).

### B.1 Adult reference intakes by sex and age band

| Nutrient (unit) | Sex | 19-30 | 31-50 | 51-70 | Over 70 | Upper Level (UL) and what it covers |
|---|---|---|---|---|---|---|
| Vitamin A (µg RAE) | Female | 700 (500) | 700 (500) | 700 (500) | 700 (500) | 3,000, preformed vitamin A only (not carotenoids) |
| | Male | 900 (625) | 900 (625) | 900 (625) | 900 (625) | |
| Vitamin C (mg) | Female | 75 (60) | 75 (60) | 75 (60) | 75 (60) | 2,000, all sources |
| | Male | 90 (75) | 90 (75) | 90 (75) | 90 (75) | |
| Vitamin D (µg) | Female | 15 (10) | 15 (10) | 15 (10) | 20 (10) | 100, all sources |
| | Male | 15 (10) | 15 (10) | 15 (10) | 20 (10) | |
| Vitamin E (mg α-tocopherol) | Female | 15 (12) | 15 (12) | 15 (12) | 15 (12) | 1,000, supplemental (synthetic) forms only |
| | Male | 15 (12) | 15 (12) | 15 (12) | 15 (12) | |
| Vitamin K (µg) | Female | 90† | 90† | 90† | 90† | none set |
| | Male | 120† | 120† | 120† | 120† | |
| Calcium (mg) | Female | 1,000 (800) | 1,000 (800) | 1,200 (1,000) | 1,200 (1,000) | 2,500 (to age 50), 2,000 (51 and over), all sources |
| | Male | 1,000 (800) | 1,000 (800) | 1,000 (800) | 1,200 (1,000) | |
| Iron (mg) | Female | 18 (8.1) | 18 (8.1) | 8 (5) | 8 (5) | 45, all sources |
| | Male | 8 (6) | 8 (6) | 8 (6) | 8 (6) | |
| Magnesium (mg) | Female | 310 (255) | 320 (265) | 320 (265) | 320 (265) | 350, supplements and drugs only (not food) |
| | Male | 400 (330) | 420 (350) | 420 (350) | 420 (350) | |
| Zinc (mg) | Female | 8 (6.8) | 8 (6.8) | 8 (6.8) | 8 (6.8) | 40, all sources |
| | Male | 11 (9.4) | 11 (9.4) | 11 (9.4) | 11 (9.4) | |
| Potassium (mg) | Female | 2,600† | 2,600† | 2,600† | 2,600† | none set |
| | Male | 3,400† | 3,400† | 3,400† | 3,400† | |
| Sodium (mg) | Female | 1,500† | 1,500† | 1,500† | 1,500† | none; 2,300 is the Chronic Disease Risk Reduction level, not an Upper Level |
| | Male | 1,500† | 1,500† | 1,500† | 1,500† | |

Adjustments applied by the engine: iron x 1.8 for eggs-but-no-meat, vegetarian and vegan patterns (4.6); vitamin D assumes minimal sun exposure; vitamin A is in retinol activity equivalents (ICMR's retinol equivalents count carotenoids at 6:1 rather than 12:1, so the two are not interchangeable); vitamin E counts only alpha-tocopherol forms. Fibre, protein, sodium limit, potassium and the macronutrient ranges are in 4.4 and 4.5.

### B.2 The micronutrient references the personas use (golden vectors)

Produced by the reference engine of Appendix E from the table above for the thirteen personalised personas of section 4.8 (the three reference-only personas have none). Hari's iron is 8 x 1.8 = 14.4 mg; Kamala's vitamin D is 20 µg; Sam's values are the means of the female and male rows.

| Persona | Calcium mg | Iron mg | Magnesium mg | Zinc mg | Potassium mg | Vitamin A µg RAE | Vitamin C mg | Vitamin D µg | Vitamin E mg | Vitamin K µg |
|---|---|---|---|---|---|---|---|---|---|---|
| Asha | 1,000 | 18 | 310 | 8 | 2,600 | 700 | 75 | 15 | 15 | 90 |
| Ravi | 1,000 | 8 | 400 | 11 | 3,400 | 900 | 90 | 15 | 15 | 120 |
| Meena | 1,200 | 8 | 320 | 8 | 2,600 | 700 | 75 | 15 | 15 | 90 |
| Vikram | 1,000 | 8 | 420 | 11 | 3,400 | 900 | 90 | 15 | 15 | 120 |
| Kamala | 1,200 | 8 | 320 | 8 | 2,600 | 700 | 75 | 20 | 15 | 90 |
| Hari | 1,000 | 14.4 | 420 | 11 | 3,400 | 900 | 90 | 15 | 15 | 120 |
| Arjun | 1,000 | 8 | 400 | 11 | 3,400 | 900 | 90 | 15 | 15 | 120 |
| Priya | 1,000 | 18 | 310 | 8 | 2,600 | 700 | 75 | 15 | 15 | 90 |
| Lata | 1,200 | 8 | 320 | 8 | 2,600 | 700 | 75 | 15 | 15 | 90 |
| Small | 1,200 | 8 | 320 | 8 | 2,600 | 700 | 75 | 15 | 15 | 90 |
| Sam | 1,000 | 13 | 370 | 9.5 | 3,000 | 800 | 82.5 | 15 | 15 | 105 |
| Under | 1,000 | 8 | 420 | 11 | 3,400 | 900 | 90 | 15 | 15 | 120 |
| Healthy | 1,000 | 18 | 310 | 8 | 2,600 | 700 | 75 | 15 | 15 | 90 |

## Appendix C. Example requests and responses

These show the shape and the numbers, not final field names. The numbers in C.1 and C.2 come from the reference engine of Appendix E (persona Asha of 4.8, and the pregnancy gate). The numbers in C.3 come from the report prototype (which Appendix F reproduces) run on a realistic week for the same persona (the "realistic varied week" of 5.9); `topSources` and `history` are not produced by the prototype and are **illustrative**. `jsonc` comments mark what is abridged.

### C.1 Previewing targets during onboarding

```http
POST /me/targets/preview
Authorization: Bearer <APP_TOKEN>
X-User-Id: 6f1c0a52-...
Content-Type: application/json

{
  "profile": {
    "birthYear": 1996, "birthMonth": 3,
    "sexForCalc": "female", "heightCm": 160, "weightKg": 60,
    "activity": "low_active", "goal": "general_health", "pace": "standard",
    "pattern": "omnivore", "referenceSet": "nasem"
  },
  "safety": { "pregnantOrBreastfeeding": false, "eatingDisorder": false,
              "clinicianDiet": false, "dietInteractingMedicine": false }
}
```

The `safety` block is read and discarded; it is never stored or logged (8.1). A preview needs no profile secret.

```jsonc
200 OK
{
  "targetSet": {
    "id": null,                                   // a preview is not saved
    "effectiveFrom": "2026-10-12", "engineVersion": "1.0.0", "referenceSet": "nasem",
    "mode": "personalised",
    "inputs": { "ageBand": "19-30", "sexForCalc": "female", "heightCm": 160, "weightKg": 60, "bmi": 23.4,
                "activity": "low_active", "goal": "general_health", "goalApplied": "general_health",
                "pace": "standard", "pattern": "omnivore" },
    "energy": { "maintenance": 2150, "target": 2150, "low": 1910, "high": 2390, "method": "nasem2023",
                "floorApplied": false, "crossCheck": { "mifflinPal": 2060, "disagree": false } },
    "targets": [
      { "nutrient": "calories", "kind": "energy", "unit": "kcal", "value": 2150, "low": 1910, "high": 2390,
        "refType": "estimate", "window": "week", "evidence": "E", "basis": "nasem2023-eer",
        "how": "Energy to keep your weight steady, from the US National Academies' 2023 equation for your age, height, weight and activity. Your real needs could be anywhere from about 1,910 to 2,390 kcal.",
        "scored": false, "verdicts": true, "origin": "recommended" },
      { "nutrient": "protein", "kind": "minimum", "unit": "g", "value": 60,
        "refType": "estimate", "window": "week", "evidence": "A", "basis": "protein-per-kg",
        "how": "1.0 g for each kg of your weight: above the recommended allowance of 0.8, below the 1.2 to 1.6 used in US 2025-2030 guidance.",
        "scored": true, "verdicts": true, "origin": "recommended" },
      { "nutrient": "fiber", "kind": "minimum", "unit": "g", "value": 30,
        "refType": "AI", "window": "week", "evidence": "R", "basis": "nasem-fibre-ai",
        "how": "14 g for every 1,000 kcal of your target, and at least 25 g (US National Academies Adequate Intake; WHO).",
        "scored": true, "verdicts": true, "origin": "recommended" },
      { "nutrient": "sodium", "kind": "limit", "unit": "mg", "value": 2300,
        "refType": "limit", "window": "week", "evidence": "R", "basis": "nasem2019-cdrr",
        "how": "The level above which cutting back is expected to lower chronic-disease risk (US National Academies, 2019).",
        "scored": true, "verdicts": true, "origin": "recommended" },
      { "nutrient": "calcium", "kind": "minimum", "unit": "mg", "value": 1000, "upperLevel": 2500,
        "refType": "RDA", "window": "week", "evidence": "R", "basis": "nasem-dri-appendix-j",
        "how": "Recommended Dietary Allowance for women aged 19 to 30. The upper level covers all sources, including supplements.",
        "scored": true, "verdicts": true, "origin": "recommended" }
      // ... fat (range 20-35% of energy, 72 g at 30%), carbohydrate (316 g), potassium (2,600 mg, AI),
      //     iron (18 mg, upper level 45), magnesium (310), zinc (8), and vitamins A, C, D, E, K (four-week window)
    ],
    "warnings": []
  }
}
```

### C.2 A gate: the person says they are pregnant

```http
PUT /me/profile
Authorization: Bearer <APP_TOKEN>
X-User-Id: 6f1c0a52-...
X-Profile-Secret: <secret>

{ "profile": { "numbersHidden": false },
  "safety": { "pregnantOrBreastfeeding": true, "eatingDisorder": false,
              "clinicianDiet": false, "dietInteractingMedicine": false },
  "consentVersion": "2026-10-v1" }
```

```jsonc
200 OK
{
  "profile": { "mode": "reference_only", "numbersHidden": false, "dietInteractingMedicine": false },
  "targetSet": null,                              // no calorie, weight or macro targets are set
  "warnings": [ { "id": "reference_only", "severity": "info" } ]
}
```

Only the mode, the two flags and the consent are stored. No body data is stored and nothing records that the answer was "pregnant" (8.1). With `eatingDisorder: true` the same response carries `"numbersHidden": true`.

### C.3 The weekly report for one realistic week

```http
GET /reports/weekly?start=2026-10-05&weeks=8
X-Profile-Secret: <secret>
```

```jsonc
200 OK
{
  "engineVersion": "1.0.0",
  "week": { "start": "2026-10-05", "end": "2026-10-11", "today": "2026-10-12", "isCurrent": false },
  "mode": "personalised",
  "targetSet": { "id": "ts_01", "effectiveFrom": "2026-10-01" },
  "display": { "numbersHidden": false },
  "coverage": {
    "days": [
      { "date": "2026-10-05", "state": "valid", "kcal": 1530, "lowIntake": false, "veryHigh": false },
      { "date": "2026-10-06", "state": "valid", "kcal": 1890, "lowIntake": false, "veryHigh": false },
      { "date": "2026-10-07", "state": "valid", "kcal": 1800, "lowIntake": false, "veryHigh": false },
      { "date": "2026-10-08", "state": "valid", "kcal": 1620, "lowIntake": false, "veryHigh": false },
      { "date": "2026-10-09", "state": "valid", "kcal": 2430, "lowIntake": false, "veryHigh": false },
      { "date": "2026-10-10", "state": "valid", "kcal": 2250, "lowIntake": false, "veryHigh": false },
      { "date": "2026-10-11", "state": "valid", "kcal": 2070, "lowIntake": false, "veryHigh": false }
    ],
    "assessedDays": 7, "weekendAssessedDays": 2, "pendingItems": 0, "confidence": "good"
  },
  "energy": { "meanKcal": 1940, "target": 2150, "low": 1910, "high": 2390, "daysInBand": 2, "assessedDays": 7 },
  "nutrients": [
    { "nutrient": "protein", "target": { /* as in C.1 */ },
      "meanPerAssessedDay": 64, "isLowerBound": false, "dataCoverage": 1.0,
      "daysMeeting": 5, "assessedDays": 7, "dayValues": [50, 62, 59, 53, 80, 74, 68],
      "assessment": "meets", "topSources": [] },
    { "nutrient": "sodium", "target": { /* limit 2300 mg */ },
      "meanPerAssessedDay": 2586, "isLowerBound": false, "dataCoverage": 1.0,
      "daysMeeting": 4, "assessedDays": 7, "dayValues": [2000, 2300, 2100, 2200, 3600, 3100, 2800],
      "assessment": "over",
      "topSources": [ { "foodId": "f_pickle", "name": "mango pickle", "share": 0.31 },      // illustrative
                      { "foodId": "f_papad",  "name": "papad", "share": 0.18 } ] },
    { "nutrient": "calcium", "target": { /* 1000 mg */ },
      "meanPerAssessedDay": 561, "isLowerBound": false, "dataCoverage": 1.0,
      "daysMeeting": 0, "assessedDays": 7, "dayValues": [442, 546, 520, 468, 702, 650, 598],
      "assessment": "below", "topSources": [] }
    // ... fibre 29 g (meets), potassium 2,966 mg (meets), iron 13 mg (71%, below),
    //     magnesium 337 mg (meets), zinc 9 mg (meets), and the remaining nutrients
  ],
  "fourWeek": [ /* vitamins A, C, D, E, K over the rolling four weeks */ ],
  "score": {
    "value": 91.4, "shown": 90, "isMinimum": false, "points": 50.3, "outOf": 55, "range": null,    // the leave-one-day-out range (90.9 to 92.0)
    "components": [                                                           // is shown only with 4 or 5 assessed days
      { "id": "protein",   "points": 10,   "outOf": 10, "coverage": 1.0, "scorable": true },
      { "id": "fibre",     "points": 10,   "outOf": 10, "coverage": 1.0, "scorable": true },
      { "id": "potassium", "points": 5,    "outOf": 5,  "coverage": 1.0, "scorable": true },
      { "id": "calcium",   "points": 3.45, "outOf": 5,  "coverage": 1.0, "scorable": true },
      { "id": "iron",      "points": 4.39, "outOf": 5,  "coverage": 1.0, "scorable": true },
      { "id": "magnesium", "points": 5,    "outOf": 5,  "coverage": 1.0, "scorable": true },
      { "id": "zinc",      "points": 5,    "outOf": 5,  "coverage": 1.0, "scorable": true },     // the app shows the four minerals as one group
      { "id": "sodium",    "points": 7.42, "outOf": 10, "coverage": 1.0, "scorable": true }
    ]
  },
  "insights": [
    { "id": "sodium_over",     "priority": 4, "nutrient": "sodium",  "params": { "mean": 2586, "limit": 2300 } },
    { "id": "mineral_gap",     "priority": 4, "nutrient": "calcium", "params": { "mean": 561, "reference": 1000 } },
    { "id": "mineral_gap",     "priority": 4, "nutrient": "iron",    "params": { "mean": 13, "reference": 18 } },
    { "id": "weekend_pattern", "priority": 4, "params": { "pct": 17, "direction": "more" } }
  ],                                                                            // the app shows the first three
  "history": [ { "weekStart": "2026-08-17", "assessedDays": 5, "energyPct": 88, "proteinPct": 96, "score": 85 }  /* ... eight weeks */ ],
  "disclaimerId": "estimates-v1"
}
```

In this example the score is "about 90" because every component has full coverage. If the sodium values were missing on a few foods, the sodium component's `scorable` would be `false`, its `points` 0, and the card would read "at least 80" with the missing component named (5.5).

### C.4 Access control

```http
GET /me/profile
Authorization: Bearer <APP_TOKEN>
X-User-Id: 6f1c0a52-...          (no X-Profile-Secret)
```

```jsonc
403 Forbidden
{ "error": { "code": "profile_secret_required", "message": "This profile's secret is required." } }
```

## Appendix D. Glossary

| Term | Meaning |
|---|---|
| **BMR / RMR** | Basal / resting metabolic rate: the energy the body uses at rest in a day |
| **TEE / TDEE** | Total (daily) energy expenditure: what a person burns in a day including movement and digestion. At stable weight, intake equals TEE |
| **PAL** | Physical activity level: TEE divided by BMR. Typical adults range from about 1.4 (sedentary) to 2.4 (very active) |
| **EER** | Estimated Energy Requirement: the average energy intake predicted to maintain weight in a healthy person of a given age, sex, size and activity |
| **DRI** | Dietary Reference Intakes: the US/Canada reference values published by the National Academies (NASEM, formerly IOM) |
| **EAR** | Estimated Average Requirement: meets the needs of half of healthy people in a group. Used to assess groups |
| **RDA** | Recommended Dietary Allowance: meets the needs of nearly all (97 to 98%) healthy people. The usual personal target |
| **AI** | Adequate Intake: a target set from observed intakes when there is not enough evidence for an EAR and RDA. Intake below it supports no conclusion about adequacy |
| **UL** | Tolerable Upper Intake Level: the highest daily intake unlikely to cause harm. Not a target; for some nutrients it applies only to supplements and fortified foods |
| **AMDR** | Acceptable Macronutrient Distribution Range: the share of energy from carbohydrate, fat and protein associated with adequate nutrition and lower chronic-disease risk |
| **CDRR** | Chronic Disease Risk Reduction intake: the sodium level above which reducing intake is expected to lower chronic-disease risk |
| **DV** | Daily Value: the reference amount used on US food labels (one number for everyone, based on a 2,000 kcal diet) |
| **ICMR-NIN** | Indian Council of Medical Research and National Institute of Nutrition: India's source of recommended dietary allowances and dietary guidelines |
| **HEI** | Healthy Eating Index: the US government's 100-point measure of how closely a diet follows the Dietary Guidelines, scored mostly as densities per 1,000 kcal |
| **NAR / MAR** | Nutrient Adequacy Ratio (intake over requirement, capped at 1) / Mean Adequacy Ratio (their average) |
| **Nutrient density** | Amount of a nutrient per 1,000 kcal eaten. Lets quality be compared independent of how much was eaten |
| **Nutrient mix** | This plan's score: how well the mix of what was logged, per calorie, covers the person's reference intakes and stays inside the sodium standard (5.5) |
| **Usual intake** | A person's long-run average intake, which a few days of records only approximate |
| **Lower bound** | A total that is at least the true value because some contributions were unknown. It can show "more than" but never "less than" |
| **Minimum score** | A Nutrient mix value in which an unknown component earned nothing, shown as "at least N" (5.5) |
| **Coverage** | The share of a person's logged energy that comes from foods that have a value for a given nutrient. For a limit nutrient it is the lower of that share and the share of logged items with a value (7.3) |
| **Assessed day** | A day complete enough to count in the week's averages: logged (`valid`) or marked complete (`confirmed`) (7.2) |
| **Target set** | An immutable, versioned snapshot of the targets computed for a person, with the inputs used; reports judge each day against the set in force that day (6.2) |
| **Mode** | `personalised`, `generic` or `reference_only`: which kind of targets a profile gets (8.1) |
| **Gate** | A rule in the eligibility matrix that withholds or changes a goal or target for safety (8.1) |
| **Low-pressure mode** | A display setting that hides calorie, weight and score numbers (8.2) |
| **Jackknife range** | The range of a score when each assessed day is left out in turn; a visible measure of how much one day drives the score |
| **EWMA** | Exponentially weighted moving average: a smoothing method that damps day-to-day weight noise |
| **Evidence tags** | **[R]** reference value or formal recommendation from a standards body; **[E]** estimate from a validated prediction equation or model with known error; **[G]** guidance: a professional-society position or a meta-analysis, evidence-informed but not a formal standard; **[A]** assumption: a design choice in this plan that no standard dictates |

## Appendix E. Reference implementation of the targets engine

This is the independent second implementation used for every worked example in section 4 and for the golden vectors of 11.1. It is Python with no dependencies, **not production code**, and it is deliberately not written in the style of the Worker: it exists so that two implementations, written separately, can be made to agree. Run it with `python3 engine_ref.py`; it prints NASEM's two published examples (2,275 and 3,041 kcal) and one line per persona. It reproduced the 1,199,520-input sweep of 11.2 with no failures, and a copy of it agrees with the working version on the sixteen personas and 60,000 random inputs.

```python
"""
Reference implementation of the targets engine, v1.0 (WEEKLY_BREAKDOWN_PLAN.md section 4).
Python 3.9+, standard library only. NOT production code: it is the independent second implementation the
TypeScript engine is tested against (11.1) and the source of every worked example in sections 4 and 11.
Every constant is tagged R (reference value), E (estimate), G (guidance) or A (assumption), as in 4.10.
Python's round() sends exact halves to the even neighbour; the TypeScript port must fix its own rule and
check it against the personas (none of them sits on a half).
"""
from dataclasses import dataclass
from typing import Tuple
import math

# ---- 4.2 energy: NASEM 2023 Table 5-5 [R], adults 19 and over, all BMIs.
# kcal/day = c0 + c_age * age(y) + c_height * height(cm) + c_weight * weight(kg)
EER = {
    "male":   {"inactive": (753.07, -10.83, 6.50, 14.10), "low_active": (581.47, -10.83, 8.30, 14.94),
               "active": (1004.82, -10.83, 6.52, 15.91), "very_active": (-517.88, -10.83, 15.61, 19.11)},
    "female": {"inactive": (584.90, -7.01, 5.72, 11.71), "low_active": (575.77, -7.01, 6.60, 12.14),
               "active": (710.25, -7.01, 6.54, 12.34), "very_active": (511.83, -7.01, 9.07, 12.56)},
}
SEPV = {"male": 342.0, "female": 241.0}                 # standard error of a predicted value, kcal/day [R] NASEM Table 5-8
PAL_ORDER = ["inactive", "low_active", "active", "very_active"]
PAL_T71 = {"inactive": 1.40, "low_active": 1.60, "active": 1.75, "very_active": 2.05}   # NASEM Table 7-1, cross-check only [R]

# ---- 4.3 goal adjustment [A anchored on G]
FLOOR = {"female": 1200, "male": 1500, "average": 1350}  # lowest loss target shown [G: AHA/ACC/TOS "usual" ranges]
HARD_WALL = 800                                          # never below (very-low-calorie diet line) [G]
PACE = {"gentle": (0.10, 200, 300), "standard": (0.15, 200, 500), "faster": (0.20, 200, 600)}   # share of maintenance, min, max kcal
DEFICIT_CAP_SHARE, DEFICIT_CAP_KCAL = 0.25, 750          # never more than 25% of maintenance or 750 kcal
MIN_USEFUL_DEFICIT = 150
MAX_WEEKLY_LOSS_PCT, MAX_WEEKLY_LOSS_KG = 0.01, 1.0      # static first-weeks rate caps
GAIN = (0.15, 250, 500, 0.20)                            # share, min, max, cap share
MUSCLE = {"lt25": (0.10, 150, 300), "25to30": (0.05, 100, 200), "ge30": (0.0, 0, 0)}

# ---- 4.4 macronutrients
PROTEIN_GKG = {"general_health": 1.0, "maintain": 1.0, "lose": 1.4, "gain": 1.2, "build_muscle": 1.6}   # [A inside G ranges]
PROTEIN_GKG_OLDER = 1.2                                  # age 65 and over [G]
PROTEIN_RDA_GKG, PROTEIN_MAX_GKG = 0.8, 2.0              # RDA [R]; cap [G]
FAT_SHARE, FAT_MIN_SHARE = 0.30, 0.20                    # default [A]; floor [R range edge]
CARB_FLOOR_G = 130                                       # RDA [R]
FIBRE_G_PER_1000KCAL, FIBRE_FLOOR_G = 14.0, 25.0         # [R]
SODIUM_LIMIT_MG = 2300                                   # Chronic Disease Risk Reduction level [R]
POTASSIUM_AI = {"male": 3400, "female": 2600}            # Adequate Intake [R]
BMI_PROTEIN_CAP = 30.0                                   # reference weight = weight at BMI 30 when BMI is higher [A]

# ---- 8.1 gates
MIN_AGE = 19                                             # adult DRIs and equations [R]
BMI_MIN, BMI_MAX = 16.0, 60.0                            # personalised range [A]
LOSE_MIN_BMI = {"nasem": 25.0, "icmr_nin": 23.0}         # [G] NICE NG246, CDC NDPP
OBESE_BMI = {"nasem": 30.0, "icmr_nin": 27.5}

# ---- 4.6 micronutrients: (RDA or AI, "RDA"|"AI", Upper Level or None) for age bands 19-30, 31-50, 51-70, over 70 [R]
# National Academies consolidated tables (Appendix B of this plan).
BANDS = ("19-30", "31-50", "51-70", ">70")
DRI = {
    ("vitamin_a", "F"): [(700, 'RDA', 3000), (700, 'RDA', 3000), (700, 'RDA', 3000), (700, 'RDA', 3000)],
    ("vitamin_a", "M"): [(900, 'RDA', 3000), (900, 'RDA', 3000), (900, 'RDA', 3000), (900, 'RDA', 3000)],
    ("vitamin_c", "F"): [(75, 'RDA', 2000), (75, 'RDA', 2000), (75, 'RDA', 2000), (75, 'RDA', 2000)],
    ("vitamin_c", "M"): [(90, 'RDA', 2000), (90, 'RDA', 2000), (90, 'RDA', 2000), (90, 'RDA', 2000)],
    ("vitamin_d", "F"): [(15, 'RDA', 100), (15, 'RDA', 100), (15, 'RDA', 100), (20, 'RDA', 100)],
    ("vitamin_d", "M"): [(15, 'RDA', 100), (15, 'RDA', 100), (15, 'RDA', 100), (20, 'RDA', 100)],
    ("vitamin_e", "F"): [(15, 'RDA', 1000), (15, 'RDA', 1000), (15, 'RDA', 1000), (15, 'RDA', 1000)],
    ("vitamin_e", "M"): [(15, 'RDA', 1000), (15, 'RDA', 1000), (15, 'RDA', 1000), (15, 'RDA', 1000)],
    ("vitamin_k", "F"): [(90, 'AI', None), (90, 'AI', None), (90, 'AI', None), (90, 'AI', None)],
    ("vitamin_k", "M"): [(120, 'AI', None), (120, 'AI', None), (120, 'AI', None), (120, 'AI', None)],
    ("calcium", "F"): [(1000, 'RDA', 2500), (1000, 'RDA', 2500), (1200, 'RDA', 2000), (1200, 'RDA', 2000)],
    ("calcium", "M"): [(1000, 'RDA', 2500), (1000, 'RDA', 2500), (1000, 'RDA', 2000), (1200, 'RDA', 2000)],
    ("iron", "F"): [(18, 'RDA', 45), (18, 'RDA', 45), (8, 'RDA', 45), (8, 'RDA', 45)],
    ("iron", "M"): [(8, 'RDA', 45), (8, 'RDA', 45), (8, 'RDA', 45), (8, 'RDA', 45)],
    ("magnesium", "F"): [(310, 'RDA', 350), (320, 'RDA', 350), (320, 'RDA', 350), (320, 'RDA', 350)],
    ("magnesium", "M"): [(400, 'RDA', 350), (420, 'RDA', 350), (420, 'RDA', 350), (420, 'RDA', 350)],
    ("zinc", "F"): [(8, 'RDA', 40), (8, 'RDA', 40), (8, 'RDA', 40), (8, 'RDA', 40)],
    ("zinc", "M"): [(11, 'RDA', 40), (11, 'RDA', 40), (11, 'RDA', 40), (11, 'RDA', 40)],
}
PLANT_BASED = ("eggetarian", "vegetarian", "vegan")      # iron x 1.8 [R] NASEM 2001


def age_band(age: int) -> int:
    return 0 if age <= 30 else 1 if age <= 50 else 2 if age <= 70 else 3


def micro_ref(nutrient: str, sex: str, age: int):
    """(reference value, type, upper level). 'average' is the mean of the female and male values."""
    b = age_band(age)
    f, m = DRI[(nutrient, "F")][b], DRI[(nutrient, "M")][b]
    if sex == "average":
        return (f[0] + m[0]) / 2, f[1], f[2]
    return DRI[(nutrient, "F" if sex == "female" else "M")][b]


def round10(x: float) -> int:
    return int(round(x / 10.0)) * 10


def raw_eer(sex, age, h, w, pal):
    c0, ca, ch, cw = EER[sex][pal]
    return c0 + ca * age + ch * h + cw * w


def eer(sex, age, h, w, pal):
    """NASEM maintenance estimate with ONE guard of ours [A]: a higher activity category never lowers the
    estimate (the published men's 'very active' equation falls below 'active' for short, light men)."""
    if sex == "average":
        return (eer("male", age, h, w, pal) + eer("female", age, h, w, pal)) / 2
    upto = PAL_ORDER[: PAL_ORDER.index(pal) + 1]
    return max(raw_eer(sex, age, h, w, c) for c in upto)


def sepv(sex):
    return (SEPV["male"] + SEPV["female"]) / 2 if sex == "average" else SEPV[sex]


def mifflin_rmr(sex, age, h, w):
    base = 10 * w + 6.25 * h - 5 * age
    return base + 5 if sex == "male" else base - 161 if sex == "female" else base + (5 - 161) / 2


@dataclass
class Profile:
    name: str
    sex: str                      # female | male | average          ("sex used for calculations")
    age: int
    height_cm: float
    weight_kg: float
    activity: str                 # inactive | low_active | active | very_active
    goal: str = "general_health"  # general_health | maintain | lose | gain | build_muscle
    pace: str = "standard"        # gentle | standard | faster
    pattern: str = "omnivore"     # omnivore | eggetarian | vegetarian | vegan | pescatarian
    reference_set: str = "nasem"  # nasem | icmr_nin
    flags: Tuple[str, ...] = ()   # safety answers: pregnant_lactating, ed_history, clinician_diet

    @property
    def bmi(self):
        return self.weight_kg / (self.height_cm / 100) ** 2


def compute(p: Profile) -> dict:
    out = dict(name=p.name, mode="personalised", warnings=[], goal_applied=p.goal, bmi=round(p.bmi, 1))
    # ---- gates (8.1): any reason -> reference_only, no targets
    reasons = []
    if p.age < MIN_AGE:
        reasons.append("under_19")
    reasons += list(p.flags)
    if not (BMI_MIN <= p.bmi <= BMI_MAX):
        reasons.append("bmi_out_of_range")
    if reasons:
        out.update(mode="reference_only", reasons=reasons)
        return out
    basis = p.reference_set
    # ---- goal availability (G6 to G9)
    goal = p.goal
    if goal == "lose":
        if p.bmi < 18.5 or p.bmi < LOSE_MIN_BMI[basis]:
            out["warnings"].append("lose_not_indicated_bmi"); goal = "maintain"
        elif p.age >= 80:
            out["warnings"].append("lose_needs_clinician_80plus"); goal = "maintain"
        elif p.age >= 65 and p.bmi < OBESE_BMI[basis]:
            out["warnings"].append("lose_65plus_needs_obesity"); goal = "maintain"
    if goal == "gain" and p.bmi >= LOSE_MIN_BMI[basis]:
        out["warnings"].append("gain_not_indicated_bmi"); goal = "maintain"
    if p.bmi < 18.5:
        out["warnings"].append("underweight_notice")
    # ---- 4.2 maintenance, its typical range (one standard error) and the cross-check
    tee = eer(p.sex, p.age, p.height_cm, p.weight_kg, p.activity)
    se = sepv(p.sex)
    out.update(tee=round10(tee), range68=(round10(tee - se), round10(tee + se)),
               range95=(round10(tee - 1.96 * se), round10(tee + 1.96 * se)),
               mifflin_x_pal=round10(mifflin_rmr(p.sex, p.age, p.height_cm, p.weight_kg) * PAL_T71[p.activity]))
    # ---- 4.3 goal adjustment
    delta, floor = 0.0, FLOOR[p.sex]
    if goal == "lose":
        share, dmin, dmax = PACE[p.pace]
        deficit = min(max(share * tee, dmin), dmax, DEFICIT_CAP_SHARE * tee, DEFICIT_CAP_KCAL)
        if tee - deficit < floor:
            deficit = tee - floor
            out["warnings"].append("floor_limited_deficit")
        deficit = min(deficit, min(MAX_WEEKLY_LOSS_PCT * p.weight_kg, MAX_WEEKLY_LOSS_KG) * 7700 / 7)
        if deficit < MIN_USEFUL_DEFICIT:
            out["warnings"].append("deficit_too_small"); goal = "maintain"; deficit = 0
        delta = -deficit
    elif goal == "gain":
        share, smin, smax, cap = GAIN
        delta = min(max(share * tee, smin), smax, cap * tee)
    elif goal == "build_muscle":
        share, smin, smax = MUSCLE["lt25" if p.bmi < 25 else "25to30" if p.bmi < 30 else "ge30"]
        delta = min(max(share * tee, smin), smax) if share > 0 else 0
    target = round10(tee + delta)
    if goal == "lose" and target < floor:
        target = floor
    out.update(goal_applied=goal, target=target, delta=round10(delta) if delta else 0)
    E = float(target)
    # ---- 4.4 macronutrients
    wref = p.weight_kg if p.bmi <= BMI_PROTEIN_CAP else BMI_PROTEIN_CAP * (p.height_cm / 100) ** 2
    gkg = max(PROTEIN_GKG[goal], PROTEIN_GKG_OLDER) if p.age >= 65 else PROTEIN_GKG[goal]
    P = min(max(gkg * wref, max(PROTEIN_RDA_GKG * wref, 0.10 * E / 4)), min(PROTEIN_MAX_GKG * wref, 0.35 * E / 4))
    F = FAT_SHARE * E / 9
    C = (E - 4 * P - 9 * F) / 4
    notes = []
    if C < CARB_FLOOR_G:
        C = CARB_FLOOR_G; F = (E - 4 * P - 4 * C) / 9; notes.append("carb_floor")
        if F < FAT_MIN_SHARE * E / 9:
            F = FAT_MIN_SHARE * E / 9; P = (E - 9 * F - 4 * C) / 4; notes.append("fat_floor")
    out.update(wref=round(wref, 1), protein_g=round(P), protein_gkg=round(P / p.weight_kg, 2), fat_g=round(F), carbs_g=round(C),
               fat_pct=round(100 * 9 * F / E), carb_pct=round(100 * 4 * C / E), protein_pct=round(100 * 4 * P / E), macro_notes=notes,
               fibre_g=round(max(FIBRE_G_PER_1000KCAL * E / 1000, FIBRE_FLOOR_G)), sodium_limit_mg=SODIUM_LIMIT_MG,
               potassium_mg=round((POTASSIUM_AI["male"] + POTASSIUM_AI["female"]) / 2 if p.sex == "average" else POTASSIUM_AI[p.sex]))
    # ---- 4.6 vitamins and minerals
    micros = {}
    for nut in ("vitamin_a", "vitamin_c", "vitamin_d", "vitamin_e", "vitamin_k", "calcium", "iron", "magnesium", "zinc"):
        v, typ, ul = micro_ref(nut, p.sex, p.age)
        if nut == "iron" and p.pattern in PLANT_BASED:
            v *= 1.8; out["warnings"].append("iron_x1.8_plant_based")
        micros[nut] = dict(value=round(v, 1), type=typ, ul=ul)
    out["micros"] = micros
    return out


PERSONAS = [
    Profile("Asha", "female", 30, 160, 60, "low_active", "general_health"),
    Profile("Ravi", "male", 30, 175, 75, "low_active", "build_muscle"),
    Profile("Meena", "female", 55, 155, 75, "inactive", "lose"),
    Profile("Vikram", "male", 45, 170, 95, "active", "lose"),
    Profile("Kamala", "female", 72, 150, 52, "low_active", "maintain"),
    Profile("Hari", "male", 68, 168, 70, "active", "general_health", pattern="vegan"),
    Profile("Arjun", "male", 24, 178, 58, "low_active", "gain"),
    Profile("Priya", "female", 28, 165, 58, "active", "build_muscle"),
    Profile("Lata", "female", 60, 150, 70, "inactive", "lose", pace="faster"),
    Profile("Small", "female", 64, 135, 48, "inactive", "lose", pace="faster"),            # the floor binds
    Profile("Sam", "average", 35, 170, 70, "low_active", "maintain"),
    Profile("U19", "female", 17, 160, 55, "low_active", "lose"),                           # gate: under 19
    Profile("Preg", "female", 32, 160, 62, "low_active", "maintain", flags=("pregnant_lactating",)),
    Profile("ED", "female", 35, 165, 58, "low_active", "lose", flags=("ed_history",)),
    Profile("Under", "male", 40, 175, 54, "low_active", "lose"),                           # BMI 17.6: loss not offered
    Profile("Healthy", "female", 30, 165, 60, "low_active", "lose"),                       # BMI 22.0: loss not indicated
]

if __name__ == "__main__":
    # NASEM's two published worked examples (chapter 7): 2,275 and 3,041 kcal
    print(round(eer("female", 22, 165, 63, "low_active")), round(eer("male", 45, 175, 100, "low_active")))
    for pr in PERSONAS:
        r = compute(pr)
        print(pr.name, r["mode"], r.get("reasons", ""), r.get("tee", ""), r.get("target", ""), r.get("protein_g", ""), r.get("fibre_g", ""))
```

## Appendix F. Reference implementation of the weekly report

The executable specification of sections 5 and 7: day states, coverage, assessment by target kind, the Nutrient mix score with its minimum semantics, the low-intake rule and the leave-one-day-out range. Same status as Appendix E. Run it with `python3 report_ref.py`; it prints the ordinary week (90.0), the same week with sodium at 4,000 mg (77.9), the empty week (withheld, few days) and the crash-diet week (withheld, incomplete days). It agrees with the prototype used for 5.9 on 6,000 random weeks (score, withholding reason, range and every assessment), and the property tests of 11.5 were run against this code and that prototype with identical results: blanking values never raised the score in 1,594 scored weeks, scaling every quantity never changed it in 1,500 trials, and more sodium or less of a minimum nutrient never raised it in 1,500 trials.

```python
"""
Reference implementation of the weekly report (WEEKLY_BREAKDOWN_PLAN.md sections 5 and 7): day states, coverage,
assessment by target kind, the Nutrient mix score, and the low-intake rule. Python 3.9+, standard library only.
NOT production code: an executable specification that the TypeScript report engine is tested against (11.5).
Every tunable number lives in CONFIG so the plan and the code cannot drift apart. Quantities: kcal per item, nutrient
amounts per item; a nutrient that is missing (absent or None) is UNKNOWN, never zero (7.1).
"""
from dataclasses import dataclass, field
from statistics import mean
from typing import Optional

CONFIG = dict(
    # --- day states (7.2) [A]
    min_valid_kcal_floor=500,            # a day under this is `partial` however small the target
    min_valid_share_of_target=0.6,       # ... or under this share of the person's own energy target
    max_pending_item_share=1 / 3,        # more pending items than this -> partial
    # --- how sure we are (7.6) [A]
    min_days_for_summary=3,
    # --- coverage (7.3) [A]
    coverage_complete=0.9, coverage_partial=0.5, coverage_for_score=0.8,
    # --- assessment bands (5.4) [A]
    meets_ratio=0.90, close_ratio=0.75, energy_band=0.10,
    # --- score (5.5): points per component [A]; standards [R] HEI-2020 for sodium
    points=dict(protein=10, fiber=10, potassium=5, mineral_each=5, sodium=10),
    score_minerals=["calcium", "iron", "magnesium", "zinc"],
    sodium_density_full=1100, sodium_density_zero=2000,       # mg per 1,000 kcal
    max_unknown_share=0.25,                                    # unknown components worth more than this -> withhold
    low_intake_days_to_withhold=3,
)


@dataclass
class Item:
    kcal: Optional[float]                              # None for a pending item (unknown food or unit)
    nutrients: dict = field(default_factory=dict)      # nutrient -> amount; absent or None = unknown
    pending: bool = False


@dataclass
class Day:
    date: str
    items: list = field(default_factory=list)
    mark: Optional[str] = None                         # 'complete' | 'partial' | 'skip' | None
    in_progress: bool = False
    future: bool = False


@dataclass
class Targets:
    energy: float                                      # kcal per day (2,000 in generic mode)
    minimums: dict                                     # nutrient -> per-day reference (protein, fiber, potassium, minerals ...)
    limits: dict                                       # nutrient -> per-day limit (sodium)
    low_intake_floor: float = 1200                     # sex-specific floor of 4.3 (1,200 when sex is unknown)
    personal: bool = True                              # False in generic mode: only the 500 kcal floor applies to day validity


def classify_day(d: Day, t: Targets) -> str:
    c = CONFIG
    if d.future: return "future"
    if d.mark == "skip": return "skipped"
    if d.in_progress and d.mark != "complete": return "in_progress"
    if d.mark == "complete": return "confirmed"
    if d.mark == "partial": return "partial_marked"
    if not d.items: return "empty"
    pending_share = sum(1 for i in d.items if i.pending) / len(d.items)
    floor = max(c["min_valid_kcal_floor"], c["min_valid_share_of_target"] * t.energy) if t.personal else c["min_valid_kcal_floor"]
    kcal = sum(i.kcal for i in d.items if not i.pending and i.kcal is not None)
    if pending_share > c["max_pending_item_share"]: return "partial_pending"
    if kcal < floor: return "partial_low"
    return "valid"


def assessed(states): return [i for i, s in enumerate(states) if s in ("valid", "confirmed")]


def totals(day: Day, n: str):
    """(known amount, energy of items that have a value, energy of all resolved items) for nutrient n on one day."""
    known = w_known = w_all = 0.0
    for i in day.items:
        if i.pending or i.kcal is None: continue
        w_all += i.kcal
        v = i.kcal if n == "calories" else i.nutrients.get(n)
        if v is not None:
            known += v; w_known += i.kcal
    return known, w_known, w_all


def energy_coverage(days, idx, n):
    w_known = sum(totals(days[i], n)[1] for i in idx); w_all = sum(totals(days[i], n)[2] for i in idx)
    return w_known / w_all if w_all > 0 else 0.0


def item_coverage(days, idx, n):
    items = [i for k in idx for i in days[k].items if not i.pending and i.kcal is not None]
    return sum(1 for i in items if i.nutrients.get(n) is not None) / len(items) if items else 0.0


def confidence(states, pending, total_items, weekend_assessed):
    n = len(assessed(states)); share = pending / total_items if total_items else 0
    if n < CONFIG["min_days_for_summary"]: return "insufficient"
    if n >= 6 and share <= 0.10 and weekend_assessed >= 1: return "good"
    return "fair" if n >= 4 else "rough"


def lin(x, full, zero):
    """1 at or below `full`, 0 at or above `zero`, linear between (limit nutrients)."""
    return 1.0 if x <= full else 0.0 if x >= zero else (zero - x) / (zero - full)


def score(days, states, t: Targets, idx=None):
    """Nutrient mix (5.5). Densities per 1,000 kcal pooled over the assessed days. A component whose data is not good
    enough is UNKNOWN: it earns 0 and stays in the denominator, so the value is a minimum and cannot rise because data is
    missing. Returns (value or None, components)."""
    c = CONFIG
    idx = assessed(states) if idx is None else idx
    kcal = sum(totals(days[i], "calories")[0] for i in idx)
    if not idx or kcal <= 0: return None, []
    dens = lambda n: sum(totals(days[i], n)[0] for i in idx) / kcal * 1000
    target_dens = lambda ref: ref / (t.energy / 1000)
    comps = []

    def adequacy(name, pts, n):
        cov = energy_coverage(days, idx, n)
        ratio = min(1.0, dens(n) / (c["meets_ratio"] * target_dens(t.minimums[n])))     # known amounts: a valid minimum
        ok = cov >= c["coverage_for_score"]
        comps.append(dict(name=name, max=pts, earned=pts * ratio if ok else 0.0, coverage=cov, scored=ok))

    for n in ("protein", "fiber", "potassium"): adequacy(n, c["points"][n], n)
    for m in c["score_minerals"]: adequacy(m, c["points"]["mineral_each"], m)
    cov = min(energy_coverage(days, idx, "sodium"), item_coverage(days, idx, "sodium"))
    ratio = lin(dens("sodium"), c["sodium_density_full"], c["sodium_density_zero"])
    ok = cov >= 1.0 or ratio == 0.0          # a partial total can prove "over" (zero points), never "within the limit"
    pts = c["points"]["sodium"]
    comps.append(dict(name="sodium", max=pts, earned=pts * ratio if ok else 0.0, coverage=cov, scored=ok))
    max_all = sum(x["max"] for x in comps)
    unknown = sum(x["max"] for x in comps if not x["scored"])
    if unknown / max_all > c["max_unknown_share"]: return None, comps
    return round(100 * sum(x["earned"] for x in comps) / max_all, 1), comps


def jackknife(days, states, t):
    idx = assessed(states)
    if score(days, states, t)[0] is None or len(idx) < 4: return None
    vals = [v for v in (score(days, states, t, [i for i in idx if i != d])[0] for d in idx) if v is not None]
    return (min(vals), max(vals)) if vals else None


def assess(n, days, states, t: Targets):
    """meets / close / below / over_limit / unknown for one nutrient (5.4, 7.3)."""
    c = CONFIG; idx = assessed(states)
    if not idx: return dict(assessment="unknown", mean=None, coverage=0.0)
    cov = energy_coverage(days, idx, n)
    if n in t.limits: cov = min(cov, item_coverage(days, idx, n))      # pickles and papad: few kcal, much sodium
    mean_day = sum(totals(days[i], n)[0] for i in idx) / len(idx)
    complete = cov >= c["coverage_complete"]
    if n in t.limits:
        if mean_day > t.limits[n]: return dict(assessment="over_limit", mean=mean_day, coverage=cov, lower_bound=not complete)
        if cov < c["coverage_partial"] or not complete: return dict(assessment="unknown", mean=None if cov < c["coverage_partial"] else mean_day, coverage=cov)
        return dict(assessment="meets", mean=mean_day, coverage=cov, lower_bound=False)
    ratio = mean_day / t.minimums[n]
    if ratio >= c["meets_ratio"]: return dict(assessment="meets", mean=mean_day, coverage=cov, lower_bound=not complete)
    if not complete: return dict(assessment="unknown", mean=mean_day, coverage=cov, lower_bound=True)   # a lower bound cannot show "below"
    return dict(assessment="close" if ratio >= c["close_ratio"] else "below", mean=mean_day, coverage=cov, lower_bound=False)


def energy(days, states, t: Targets):
    idx = assessed(states)
    nonempty = [i for i, s in enumerate(states) if s in ("valid", "confirmed") or s.startswith("partial")]
    low_days = sum(1 for i in nonempty if totals(days[i], "calories")[0] < t.low_intake_floor)
    kc = [totals(days[i], "calories")[0] for i in idx]
    in_band = sum(1 for k in kc if abs(k - t.energy) <= CONFIG["energy_band"] * t.energy)
    return dict(mean=mean(kc) if kc else None, in_band=in_band, assessed=len(idx), low_days=low_days)


def report(days, t: Targets):
    states = [classify_day(d, t) for d in days]
    pending = sum(1 for d in days for i in d.items if i.pending); total = sum(len(d.items) for d in days)
    weekend = sum(1 for k in (5, 6) if k < len(states) and states[k] in ("valid", "confirmed"))
    out = dict(states=states, confidence=confidence(states, pending, total, weekend), assessed_days=len(assessed(states)), energy=energy(days, states, t))
    if out["confidence"] == "insufficient":
        n_pend = sum(1 for s in states if s == "partial_pending"); n_low = sum(1 for s in states if s in ("partial_low", "partial_marked"))
        out.update(score=None, withheld="unknown_foods" if n_pend >= 2 else "incomplete_days" if n_low >= 2 else "few_days", nutrients={})
        return out
    out["nutrients"] = {n: assess(n, days, states, t) for n in list(t.minimums) + list(t.limits)}
    s, comps = score(days, states, t)
    if out["energy"]["low_days"] >= CONFIG["low_intake_days_to_withhold"]:
        s, out["withheld"] = None, "low_intake"          # no nutrition score beside a very low intake
    else:
        out["withheld"] = None if s is not None else "thin_data"
    out.update(score=s, components=comps, is_minimum=any(not x["scored"] for x in comps), range=jackknife(days, states, t))
    return out


if __name__ == "__main__":
    def meal(kcal, p, c, f, fib, sug, na, ca, fe, k, mg, zn):
        return Item(kcal, dict(protein=p, carbs=c, fat=f, fiber=fib, sugar=sug, sodium=na, calcium=ca, iron=fe, potassium=k, magnesium=mg, zinc=zn))
    def usual(date, sodium=None):
        its = [meal(300, 10, 55, 3, 4, 4, 500, 60, 2.5, 400, 50, 1.2), meal(650, 24, 95, 16, 12, 12, 900, 250, 5, 1100, 130, 3.5),
               meal(150, 3, 22, 5, 0.5, 12, 120, 90, 0.4, 150, 12, 0.4), meal(700, 22, 115, 15, 10, 8, 1000, 120, 4, 1100, 120, 3)]
        if sodium is not None:
            for i in its: i.nutrients["sodium"] = sodium / 4
        return Day(date, its)
    asha = Targets(2150, dict(protein=60, fiber=30, potassium=2600, calcium=1000, iron=18, magnesium=310, zinc=8), dict(sodium=2300))
    dates = [f"2026-10-{5 + i:02d}" for i in range(7)]
    r = report([usual(d) for d in dates], asha)
    print("ordinary week:", r["score"], r["confidence"], r["withheld"])                                # 90.0 good None
    print("sodium 4,000 mg:", report([usual(d, 4000) for d in dates], asha)["score"])               # 78.0
    print("nothing logged:", report([Day(d) for d in dates], asha)["withheld"])                       # few_days
    crash = []
    for d in dates:
        day = usual(d)
        for i in day.items: i.kcal /= 1.8; i.nutrients = {k: v / 1.8 for k, v in i.nutrients.items()}
        crash.append(day)
    print("crash diet:", report(crash, asha)["withheld"])                                              # incomplete_days
```
