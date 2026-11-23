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
    loadModules(registry, MODULE_MAP, (id) => document.querySelector(`#${id} .mount`)).then(() =>
      wireSimilarityGate(document)
    );
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}

// Wires the hash-based similarity gate into the composer's textareas.
// Each textarea is scored against the others (same user, cross-platform
// variants) as the user types; the gate warns only and never blocks posting.
// The similarity module has no section of its own — it lives in the composer.
// importer is injectable so this is testable under node.
export async function wireSimilarityGate(document, importer = (n) => import(`./src/${n}.mjs`)) {
  const composer = document.querySelector('#composer');
  if (!composer) return [];
  const textareas = [...composer.querySelectorAll('textarea')];
  if (textareas.length === 0) return [];
  const mod = await importer('similarity');
  if (typeof mod.mount !== 'function') return [];
  const labelOf = (ta) => (ta.getAttribute('aria-label') || '').replace(/ post text$/, '') || 'draft';
  const handles = textareas.map((ta) => {
    const getDrafts = () =>
      textareas
        .filter((other) => other !== ta && other.value.trim())
        .map((other) => ({ author: labelOf(other), text: other.value }));
    return mod.mount(composer, { textarea: ta, getDrafts });
  });
  // A gate only re-scores on its own textarea's input, but its comparison
  // set changes when ANY textarea changes — so every input refreshes all
  // gates. update() is a pure re-render, ~3 µs per gate; double-firing the
  // own gate's listener is harmless.
  for (const ta of textareas) {
    ta.addEventListener('input', () => handles.forEach((h) => h.update()));
  }
  return handles;
}
