# GivingGauge

Donation and sponsorship review for P&M Apparel. Requests come in, get scored
against Apparelytics data and the donation policy, and land in a queue with a
recommendation. Owners decide; overrides are recorded as overrides.

## Run it

Any static server. The app is plain HTML/CSS/JS with no build step.

```
cd givinggauge
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

| File | What it does |
|---|---|
| `scoring-engine.js` | The model, as code. Disqualifiers, seven dimensions, ask modifier, grade. No prose, no LLM. |
| `gauge.js` | Renders the dial. Score, grade, needle, graduated ticks. |
| `requests.js` | The queue. Form fields paired with Apparelytics facts. |
| `app.js` | Queue, filters, detail panel, decision log. |
| `index.html` | Shell and styles. |
| `engine.test.js` | 60 assertions across 10 cases, including the three real ones. |
| `gauge.geometry.test.js` | Asserts nothing draws outside the viewBox at any score or size. |

## Why the engine is separate

The scoring model used to live in the prompt, which meant it was re-derived by
reasoning on every request. Same request, different day, different number. It is
now arithmetic: `evaluate(request, account)` returns the same result every time.

What still needs a model: parsing the form into `request`, resolving fuzzy org
names against Apparelytics into `account`, and writing the analysis and emails.
Those are judgment. The scoring is not.

## The gauge

240° arc, 0 left, 100 right. Ticks every 5, heavier every 20, full-height rules
at the grade boundaries (40 / 55 / 70 / 85) so you can see how far a request sits
from the next band.

Colour states the verdict and is never decorative:

- **Green** — A or B. Approve.
- **Gold** (`#d5a029`, from the mark) — C or D.
- **Red** — F, including every automatic decline.

The readout sits below the dial rather than inside it. A needle long enough to
point sweeps the centre, so text there gets crossed at mid-range scores.

## Overrides

The engine recommends. Ryan decides. When a decision goes against the
recommendation the app records it as an override and keeps the engine's original
call visible next to it — the disagreement is the useful part of the record.

Every seeded request can be reopened, which clears the decision and returns it
to the queue.

## Wiring up for real

Currently `requests.js` is inline data. In production:

1. **Intake** — Jotform webhook writes a request row. Include all fields in the
   payload body; a link-only stub means re-keying.
2. **Enrichment** — on intake, call `find_customers`, then `get_customer_summary`
   (unbounded, then again with `from: "2026-01-01"` for YTD) and
   `customer_reorder_cadence` (`customer_ids` as a list, `min_orders: 2`).
   Populate the `account` block. Multi-pass retry on org name: drop suffixes,
   then contact last name, then email domain.
3. **Score** — `GivingGauge.evaluate()`. Store the result with the request so the
   score is a record, not something recomputed later against changed data.
4. **Review** — this app.
5. **Outbound** — approval email to the requester with the account manager cc'd,
   single thread. Denial emails constraint-specific, never generic.

## Open question

A non-customer tops out at 45 points: mission 18 + region 10 + exposure 12 +
attach 5. Every ask modifier comes off that. So a strong local cause from an org
that has never bought anything cannot clear a C, and usually lands at F.

Polk County Pickleball scored 29 here against 54 by hand — the gap is two blank
legacy-form fields plus relationship credit the engine won't give a
non-customer. It was approved anyway, which is the system working as intended:
the engine gave a clean read and a human overrode it.

But if good local causes routinely need an override to get through, the ceiling
is wrong, not the overrides. Worth watching over the next several requests
before retuning §6A.

Note that `GRADE_TICKS` in `gauge.js` duplicates the thresholds in
`GRADE_BANDS`. If the bands move, move both.
