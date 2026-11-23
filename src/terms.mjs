// V25 — Disclaimers and terms, in plain language.
// A disclaimer states the terms. It is not a shield.

export const TERMS_TEXT = `Cabal is a tool for promoting your own games. It helps you organize a push with other developers: one post to amplify, everyone's own quote-post, and who has posted so far. That is all it does.

Cabal does not post for you. Nothing here sends a post, a like, a follow, a comment, or a message on your behalf. Posting happens only when a human taps Post in the platform's own app or site.

You are responsible for what you post. You are also responsible for following each platform's rules where you post. If a platform says no to something, that answer wins over anything Cabal suggests.

Coordinated promotion has to be honest. Write your own post, in your own words, as a human. Say when a post is part of a coordinated push. Do not copy and paste someone else's words and pretend they are yours, and do not present machine-written copy as if a person wrote it.

Do not use Cabal to harass, brigade, spam, or target anyone. It is for lifting up your own games, not for piling onto a person, a post, or a community. If what you are planning would feel like an attack to the person on the receiving end, do not do it with this tool.

Cabal is provided as-is, without warranty of any kind. It may have bugs, it may break, and it may not do what you hoped. Use it at your own risk.

The author is not responsible for how anyone uses Cabal. What you post, who you coordinate with, and what happens on each platform after you post is on you, not on the person who made this tool.

A disclaimer states the terms. It is not a shield. These words do not make misuse okay, and they do not protect anyone who misuses the tool.`;

// ---- DOM (mount only) ----
function el(doc, tag, text, cls) {
  const n = doc.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

/**
 * mount(rootEl) — renders the terms with a heading. One paragraph per
 * blank-line-separated block of TERMS_TEXT, textContent only.
 */
export function mount(rootEl) {
  const doc = rootEl.ownerDocument;
  rootEl.textContent = "";
  const section = el(doc, "section", null, "cabal-terms");
  section.appendChild(el(doc, "h2", "Terms and disclaimer"));
  for (const block of TERMS_TEXT.split(/\n\n+/)) {
    const text = block.trim();
    if (text) section.appendChild(el(doc, "p", text));
  }
  rootEl.appendChild(section);
}
