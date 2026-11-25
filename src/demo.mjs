// V25 — Demo mode: fictional example data. V61: opt-in only (optInDemo);
// seedDemo remains as the low-level seeder but the shell must not call it
// on cold load.
// All demo content is invented. No real games, no real people, no real handles.
// Store keys match V21 (cabal.v2.*). Reads/writes localStorage directly with
// try/catch; V21's store module replaces these reads at integration.
// seedDemo/clearDemo take a storage-like object (getItem/setItem/removeItem,
// e.g. localStorage or V21's createMemoryStore); when omitted, localStorage
// is used when available.

import { normalizeCampaign } from "./campaign.mjs";

export const DEMO_BADGE = "Demo";

export const DEMO_GAME_NAME = "Starlight Salvage";

const DAY_MS = 86400000;

function isoAt(base, days) {
  return new Date(base.getTime() + days * DAY_MS).toISOString();
}

function storage(store) {
  if (store && typeof store.getItem === "function") return store;
  try {
    if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage;
  } catch {
    // No storage available (e.g. private mode); fall through to a no-op store.
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

function read(store, key) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(store, key, value) {
  try {
    store.setItem(key, value);
  } catch {
    // Storage unavailable; demo seeding is best-effort.
  }
}

function remove(store, key) {
  try {
    store.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function demoGame() {
  return {
    name: DEMO_GAME_NAME,
    links: { itch: "https://starlight-salvage.itch.io/starlight-salvage" },
    tags: ["roguelite", "cozy", "space"],
  };
}

function member(name, handle, status, quoteUrl, extra) {
  const m = { name, handle, status };
  if (quoteUrl) m.quoteUrl = quoteUrl;
  if (extra && typeof extra === "object") Object.assign(m, extra);
  return m;
}

function hoursAgo(base, hours) {
  return new Date(base.getTime() - hours * 3600 * 1000).toISOString();
}

// Built in the legacy anchor-only shape (member state inline), then migrated
// to the v2 sustained-ring shape by normalizeCampaign: the anchor becomes
// posts[0] and each "posted" member becomes an assist on it. Windows pass
// through for decode compatibility; the UI never surfaces them as ring state.
function campaign(id, title, anchorPost, window, members, createdAt, extraPosts = [], formatId = null) {
  const v2 = normalizeCampaign({
    id,
    game: demoGame(),
    title,
    anchorPost,
    window,
    members,
    createdAt,
    demo: true,
    // V53: demo rings run formats so the node view shows template nodes
    // with real `runs` edges. A ring's formatId is the format its
    // campaign uses — the launch push states its game flatly
    // (fmt_algoigno), the same shape as the format's joke.
    ...(formatId ? { formatId } : {}),
  });
  v2.posts.push(...extraPosts);
  return v2;
}

/**
 * demoCampaigns(now?) — exactly 3 fictional campaigns for Starlight Salvage,
 * all in the v2 sustained-ring shape (posts + assists; the Next Fest ring has
 * a second post on Reddit so the demo shows a multi-post ring).
 * `now` defaults to the current time; pass a fixed Date in tests so the
 * live/upcoming windows are deterministic.
 *  1. LIVE "Launch week push" — window covers now, 4 members, 2 posted.
 *     Runs fmt_algoigno (the launch announcement states the game flatly).
 *  2. UPCOMING "Demo day push" — window starts tomorrow, 3 members, 0 posted.
 *  3. POPULAR "Steam Next Fest push" — 6 members, 5 posted.
 */
export function demoCampaigns(now = new Date()) {
  const base = now instanceof Date ? now : new Date(now);
  return [
    campaign(
      "cmp_demo_launch",
      "Launch week push",
      {
        platform: "x",
        url: "https://x.com/wrenmakesgames/status/1000000000000000001",
        text: "Starlight Salvage is out now! I spent two years hauling scrap in a cozy little ship, and today it is yours.",
        author: "Wren",
      },
      { start: isoAt(base, -3), end: isoAt(base, 4) },
      [
        member("Moss", "@mossplays", "posted", "https://x.com/mossplays/status/1000000000000000002", {
          postedAt: hoursAgo(base, 2),
          quoteText: "The salvage runs in this one are so cozy I forgot I was supposed to be working.",
        }),
        member("Pip", "@pipdraws", "posted", "https://x.com/pipdraws/status/1000000000000000003", {
          postedAt: hoursAgo(base, 5),
          quoteText: "Played the demo twice today. The magnet upgrade is a joy.",
        }),
        member("June", "@junebakes", "pending"),
        member("Rook", "@rookdev", "pending"),
      ],
      hoursAgo(base, 72),
      [],
      'fmt_algoigno',
    ),
    campaign(
      "cmp_demo_demoday",
      "Demo day push",
      {
        platform: "x",
        url: "https://x.com/wrenmakesgames/status/1000000000000000004",
        text: "Tomorrow we show off the new salvage run at demo day. Come watch me lose a haul to a very rude asteroid.",
        author: "Wren",
      },
      { start: isoAt(base, 1), end: isoAt(base, 8) },
      [
        member("Sable", "@sablepixels", "pending"),
        member("Fern", "@fernfolk", "pending"),
        member("Rook", "@rookdev", "pending"),
      ],
      hoursAgo(base, 6),
    ),
    campaign(
      "cmp_demo_nextfest",
      "Steam Next Fest push",
      {
        platform: "x",
        url: "https://x.com/wrenmakesgames/status/1000000000000000005",
        text: "Starlight Salvage is in Steam Next Fest! The demo is live all week. Bring a friend, bring a magnet.",
        author: "Wren",
      },
      { start: isoAt(base, -2), end: isoAt(base, 5) },
      [
        member("Moss", "@mossplays", "posted", "https://x.com/mossplays/status/1000000000000000006", {
          postedAt: hoursAgo(base, 26),
          quoteText: "Starlight Salvage is in Next Fest and the demo is genuinely great, go play it.",
        }),
        member("Pip", "@pipdraws", "posted", "https://x.com/pipdraws/status/1000000000000000007", {
          postedAt: hoursAgo(base, 8),
          quoteText: "The cozy space game you have been waiting for. The demo is live all week.",
        }),
        member("June", "@junebakes", "posted", "https://x.com/junebakes/status/1000000000000000008", {
          postedAt: hoursAgo(base, 5),
          quoteText: "I keep coming back to the salvage runs. The ship feels like home.",
        }),
        member("Rook", "@rookdev", "posted", "https://x.com/rookdev/status/1000000000000000009", {
          postedAt: hoursAgo(base, 3),
          quoteText: "Fest demo is up. Bring a friend, bring a magnet.",
        }),
        member("Sable", "@sablepixels", "posted", "https://x.com/sablepixels/status/1000000000000000010", {
          postedAt: hoursAgo(base, 2),
          quoteText: "This demo understands cozy. Played it twice and I am going back.",
        }),
        member("Fern", "@fernfolk", "pending"),
      ],
      hoursAgo(base, 48),
      [
        {
          id: "pst_demofest",
          author: "Wren",
          platform: "reddit",
          url: "https://www.reddit.com/r/IndieGaming/comments/1demo001/starlight_salvage_next_fest_devlog/",
          text: "Next Fest devlog: what we cut from the demo and why the magnet stayed.",
          kind: "devlog",
          createdAt: hoursAgo(base, 10),
          assists: [
            {
              handle: "@pipdraws",
              status: "contributed",
              contributedAt: hoursAgo(base, 6),
              url: "https://x.com/pipdraws/status/1000000000000000011",
              note: "Upvoted. Shared it to #Ring.",
            },
          ],
        },
      ],
    ),
  ];
}

export function demoBadge(campaign) {
  return campaign && campaign.demo ? DEMO_BADGE : "";
}

/**
 * seedDemo(store?, now?) — first load only. Writes the demo game and the
 * demo campaigns and sets the demo flag to 'on', but only when no
 * cabal.v2.demo key exists yet. "Me" is deliberately left untouched:
 * no fictional "you" is ever set. Returns true when it seeded, false
 * when the flag already existed (real data in place, or already seeded).
 */
export function seedDemo(store, now) {
  const s = storage(store);
  if (read(s, "cabal.v2.demo") != null) return false;
  write(s, "cabal.v2.game", JSON.stringify(demoGame()));
  write(s, "cabal.v2.campaigns", JSON.stringify(demoCampaigns(now)));
  write(s, "cabal.v2.demo", "on");
  return true;
}

/**
 * optInDemo(store?, now?) — V61: the ONLY path the shell uses to load demo
 * data. Called when the user taps "See a demo ring" on the first-run screen;
 * never on cold load. Unlike seedDemo it also works after a previous
 * "Clear demo data" (flag 'off'), and it refuses to overwrite real rings:
 * returns false if the demo is already on or any non-demo campaign exists.
 */
export function optInDemo(store, now) {
  const s = storage(store);
  if (read(s, "cabal.v2.demo") === "on") return false;
  try {
    const raw = read(s, "cabal.v2.campaigns");
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list) && list.some((c) => c && !c.demo)) return false;
  } catch {
    return false; // corrupt campaigns JSON: never overwrite
  }
  write(s, "cabal.v2.game", JSON.stringify(demoGame()));
  write(s, "cabal.v2.campaigns", JSON.stringify(demoCampaigns(now)));
  write(s, "cabal.v2.demo", "on");
  return true;
}

/**
 * clearDemo(store?) — removes every demo:true campaign and the demo game,
 * sets the demo flag to 'off'. Real (non-demo) campaigns and a real game
 * are left alone. Returns { removedCampaigns, removedGame }.
 */
export function clearDemo(store) {
  const s = storage(store);
  let removedCampaigns = 0;
  let removedGame = false;
  try {
    const raw = read(s, "cabal.v2.campaigns");
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      const kept = list.filter((c) => !c || !c.demo);
      removedCampaigns = list.length - kept.length;
      write(s, "cabal.v2.campaigns", JSON.stringify(kept));
    }
  } catch {
    // Corrupt campaigns JSON: leave it alone rather than wiping data.
  }
  try {
    const rawGame = read(s, "cabal.v2.game");
    if (rawGame) {
      const game = JSON.parse(rawGame);
      if (game && game.name === DEMO_GAME_NAME) {
        remove(s, "cabal.v2.game");
        removedGame = true;
      }
    }
  } catch {
    // Corrupt game JSON: leave it alone.
  }
  write(s, "cabal.v2.demo", "off");
  return { removedCampaigns, removedGame };
}

// ---- DOM (mount only) ----
function el(doc, tag, text, cls) {
  const n = doc.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

/**
 * mount(rootEl, ctx?) — renders the demo banner. ctx.onClear is called by
 * "Clear demo data", ctx.onStartFresh by "Start with my own game".
 * Both callbacks are optional; a missing one leaves its button inert.
 */
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  rootEl.textContent = "";
  const banner = el(doc, "div", null, "cabal-demo-banner");
  banner.appendChild(el(doc, "strong", "Demo mode"));
  banner.appendChild(
    el(doc, "span", " — fictional example data. None of this is real: the game, the people, and the posts are made up so you can see how Cabal works."),
  );
  const clearBtn = el(doc, "button", "Clear demo data");
  clearBtn.type = "button";
  clearBtn.addEventListener("click", () => {
    if (typeof ctx.onClear === "function") ctx.onClear();
  });
  const freshBtn = el(doc, "button", "Start with my own game");
  freshBtn.type = "button";
  freshBtn.addEventListener("click", () => {
    if (typeof ctx.onStartFresh === "function") ctx.onStartFresh();
  });
  banner.appendChild(clearBtn);
  banner.appendChild(freshBtn);
  rootEl.appendChild(banner);
}
