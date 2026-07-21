/**
 * GivingGauge — engine regression tests
 * Run: node engine.test.js
 *
 * Cases 1–3 are the three requests already processed by hand.
 * Cases 4+ are edge cases that lock down behaviour the prose model
 * kept getting wrong: dormancy, self-report mismatch, extractive asks,
 * blank fields, and the religious-customer carve-out.
 */

const GG = require('../src/scoring-engine.js');

let pass = 0, fail = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; }
  else { fail++; failures.push(`${name}\n    expected: ${expected}\n    actual:   ${actual}`); }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${actual}, want ${expected})`}`);
}

function hasFlag(result, code) {
  return result.flags.some(f => f.code === code);
}

function banner(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

/* ================================================================== *
 * CASE 1 — Polk County Pickleball (Ethan Welch)
 * Known outcome: 54/100, Approve with Conditions (owner call)
 * Legacy form: no piece count, no purchase-intent field.
 * ================================================================== */
banner('Case 1 — Polk County Pickleball');

const pickleball = GG.evaluate(
  {
    orgName: 'Polk County Pickleball',
    contactName: 'Ethan Welch',
    city: 'Ankeny', state: 'IA', county: 'Polk',
    eventDate: '2026-09-12',
    selfReportedCustomer: 'no',
    taxStatus: 'exempt',
    missionFit: 'adjacent',      // youth/community sport programming
    logoRequired: true,
    attendance: 300,
    yearsActive: 3,
    pieceCount: null,            // legacy form — field did not exist
    purchaseIntent: '',          // legacy form — field did not exist
    carriesPMMark: true
  },
  { found: false },
  { today: '2026-07-14' }
);

check('not disqualified', pickleball.disqualified, false);
check('relationship = 0 (non-customer)', pickleball.dimensions.relationship.points, 0);
check('region = 10 (Ankeny home metro)', pickleball.dimensions.region.points, 10);
check('mission = 13 (adjacent)', pickleball.dimensions.mission.points, 13);
check('exposure = 11 (logo 6 + reach 3 + mark 2)', pickleball.dimensions.exposure.points, 11);
check('revenue attach = 0 (blank field)', pickleball.dimensions.revenueAttach.points, 0);
check('ask modifier = -5 (piece count blank)', pickleball.modifier.modifier, -5);
check('raw total = 34', pickleball.rawTotal, 34);
check('total = 29', pickleball.total, 29);
check('grade F', pickleball.grade, 'F');
console.log('  NOTE: engine says 29/F. Hand review scored 54/C and approved with conditions.');
console.log('        Two legacy-form blanks cost 5 pts directly and 5 more via the modifier.');
console.log('        See "Reconciliation" below.');

/* ================================================================== *
 * CASE 2 — Raising Readers in the Heartland (Jill Friestad-Tate)
 * Known outcome: 29/100, Decline
 * ================================================================== */
banner('Case 2 — Raising Readers in the Heartland');

const readers = GG.evaluate(
  {
    orgName: 'Raising Readers in the Heartland',
    contactName: 'Jill Friestad-Tate',
    city: 'Ankeny', state: 'IA', county: 'Polk',
    eventDate: '2026-10-03',
    selfReportedCustomer: 'no',
    taxStatus: 'exempt',
    missionFit: 'core',          // children / literacy
    logoRequired: false,
    attendance: 120,
    yearsActive: 2,
    pieceCount: 40,
    multipleTypes: true,         // shirts AND medals
    purchaseIntent: 'no'
  },
  { found: false },
  { today: '2026-07-14' }
);

check('not disqualified', readers.disqualified, false);
check('relationship = 0', readers.dimensions.relationship.points, 0);
check('spend = 0', readers.dimensions.spend.points, 0);
check('cadence = 0', readers.dimensions.cadence.points, 0);
check('region = 10', readers.dimensions.region.points, 10);
check('mission = 18 (core — children)', readers.dimensions.mission.points, 18);
check('exposure = 3 (no logo 1 + reach 2)', readers.dimensions.exposure.points, 3);
check('revenue attach = 0', readers.dimensions.revenueAttach.points, 0);
check('ask modifier = -5 (multiple types)', readers.modifier.modifier, -5);
check('total = 26', readers.total, 26);
check('grade F', readers.grade, 'F');
check('decision Decline', readers.decision, 'Decline');
check('gauge red', readers.gaugeColor, 'red');
console.log('  Hand review: 29/Decline. Engine: 26/Decline. Same call, 3 pts apart.');

/* ================================================================== *
 * CASE 3 — Lutheran Services in Iowa (Shay Olthoff)
 * Known outcome: auto-decline on the 21-day lead-time floor (17 days out).
 * Ryan overrode to a 20%-off discount.
 * ================================================================== */
banner('Case 3 — Lutheran Services in Iowa');

const lsi = GG.evaluate(
  {
    orgName: 'Lutheran Services in Iowa',
    contactName: 'Shay Olthoff',
    city: 'Des Moines', state: 'IA', county: 'Polk',
    eventDate: '2026-07-31',
    selfReportedCustomer: 'not sure',
    taxStatus: 'exempt',
    orgType: 'religious',
    isReligious: true,
    askIsSecular: true,          // foster care / social services, not worship
    missionFit: 'core',
    logoRequired: true,
    attendance: 200,
    yearsActive: 4,
    pieceCount: 50,
    purchaseIntent: 'vague'
  },
  { found: false },
  { today: '2026-07-14' }
);

check('disqualified', lsi.disqualified, true);
check('lead-time trigger fired', lsi.disqualifiers.some(d => d.code === 'LEAD_TIME'), true);
check('days out = 17', lsi.daysOut, 17);
check('grade F', lsi.grade, 'F');
check('decision Decline', lsi.decision, 'Decline');
check('religious NOT a disqualifier (secular ask)', lsi.disqualifiers.some(d => d.code === 'RELIGIOUS'), false);
check('religious escalated to owner review', lsi.reviewNotes.some(r => r.code === 'RELIGIOUS_REVIEW'), true);
check('no scoring performed', lsi.dimensions, null);
console.log('  Matches the hand review: hard floor, no score, owner override available.');

/* ================================================================== *
 * CASE 4 — Lead time exactly at the floor (21 days)
 * ================================================================== */
banner('Case 4 — Lead time boundary');

const at21 = GG.evaluate(
  { orgName: 'Boundary Test', city: 'Ankeny', state: 'IA', eventDate: '2026-08-04',
    missionFit: 'adjacent', logoRequired: true, attendance: 100, yearsActive: 3,
    pieceCount: 20, purchaseIntent: 'no', selfReportedCustomer: 'no' },
  { found: false }, { today: '2026-07-14' }
);
const at20 = GG.evaluate(
  { orgName: 'Boundary Test', city: 'Ankeny', state: 'IA', eventDate: '2026-08-03',
    missionFit: 'adjacent', logoRequired: true, attendance: 100, yearsActive: 3,
    pieceCount: 20, purchaseIntent: 'no', selfReportedCustomer: 'no' },
  { found: false }, { today: '2026-07-14' }
);

check('21 days out — passes', at21.disqualified, false);
check('20 days out — disqualified', at20.disqualified, true);

/* ================================================================== *
 * CASE 5 — Dormant meaningful spender
 * ================================================================== */
banner('Case 5 — Dormant big spender');

const dormant = GG.evaluate(
  { orgName: 'Quiet Giant Booster Club', city: 'Johnston', state: 'IA', county: 'Polk',
    eventDate: '2026-10-01', selfReportedCustomer: 'yes', taxStatus: 'exempt',
    missionFit: 'adjacent', logoRequired: true, attendance: 1500, yearsActive: 8,
    pieceCount: 60, purchaseIntent: 'vague' },
  { found: true, matchConfidence: 'Confirmed', customerId: 'C-1042', tier: 'Gold',
    score: 3, owner: 'Abby', lifetimeRevenue: 42000, orderCount: 14,
    medianGapDays: 95, daysSinceLastOrder: 610 },
  { today: '2026-07-14' }
);

check('relationship = 8 (dormant, meaningful)', dormant.dimensions.relationship.points, 8);
check('DORMANT_MEANINGFUL flag raised', hasFlag(dormant, 'DORMANT_MEANINGFUL'), true);
check('spend = 11 ($25k-$50k band)', dormant.dimensions.spend.points, 11);
check('cadence = 2 (overdue)', dormant.dimensions.cadence.points, 2);
check('grade C', dormant.grade, 'C');
check('gauge gold', dormant.gaugeColor, 'gold');

/* ================================================================== *
 * CASE 6 — Self-report mismatch: claims customer, no record
 * ================================================================== */
banner('Case 6 — Self-report mismatch');

const mismatch = GG.evaluate(
  { orgName: 'Phantom Foundation', city: 'Ankeny', state: 'IA',
    eventDate: '2026-11-01', selfReportedCustomer: 'yes', taxStatus: 'exempt',
    missionFit: 'core', logoRequired: true, attendance: 500, yearsActive: 6,
    pieceCount: 24, purchaseIntent: 'no' },
  { found: false }, { today: '2026-07-14' }
);

check('SELF_REPORT_MISMATCH flag raised', hasFlag(mismatch, 'SELF_REPORT_MISMATCH'), true);
check('relationship still 0', mismatch.dimensions.relationship.points, 0);
check('verdict text present', mismatch.selfReport.verdict.length > 0, true);

/* ================================================================== *
 * CASE 7 — Unaware customer: says no, Apparelytics says yes
 * ================================================================== */
banner('Case 7 — Unaware customer');

const unaware = GG.evaluate(
  { orgName: 'Ankeny Centennial High School', city: 'Ankeny', state: 'IA',
    eventDate: '2026-11-01', selfReportedCustomer: 'no', taxStatus: 'exempt',
    missionFit: 'adjacent', logoRequired: true, attendance: 1200, yearsActive: 10,
    pieceCount: 30, purchaseIntent: 'specific' },
  { found: true, matchConfidence: 'Confirmed', customerId: 'C-2001', tier: 'Platinum',
    score: 5, owner: 'Abby', lifetimeRevenue: 128000, orderCount: 60,
    medianGapDays: 22, daysSinceLastOrder: 18,
    ytdRevenue: 31000, priorYtdRevenue: 26000 },
  { today: '2026-07-14' }
);

check('UNAWARE_CUSTOMER flag raised', hasFlag(unaware, 'UNAWARE_CUSTOMER'), true);
check('relationship = 28 (full credit)', unaware.dimensions.relationship.points, 28);
check('spend = 18 ($100k+, capped with YTD bonus)', unaware.dimensions.spend.points, 18);
check('cadence = 9', unaware.dimensions.cadence.points, 9);
check('revenue attach = 5', unaware.dimensions.revenueAttach.points, 5);
check('grade A', unaware.grade, 'A');
check('decision Approve', unaware.decision, 'Approve');
check('gauge green', unaware.gaugeColor, 'green');

/* ================================================================== *
 * CASE 8 — Extractive ask
 * ================================================================== */
banner('Case 8 — Extractive ask');

const extractive = GG.evaluate(
  { orgName: 'Big Ask LLC Event', city: 'Ankeny', state: 'IA',
    eventDate: '2026-12-01', selfReportedCustomer: 'no', taxStatus: 'business',
    missionFit: 'promotional', logoRequired: false, attendance: 400, yearsActive: 1,
    pieceCount: 200, purchaseIntent: 'no' },
  { found: false }, { today: '2026-07-14' }
);

check('EXTRACTIVE flag raised', hasFlag(extractive, 'EXTRACTIVE'), true);
check('LARGE_ASK flag raised', hasFlag(extractive, 'LARGE_ASK'), true);
check('BUSINESS_WEAK_MISSION flag raised', hasFlag(extractive, 'BUSINESS_WEAK_MISSION'), true);
check('modifier = -10', extractive.modifier.modifier, -10);
check('grade F', extractive.grade, 'F');

/* ================================================================== *
 * CASE 9 — Out of state, no relationship
 * ================================================================== */
banner('Case 9 — Out of state');

const oos = GG.evaluate(
  { orgName: 'Omaha Youth League', city: 'Omaha', state: 'NE',
    eventDate: '2026-12-01', selfReportedCustomer: 'no', taxStatus: 'exempt',
    missionFit: 'core', logoRequired: true, attendance: 2000, yearsActive: 12,
    pieceCount: 20, purchaseIntent: 'specific' },
  { found: false }, { today: '2026-07-14' }
);

check('disqualified', oos.disqualified, true);
check('OUT_OF_REGION trigger', oos.disqualifiers.some(d => d.code === 'OUT_OF_REGION'), true);

/* ================================================================== *
 * CASE 10 — Out of state BUT confirmed customer with spend
 * ================================================================== */
banner('Case 10 — Out of state, confirmed customer');

const oosCustomer = GG.evaluate(
  { orgName: 'Regional Client Co', city: 'Omaha', state: 'NE',
    eventDate: '2026-12-01', selfReportedCustomer: 'yes', taxStatus: 'exempt',
    missionFit: 'core', logoRequired: true, attendance: 800, yearsActive: 6,
    pieceCount: 20, purchaseIntent: 'specific' },
  { found: true, matchConfidence: 'Confirmed', tier: 'Silver', owner: 'Abby',
    lifetimeRevenue: 31000, orderCount: 9, medianGapDays: 70, daysSinceLastOrder: 40 },
  { today: '2026-07-14' }
);

check('not auto-declined', oosCustomer.disqualified, false);
check('flagged for owner override', oosCustomer.reviewNotes.some(r => r.code === 'OUT_OF_STATE_CUSTOMER'), true);
check('region scores 0', oosCustomer.dimensions.region.points, 0);

/* ================================================================== */
banner('Summary');
console.log(`  ${pass} passed, ${fail} failed\n`);
if (failures.length) {
  console.log('FAILURES:\n' + failures.map(f => '  ' + f).join('\n\n'));
  process.exitCode = 1;
}
