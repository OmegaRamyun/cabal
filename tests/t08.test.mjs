import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  STEAM_ATTRIBUTION_RULES,
  validateSteamUrl,
  defaultUtmParams,
  buildUtm,
} from '../src/steam.mjs';
import {
  CAMPAIGN_TEMPLATES,
  getTemplates,
  getTemplateById,
  formatTemplateBrief,
} from '../src/templates.mjs';

describe('T08 — Steam UTM builder (src/steam.mjs)', () => {
  it('enforces utm_source and/or utm_campaign (at least one required)', () => {
    const appUrl = 'https://store.steampowered.com/app/123456/Star_Forge/';

    assert.throws(
      () => buildUtm(appUrl),
      /utm_source or utm_campaign is required/i,
    );
    assert.throws(
      () => buildUtm(appUrl, {}),
      /utm_source or utm_campaign is required/i,
    );
    assert.throws(
      () => buildUtm(appUrl, { source: '   ', campaign: '', medium: 'bluesky' }),
      /utm_source or utm_campaign is required/i,
    );

    const sourceOnly = new URL(buildUtm(appUrl, { source: 'cabal' }));
    assert.equal(sourceOnly.searchParams.get('utm_source'), 'cabal');
    assert.equal(sourceOnly.searchParams.get('utm_campaign'), null);

    const campaignOnly = new URL(buildUtm(appUrl, { campaign: 'launch-2026' }));
    assert.equal(campaignOnly.searchParams.get('utm_campaign'), 'launch-2026');
    assert.equal(campaignOnly.searchParams.get('utm_source'), null);
  });

  it('allows only Steam app pages and sale pages', () => {
    assert.doesNotThrow(() =>
      validateSteamUrl('https://store.steampowered.com/app/420/'),
    );
    assert.doesNotThrow(() =>
      validateSteamUrl('https://store.steampowered.com/app/420/Half_Life_2/'),
    );
    assert.doesNotThrow(() =>
      validateSteamUrl('https://store.steampowered.com/sale/indie-fest-2026'),
    );
    assert.doesNotThrow(() =>
      validateSteamUrl('https://store.steampowered.com/publisher/acme/sale/autumn'),
    );

    const rejectedUrls = [
      '',
      'not-a-url',
      'ftp://store.steampowered.com/app/420/',
      'javascript:alert(1)',
      'https://example.com/app/420/',
      'https://steamcommunity.com/app/420/',
      'https://store.steampowered.com/wishlist/',
      'https://store.steampowered.com/cart/',
      'https://store.steampowered.com/search/?term=indie',
      'https://store.steampowered.com/app/not-a-number/',
    ];

    for (const badUrl of rejectedUrls) {
      assert.throws(() => buildUtm(badUrl, { source: 'cabal' }), Error, `Expected rejection for: ${badUrl}`);
    }
  });

  it('properly encodes UTM parameters and preserves existing non-UTM query params', () => {
    const base = 'https://store.steampowered.com/app/99999/My_Game/?snr=1_5_9__400';
    const built = buildUtm(base, {
      source: 'cabal ring',
      medium: 'bluesky/post',
      campaign: 'next fest & demo?1',
      content: 'member #7 = alice',
      term: 'cozy-sim',
    });

    const parsed = new URL(built);
    assert.equal(parsed.searchParams.get('snr'), '1_5_9__400');
    assert.equal(parsed.searchParams.get('utm_source'), 'cabal ring');
    assert.equal(parsed.searchParams.get('utm_medium'), 'bluesky/post');
    assert.equal(parsed.searchParams.get('utm_campaign'), 'next fest & demo?1');
    assert.equal(parsed.searchParams.get('utm_content'), 'member #7 = alice');
    assert.equal(parsed.searchParams.get('utm_term'), 'cozy-sim');
    assert.ok(!built.includes('next fest & demo?1'), 'Raw unencoded special characters must be encoded');
  });

  it('builds default naming: utm_source=cabal&utm_medium=<platform>&utm_campaign=<game>-<date>&utm_content=<member>', () => {
    const defaults = defaultUtmParams({
      platform: 'Bluesky',
      game: 'Star Forge',
      date: '2026-11-23',
      member: 'Alice Dev',
    });

    assert.deepEqual(defaults, {
      source: 'cabal',
      medium: 'bluesky',
      campaign: 'star-forge-2026-11-23',
      content: 'alice-dev',
    });

    const built = buildUtm('https://store.steampowered.com/app/555111/Star_Forge/', defaults);
    const parsed = new URL(built);
    assert.equal(parsed.searchParams.get('utm_source'), 'cabal');
    assert.equal(parsed.searchParams.get('utm_medium'), 'bluesky');
    assert.equal(parsed.searchParams.get('utm_campaign'), 'star-forge-2026-11-23');
    assert.equal(parsed.searchParams.get('utm_content'), 'alice-dev');
    assert.equal(parsed.searchParams.get('utm_term'), null);
  });

  it('exports the 72-hour attribution rules including floor-not-truth caveat', () => {
    const joined = STEAM_ATTRIBUTION_RULES.join(' ').toLowerCase();
    assert.match(joined, /72 hours/);
    assert.match(joined, /logged-in steam users/);
    assert.match(joined, /same browser/);
    assert.match(joined, /demos.*playtests.*never count/);
    assert.match(joined, /floor, not the truth/);
  });
});

describe('T08 — Campaign templates (src/templates.mjs)', () => {
  const EXPECTED_IDS = ['pre-launch', 'live', 'late-pledge', 'next-fest', 'dev-update'];

  it('exports the five required campaign templates', () => {
    assert.equal(CAMPAIGN_TEMPLATES.length, 5);
    assert.deepEqual(
      getTemplates().map((t) => t.id),
      EXPECTED_IDS,
    );
    assert.equal(getTemplateById('next-fest')?.id, 'next-fest');
    assert.equal(getTemplateById('nonexistent'), null);
  });

  it('ensures every template has structure, prompts, disclosure line, and similarity-gate reminder', () => {
    for (const tpl of getTemplates()) {
      assert.ok(Array.isArray(tpl.structure) && tpl.structure.length >= 3, `${tpl.id} needs structure`);
      assert.ok(Array.isArray(tpl.prompts) && tpl.prompts.length >= 2, `${tpl.id} needs prompts`);
      assert.ok(
        typeof tpl.disclosure === 'string' && tpl.disclosure.toLowerCase().includes('ring member'),
        `${tpl.id} needs a ring-member disclosure line`,
      );
      assert.ok(
        typeof tpl.similarityReminder === 'string' &&
          tpl.similarityReminder.toLowerCase().includes('similarity gate'),
        `${tpl.id} needs a similarity-gate reminder`,
      );
    }
  });

  it('ensures no template contains fill-in-the-blank or copy-paste caption text', () => {
    const fillInBlankPattern = /\{\{[^}]+\}\}|\[(?:game|title|link|url|name|date|studio|insert)[^\]]*\]|<game>|<title>|<link>/i;

    for (const tpl of getTemplates()) {
      const brief = formatTemplateBrief(tpl);
      assert.ok(
        !fillInBlankPattern.test(brief),
        `${tpl.id} must not contain fill-in-the-blank caption placeholders`,
      );
      assert.equal(
        'caption' in tpl,
        false,
        `${tpl.id} must not ship a copy-paste caption field`,
      );
      assert.equal(
        'copyPaste' in tpl,
        false,
        `${tpl.id} must not ship a copyPaste field`,
      );
    }
  });

  it('formats a structured plain-text brief for clipboard copying', () => {
    const tpl = getTemplateById('dev-update');
    const brief = formatTemplateBrief(tpl);
    assert.match(brief, /Template: Dev update/);
    assert.match(brief, /Goal:/);
    assert.match(brief, /Structure:/);
    assert.match(brief, /Writing Prompts:/);
    assert.match(brief, /Disclosure Line:/);
    assert.match(brief, /Similarity-Gate Reminder:/);
    assert.throws(() => formatTemplateBrief(null), TypeError);
  });
});
