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
 */
export function mount(rootEl) {
  if (!rootEl) {
    return;
  }

  const doc = rootEl.ownerDocument;
  let checklistState = createChecklistState();
  let voiceCard = loadVoiceCardFromStorage();

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

  for (const item of CHECKLIST_ITEMS) {
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
      checklistState = toggleChecklistItem(
        checklistState,
        item.id,
        checkbox.checked
      );
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
    checklistState = createChecklistState();
    for (const item of CHECKLIST_ITEMS) {
      const cb = checkboxes.get(item.id);
      if (cb) {
        cb.checked = false;
      }
    }
    renderChecklistStatus();
  });
  checklistSection.appendChild(resetBtn);

  function renderChecklistStatus() {
    const summary = getChecklistSummary(checklistState);
    if (summary.ready) {
      statusEl.textContent = `Ready (${summary.checkedCount}/${summary.totalCount} checked).`;
      statusEl.dataset.ready = 'true';
    } else {
      statusEl.textContent = `Not ready (${summary.checkedCount}/${summary.totalCount} checked, ${summary.missing.length} remaining).`;
      statusEl.dataset.ready = 'false';
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
