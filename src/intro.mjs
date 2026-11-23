// V33 — Intro pages: what Cabal is, how a campaign works, the theory.
// Pure data + helpers; mount() renders one page with textContent/classNames
// only. No network, no storage writes. Theme lives in style.css (coordinator).

export const INTRO_PAGES = [
  {
    id: "intro",
    route: "#/intro",
    title: "What Cabal is",
    lede: "A small, quiet pact between developers. You light your game. Others carry the flame, and keep carrying it.",
    sections: [
      {
        heading: "A ring that keeps going",
        paragraphs: [
          "Cabal is mutual aid for indie developers. You gather a ring of other devs, and as each of you makes news, the ring amplifies it. Not once: again and again, as everyone's game moves forward. Each person does it in their own voice.",
          "The founding post is the start of a ring, not the whole campaign. Posts keep arriving, and the ring keeps assisting them.",
        ],
      },
      {
        heading: "Your game stands at the center",
        paragraphs: [
          "No game, no ring. A ring is always about a game you made, and what gets amplified is always a ringmate's own post about their work. It is never a target, never a person, never a pile-on.",
        ],
      },
      {
        heading: "The link is the invite",
        paragraphs: [
          "A ring can be shared as a link. Whoever holds the link can open it and join. Keep it in a DM and the ring stays closed. Drop it where devs gather and the ring can grow. There is no approval queue and no gatekeeper.",
          "The campaign page shows the ring as a feed: who is in, the posts they have added, and the receipts of who assisted each one.",
        ],
      },
      {
        heading: "No accounts, no password",
        paragraphs: [
          "You are anonymous. There are no accounts. Your game and your campaigns live in your own browser. Cabal never posts for you, and it never holds a password or a platform token.",
        ],
      },
      {
        heading: "Rings and Campaigns",
        paragraphs: [
          "Three clear pieces. Your Rings are your dev groups who boost each other over time. Templates are reusable post formats any ring can pick up and run in its own words. The Network is the live map of rings and templates.",
        ],
      },
      {
        heading: "What it does today, plainly",
        paragraphs: [
          "Today Cabal helps you start a ring, add posts from any platform, assist a ringmate's post, and leave a receipt of what you did. How a ring stays current across people is covered on the theory page, including what is public and what is not.",
        ],
      },
    ],
  },
  {
    id: "how",
    route: "#/intro/how",
    title: "How a campaign works",
    lede: "A rhythm, not a deadline. None of it posts on your behalf.",
    sections: [
      {
        heading: "1. Start or join a ring",
        paragraphs: [
          "Tell Cabal about your game: its name and its store page. Start a ring around it, or open a ring's link and join with one tap. No sign-up.",
        ],
      },
      {
        heading: "2. Add posts as you make them",
        paragraphs: [
          "Made something worth showing? Add the post to the ring, from any platform: a URL and a label. Cabal can guess the platform, the author, or a title from the link. You can always fill in or fix the bits by hand, and a link it does not recognise just means you type them yourself.",
        ],
      },
      {
        heading: "3. Assist your ringmates' new posts",
        paragraphs: [
          "When a ringmate adds a post, give it a hand. On X, the composer opens with their post attached, you write your own words, and Cabal warns you if your draft sits too close to someone else's. It never blocks you. Everywhere else, you share the post on in your own way and mark it contributed.",
          "Then leave an Enscryption: one line, in your own words, saying what you did. \"Liked. Retweeted. Commented. Shared to #Ring.\" These receipts are the comments under each post. They are the record, not a score. Nobody counts them.",
        ],
      },
      {
        heading: "4. Pass it on",
        paragraphs: [
          "A ringmate's post travels further when a real reader shares it. If one speaks to you, share its link onward: drop it in your own #Ring channel, your Discord or community channel where your people actually are, or wherever else your community gathers, with a line of your own.",
          "Only what you genuinely like; no one counts it, and no one owes it.",
        ],
      },
      {
        heading: "5. Keep the ring warm",
        paragraphs: [
          "The rhythm repeats. There is no window and no deadline. A quiet ring is a resting ring, not a dead one: the next post picks it back up.",
        ],
      },
      {
        heading: "Finding other rings",
        paragraphs: [
          "A ring can appear in discovery if it attaches a real game page and has at least two developers in it. The ring is the proof. A ring with no real members stays invisible.",
        ],
      },
    ],
  },
  {
    id: "theory",
    route: "#/intro/theory",
    title: "The theory",
    lede: "Same campaign, different post. Over and over.",
    sections: [
      {
        heading: "Sustained mutual aid: the ring compounds",
        paragraphs: [
          "A single burst fades. A ring that keeps assisting each other's posts as they come builds up: more people have seen your game, more of them have seen it twice, and the next post lands on warmer ground. The aid is repeated, and each round stands on the last.",
        ],
      },
      {
        heading: "Same campaign, different post",
        paragraphs: [
          "The campaign is the ring and the game at its center. The posts are what the ring assists, one at a time. Every assist is per post: a ringmate helping with one post has not helped with the next, and nobody has to pretend they did.",
        ],
      },
      {
        heading: "Own words, never copy-paste",
        paragraphs: [
          "Platforms look for clusters of identical or near-identical posts, and they label them as copy-paste spam. X's rules ban repeatedly posting identical or nearly identical posts in a duplicative manner, and a labeled cluster can be dropped from feeds entirely. Changing three words does not fix it. Writing your own post does.",
        ],
      },
      {
        heading: "Two tiers, in plain language",
        paragraphs: [
          "A ring post can come from any platform: Reddit, Instagram, anywhere. For those, Cabal keeps it simple: a link, a label, and you mark that you contributed. Nothing is checked, and nothing is wired into the other app. On X, Cabal goes further: a quote-post composer with the original attached and the similarity check on your draft. Same ring, two levels of help.",
        ],
      },
      {
        heading: "A human taps Post",
        paragraphs: [
          "Every post is written by a person and sent by a person, in the platform's own composer. Cabal does not auto-post, auto-like, auto-follow, or auto-comment. There are no quotas and no scores for posting.",
        ],
      },
      {
        heading: "Pass it on: the core loop",
        paragraphs: [
          "Once a ringmate has posted, their post is its own thing, and it can travel on its own. When a reader copies a post's link and shares it onward, that carries real weight: a human chose to pass it on, not a button.",
          "So open your ringmates' posts. If one speaks to you, share its link in your own #Ring channel or wherever your people gather, in your own words. That is the heart of the ring: the founding post starts it, and every post passed on by a real reader carries it further. Only ever what you genuinely like. No one counts shares, and no one owes any.",
        ],
      },
      {
        heading: "Open-ended by design",
        paragraphs: [
          "A ring has no window and no deadline. A deadline turns help into a chore and a burst into a tell. Without one, people assist when they can, spread across days and weeks, which is how friends actually notice a game. A ring that goes quiet is resting, and any new post wakes it.",
        ],
      },
      {
        heading: "Amplify an announcement, never a target",
        paragraphs: [
          "What the ring lifts is always a dev's own post about their own work. The same mechanics could be used against a person, and that is exactly what Cabal is not for. If it would feel like an attack to the one on the receiving end, do not do it.",
        ],
      },
      {
        heading: "Say it is a ring",
        paragraphs: [
          "Disclose the relationship. A short line such as \"posting with my dev ring\" is enough. Honest disclosure is the difference between friends helping friends and a manufactured crowd. In the United States, undisclosed material connections can draw FTC penalties of up to $53,088 per violation.",
        ],
      },
      {
        heading: "Why a quote-post and not a plain repost",
        paragraphs: [
          "On X, a plain repost is one signal, and a stack of them tends to collapse into a single feed candidate. A quote-post carries your own words, so it reaches your followers as something you said. A bare \"Big news!\" does not count: add something real.",
        ],
      },
      {
        heading: "How the ring stays in sync, and what is public",
        paragraphs: [
          "A ring syncs through public relays: open servers that hold the ring's posts and receipts so every member's copy can catch up. A link is the offline fallback. It carries a snapshot of the ring for someone with no relay access, and it can add a ring you do not have yet.",
          "The privacy reality, plainly: anything on a public relay is public. Campaign content is public by design, and discovery is public anyway. Never put anything private in a post or a receipt. A relay post cannot be reliably deleted, so do not treat it as private, direct, or taken back.",
        ],
      },
      {
        heading: "Anchored in known numbers",
        paragraphs: [
          "Kickstarter reports that 32% of pre-launch followers pledge once live, vs 17% post-launch. Warming people up before the push is worth the effort.",
        ],
      },
    ],
  },
];

export function introPageIds() {
  return INTRO_PAGES.map((p) => p.id);
}

export function getIntroPage(id) {
  return INTRO_PAGES.find((p) => p.id === id) || null;
}

// Map a hash route ("#/intro", "#/intro/how") to a page id, or null.
// Trailing slashes are normalized ("#/intro/" is "#/intro").
export function introPageIdForRoute(route) {
  const normalized = String(route ?? "").replace(/\/+$/, "");
  const hit = INTRO_PAGES.find((p) => p.route === normalized);
  return hit ? hit.id : null;
}

// ---- DOM (mount only) ----
function el(doc, tag, text, cls) {
  const n = doc.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

/**
 * mount(rootEl, pageId) — renders one intro page. Unknown ids fall back to
 * the first page. textContent only; no storage, no network.
 */
export function mount(rootEl, pageId) {
  const doc = rootEl.ownerDocument;
  const page = getIntroPage(pageId) || INTRO_PAGES[0];
  rootEl.textContent = "";
  const article = el(doc, "article", null, `cabal-intro intro-${page.id}`);
  article.appendChild(el(doc, "h2", page.title, "intro-title"));
  article.appendChild(el(doc, "div", null, "intro-ember-rule"));
  article.appendChild(el(doc, "p", page.lede, "intro-lede"));
  for (const s of page.sections) {
    const sec = el(doc, "section", null, "intro-section");
    sec.appendChild(el(doc, "h3", s.heading, "intro-heading"));
    for (const p of s.paragraphs) sec.appendChild(el(doc, "p", p, "intro-text"));
    article.appendChild(sec);
  }
  const nav = el(doc, "nav", null, "intro-nav");
  nav.setAttribute("aria-label", "Intro pages");
  for (const p of INTRO_PAGES) {
    const a = el(doc, "a", p.title, p.id === page.id ? "intro-link intro-current" : "intro-link");
    a.setAttribute("href", p.route);
    if (p.id === page.id) a.setAttribute("aria-current", "page");
    nav.appendChild(a);
  }
  article.appendChild(nav);
  rootEl.appendChild(article);
}
