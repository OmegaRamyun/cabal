/**
 * Discord #rings bridge — incoming webhook payload builder, sender, and UI mount.
 * Vanilla ES module, zero dependencies.
 */

export const DISCORD_LIMITS = Object.freeze({
  CONTENT_MAX: 2000,
  EMBEDS_MAX: 10,
  EMBED_DESCRIPTION_MAX: 2048,
  EMBED_TOTAL_TEXT_MAX: 6000,
  EMBED_FIELDS_MAX: 25,
  EMBED_TITLE_MAX: 256,
  FIELD_NAME_MAX: 256,
  FIELD_VALUE_MAX: 1024,
  FOOTER_TEXT_MAX: 2048,
  AUTHOR_NAME_MAX: 256,
});

export const STORAGE_KEY = "cabal.discord.webhookUrl";

export const WEBHOOK_WARNING =
  "A Discord webhook URL is a write credential — treat it like a secret. Never commit it or share it publicly. Rotate it by deleting and recreating the webhook in Discord.";

export const ANNOUNCEMENT_GUIDE = Object.freeze([
  "10 publishes/hour per announcement channel",
  "One channel can follow at most 10 announcement channels",
  "@everyone and @here are stripped in followed copies",
]);

const ALLOWED_WEBHOOK_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "canary.discord.com",
  "ptb.discord.com",
]);

const WEBHOOK_PATH_RE = /^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/;
const TRUNCATED_SUFFIX = " [truncated]";

/**
 * Validate a Discord incoming webhook URL.
 * @param {string} url
 * @returns {{ valid: boolean, reason?: string, url?: string }}
 */
export function isValidWebhookUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return { valid: false, reason: "Webhook URL is required." };
  }

  const trimmed = url.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: "Invalid URL format." };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "Webhook URL must use https:." };
  }

  if (!ALLOWED_WEBHOOK_HOSTS.has(parsed.hostname.toLowerCase())) {
    return {
      valid: false,
      reason:
        "Hostname must be discord.com, discordapp.com, canary.discord.com, or ptb.discord.com.",
    };
  }

  if (!WEBHOOK_PATH_RE.test(parsed.pathname)) {
    return {
      valid: false,
      reason: "Pathname must match /api/webhooks/<id>/<token>.",
    };
  }

  return { valid: true, url: parsed.toString() };
}

/**
 * Measure total text length of a single Discord embed across title,
 * description, footer.text, author.name, and all field names/values.
 * @param {object} embed
 * @returns {number}
 */
export function measureEmbedText(embed) {
  if (!embed || typeof embed !== "object") return 0;

  let total = 0;
  if (typeof embed.title === "string") total += embed.title.length;
  if (typeof embed.description === "string") total += embed.description.length;
  if (embed.footer && typeof embed.footer.text === "string") {
    total += embed.footer.text.length;
  }
  if (embed.author && typeof embed.author.name === "string") {
    total += embed.author.name.length;
  }
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      if (!field || typeof field !== "object") continue;
      if (typeof field.name === "string") total += field.name.length;
      if (typeof field.value === "string") total += field.value.length;
    }
  }
  return total;
}

/**
 * Measure total text length across an array of Discord embeds.
 * @param {Array<object>} embeds
 * @returns {number}
 */
export function measureTotalEmbedText(embeds) {
  if (!Array.isArray(embeds)) return 0;
  let total = 0;
  for (const embed of embeds) {
    total += measureEmbedText(embed);
  }
  return total;
}

function truncateWithNote(text, maxLen, note = TRUNCATED_SUFFIX) {
  const str = text == null ? "" : String(text);
  if (str.length <= maxLen) return str;
  if (maxLen <= 0) return "";
  if (maxLen <= note.length) return note.trimStart().slice(0, maxLen);
  return str.slice(0, maxLen - note.length) + note;
}

function appendNoteToText(text, note, maxLen) {
  const base = text == null ? "" : String(text);
  if (!note) return truncateWithNote(base, maxLen);
  if (!base) return truncateWithNote(note, maxLen);

  const combined = `${base}\n${note}`;
  if (combined.length <= maxLen) return combined;

  if (note.length + 1 >= maxLen) {
    return note.slice(0, maxLen);
  }
  const available = maxLen - note.length - 1;
  const prefix =
    base.length > available ? truncateWithNote(base, available) : base;
  return `${prefix}\n${note}`;
}

function normalizeEmbed(rawEmbed) {
  const src = rawEmbed && typeof rawEmbed === "object" ? rawEmbed : {};
  const embed = {};

  if (src.color !== undefined) embed.color = src.color;
  if (src.url !== undefined) embed.url = src.url;
  if (src.timestamp !== undefined) embed.timestamp = src.timestamp;

  if (src.title != null) {
    embed.title = truncateWithNote(src.title, DISCORD_LIMITS.EMBED_TITLE_MAX);
  }
  if (src.description != null) {
    embed.description = truncateWithNote(
      src.description,
      DISCORD_LIMITS.EMBED_DESCRIPTION_MAX
    );
  }
  if (src.author && typeof src.author === "object") {
    embed.author = { ...src.author };
    if (src.author.name != null) {
      embed.author.name = truncateWithNote(
        src.author.name,
        DISCORD_LIMITS.AUTHOR_NAME_MAX
      );
    }
  }
  if (src.footer && typeof src.footer === "object") {
    embed.footer = { ...src.footer };
    if (src.footer.text != null) {
      embed.footer.text = truncateWithNote(
        src.footer.text,
        DISCORD_LIMITS.FOOTER_TEXT_MAX
      );
    }
  }

  if (Array.isArray(src.fields)) {
    const omittedFields = Math.max(
      0,
      src.fields.length - DISCORD_LIMITS.EMBED_FIELDS_MAX
    );
    const sliced = src.fields.slice(0, DISCORD_LIMITS.EMBED_FIELDS_MAX);
    embed.fields = sliced.map((f) => {
      const fieldObj = f && typeof f === "object" ? f : {};
      const normalized = {
        name: truncateWithNote(
          fieldObj.name ?? "",
          DISCORD_LIMITS.FIELD_NAME_MAX
        ),
        value: truncateWithNote(
          fieldObj.value ?? "",
          DISCORD_LIMITS.FIELD_VALUE_MAX
        ),
      };
      if (typeof fieldObj.inline === "boolean") {
        normalized.inline = fieldObj.inline;
      }
      return normalized;
    });

    if (omittedFields > 0) {
      const note = `[truncated: ${omittedFields} field(s) omitted]`;
      embed.footer = embed.footer ? { ...embed.footer } : {};
      embed.footer.text = appendNoteToText(
        embed.footer.text ?? "",
        note,
        DISCORD_LIMITS.FOOTER_TEXT_MAX
      );
    }
  }

  return embed;
}

/**
 * Build a Discord incoming-webhook JSON payload enforcing all Discord limits.
 * Over-limit inputs are truncated with visible notes, never silently dropped.
 * @param {{ content?: string, embeds?: Array<object> }} [input]
 * @returns {{ content: string, embeds: Array<object> }}
 */
export function buildPayload({ content = "", embeds = [] } = {}) {
  const rawContent = content == null ? "" : String(content);
  const rawEmbeds = Array.isArray(embeds) ? embeds : [];

  let omittedEmbeds = 0;
  let workingEmbeds = rawEmbeds;
  if (rawEmbeds.length > DISCORD_LIMITS.EMBEDS_MAX) {
    omittedEmbeds = rawEmbeds.length - DISCORD_LIMITS.EMBEDS_MAX;
    workingEmbeds = rawEmbeds.slice(0, DISCORD_LIMITS.EMBEDS_MAX);
  }

  const normalizedEmbeds = workingEmbeds.map(normalizeEmbed);
  let trimmedFieldsForTotal = 0;

  while (
    normalizedEmbeds.length > 0 &&
    measureTotalEmbedText(normalizedEmbeds) > DISCORD_LIMITS.EMBED_TOTAL_TEXT_MAX
  ) {
    const excess =
      measureTotalEmbedText(normalizedEmbeds) -
      DISCORD_LIMITS.EMBED_TOTAL_TEXT_MAX;
    const last = normalizedEmbeds[normalizedEmbeds.length - 1];
    const lastLen = measureEmbedText(last);

    if (normalizedEmbeds.length > 1 && lastLen <= excess) {
      normalizedEmbeds.pop();
      omittedEmbeds += 1;
      continue;
    }

    if (Array.isArray(last.fields) && last.fields.length > 0) {
      last.fields.pop();
      trimmedFieldsForTotal += 1;
      continue;
    }

    if (typeof last.description === "string" && last.description.length > 0) {
      const targetLen = Math.max(0, last.description.length - excess);
      const nextDesc = truncateWithNote(last.description, targetLen);
      if (nextDesc.length < last.description.length) {
        last.description = nextDesc;
        continue;
      }
    }

    if (
      last.footer &&
      typeof last.footer.text === "string" &&
      last.footer.text.length > 0
    ) {
      const targetLen = Math.max(0, last.footer.text.length - excess);
      const nextFooter = truncateWithNote(last.footer.text, targetLen);
      if (nextFooter.length < last.footer.text.length) {
        last.footer.text = nextFooter;
        continue;
      }
    }

    if (typeof last.title === "string" && last.title.length > 0) {
      const targetLen = Math.max(0, last.title.length - excess);
      const nextTitle = truncateWithNote(last.title, targetLen);
      if (nextTitle.length < last.title.length) {
        last.title = nextTitle;
        continue;
      }
    }

    if (
      last.author &&
      typeof last.author.name === "string" &&
      last.author.name.length > 0
    ) {
      const targetLen = Math.max(0, last.author.name.length - excess);
      const nextAuthor = truncateWithNote(last.author.name, targetLen);
      if (nextAuthor.length < last.author.name.length) {
        last.author.name = nextAuthor;
        continue;
      }
    }

    normalizedEmbeds.pop();
    omittedEmbeds += 1;
  }

  let finalContent = truncateWithNote(rawContent, DISCORD_LIMITS.CONTENT_MAX);

  if (omittedEmbeds > 0) {
    finalContent = appendNoteToText(
      finalContent,
      `[truncated: ${omittedEmbeds} embed(s) omitted]`,
      DISCORD_LIMITS.CONTENT_MAX
    );
  }

  if (trimmedFieldsForTotal > 0) {
    finalContent = appendNoteToText(
      finalContent,
      `[truncated: ${trimmedFieldsForTotal} field(s) omitted to fit 6000-char embed limit]`,
      DISCORD_LIMITS.CONTENT_MAX
    );
  }

  return {
    content: finalContent,
    embeds: normalizedEmbeds,
  };
}

/**
 * Append UTM parameters to a base URL. Returns "" if the URL is invalid.
 * @param {string} baseUrl
 * @param {{ source?: string, medium?: string, campaign?: string }} [utm]
 * @returns {string}
 */
export function buildUtmUrl(
  baseUrl,
  { source = "cabal", medium = "discord-ring", campaign = "" } = {}
) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) return "";
  let parsed;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }
  if (source) parsed.searchParams.set("utm_source", String(source));
  if (medium) parsed.searchParams.set("utm_medium", String(medium));
  if (campaign) parsed.searchParams.set("utm_campaign", String(campaign));
  return parsed.toString();
}

/**
 * Build a "Draft in Cabal" hash deep link.
 * @param {{ baseUrl?: string, game?: string, url?: string, campaign?: string }} [opts]
 * @returns {string}
 */
export function buildCabalDeepLink({
  baseUrl = "",
  game = "",
  title = "",
  url = "",
  campaign = "",
  ring = "",
} = {}) {
  const params = new URLSearchParams();
  const gameName = game || title;
  const campaignName = campaign || ring;
  if (gameName) params.set("game", String(gameName));
  if (url) params.set("url", String(url));
  if (campaignName) params.set("campaign", String(campaignName));

  const qs = params.toString();
  const hash = qs ? `#draft?${qs}` : "#draft";

  if (typeof baseUrl === "string" && baseUrl.trim()) {
    const cleanBase = baseUrl.trim().split("#")[0];
    return `${cleanBase}${hash}`;
  }
  return hash;
}

/**
 * Build a ring-brief Discord webhook payload with UTM link and "Draft in Cabal" deep link.
 * @param {object} [opts]
 * @returns {{ content: string, embeds: Array<object> }}
 */
export function buildRingBriefPayload({
  gameTitle = "",
  title = "",
  brief = "",
  note = "",
  gameUrl = "",
  url = "",
  utmSource = "cabal",
  utmMedium = "discord-ring",
  utmCampaign = "",
  ring = "",
  cabalBaseUrl = "",
  disclosure = "",
} = {}) {
  const resolvedTitle = gameTitle || title;
  const resolvedBrief = brief || note;
  const resolvedUrl = gameUrl || url;
  const resolvedCampaign = utmCampaign || ring;

  const utmUrl = resolvedUrl
    ? buildUtmUrl(resolvedUrl, {
        source: utmSource,
        medium: utmMedium,
        campaign: resolvedCampaign,
      })
    : "";

  const deepLink = buildCabalDeepLink({
    baseUrl: cabalBaseUrl,
    game: resolvedTitle,
    url: utmUrl || resolvedUrl,
    campaign: resolvedCampaign,
  });

  const fields = [];
  if (utmUrl) {
    fields.push({ name: "Link", value: utmUrl, inline: false });
  }
  fields.push({
    name: "Draft in Cabal",
    value: deepLink,
    inline: false,
  });

  const embed = {
    title: resolvedTitle ? String(resolvedTitle) : "Ring Brief",
    fields,
  };

  if (utmUrl) {
    embed.url = utmUrl;
  }
  if (resolvedBrief) {
    embed.description = String(resolvedBrief);
  }
  if (disclosure) {
    embed.footer = { text: String(disclosure) };
  }

  return buildPayload({
    content: resolvedBrief ? String(resolvedBrief) : "",
    embeds: [embed],
  });
}

async function parseRetryAfter(res) {
  try {
    if (res && typeof res.json === "function") {
      const body = await res.json();
      if (
        body &&
        typeof body.retry_after === "number" &&
        Number.isFinite(body.retry_after) &&
        body.retry_after >= 0
      ) {
        return body.retry_after;
      }
    }
  } catch {
    // Ignore JSON parse errors and fall back to header.
  }

  const headerVal = res?.headers?.get?.("Retry-After");
  if (headerVal != null) {
    const parsed = Number.parseFloat(headerVal);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 1;
}

/**
 * Send a payload to a Discord incoming webhook URL.
 * Handles 403 immediately (no retry) and 429 with at most ONE retry after retry_after.
 * @param {string} url
 * @param {object} payload
 * @param {{ fetchImpl?: typeof fetch, sleepImpl?: (ms: number) => Promise<void> }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, rateLimited: boolean, retried: boolean, retryAfter: number, message: string }>}
 */
export async function sendWebhook(
  url,
  payload,
  { fetchImpl = globalThis.fetch, sleepImpl } = {}
) {
  const check = isValidWebhookUrl(url);
  if (!check.valid) {
    return {
      ok: false,
      status: 0,
      rateLimited: false,
      retried: false,
      retryAfter: 0,
      message: check.reason || "Invalid webhook URL.",
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      status: 0,
      rateLimited: false,
      retried: false,
      retryAfter: 0,
      message: "fetch is not available.",
    };
  }

  const safePayload = buildPayload(payload);
  const requestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(safePayload),
  };

  let res;
  try {
    res = await fetchImpl(check.url, requestInit);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      rateLimited: false,
      retried: false,
      retryAfter: 0,
      message: err?.message || "Network error sending webhook.",
    };
  }

  if (res.status === 403) {
    return {
      ok: false,
      status: 403,
      rateLimited: false,
      retried: false,
      retryAfter: 0,
      message: "Webhook rejected (403 Forbidden). Rotate or check the webhook URL.",
    };
  }

  if (res.status === 429) {
    const retryAfter = await parseRetryAfter(res);
    const waitMs = Math.ceil(retryAfter * 1000);
    const sleeper =
      typeof sleepImpl === "function"
        ? sleepImpl
        : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await sleeper(waitMs);

    let retryRes;
    try {
      retryRes = await fetchImpl(check.url, requestInit);
    } catch (err) {
      return {
        ok: false,
        status: 0,
        rateLimited: true,
        retried: true,
        retryAfter,
        message: err?.message || "Network error on rate-limit retry.",
      };
    }

    return {
      ok: Boolean(retryRes.ok),
      status: retryRes.status,
      rateLimited: true,
      retried: true,
      retryAfter,
      message: retryRes.ok
        ? `Sent after rate-limit retry (${retryRes.status}).`
        : `Failed after rate-limit retry (${retryRes.status}).`,
    };
  }

  return {
    ok: Boolean(res.ok),
    status: res.status,
    rateLimited: false,
    retried: false,
    retryAfter: 0,
    message: res.ok
      ? `Webhook sent (${res.status}).`
      : `Webhook failed (${res.status}).`,
  };
}

function el(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  if (text) node.textContent = text;
  return node;
}

/**
 * Mount the Discord #rings bridge UI into rootEl.
 * @param {HTMLElement} rootEl
 * @param {{ storage?: Storage, fetchImpl?: typeof fetch, sleepImpl?: (ms: number) => Promise<void> }} [opts]
 */
export function mount(
  rootEl,
  { storage = globalThis.localStorage, fetchImpl, sleepImpl } = {}
) {
  if (!rootEl) return null;

  rootEl.textContent = "";

  const container = el("section", { class: "cabal-discord" });
  container.appendChild(el("h2", {}, "Discord #rings Bridge"));

  // 1. Webhook URL section
  const webhookSection = el("div", { class: "cabal-discord-webhook" });
  webhookSection.appendChild(el("label", { for: "cabal-discord-url" }, "Webhook URL"));

  const urlRow = el("div", { class: "cabal-discord-url-row" });
  const urlInput = el("input", {
    id: "cabal-discord-url",
    type: "password",
    autocomplete: "off",
    placeholder: "https://discord.com/api/webhooks/...",
  });

  try {
    const saved = storage?.getItem?.(STORAGE_KEY);
    if (saved) urlInput.value = saved;
  } catch {
    // Ignore storage access errors.
  }

  const toggleBtn = el("button", { type: "button" }, "Show");
  toggleBtn.addEventListener("click", () => {
    const hidden = urlInput.type === "password";
    urlInput.type = hidden ? "text" : "password";
    toggleBtn.textContent = hidden ? "Hide" : "Show";
  });

  const clearBtn = el("button", { type: "button" }, "Clear");
  const urlStatus = el("p", { class: "cabal-discord-url-status" });

  function syncUrlState() {
    const val = urlInput.value.trim();
    try {
      if (val) {
        storage?.setItem?.(STORAGE_KEY, val);
      } else {
        storage?.removeItem?.(STORAGE_KEY);
      }
    } catch {
      // Ignore storage access errors.
    }

    if (!val) {
      urlStatus.textContent = "No webhook URL saved.";
      return;
    }
    const check = isValidWebhookUrl(val);
    urlStatus.textContent = check.valid
      ? "Webhook URL format is valid."
      : `Invalid webhook URL: ${check.reason}`;
  }

  urlInput.addEventListener("input", syncUrlState);
  clearBtn.addEventListener("click", () => {
    urlInput.value = "";
    syncUrlState();
  });

  urlRow.appendChild(urlInput);
  urlRow.appendChild(toggleBtn);
  urlRow.appendChild(clearBtn);
  webhookSection.appendChild(urlRow);
  webhookSection.appendChild(urlStatus);
  webhookSection.appendChild(el("p", { class: "cabal-discord-warning" }, WEBHOOK_WARNING));
  container.appendChild(webhookSection);

  // 2. Ring-brief composer
  const composer = el("div", { class: "cabal-discord-composer" });
  composer.appendChild(el("h3", {}, "Ring Brief Composer"));

  function makeField(labelText, inputEl) {
    const wrap = el("label", { class: "cabal-discord-field" });
    wrap.appendChild(el("span", {}, labelText));
    wrap.appendChild(inputEl);
    composer.appendChild(wrap);
    return inputEl;
  }

  const gameTitleInput = makeField(
    "Game Title",
    el("input", { type: "text", placeholder: "Your game title" })
  );
  const briefInput = makeField(
    "Human-written Brief",
    el("textarea", {
      rows: "4",
      placeholder: "Write the ring brief in your own words...",
    })
  );
  const gameUrlInput = makeField(
    "Game URL",
    el("input", { type: "url", placeholder: "https://example.com/game" })
  );
  const utmSourceInput = makeField(
    "UTM Source",
    el("input", { type: "text", value: "cabal" })
  );
  const utmMediumInput = makeField(
    "UTM Medium",
    el("input", { type: "text", value: "discord-ring" })
  );
  const utmCampaignInput = makeField(
    "UTM Campaign",
    el("input", { type: "text", placeholder: "spring-ring" })
  );
  const cabalBaseInput = makeField(
    "Cabal Base URL (optional)",
    el("input", { type: "url", placeholder: "https://cabal.example.com/" })
  );
  const disclosureInput = makeField(
    "Disclosure Line",
    el("input", {
      type: "text",
      placeholder: "e.g. Ring share — friends & fellow devs, not paid promo.",
    })
  );

  const utmPreview = el("p", { class: "cabal-discord-utm-preview" });
  const deepLinkPreview = el("p", { class: "cabal-discord-deeplink-preview" });
  const payloadPreview = el("pre", { class: "cabal-discord-payload-preview" });

  function getComposerValues() {
    return {
      gameTitle: gameTitleInput.value.trim(),
      brief: briefInput.value.trim(),
      gameUrl: gameUrlInput.value.trim(),
      utmSource: utmSourceInput.value.trim() || "cabal",
      utmMedium: utmMediumInput.value.trim() || "discord-ring",
      utmCampaign: utmCampaignInput.value.trim(),
      cabalBaseUrl: cabalBaseInput.value.trim(),
      disclosure: disclosureInput.value.trim(),
    };
  }

  function refreshPreviews() {
    const vals = getComposerValues();
    const utmUrl = buildUtmUrl(vals.gameUrl, {
      source: vals.utmSource,
      medium: vals.utmMedium,
      campaign: vals.utmCampaign,
    });
    utmPreview.textContent = utmUrl ? `UTM Link: ${utmUrl}` : "UTM Link: (enter a valid http/https Game URL)";

    const deepLink = buildCabalDeepLink({
      baseUrl: vals.cabalBaseUrl,
      game: vals.gameTitle,
      url: utmUrl || vals.gameUrl,
      campaign: vals.utmCampaign,
    });
    deepLinkPreview.textContent = `Draft in Cabal: ${deepLink}`;

    const payload = buildRingBriefPayload(vals);
    payloadPreview.textContent = JSON.stringify(payload, null, 2);
  }

  for (const input of [
    gameTitleInput,
    briefInput,
    gameUrlInput,
    utmSourceInput,
    utmMediumInput,
    utmCampaignInput,
    cabalBaseInput,
    disclosureInput,
  ]) {
    input.addEventListener("input", refreshPreviews);
  }

  composer.appendChild(utmPreview);
  composer.appendChild(deepLinkPreview);
  composer.appendChild(payloadPreview);

  // 3. Send button + status output
  const sendBtn = el("button", { type: "button" }, "Send to Discord");
  const sendStatus = el("p", { class: "cabal-discord-send-status" });

  sendBtn.addEventListener("click", async () => {
    sendBtn.disabled = true;
    sendStatus.textContent = "Sending...";
    try {
      const payload = buildRingBriefPayload(getComposerValues());
      const result = await sendWebhook(urlInput.value, payload, {
        fetchImpl,
        sleepImpl,
      });
      sendStatus.textContent = result.ok
        ? `Sent: ${result.message}`
        : `Error (${result.status}): ${result.message}`;
    } finally {
      sendBtn.disabled = false;
    }
  });

  composer.appendChild(sendBtn);
  composer.appendChild(sendStatus);
  container.appendChild(composer);

  // 4. Announcement-channel following guide
  const guide = el("div", { class: "cabal-discord-guide" });
  guide.appendChild(el("h3", {}, "Announcement-Channel Following Guide"));
  const guideList = el("ul");
  for (const rule of ANNOUNCEMENT_GUIDE) {
    guideList.appendChild(el("li", {}, rule));
  }
  guide.appendChild(guideList);
  container.appendChild(guide);

  rootEl.appendChild(container);
  syncUrlState();
  refreshPreviews();

  return { refreshPreviews, syncUrlState };
}
