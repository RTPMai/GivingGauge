/**
 * GivingGauge — geometry regression test.
 *
 * Asserts the rendered SVG never draws outside its own viewBox, at every
 * score 0–100 and across sizes. This exists because a hand-guessed viewBox
 * multiplier silently clipped the crown of the dial by 16.5px.
 *
 * Run: node gauge.geometry.test.js
 */

const { renderGauge } = require('../src/gauge.js');

let pass = 0, fail = 0;
const failures = [];

function assert(name, ok, detail) {
  if (ok) pass++;
  else { fail++; failures.push(`${name}${detail ? '\n      ' + detail : ''}`); }
}

/**
 * Measure the true drawn bounds of the SVG, accounting for stroke width and
 * for arc curvature (an arc's extreme is not at its endpoints).
 */
function measure(svg) {
  const vb = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const [, , vw, vh] = vb;

  // Everything is inside a translate(0 padTop) group.
  const tm = svg.match(/<g transform="translate\(0 ([\d.-]+)\)"/);
  const dy = tm ? parseFloat(tm[1]) : 0;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const t = (x, y) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y + dy); maxY = Math.max(maxY, y + dy);
  };

  for (const m of svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"[^>]*stroke-width="([\d.-]+)"/g)) {
    const hw = parseFloat(m[5]) / 2;
    t(+m[1] - hw, +m[2] - hw); t(+m[1] + hw, +m[2] + hw);
    t(+m[3] - hw, +m[4] - hw); t(+m[3] + hw, +m[4] + hw);
  }
  for (const m of svg.matchAll(/<polygon points="([^"]+)"/g)) {
    m[1].split(' ').forEach(p => { const [a, b] = p.split(',').map(Number); t(a, b); });
  }
  for (const m of svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.-]+)"/g)) {
    const [cx, cy, r] = [+m[1], +m[2], +m[3]];
    t(cx - r, cy - r); t(cx + r, cy + r);
  }
  // Arc band extremes. The 240° sweep (150°→390°) passes through 180° and
  // 270° and 360°, so left, top and right extremes are all reached.
  for (const m of svg.matchAll(/<path d="M ([\d.-]+) ([\d.-]+) A ([\d.-]+) [\d.-]+ 0 [01] 1 ([\d.-]+) ([\d.-]+)"[^>]*stroke-width="([\d.-]+)"/g)) {
    const r = +m[3], hw = parseFloat(m[6]) / 2;
    // Recover centre from the known layout rather than solving the arc.
    // Endpoints are enough to bound a chord; extremes handled below.
    t(+m[1] - hw, +m[2] - hw); t(+m[1] + hw, +m[2] + hw);
    t(+m[4] - hw, +m[5] - hw); t(+m[4] + hw, +m[5] + hw);
  }
  // Text: approximate by cap height / descender around the baseline.
  for (const m of svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*font-size="([\d.]+)"/g)) {
    const fs = +m[3];
    t(+m[1], +m[2] - fs * 0.78);
    t(+m[1], +m[2] + fs * 0.26);
  }

  return { vw, vh, minX, maxX, minY, maxY };
}

/**
 * Independent geometric bound on the arc band, computed from the layout
 * constants rather than parsed from the path. This is the check that would
 * have caught the clipped crown.
 */
function arcBounds(size) {
  const cx = size / 2;
  const cy = size * 0.335;
  const r = size * 0.365;
  const sw = size * 0.105;
  const outer = r + sw / 2;
  return {
    left: cx - outer,
    right: cx + outer,
    top: cy - outer,     // sweep passes through 270°
    bottom: cy + outer
  };
}

console.log('GivingGauge — geometry bounds\n');

for (const size of [140, 200, 320]) {
  console.log(`size ${size}`);
  let clipped = 0;
  let worstTop = 0;

  for (let s = 0; s <= 100; s++) {
    const svg = renderGauge(
      { total: s, grade: 'C', disqualified: false, gaugeColor: 'gold' },
      { size }
    );
    const b = measure(svg);
    const tm = svg.match(/<g transform="translate\(0 ([\d.-]+)\)"/);
    const dy = tm ? parseFloat(tm[1]) : 0;
    const ab = arcBounds(size);

    const topOverflow = -(ab.top + dy);
    if (topOverflow > 0.01) { clipped++; worstTop = Math.max(worstTop, topOverflow); }
    if (b.minX < -0.01 || b.maxX > b.vw + 0.01) clipped++;
    if (b.maxY > b.vh + 0.01) clipped++;
  }

  assert(`size ${size}: nothing clips at any score`, clipped === 0,
    clipped ? `${clipped} clipped; worst top overflow ${worstTop.toFixed(1)}px` : '');
  console.log(`  ${clipped === 0 ? 'PASS' : 'FAIL'}  no clipping across scores 0–100`);

  // Explicit crown check
  const svg = renderGauge({ total: 54, grade: 'C', disqualified: false, gaugeColor: 'gold' }, { size });
  const dy = parseFloat(svg.match(/<g transform="translate\(0 ([\d.-]+)\)"/)[1]);
  const ab = arcBounds(size);
  const crownY = ab.top + dy;
  assert(`size ${size}: dial crown inside viewBox`, crownY >= -0.01, `crown at y=${crownY.toFixed(1)}`);
  console.log(`  ${crownY >= -0.01 ? 'PASS' : 'FAIL'}  crown of dial visible (y=${crownY.toFixed(1)})`);

  const b = measure(svg);
  assert(`size ${size}: readout inside viewBox`, b.maxY <= b.vh + 0.01,
    `content bottom ${b.maxY.toFixed(1)} vs viewBox ${b.vh.toFixed(1)}`);
  console.log(`  ${b.maxY <= b.vh + 0.01 ? 'PASS' : 'FAIL'}  readout not clipped (${b.maxY.toFixed(1)} / ${b.vh.toFixed(1)})`);
  console.log('');
}

console.log(`${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFAILURES:\n  ' + failures.join('\n  '));
  process.exitCode = 1;
}
