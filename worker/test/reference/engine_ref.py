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

# ---- the Indian reference set (Phase 6, decision Q2): ICMR-NIN "Nutrient Requirements for Indians" 2020, summary tables [R].
# Read from page images of the short report (the plan's secondary copy): EAR p.12, RDA p.13, the elderly p.15, tolerable upper limits p.17,
# vitamin E and K in the text of p.10. Adults are not age-banded: two bands, 19-59 and 60 and over.
# (allowance or Adequate Intake, Estimated Average Requirement or None, "RDA"|"AI", Upper Limit or None).
# Vitamin A is in ug RE (carotenoids at 6:1); vitamin D in ug (600 IU = 15, 800 IU = 20; 40 IU = 1 ug).
ICMR_BANDS = ("19-59", "60+")
ICMR = {
    ("vitamin_a", "F"): [(840, 390, "RDA", 3000), (840, 390, "RDA", 3000)],
    ("vitamin_a", "M"): [(1000, 460, "RDA", 3000), (1000, 460, "RDA", 3000)],
    ("vitamin_c", "F"): [(65, 55, "RDA", 2000), (65, 55, "RDA", 2000)],
    ("vitamin_c", "M"): [(80, 65, "RDA", 2000), (80, 65, "RDA", 2000)],
    ("vitamin_d", "F"): [(15, 10, "RDA", 100), (20, 10, "RDA", 100)],
    ("vitamin_d", "M"): [(15, 10, "RDA", 100), (20, 10, "RDA", 100)],
    ("vitamin_e", "F"): [(10, None, "AI", None), (10, None, "AI", None)],      # the text: 7.5 to 10 mg; 10 mg used [A]
    ("vitamin_e", "M"): [(10, None, "AI", None), (10, None, "AI", None)],
    ("vitamin_k", "F"): [(55, None, "AI", None), (55, None, "AI", None)],      # the text: 55 ug for adults
    ("vitamin_k", "M"): [(55, None, "AI", None), (55, None, "AI", None)],
    ("calcium", "F"): [(1000, 800, "RDA", 2500), (1200, 1000, "RDA", 2500)],
    ("calcium", "M"): [(1000, 800, "RDA", 2500), (1200, 1000, "RDA", 2500)],
    ("iron", "F"): [(29, 15, "RDA", 45), (19, 11, "RDA", 45)],
    ("iron", "M"): [(19, 11, "RDA", 45), (19, 11, "RDA", 45)],
    ("magnesium", "F"): [(370, 310, "RDA", 350), (370, 310, "RDA", 350)],
    ("magnesium", "M"): [(440, 370, "RDA", 350), (440, 370, "RDA", 350)],
    ("zinc", "F"): [(13.2, 11.0, "RDA", 40), (13.2, 11.0, "RDA", 40)],
    ("zinc", "M"): [(17, 14.1, "RDA", 40), (17, 14.0, "RDA", 40)],
}
ICMR_EAR_TARGETS = ("iron", "zinc")                       # judged against the EAR on this set (plan 4.10); B12 is not in this module's list
ICMR_PROTEIN_RDA_GKG = 0.83                              # 54 g for 65 kg, 46 g for 55 kg
ICMR_FIBRE_G_PER_1000KCAL = 15.0                         # about 15 g per 1,000 kcal: ICMR's own table gives 14.1 to 15.1 [A]
ICMR_SODIUM_LIMIT_MG, ICMR_POTASSIUM_MG = 2000, 3500     # safe sodium intake (5 g of salt); potassium, from the WHO [R]


def age_band(age: int) -> int:
    return 0 if age <= 30 else 1 if age <= 50 else 2 if age <= 70 else 3


def micro_ref(nutrient: str, sex: str, age: int):
    """(reference value, type, upper level). 'average' is the mean of the female and male values."""
    b = age_band(age)
    f, m = DRI[(nutrient, "F")][b], DRI[(nutrient, "M")][b]
    if sex == "average":
        return (f[0] + m[0]) / 2, f[1], f[2]
    return DRI[(nutrient, "F" if sex == "female" else "M")][b]


def icmr_band(age: int) -> int:
    return 1 if age >= 60 else 0


def icmr_ref(nutrient: str, sex: str, age: int):
    """(target value, type, upper level) on the Indian set: the EAR for iron and zinc, the allowance otherwise.
    'average' is the mean of the female and male values."""
    b = icmr_band(age)
    f, m = ICMR[(nutrient, "F")][b], ICMR[(nutrient, "M")][b]
    use_ear = nutrient in ICMR_EAR_TARGETS
    def pick(row):
        return row[1] if use_ear else row[0]
    typ = "EAR" if use_ear else f[2]
    if sex == "average":
        return (pick(f) + pick(m)) / 2, typ, f[3]
    row = f if sex == "female" else m
    return pick(row), typ, row[3]


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
    indian = basis == "icmr_nin"
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
    rda_gkg = ICMR_PROTEIN_RDA_GKG if indian else PROTEIN_RDA_GKG
    P = min(max(gkg * wref, max(rda_gkg * wref, 0.10 * E / 4)), min(PROTEIN_MAX_GKG * wref, 0.35 * E / 4))
    F = FAT_SHARE * E / 9
    C = (E - 4 * P - 9 * F) / 4
    notes = []
    if C < CARB_FLOOR_G:
        C = CARB_FLOOR_G; F = (E - 4 * P - 4 * C) / 9; notes.append("carb_floor")
        if F < FAT_MIN_SHARE * E / 9:
            F = FAT_MIN_SHARE * E / 9; P = (E - 9 * F - 4 * C) / 4; notes.append("fat_floor")
    out.update(wref=round(wref, 1), protein_g=round(P), protein_gkg=round(P / p.weight_kg, 2), fat_g=round(F), carbs_g=round(C),
               fat_pct=round(100 * 9 * F / E), carb_pct=round(100 * 4 * C / E), protein_pct=round(100 * 4 * P / E), macro_notes=notes,
               fibre_g=round(max((ICMR_FIBRE_G_PER_1000KCAL if indian else FIBRE_G_PER_1000KCAL) * E / 1000, FIBRE_FLOOR_G)),
               sodium_limit_mg=ICMR_SODIUM_LIMIT_MG if indian else SODIUM_LIMIT_MG,
               potassium_mg=ICMR_POTASSIUM_MG if indian else round((POTASSIUM_AI["male"] + POTASSIUM_AI["female"]) / 2 if p.sex == "average" else POTASSIUM_AI[p.sex]))
    # ---- 4.6 vitamins and minerals
    micros = {}
    for nut in ("vitamin_a", "vitamin_c", "vitamin_d", "vitamin_e", "vitamin_k", "calcium", "iron", "magnesium", "zinc"):
        v, typ, ul = icmr_ref(nut, p.sex, p.age) if indian else micro_ref(nut, p.sex, p.age)
        # The 1.8 times iron is a National Academies rule; ICMR's iron already assumes about 8% absorption.
        if nut == "iron" and p.pattern in PLANT_BASED and not indian:
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

# The Indian reference set's personas (Phase 6): a vegetarian woman, a man, a woman and a man on the elderly table, the average,
# the BMI-23 loss gate, and the 27.5 gate for a loss goal at 65 or over.
ICMR_PERSONAS = [
    Profile("Lakshmi", "female", 30, 158, 52, "low_active", "general_health", pattern="vegetarian", reference_set="icmr_nin"),
    Profile("Raj", "male", 45, 172, 78, "active", "maintain", reference_set="icmr_nin"),
    Profile("Savitri", "female", 63, 150, 58, "inactive", "maintain", pattern="vegetarian", reference_set="icmr_nin"),
    Profile("Mohan", "male", 62, 165, 64, "low_active", "general_health", reference_set="icmr_nin"),
    Profile("Sam-IN", "average", 40, 168, 66, "low_active", "maintain", reference_set="icmr_nin"),
    Profile("Meera", "female", 34, 150, 55, "low_active", "lose", reference_set="icmr_nin"),               # BMI 24.4: loss offered at 23, not at 25
    Profile("Gopal", "male", 66, 160, 74, "inactive", "lose", reference_set="icmr_nin"),                   # BMI 28.9: over 27.5, so loss at 65+ is offered
    Profile("Gopal-US", "male", 66, 160, 74, "inactive", "lose", reference_set="nasem"),                   # the same man on the US set: BMI under 30
]

if __name__ == "__main__":
    # NASEM's two published worked examples (chapter 7): 2,275 and 3,041 kcal
    print(round(eer("female", 22, 165, 63, "low_active")), round(eer("male", 45, 175, 100, "low_active")))
    for pr in PERSONAS:
        r = compute(pr)
        print(pr.name, r["mode"], r.get("reasons", ""), r.get("tee", ""), r.get("target", ""), r.get("protein_g", ""), r.get("fibre_g", ""))
