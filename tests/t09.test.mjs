import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHECKLIST_ITEMS,
  VOICE_CARD_MAX,
  VOICE_CARD_MIN,
  VOICE_CARD_STORAGE_KEY,
  createChecklistState,
  createVoiceCard,
  getChecklistSummary,
  getMissingItems,
  isChecklistReady,
  normalizeVoiceEntry,
  parseVoiceCard,
  serializeVoiceCard,
  toggleChecklistItem,
  validateVoiceCard,
} from '../src/checklist.mjs';

const ALL_CHECKED_FIXTURE = Object.freeze({
  ownWords: true,
  similarityGate: true,
  disclosure: true,
  utmLink: true,
  timing: true,
  oneGame: true,
});

const ONE_MISSING_FIXTURE = Object.freeze({
  ownWords: true,
  similarityGate: true,
  disclosure: false,
  utmLink: true,
  timing: true,
  oneGame: true,
});

const EMPTY_FIXTURE = Object.freeze({});

describe('CHECKLIST_ITEMS', () => {
  it('exports a frozen array of the 6 pre-post checklist items', () => {
    assert.equal(Object.isFrozen(CHECKLIST_ITEMS), true);
    assert.equal(CHECKLIST_ITEMS.length, 6);
    assert.deepEqual(
      CHECKLIST_ITEMS.map((item) => item.id),
      ['ownWords', 'similarityGate', 'disclosure', 'utmLink', 'timing', 'oneGame']
    );
    for (const item of CHECKLIST_ITEMS) {
      assert.equal(Object.isFrozen(item), true);
      assert.equal(typeof item.label, 'string');
      assert.ok(item.label.length > 0);
    }
  });
});

describe('checklist state fixtures', () => {
  it('handles all-checked fixture as ready with zero missing items', () => {
    const state = createChecklistState(ALL_CHECKED_FIXTURE);
    assert.equal(isChecklistReady(state), true);
    assert.deepEqual(getMissingItems(state), []);
    assert.deepEqual(getChecklistSummary(state), {
      ready: true,
      checkedCount: 6,
      totalCount: 6,
      missing: [],
    });
  });

  it('handles one-missing fixture as not ready with the exact missing item', () => {
    const state = createChecklistState(ONE_MISSING_FIXTURE);
    assert.equal(isChecklistReady(state), false);
    const missing = getMissingItems(state);
    assert.equal(missing.length, 1);
    assert.equal(missing[0].id, 'disclosure');
    assert.deepEqual(getChecklistSummary(state), {
      ready: false,
      checkedCount: 5,
      totalCount: 6,
      missing,
    });
  });

  it('handles empty fixture as not ready with all 6 items missing', () => {
    const state = createChecklistState(EMPTY_FIXTURE);
    assert.equal(isChecklistReady(state), false);
    const missing = getMissingItems(state);
    assert.equal(missing.length, 6);
    assert.deepEqual(getChecklistSummary(state), {
      ready: false,
      checkedCount: 0,
      totalCount: 6,
      missing,
    });
  });
});

describe('toggleChecklistItem', () => {
  it('returns a new state object without mutating the original state', () => {
    const initial = createChecklistState(EMPTY_FIXTURE);
    const updated = toggleChecklistItem(initial, 'ownWords', true);

    assert.notEqual(updated, initial);
    assert.equal(initial.ownWords, false);
    assert.equal(updated.ownWords, true);

    const toggledOff = toggleChecklistItem(updated, 'ownWords');
    assert.equal(toggledOff.ownWords, false);
    assert.equal(updated.ownWords, true);
  });

  it('ignores unknown item ids while still returning a new state object', () => {
    const initial = createChecklistState(ONE_MISSING_FIXTURE);
    const next = toggleChecklistItem(initial, 'nonExistentRule', true);

    assert.notEqual(next, initial);
    assert.deepEqual(next, initial);
    assert.equal('nonExistentRule' in next, false);
  });
});

describe('Voice Card pure functions', () => {
  it('exposes expected constants', () => {
    assert.equal(VOICE_CARD_MIN, 3);
    assert.equal(VOICE_CARD_MAX, 5);
    assert.equal(VOICE_CARD_STORAGE_KEY, 'cabal.voiceCard.v1');
  });

  it('normalizes entries to { link, text } strings', () => {
    assert.deepEqual(normalizeVoiceEntry(null), { link: '', text: '' });
    assert.deepEqual(
      normalizeVoiceEntry({ link: 'https://example.com/1', text: 123 }),
      { link: 'https://example.com/1', text: '' }
    );
  });

  it('createVoiceCard pads to at least 3 and caps at 5 entries', () => {
    const emptyCard = createVoiceCard();
    assert.equal(emptyCard.length, 3);
    assert.deepEqual(emptyCard, [
      { link: '', text: '' },
      { link: '', text: '' },
      { link: '', text: '' },
    ]);

    const oneCard = createVoiceCard([{ link: 'https://a.test', text: 'Post A' }]);
    assert.equal(oneCard.length, 3);
    assert.deepEqual(oneCard[0], { link: 'https://a.test', text: 'Post A' });
    assert.deepEqual(oneCard[2], { link: '', text: '' });

    const sevenEntries = Array.from({ length: 7 }, (_, i) => ({
      link: `https://example.com/${i}`,
      text: `Post ${i}`,
    }));
    const cappedCard = createVoiceCard(sevenEntries);
    assert.equal(cappedCard.length, 5);
    assert.equal(cappedCard[4].text, 'Post 4');
  });

  it('validateVoiceCard enforces 3-5 filled reference posts', () => {
    const tooFew = validateVoiceCard([
      { link: 'https://example.com/1', text: '' },
      { link: '', text: 'Second post' },
      { link: '   ', text: '  ' },
    ]);
    assert.equal(tooFew.valid, false);
    assert.equal(tooFew.filledCount, 2);
    assert.equal(tooFew.min, 3);
    assert.equal(tooFew.max, 5);

    const validThree = validateVoiceCard([
      { link: 'https://example.com/1', text: 'One' },
      { link: '', text: 'Two' },
      { link: 'https://example.com/3', text: '' },
    ]);
    assert.equal(validThree.valid, true);
    assert.equal(validThree.filledCount, 3);

    const tooMany = validateVoiceCard(
      Array.from({ length: 6 }, (_, i) => ({ link: '', text: `Post ${i}` }))
    );
    assert.equal(tooMany.valid, false);
    assert.equal(tooMany.filledCount, 6);
  });

  it('serializeVoiceCard and parseVoiceCard round-trip cleanly and fall back on invalid JSON', () => {
    const entries = [
      { link: 'https://bsky.app/profile/dev/1', text: 'Devlog #1' },
      { link: 'https://bsky.app/profile/dev/2', text: 'Devlog #2' },
      { link: '', text: 'Devlog #3' },
      { link: 'https://bsky.app/profile/dev/4', text: 'Devlog #4' },
    ];
    const json = serializeVoiceCard(entries);
    const parsed = parseVoiceCard(json);
    assert.deepEqual(parsed, entries);

    assert.deepEqual(parseVoiceCard('not valid json {'), createVoiceCard());
    assert.deepEqual(parseVoiceCard('{"not":"an array"}'), createVoiceCard());
    assert.deepEqual(parseVoiceCard(''), createVoiceCard());
  });
});
