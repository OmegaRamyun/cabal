// V61 — True first-run screen (+ V67 sticky ringless CTA).
// A cold user (no rings, no demo opt-in) sees ONE sentence and two big
// buttons. Demo data loads only when the user taps "See a demo ring".
// Pure functions + mount(rootEl, ctx) per AGENTS.md. No module touches
// another module's DOM. No network, no storage writes except through ctx.

export const FIRST_RUN_COPY = Object.freeze({
  sentence:
    "Cabal: small rings of indie devs boost each other’s posts, in their own words. No accounts.",
  startRing: "Start a ring",
  haveInvite: "I have an invite link",
  seeDemo: "See a demo ring",
  invitePlaceholder: "Paste your invite link here",
  inviteGo: "Open invite",
  inviteError: "That doesn’t look like a Cabal invite link. It should contain #c=…",
});

// CSS hooks for the coordinator (listed in tasks/V61-first-run.md).
export const FIRST_RUN_CLASSES = Object.freeze({
  screen: "first-run",
  sentence: "first-run-sentence",
  actions: "first-run-actions",
  primary: "first-run-btn first-run-start primary",
  secondary: "first-run-btn first-run-invite",
  demoLink: "first-run-demo-link",
  inviteForm: "first-run-invite-form",
  error: "first-run-error",
  sticky: "ringless-cta",
  bodyPad: "has-ringless-cta",
});

function isDemoOn(demoFlag) {
  return demoFlag === "on";
}

function realCampaigns(campaigns) {
  return Array.isArray(campaigns) ? campaigns.filter((c) => c && !c.demo) : [];
}

/**
 * shouldShowFirstRun({ campaigns, demoFlag }) — true only when the user has
 * no rings at all and has not opted into demo. Any campaign (real or demo)
 * or demoFlag === "on" means a dashboard, not the first-run screen.
 */
export function shouldShowFirstRun(state = {}) {
  const list = Array.isArray(state.campaigns) ? state.campaigns : [];
  if (list.length > 0) return false;
  if (isDemoOn(state.demoFlag)) return false;
  return true;
}

/**
 * shouldShowRinglessCta({ campaigns, demoFlag }) — the sticky bottom
 * "Start a ring" CTA shows while the user has no REAL rings of their own
 * (including while browsing the opted-in demo, where the demo is not theirs).
 */
export function shouldShowRinglessCta(state = {}) {
  return realCampaigns(state.campaigns).length === 0;
}

/**
 * extractInviteHash(text) -> "#c=..." | null. Accepts a full URL, a bare
 * "#c=..." fragment, or "c=..." and returns the hash the shell's link intent
 * (`parseHash` -> view 'link') already understands.
 */
export function extractInviteHash(text) {
  const s = String(text == null ? "" : text).trim();
  if (!s) return null;
  const i = s.indexOf("#c=");
  if (i >= 0) {
    const frag = s.slice(i).split(/\s/)[0];
    return frag.length > 3 ? frag : null;
  }
  if (/^c=\S+/.test(s)) return `#${s.split(/\s/)[0]}`;
  return null;
}

function el(doc, tag, text, cls) {
  const n = doc.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

/**
 * mount(rootEl, ctx) — renders the first-run screen.
 * ctx: { onStartRing(), onOpenInvite(hash), onSeeDemo(), showSticky? }
 *  - onStartRing: shell routes to `#/rings` (game setup, then create).
 *  - onOpenInvite(hash): shell sets location.hash = hash (link intent).
 *  - onSeeDemo: shell calls demo.optInDemo(localStorage) then re-renders.
 */
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  const call = (name, ...a) => { if (typeof ctx[name] === "function") ctx[name](...a); };
  rootEl.textContent = "";
  const screen = el(doc, "section", null, FIRST_RUN_CLASSES.screen);
  screen.appendChild(el(doc, "p", FIRST_RUN_COPY.sentence, FIRST_RUN_CLASSES.sentence));

  const actions = el(doc, "div", null, FIRST_RUN_CLASSES.actions);
  const start = el(doc, "button", FIRST_RUN_COPY.startRing, FIRST_RUN_CLASSES.primary);
  start.type = "button";
  start.addEventListener("click", () => call("onStartRing"));
  const invite = el(doc, "button", FIRST_RUN_COPY.haveInvite, FIRST_RUN_CLASSES.secondary);
  invite.type = "button";
  actions.appendChild(start);
  actions.appendChild(invite);
  screen.appendChild(actions);

  const form = el(doc, "form", null, FIRST_RUN_CLASSES.inviteForm);
  form.hidden = true;
  const input = el(doc, "input");
  input.type = "text";
  input.name = "invite";
  input.autocomplete = "off";
  input.placeholder = FIRST_RUN_COPY.invitePlaceholder;
  const go = el(doc, "button", FIRST_RUN_COPY.inviteGo, "primary");
  go.type = "submit";
  const err = el(doc, "p", null, FIRST_RUN_CLASSES.error);
  err.hidden = true;
  form.appendChild(input);
  form.appendChild(go);
  form.appendChild(err);
  form.addEventListener("submit", (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    const hash = extractInviteHash(input.value);
    if (!hash) {
      err.textContent = FIRST_RUN_COPY.inviteError;
      err.hidden = false;
      return;
    }
    err.hidden = true;
    call("onOpenInvite", hash);
  });
  invite.addEventListener("click", () => {
    form.hidden = false;
    if (typeof input.focus === "function") input.focus();
  });
  screen.appendChild(form);

  const demo = el(doc, "button", FIRST_RUN_COPY.seeDemo, FIRST_RUN_CLASSES.demoLink);
  demo.type = "button";
  demo.addEventListener("click", () => call("onSeeDemo"));
  screen.appendChild(demo);
  rootEl.appendChild(screen);
}

/**
 * mountStickyCta(rootEl, ctx) — V67 sticky bottom "Start a ring" button for
 * ringless users. Idempotent: re-mounting replaces. Returns the element, or
 * null when it should not show (and clears any previous one).
 * ctx: { campaigns, demoFlag, onStartRing() }
 */
export function mountStickyCta(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  rootEl.textContent = "";
  if (!shouldShowRinglessCta(ctx)) return null;
  const btn = el(doc, "button", FIRST_RUN_COPY.startRing, FIRST_RUN_CLASSES.sticky);
  btn.type = "button";
  btn.addEventListener("click", () => {
    if (typeof ctx.onStartRing === "function") ctx.onStartRing();
  });
  rootEl.appendChild(btn);
  return btn;
}
