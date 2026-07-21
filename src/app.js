/**
 * GivingGauge — app.
 *
 * Renders the queue, the detail panel, and the decision log. The score is
 * never computed here: every number comes from GivingGauge.evaluate(). This
 * layer only decides what to show.
 */

(function () {
  'use strict';

  var TODAY = '2026-07-21';

  var DIM_LABEL = {
    relationship: 'Customer relationship',
    spend: 'Spend weight',
    cadence: 'Order health',
    region: 'Region',
    mission: 'Mission fit',
    exposure: 'Brand exposure',
    revenueAttach: 'Revenue attach'
  };

  var state = {
    filter: 'pending',
    openId: null,
    // decisions made in-session, keyed by request id
    decisions: {},
    // requests explicitly reopened, so they don't fall back to meta.status
    reopened: {}
  };

  /* ---------------- data ---------------- */

  function evaluated() {
    return REQUESTS.map(function (r) {
      return {
        meta: r,
        result: GivingGauge.evaluate(r.request, r.account, { today: TODAY })
      };
    });
  }

  function statusOf(row) {
    var d = state.decisions[row.meta.id];
    if (d) return d.status;
    if (state.reopened[row.meta.id]) return 'pending';
    return row.meta.status;
  }

  function decisionOf(row) {
    var d = state.decisions[row.meta.id];
    if (d) return d;
    if (state.reopened[row.meta.id]) return null;
    if (row.meta.status === 'pending') return null;
    return {
      status: row.meta.status,
      by: row.meta.decidedBy,
      note: row.meta.note,
      override: !!row.meta.override
    };
  }

  /** Did the human land somewhere the engine did not recommend? */
  function isOverride(result, status) {
    if (status === 'pending') return false;
    var engineSaysApprove = result.decision.indexOf('Approve') === 0;
    if (status === 'approved' && !engineSaysApprove) return true;
    if (status === 'declined' && engineSaysApprove) return true;
    return false;
  }

  /* ---------------- small helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) {
    return '$' + Number(n || 0).toLocaleString();
  }

  function daysLabel(n) {
    if (n == null) return 'No date';
    if (n < 0) return 'Past';
    return n + ' day' + (n === 1 ? '' : 's');
  }

  /* ---------------- queue ---------------- */

  function renderFilters(rows) {
    var counts = { pending: 0, approved: 0, declined: 0 };
    rows.forEach(function (r) { counts[statusOf(r)]++; });

    var defs = [
      ['pending', 'Needs a decision', counts.pending],
      ['approved', 'Approved', counts.approved],
      ['declined', 'Declined', counts.declined],
      ['all', 'All', rows.length]
    ];

    document.getElementById('filters').innerHTML = defs.map(function (d) {
      return '<button class="filt" data-filter="' + d[0] + '" aria-pressed="' +
        (state.filter === d[0]) + '">' + esc(d[1]) +
        '<span class="n">' + d[2] + '</span></button>';
    }).join('');

    var pend = counts.pending;
    document.getElementById('queueMeta').textContent =
      pend === 0
        ? 'Queue clear. Nothing waiting on a decision.'
        : pend + ' waiting on a decision';

    var nc = document.getElementById('navCount');
    if (nc) {
      nc.textContent = pend;
      nc.style.display = pend === 0 ? 'none' : '';
    }
  }

  function requestCard(row) {
    var r = row.result;
    var q = row.meta.request;
    var status = statusOf(row);
    var dec = decisionOf(row);

    var tags = [];
    if (r.disqualified) {
      tags.push(['red', r.disqualifiers[0].label]);
    } else {
      if (r.daysOut != null && r.daysOut < 35) tags.push(['gold', daysLabel(r.daysOut) + ' out']);
      var red = r.flags.filter(function (f) { return f.severity === 'red'; });
      if (red.length) tags.push(['red', red[0].label]);
      var lead = r.flags.filter(function (f) { return f.code === 'LEAD_NOT_HANDOUT'; });
      if (lead.length) tags.push(['green', 'Lead, not a handout']);
    }
    if (!row.meta.account.found) tags.push(['', 'Not a customer']);
    else tags.push(['', row.meta.account.tier]);

    var dotClass = status === 'approved' ? 'done' : status === 'declined' ? 'declined' : '';
    var verdictText = status === 'pending'
      ? r.decision
      : (status === 'approved' ? 'Approved' : 'Declined');
    var verdictTone = status === 'pending'
      ? r.gaugeColor
      : (status === 'approved' ? 'green' : 'red');

    var ovr = dec && (dec.override || isOverride(r, status));

    return '' +
      '<button class="req" data-id="' + row.meta.id + '">' +
        '<span class="dial">' + GivingGaugeDial.renderGauge(r, { size: 168 }) + '</span>' +
        '<h3>' + esc(q.orgName) + '</h3>' +
        '<span class="line">' +
          '<span class="status-dot ' + dotClass + '"></span>' +
          esc(q.eventName || 'Request') + '<br>' +
          esc(q.city) + ' &middot; ' + daysLabel(r.daysOut) + ' out' +
          (ovr ? ' &middot; owner override' : '') +
        '</span>' +
        '<span class="tags">' +
          tags.map(function (t) {
            return '<span class="chip ' + t[0] + '">' + esc(t[1]) + '</span>';
          }).join('') +
        '</span>' +
        '<span class="spacer"></span>' +
        '<span class="verdict ' + verdictTone + '">' + esc(verdictText) + '</span>' +
      '</button>';
  }

  function renderQueue() {
    var rows = evaluated();
    renderFilters(rows);

    var shown = rows.filter(function (r) {
      return state.filter === 'all' || statusOf(r) === state.filter;
    });

    var el = document.getElementById('queue');
    if (!shown.length) {
      el.innerHTML =
        '<div class="empty"><h3>Nothing here</h3>' +
        '<p>New requests land in this queue when the form is submitted.</p></div>';
      return;
    }
    el.innerHTML = shown.map(requestCard).join('');
  }

  /* ---------------- detail panel ---------------- */

  function scorecard(r) {
    if (r.disqualified) return '';

    var rows = Object.keys(r.dimensions).map(function (k) {
      var d = r.dimensions[k];
      var pct = d.max ? Math.round((d.points / d.max) * 100) : 0;
      return '' +
        '<div class="dim">' +
          '<div class="r1">' +
            '<span class="nm">' + esc(DIM_LABEL[k]) + '</span>' +
            '<span class="pt">' + d.points + '<em>/' + d.max + '</em></span>' +
          '</div>' +
          '<div class="why">' + esc(d.reason) + '</div>' +
          '<div class="meter"><i style="width:' + pct + '%"></i></div>' +
        '</div>';
    }).join('');

    var mod = r.modifier;
    var modLine = '' +
      '<div class="mod"><span>Ask size &middot; ' + esc(mod.reason) + '</span>' +
      '<b>' + (mod.modifier === 0 ? '0' : mod.modifier) + '</b></div>';

    return '' +
      '<div class="card">' +
        '<div class="card-hd">Scorecard</div>' +
        rows +
        modLine +
        '<div class="totals"><span class="k">Total</span>' +
        '<span class="v">' + r.total + '<em>/100</em></span></div>' +
      '</div>';
  }

  function flagCards(r) {
    var out = '';

    if (r.disqualifiers.length) {
      out += '<div class="card dq"><div class="card-hd red">Automatic decline</div>' +
        r.disqualifiers.map(function (d) {
          return '<div class="flag-item"><div class="ft"><span class="sev red"></span>' +
            esc(d.label) + '</div><div class="fd">' + esc(d.detail) + '</div></div>';
        }).join('') + '</div>';
    }

    if (r.reviewNotes && r.reviewNotes.length) {
      out += '<div class="card"><div class="card-hd">Owner review</div>' +
        r.reviewNotes.map(function (d) {
          return '<div class="flag-item"><div class="ft"><span class="sev amber"></span>' +
            esc(d.label) + '</div><div class="fd">' + esc(d.detail) + '</div></div>';
        }).join('') + '</div>';
    }

    var fl = (r.flags || []).filter(function (f) {
      return !r.disqualifiers.some(function (d) { return d.code === f.code; });
    });
    if (fl.length) {
      out += '<div class="card"><div class="card-hd">What the score can\'t see</div>' +
        fl.map(function (f) {
          return '<div class="flag-item"><div class="ft"><span class="sev ' +
            (f.severity || 'amber') + '"></span>' + esc(f.label) + '</div>' +
            '<div class="fd">' + esc(f.detail) + '</div></div>';
        }).join('') + '</div>';
    }

    return out;
  }

  function accountCard(row) {
    var a = row.meta.account;
    var r = row.result;
    var sr = r.selfReport;

    var body;
    if (!a.found) {
      body = '<ul class="facts">' +
        '<li><b>Status</b><span class="flag">No record in Apparelytics. Not a current client.</span></li>' +
        '<li><b>They said</b><span>' + esc(sr.claim || 'Not answered') + '</span></li>' +
        '<li><b>Contact</b><span>' + esc(row.meta.request.contactName) + ' &middot; ' +
          esc(row.meta.request.email) + '</span></li>' +
        '</ul>';
    } else {
      body = '<ul class="facts">' +
        '<li><b>Status</b><span>' + esc(a.tier) + ' &middot; score ' + a.score +
          ' &middot; ' + esc(a.matchConfidence) + '</span></li>' +
        '<li><b>They said</b><span>' + esc(sr.claim || 'Not answered') + ' &mdash; ' + esc(sr.verdict) + '</span></li>' +
        '<li><b>Lifetime</b><span>' + money(a.lifetimeRevenue) + ' across ' + a.orderCount + ' orders</span></li>' +
        '<li><b>Cadence</b><span>' + a.medianGapDays + '-day median &middot; ' +
          a.daysSinceLastOrder + ' days since last order</span></li>' +
        '<li><b>Rep</b><span>' + esc(a.owner || 'Unassigned') + '</span></li>' +
        '</ul>';
    }

    return '<div class="card"><div class="card-hd">The account</div>' + body + '</div>';
  }

  function eventCard(row) {
    var q = row.meta.request;
    var r = row.result;
    return '' +
      '<div class="card">' +
        '<div class="card-hd">The request</div>' +
        '<p style="font-size:13px;line-height:1.6;margin-bottom:14px">' +
          esc(q.description || '') + '</p>' +
        '<ul class="facts">' +
          '<li><b>The ask</b><span>' +
            (q.pieceCount == null
              ? '<span class="flag">No piece count given</span>'
              : q.pieceCount + ' pieces') +
            ' &middot; ' + esc(q.merchandise || '') + '</span></li>' +
          '<li><b>Buying too</b><span>' +
            (q.purchaseIntent === 'specific' ? 'Yes, specific'
              : q.purchaseIntent === 'vague' ? 'Yes, unspecified'
              : q.purchaseIntent === 'no' ? 'No'
              : '<span class="flag">Not answered</span>') + '</span></li>' +
          '<li><b>Event</b><span>' + esc(q.eventDate) + ' &middot; ' +
            daysLabel(r.daysOut) + ' out</span></li>' +
          '<li><b>Draw</b><span>' + (q.attendance ? q.attendance.toLocaleString() : 'Not given') +
            ' &middot; ' + (q.yearsActive ? q.yearsActive + ' years running' : 'First year') + '</span></li>' +
          '<li><b>Tax status</b><span>' + esc(q.taxStatus === 'exempt' ? 'Exempt' : 'Business') + '</span></li>' +
        '</ul>' +
      '</div>';
  }

  function decisionBlock(row) {
    var r = row.result;
    var dec = decisionOf(row);

    if (dec) {
      var ovr = dec.override || isOverride(r, dec.status);
      return '' +
        '<div class="decide">' +
          '<div class="logged">' +
            '<b>' + (dec.status === 'approved' ? 'Approved' : 'Declined') + '</b>' +
            (dec.by ? ' by ' + esc(dec.by) : '') +
            (ovr ? ' &middot; <span class="ov">override</span>, engine said ' + esc(r.decision) : '') +
            (dec.note ? '<br>' + esc(dec.note) : '') +
            '<br><button class="undo" data-undo="' + row.meta.id + '">Reopen this request</button>' +
          '</div>' +
        '</div>';
    }

    return '' +
      '<div class="decide">' +
        '<div class="btns">' +
          '<button class="btn btn-green" data-decide="approved" data-id="' + row.meta.id + '">Approve</button>' +
          '<button class="btn btn-red" data-decide="declined" data-id="' + row.meta.id + '">Decline</button>' +
        '</div>' +
      '</div>';
  }

  function openPanel(id) {
    var row = evaluated().filter(function (r) { return r.meta.id === id; })[0];
    if (!row) return;
    state.openId = id;

    var r = row.result;
    var q = row.meta.request;

    var recLine = r.disqualified
      ? 'Automatic decline'
      : r.decision;

    var recWhy = r.disqualified
      ? r.disqualifiers[0].detail
      : summarise(row);

    document.getElementById('panelIn').innerHTML = '' +
      '<div class="panel-top">' +
        '<div>' +
          '<h2>' + esc(q.orgName) + '</h2>' +
          '<div class="sub">' + esc(q.eventName || '') + ' &middot; ' + esc(q.city) +
            ', ' + esc(q.state) + ' &middot; ' + esc(row.meta.id) + '</div>' +
        '</div>' +
        '<button class="x" id="closePanel" aria-label="Close">&times;</button>' +
      '</div>' +

      '<div class="card hero">' +
        '<div class="dial">' + GivingGaugeDial.renderGauge(r, { size: 132 }) + '</div>' +
        '<div class="read">' +
          '<div class="rec">' + esc(recLine) + '</div>' +
          '<p>' + esc(recWhy) + '</p>' +
        '</div>' +
      '</div>' +

      eventCard(row) +
      accountCard(row) +
      scorecard(r) +
      flagCards(r) +
      decisionBlock(row);

    document.getElementById('panel').classList.add('open');
    document.getElementById('scrim').classList.add('open');
    document.getElementById('panel').focus();
  }

  /** One line of plain judgment. Not scoring arithmetic. */
  function summarise(row) {
    var r = row.result;
    var a = row.meta.account;
    var bits = [];

    if (!a.found) bits.push('Not a customer, so relationship and spend score zero.');
    else if (r.flags.some(function (f) { return f.code === 'DORMANT_MEANINGFUL'; }))
      bits.push('Dormant account with real history. Open a quote before committing product.');
    else bits.push(a.tier + ' account, ' + money(a.lifetimeRevenue) + ' lifetime.');

    var m = r.dimensions && r.dimensions.mission;
    if (m && m.points >= 18) bits.push('Mission lands squarely in a core priority.');
    else if (m && m.points <= 2) bits.push('Mission case is thin.');

    if (r.flags.some(function (f) { return f.code === 'LEAD_NOT_HANDOUT'; }))
      bits.push('They plan to buy — route to a rep either way.');

    return bits.join(' ');
  }

  function closePanel() {
    state.openId = null;
    document.getElementById('panel').classList.remove('open');
    document.getElementById('scrim').classList.remove('open');
  }

  /* ---------------- events ---------------- */

  document.addEventListener('click', function (e) {
    var f = e.target.closest('[data-filter]');
    if (f) { state.filter = f.dataset.filter; renderQueue(); return; }

    var req = e.target.closest('.req');
    if (req) { openPanel(req.dataset.id); return; }

    if (e.target.id === 'closePanel' || e.target.id === 'scrim') { closePanel(); return; }

    var dec = e.target.closest('[data-decide]');
    if (dec) {
      delete state.reopened[dec.dataset.id];
      state.decisions[dec.dataset.id] = {
        status: dec.dataset.decide,
        by: 'Ryan',
        note: ''
      };
      renderQueue();
      openPanel(dec.dataset.id);
      return;
    }

    var undo = e.target.closest('[data-undo]');
    if (undo) {
      var id = undo.dataset.undo;
      // Delete rather than set to pending: decisionOf() treats any stored
      // object as a made decision, so a {status:'pending'} stub would keep
      // the request locked in the decided state.
      delete state.decisions[id];
      state.reopened[id] = true;
      renderQueue();
      openPanel(id);
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.openId) closePanel();
  });

  renderQueue();
})();
