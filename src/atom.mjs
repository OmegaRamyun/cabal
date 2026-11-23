// V31 — Atom discovery feed: campaigns from data/campaigns.json as Atom
// entries. Pure functions only; the generator (scripts/generate-atom.mjs)
// reads the list, filters with discovery.isListable, and writes
// campaigns.atom at the repo root. Static file, no server, no build step
// beyond re-running the generator when the list changes.

export const FEED_ID = 'tag:omegaramyun.github.io,2026:cabal-campaigns';
export const FEED_TITLE = 'Cabal — discover campaigns';
export const FEED_SUBTITLE =
  'Campaigns looking for a ring to push them. Small curated list for now.';
export const FEED_SELF = 'https://omegaramyun.github.io/cabal/campaigns.atom';
export const FEED_ALTERNATE = 'https://omegaramyun.github.io/cabal/#/discover';
export const APP_URL = 'https://omegaramyun.github.io/cabal/';

/** escXml(s) — escape text for XML element content and attributes. */
export function escXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function entryUpdated(campaign) {
  const created = String(campaign?.createdAt ?? '').trim();
  if (created) return created;
  const start = String(campaign?.window?.start ?? '').trim();
  if (start) return `${start}T00:00:00Z`;
  return '1970-01-01T00:00:00Z';
}

function gameLink(campaign) {
  const links = campaign?.game?.links ?? {};
  return links.steam || links.itch || '';
}

/**
 * campaignToEntry(campaign, { linkFor }) -> Atom <entry> string.
 * linkFor(campaign) supplies the join URL (the #c= link intent).
 * Demo campaigns are labeled as example data in the summary.
 */
export function campaignToEntry(campaign, { linkFor } = {}) {
  const game = campaign?.game ?? {};
  const name = String(game.name ?? 'Untitled game');
  const tags = Array.isArray(game.tags) ? game.tags.filter(Boolean) : [];
  const members = Array.isArray(campaign.members) ? campaign.members : [];
  const posted = members.filter((m) => m?.status === 'posted').length;
  const title = String(campaign?.title ?? `${name} campaign`);
  const updated = entryUpdated(campaign);
  const id = `tag:omegaramyun.github.io,2026:${String(campaign?.id ?? 'unknown')}`;
  const join = typeof linkFor === 'function' ? linkFor(campaign) : '';
  const gamePage = gameLink(campaign);
  const author = String(campaign?.anchorPost?.author ?? 'unknown');
  const anchorText = String(campaign?.anchorPost?.text ?? '').trim();
  const window = campaign?.window ?? {};
  const windowText =
    window.start && window.end ? ` Window ${window.start} to ${window.end}.` : '';
  const demoNote = campaign?.demo
    ? ' Example campaign — fictional data.'
    : '';
  const summary =
    `${name}${tags.length ? ` (${tags.join(', ')})` : ''} — ` +
    `${anchorText} ${posted}/${members.length} posted.${windowText}${demoNote}`;

  const lines = [
    '  <entry>',
    `    <title>${escXml(title)}</title>`,
    `    <id>${escXml(id)}</id>`,
    `    <updated>${escXml(updated)}</updated>`,
  ];
  if (join) lines.push(`    <link rel="alternate" href="${escXml(join)}" />`);
  if (gamePage) {
    lines.push(`    <link rel="related" href="${escXml(gamePage)}" />`);
  }
  lines.push(`    <author><name>${escXml(author)}</name></author>`);
  lines.push(`    <summary>${escXml(summary)}</summary>`);
  lines.push('  </entry>');
  return lines.join('\n');
}

/**
 * buildFeed(campaigns, { linkFor, updated }) -> full Atom document string.
 * Entries newest first. `updated` defaults to the newest entry, or the
 * epoch when the list is empty (deterministic; the generator passes the
 * list's own updated date only when there are no entries).
 */
export function buildFeed(campaigns, { linkFor, updated } = {}) {
  const list = (Array.isArray(campaigns) ? campaigns : [])
    .slice()
    .sort((a, b) => String(entryUpdated(b)).localeCompare(String(entryUpdated(a))));
  const feedUpdated =
    updated || (list.length ? entryUpdated(list[0]) : '1970-01-01T00:00:00Z');
  const entries = list
    .map((c) => campaignToEntry(c, { linkFor }))
    .join('\n');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${escXml(FEED_TITLE)}</title>`,
    `  <subtitle>${escXml(FEED_SUBTITLE)}</subtitle>`,
    `  <id>${escXml(FEED_ID)}</id>`,
    `  <updated>${escXml(feedUpdated)}</updated>`,
    `  <link rel="self" type="application/atom+xml" href="${escXml(FEED_SELF)}" />`,
    `  <link rel="alternate" href="${escXml(FEED_ALTERNATE)}" />`,
    entries,
    '</feed>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
