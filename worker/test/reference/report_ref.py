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
