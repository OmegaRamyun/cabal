import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIntent, checkLimit } from '../src/intents.mjs';

test('plain text', () => {
  assert.equal(buildIntent('x', { text: 'hello world' }), 'https://x.com/intent/post?text=hello%20world');
  assert.equal(buildIntent('bluesky', { text: 'hello world' }), 'https://bsky.app/intent/compose?text=hello%20world');
  assert.equal(buildIntent('threads', { text: 'hello world' }), 'https://www.threads.net/intent/post?text=hello%20world');
  assert.equal(buildIntent('reddit', { text: 'hello world' }), 'https://www.reddit.com/submit?url=&title=hello%20world');
});

test('text with & and newlines', () => {
  const text = 'a & b\nline two';
  assert.equal(buildIntent('x', { text }), 'https://x.com/intent/post?text=a%20%26%20b%0Aline%20two');
  assert.equal(buildIntent('bluesky', { text }), 'https://bsky.app/intent/compose?text=a%20%26%20b%0Aline%20two');
  assert.equal(buildIntent('threads', { text }), 'https://www.threads.net/intent/post?text=a%20%26%20b%0Aline%20two');
});

test('text with a URL', () => {
  const text = 'Check this out';
  const url = 'https://example.com/a?b=1&c=2';
  assert.equal(buildIntent('x', { text, url }),
    'https://x.com/intent/post?text=Check%20this%20out&url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2');
  assert.equal(buildIntent('bluesky', { text, url }),
    'https://bsky.app/intent/compose?text=Check%20this%20out%0Ahttps%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2');
  assert.equal(buildIntent('threads', { text, url }),
    'https://www.threads.net/intent/post?text=Check%20this%20out%0Ahttps%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2');
  assert.equal(buildIntent('reddit', { text, url }),
    'https://www.reddit.com/submit?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2&title=Check%20this%20out');
});

test('over-limit text rejected', () => {
  assert.throws(() => buildIntent('x', { text: 'a'.repeat(281) }), /Over the X limit by 1 /);
  assert.throws(() => buildIntent('bluesky', { text: 'a'.repeat(301) }), /Over the Bluesky limit by 1 /);
  assert.throws(() => buildIntent('threads', { text: 'a'.repeat(501) }), /Over the Threads limit by 1 /);
});

test('limits: boundaries, t.co weight, graphemes, bytes', () => {
  assert.equal(checkLimit('x', { text: 'a'.repeat(280) }).remaining, 0);
  // url = 23 + 1 joining space -> 256 chars of text fit
  assert.equal(checkLimit('x', { text: 'a'.repeat(256), url: 'https://example.com/long/path' }).ok, true);
  assert.equal(checkLimit('x', { text: 'a'.repeat(257), url: 'https://example.com/long/path' }).ok, false);
  assert.equal(checkLimit('bluesky', { text: 'a'.repeat(300) }).ok, true);
  // 300 family emoji = 300 graphemes but far over 3000 bytes
  const fam = '\u{1F468}‍\u{1F469}‍\u{1F467}'.repeat(300);
  const r = checkLimit('bluesky', { text: fam });
  assert.equal(r.ok, false);
  assert.match(r.message, /bytes/);
  assert.equal(checkLimit('threads', { text: 'a'.repeat(500) }).remaining, 0);
});
