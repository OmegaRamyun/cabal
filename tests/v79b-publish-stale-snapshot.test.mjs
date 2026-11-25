// V79b — Publish/Fetch from a stale sync-panel snapshot.
// Repro (V79 live verifier, cabal-bench/ship-verdict-log-v79.md §5): the
// sync panel mounted, then a post/assist was added via the composer, then
// "Publish my ring" was tapped WITHOUT a reload. The old code published
// the mount-time campaign object (no kind 78 for the new post) and then
// merged the stamped stale copy back by id, wiping the new post locally
// (post count 1 -> 0). The fix: handlers re-read the store fresh at click
// time, the stamp is applied to the freshest copy, and content added
// mid-publish gets a re-publish pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as N from "../src/nostr.mjs";
import { mergeSyncedIntoStore } from "../src/sync-target.mjs";

const T = "2026-11-25T10:00:00.000Z";
const memStore = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};

// --- Minimal fake DOM: enough for nostr.mount() (createElement/append/
// replaceChildren/addEventListener/setAttribute). String children become
// text nodes, as in the real DOM. No jsdom, no deps. ---
class FakeEl {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parent = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this._text = "";
    this.value = "";
    this.className = "";
  }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join("");
    return this._text;
  }
  set textContent(v) {
    this.children = [];
    this._text = String(v ?? "");
  }
  append(...kids) {
    for (const k of kids) {
      const node = typeof k === "string"
        ? Object.assign(new FakeEl("#text", this.ownerDocument), { _text: k })
        : k;
      node.parent = this;
      this.children.push(node);
    }
    return this;
  }
  appendChild(k) {
    return this.append(k);
  }
  replaceChildren(...kids) {
    this.children = [];
    return this.append(...kids);
  }
  remove() {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return k in this.attributes ? this.attributes[k] : null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  async click() {
    for (const fn of this.listeners.click ?? []) await fn({ type: "click", target: this });
  }
  find(pred) {
    if (pred(this)) return this;
    for (const c of this.children) {
      const hit = c.find(pred);
      if (hit) return hit;
    }
    return null;
  }
}

class FakeDoc {
  createElement(tag) {
    return new FakeEl(tag, this);
  }
}

function fakeRoot() {
  const doc = new FakeDoc();
  const root = new FakeEl("div", doc);
  root.ownerDocument = doc;
  return root;
}

const findButton = (root, label) =>
  root.find((n) => n.tagName === "BUTTON" && n.textContent.includes(label));

function mkCampaign(over = {}) {
  const { key } = N.generateCampaignKey();
  return {
    id: "cmp_v79b0001",
    title: "V79b Ring",
    game: "Test Game",
    key,
    members: [{ handle: "@alice" }, { handle: "@bob" }],
    posts: [{
      id: "pst_aaaa0001", author: "@alice", platform: "x",
      url: "https://x.com/alice/status/1", text: "seed post", createdAt: T, assists: [],
    }],
    createdAt: T,
    ...over,
  };
}

const newPost = (id, author) => ({
  id, author, platform: "x", url: `https://x.com/${author.slice(1)}/status/2`,
  text: `post ${id}`, createdAt: T, assists: [],
});

/**
 * Mount the panel the way app.js wires it: ctx.campaign is the object
 * resolved at route time (a snapshot that never updates), getCampaigns()
 * re-reads the live store (fresh objects, like store.campaigns' getter),
 * and onMerged merges by id into the store. `storeList` is the live store;
 * the composer "adds" content by replacing the stored campaign object,
 * exactly as saveCampaigns does in the browser.
 */
function mountPanel({ me, client, initial }) {
  let storeList = [structuredClone(initial)];
  // The route-time snapshot: frozen at mount, like app.js's `campaign`.
  const mountSnapshot = structuredClone(initial);
  const original = structuredClone(initial);
  const storage = memStore();
  N.useDefaultRelays(storage);
  const root = fakeRoot();
  N.mount(root, {
    storage,
    client,
    campaign: mountSnapshot,
    getCampaigns: () => structuredClone(storeList),
    me,
    onMerged: (list) => { storeList = mergeSyncedIntoStore(storeList, list, original); },
  });
  return {
    root,
    store: () => storeList,
    addToStore: (mutate) => {
      const next = structuredClone(storeList[0]);
      mutate(next);
      storeList = [next];
    },
  };
}

function recordingClient({ fetchEvents = [] } = {}) {
  const published = [];
  return {
    published,
    publish: async (ev) => {
      published.push(ev);
      return { "wss://nos.lol": { ok: true, message: "" } };
    },
    fetch: async () => [...fetchEvents],
  };
}

const kinds = (events) => events.map((e) => e.kind);
const postEventFor = (events, postId) =>
  events.find((e) => e.kind === N.KIND_APP_RECORD && N.decodeEvent(e)?.postId === postId);

// ---- Publish: post added after mount -------------------------------------
test("V79b publish: post added after mount is published (kind 78) and survives locally", async () => {
  const client = recordingClient();
  const panel = mountPanel({ me: { handle: "@alice" }, client, initial: mkCampaign() });
  // Composer adds a post AFTER the panel mounted; the store holds it, the
  // mount-time snapshot does not.
  panel.addToStore((c) => c.posts.push(newPost("pst_bbbb0002", "@alice")));

  await findButton(panel.root, "Publish my ring").click();

  assert.ok(postEventFor(client.published, "pst_bbbb0002"), "kind 78 event for the just-added post must be sent");
  assert.equal(N.decodeEvent(postEventFor(client.published, "pst_bbbb0002")).type, "post");
  const stored = panel.store()[0];
  assert.ok(stored.posts.some((p) => p.id === "pst_bbbb0002"), "just-added post must survive publish locally (was wiped to 0 by the stale stamp)");
  assert.equal(stored.posts.length, 2);
  assert.ok(Number.isInteger(stored.nostr?.createdAt), "publish still stamps");
  const doc = JSON.parse(client.published.find((e) => e.kind === N.KIND_CAMPAIGN).content);
  assert.ok(doc.posts.some((p) => p.id === "pst_bbbb0002"), "campaign doc on the relay carries the new post too");
  assert.deepEqual(kinds(client.published), [30078, 78, 78]);
});

test("V79b publish: assist added after mount is published (kind 78) and survives locally", async () => {
  const client = recordingClient();
  const panel = mountPanel({ me: { handle: "@bob" }, client, initial: mkCampaign() });
  panel.addToStore((c) => c.posts[0].assists.push({ handle: "@bob", status: "contributed", contributedAt: T, note: "Shared it." }));

  await findButton(panel.root, "Publish my ring").click();

  const ev = postEventFor(client.published, "pst_aaaa0001");
  assert.ok(ev, "kind 78 event for the just-added assist must be sent");
  assert.equal(N.decodeEvent(ev).type, "assist");
  assert.equal(N.decodeEvent(ev).data.handle, "@bob");
  const stored = panel.store()[0];
  assert.equal(stored.posts[0].assists.length, 1, "just-added assist must survive publish locally");
  assert.equal(stored.posts[0].assists[0].handle, "@bob");
});

test("V79b publish: post added mid-publish gets a re-publish pass instead of being dropped", async () => {
  const client = recordingClient();
  // The relay accepts the campaign event first; while the publish awaits,
  // the composer saves a new post to the store.
  let midAdded = false;
  const origPublish = client.publish;
  client.publish = async (ev) => {
    const r = await origPublish(ev);
    if (ev.kind === N.KIND_CAMPAIGN && !midAdded) {
      midAdded = true;
      panel.addToStore((c) => c.posts.push(newPost("pst_mid00001", "@alice")));
    }
    return r;
  };
  const panel = mountPanel({ me: { handle: "@alice" }, client, initial: mkCampaign() });

  await findButton(panel.root, "Publish my ring").click();

  assert.ok(midAdded, "harness must have added the post mid-publish");
  assert.ok(postEventFor(client.published, "pst_mid00001"), "mid-publish post must be sent by the re-publish pass");
  assert.equal(client.published.filter((e) => e.kind === N.KIND_CAMPAIGN).length, 2, "second pass republishes the campaign doc");
  const stored = panel.store()[0];
  assert.ok(stored.posts.some((p) => p.id === "pst_mid00001"), "mid-publish post must survive locally");
  assert.ok(Number.isInteger(stored.nostr?.createdAt), "publish still stamps");
});

// ---- Fetch: post added after mount ---------------------------------------
test("V79b fetch: post added after mount survives a fetch+merge (and a remote post merges in)", async () => {
  const initial = mkCampaign();
  // Remote ring state: same ring, one extra post from @carol, newer doc.
  const remote = structuredClone(initial);
  remote.posts.push(newPost("pst_cccc0003", "@carol"));
  const remoteEv = await N.signEvent(N.campaignEvent(remote, { createdAt: 2000 }), initial.key);
  const client = recordingClient({ fetchEvents: [remoteEv] });
  const panel = mountPanel({ me: { handle: "@alice" }, client, initial });
  panel.addToStore((c) => c.posts.push(newPost("pst_bbbb0002", "@alice")));

  await findButton(panel.root, "Fetch updates").click();

  const stored = panel.store()[0];
  assert.ok(stored.posts.some((p) => p.id === "pst_bbbb0002"), "local post added after mount must survive fetch+merge");
  assert.ok(stored.posts.some((p) => p.id === "pst_cccc0003"), "remote post must merge in");
  assert.equal(stored.posts.length, 3);
});

// ---- hasNewCoveredContent (the re-publish trigger) ------------------------
test("V79b hasNewCoveredContent: new covered post/assist triggers, anything else does not", () => {
  const base = mkCampaign();
  const withPost = structuredClone(base);
  withPost.posts.push(newPost("pst_bbbb0002", "@alice"));
  assert.equal(N.hasNewCoveredContent(withPost, base, "@alice"), true);
  assert.equal(N.hasNewCoveredContent(withPost, base, "@bob"), false, "other handle's publish does not cover @alice's post");
  assert.equal(N.hasNewCoveredContent(withPost, base, undefined), true, "no handle filter covers every post");
  assert.equal(N.hasNewCoveredContent(base, base, "@alice"), false);
  assert.equal(N.hasNewCoveredContent(base, withPost, "@alice"), false, "a removed post is not new content");

  const withAssist = structuredClone(base);
  withAssist.posts[0].assists.push({ handle: "@bob", status: "contributed", contributedAt: T });
  assert.equal(N.hasNewCoveredContent(withAssist, base, "@bob"), true);
  assert.equal(N.hasNewCoveredContent(withAssist, base, "@alice"), false);
  assert.equal(N.hasNewCoveredContent(withAssist, base, undefined), true);
});
