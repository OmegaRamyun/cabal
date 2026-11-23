// V33 — Intro pages: what Cabal is, how a campaign works, the theory.
// Pure data + helpers; mount() renders one page with textContent/classNames
// only. No network, no storage writes. Theme lives in style.css (coordinator).

export const INTRO_PAGES = [
  {
    id: "intro",
    route: "#/intro",
    title: "What Cabal is",
    lede: "A small, quiet pact between developers. You light your game. Others carry the flame.",
    sections: [
      {
        heading: "A ring for indie games",
        paragraphs: [
          "Cabal is mutual aid for indie developers. You gather a ring of other devs, and when one of you has news, the ring amplifies it. Each person does it in their own voice.",
          "It is built around one thing: your game. Everything else in the app serves a push for that game.",
        ],
      },
      {
        heading: "Your game stands at the center",
        paragraphs: [
          "No game, no campaign. A campaign is always about a game you made, and what gets amplified is always your own announcement. It is never a target, never a person, never a pile-on.",
        ],
      },
      {
        heading: "The link is the invite",
        paragraphs: [
          "A campaign is a link. Whoever holds the link can open it and join. Keep it in a DM and the ring stays closed. Drop it where devs gather and the ring can grow. There is no approval queue and no gatekeeper.",
          "The campaign page shows the whole ring: who is in, and who has posted.",
        ],
      },
      {
        heading: "No accounts, no server",
        paragraphs: [
          "You are anonymous. There are no accounts and no backend. Your game and your campaigns live in your own browser. Cabal never posts for you, and it never holds a password or a token.",
        ],
      },
      {
        heading: "What it does today, plainly",
        paragraphs: [
          "Today Cabal helps you make a campaign, share its link, write your own quote-post with a similarity check, and see who has posted. Because there is no server, there is no live updating. A link carries the campaign as it was when it was copied. Opening a link adds a campaign you do not have yet; if you already have it, the link does not update your copy. The ring is only as current as the newest link each person opened. That is a real limit, and it is not hidden here.",
        ],
      },
    ],
  },
  {
    id: "how",
    route: "#/intro/how",
    title: "How a campaign works",
    lede: "Six steps. None of them post on your behalf.",
    sections: [
      {
        heading: "1. Make a campaign",
        paragraphs: [
          "Tell Cabal about your game: its name and its store page. Then start a campaign around the one post you want amplified.",
        ],
      },
      {
        heading: "2. Share its link",
        paragraphs: [
          "The campaign is a link that carries the campaign with it. Send it to the devs you want in your ring, in a DM, a Discord, or a board you already use.",
        ],
      },
      {
        heading: "3. People join from the link",
        paragraphs: [
          "Opening the link shows the game, the post to amplify, and the whole ring. A visitor can join with one tap. No sign-up.",
        ],
      },
      {
        heading: "4. Everyone writes their own quote-post",
        paragraphs: [
          "The composer opens with the original post attached. You write your own words and tap Post in the platform's own composer. Cabal warns you if your draft is too close to someone else's. It never blocks you.",
        ],
      },
      {
        heading: "5. The page shows who has posted",
        paragraphs: [
          "Once you have posted, you add your quote-post link, and you are marked as posted on the ring.",
        ],
      },
      {
        heading: "6. Pass it on",
        paragraphs: [
          "Open a ringmate's quote-post from the campaign page. If it speaks to you, share its link onward — drop it in your own #Ring channel, your Discord or community channel where your people actually are, or wherever else your community gathers, with a line of your own.",
          "A post passed on by a real reader travels further than the anchor alone. Only what you genuinely like; no one counts it, and no one owes it.",
        ],
      },
      {
        heading: "How the ring stays in sync",
        paragraphs: [
          "There is no server, so there is no live updating. A link carries the campaign as it was when it was copied. Opening a link adds a campaign you do not have yet — it does not update one you already have. Sharing your link again gives newcomers your copy as it stands, so a new member sees the latest roster and who has posted.",
          "That means the ring is only as current as the newest link each person opened. Merging an updated link into a campaign you already have is planned, not built yet.",
        ],
      },
      {
        heading: "Finding other rings",
        paragraphs: [
          "A campaign can appear in discovery if it attaches a real game page and has at least two developers in it. The ring is the proof. A campaign with no real members stays invisible.",
        ],
      },
    ],
  },
  {
    id: "theory",
    route: "#/intro/theory",
    title: "The theory",
    lede: "Same campaign, different post.",
    sections: [
      {
        heading: "Same campaign, different post",
        paragraphs: [
          "One shared brief: the facts, the link, the clip. Then every dev writes a post of their own. The campaign is the same. The posts are not.",
        ],
      },
      {
        heading: "Own words, never copy-paste",
        paragraphs: [
          "Platforms look for clusters of identical or near-identical posts, and they label them as copy-paste spam. X's rules ban repeatedly posting identical or nearly identical posts in a duplicative manner, and a labeled cluster can be dropped from feeds entirely. Changing three words does not fix it. Writing your own post does.",
        ],
      },
      {
        heading: "A human taps Post",
        paragraphs: [
          "Every post is written by a person and sent by a person, in the platform's own composer. Cabal does not auto-post, auto-like, auto-follow, or auto-comment. There are no quotas and no scores for posting.",
        ],
      },
      {
        heading: "Staggered, not a burst",
        paragraphs: [
          "People post when they can, spread across the window. A burst of posts in the same minute looks coordinated, and it is. A trickle looks like what it is: friends noticing a game.",
        ],
      },
      {
        heading: "Amplify an announcement, never a target",
        paragraphs: [
          "What the ring lifts is always the dev's own announcement. The same mechanics could be used against a person, and that is exactly what Cabal is not for. If it would feel like an attack to the one on the receiving end, do not do it.",
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
          "A plain repost is one signal, and a stack of them tends to collapse into a single feed candidate. A quote-post carries your own words, so it reaches your followers as something you said. A bare \"Big news!\" does not count: add something real.",
        ],
      },
      {
        heading: "Pass it on: the post travels further than the anchor",
        paragraphs: [
          "Once a ringmate has quote-posted, their post is its own thing — and it can travel on its own. When a reader copies a post's link and shares it onward, that carries real weight: a human chose to pass it on, not a button.",
          "So open your ringmates' quote-posts. If one speaks to you, share its link in your own #Ring channel or wherever your people gather, in your own words. That is the second half of the ring: the anchor starts it, the ringmates' posts carry it. Only ever what you genuinely like. No one counts shares, and no one owes any.",
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
