// nvim-dojo — browser hero.
//
// A simulation, not an emulator. It fakes exactly enough Neovim to make the
// Telescope workflow feel real: a leader sequence, a fuzzy picker you type
// into, multi-select, and <C-q> into quickfix.
//
// One honest difference from the plugin, stated in the intro: the real thing is
// keymap-agnostic and never checks which key you press. A browser cannot read
// your config, so the hero teaches <space>ff — and accepts the :Telescope
// command too, because that route is legitimate there as well.

import { CHALLENGES, GREP_INDEX, REAL_PRODUCT, buildTree } from './challenges.js';
import { filter, score } from './fuzzy.js';

const FILES = buildTree();
const GREP_PATHS = Object.keys(GREP_INDEX);

const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'), buffer: $('buffer'), helper: $('helper'), cmdline: $('cmdline'),
  mode: $('mode'), file: $('file'), progress: $('progress'),
  picker: $('picker'), ptitle: $('ptitle'), pcount: $('pcount'),
  presults: $('presults'), pprompt: $('pprompt'),
  intro: $('intro'), result: $('result'), resultCard: $('result-card'),
  focusVeil: $('focus-veil'),
};

// ── state ──────────────────────────────────────────────────────────────────

let idx = 0;
let attempt = 1;
let hinted = false;
let startedAt = null;
let timerRaf = null;
let phase = 'intro'; // intro | running | result | done
let pending = '';     // leader sequence buffer
let results = [];     // per-challenge {ms, hinted, attempts}

const s = {
  mode: 'normal',     // normal | picker | cmdline
  pickerOpen: false,
  picker: null,       // 'find_files' | 'live_grep'
  usedPickers: new Set(),
  route: 'keymap',
  query: '',
  sel: 0,
  marked: new Set(),
  quickfix: [],
  openFile: null,
  cmd: '',
  message: '',
};

function resetChallengeState() {
  s.mode = 'normal';
  s.pickerOpen = false;
  s.picker = null;
  s.usedPickers = new Set();
  s.route = 'keymap';
  s.query = '';
  s.sel = 0;
  s.marked = new Set();
  s.quickfix = [];
  s.openFile = null;
  s.cmd = '';
  s.message = '';
  pending = '';
}

const challenge = () => CHALLENGES[idx];

// ── rendering ──────────────────────────────────────────────────────────────

function visibleItems() {
  const pool = s.picker === 'live_grep' ? GREP_PATHS : FILES;
  if (s.picker === 'live_grep') {
    // live_grep matches CONTENTS: the query is tested against the source line.
    if (!s.query) return pool.slice();
    return pool.filter((p) => score(s.query, GREP_INDEX[p].text) !== null);
  }
  return filter(s.query, pool);
}

function highlight(path) {
  if (!s.query) return escapeHtml(path);
  // Mark the matched subsequence so filtering is legible as you type.
  const q = s.query.toLowerCase().replace(/ /g, '');
  const lower = path.toLowerCase();
  let qi = 0;
  let out = '';
  for (let i = 0; i < path.length; i++) {
    if (qi < q.length && lower[i] === q[qi]) {
      out += `<span class="m">${escapeHtml(path[i])}</span>`;
      qi++;
    } else {
      out += escapeHtml(path[i]);
    }
  }
  return out;
}

function escapeHtml(t) {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderPicker() {
  el.picker.classList.toggle('open', s.pickerOpen);
  if (!s.pickerOpen) return;

  const items = visibleItems();
  if (s.sel >= items.length) s.sel = Math.max(0, items.length - 1);

  const title = s.picker === 'live_grep' ? 'Live Grep' : 'Find Files';
  el.ptitle.textContent = title;
  el.pcount.textContent = `${items.length}/${s.picker === 'live_grep' ? GREP_PATHS.length : FILES.length}`;

  const window = items.slice(0, 11);
  el.presults.innerHTML = window.map((p, i) => {
    const cls = ['row'];
    if (i === s.sel) cls.push('sel');
    if (s.marked.has(p)) cls.push('marked');
    const mark = s.marked.has(p) ? '+ ' : '';
    const grep = s.picker === 'live_grep'
      ? `<span class="grepline">:${GREP_INDEX[p].line}:${escapeHtml(GREP_INDEX[p].text.trim())}</span>`
      : '';
    return `<div class="${cls.join(' ')}">${mark}${highlight(p)} ${grep}</div>`;
  }).join('');

  el.pprompt.innerHTML = `<span class="caret">&gt; </span>${escapeHtml(s.query)}<span class="caret">█</span>`;
}

const SAMPLE = {
  'lua/net/retry.lua': [
    ['cmt', 'local client = require("net.client")'],
    ['', ''],
    ['code', 'local M = {}'],
    ['', ''],
    ['fn', 'function M.with_retry(url, attempts)'],
    ['code', '  for _ = 1, attempts or 3 do'],
    ['code', '    local ok, body = pcall(client.deprecated_fetch, url)'],
    ['code', '    if ok then return body end'],
    ['code', '  end'],
    ['code', 'end'],
  ],
  'lib/auth/init.lua': [
    ['cmt', 'local helper = require("auth_helper")'],
    ['', ''],
    ['code', 'local M = {}'],
    ['', ''],
    ['cmt', '--- The real implementation, not one of the three near-misses.'],
    ['fn', 'function M.authenticate(header)'],
    ['code', '  local token = helper.strip_bearer(header)'],
    ['code', '  if token == "" then return nil, "missing token" end'],
    ['code', '  return { token = token, issued_at = os.time() }'],
    ['code', 'end'],
  ],
};

function renderBuffer() {
  if (!s.openFile) {
    const rows = ['', '', '   nvim-dojo', '   ─────────', '',
      '   A practice project of 150 files.',
      '   Too many to eyeball — which is the point.', ''];
    el.buffer.innerHTML = rows.map((r) => `<span class="cmt">${escapeHtml(r)}</span>`).join('\n')
      + '\n' + Array(8).fill('<span class="tilde">~</span>').join('\n');
    return;
  }
  const lines = SAMPLE[s.openFile] || [['cmt', '-- ' + s.openFile]];
  el.buffer.innerHTML = lines.map(([cls, text], i) =>
    `<span class="lnum">${i + 1}</span><span class="${cls || 'code'}">${escapeHtml(text)}</span>`
  ).join('\n') + '\n' + Array(4).fill('<span class="tilde">~</span>').join('\n');
}

function elapsed() {
  return startedAt === null ? 0 : performance.now() - startedAt;
}

function renderHud() {
  const c = challenge();
  if (!c) return;
  const bits = [`<span class="objective">${escapeHtml(c.title)}</span>`];
  if (attempt > 1) bits.push(`<span class="attempt">attempt ${attempt}</span>`);
  bits.push(`<span class="timer">${(elapsed() / 1000).toFixed(1)}s</span>`);
  el.hud.innerHTML = bits.join('<span class="sep">│</span>');
}

function renderStatus() {
  const c = challenge();
  el.mode.textContent = s.mode === 'cmdline' ? 'COMMAND' : s.mode === 'picker' ? 'INSERT' : 'NORMAL';
  el.mode.className = 'mode' + (s.mode === 'picker' ? ' insert' : s.mode === 'cmdline' ? ' cmd' : '');
  el.file.textContent = s.openFile || '[No Name]';
  el.progress.textContent = c ? `Tier ${c.tier} ${c.tierName}  ${idx + 1}/${CHALLENGES.length}` : '';
  el.cmdline.innerHTML = s.mode === 'cmdline'
    ? `:${escapeHtml(s.cmd)}<span class="caret">█</span>`
    : s.message;
}

function renderHelper() {
  el.helper.innerHTML = s.quickfix.length
    ? `<span class="ok">quickfix: ${s.quickfix.length} entries</span>`
    : `<kbd>:Dojo hint</kbd> reveal the command &nbsp;·&nbsp; <kbd>:Dojo skip</kbd> next challenge &nbsp;·&nbsp; <kbd>Esc</kbd> close picker`;
}

function render() {
  renderHud();
  renderBuffer();
  renderPicker();
  renderStatus();
  renderHelper();
}

// ── challenge lifecycle ────────────────────────────────────────────────────

function startChallenge() {
  phase = 'running';
  resetChallengeState();
  startedAt = null;
  el.result.classList.remove('open');
  el.intro.classList.remove('open');
  render();
}

function tickTimer() {
  if (phase === 'running' && startedAt !== null) renderHud();
  timerRaf = requestAnimationFrame(tickTimer);
}

function pass() {
  const ms = elapsed();
  results[idx] = { ms, hinted, attempts: attempt, skipped: false };
  phase = 'result';
  showResult(true, ms);
}

function showResult(ok, ms) {
  const c = challenge();
  const last = idx === CHALLENGES.length - 1;
  const cost = s.route === 'cmdline'
    ? `<p class="dim">You typed the command. That works — it is just slower than a keymap, which is the entire argument for binding one.</p>`
    : '';
  el.resultCard.innerHTML = `
    <h1 class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${escapeHtml(c.title)}</h1>
    <h2>${(ms / 1000).toFixed(1)}s${hinted ? ' · hint used' : ''}${attempt > 1 ? ` · attempt ${attempt}` : ''}</h2>
    <p>${escapeHtml(c.answer)}</p>
    ${cost}
    <p><span class="go">${last ? 'Enter' : 'Enter'}</span> <span class="dim">${last ? 'see results' : 'next challenge'}</span></p>`;
  el.result.classList.add('open');
}

function nextChallenge() {
  idx++;
  attempt = 1;
  hinted = false;
  if (idx >= CHALLENGES.length) return finish();
  startChallenge();
}

function finish() {
  phase = 'done';
  const total = results.reduce((a, r) => a + (r ? r.ms : 0), 0);
  const mastered = results.filter((r) => r && !r.hinted && r.attempts === 1 && !r.skipped).length;
  el.resultCard.innerHTML = `
    <h1>Track complete</h1>
    <h2 class="stats">${(total / 1000).toFixed(1)}s total · ${mastered}/${CHALLENGES.length} first try, unaided</h2>
    <p>That was a <em>simulation</em> of five challenges. The real thing runs inside your
       Neovim, against your own keymaps, your own Telescope, and a generated
       ${'150'}-file git repository.</p>
    <ul>
      <li><strong>${REAL_PRODUCT.challenges} challenges</strong> across ${REAL_PRODUCT.tiers} tiers
          (Recall → Context → Chain → Pressure)</li>
      <li>Validated by <strong>state and tool use</strong>, never by keypress — so any keymap works</li>
      <li>Tier 4 is time-boxed, with the clock starting on your first keypress</li>
      <li>Tracks: ${REAL_PRODUCT.tracks.join(', ')}</li>
    </ul>
    <p><span class="go">r</span> <span class="dim">play again</span></p>`;
  el.result.classList.add('open');
}

// ── input ──────────────────────────────────────────────────────────────────

function openPicker(which, route) {
  s.pickerOpen = true;
  s.picker = which;
  s.usedPickers.add(which);
  s.route = route || 'keymap';
  s.mode = 'picker';
  s.query = '';
  s.sel = 0;
  s.marked = new Set();
  s.message = '';
}

function closePicker() {
  s.pickerOpen = false;
  s.mode = 'normal';
}

function checkDone() {
  const c = challenge();
  if (!c) return;
  // Mirrors the plugin: the goal state AND the required picker must both hold.
  if (c.done(s) && s.usedPickers.has(c.requires)) pass();
}

function runCommand(cmd) {
  const t = cmd.trim();
  if (/^Telescope\s+find_files$/i.test(t)) openPicker('find_files', 'cmdline');
  else if (/^Telescope\s+live_grep$/i.test(t)) openPicker('live_grep', 'cmdline');
  else if (/^Dojo\s+hint$/i.test(t)) revealHint();
  else if (/^Dojo\s+skip$/i.test(t)) skipChallenge();
  else s.message = `<span class="msg-err">E492: Not an editor command: ${escapeHtml(t)}</span>`;
}

function revealHint() {
  hinted = true;
  const c = challenge();
  s.message = `<span class="msg-ok">${escapeHtml(c.hint)}</span>  <span class="dim">(mastery forfeited)</span>`;
}

function skipChallenge() {
  results[idx] = { ms: elapsed(), hinted, attempts: attempt, skipped: true };
  nextChallenge();
}

function onKey(e) {
  // Let people copy text and use devtools.
  if (e.metaKey || e.ctrlKey) {
    if (!(e.ctrlKey && (e.key === 'q' || e.key === 'n' || e.key === 'p'))) return;
  }

  const k = e.key;

  if (phase === 'intro') {
    if (k === 'Enter' || k === 'i') { e.preventDefault(); startChallenge(); }
    return;
  }

  if (phase === 'result') {
    if (k === 'Enter') { e.preventDefault(); nextChallenge(); }
    return;
  }

  if (phase === 'done') {
    if (k === 'r') { e.preventDefault(); idx = 0; attempt = 1; hinted = false; results = []; startChallenge(); }
    return;
  }

  // The clock starts on the first keypress after the objective appears, not
  // when the challenge opens — same rule as the plugin, so reading is free.
  if (startedAt === null) startedAt = performance.now();

  if (s.mode === 'cmdline') {
    e.preventDefault();
    if (k === 'Escape') { s.mode = 'normal'; s.cmd = ''; }
    else if (k === 'Enter') { const c = s.cmd; s.mode = 'normal'; s.cmd = ''; runCommand(c); }
    else if (k === 'Backspace') { s.cmd = s.cmd.slice(0, -1); if (!s.cmd) s.mode = 'normal'; }
    else if (k.length === 1) s.cmd += k;
    render(); checkDone(); return;
  }

  if (s.mode === 'picker') {
    e.preventDefault();
    const items = visibleItems();
    if (k === 'Escape') closePicker();
    else if (k === 'Backspace') { s.query = s.query.slice(0, -1); s.sel = 0; }
    else if (k === 'ArrowDown' || (e.ctrlKey && k === 'n')) s.sel = Math.min(s.sel + 1, Math.max(0, items.length - 1));
    else if (k === 'ArrowUp' || (e.ctrlKey && k === 'p')) s.sel = Math.max(s.sel - 1, 0);
    else if (k === 'Tab') { const p = items[s.sel]; if (p) { s.marked.has(p) ? s.marked.delete(p) : s.marked.add(p); s.sel = Math.min(s.sel + 1, items.length - 1); } }
    else if (e.ctrlKey && k === 'q') {
      s.quickfix = (s.marked.size ? [...s.marked] : items).slice();
      closePicker();
    }
    else if (k === 'Enter') {
      const p = items[s.sel];
      if (p) { s.openFile = p; closePicker(); }
    }
    else if (k.length === 1) { s.query += k; s.sel = 0; }
    render(); checkDone(); return;
  }

  // normal mode
  if (k === ':') { e.preventDefault(); s.mode = 'cmdline'; s.cmd = ''; s.message = ''; render(); return; }
  if (k === ' ' || pending) {
    e.preventDefault();
    pending += k === ' ' ? '<leader>' : k;
    if (pending === '<leader>f') { render(); return; }
    if (pending === '<leader>ff') { pending = ''; openPicker('find_files', 'keymap'); render(); checkDone(); return; }
    if (pending === '<leader>fg') { pending = ''; openPicker('live_grep', 'keymap'); render(); checkDone(); return; }
    if (pending !== '<leader>') { pending = ''; }
    render(); return;
  }
  render();
}

// ── boot ───────────────────────────────────────────────────────────────────

// Keyboard focus. The game is embedded in an iframe on the portfolio, and a
// cross-origin frame holds no focus until it is clicked -- every keystroke
// before that goes to the parent document. Calling focus() on click is enough;
// the veil exists so the visitor knows a click is needed before they try.
function syncFocus() {
  el.focusVeil.classList.toggle('open', !document.hasFocus());
}
window.addEventListener('focus', syncFocus);
window.addEventListener('blur', syncFocus);
document.addEventListener('click', () => { window.focus(); syncFocus(); });

window.addEventListener('keydown', onKey);
syncFocus();
renderBuffer();
renderStatus();
renderHelper();
el.intro.classList.add('open');
tickTimer();
