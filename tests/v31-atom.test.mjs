import test from 'node:test';
import assert from 'node:assert/strict';
import { escXml, campaignToEntry, buildFeed } from '../src/atom.mjs';

const linkFor = (c) => `https://example.test/cabal/#c=${c.id}`;

const brass = {
  id: 'cmp_brass001',
  title: 'Brass Orchard launch week — help us spread the harvest',
  createdAt: '2026-11-22T09:00:00Z',
  demo: true,
  game: {
    name: 'Brass Orchard',
    tags: ['cozy', 'farming'],
    links: {
      steam: 'https://store.steampowered.com/app/0000000/Brass_Orchard/',
      itch: 'https://example-dev.itch.io/brass-orchard',
    },
  },
  anchorPost: {
    author: '@brassorchard',
    platform: 'x',
    text: 'Brass Orchard is out now.',
  },
  members: [
    { handle: '@brassorchard', status: 'posted' },
    { handle: '@mossfinch', status: 'pending' },
  ],
  window: { start: '2026-11-22', end: '2026-11-29' },
};

const newer = {
  ...brass,
  id: 'cmp_newer001',
  title: 'Newer campaign',
  createdAt: '2026-11-23T10:00:00Z',
  demo: false,
  members: [
    { handle: '@a', status: 'posted' },
    { handle: '@b', status: 'posted' },
  ],
};

test('escXml escapes the five XML characters', () => {
  assert.equal(
    escXml(`a & b <c> "d" 'e'`),
    'a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;',
  );
});

test('campaignToEntry: stable id, join link, game link, counts, demo note', () => {
  const entry = campaignToEntry(brass, { linkFor });
  assert.match(entry, /<id>tag:omegaramyun\.github\.io,2026:cmp_brass001<\/id>/);
  assert.match(entry, /<title>Brass Orchard launch week/);
  assert.match(entry, /<updated>2026-11-22T09:00:00Z<\/updated>/);
  assert.match(
    entry,
    /<link rel="alternate" href="https:\/\/example\.test\/cabal\/#c=cmp_brass001" \/>/,
  );
  assert.match(
    entry,
    /<link rel="related" href="https:\/\/store\.steampowered\.com\/app\/0000000\/Brass_Orchard\/" \/>/,
  );
  assert.match(entry, /<name>@brassorchard<\/name>/);
  assert.match(entry, /1\/2 ringmates have contributed/);
  assert.match(entry, /Latest post — x @brassorchard/);
  assert.match(entry, /Example campaign — fictional data\./);
});

test('campaignToEntry: no demo note for a real campaign', () => {
  assert.doesNotMatch(campaignToEntry(newer, { linkFor }), /Example campaign/);
});

test('buildFeed: header, self link, newest first, feed updated is newest', () => {
  const xml = buildFeed([brass, newer], { linkFor });
  assert.match(xml, /<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<title>Cabal — discover campaigns<\/title>/);
  assert.match(
    xml,
    /<link rel="self" type="application\/atom\+xml" href="https:\/\/omegaramyun\.github\.io\/cabal\/campaigns\.atom" \/>/,
  );
  assert.match(xml, /<updated>2026-11-23T10:00:00Z<\/updated>/);
  assert.ok(
    xml.indexOf('cmp_newer001') < xml.indexOf('cmp_brass001'),
    'newest entry first',
  );
});

test('buildFeed: empty list is a valid feed with no entries', () => {
  const xml = buildFeed([], { linkFor });
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.doesNotMatch(xml, /<entry>/);
});
