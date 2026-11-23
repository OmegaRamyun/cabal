// T05 — Matchmaking directory + match score.
// Pure functions in the core; DOM only in mount(). No ranking, no hidden
// weights, no enforcement: everything here is advisory and shown to the user.

export const AUDIENCE_BUCKETS = ["<100", "100-1k", "1k-10k", "10k+"];
export const DAY_MS = 86400000;
export const WINDOW_FULL_DAYS = 30;

// Weights are public and equal. Total = mean of the three component scores,
// times the pre-launch multiplier.
export const WEIGHTS = Object.freeze({ genre_tag: 1, audience: 1, window: 1 });

const lc = (s) => String(s).trim().toLowerCase();

function tagSet(p) {
  return new Set([...(p.genres || []), ...(p.steam_tags || [])].map(lc));
}

export function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return inter / (setA.size + setB.size - inter);
}

export function audienceProximity(a, b) {
  const i = AUDIENCE_BUCKETS.indexOf(a);
  const j = AUDIENCE_BUCKETS.indexOf(b);
  if (i < 0 || j < 0) return 0.25;
  const d = Math.abs(i - j);
  return d <= 1 ? 1.0 : d === 2 ? 0.5 : 0.25;
}

function day(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// Overlapping days (inclusive of both ends) / 30, capped at 1.0.
export function windowOverlapDays(wa, wb) {
  const start = Math.max(day(wa.start), day(wb.start));
  const end = Math.min(day(wa.end), day(wb.end));
  return end < start ? 0 : Math.round((end - start) / DAY_MS) + 1;
}

export function windowOverlap(wa, wb) {
  return Math.min(1, windowOverlapDays(wa, wb) / WINDOW_FULL_DAYS);
}

/**
 * matchScore(a, b) -> { total, components, multiplier, explain }
 * Symmetric: matchScore(a, b) equals matchScore(b, a). The same breakdown is
 * shown to both parties.
 *
 * The pre-launch-followers factor is a MULTIPLIER, not a score component: it
 * is 1.0 whenever pre-launch followers exist (the profile schema carries no
 * follower counts, so it is a constant 1.0 here) and never adds or removes
 * points on its own.
 */
export function matchScore(a, b) {
  const sa = tagSet(a), sb = tagSet(b);
  const shared = [...sa].filter((x) => sb.has(x)).sort();
  const days = windowOverlapDays(a.launch_window, b.launch_window);
  const components = {
    genre_tag: jaccard(sa, sb),
    audience: audienceProximity(a.audience_scale, b.audience_scale),
    window: Math.min(1, days / WINDOW_FULL_DAYS),
  };
  const multiplier = 1.0;
  const wsum = WEIGHTS.genre_tag + WEIGHTS.audience + WEIGHTS.window;
  const total =
    ((components.genre_tag * WEIGHTS.genre_tag +
      components.audience * WEIGHTS.audience +
      components.window * WEIGHTS.window) /
      wsum) *
    multiplier;
  const r = (x) => Math.round(x * 1000) / 1000;
  return {
    total: r(total),
    components: {
      genre_tag: r(components.genre_tag),
      audience: r(components.audience),
      window: r(components.window),
    },
    multiplier,
    explain: {
      genre_tag: `Jaccard on combined genre+Steam-tag sets; shared: ${shared.join(", ") || "none"}`,
      audience: `${[a.audience_scale, b.audience_scale].sort((x, y) => AUDIENCE_BUCKETS.indexOf(x) - AUDIENCE_BUCKETS.indexOf(y)).join(" vs ")}: same/adjacent bucket 1.0, two apart 0.5, else 0.25`,
      window: `${days} overlapping day(s) / ${WINDOW_FULL_DAYS}, capped at 1.0`,
      multiplier: "Pre-launch followers exist: 1.0 (a multiplier, not a score)",
      total: "Equal-weight mean of the three components x multiplier",
    },
  };
}

/**
 * rotationWarnings(ring, history) -> [{ rule, member, partner?, message }]
 * ring: array of member ids. history: array of feature events
 *   { from, to, date: "YYYY-MM-DD", campaign }  ("from" features "to").
 * Include the planned features in history to see whether they would warn.
 * Warnings only. Nothing here blocks, enforces, or counts toward any reward.
 *  - pair-14d: same from->to feature twice within 14 days (gap < 14 days)
 *  - pair-campaign: same from->to feature more than 2x in one campaign
 *  - member-week: more than 50% of the ring features the same member within
 *    one 7-day window (distinct featurers / ring size)
 */
export function rotationWarnings(ring, history) {
  const out = [];
  const events = (history || []).map((e) => ({ ...e, t: day(e.date) }));

  const pairs = new Map();
  for (const e of events) {
    const k = `${e.from}\u0000${e.to}`;
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k).push(e);
  }
  for (const list of pairs.values()) {
    const { from, to } = list[0];
    list.sort((x, y) => x.t - y.t);
    for (let i = 1; i < list.length; i++) {
      if ((list[i].t - list[i - 1].t) / DAY_MS < 14) {
        out.push({
          rule: "pair-14d", member: from, partner: to,
          message: `${from} features ${to} more than once within 14 days (${list[i - 1].date}, ${list[i].date}).`,
        });
        break;
      }
    }
    const byCamp = new Map();
    for (const e of list) byCamp.set(e.campaign, (byCamp.get(e.campaign) || 0) + 1);
    for (const [c, n] of byCamp) {
      if (n > 2) {
        out.push({
          rule: "pair-campaign", member: from, partner: to,
          message: `${from} features ${to} ${n} times in campaign "${c}" (more than 2).`,
        });
      }
    }
  }

  const size = (ring || []).length;
  if (size > 0) {
    const byTo = new Map();
    for (const e of events) {
      if (!byTo.has(e.to)) byTo.set(e.to, []);
      byTo.get(e.to).push(e);
    }
    for (const [to, list] of byTo) {
      list.sort((x, y) => x.t - y.t);
      let flagged = null;
      for (let i = 0; i < list.length && !flagged; i++) {
        const win = list.filter((e) => e.t >= list[i].t && e.t - list[i].t < 7 * DAY_MS);
        const featurers = new Set(win.map((e) => e.from));
        if (featurers.size / size > 0.5) flagged = featurers.size;
      }
      if (flagged) {
        out.push({
          rule: "member-week", member: to,
          message: `${flagged} of ${size} ring members feature ${to} within one week (more than 50%).`,
        });
      }
    }
  }
  return out;
}

// ---- DOM (mount only) ----
function el(doc, tag, text, cls) {
  const n = doc.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

/**
 * mount(rootEl, opts?) opts: { profiles, history, ring, indexUrl }
 * If profiles is omitted, loads directory/index.json (relative to the page).
 * Uses textContent only. Read-only: no posting, no storage, no network
 * beyond fetching the directory JSON.
 */
export async function mount(rootEl, opts = {}) {
  const doc = rootEl.ownerDocument;
  let profiles = opts.profiles;
  if (!profiles) {
    const base = opts.indexUrl || "directory/index.json";
    const idx = await (await fetch(base)).json();
    const dir = base.slice(0, base.lastIndexOf("/") + 1);
    profiles = await Promise.all(idx.profiles.map(async (f) => (await fetch(dir + f)).json()));
  }
  const history = opts.history || [];
  const ring = opts.ring || profiles.map((p) => p.id);
  rootEl.textContent = "";
  rootEl.appendChild(el(doc, "h2", "Directory"));
  const list = el(doc, "ul");
  const detail = el(doc, "div");
  const picks = [];
  const render = () => {
    detail.textContent = "";
    if (picks.length < 2) {
      detail.appendChild(el(doc, "p", "Select two profiles to see the score breakdown."));
    } else {
      const [a, b] = picks;
      const s = matchScore(a, b);
      detail.appendChild(el(doc, "h3", `${a.display_name} + ${b.display_name}: ${s.total}`));
      const ul = el(doc, "ul");
      for (const k of ["genre_tag", "audience", "window"]) {
        ul.appendChild(el(doc, "li", `${k}: ${s.components[k]} — ${s.explain[k]}`));
      }
      ul.appendChild(el(doc, "li", `multiplier: ${s.multiplier} — ${s.explain.multiplier}`));
      ul.appendChild(el(doc, "li", s.explain.total));
      detail.appendChild(ul);
    }
    detail.appendChild(el(doc, "h3", "Rotation warnings (advisory only)"));
    const warns = rotationWarnings(ring, history);
    if (!warns.length) detail.appendChild(el(doc, "p", "No warnings."));
    for (const w of warns) detail.appendChild(el(doc, "p", w.message));
  };
  for (const p of profiles) {
    const li = el(doc, "li");
    const btn = el(doc, "button",
      `${p.display_name} — ${p.genres.join(", ")} — ${p.audience_scale} — ${p.launch_window.type} ${p.launch_window.start}..${p.launch_window.end}`);
    btn.type = "button";
    btn.addEventListener("click", () => {
      const i = picks.indexOf(p);
      if (i >= 0) picks.splice(i, 1); else { picks.push(p); if (picks.length > 2) picks.shift(); }
      render();
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
  rootEl.appendChild(list);
  rootEl.appendChild(detail);
  render();
}
