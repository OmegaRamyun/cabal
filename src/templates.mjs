/**
 * Campaign templates for Cabal Ring Kit (Stage 1 MVP).
 *
 * Each template provides a structural outline, reflective writing prompts,
 * an honest disclosure line, and a similarity-gate reminder. Templates never
 * supply fill-in-the-blank captions or ready-to-paste marketing copy.
 */

export const CAMPAIGN_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'pre-launch',
    name: 'Pre-launch',
    stage: 'Before campaign launch (follow-gathering)',
    goal: 'Help people discover the upcoming project early and follow its pre-launch page, using a distinct referral tag per ring partner.',
    structure: Object.freeze([
      'Context: how you know the creator or first encountered the project.',
      'Specific hook: one concrete detail, mechanic, or theme that genuinely caught your attention.',
      'Pre-launch link: point to the follow/notify page with your assigned partner referral tag.',
      'Honest disclosure: state your ring relationship clearly.',
    ]),
    prompts: Object.freeze([
      'What specific thing did the creator show or build that made you want to follow this project?',
      'Who in your own audience would care about this genre or problem, and why?',
      'Which partner referral tag belongs on your link so clicks attribute cleanly?',
    ]),
    disclosure:
      'Disclosure: fellow ring member — I backed or playtested an earlier build (use only where true; never use fake "independent fan" framing).',
    similarityReminder:
      'Write from your own perspective and run your draft through the similarity gate before posting so ring posts do not echo each other.',
  }),
  Object.freeze({
    id: 'live',
    name: 'Live campaign',
    stage: 'Campaign active (update swap & own-words quote-post)',
    goal: 'Share a real campaign milestone or update in your own words rather than reposting identical promotional copy.',
    structure: Object.freeze([
      'Quote or reference: point to the specific update or milestone from the creator.',
      'Personal reaction: explain in your own words why that milestone or design choice matters.',
      'Direct campaign link: send readers to the live page or specific update.',
      'Honest disclosure: note your connection to the creator or ring.',
    ]),
    prompts: Object.freeze([
      'Which concrete detail in this update stood out to you as a player, backer, or peer developer?',
      'What would you tell a friend in one or two sentences without borrowing phrasing from the campaign page?',
      'Have you staggered your post timing relative to other ring members sharing this update?',
    ]),
    disclosure:
      'Disclosure: fellow ring member — I backed or played this (use only where true; never use fake "independent fan" framing).',
    similarityReminder:
      'Check your draft against the similarity gate before posting; avoid copying campaign blurbs or matching another member’s phrasing.',
  }),
  Object.freeze({
    id: 'late-pledge',
    name: 'Late pledge',
    stage: 'Post-campaign (pledge-manager window)',
    goal: 'Let people who missed the main campaign know the pledge manager is open, with clear expectations on timing and fulfillment.',
    structure: Object.freeze([
      'Who this is for: note that the main campaign wrapped and late pledges are now open.',
      'What is on offer: summarize what you personally backed or are excited to see delivered.',
      'Pledge-manager link: direct link to the late-pledge or store page.',
      'Honest disclosure: state your ring or backer relationship plainly.',
    ]),
    prompts: Object.freeze([
      'Why is this still relevant to someone who missed the live campaign window?',
      'What practical detail (edition, timeline, or demo availability) helps a latecomer decide?',
      'Are you framing this honestly as a peer/backer rather than a neutral bystander?',
    ]),
    disclosure:
      'Disclosure: fellow ring member — I backed this campaign (use only where true; never use fake "independent fan" framing).',
    similarityReminder:
      'Write in your own voice and verify your draft in the similarity gate before posting.',
  }),
  Object.freeze({
    id: 'next-fest',
    name: 'Next Fest',
    stage: 'Steam Next Fest (demo + wishlist UTM)',
    goal: 'Point players to a playable demo during Next Fest and attribute wishlist traffic with a clean Steam UTM link.',
    structure: Object.freeze([
      'Playable moment: describe one real moment or mechanic you experienced in the demo.',
      'Fit check: mention what kind of player or mood this demo suits.',
      'Demo and wishlist link: use your Steam app URL with Next Fest UTM parameters.',
      'Honest disclosure: state your connection to the developer or ring.',
    ]),
    prompts: Object.freeze([
      'What actually happened in the first ten minutes when you played the demo?',
      'What surprised you or felt distinct compared to other demos you tried?',
      'Did you build the Steam UTM link with your source and campaign tags before sharing?',
    ]),
    disclosure:
      'Disclosure: fellow ring member — I played the demo and know the creator (use only where true; never use fake "independent fan" framing).',
    similarityReminder:
      'Run your post through the similarity gate before publishing; Steam Next Fest feeds get noisy fast, so keep your take personal and distinct.',
  }),
  Object.freeze({
    id: 'dev-update',
    name: 'Dev update',
    stage: 'Ongoing development (progress, no ask)',
    goal: 'Share genuine behind-the-scenes craft or progress from a peer’s project with no call to buy, pledge, or wishlist.',
    structure: Object.freeze([
      'The craft detail: highlight a technical hurdle, art iteration, or design lesson.',
      'Why it resonates: connect it to your own work or what you respect about the approach.',
      'Optional reference: link to the devlog or clip for readers who want to see the process.',
      'Honest disclosure: acknowledge your peer/ring relationship.',
    ]),
    prompts: Object.freeze([
      'What specific problem did the developer solve or document in this progress note?',
      'What did you learn from seeing their work-in-progress?',
      'Does this post stand on its own as an interesting dev story with zero sales ask?',
    ]),
    disclosure:
      'Disclosure: fellow ring member — sharing a peer developer’s progress (use only where true; never use fake "independent fan" framing).',
    similarityReminder:
      'Even without a link or ask, write in your own words and check the similarity gate if multiple members are commenting on the same devlog.',
  }),
]);

/**
 * Returns a shallow copy of the campaign templates array.
 * @returns {Array<object>}
 */
export function getTemplates() {
  return [...CAMPAIGN_TEMPLATES];
}

/**
 * Finds a campaign template by its id.
 * @param {string} id
 * @returns {object|null}
 */
export function getTemplateById(id) {
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }
  return CAMPAIGN_TEMPLATES.find((template) => template.id === id) ?? null;
}

/**
 * Formats a campaign template as a plain-text writing guide suitable for
 * copying to the clipboard. Pure function, no DOM access.
 * @param {object} template
 * @returns {string}
 */
export function formatTemplateBrief(template) {
  if (!template || typeof template !== 'object') {
    throw new TypeError('Expected a campaign template object');
  }

  const lines = [
    `Template: ${template.name ?? ''}${template.stage ? ` (${template.stage})` : ''}`,
    `Goal: ${template.goal ?? ''}`,
    '',
    'Structure:',
    ...(Array.isArray(template.structure)
      ? template.structure.map((beat, idx) => `${idx + 1}. ${beat}`)
      : []),
    '',
    'Writing Prompts:',
    ...(Array.isArray(template.prompts)
      ? template.prompts.map((prompt) => `- ${prompt}`)
      : []),
    '',
    `Disclosure Line: ${template.disclosure ?? ''}`,
    `Similarity-Gate Reminder: ${template.similarityReminder ?? ''}`,
  ];

  return lines.join('\n');
}

/**
 * Mounts the campaign template picker and guide viewer into rootEl.
 * All DOM access in this module is confined to mount().
 * @param {HTMLElement} rootEl
 */
export function mount(rootEl) {
  if (!rootEl) {
    return;
  }

  const templates = getTemplates();
  let selectedId = templates[0]?.id ?? null;

  rootEl.replaceChildren();

  const container = document.createElement('section');
  container.className = 'cabal-templates';

  const heading = document.createElement('h2');
  heading.textContent = 'Campaign Templates';
  container.appendChild(heading);

  const picker = document.createElement('div');
  picker.className = 'cabal-template-picker';
  picker.setAttribute('role', 'tablist');
  picker.setAttribute('aria-label', 'Campaign templates');
  container.appendChild(picker);

  const detail = document.createElement('div');
  detail.className = 'cabal-template-detail';
  container.appendChild(detail);

  const statusEl = document.createElement('p');
  statusEl.className = 'cabal-template-status';
  statusEl.setAttribute('aria-live', 'polite');

  async function copyText(text, label) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) {
          throw new Error('Fallback copy command failed');
        }
      }
      statusEl.textContent = `Copied ${label} to clipboard.`;
    } catch {
      statusEl.textContent = `Could not copy ${label} automatically; please select and copy it manually.`;
    }
  }

  function render() {
    picker.replaceChildren();
    for (const tpl of templates) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cabal-template-tab';
      btn.setAttribute('role', 'tab');
      const isSelected = tpl.id === selectedId;
      btn.setAttribute('aria-selected', String(isSelected));
      btn.textContent = tpl.name;
      btn.addEventListener('click', () => {
        selectedId = tpl.id;
        statusEl.textContent = '';
        render();
      });
      picker.appendChild(btn);
    }

    detail.replaceChildren();
    const active = getTemplateById(selectedId);
    if (!active) {
      return;
    }

    const title = document.createElement('h3');
    title.textContent = `${active.name} — ${active.stage}`;
    detail.appendChild(title);

    const goalP = document.createElement('p');
    const goalStrong = document.createElement('strong');
    goalStrong.textContent = 'Goal: ';
    goalP.appendChild(goalStrong);
    goalP.appendChild(document.createTextNode(active.goal));
    detail.appendChild(goalP);

    const structHeading = document.createElement('h4');
    structHeading.textContent = 'Structure';
    detail.appendChild(structHeading);

    const structList = document.createElement('ol');
    for (const beat of active.structure) {
      const li = document.createElement('li');
      li.textContent = beat;
      structList.appendChild(li);
    }
    detail.appendChild(structList);

    const promptsHeading = document.createElement('h4');
    promptsHeading.textContent = 'Writing Prompts';
    detail.appendChild(promptsHeading);

    const promptsList = document.createElement('ul');
    for (const prompt of active.prompts) {
      const li = document.createElement('li');
      li.textContent = prompt;
      promptsList.appendChild(li);
    }
    detail.appendChild(promptsList);

    const disclosureP = document.createElement('p');
    const disclosureStrong = document.createElement('strong');
    disclosureStrong.textContent = 'Disclosure Line: ';
    disclosureP.appendChild(disclosureStrong);
    disclosureP.appendChild(document.createTextNode(active.disclosure));
    detail.appendChild(disclosureP);

    const reminderP = document.createElement('p');
    const reminderStrong = document.createElement('strong');
    reminderStrong.textContent = 'Similarity-Gate Reminder: ';
    reminderP.appendChild(reminderStrong);
    reminderP.appendChild(document.createTextNode(active.similarityReminder));
    detail.appendChild(reminderP);

    const actions = document.createElement('div');
    actions.className = 'cabal-template-actions';

    const copyOutlineBtn = document.createElement('button');
    copyOutlineBtn.type = 'button';
    copyOutlineBtn.textContent = 'Copy Outline';
    copyOutlineBtn.addEventListener('click', () => {
      copyText(formatTemplateBrief(active), 'outline');
    });
    actions.appendChild(copyOutlineBtn);

    const copyDisclosureBtn = document.createElement('button');
    copyDisclosureBtn.type = 'button';
    copyDisclosureBtn.textContent = 'Copy Disclosure';
    copyDisclosureBtn.addEventListener('click', () => {
      copyText(active.disclosure, 'disclosure');
    });
    actions.appendChild(copyDisclosureBtn);

    detail.appendChild(actions);
    detail.appendChild(statusEl);
  }

  render();
  rootEl.appendChild(container);
}
