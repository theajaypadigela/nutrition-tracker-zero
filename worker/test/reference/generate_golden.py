"""
Runs the two reference implementations (engine_ref.py, report_ref.py: Appendices E and F of
WEEKLY_BREAKDOWN_PLAN.md) and writes the golden vectors the TypeScript engine is tested against.

    python3 -I test/reference/generate_golden.py test/fixtures/golden

Python's round() sends exact halves to the even neighbour; the Worker's Math.round sends them up. The generator
replaces round() with round-half-up so the two agree on random inputs. The sixteen personas of the plan do not
sit on a half, so their numbers are the plan's.
"""
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine_ref as E  # noqa: E402
import report_ref as R  # noqa: E402


def js_round(x, nd=None):
    if nd is None:
        return int(math.floor(x + 0.5))
    f = 10 ** nd
    return math.floor(x * f + 0.5) / f


E.round = js_round
R.round = js_round

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "fixtures", "golden")
os.makedirs(OUT, exist_ok=True)


def dump(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"), sort_keys=True)
    print(f"{name}: {os.path.getsize(path):,} bytes")


def clean(x, nd=9):
    """JSON-safe: tuples to lists, floats rounded so the file is compact and stable."""
    if isinstance(x, float):
        return round(x, nd) if math.isfinite(x) else None
    if isinstance(x, (list, tuple)):
        return [clean(v, nd) for v in x]
    if isinstance(x, dict):
        return {k: clean(v, nd) for k, v in x.items()}
    return x


def profile_json(p):
    return dict(name=p.name, sex=p.sex, age=p.age, height=p.height_cm, weight=p.weight_kg, activity=p.activity,
                goal=p.goal, pace=p.pace, pattern=p.pattern, referenceSet=p.reference_set, flags=list(p.flags))


# ---- 1. the sixteen personas of plan 4.8 and NASEM's two published examples (11.1 vectors 1 and 2)
personas = [dict(input=profile_json(p), expected=clean(E.compute(p))) for p in E.PERSONAS]
nasem_examples = dict(
    woman_22_165_63_low_active=E.round(E.eer("female", 22, 165, 63, "low_active")),
    man_45_175_100_low_active=E.round(E.eer("male", 45, 175, 100, "low_active")),
)
dump("personas.json", dict(personas=personas, nasemExamples=nasem_examples))

# ---- 2. the age-band edges of every reference table, both sexes and the average (11.1 vector 3)
bands = []
for nut in sorted({k[0] for k in E.DRI}):
    for sex in ("female", "male", "average"):
        for age in (19, 30, 31, 50, 51, 70, 71, 100):
            v, t, ul = E.micro_ref(nut, sex, age)
            bands.append(dict(nutrient=nut, sex=sex, age=age, value=clean(v), type=t, ul=ul))
dump("bands.json", bands)

# ---- 3. weight projections of plan 4.9 (11.1 vector 4): an independent implementation of the formula
def project(deficit, days):
    approach = 1 - math.exp(-days / 500)
    return deficit / 24 * approach, deficit / 20 * approach


projection = []
for name, deficit in (("Meena", 290), ("Vikram", 470)):
    for label, days in (("12 weeks", 84), ("6 months", 182), ("12 months", 365)):
        lo, hi = project(deficit, days)
        projection.append(dict(persona=name, deficit=deficit, label=label, days=days,
                               lowKg=js_round(lo, 1), highKg=js_round(hi, 1), staticKg=js_round(deficit * days / 7700, 1)))
dump("projection.json", projection)

# ---- 3b. the Indian reference set (Phase 6): personas, and the band edges of its tables (18 | 19, 59 | 60)
icmr_personas = [dict(input=profile_json(p), expected=clean(E.compute(p))) for p in E.ICMR_PERSONAS]
dump("personas-icmr.json", icmr_personas)
icmr_bands = []
for nut in sorted({k[0] for k in E.ICMR}):
    for sex in ("female", "male", "average"):
        for age in (19, 59, 60, 100):
            v, t, ul = E.icmr_ref(nut, sex, age)
            icmr_bands.append(dict(nutrient=nut, sex=sex, age=age, value=clean(v), type=t, ul=ul))
dump("icmr-bands.json", icmr_bands)

MICRO_ORDER = ("vitamin_a", "vitamin_c", "vitamin_d", "vitamin_e", "vitamin_k", "calcium", "iron", "magnesium", "zinc")

# ---- 4. random profiles: the targets engine agrees with the reference on inputs nobody picked (11.1)
rng = random.Random(20261012)
random_targets = []
for i in range(400):
    flags = tuple(f for f, p in (("pregnant_lactating", 0.03), ("ed_history", 0.03), ("clinician_diet", 0.03)) if rng.random() < p)
    p = E.Profile(f"R{i}", rng.choice(("female", "male", "average")), rng.randint(15, 100), rng.randint(120, 230),
                  rng.randint(25, 200), rng.choice(E.PAL_ORDER), rng.choice(("general_health", "maintain", "lose", "gain", "build_muscle")),
                  rng.choice(("gentle", "standard", "faster")), rng.choice(("omnivore", "eggetarian", "vegetarian", "vegan", "pescatarian")),
                  rng.choice(("nasem", "icmr_nin")), flags)
    r = E.compute(p)
    keep = {k: r[k] for k in ("mode", "goal_applied", "tee", "range68", "target", "delta", "protein_g", "fat_g", "carbs_g", "fibre_g", "sodium_limit_mg", "potassium_mg", "mifflin_x_pal", "warnings") if k in r}
    if "micros" in r:
        keep["micros"] = [r["micros"][k]["value"] for k in MICRO_ORDER]
    random_targets.append(dict(input=profile_json(p), expected=clean(keep)))
dump("random-targets.json", random_targets)


# ---- 5. weekly report scenarios (plan 5.9) and random weeks (11.5)
def item_json(i):
    return dict(kcal=i.kcal, pending=i.pending, nutrients=clean(i.nutrients, 6))


def day_json(d):
    return dict(date=d.date, mark=d.mark, items=[item_json(i) for i in d.items])


def targets_json(t):
    return dict(energy=t.energy, minimums=t.minimums, limits=t.limits, floor=t.low_intake_floor, personal=t.personal)


def report_json(r):
    out = dict(states=r["states"], confidence=r["confidence"], assessedDays=r["assessed_days"], score=r["score"],
               withheld=r.get("withheld"), energy=clean(r["energy"]))
    if "nutrients" in r:
        out["nutrients"] = clean(r["nutrients"])
    if "components" in r:
        out["components"] = clean(r["components"])
        out["isMinimum"] = r["is_minimum"]
        out["range"] = clean(r["range"])
    return out


def meal(kcal, p, c, f, fib, sug, na, ca, fe, k, mg, zn):
    return R.Item(kcal, dict(protein=p, carbs=c, fat=f, fiber=fib, sugar=sug, sodium=na, calcium=ca, iron=fe, potassium=k, magnesium=mg, zinc=zn))


def usual(date, sodium=None):
    its = [meal(300, 10, 55, 3, 4, 4, 500, 60, 2.5, 400, 50, 1.2), meal(650, 24, 95, 16, 12, 12, 900, 250, 5, 1100, 130, 3.5),
           meal(150, 3, 22, 5, 0.5, 12, 120, 90, 0.4, 150, 12, 0.4), meal(700, 22, 115, 15, 10, 8, 1000, 120, 4, 1100, 120, 3)]
    if sodium is not None:
        for it in its:
            it.nutrients["sodium"] = sodium / 4
    return R.Day(date, its)


asha = R.Targets(2150, dict(protein=60, fiber=30, potassium=2600, calcium=1000, iron=18, magnesium=310, zinc=8), dict(sodium=2300))
dates = [f"2026-10-{5 + i:02d}" for i in range(7)]
scenarios = []


def scenario(name, days, targets=asha, today="2026-10-12"):
    # `today` is passed through: the reference marks a day in_progress/future with flags, so apply them here.
    for d in days:
        d.future = d.date > today
        d.in_progress = d.date == today
    scenarios.append(dict(name=name, today=today, targets=targets_json(targets), days=[day_json(d) for d in days],
                          expected=report_json(R.report(days, targets))))


scenario("ordinary week", [usual(d) for d in dates])
scenario("sodium 4,000 mg a day", [usual(d, 4000) for d in dates])
scenario("nothing logged", [R.Day(d) for d in dates])
crash = []
for d in dates:
    day = usual(d)
    for it in day.items:
        it.kcal /= 1.8
        it.nutrients = {k: v / 1.8 for k, v in it.nutrients.items()}
    crash.append(day)
scenario("crash diet", crash)
scenario("four days logged, three not", [usual(d) if i < 4 else R.Day(d) for i, d in enumerate(dates)])
scenario("Wednesday morning, two days logged", [usual(d) if i < 2 else R.Day(d) for i, d in enumerate(dates)], today="2026-10-07")
varied = []
vr = random.Random(5)
for i, d in enumerate(dates):
    day = usual(d)
    scale = [0.85, 1.05, 1.0, 0.9, 1.35, 1.25, 1.15][i]
    for it in day.items:
        it.kcal = round(it.kcal * scale, 1)
        it.nutrients = {k: round(v * scale * vr.uniform(0.9, 1.1), 2) for k, v in it.nutrients.items()}
    varied.append(day)
scenario("a varied week", varied)
sodium_missing = [usual(d) for d in dates]
for day in sodium_missing:
    day.items[1].nutrients.pop("sodium")
scenario("sodium missing on one food a day", sodium_missing)
mineral_blank = [usual(d) for d in dates]
for day in mineral_blank:
    for it in day.items[:2]:
        for k in ("calcium", "iron", "magnesium", "zinc"):
            it.nutrients.pop(k)
scenario("minerals missing on half the foods", mineral_blank)
pending = [usual(d) for d in dates]
for day in pending[:5]:
    for it in day.items[:2]:
        it.pending, it.kcal, it.nutrients = True, None, {}
scenario("40% of items pending", pending)
dump("report-scenarios.json", scenarios)

NUTS = ("protein", "fiber", "potassium", "calcium", "iron", "magnesium", "zinc", "sodium")


def compact_day(d):
    # [date, mark, [[kcal|null, pending 0/1, protein, fiber, potassium, calcium, iron, magnesium, zinc, sodium], ...]]; null = unknown
    return [d.date, d.mark, [[i.kcal, 1 if i.pending else 0] + [i.nutrients.get(n) for n in NUTS] for i in d.items]]


def compact_report(r):
    out = dict(states=r["states"], confidence=r["confidence"], assessedDays=r["assessed_days"], score=r["score"], withheld=r.get("withheld"),
               energy=clean(r["energy"], 6))
    if "nutrients" in r:
        out["nutrients"] = {n: [v["assessment"], clean(v["mean"], 6), clean(v["coverage"], 6), v.get("lower_bound")] for n, v in r["nutrients"].items()}
    if "components" in r:
        out["components"] = [[c["name"], clean(c["earned"], 6), clean(c["coverage"], 6), c["scored"]] for c in r["components"]]
        out["isMinimum"] = r["is_minimum"]
        out["range"] = clean(r["range"], 6)
    return out


rr = random.Random(20261012)
weeks = []
for w in range(100):
    energy = rr.choice((1500, 1800, 2000, 2150, 2400, 2800, 3000))
    t = R.Targets(energy, dict(protein=rr.randint(40, 140), fiber=rr.randint(20, 40), potassium=rr.choice((2600, 3000, 3400)), calcium=rr.choice((1000, 1200)),
                               iron=rr.choice((8, 14.4, 18)), magnesium=rr.choice((310, 320, 400, 420)), zinc=rr.choice((8, 11))),
                  dict(sodium=rr.choice((2000, 2300))), low_intake_floor=rr.choice((1200, 1350, 1500)), personal=True)
    blank = rr.choice((0.0, 0.0, 0.1, 0.4))
    today = f"2026-10-{5 + rr.randint(2, 9):02d}"
    days = []
    for i, date in enumerate(dates):
        d = R.Day(date)
        d.future, d.in_progress = date > today, date == today
        r = rr.random()
        d.mark = "complete" if r < 0.08 else "partial" if r < 0.13 else "skip" if r < 0.17 else None
        for _ in range(rr.choice((0, 1, 2, 3, 3, 4, 4, 5, 6))):
            kcal = round(rr.uniform(40, 900), 1)
            if rr.random() < 0.05:
                d.items.append(R.Item(None, {}, pending=True))
                continue
            nut = {}
            for n, (lo, hi) in dict(protein=(0.005, 0.08), fiber=(0.0, 0.03), potassium=(0.2, 2.0), calcium=(0.1, 1.0), iron=(0.002, 0.02),
                                    magnesium=(0.05, 0.4), zinc=(0.002, 0.012), sodium=(0.1, 3.0)).items():
                if rr.random() >= blank:
                    nut[n] = round(kcal * rr.uniform(lo, hi), 2)
            d.items.append(R.Item(kcal, nut))
        days.append(d)
    weeks.append(dict(today=today, targets=targets_json(t), days=[compact_day(d) for d in days], expected=compact_report(R.report(days, t))))
dump("report-random.json", weeks)
