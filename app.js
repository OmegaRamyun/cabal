// Cabal Ring Kit — module registry and loader. No feature code lives here.

export function createRegistry() {
  const modules = new Map();
  return {
    register(name, mod) {
      if (typeof name !== 'string' || !name) throw new TypeError('module name must be a non-empty string');
      if (modules.has(name)) throw new Error(`module already registered: ${name}`);
      modules.set(name, mod);
      return mod;
    },
    get(name) {
      return modules.get(name);
    },
    has(name) {
      return modules.has(name);
    },
    names() {
      return [...modules.keys()];
    },
  };
}

// Section id -> src module file (basename, also the registry name).
export const MODULE_MAP = [
  { section: 'composer', name: 'intents' },
  { section: 'similarity', name: 'similarity' },
  { section: 'directory', name: 'match' },
  { section: 'discord', name: 'discord' },
  { section: 'kickstarter', name: 'kickstarter' },
  { section: 'steam', name: 'steam' },
  { section: 'checklist', name: 'checklist' },
];

// Loads each module independently; one failure never stops the others.
// importer and getMount are injectable so this is testable under node.
export async function loadModules(registry, map, getMount, importer = (n) => import(`./src/${n}.mjs`)) {
  const results = [];
  for (const { section, name } of map) {
    try {
      const mod = await importer(name);
      registry.register(name, mod);
      const node = getMount(section);
      if (!node) throw new Error(`no mount node for #${section}`);
      if (typeof mod.mount === 'function') await mod.mount(node);
      results.push({ name, section, ok: true });
    } catch (err) {
      console.error(`[cabal] module "${name}" failed:`, err);
      results.push({ name, section, ok: false, error: err });
    }
  }
  return results;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const registry = createRegistry();
  window.Cabal = { modules: registry };
  const start = () =>
    loadModules(registry, MODULE_MAP, (id) => document.querySelector(`#${id} .mount`));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
