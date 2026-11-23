// V58 acceptance: multi-template rings model (formatId -> formatIds).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  formatIdsForRing,
  formatIdForRing,
  adoptTemplate,
  removeTemplate,
  ringsRunningFormat,
} from "../src/campaign-formats.mjs";
import { createCampaign, normalizeCampaign, validateCampaign } from "../src/campaign.mjs";
import { buildGraph } from "../src/graph.mjs";
import { countFormatUsage, usageLabel } from "../src/popularity.mjs";
import * as N from "../src/nostr.mjs";

const FMT_A = "fmt_algoigno";
const FMT_B = "fmt_oneclip1";
const FMT_C = "fmt_weekship";

const baseGame = {
  name: "Starlight Salvage",
  links: { itch: "https://example.itch.io/starlight" },
  tags: ["cozy"],
};
const baseAnchor = {
  platform: "x",
  url: "https://x.com/wren/status/1",
  text: "Our game is out now",
  author: "@wren",
};
const baseMembers = [
  { name: "Wren", handle: "@wren" },
  { name: "Moss", handle: "@moss" },
];

function mkRing(extra = {}) {
  return createCampaign({
    game: baseGame,
    title: "Test Ring",
    anchorPost: baseAnchor,
    window: null,
    members: baseMembers,
    key: N.generateCampaignKey().key,
    ...extra,
  });
}

describe("V58 formatIdsForRing & formatIdForRing", () => {
  test("normalizes, lowercases, trims, dedupes, preserves order, and drops invalid ids", () => {
    assert.deepEqual(
      formatIdsForRing({
        formatIds: [" FMT_ALGOIGNO ", "fmt_oneclip1", "fmt_algoigno", "bad", "", null, 42, "fmt_short", "fmt_toolong123"],
      }),
      [FMT_A, FMT_B],
    );
  });

  test("legacy formatId is placed first when combined with formatIds and deduped", () => {
    assert.deepEqual(
      formatIdsForRing({ formatId: " FMT_ALGOIGNO ", formatIds: [FMT_B, FMT_A, FMT_C] }),
      [FMT_A, FMT_B, FMT_C],
    );
    assert.deepEqual(formatIdsForRing({ formatId: FMT_A }), [FMT_A]);
    assert.deepEqual(formatIdsForRing({ formatId: "not_valid" }), []);
  });

  test("handles empty, missing, and non-object rings safely", () => {
    for (const bad of [null, undefined, 0, "ring", [], {}, { formatIds: "bad" }, { formatId: null }]) {
      assert.deepEqual(formatIdsForRing(bad), []);
      assert.equal(formatIdForRing(bad), null);
    }
  });

  test("formatIdForRing stays a legacy alias returning the first entry or null", () => {
    assert.equal(formatIdForRing({ formatIds: [FMT_B, FMT_A] }), FMT_B);
    assert.equal(formatIdForRing({ formatIds: [] }), null);
    assert.equal(formatIdForRing({ formatId: FMT_A }), FMT_A);
  });
});

describe("V58 adoptTemplate & removeTemplate", () => {
  test("adoptTemplate appends a valid id without mutating input; idempotent on repeat", () => {
    const r0 = mkRing();
    assert.deepEqual(r0.formatIds, []);

    const r1 = adoptTemplate(r0, ` ${FMT_A.toUpperCase()} `);
    assert.notEqual(r1, r0);
    assert.deepEqual(r0.formatIds, [], "input ring must not be mutated");
    assert.deepEqual(r1.formatIds, [FMT_A]);
    assert.equal("formatId" in r1, false);

    const r2 = adoptTemplate(r1, FMT_B);
    assert.deepEqual(r2.formatIds, [FMT_A, FMT_B]);

    // Idempotent: re-adopting an existing template returns an equal ring.
    const r2Again = adoptTemplate(r2, FMT_A.toUpperCase());
    assert.deepEqual(r2Again, r2);
  });

  test("adoptTemplate migrates a legacy formatId ring cleanly", () => {
    const legacy = { id: "cmp_leg1", formatId: FMT_A };
    const next = adoptTemplate(legacy, FMT_B);
    assert.deepEqual(next.formatIds, [FMT_A, FMT_B]);
    assert.equal("formatId" in next, false);
    assert.equal(legacy.formatId, FMT_A, "legacy input untouched");
  });

  test("adoptTemplate invalid id or bad ring is a no-op and never throws", () => {
    const r = mkRing({ formatIds: [FMT_A] });
    for (const bad of ["", "bogus", "fmt_123", "fmt_123456789", "fmt_abc-1234", null, undefined, 123]) {
      assert.deepEqual(adoptTemplate(r, bad), r);
    }
    assert.equal(adoptTemplate(null, FMT_A), null);
  });

  test("removeTemplate removes an existing id; no-op when not running or invalid", () => {
    const r = mkRing({ formatIds: [FMT_A, FMT_B] });
    const after = removeTemplate(r, FMT_A.toUpperCase());
    assert.notEqual(after, r);
    assert.deepEqual(r.formatIds, [FMT_A, FMT_B], "input untouched");
    assert.deepEqual(after.formatIds, [FMT_B]);
    assert.equal("formatId" in after, false);

    // No-op when template is not running or invalid.
    assert.deepEqual(removeTemplate(after, FMT_C), after);
    assert.deepEqual(removeTemplate(after, "invalid"), after);
    assert.equal(removeTemplate(null, FMT_A), null);

    // Removing the last template leaves formatIds: [].
    const empty = removeTemplate(after, FMT_B);
    assert.deepEqual(empty.formatIds, []);
  });
});

describe("V58 ringsRunningFormat membership", () => {
  test("matches rings running multiple templates as well as legacy formatId rings", () => {
    const rings = [
      { id: "r1", formatIds: [FMT_A, FMT_B] },
      { id: "r2", formatId: FMT_B.toUpperCase() },
      { id: "r3", formatIds: [] },
      { id: "r4", formatIds: [FMT_C] },
    ];
    assert.deepEqual(ringsRunningFormat(FMT_A, rings).map((r) => r.id), ["r1"]);
    assert.deepEqual(ringsRunningFormat(FMT_B, rings).map((r) => r.id), ["r1", "r2"]);
    assert.deepEqual(ringsRunningFormat(FMT_C.toUpperCase(), rings).map((r) => r.id), ["r4"]);
    assert.deepEqual(ringsRunningFormat("bad", rings), []);
    assert.deepEqual(ringsRunningFormat(FMT_A, null), []);
  });
});

describe("V58 normalizeCampaign migration", () => {
  test("migrates legacy formatId to first entry of formatIds and drops legacy key", () => {
    const raw = {
      id: "cmp_mig1",
      game: baseGame,
      title: "Legacy",
      anchorPost: baseAnchor,
      members: baseMembers,
      createdAt: "2026-11-23T00:00:00Z",
      formatId: ` ${FMT_A.toUpperCase()} `,
    };
    const norm = normalizeCampaign(raw);
    assert.deepEqual(norm.formatIds, [FMT_A]);
    assert.equal("formatId" in norm, false);
    assert.equal(raw.formatId, ` ${FMT_A.toUpperCase()} `, "input untouched");
    assert.deepEqual(normalizeCampaign(norm), norm, "idempotent");
    assert.deepEqual(validateCampaign(norm), []);
  });

  test("defaults rings without formatId/formatIds to formatIds: []", () => {
    const ring = mkRing();
    assert.deepEqual(ring.formatIds, []);
    assert.equal("formatId" in ring, false);
    assert.deepEqual(normalizeCampaign(ring), ring);
  });

  test("preserves legacy formatId as first entry ahead of additional formatIds", () => {
    const raw = {
      id: "cmp_mig2",
      game: baseGame,
      title: "Mixed",
      anchorPost: baseAnchor,
      members: baseMembers,
      createdAt: "2026-11-23T00:00:00Z",
      formatId: FMT_A,
      formatIds: [FMT_B, FMT_A, "invalid"],
    };
    const norm = normalizeCampaign(raw);
    assert.deepEqual(norm.formatIds, [FMT_A, FMT_B]);
    assert.equal("formatId" in norm, false);
  });
});

describe("V58 graph runs edges for multi-template rings", () => {
  test("ring running two templates produces two runs edges and admits both formats", () => {
    const rings = [
      {
        id: "cmp_multi",
        game: baseGame,
        title: "Multi",
        members: baseMembers,
        formatIds: [FMT_A, FMT_B],
      },
    ];
    const formats = [
      { id: FMT_A, tagline: "A", description: "d", howTo: "h", tags: [] },
      { id: FMT_B, tagline: "B", description: "d", howTo: "h", tags: [] },
      { id: FMT_C, tagline: "C", description: "d", howTo: "h", tags: [] },
    ];
    const g = buildGraph({ rings, formats });
    const fmtRefs = g.nodes.filter((n) => n.kind === "format").map((n) => n.ref).sort();
    assert.deepEqual(fmtRefs, [FMT_A, FMT_B]);

    const runs = g.edges.filter((e) => e.kind === "runs");
    assert.equal(runs.length, 2);
    assert.deepEqual(
      runs.map((e) => `${e.from}->${e.to}`).sort(),
      [`ring:cmp_multi->format:${FMT_A}`, `ring:cmp_multi->format:${FMT_B}`],
    );
  });
});

describe("V58 popularity distinct-ring counting with multi-template rings", () => {
  const PK_A = "aa".repeat(32);
  const PK_B = "bb".repeat(32);

  test("a ring running two templates counts once for each template, never twice on republish", () => {
    const events = [
      {
        id: "ev1",
        kind: N.KIND_CAMPAIGN,
        pubkey: PK_A,
        tags: [
          ["d", "cabal:cmp_1"],
          ["t", "cabal"],
          ["t", `cabal:format:${FMT_A}`],
          ["t", `cabal:format:${FMT_B}`],
        ],
        content: JSON.stringify({ id: "cmp_1", formatIds: [FMT_A, FMT_B] }),
      },
      // Republish by same ring (PK_A) must still count as 1 distinct ring per template
      {
        id: "ev2",
        kind: N.KIND_CAMPAIGN,
        pubkey: PK_A,
        tags: [
          ["d", "cabal:cmp_1"],
          ["t", "cabal"],
          ["t", `cabal:format:${FMT_A}`],
          ["t", `cabal:format:${FMT_B}`],
        ],
        content: JSON.stringify({ id: "cmp_1", formatIds: [FMT_A, FMT_B] }),
      },
      // Second ring (PK_B) running FMT_A via tag-only fallback with multiple tags
      {
        id: "ev3",
        kind: N.KIND_CAMPAIGN,
        pubkey: PK_B,
        tags: [
          ["d", "cabal:cmp_2"],
          ["t", `cabal:format:${FMT_A}`],
          ["t", `cabal:format:${FMT_C}`],
        ],
        content: "",
      },
    ];

    const usage = countFormatUsage(events);
    assert.equal(usage.get(FMT_A).rings.size, 2);
    assert.equal(usage.get(FMT_B).rings.size, 1);
    assert.equal(usage.get(FMT_C).rings.size, 1);
    assert.equal(usageLabel(usage.get(FMT_A)), "Used by 2 rings");
    assert.equal(usageLabel(usage.get(FMT_B)), "Used by 1 ring");
  });
});

describe("V58 Nostr decode mapping & adoption event", () => {
  test("applyRelayEvents maps legacy raw.formatId to formatIds and drops legacy key", async () => {
    const kp = N.generateCampaignKey();
    const legacyPayload = {
      id: "cmp_leg_nostr",
      game: baseGame,
      title: "Legacy Relay Ring",
      members: baseMembers,
      posts: [],
      createdAt: "2026-11-23T00:00:00Z",
      formatId: FMT_A,
    };
    const ev = await N.signEvent({
      kind: N.KIND_CAMPAIGN,
      created_at: 1000,
      tags: [["d", "cabal:cmp_leg_nostr"], ["t", "cabal"], ["t", `cabal:format:${FMT_A}`]],
      content: JSON.stringify(legacyPayload),
    }, kp.key);

    const res = N.applyRelayEvents([], [ev]);
    assert.equal(res.applied, 1);
    assert.deepEqual(res.campaigns[0].formatIds, [FMT_A]);
    assert.equal("formatId" in res.campaigns[0], false);
  });

  test("adoptionEvent emits one t tag per running format, newer created_at, and strips key", async () => {
    const r0 = mkRing({ formatIds: [FMT_A] });
    const rWithMeta = { ...r0, nostr: { pubkey: N.campaignPubkey(r0), eventId: "old", createdAt: 5000 } };
    const adopted = adoptTemplate(rWithMeta, FMT_B);

    const tpl = N.adoptionEvent(adopted);
    assert.equal(tpl.kind, N.KIND_CAMPAIGN);
    assert.ok(tpl.created_at > 5000, "strictly newer created_at than prior campaign event");
    const fmtTags = tpl.tags.filter((t) => t[0] === "t" && t[1].startsWith("cabal:format:"));
    assert.deepEqual(fmtTags, [
      ["t", `cabal:format:${FMT_A}`],
      ["t", `cabal:format:${FMT_B}`],
    ]);
    assert.equal(tpl.content.includes(r0.key), false, "shared campaign key never leaks in content");
    assert.deepEqual(JSON.parse(tpl.content).formatIds, [FMT_A, FMT_B]);

    // Kind 1 postEvent & encryptionEvent also carry one tag per running format.
    const post = adopted.posts[0];
    const postEv = N.postEvent(adopted, post);
    assert.deepEqual(
      postEv.tags.filter((t) => t[0] === "t" && t[1].startsWith("cabal:format:")),
      [["t", `cabal:format:${FMT_A}`], ["t", `cabal:format:${FMT_B}`]],
    );
    const encEv = N.encryptionEvent(adopted, post, {
      handle: "@moss",
      status: "contributed",
      contributedAt: "2026-11-23T01:00:00Z",
    });
    assert.deepEqual(
      encEv.tags.filter((t) => t[0] === "t" && t[1].startsWith("cabal:format:")),
      [["t", `cabal:format:${FMT_A}`], ["t", `cabal:format:${FMT_B}`]],
    );
  });

  test("publishAdoption signs with shared campaign keypair, syncs to another client, and rejects read-only rings", async () => {
    const r0 = mkRing({ formatIds: [FMT_A] });
    const r1 = adoptTemplate(r0, FMT_B);
    const published = [];
    const fakeClient = {
      async publish(ev) {
        published.push(ev);
        return { "wss://relay.example": { ok: true, message: "" } };
      },
    };

    const pub = await N.publishAdoption(fakeClient, r1, { createdAt: 2000 });
    assert.equal(pub.kind, N.KIND_CAMPAIGN);
    assert.equal(published.length, 1);
    assert.equal(await N.verifyEvent(pub.event), true);
    assert.equal(pub.event.pubkey, N.campaignPubkey(r1));
    assert.equal(pub.event.content.includes(r1.key), false);

    // Syncing onto a peer holding the old single-template state updates formatIds.
    const peerLocal = [{ ...r0, nostr: { pubkey: N.campaignPubkey(r0), eventId: "e0", createdAt: 1000 } }];
    const merged = N.applyRelayEvents(peerLocal, [pub.event]);
    assert.equal(merged.applied, 1);
    assert.deepEqual(merged.campaigns[0].formatIds, [FMT_A, FMT_B]);
    assert.equal("formatId" in merged.campaigns[0], false);

    // Read-only ring (no campaign key) cannot publish adoption.
    const { key: _drop, ...readOnly } = r1;
    await assert.rejects(() => N.publishAdoption(fakeClient, readOnly));
  });
});
