// T07 — Kickstarter planner + referral tags.
// Pure functions in the core; DOM only in mount().

export const MAX_TAGS = 20000; // Kickstarter custom referral tag limit

// Conversion presets. Only 0.32 is a published Kickstarter figure.
export const PRESETS = [
  { id: 'stress', label: 'Stress case', conversion: 0.08, source: 'planning' },
  { id: 'base', label: 'Base case', conversion: 0.2, source: 'planning' },
  { id: 'official', label: 'Official-average upside', conversion: 0.32, source: 'kickstarter' },
];

export function expectedBackers(followers, conversion) {
  const f = Number(followers), c = Number(conversion);
  if (!Number.isFinite(f) || !Number.isFinite(c) || f < 0 || c < 0) return 0;
  return f * c;
}

export function expectedRaise(followers, conversion, avgPledge) {
  const p = Number(avgPledge);
  if (!Number.isFinite(p) || p < 0) return 0;
  return expectedBackers(followers, conversion) * p;
}

// Goal check: is the goal clearable in the first 48h from F x C x P?
export function goalCheck(followers, conversion, avgPledge, goal) {
  const raise = expectedRaise(followers, conversion, avgPledge);
  const g = Number(goal);
  const validGoal = Number.isFinite(g) && g > 0;
  return {
    conversion,
    backers: expectedBackers(followers, conversion),
    raise,
    goal: validGoal ? g : null,
    clears: validGoal ? raise >= g : false,
    percentOfGoal: validGoal ? (raise / g) * 100 : null,
  };
}

export function compareCases(followers, avgPledge, goal) {
  return PRESETS.map((p) => ({
    id: p.id, label: p.label, source: p.source,
    ...goalCheck(followers, p.conversion, avgPledge, goal),
  }));
}

// Kickstarter Custom Referral Tags ride on the `ref` query parameter.
export function buildReferralLink(projectUrl, tag) {
  const t = String(tag ?? '').trim();
  if (!t) throw new Error('tag is required');
  let url;
  try { url = new URL(String(projectUrl ?? '').trim()); } catch { throw new Error('invalid project URL'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('invalid project URL');
  url.searchParams.set('ref', t);
  return url.toString();
}

export function buildTagList(projectUrl, partners) {
  const names = [...new Set((partners || []).map((s) => String(s).trim()).filter(Boolean))];
  if (names.length > MAX_TAGS) throw new Error(`Kickstarter allows at most ${MAX_TAGS} tags`);
  return names.map((tag) => ({ tag, link: buildReferralLink(projectUrl, tag) }));
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function mount(rootEl) {
  const doc = rootEl.ownerDocument;
  const el = (tag, props = {}, ...kids) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    kids.forEach((k) => e.append(k));
    return e;
  };
  const field = (label, input) => el('label', {}, label + ' ', input);
  const followers = el('input', { type: 'number', min: 0, value: 1000 });
  const pledge = el('input', { type: 'number', min: 0, value: 40 });
  const goal = el('input', { type: 'number', min: 0, value: 10000 });
  const selector = el('select', {}, ...PRESETS.map((p) => el('option', { value: p.id, textContent: `${p.label} (${Math.round(p.conversion * 100)}%)` })));
  selector.value = 'base';
  const table = el('div', { className: 'ks-cases' });
  const selected = el('p', { className: 'ks-selected' });

  const render = () => {
    const cases = compareCases(followers.value, pledge.value, goal.value);
    table.replaceChildren(...cases.map((c) => el('div', { className: 'ks-case ' + (c.clears ? 'clears' : 'misses') },
      el('strong', { textContent: `${c.label} — ${Math.round(c.conversion * 100)}%` }),
      el('div', { textContent: `Backers: ${fmt(c.backers)}` }),
      el('div', { textContent: `Raise in first 48h: $${fmt(c.raise)}` }),
      el('div', { textContent: c.goal === null ? 'Enter a goal to check' : c.clears ? 'Clears the goal' : 'Does not clear the goal' }),
    )));
    const sel = cases.find((c) => c.id === selector.value);
    selected.textContent = sel ? `Selected: ${sel.label} → ~${fmt(sel.backers)} backers, ~$${fmt(sel.raise)}.` : '';
  };
  [followers, pledge, goal, selector].forEach((i) => i.addEventListener('input', render));

  const note = el('p', { className: 'ks-note', textContent:
    'The 32% case is Kickstarter\'s official figure: pre-launch followers pledge at 32% once live, vs 17% post-launch (Kickstarter blog, 29 Oct 2025). ' +
    'The 20% and 8% cases are planning cases, not benchmarks.' });

  const url = el('input', { type: 'url', placeholder: 'https://www.kickstarter.com/projects/you/your-project' });
  const partnerTag = el('input', { type: 'text', placeholder: 'One tag per ring partner' });
  const out = el('output', { className: 'ks-link' });
  const err = el('p', { className: 'ks-error', role: 'alert' });
  const make = el('button', { type: 'button', textContent: 'Build referral link' });
  make.addEventListener('click', () => {
    try { out.textContent = buildReferralLink(url.value, partnerTag.value); err.textContent = ''; }
    catch (e) { out.textContent = ''; err.textContent = e.message; }
  });
  const tagNote = el('p', { className: 'ks-note', textContent:
    'Create each tag on your project\'s Promotion tab before launch, then use the same tag text here. ' +
    'The dashboard shows aggregate pledges, % of funds and amount per tag — never backer-specific data. ' +
    `Limit: ${MAX_TAGS.toLocaleString('en-US')} tags. ` +
    'Kickstarter does not explicitly document click attribution for the pre-launch page, so do not assume tags count pre-launch page visits.' });

  rootEl.replaceChildren(
    el('h2', { textContent: 'Kickstarter planner' }),
    field('Pre-launch followers', followers), field('Average pledge ($)', pledge),
    field('Funding goal ($)', goal), field('Conversion case', selector),
    table, selected, note,
    el('h2', { textContent: 'Referral tags' }),
    field('Project URL', url), field('Tag', partnerTag), make, out, err, tagNote,
  );
  render();
}
