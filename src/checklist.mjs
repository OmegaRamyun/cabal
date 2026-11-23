export const CHECKLIST_ITEMS = Object.freeze([
  Object.freeze({ id: 'ownWords', label: 'I wrote this in my own words' }),
  Object.freeze({
    id: 'similarityGate',
    label: 'Similarity gate passed (or I rewrote after a warning)',
  }),
  Object.freeze({
    id: 'disclosure',
    label: 'Disclosure line present where a relationship exists',
  }),
  Object.freeze({
    id: 'utmLink',
    label: 'Link is a UTM / referral-tagged link where applicable',
  }),
  Object.freeze({
    id: 'timing',
    label: "Timing is my audience's time, not a synchronised burst",
  }),
  Object.freeze({
    id: 'oneGame',
    label: 'This is one shared game today, not a stack',
  }),
]);

const CHECKLIST_IDS = new Set(CHECKLIST_ITEMS.map((item) => item.id));

export const VOICE_CARD_MIN = 3;
export const VOICE_CARD_MAX = 5;
export const VOICE_CARD_STORAGE_KEY = 'cabal.voiceCard.v1';

/**
 * Create a normalized checklist state object containing all 6 checklist keys.
 */
export function createChecklistState(initial = {}) {
  const source = initial && typeof initial === 'object' ? initial : {};
  const state = {};
  for (const item of CHECKLIST_ITEMS) {
    state[item.id] = Boolean(source[item.id]);
  }
  return state;
}

/**
 * Return a new checklist state with `id` updated, ignoring unknown ids.
 */
export function toggleChecklistItem(state, id, checked) {
  const next = createChecklistState(state);
  if (!CHECKLIST_IDS.has(id)) {
    return next;
  }
  next[id] = checked === undefined ? !next[id] : Boolean(checked);
  return next;
}

/**
 * Return true iff all 6 checklist items are checked.
 */
export function isChecklistReady(state) {
  const normalized = createChecklistState(state);
  return CHECKLIST_ITEMS.every((item) => normalized[item.id] === true);
}

/**
 * Return the array of unchecked `{ id, label }` items in checklist order.
 */
export function getMissingItems(state) {
  const normalized = createChecklistState(state);
  return CHECKLIST_ITEMS.filter((item) => !normalized[item.id]);
}

/**
 * Return a summary object for the current checklist state.
 */
export function getChecklistSummary(state) {
  const missing = getMissingItems(state);
  const totalCount = CHECKLIST_ITEMS.length;
  const checkedCount = totalCount - missing.length;
  return {
    ready: missing.length === 0,
    checkedCount,
    totalCount,
    missing,
  };
}

// --- v0.2: per-campaign checklist state (V26) ---

export const CAMPAIGN_CHECKLIST_STORAGE_PREFIX = 'cabal.v2.checklist.';

export const CAMPAIGN_CHECKLIST_ITEMS = Object.freeze([
  Object.freeze({ id: 'anchorLink', label: 'Anchor post link works' }),
  Object.freeze({
    id: 'ownWordsEveryMember',
    label: "Every member's quote is in their own words",
  }),
]);

const CAMPAIGN_CHECKLIST_IDS = new Set(
  CAMPAIGN_CHECKLIST_ITEMS.map((item) => item.id)
);

/**
 * Storage key for one campaign's checklist state. Two campaigns never
 * share a key, so their states never collide.
 */
export function checklistKey(campaignId) {
  const id = String(campaignId ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '-');
  return `${CAMPAIGN_CHECKLIST_STORAGE_PREFIX}${id}`;
}

/**
 * The checklist items for a campaign: the 6 standard pre-post items plus
 * the campaign-specific items. `campaign` is accepted for future
 * per-campaign variance; the item set is the same for every campaign today.
 */
export function campaignChecklistItems(campaign) {
  void campaign;
  return [...CHECKLIST_ITEMS, ...CAMPAIGN_CHECKLIST_ITEMS];
}

function createCampaignChecklistState(initial = {}) {
  const source = initial && typeof initial === 'object' ? initial : {};
  const state = {};
  for (const item of campaignChecklistItems()) {
    state[item.id] = Boolean(source[item.id]);
  }
  return state;
}

/**
 * Create a fresh per-campaign checklist: `{ campaignId, key, state }`.
 * `state` covers all 8 campaign checklist items, all unchecked by default.
 * Each call returns an independent state object — two campaigns never
 * share state.
 */
export function createCampaignChecklist(campaignId, initial = {}) {
  return {
    campaignId: String(campaignId ?? ''),
    key: checklistKey(campaignId),
    state: createCampaignChecklistState(initial),
  };
}

/**
 * Return a new campaign checklist with `id` updated, ignoring unknown ids.
 */
export function toggleCampaignChecklistItem(checklist, id, checked) {
  const source =
    checklist && typeof checklist === 'object' ? checklist : {};
  const nextState = createCampaignChecklistState(source.state);
  if (
    !CHECKLIST_IDS.has(id) &&
    !CAMPAIGN_CHECKLIST_IDS.has(id)
  ) {
    return { ...source, state: nextState };
  }
  nextState[id] =
    checked === undefined ? !nextState[id] : Boolean(checked);
  return { ...source, state: nextState };
}

/**
 * Return true iff all 8 campaign checklist items are checked.
 */
export function isCampaignChecklistReady(checklist) {
  const state = createCampaignChecklistState(
    checklist && typeof checklist === 'object' ? checklist.state : {}
  );
  return campaignChecklistItems().every(
    (item) => state[item.id] === true
  );
}

/**
 * Return the array of unchecked `{ id, label }` campaign items, in order.
 */
export function getCampaignMissingItems(checklist) {
  const state = createCampaignChecklistState(
    checklist && typeof checklist === 'object' ? checklist.state : {}
  );
  return campaignChecklistItems().filter((item) => !state[item.id]);
}

/**
 * Normalize a single Voice Card entry into `{ link, text }`.
 */
export function normalizeVoiceEntry(entry) {
  const source = entry && typeof entry === 'object' ? entry : {};
  return {
    link: typeof source.link === 'string' ? source.link : '',
    text: typeof source.text === 'string' ? source.text : '',
  };
}

/**
 * Normalize Voice Card entries, capping at 5 and padding to at least 3 slots.
 */
export function createVoiceCard(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const normalized = list.slice(0, VOICE_CARD_MAX).map(normalizeVoiceEntry);
  while (normalized.length < VOICE_CARD_MIN) {
    normalized.push({ link: '', text: '' });
  }
  return normalized;
}

function isVoiceEntryFilled(entry) {
  return entry.link.trim().length > 0 || entry.text.trim().length > 0;
}

/**
 * Validate a Voice Card array against the 3-5 reference post bounds.
 */
export function validateVoiceCard(entries) {
  const list = Array.isArray(entries) ? entries.map(normalizeVoiceEntry) : [];
  const filledCount = list.filter(isVoiceEntryFilled).length;

  if (filledCount < VOICE_CARD_MIN) {
    const remaining = VOICE_CARD_MIN - filledCount;
    return {
      valid: false,
      filledCount,
      min: VOICE_CARD_MIN,
      max: VOICE_CARD_MAX,
      message: `Add ${remaining} more post${remaining === 1 ? '' : 's'} for your local Voice Card (${filledCount}/${VOICE_CARD_MIN} minimum).`,
    };
  }

  if (filledCount > VOICE_CARD_MAX) {
    return {
      valid: false,
      filledCount,
      min: VOICE_CARD_MIN,
      max: VOICE_CARD_MAX,
      message: `Voice Card supports at most ${VOICE_CARD_MAX} posts (${filledCount}/${VOICE_CARD_MAX}).`,
    };
  }

  return {
    valid: true,
    filledCount,
    min: VOICE_CARD_MIN,
    max: VOICE_CARD_MAX,
    message: `Voice Card ready (${filledCount} local reference posts).`,
  };
}

/**
 * Serialize Voice Card entries to JSON after normalization.
 */
export function serializeVoiceCard(entries) {
  return JSON.stringify(createVoiceCard(entries));
}

/**
 * Safely parse stored Voice Card JSON, falling back to an empty 3-slot card.
 */
export function parseVoiceCard(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return createVoiceCard();
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return createVoiceCard();
    }
    return createVoiceCard(parsed);
  } catch {
    return createVoiceCard();
  }
}

function resolveChecklistStorage(storage) {
  if (storage && typeof storage.getItem === "function") return storage;
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === "function") return ls;
  } catch { /* no storage */ }
  return null;
}

/**
 * Load a campaign's checklist from storage (own key only,
 * `cabal.v2.checklist.<id>`). Returns the { campaignId, key, state }
 * object — fresh (all unchecked) when nothing is stored or the stored
 * JSON is corrupt. Tolerates a bare state object as well as the full
 * { campaignId, key, state } shape.
 */
export function loadCampaignChecklistState(campaignId, storage) {
  const s = resolveChecklistStorage(storage);
  let stored = null;
  try {
    const raw = s ? s.getItem(checklistKey(campaignId)) : null;
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }
  const initial =
    stored && typeof stored === "object" ? (stored.state ?? stored) : {};
  return createCampaignChecklist(campaignId, initial);
}

/** Save a campaign checklist object to its own storage key. */
export function saveCampaignChecklistState(checklist, storage) {
  const s = resolveChecklistStorage(storage);
  try {
    if (s && checklist && checklist.campaignId) {
      s.setItem(checklistKey(checklist.campaignId), JSON.stringify(checklist));
    }
  } catch { /* ignore storage errors */ }
}

function loadVoiceCardFromStorage() {
  try {
    const raw = window.localStorage.getItem(VOICE_CARD_STORAGE_KEY);
    return parseVoiceCard(raw);
  } catch {
    return createVoiceCard();
  }
}

function saveVoiceCardToStorage(entries) {
  try {
    window.localStorage.setItem(
      VOICE_CARD_STORAGE_KEY,
      serializeVoiceCard(entries)
    );
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

/**
 * Mount the pre-post checklist and local Voice Card UI into `rootEl`.
 * Optional ctx (V36, additive — no ctx means the v0.1 in-memory 6-item
 * list, exactly as before):
 *   campaignId — per-campaign mode: the 8-item checklist, persisted
 *     under `cabal.v2.checklist.<id>`.
 *   storage — storage-like object for the campaign state (tests);
 *     defaults to localStorage.
 *   onReadyChange(ready, checklist) — called when campaign readiness
 *     flips (and once on mount with the loaded state); the field
 *     journal's Rest Point listens here.
 */
export function mount(rootEl, ctx = {}) {
  if (!rootEl) {
    return;
  }

  const doc = rootEl.ownerDocument;
  const campaignId = ctx.campaignId ? String(ctx.campaignId).trim() : "";
  const isCampaign = campaignId.length > 0;
  const storage = resolveChecklistStorage(ctx.storage);
  const items = isCampaign ? campaignChecklistItems() : CHECKLIST_ITEMS;
  let campaignChecklist = isCampaign
    ? loadCampaignChecklistState(campaignId, storage)
    : null;
  let checklistState = isCampaign
    ? createCampaignChecklistState(campaignChecklist.state)
    : createChecklistState();
  let voiceCard = loadVoiceCardFromStorage();
  let prevReady = null;

  rootEl.textContent = '';

  const container = doc.createElement('div');
  container.className = 'cabal-checklist-module';

  // --- Pre-post checklist section ---
  const checklistSection = doc.createElement('section');
  checklistSection.setAttribute('aria-labelledby', 'cabal-checklist-heading');

  const checklistHeading = doc.createElement('h2');
  checklistHeading.id = 'cabal-checklist-heading';
  checklistHeading.textContent = 'Pre-Post Checklist';
  checklistSection.appendChild(checklistHeading);

  const checklistIntro = doc.createElement('p');
  checklistIntro.textContent =
    'Last-mile human check before you open a platform composer.';
  checklistSection.appendChild(checklistIntro);

  const statusEl = doc.createElement('p');
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');
  checklistSection.appendChild(statusEl);

  const listEl = doc.createElement('ul');
  listEl.style.listStyle = 'none';
  listEl.style.padding = '0';

  const checkboxes = new Map();

  for (const item of items) {
    const li = doc.createElement('li');
    const label = doc.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '0.75rem';
    label.style.minHeight = '44px';
    label.style.cursor = 'pointer';

    const checkbox = doc.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = item.id;
    checkbox.checked = checklistState[item.id];
    checkbox.style.minWidth = '24px';
    checkbox.style.minHeight = '24px';

    checkbox.addEventListener('change', () => {
      if (isCampaign) {
        campaignChecklist = toggleCampaignChecklistItem(
          campaignChecklist,
          item.id,
          checkbox.checked
        );
        checklistState = createCampaignChecklistState(campaignChecklist.state);
        saveCampaignChecklistState(campaignChecklist, storage);
      } else {
        checklistState = toggleChecklistItem(
          checklistState,
          item.id,
          checkbox.checked
        );
      }
      renderChecklistStatus();
    });

    const textSpan = doc.createElement('span');
    textSpan.textContent = item.label;

    label.appendChild(checkbox);
    label.appendChild(textSpan);
    li.appendChild(label);
    listEl.appendChild(li);
    checkboxes.set(item.id, checkbox);
  }

  checklistSection.appendChild(listEl);

  const resetBtn = doc.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset checklist';
  resetBtn.style.minHeight = '44px';
  resetBtn.style.minWidth = '44px';
  resetBtn.addEventListener('click', () => {
    if (isCampaign) {
      campaignChecklist = createCampaignChecklist(campaignId);
      checklistState = createCampaignChecklistState(campaignChecklist.state);
      saveCampaignChecklistState(campaignChecklist, storage);
    } else {
      checklistState = createChecklistState();
    }
    for (const item of items) {
      const cb = checkboxes.get(item.id);
      if (cb) {
        cb.checked = false;
      }
    }
    renderChecklistStatus();
  });
  checklistSection.appendChild(resetBtn);

  function renderChecklistStatus() {
    let ready;
    let checkedCount;
    let totalCount;
    let missingCount;
    if (isCampaign) {
      const missing = getCampaignMissingItems({ state: checklistState });
      totalCount = items.length;
      missingCount = missing.length;
      checkedCount = totalCount - missingCount;
      ready = missingCount === 0;
    } else {
      const summary = getChecklistSummary(checklistState);
      ready = summary.ready;
      checkedCount = summary.checkedCount;
      totalCount = summary.totalCount;
      missingCount = summary.missing.length;
    }
    if (ready) {
      statusEl.textContent = `Ready (${checkedCount}/${totalCount} checked).`;
      statusEl.dataset.ready = 'true';
    } else {
      statusEl.textContent = `Not ready (${checkedCount}/${totalCount} checked, ${missingCount} remaining).`;
      statusEl.dataset.ready = 'false';
    }
    if (isCampaign && typeof ctx.onReadyChange === 'function' && ready !== prevReady) {
      prevReady = ready;
      ctx.onReadyChange(ready, { state: checklistState });
    }
  }

  renderChecklistStatus();
  container.appendChild(checklistSection);

  // --- Voice Card section ---
  const voiceSection = doc.createElement('section');
  voiceSection.setAttribute('aria-labelledby', 'cabal-voice-card-heading');

  const voiceHeading = doc.createElement('h2');
  voiceHeading.id = 'cabal-voice-card-heading';
  voiceHeading.textContent = 'Voice Card (3–5 of your best posts)';
  voiceSection.appendChild(voiceHeading);

  const voiceNotice = doc.createElement('p');
  voiceNotice.textContent =
    'Local human reference only — stored in this browser (localStorage), never used as training data, and never sent anywhere.';
  voiceSection.appendChild(voiceNotice);

  const voiceStatusEl = doc.createElement('p');
  voiceStatusEl.setAttribute('role', 'status');
  voiceStatusEl.setAttribute('aria-live', 'polite');
  voiceSection.appendChild(voiceStatusEl);

  const slotsContainer = doc.createElement('div');
  voiceSection.appendChild(slotsContainer);

  const addSlotBtn = doc.createElement('button');
  addSlotBtn.type = 'button';
  addSlotBtn.textContent = 'Add post slot';
  addSlotBtn.style.minHeight = '44px';
  addSlotBtn.style.minWidth = '44px';
  addSlotBtn.addEventListener('click', () => {
    if (voiceCard.length >= VOICE_CARD_MAX) {
      return;
    }
    voiceCard = [...voiceCard, { link: '', text: '' }];
    saveVoiceCardToStorage(voiceCard);
    renderVoiceCard();
  });
  voiceSection.appendChild(addSlotBtn);

  function updateVoiceStatus() {
    const validation = validateVoiceCard(voiceCard);
    voiceStatusEl.textContent = validation.message;
    voiceStatusEl.dataset.valid = validation.valid ? 'true' : 'false';
  }

  function renderVoiceCard() {
    slotsContainer.textContent = '';

    voiceCard.forEach((entry, index) => {
      const fieldset = doc.createElement('fieldset');

      const legend = doc.createElement('legend');
      legend.textContent = `Reference post ${index + 1}`;
      fieldset.appendChild(legend);

      const linkLabel = doc.createElement('label');
      linkLabel.style.display = 'block';
      linkLabel.textContent = 'Post link (optional)';

      const linkInput = doc.createElement('input');
      linkInput.type = 'url';
      linkInput.placeholder = 'https://...';
      linkInput.value = entry.link;
      linkInput.style.display = 'block';
      linkInput.style.width = '100%';
      linkInput.style.minHeight = '44px';
      linkInput.addEventListener('input', () => {
        voiceCard[index] = { ...voiceCard[index], link: linkInput.value };
        saveVoiceCardToStorage(voiceCard);
        updateVoiceStatus();
      });
      linkLabel.appendChild(linkInput);
      fieldset.appendChild(linkLabel);

      const textLabel = doc.createElement('label');
      textLabel.style.display = 'block';
      textLabel.textContent = 'Post text';

      const textArea = doc.createElement('textarea');
      textArea.rows = 3;
      textArea.value = entry.text;
      textArea.style.display = 'block';
      textArea.style.width = '100%';
      textArea.style.minHeight = '44px';
      textArea.addEventListener('input', () => {
        voiceCard[index] = { ...voiceCard[index], text: textArea.value };
        saveVoiceCardToStorage(voiceCard);
        updateVoiceStatus();
      });
      textLabel.appendChild(textArea);
      fieldset.appendChild(textLabel);

      if (voiceCard.length > VOICE_CARD_MIN) {
        const removeBtn = doc.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'Remove slot';
        removeBtn.style.minHeight = '44px';
        removeBtn.style.minWidth = '44px';
        removeBtn.addEventListener('click', () => {
          if (voiceCard.length <= VOICE_CARD_MIN) {
            return;
          }
          voiceCard = voiceCard.filter((_, i) => i !== index);
          saveVoiceCardToStorage(voiceCard);
          renderVoiceCard();
        });
        fieldset.appendChild(removeBtn);
      }

      slotsContainer.appendChild(fieldset);
    });

    addSlotBtn.disabled = voiceCard.length >= VOICE_CARD_MAX;
    updateVoiceStatus();
  }

  renderVoiceCard();
  container.appendChild(voiceSection);
  rootEl.appendChild(container);
}
