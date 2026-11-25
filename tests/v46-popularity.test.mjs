import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as N from "../src/nostr.mjs";
import {
  FORMAT_TAG_PREFIX,
  formatTag,
  countFormatUsage,
  sortFormatsByUsage,
  usageLabel,
  popularityNote,
  filtersForFormat,
  queryFormatUsage,
} from "../src/popularity.mjs";

const PK_A = "aa".repeat(32);
const PK_B = "bb".repeat(32);
const PK_C = "cc".repeat(32);

describe("V46 countFormatUsage", () => {
  test("dedupes campaign events by pubkey (republish is still 1 ring)", () => {
    const events = [
      {
        id: "ev1",
        kind: 30078,
        pubkey: PK_A,
        tags: [["d", "cabal:cmp_1"], ["t", "cabal:format:fmt_launch"]],
        content: JSON.stringify({ id: "cmp_1", formatId: "fmt_launch" }),
      },
      {
        id: "ev2",
        kind: 30078,
        pubkey: PK_A,
        tags: [["d", "cabal:cmp_1"], ["t", "cabal:format:fmt_launch"]],
        content: JSON.stringify({ id: "cmp_1", formatId: "fmt_launch", title: "Updated" }),
      },
      {
        id: "ev3",
        kind: 30078,
        pubkey: PK_B,
        tags: [["d", "cabal:cmp_2"], ["t", "cabal:format:fmt_launch"]],
        content: JSON.stringify({ id: "cmp_2", formatId: "fmt_launch" }),
      },
    ];

    const usage = countFormatUsage(events);
    assert.equal(usage.size, 1);
    const entry = usage.get("fmt_launch");
    assert.equal(entry.rings.size, 2);
    assert.equal(entry.rings.has(PK_A), true);
    assert.equal(entry.rings.has(PK_B), true);
    assert.equal(entry.assists, 0);
  });

  test("campaign event prefers content.formatId, falls back to tag when absent", () => {
    const events = [
      {
        id: "ev_content",
        kind: 30078,
        pubkey: PK_A,
        tags: [["t", "cabal:format:fmt_tag_fallback"]],
        content: JSON.stringify({ id: "cmp_1", formatId: "fmt_from_content" }),
      },
      {
        id: "ev_tag_only",
        kind: 30078,
        pubkey: PK_B,
        tags: [["t", "cabal"], ["t", "cabal:format:fmt_tag_fallback"]],
        content: JSON.stringify({ id: "cmp_2" }),
      },
      {
        id: "ev_empty_content",
        kind: 30078,
        pubkey: PK_C,
        tags: [["t", "cabal:format:fmt_tag_fallback"]],
        content: "",
      },
    ];

    const usage = countFormatUsage(events);
    assert.equal(usage.get("fmt_from_content").rings.size, 1);
    assert.equal(usage.get("fmt_tag_fallback").rings.size, 2);
    assert.equal(usage.get("fmt_tag_fallback").rings.has(PK_B), true);
    assert.equal(usage.get("fmt_tag_fallback").rings.has(PK_C), true);
  });

  test("kind 78 events count as assists via tag only and NEVER add to rings; legacy kind 1 still counts (V79 back-compat)", () => {
    const events = [
      {
        id: "n1",
        kind: 78,
        pubkey: PK_A,
        tags: [["t", "cabal"], ["t", "cabal:format:fmt_clip"]],
        content: JSON.stringify({ handle: "@moss", note: "Shared!" }),
      },
      {
        id: "n2",
        kind: 78,
        pubkey: PK_B,
        tags: [["t", "cabal:format:fmt_clip"]],
        content: JSON.stringify({ formatId: "fmt_should_not_read_content" }),
      },
      // Duplicate event id across relays must not double-count
      {
        id: "n1",
        kind: 78,
        pubkey: PK_A,
        tags: [["t", "cabal:format:fmt_clip"]],
        content: JSON.stringify({ handle: "@moss", note: "Shared!" }),
      },
      // Kind 78 with formatId only in content and no tag is ignored
      {
        id: "n3",
        kind: 78,
        pubkey: PK_C,
        tags: [["t", "cabal"]],
        content: JSON.stringify({ formatId: "fmt_content_only" }),
      },
      // Legacy kind 1 assist (published before the V79 migration) still counts
      {
        id: "n4",
        kind: 1,
        pubkey: PK_A,
        tags: [["t", "cabal:format:fmt_clip"]],
        content: JSON.stringify({ handle: "@legacy", note: "Shared before V79." }),
      },
    ];

    const usage = countFormatUsage(events);
    assert.equal(usage.has("fmt_should_not_read_content"), false);
    assert.equal(usage.has("fmt_content_only"), false);
    const clip = usage.get("fmt_clip");
    assert.equal(clip.rings.size, 0);
    assert.equal(clip.assists, 3);
  });

  test("ignores malformed events, bad content, unknown kinds, and missing format refs; never throws", () => {
    const events = [
      null,
      undefined,
      "not-an-event",
      42,
      {},
      // Malformed JSON content on kind 30078
      { id: "bad1", kind: 30078, pubkey: PK_A, tags: [["t", "cabal:format:fmt_x"]], content: "{broken json" },
      // Non-object JSON content on kind 30078
      { id: "bad2", kind: 30078, pubkey: PK_A, tags: [["t", "cabal:format:fmt_x"]], content: "[1, 2, 3]" },
      // Missing pubkey on kind 30078
      { id: "bad3", kind: 30078, tags: [["t", "cabal:format:fmt_x"]], content: "{}" },
      // Unknown kind
      { id: "bad4", kind: 0, pubkey: PK_A, tags: [["t", "cabal:format:fmt_x"]], content: '{"formatId":"fmt_x"}' },
      { id: "bad5", kind: 7, pubkey: PK_A, tags: [["t", "cabal:format:fmt_x"]], content: "+" },
      // No format reference
      { id: "bad6", kind: 30078, pubkey: PK_A, tags: [["t", "cabal"]], content: '{"id":"cmp_1"}' },
      { id: "bad7", kind: 78, pubkey: PK_A, tags: [["t", "cabal:format:"]], content: "empty id" },
      { id: "bad8", kind: 1, pubkey: PK_A, tags: "not-an-array", content: "" }, // legacy kind 1, still ignored when malformed
    ];

    assert.equal(countFormatUsage(events).size, 0);
    assert.equal(countFormatUsage(null).size, 0);
    assert.equal(countFormatUsage(undefined).size, 0);
    assert.equal(countFormatUsage("nope").size, 0);
  });
});

describe("V46 sortFormatsByUsage", () => {
  const mkFmt = (id) => ({ id, name: id });

  test("sorts by distinct rings desc, tiebreak assists desc, final tiebreak id asc, no-usage last in existing order", () => {
    const formats = [
      mkFmt("fmt_unused_z"),
      mkFmt("fmt_tie_b"),
      mkFmt("fmt_top"),
      mkFmt("fmt_unused_a"),
      mkFmt("fmt_tie_a"),
      mkFmt("fmt_assists_only"),
      mkFmt("fmt_mid_more_assists"),
    ];
    const originalIds = formats.map((f) => f.id);

    const usage = new Map([
      ["fmt_top", { rings: new Set([PK_A, PK_B, PK_C]), assists: 1 }],
      ["fmt_mid_more_assists", { rings: new Set([PK_A]), assists: 5 }],
      ["fmt_tie_b", { rings: new Set([PK_A]), assists: 2 }],
      ["fmt_tie_a", { rings: new Set([PK_B]), assists: 2 }],
      ["fmt_assists_only", { rings: new Set(), assists: 3 }],
      ["fmt_unused_z", { rings: new Set(), assists: 0 }],
    ]);

    const sorted = sortFormatsByUsage(formats, usage);
    assert.notEqual(sorted, formats, "must return a new array");
    assert.deepEqual(formats.map((f) => f.id), originalIds, "must not mutate input");
    assert.deepEqual(
      sorted.map((f) => f.id),
      [
        "fmt_top",              // 3 rings, 1 assist
        "fmt_mid_more_assists", // 1 ring, 5 assists
        "fmt_tie_a",            // 1 ring, 2 assists, id 'fmt_tie_a' < 'fmt_tie_b'
        "fmt_tie_b",            // 1 ring, 2 assists
        "fmt_assists_only",     // 0 rings, 3 assists (has usage)
        "fmt_unused_z",         // no usage, kept original order
        "fmt_unused_a",         // no usage, kept original order
      ],
    );
  });

  test("accepts plain object as usageMap and tolerates empty/null input", () => {
    const formats = [mkFmt("fmt_b"), mkFmt("fmt_a")];
    const sorted = sortFormatsByUsage(formats, {
      fmt_a: { rings: [PK_A, PK_B], assists: 0 },
      fmt_b: { rings: [PK_A], assists: 4 },
    });
    assert.deepEqual(sorted.map((f) => f.id), ["fmt_a", "fmt_b"]);
    assert.deepEqual(sortFormatsByUsage(formats, null).map((f) => f.id), ["fmt_b", "fmt_a"]);
    assert.deepEqual(sortFormatsByUsage(null, {}), []);
  });
});

describe("V46 usageLabel & popularityNote", () => {
  test("usageLabel handles singular, plural, zero, and unknown; never shows assists or 0 rings", () => {
    assert.equal(usageLabel({ rings: new Set([PK_A]), assists: 99 }), "Used by 1 ring");
    assert.equal(usageLabel({ rings: new Set([PK_A, PK_B, PK_C]), assists: 12 }), "Used by 3 rings");
    assert.equal(usageLabel({ rings: new Set(), assists: 10 }), "");
    assert.equal(usageLabel({ rings: 0, assists: 5 }), "");
    assert.equal(usageLabel(0), "");
    assert.equal(usageLabel(-1), "");
    assert.equal(usageLabel(null), "");
    assert.equal(usageLabel(undefined), "");
    assert.equal(usageLabel({}), "");
  });

  test("popularityNote states Nostr-only and relay-scope honest limits", () => {
    const note = popularityNote();
    assert.equal(typeof note, "string");
    assert.ok(note.length > 20);
    assert.match(note, /nostr/i);
    assert.match(note, /relay/i);
    assert.match(note, /\bX\b/);
  });
});

describe("V46 filtersForFormat & formatTag", () => {
  test("builds exact NIP-01 filter and tag shape", () => {
    assert.equal(FORMAT_TAG_PREFIX, "cabal:format:");
    assert.deepEqual(formatTag("fmt_devlog"), ["t", "cabal:format:fmt_devlog"]);
    assert.equal(formatTag(""), null);
    assert.equal(formatTag(null), null);

    assert.deepEqual(filtersForFormat("fmt_devlog"), {
      kinds: [78, 1, 30078],
      "#t": ["cabal:format:fmt_devlog"],
    });
    assert.equal(filtersForFormat("  "), null);
    assert.equal(filtersForFormat(undefined), null);
  });
});

describe("V46 queryFormatUsage (relay client integration)", () => {
  async function signedEvents() {
    const kp1 = N.generateCampaignKey();
    const kp2 = N.generateCampaignKey();

    const camp1 = await N.signEvent({
      kind: N.KIND_CAMPAIGN,
      tags: [["d", "cabal:cmp_1"], ["t", "cabal"], formatTag("fmt_launch")],
      content: JSON.stringify({ id: "cmp_1", formatId: "fmt_launch" }),
    }, kp1.key);

    const camp2 = await N.signEvent({
      kind: N.KIND_CAMPAIGN,
      tags: [["d", "cabal:cmp_2"], ["t", "cabal"], formatTag("fmt_launch")],
      content: JSON.stringify({ id: "cmp_2", formatId: "fmt_launch" }),
    }, kp2.key);

    const assist1 = await N.signEvent({
      kind: N.KIND_APP_RECORD,
      tags: [["a", N.campaignAddress(kp1.pubkey, "cmp_1")], ["t", "cabal"], formatTag("fmt_launch")],
      content: JSON.stringify({ handle: "@wren", note: "Quoted on X." }),
    }, kp1.key);

    return { kp1, kp2, camp1, camp2, assist1 };
  }

  class FailingWS {
    constructor() { setTimeout(() => this.onerror?.(), 0); }
    send() {}
    close() {}
  }

  function makeFakeWS(eventsByRelay, sentReqs) {
    return class FakeWS {
      constructor(url) {
        this.url = url;
        if (eventsByRelay[url] === "FAIL") return new FailingWS();
        setTimeout(() => this.onopen?.(), 0);
      }
      send(raw) {
        const msg = JSON.parse(raw);
        if (msg[0] === "REQ") {
          sentReqs.push({ url: this.url, filters: msg.slice(2) });
          const list = eventsByRelay[this.url] ?? [];
          setTimeout(() => {
            for (const ev of list) {
              this.onmessage?.({ data: JSON.stringify(["EVENT", msg[1], ev]) });
            }
            this.onmessage?.({ data: JSON.stringify(["EOSE", msg[1]]) });
          }, 0);
        }
      }
      close() {}
    };
  }

  test("returns partial results when one relay fails, dedupes across relays, and reports relay counts", async () => {
    const { kp1, kp2, camp1, camp2, assist1 } = await signedEvents();
    const sentReqs = [];
    const WS = makeFakeWS({
      "wss://ok1.example": [camp1, assist1],
      "wss://ok2.example": [camp1, camp2],
      "wss://down.example": "FAIL",
    }, sentReqs);

    const client = N.createRelayClient({
      relays: ["wss://ok1.example", "wss://ok2.example", "wss://down.example"],
      WebSocketImpl: WS,
      timeoutMs: 200,
    });

    const res = await queryFormatUsage(client, ["fmt_launch", "fmt_clip"], { timeoutMs: 200 });
    assert.equal(res.relaysTotal, 3);
    assert.equal(res.relaysAnswered, 2);
    assert.equal(res.usage.get("fmt_launch").rings.size, 2);
    assert.equal(res.usage.get("fmt_launch").rings.has(kp1.pubkey), true);
    assert.equal(res.usage.get("fmt_launch").rings.has(kp2.pubkey), true);
    assert.equal(res.usage.get("fmt_launch").assists, 1);
    assert.equal(res.usage.has("fmt_clip"), false);

    // Verify exact REQ filter shape sent to answering relays
    assert.equal(sentReqs.length, 2);
    assert.deepEqual(sentReqs[0].filters, [
      { kinds: [78, 1, 30078], "#t": ["cabal:format:fmt_launch"] },
      { kinds: [78, 1, 30078], "#t": ["cabal:format:fmt_clip"] },
    ]);
  });

  test("never throws when all relays fail, client throws, or inputs are empty", async () => {
    const downClient = N.createRelayClient({
      relays: ["wss://down1.example", "wss://down2.example"],
      WebSocketImpl: FailingWS,
      timeoutMs: 50,
    });
    const r1 = await queryFormatUsage(downClient, ["fmt_launch"], { timeoutMs: 50 });
    assert.equal(r1.usage.size, 0);
    assert.equal(r1.relaysAnswered, 0);
    assert.equal(r1.relaysTotal, 2);

    const throwingClient = {
      status: () => ({ "wss://a.example": "unreachable" }),
      async fetch() { throw new Error("boom"); },
    };
    const r2 = await queryFormatUsage(throwingClient, ["fmt_launch"], { timeoutMs: 50 });
    assert.equal(r2.usage.size, 0);
    assert.equal(r2.relaysAnswered, 0);
    assert.equal(r2.relaysTotal, 1);

    const r3 = await queryFormatUsage(null, ["fmt_launch"]);
    assert.deepEqual(r3, { usage: new Map(), relaysAnswered: 0, relaysTotal: 0 });

    const r4 = await queryFormatUsage(throwingClient, []);
    assert.equal(r4.usage.size, 0);
    assert.equal(r4.relaysAnswered, 0);
    assert.equal(r4.relaysTotal, 1);
  });
});
