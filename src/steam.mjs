/**
 * Steam UTM builder and 72-hour attribution rule module.
 * Pure functions only in the core; DOM access is restricted to mount(rootEl).
 */

export const STEAM_ATTRIBUTION_RULES = Object.freeze([
  'Conversions count only if the user acts within 72 hours of the click.',
  'Only logged-in Steam users in the same browser count.',
  'Demos and playtests never count in UTM conversion reports.',
  'Reports are a floor, not the truth.',
]);

const STEAM_HOST = 'store.steampowered.com';
const APP_PATH_RE = /^\/app\/\d+(?:\/.*)?$/i;
const SALE_PATH_RE = /^\/sale\/[^/]+(?:\/.*)?$/i;
const ORG_SALE_PATH_RE = /^\/(?:publisher|developer|curator)\/[^/]+\/sale\/[^/]+(?:\/.*)?$/i;

/**
 * Normalize a free-text segment into lowercase kebab-case for UTM parameters.
 * @param {unknown} value
 * @returns {string}
 */
function slugifySegment(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Trim a string parameter, returning empty string for non-strings or whitespace.
 * @param {unknown} value
 * @returns {string}
 */
function cleanParam(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validate that appUrl is an http(s) URL on store.steampowered.com pointing to
 * an app page (/app/<digits>...) or a sale page (/sale/<slug>... or
 * /(publisher|developer|curator)/<slug>/sale/<slug>...).
 *
 * @param {string} appUrl
 * @returns {URL} Normalized URL object
 */
export function validateSteamUrl(appUrl) {
  if (typeof appUrl !== 'string' || !appUrl.trim()) {
    throw new Error('Steam URL is required.');
  }

  let url;
  try {
    url = new URL(appUrl.trim());
  } catch {
    throw new Error('Invalid Steam URL format.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Steam URL must use http: or https:.');
  }

  if (url.hostname.toLowerCase() !== STEAM_HOST) {
    throw new Error('Steam URL must be on store.steampowered.com.');
  }

  const { pathname } = url;
  const isValidPath =
    APP_PATH_RE.test(pathname) ||
    SALE_PATH_RE.test(pathname) ||
    ORG_SALE_PATH_RE.test(pathname);

  if (!isValidPath) {
    throw new Error(
      'Steam URL must point to an app page (/app/<id>) or a sale page (/sale/<slug>).',
    );
  }

  return url;
}

/**
 * Build default UTM parameters following:
 * utm_source=cabal&utm_medium=<platform>&utm_campaign=<game>-<date>&utm_content=<member>
 * Normalizes segments to lowercase kebab-case and omits empty optional fields.
 *
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {string} [options.game]
 * @param {string} [options.date]
 * @param {string} [options.member]
 * @param {string} [options.source='cabal']
 * @param {string} [options.term]
 * @returns {{ source?: string, medium?: string, campaign?: string, content?: string, term?: string }}
 */
export function defaultUtmParams({
  platform,
  game,
  date,
  member,
  source = 'cabal',
  term,
} = {}) {
  const result = {};

  const normalizedSource = slugifySegment(source);
  if (normalizedSource) {
    result.source = normalizedSource;
  }

  const normalizedMedium = slugifySegment(platform);
  if (normalizedMedium) {
    result.medium = normalizedMedium;
  }

  const gameSlug = slugifySegment(game);
  const dateSlug = slugifySegment(date);
  const normalizedCampaign = [gameSlug, dateSlug].filter(Boolean).join('-');
  if (normalizedCampaign) {
    result.campaign = normalizedCampaign;
  }

  const normalizedContent = slugifySegment(member);
  if (normalizedContent) {
    result.content = normalizedContent;
  }

  const normalizedTerm = slugifySegment(term);
  if (normalizedTerm) {
    result.term = normalizedTerm;
  }

  return result;
}

/**
 * Validate a Steam app or sale URL and append non-empty UTM parameters.
 * Requires at least one of source (utm_source) or campaign (utm_campaign).
 *
 * @param {string} appUrl
 * @param {object} [params]
 * @param {string} [params.source]
 * @param {string} [params.medium]
 * @param {string} [params.campaign]
 * @param {string} [params.content]
 * @param {string} [params.term]
 * @returns {string} Built URL string
 */
export function buildUtm(
  appUrl,
  { source, medium, campaign, content, term } = {},
) {
  const url = validateSteamUrl(appUrl);

  const utmEntries = [
    ['utm_source', cleanParam(source)],
    ['utm_medium', cleanParam(medium)],
    ['utm_campaign', cleanParam(campaign)],
    ['utm_content', cleanParam(content)],
    ['utm_term', cleanParam(term)],
  ];

  const hasSource = utmEntries[0][1].length > 0;
  const hasCampaign = utmEntries[2][1].length > 0;

  if (!hasSource && !hasCampaign) {
    throw new Error('At least one of utm_source or utm_campaign is required.');
  }

  for (const [key, value] of utmEntries) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

/**
 * Mount the Steam UTM builder, 72-hour attribution callout, and template picker.
 * @param {HTMLElement} rootEl
 */
export function mount(rootEl) {
  if (!rootEl) {
    throw new Error('mount(rootEl) requires a valid root element.');
  }

  const doc = rootEl.ownerDocument;
  rootEl.replaceChildren();

  const wrapper = doc.createElement('div');
  wrapper.className = 'steam-module';

  // --- 72-Hour Attribution Rule Callout ---
  const callout = doc.createElement('aside');
  callout.className = 'steam-attribution-callout';
  callout.setAttribute('aria-label', '72-Hour Attribution Rule');

  const calloutTitle = doc.createElement('h3');
  calloutTitle.textContent = '72-Hour Attribution Rule';
  callout.appendChild(calloutTitle);

  const ruleList = doc.createElement('ul');
  for (const rule of STEAM_ATTRIBUTION_RULES) {
    const li = doc.createElement('li');
    li.textContent = rule;
    ruleList.appendChild(li);
  }
  callout.appendChild(ruleList);
  wrapper.appendChild(callout);

  // --- UTM Builder ---
  const builderSection = doc.createElement('div');
  builderSection.className = 'steam-utm-builder';

  const makeField = (id, labelText, placeholder = '', type = 'text', initialValue = '') => {
    const field = doc.createElement('div');
    field.className = 'steam-field';

    const label = doc.createElement('label');
    label.setAttribute('for', id);
    label.textContent = labelText;

    const input = doc.createElement('input');
    input.id = id;
    input.type = type;
    input.placeholder = placeholder;
    input.value = initialValue;

    field.appendChild(label);
    field.appendChild(input);
    return { field, input };
  };

  const urlField = makeField(
    'steam-app-url',
    'Steam App or Sale URL',
    'https://store.steampowered.com/app/123456/My_Game/',
    'url',
  );
  builderSection.appendChild(urlField.field);

  // Quick-fill default naming fields
  const quickGroup = doc.createElement('fieldset');
  quickGroup.className = 'steam-quick-fill';
  const quickLegend = doc.createElement('legend');
  quickLegend.textContent = 'Quick-Fill Default Naming';
  quickGroup.appendChild(quickLegend);

  const platformField = makeField('steam-quick-platform', 'Platform (utm_medium)', 'bluesky');
  const gameField = makeField('steam-quick-game', 'Game (utm_campaign)', 'star-forge');
  const dateField = makeField('steam-quick-date', 'Date (utm_campaign)', '2026-11');
  const memberField = makeField('steam-quick-member', 'Member (utm_content)', 'alice');

  quickGroup.appendChild(platformField.field);
  quickGroup.appendChild(gameField.field);
  quickGroup.appendChild(dateField.field);
  quickGroup.appendChild(memberField.field);
  builderSection.appendChild(quickGroup);

  // Direct UTM fields
  const utmGroup = doc.createElement('fieldset');
  utmGroup.className = 'steam-utm-fields';
  const utmLegend = doc.createElement('legend');
  utmLegend.textContent = 'UTM Parameters';
  utmGroup.appendChild(utmLegend);

  const sourceField = makeField('steam-utm-source', 'utm_source', 'cabal', 'text', 'cabal');
  const mediumField = makeField('steam-utm-medium', 'utm_medium', 'bluesky');
  const campaignField = makeField('steam-utm-campaign', 'utm_campaign', 'star-forge-2026-11');
  const contentField = makeField('steam-utm-content', 'utm_content', 'alice');
  const termField = makeField('steam-utm-term', 'utm_term (optional)', 'nextfest');

  utmGroup.appendChild(sourceField.field);
  utmGroup.appendChild(mediumField.field);
  utmGroup.appendChild(campaignField.field);
  utmGroup.appendChild(contentField.field);
  utmGroup.appendChild(termField.field);
  builderSection.appendChild(utmGroup);

  // Error + Live Preview + Copy button
  const errorEl = doc.createElement('p');
  errorEl.className = 'steam-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.setAttribute('aria-live', 'polite');
  errorEl.hidden = true;
  builderSection.appendChild(errorEl);

  const previewWrap = doc.createElement('div');
  previewWrap.className = 'steam-preview-wrap';

  const previewLabel = doc.createElement('span');
  previewLabel.className = 'steam-preview-label';
  previewLabel.textContent = 'Live UTM URL Preview';
  previewWrap.appendChild(previewLabel);

  const previewOutput = doc.createElement('output');
  previewOutput.className = 'steam-preview-url';
  previewOutput.setAttribute('aria-live', 'polite');
  previewWrap.appendChild(previewOutput);

  const copyBtn = doc.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'steam-copy-btn';
  copyBtn.textContent = 'Copy URL';
  copyBtn.disabled = true;
  previewWrap.appendChild(copyBtn);

  builderSection.appendChild(previewWrap);
  wrapper.appendChild(builderSection);

  // --- Template Picker Container ---
  const templatesContainer = doc.createElement('div');
  templatesContainer.className = 'steam-templates-container';
  wrapper.appendChild(templatesContainer);

  rootEl.appendChild(wrapper);

  let currentBuiltUrl = '';
  let copyResetTimer = null;

  function updatePreview() {
    const rawUrl = urlField.input.value;
    if (!rawUrl.trim()) {
      currentBuiltUrl = '';
      previewOutput.textContent = '';
      errorEl.textContent = '';
      errorEl.hidden = true;
      copyBtn.disabled = true;
      return;
    }

    try {
      const built = buildUtm(rawUrl, {
        source: sourceField.input.value,
        medium: mediumField.input.value,
        campaign: campaignField.input.value,
        content: contentField.input.value,
        term: termField.input.value,
      });
      currentBuiltUrl = built;
      previewOutput.textContent = built;
      errorEl.textContent = '';
      errorEl.hidden = true;
      copyBtn.disabled = false;
    } catch (err) {
      currentBuiltUrl = '';
      previewOutput.textContent = '';
      errorEl.textContent = err instanceof Error ? err.message : String(err);
      errorEl.hidden = false;
      copyBtn.disabled = true;
    }
  }

  function syncFromQuickFill() {
    const defaults = defaultUtmParams({
      platform: platformField.input.value,
      game: gameField.input.value,
      date: dateField.input.value,
      member: memberField.input.value,
      source: sourceField.input.value || 'cabal',
      term: termField.input.value,
    });
    sourceField.input.value = defaults.source ?? '';
    mediumField.input.value = defaults.medium ?? '';
    campaignField.input.value = defaults.campaign ?? '';
    contentField.input.value = defaults.content ?? '';
    updatePreview();
  }

  for (const input of [
    platformField.input,
    gameField.input,
    dateField.input,
    memberField.input,
  ]) {
    input.addEventListener('input', syncFromQuickFill);
  }

  for (const input of [
    urlField.input,
    sourceField.input,
    mediumField.input,
    campaignField.input,
    contentField.input,
    termField.input,
  ]) {
    input.addEventListener('input', updatePreview);
  }

  async function copyText(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to execCommand fallback
      }
    }

    const textarea = doc.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    doc.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = doc.execCommand('copy');
    } catch {
      ok = false;
    }
    textarea.remove();
    return ok;
  }

  copyBtn.addEventListener('click', async () => {
    if (!currentBuiltUrl) {
      return;
    }
    const copied = await copyText(currentBuiltUrl);
    if (copyResetTimer) {
      clearTimeout(copyResetTimer);
    }
    copyBtn.textContent = copied ? 'Copied!' : 'Copy failed';
    copyResetTimer = setTimeout(() => {
      copyBtn.textContent = 'Copy URL';
    }, 1500);
  });

  updatePreview();

  // Load and mount the campaign template picker cleanly.
  import('./templates.mjs')
    .then((mod) => {
      if (typeof mod?.mount === 'function') {
        mod.mount(templatesContainer);
      }
    })
    .catch((err) => {
      console.warn('Could not load ./templates.mjs:', err);
      const note = doc.createElement('p');
      note.className = 'steam-templates-fallback';
      note.textContent = 'Campaign templates are unavailable.';
      templatesContainer.replaceChildren(note);
    });
}
