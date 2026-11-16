// Challenge data and the fake project tree.
//
// NOT derived from the Lua track. These are hand-written for the browser and only
// RESEMBLE lua/nvim-dojo/tracks/telescope/ and lua/nvim-dojo/fixtures/manifest.lua.
// The IDs are deliberately unprefixed so they cannot be mistaken for the real ones,
// and nothing cross-checks the two -- if the plugin's challenges change, nothing here
// will tell you. See web/README.md.
//
// The one thing that MUST stay true is REAL_PRODUCT at the bottom, which the final
// card renders. web/smoke.mjs asserts it against SPEC.md.
//
// Five challenges chosen to tell the product's story in about a minute:
// invoke -> filter -> precision -> search contents -> chain into quickfix.

// --- the fake project -------------------------------------------------------
// Generated from a compact manifest for the same reason the plugin does it: the
// picker only becomes interesting at a scale you cannot eyeball. A five-file
// project makes fuzzy finding pointless.

const NEAR_MISSES = [
  'lua/auth.lua',
  'lua/auth_helper.lua',
  'lua/authz.lua',
  'lib/auth/init.lua',
];

const GREP_TARGETS = [
  'lua/net/client.lua',
  'lua/net/pool.lua',
  'lua/net/retry.lua',
  'spec/net_spec.lua',
];

const FILLER_DIRS = [
  'lua/ui', 'lua/model', 'lua/store', 'lua/util', 'lua/view',
  'lua/command', 'lua/parser', 'lua/render', 'spec/unit', 'spec/integration',
];
const FILLER_NAMES = [
  'buffer', 'window', 'layout', 'config', 'logger', 'queue', 'session',
  'schema', 'mapper', 'format', 'diff', 'watcher', 'registry', 'token',
];

export function buildTree() {
  const files = [...NEAR_MISSES, ...GREP_TARGETS, 'README.md', 'lua/cache/store.lua'];
  for (const dir of FILLER_DIRS) {
    for (const name of FILLER_NAMES) files.push(`${dir}/${name}.lua`);
  }
  return files;
}

// Lines that `live_grep` can find, as path -> matching line.
export const GREP_INDEX = {
  'lua/net/client.lua': { line: 3, text: 'function M.deprecated_fetch(url)' },
  'lua/net/pool.lua': { line: 7, text: '    client.deprecated_fetch(url)' },
  'lua/net/retry.lua': { line: 7, text: '    local ok, body = pcall(client.deprecated_fetch, url)' },
  'spec/net_spec.lua': { line: 5, text: '    assert.is_string(client.deprecated_fetch("http://example.test"))' },
};

// --- the challenges ---------------------------------------------------------
// `picker` is the builtin the challenge requires, mirroring requires_tools.

export const CHALLENGES = [
  {
    id: 'recall/open-file-finder',
    tier: 1,
    tierName: 'Recall',
    title: 'Open the file finder',
    hint: '<space>ff    or    :Telescope find_files',
    answer: 'find_files is the picker. In your own config it is whatever you bound it to — the real plugin never checks which key you press.',
    requires: 'find_files',
    done: (s) => s.pickerOpen && s.picker === 'find_files',
  },
  {
    id: 'context/filter-to-one',
    tier: 2,
    tierName: 'Context',
    title: 'Open lua/net/retry.lua',
    hint: 'Type part of the path, then <CR>',
    answer: "Telescope's sorter is fuzzy over the whole path, so 'netretry' or 'nere' both land it. You rarely need the full name.",
    requires: 'find_files',
    done: (s) => s.openFile === 'lua/net/retry.lua',
  },
  {
    id: 'context/near-miss-filenames',
    tier: 2,
    tierName: 'Context',
    title: 'Open lib/auth/init.lua — not auth.lua, auth_helper.lua or authz.lua',
    hint: "Typing 'auth' matches four files. Narrow the path, not the name.",
    answer: "Four files match 'auth'. 'lib/auth/in' or 'laini' narrows to exactly one — this is the difference between using a picker and fighting it.",
    requires: 'find_files',
    done: (s) => s.openFile === 'lib/auth/init.lua',
  },
  {
    id: 'recall/live-grep',
    tier: 1,
    tierName: 'Recall',
    title: 'Search file CONTENTS for deprecated_fetch',
    hint: '<space>fg    or    :Telescope live_grep',
    answer: 'live_grep searches contents; find_files only searches names. Reaching for the wrong one is the most common Telescope mistake.',
    requires: 'live_grep',
    done: (s) => s.pickerOpen && s.picker === 'live_grep' && s.query.length >= 4,
  },
  {
    id: 'chain/grep-to-quickfix',
    tier: 3,
    tierName: 'Chain',
    title: 'Send every match to the quickfix list',
    hint: '<C-q> from inside the picker',
    answer: '<C-q> sends the whole result set to quickfix, where :cfdo can edit every file at once. This is the bridge from searching to bulk editing — and the most underused thing in Telescope.',
    requires: 'live_grep',
    done: (s) => s.quickfix.length >= 4,
  },
];

// Truth in advertising: these must match SPEC.md, not the original PRD.
// web/smoke.mjs asserts them. They have drifted once already -- the demo claimed
// one track for as long as it took the gitsigns track to ship.
export const REAL_PRODUCT = {
  challenges: 24,
  tiers: 4,
  tracks: ['Telescope', 'gitsigns'],
};
