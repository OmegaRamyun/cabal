import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISCORD_LIMITS,
  STORAGE_KEY,
  WEBHOOK_WARNING,
  ANNOUNCEMENT_GUIDE,
  isValidWebhookUrl,
  measureEmbedText,
  measureTotalEmbedText,
  buildPayload,
  buildUtmUrl,
  buildCabalDeepLink,
  buildRingBriefPayload,
  sendWebhook,
} from '../src/discord.mjs';

test('exports constants and safe limits', () => {
  assert.equal(typeof STORAGE_KEY, 'string');
  assert.ok(STORAGE_KEY.length > 0);
  assert.ok(DISCORD_LIMITS && typeof DISCORD_LIMITS === 'object');
  assert.equal(DISCORD_LIMITS.CONTENT_MAX, 2000);
  assert.equal(DISCORD_LIMITS.EMBEDS_MAX, 10);
  assert.equal(DISCORD_LIMITS.EMBED_DESCRIPTION_MAX, 2048);
  assert.equal(DISCORD_LIMITS.EMBED_TOTAL_TEXT_MAX, 6000);
  assert.equal(DISCORD_LIMITS.EMBED_FIELDS_MAX, 25);
});

test('1. buildPayload passes normal inputs through intact without truncation notes', () => {
  const input = {
    content: 'Ring brief: new co-op demo is live.',
    embeds: [
      {
        title: 'Demo Launch',
        description: 'Playable vertical slice on Steam.',
        fields: [{ name: 'Genre', value: 'Co-op Roguelike', inline: true }],
      },
    ],
  };

  const payload = buildPayload(input);
  assert.equal(payload.content, input.content);
  assert.doesNotMatch(payload.content, /\[truncated\]/i);
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].title, 'Demo Launch');
  assert.equal(payload.embeds[0].description, 'Playable vertical slice on Steam.');
  assert.equal(payload.embeds[0].fields.length, 1);
});

test('2. buildPayload truncates content > 2000 chars with a visible [truncated] note', () => {
  const payload = buildPayload({
    content: 'a'.repeat(2500),
    embeds: [],
  });

  assert.ok(payload.content.length <= 2000);
  assert.match(payload.content, /\[truncated\]/);
});

test('3. buildPayload truncates embeds > 10 to 10 and adds visible truncation note in content', () => {
  const embeds = Array.from({ length: 12 }, (_, i) => ({
    title: `Embed ${i + 1}`,
    description: 'Short description',
  }));

  const payload = buildPayload({
    content: 'Brief header',
    embeds,
  });

  assert.equal(payload.embeds.length, 10);
  assert.ok(payload.content.length > 'Brief header'.length);
  assert.ok(payload.content.length <= 2000);
  assert.match(payload.content, /truncat/i);
});

test('4. buildPayload truncates embed.description > 2048 chars with a visible [truncated] note', () => {
  const payload = buildPayload({
    content: '',
    embeds: [
      {
        title: 'Long Description',
        description: 'x'.repeat(3000),
      },
    ],
  });

  assert.equal(payload.embeds.length, 1);
  assert.ok(payload.embeds[0].description.length <= 2048);
  assert.match(payload.embeds[0].description, /\[truncated\]/);
});

test('5. buildPayload truncates embed.fields > 25 to 25 and includes a visible truncation note', () => {
  const fields = Array.from({ length: 30 }, (_, i) => ({
    name: `Field ${i + 1}`,
    value: `Value ${i + 1}`,
  }));

  const payload = buildPayload({
    content: '',
    embeds: [
      {
        title: 'Many Fields',
        description: 'Fields test',
        fields,
      },
    ],
  });

  assert.equal(payload.embeds[0].fields.length, 25);
  assert.ok(payload.content.length <= 2000);

  const visibleText = [
    payload.content,
    payload.embeds[0].description,
    payload.embeds[0].footer?.text,
  ]
    .filter(Boolean)
    .join('\n');
  assert.match(visibleText, /truncat/i);
});

test('6. buildPayload caps total embed text <= 6000 chars across multiple embeds with visible truncation note', () => {
  const embeds = Array.from({ length: 4 }, (_, i) => ({
    title: `Embed ${i + 1}`,
    description: 'z'.repeat(1900),
  }));

  assert.ok(measureEmbedText(embeds[0]) > 1900);
  assert.ok(measureTotalEmbedText(embeds) > 6000);

  const payload = buildPayload({
    content: 'Total cap test',
    embeds,
  });

  assert.ok(measureTotalEmbedText(payload.embeds) <= 6000);
  assert.ok(payload.content.length <= 2000);

  const visibleText = [
    payload.content,
    ...payload.embeds.map((e) => [e.title, e.description, e.footer?.text].filter(Boolean).join(' ')),
  ].join('\n');
  assert.match(visibleText, /truncat/i);
});

test('7. isValidWebhookUrl accepts discord.com and discordapp.com HTTPS webhooks and rejects invalid ones', () => {
  assert.equal(
    isValidWebhookUrl('https://discord.com/api/webhooks/123456/abc_XYZ').valid,
    true,
  );
  assert.equal(
    isValidWebhookUrl('https://discordapp.com/api/webhooks/987654321/token-123_ABC').valid,
    true,
  );

  assert.equal(
    isValidWebhookUrl('http://discord.com/api/webhooks/123456/abc_XYZ').valid,
    false,
  );
  assert.equal(
    isValidWebhookUrl('https://example.com/api/webhooks/1/2').valid,
    false,
  );
  assert.equal(
    isValidWebhookUrl('https://discord.com/channels/123/456').valid,
    false,
  );
  assert.equal(
    isValidWebhookUrl('https://discord.com/api/webhooks/').valid,
    false,
  );
  assert.equal(isValidWebhookUrl('not-a-url').valid, false);
  assert.equal(isValidWebhookUrl('').valid, false);
});

test('8. buildUtmUrl, buildCabalDeepLink, and buildRingBriefPayload produce expected UTM params, deep link, and valid payload', () => {
  const utmUrl = buildUtmUrl('https://example.com/game', {
    source: 'discord',
    medium: 'rings',
    campaign: 'demo-week',
  });
  const parsed = new URL(utmUrl);
  assert.equal(parsed.searchParams.get('utm_source'), 'discord');
  assert.equal(parsed.searchParams.get('utm_medium'), 'rings');
  assert.equal(parsed.searchParams.get('utm_campaign'), 'demo-week');

  const deepLink = buildCabalDeepLink({
    title: 'Starlight Tactics',
    url: 'https://example.com/game',
    ring: 'tactics-ring',
  });
  assert.ok(deepLink);
  assert.equal(typeof deepLink, 'string');
  assert.ok(deepLink.length > 0);

  const briefPayload = buildRingBriefPayload({
    title: 'Starlight Tactics',
    url: 'https://example.com/game',
    ring: 'tactics-ring',
    note: 'Playtest live this weekend.',
  });
  assert.ok(briefPayload && typeof briefPayload === 'object');
  assert.equal(typeof briefPayload.content, 'string');
  assert.ok(briefPayload.content.length <= 2000);
  assert.ok(Array.isArray(briefPayload.embeds));
  assert.ok(briefPayload.embeds.length <= 10);
  assert.ok(measureTotalEmbedText(briefPayload.embeds) <= 6000);

  const serialized = JSON.stringify(briefPayload);
  assert.match(serialized, /Draft in Cabal/);
  assert.match(serialized, /utm_source=/);
});

test('9a. sendWebhook 204 success returns ok result without sleeping or retrying', async () => {
  let fetchCalls = 0;
  let sleepCalls = 0;

  const res = await sendWebhook(
    'https://discord.com/api/webhooks/123456/abc_XYZ',
    { content: 'Hello' },
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return { ok: true, status: 204, json: async () => ({}) };
      },
      sleepImpl: async () => {
        sleepCalls += 1;
      },
    },
  );

  assert.equal(fetchCalls, 1);
  assert.equal(sleepCalls, 0);
  assert.equal(res.ok, true);
  assert.equal(res.status, 204);
  assert.equal(res.rateLimited, false);
  assert.equal(res.retried, false);
  assert.equal(res.retryAfter, 0);
  assert.equal(typeof res.message, 'string');
});

test('9b. sendWebhook 403 stops immediately without sleeping or retrying', async () => {
  let fetchCalls = 0;
  let sleepCalls = 0;

  const res = await sendWebhook(
    'https://discord.com/api/webhooks/123456/abc_XYZ',
    { content: 'Hello' },
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return { ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) };
      },
      sleepImpl: async () => {
        sleepCalls += 1;
      },
    },
  );

  assert.equal(fetchCalls, 1);
  assert.equal(sleepCalls, 0);
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
});

test('9c. sendWebhook 429 waits once for retry_after * 1000 ms, retries once, and returns result', async () => {
  let fetchCalls = 0;
  const sleepDurations = [];

  const res = await sendWebhook(
    'https://discord.com/api/webhooks/123456/abc_XYZ',
    { content: 'Hello' },
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          return {
            ok: false,
            status: 429,
            json: async () => ({ retry_after: 1.5 }),
          };
        }
        return { ok: true, status: 204, json: async () => ({}) };
      },
      sleepImpl: async (ms) => {
        sleepDurations.push(ms);
      },
    },
  );

  assert.equal(fetchCalls, 2);
  assert.deepEqual(sleepDurations, [1500]);
  assert.equal(res.ok, true);
  assert.equal(res.status, 204);
  assert.equal(res.rateLimited, true);
  assert.equal(res.retried, true);
});

test('9d. sendWebhook 429 followed by 429 stops after single retry and never loops', async () => {
  let fetchCalls = 0;
  const sleepDurations = [];

  const res = await sendWebhook(
    'https://discord.com/api/webhooks/123456/abc_XYZ',
    { content: 'Hello' },
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return {
          ok: false,
          status: 429,
          json: async () => ({ retry_after: 0.5 }),
        };
      },
      sleepImpl: async (ms) => {
        sleepDurations.push(ms);
      },
    },
  );

  assert.equal(fetchCalls, 2);
  assert.deepEqual(sleepDurations, [500]);
  assert.equal(res.ok, false);
  assert.equal(res.status, 429);
  assert.equal(res.rateLimited, true);
  assert.equal(res.retried, true);
});

test('9e. sendWebhook with invalid/non-Discord URL does not call fetchImpl', async () => {
  let fetchCalls = 0;
  let sleepCalls = 0;

  const res = await sendWebhook(
    'https://example.com/api/webhooks/1/2',
    { content: 'Hello' },
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return { ok: true, status: 204, json: async () => ({}) };
      },
      sleepImpl: async () => {
        sleepCalls += 1;
      },
    },
  );

  assert.equal(fetchCalls, 0);
  assert.equal(sleepCalls, 0);
  assert.equal(res.ok, false);
});

test('10. WEBHOOK_WARNING and ANNOUNCEMENT_GUIDE include required warnings and facts', () => {
  assert.equal(typeof WEBHOOK_WARNING, 'string');
  assert.match(WEBHOOK_WARNING, /secret/i);
  assert.match(WEBHOOK_WARNING, /rotat/i);

  const guideText =
    typeof ANNOUNCEMENT_GUIDE === 'string'
      ? ANNOUNCEMENT_GUIDE
      : JSON.stringify(ANNOUNCEMENT_GUIDE);

  assert.match(guideText, /10\s*publishes\s*\/?\s*h(ou)?r|10\s+per\s+hour/i);
  assert.match(guideText, /10\s+.*follow|follow.*10/i);
  assert.match(guideText, /@everyone/i);
  assert.match(guideText, /@here/i);
});
