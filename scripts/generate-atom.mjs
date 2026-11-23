// V31 — regenerate campaigns.atom from data/campaigns.json.
// Run after any edit to data/campaigns.json, from the repo root:
//   node scripts/generate-atom.mjs
// The feed is a committed static file (GitHub Pages serves it); there is
// no build step otherwise. Only listable campaigns (discovery.isListable:
// real game page + >= 2 members) make the feed.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildFeed, APP_URL } from '../src/atom.mjs';
import { isListable } from '../src/discovery.mjs';
import { encodeCampaignLink } from '../src/campaign.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = JSON.parse(
  await readFile(path.join(root, 'data/campaigns.json'), 'utf8'),
);
const campaigns = (Array.isArray(data.campaigns) ? data.campaigns : []).filter(
  isListable,
);
const xml = buildFeed(campaigns, {
  linkFor: (c) => encodeCampaignLink(c, APP_URL).url,
});
await writeFile(path.join(root, 'campaigns.atom'), `${xml}\n`, 'utf8');
console.log(
  `campaigns.atom: ${campaigns.length} ${campaigns.length === 1 ? 'entry' : 'entries'}`,
);
