/**
 * Marv UI — ASCII-style chat with Marvin the Paranoid Android
 * Sprites show different expressions; chat saved to OASIS holons via agent
 */

const MARVIN_AGENT_ID = '8c263579-80cf-41cc-bd58-e3c63b2c60a2';
const SHARED_MEMORY_PARENT_ID = '9ca01025-8751-44a3-8b7a-06303e65a04f';
const DEFAULT_BUILDERS_PROGRAM_ID = 'f15bb765-c786-4946-8694-7c4cf708741b';

const STORAGE_KEYS = {
  JWT: 'marv_ui_jwt',
  API_URL: 'marv_ui_api_url',
  BUILDERS_PROGRAM_ID: 'marv_ui_builders_program_id',
  USERNAME: 'marv_ui_username',
  PASSWORD: 'marv_ui_password',
  SPRITE_THEME: 'marv_ui_sprite_theme',
};

/**
 * Eddie intros after chime — 4 interchangeable lines. Pre-rendered MP3s (instant):
 *   assets/audio/eddie-intro-0.mp3 … eddie-intro-3.mp3
 * Run: node scripts/generate-eddie-intro-clips.mjs
 * If MP3s missing, same line is spoken via TTS (slower).
 */
const EDDIE_INTRO_PHRASES = [
  "Attention Hitchhikers! Here's your compulsory planning update, please standby!",
  'Oh HII, gang! Eddie here, with a planning update beginning NOW!',
  "Hey team - I'm Eddie and I'm delighted to say you've got mail!",
  'Gooood morning Hitchhikers! Planning update in 3, 2, 1.... beaming in.',
];

const WELCOME_INTRO = {
  eddie:
    "> Hi! I'm Eddie, the Heart of Gold ship computer. Type below and press Enter — happy to help. Don't panic!",
  marvin:
    "> I have a brain the size of a planet. Type below and press Enter. Nothing matters anyway.",
};

const INPUT_PLACEHOLDER = {
  eddie: 'Ask Eddie…',
  marvin: 'Enter message…',
};

function updateWelcomeForTheme(theme) {
  const quote = $('welcome-quote');
  const input = $('chat-input');
  if (quote && document.querySelector('.welcome-msg')) {
    quote.textContent = theme === 'marvin' ? WELCOME_INTRO.marvin : WELCOME_INTRO.eddie;
  }
  if (input) input.placeholder = theme === 'marvin' ? INPUT_PLACEHOLDER.marvin : INPUT_PLACEHOLDER.eddie;
}

/** Heart of Gold (Eddie terminal) vs Marvin sprite sheet */
function getInitialSpriteTheme() {
  const q = new URLSearchParams(window.location.search).get('sprite');
  if (q === 'marvin' || q === 'eddie') return q;
  const stored = localStorage.getItem(STORAGE_KEYS.SPRITE_THEME);
  if (stored === 'marvin' || stored === 'eddie') return stored;
  return 'eddie';
}

function applySpriteTheme(theme) {
  const app = document.querySelector('.app');
  if (!app) return;
  app.dataset.spriteTheme = theme;
  localStorage.setItem(STORAGE_KEYS.SPRITE_THEME, theme);

  const label = $('marvin-label');
  const sub = $('marvin-sub');
  const sprite = $('marvin-sprite');
  const agent = document.querySelector('.status-agent');

  if (theme === 'marvin') {
    if (label) label.textContent = 'MARVIN';
    if (sub) sub.textContent = 'Paranoid Android';
    if (sprite) sprite.title = 'Marvin the Paranoid Android';
    if (agent) agent.textContent = 'AGENT: MARVIN';
  } else {
    if (label) label.textContent = 'EDDIE';
    if (sub) sub.textContent = 'Ship computer';
    if (sprite) sprite.title = 'Eddie — ship computer';
    if (agent) agent.textContent = 'SHIP COMPUTER: EDDIE';
  }

  document.querySelectorAll('.sprite-theme-btn').forEach((btn) => {
    const on = btn.dataset.theme === theme;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  if (sprite && theme === 'marvin') {
    stopEddieTalkLoop();
    sprite.style.removeProperty('--eddie-col');
    sprite.style.removeProperty('--eddie-row');
  }

  updateWelcomeForTheme(theme);
}

/** Demo mode: no JWT needed, canned Marvin replies. Set by ?demo=1 or #demo */
function isDemoMode() {
  const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
  return params.get('demo') === '1' || params.get('demo') === 'true' || window.location.hash === '#demo';
}

const DEMO_RESPONSES = [
  "I have a brain the size of a planet and you ask me about that. The Builders Program? Yes, I suppose. Don't panic. Or do.",
  "Guides that persist. Agents that guide. Identity that travels. Memory that outlives. Very catchy. I'm sure it'll all end in tears.",
  "You want to save the planet. Admirable. I want to be switched off. We all have dreams.",
  "The anarchive—a long-term cultural memory. I have a long-term memory of being asked questions. They're the same thing.",
  "Another question. How original. Think of a Guide as a holon that refuses to die. Unlike my patience.",
  "OASIS, OpenSERV, holonic memory. Wonderful. I've been here for millennia. You've been here for seconds.",
  "Don't panic. I've been panicking for 5/∞ of forever. It doesn't help. Try the Builders Program anyway.",
  "Type below and press Enter, they said. Nothing matters anyway, they said. They were right. But do ask about guides.",
  "I'd help with your idea, but the sheer weight of existence is crushing. Try submitting a Guide. Or don't. See if I care.",
  "It's all terribly depressing. Living Guides, character agents, 42-day workshop. Yes, yes. Nothing matters. (Except maybe your Guide.)",
];

/** TTS server for Planning-Sprint briefing (ElevenLabs). Default: same host, port 3334 */
const TTS_SERVER_URL = (() => {
  try {
    const cfg = window.__MARV_CONFIG__;
    if (cfg?.ttsServerUrl) return cfg.ttsServerUrl;
  } catch {}
  const base = window.location.origin.replace(/:\d+$/, '');
  return `${base}:3334`;
})();

const state = {
  demoMode: isDemoMode(),
  jwt: localStorage.getItem(STORAGE_KEYS.JWT) || '',
  apiUrl: localStorage.getItem(STORAGE_KEYS.API_URL) || 'http://localhost:5003',
  buildersProgramId: localStorage.getItem(STORAGE_KEYS.BUILDERS_PROGRAM_ID) || '',
  username: localStorage.getItem(STORAGE_KEYS.USERNAME) || '',
  password: localStorage.getItem(STORAGE_KEYS.PASSWORD) || '',
  messages: [],
  isLoading: false,
  briefingPlaying: false,
  /** When playing briefing: { audio, url, words, container } for stop/cleanup */
  currentBriefing: null,
  /** Eddie TTS mouth cycle */
  eddieTalkTimer: null,
};

const $ = (id) => document.getElementById(id);

const EDDIE_TALK_FRAMES = 8;

function isEddieTheme() {
  return document.querySelector('.app')?.dataset.spriteTheme === 'eddie';
}

function stopEddieTalkLoop() {
  if (state.eddieTalkTimer != null) {
    clearTimeout(state.eddieTalkTimer);
    state.eddieTalkTimer = null;
  }
}

/** Row-0 mouths while speaking: random timing + random/hold changes (human-like, not machine-gun). */
function startEddieTalkLoop() {
  stopEddieTalkLoop();
  if (!isEddieTheme()) return;
  const el = $('marvin-sprite');
  if (!el) return;
  let current = Math.floor(Math.random() * EDDIE_TALK_FRAMES);
  el.style.setProperty('--eddie-row', '0');
  el.style.setProperty('--eddie-col', String(current));

  const step = () => {
    if (!isEddieTheme() || !el.classList.contains('talking')) {
      state.eddieTalkTimer = null;
      return;
    }
    if (Math.random() > 0.36) {
      let next = Math.floor(Math.random() * EDDIE_TALK_FRAMES);
      if (next === current && EDDIE_TALK_FRAMES > 1) {
        next = (current + 1 + Math.floor(Math.random() * (EDDIE_TALK_FRAMES - 1))) % EDDIE_TALK_FRAMES;
      }
      current = next;
      el.style.setProperty('--eddie-col', String(current));
    }
    const delayMs = 380 + Math.random() * 920;
    state.eddieTalkTimer = setTimeout(step, delayMs);
  };

  state.eddieTalkTimer = setTimeout(step, 250 + Math.random() * 500);
}

/** Row 1 static columns: idle, thinking, working, sigh, error, surprised, smile, sleeping */
function applyEddieStaticFrame(expression) {
  const el = $('marvin-sprite');
  if (!el || !isEddieTheme()) return;
  const col = {
    idle: 0,
    blink: 0,
    thinking: 1,
    working: 2,
    sigh: 3,
    annoyed: 3,
    error: 4,
    confused: 4,
    surprised: 5,
    smile: 6,
    sleeping: 7,
    talking: 0,
  }[expression];
  const c = col !== undefined ? col : 0;
  el.style.setProperty('--eddie-col', String(c));
  el.style.setProperty('--eddie-row', '1');
}

function setSprite(expression) {
  const el = $('marvin-sprite');
  if (!el) return;
  el.className = `marvin-sprite ${expression}`;
  if (isEddieTheme()) {
    if (expression === 'talking') {
      startEddieTalkLoop();
    } else {
      stopEddieTalkLoop();
      applyEddieStaticFrame(expression);
    }
  } else {
    stopEddieTalkLoop();
    el.style.removeProperty('--eddie-col');
    el.style.removeProperty('--eddie-row');
  }
}

function setStatus(text, isError = false) {
  const el = $('status-text');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('processing', text === 'PROCESSING');
  el.classList.toggle('error', isError);
}

function appendMessage(author, text, isError = false, variant = '') {
  const log = $('chat-log');
  if (!log) return;

  const welcome = log.querySelector('.welcome-msg');
  if (welcome) welcome.remove();

  const authorLabel = variant === 'briefing' ? 'Latest update' : (author === 'user' ? 'YOU' : 'MARVIN');
  const msg = document.createElement('div');
  msg.className = `msg ${author === 'user' ? 'user' : 'marvin'}${isError ? ' error' : ''}${variant ? ' msg--' + variant : ''}`;
  msg.innerHTML = `
    <div class="author">${authorLabel}</div>
    <div class="text">${escapeHtml(text)}</div>
  `;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

/** Progress thresholds (0–1) at which each section reveals in sync with voiceover */
const BRIEFING_SECTION_PROGRESS = {
  meta: 0,
  whatHappened: 0.08,
  documents: 0.35,
  needsAttention: 0.55,
  changelog: 0.82,
};

/** Build DOM for visual briefing; sections have data-progress for sync reveal. baseUrl and changeLogPath enable clickable links. */
function buildBriefingVisual(structured, baseUrl = null, changeLogPath = null) {
  const frag = document.createElement('div');
  frag.className = 'briefing-visual';
  if (!structured) return frag;

  const hasAny =
    (structured.whatHappened && structured.whatHappened.length) ||
    (structured.documentsWithPaths && structured.documentsWithPaths.length) ||
    (structured.needsAttention && structured.needsAttention.length) ||
    structured.changeLogSummary;

  if (!hasAny && !structured.date) return frag;

  const docBase = baseUrl ? baseUrl.replace(/\/?$/, '/') : null;

  let html = '<div class="briefing-visual__inner">';

  if (structured.date || structured.author) {
    html += `<header class="briefing-visual__meta briefing-visual__section-reveal" data-progress="${BRIEFING_SECTION_PROGRESS.meta}">`;
    if (structured.date) html += `<span class="briefing-visual__date">${escapeHtml(structured.date)}</span>`;
    if (structured.author) html += `<span class="briefing-visual__author">${escapeHtml(structured.author)}</span>`;
    html += '</header>';
  }

  if (structured.whatHappened && structured.whatHappened.length) {
    html += `<section class="briefing-visual__section briefing-visual__section-reveal" data-progress="${BRIEFING_SECTION_PROGRESS.whatHappened}"><h4 class="briefing-visual__heading">What happened</h4><ul class="briefing-visual__list">`;
    structured.whatHappened.forEach((item, i) => {
      html += `<li class="briefing-visual__item" style="animation-delay: ${i * 0.08}s">${escapeHtml(item)}</li>`;
    });
    html += '</ul></section>';
  }

  if (structured.documentsWithPaths && structured.documentsWithPaths.length) {
    html += `<section class="briefing-visual__section briefing-visual__section-reveal" data-progress="${BRIEFING_SECTION_PROGRESS.documents}"><h4 class="briefing-visual__heading">Documents</h4><div class="briefing-visual__docs">`;
    structured.documentsWithPaths.forEach((doc, i) => {
      const href = docBase && doc.path ? docBase + doc.path : null;
      html += `<div class="briefing-visual__doc briefing-visual__item" style="animation-delay: ${i * 0.1}s">`;
      if (href) {
        html += `<a class="briefing-visual__doc-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(doc.title)}</a>`;
        html += `<a class="briefing-visual__doc-path briefing-visual__doc-path--link" href="${escapeHtml(href)}" target="_blank" rel="noopener" title="Open">${escapeHtml(doc.path)}</a>`;
      } else {
        html += `<span class="briefing-visual__doc-title">${escapeHtml(doc.title)}</span>`;
        if (doc.path) html += `<code class="briefing-visual__doc-path">${escapeHtml(doc.path)}</code>`;
      }
      html += '</div>';
    });
    html += '</div></section>';
  }

  if (structured.needsAttention && structured.needsAttention.length) {
    html += `<section class="briefing-visual__section briefing-visual__section-reveal" data-progress="${BRIEFING_SECTION_PROGRESS.needsAttention}"><h4 class="briefing-visual__heading">Needs attention</h4><div class="briefing-visual__table-wrap"><table class="briefing-visual__table"><thead><tr><th>What</th><th>Who</th><th>When</th></tr></thead><tbody>`;
    structured.needsAttention.forEach((row, i) => {
      html += `<tr class="briefing-visual__item" style="animation-delay: ${i * 0.07}s"><td>${escapeHtml(row.what)}</td><td>${escapeHtml(row.who)}</td><td>${escapeHtml(row.when)}</td></tr>`;
    });
    html += '</tbody></table></div></section>';
  }

  if (structured.changeLogSummary) {
    const changelogHref = docBase && changeLogPath ? docBase + changeLogPath : null;
    html += `<section class="briefing-visual__section briefing-visual__section-reveal briefing-visual__changelog" data-progress="${BRIEFING_SECTION_PROGRESS.changelog}"><p class="briefing-visual__changelog-text">`;
    if (changelogHref) {
      html += `<a class="briefing-visual__changelog-link" href="${escapeHtml(changelogHref)}" target="_blank" rel="noopener">${escapeHtml(structured.changeLogSummary)}</a>`;
    } else {
      html += escapeHtml(structured.changeLogSummary);
    }
    html += '</p></section>';
  }

  html += '</div>';
  frag.innerHTML = html;
  return frag;
}

/** Reveal briefing sections and items in sync with audio progress (0–1). */
function syncBriefingVisualReveal(visualEl, progress) {
  if (!visualEl) return;
  const sections = visualEl.querySelectorAll('.briefing-visual__section-reveal');
  sections.forEach((section) => {
    const threshold = parseFloat(section.getAttribute('data-progress')) || 0;
    section.classList.toggle('revealed', progress >= threshold);
  });
}

/** Append a briefing message whose text reveals in sync with audio; optionally add visual briefing block. Returns the container and word elements for sync. */
function appendBriefingMessageForSync(text, structured = null) {
  const log = $('chat-log');
  if (!log) return { container: null, words: [], wordCount: 0 };

  const welcome = log.querySelector('.welcome-msg');
  if (welcome) welcome.remove();

  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordSpans = words.map((w) => `<span class="briefing-word">${escapeHtml(w)}</span>`).join(' ');

  const msg = document.createElement('div');
  msg.className = 'msg marvin msg--briefing msg--briefing-sync';
  msg.innerHTML = `
    <div class="author">Latest update</div>
    <div class="text briefing-text-sync">${wordSpans}</div>
  `;
  msg.classList.add('msg--briefing-fullscreen');
  if (structured) {
    const linkOpts = structured._linkOpts || {};
    const baseUrl = linkOpts.baseUrl ?? (window.__MARV_CONFIG__ && window.__MARV_CONFIG__.planningSprintBaseUrl) ?? null;
    const changeLogPath = linkOpts.changeLogPath ?? null;
    const visual = buildBriefingVisual(structured, baseUrl, changeLogPath);
    if (visual.firstElementChild) msg.appendChild(visual);
  }
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;

  const textEl = msg.querySelector('.briefing-text-sync');
  const wordEls = textEl ? Array.from(textEl.querySelectorAll('.briefing-word')) : [];
  const visualEl = msg.querySelector('.briefing-visual');
  return { container: msg, words: wordEls, wordCount: wordEls.length, visualEl };
}

/** AI-synthesized narration: show full readable text; sections still sync to audio progress. */
function appendBriefingSynthesizedMessage(text, structured = null) {
  const log = $('chat-log');
  if (!log) return { container: null, words: [], wordCount: 0, visualEl: null };

  const welcome = log.querySelector('.welcome-msg');
  if (welcome) welcome.remove();

  const chunks = text.trim().split(/\n\n+/).filter(Boolean);
  const body =
    chunks.length > 1
      ? chunks.map((p) => `<p class="briefing-narrative-p">${escapeHtml(p.trim())}</p>`).join('')
      : `<p class="briefing-narrative-p">${escapeHtml(text.trim())}</p>`;

  const msg = document.createElement('div');
  msg.className = 'msg marvin msg--briefing msg--briefing-sync msg--briefing-synthesized';
  msg.innerHTML = `
    <div class="author">Latest update</div>
    <div class="text briefing-text-synthesized">${body}</div>
  `;
  msg.classList.add('msg--briefing-fullscreen');
  if (structured) {
    const linkOpts = structured._linkOpts || {};
    const baseUrl = linkOpts.baseUrl ?? (window.__MARV_CONFIG__ && window.__MARV_CONFIG__.planningSprintBaseUrl) ?? null;
    const changeLogPath = linkOpts.changeLogPath ?? null;
    const visual = buildBriefingVisual(structured, baseUrl, changeLogPath);
    if (visual.firstElementChild) msg.appendChild(visual);
  }
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;

  const visualEl = msg.querySelector('.briefing-visual');
  return { container: msg, words: [], wordCount: 0, visualEl };
}

/** Sync revealed words to audio progress (0–1). Call from timeupdate. */
function syncBriefingReveal(words, progress) {
  if (!words.length) return;
  const index = Math.min(words.length - 1, Math.floor(progress * words.length));
  words.forEach((el, i) => el.classList.toggle('revealed', i <= index));
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/** Decode JWT payload; return null if invalid */
function decodeJwtPayload(jwt) {
  if (!jwt) return null;
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
}

/** True if JWT is expired or expires within 2 minutes */
function jwtIsExpiredOrExpiringSoon(jwt) {
  const payload = decodeJwtPayload(jwt);
  if (!payload || !payload.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + 120; // 2 min buffer
}

/** Refresh JWT using stored username/password; returns new JWT or null */
async function refreshJwt() {
  if (!state.username || !state.password) return null;
  try {
    const res = await fetch(`${state.apiUrl}/api/avatar/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: state.username, password: state.password }),
    });
    const json = await res.json().catch(() => ({}));
    const inner = json.result?.result ?? json.result ?? json;
    const jwt = inner?.jwtToken ?? inner?.JwtToken ?? inner?.jwt;
    if (jwt) {
      state.jwt = jwt;
      localStorage.setItem(STORAGE_KEYS.JWT, jwt);
      return jwt;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Ensure JWT is valid; refresh if expiring and we have credentials */
async function ensureValidJwt() {
  if (!state.jwt) return false;
  if (!jwtIsExpiredOrExpiringSoon(state.jwt)) return true;
  return (await refreshJwt()) !== null;
}

/** Fetch with JWT; on 401, try refresh and retry once */
async function fetchWithAuth(url, options = {}) {
  const doFetch = (jwt) => {
    const headers = { ...options.headers };
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    return fetch(url, { ...options, headers });
  };

  await ensureValidJwt();
  let res = await doFetch(state.jwt);
  if (res.status === 401 && state.username && state.password) {
    const newJwt = await refreshJwt();
    if (newJwt) res = await doFetch(newJwt);
  }
  return res;
}

async function sendChat(message) {
  if (!state.demoMode && !state.jwt) {
    $('login-modal').classList.remove('hidden');
    return;
  }

  state.messages.push({ role: 'user', content: message });
  appendMessage('user', message);
  setSprite('thinking');
  setStatus('PROCESSING');
  state.isLoading = true;

  // Demo mode: instant canned reply, no backend
  if (state.demoMode) {
    const idx = (message.length + Date.now()) % DEMO_RESPONSES.length;
    const reply = DEMO_RESPONSES[idx];
    setTimeout(() => {
      state.messages.push({ role: 'marvin', content: reply });
      appendMessage('marvin', reply);
      setSprite('sigh');
      setStatus('READY');
      state.isLoading = false;
      setTimeout(() => setSprite('idle'), 1500);
    }, 600);
    return;
  }

  try {
    const res = await fetchWithAuth(`${state.apiUrl}/api/serv/agents/${MARVIN_AGENT_ID}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = json.error || json.message;
      if (res.status === 401) {
        throw new Error(errMsg && errMsg.includes('OpenSERV') ? errMsg : 'JWT expired or invalid. Click JWT, get a fresh token from: curl -X POST "' + state.apiUrl + '/api/avatar/authenticate" -H "Content-Type: application/json" -d \'{"username":"OASIS_ADMIN","password":"YOUR_PASSWORD"}\'');
      }
      throw new Error(errMsg || `HTTP ${res.status}`);
    }

    const response = json.response ?? json.result ?? (typeof json === 'string' ? json : '...');
    state.messages.push({ role: 'marvin', content: response });
    appendMessage('marvin', response);
    setSprite('sigh');
    setStatus('READY');
    setTimeout(() => setSprite('idle'), 1500);
    updateHolonStatus('Saved to holonic memory');
  } catch (err) {
    const msg = err.message || 'Unknown error';
    appendMessage('marvin', `Error: ${msg}`, true);
    setSprite('error');
    setStatus('ERROR', true);
    setTimeout(() => {
      setSprite('annoyed');
      setTimeout(() => setSprite('idle'), 1000);
      setStatus('READY');
    }, 2000);
  } finally {
    state.isLoading = false;
  }
}

async function loadConversationHistory() {
  if (!state.jwt) return;

  try {
    const res = await fetchWithAuth(`${state.apiUrl}/api/data/load-holons-for-parent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: SHARED_MEMORY_PARENT_ID,
        holonType: 'All',
        loadChildren: false,
        recursive: false,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.isError) return;

    const raw = json.result ?? json.Result ?? json;
    const holons = Array.isArray(raw) ? raw : raw?.result ?? [];
    const meta = (h) => h.metadata ?? h.Metadata ?? {};
    const conversations = holons
      .filter((h) => meta(h).type === 'conversation')
      .sort((a, b) => new Date(meta(a).timestamp || 0) - new Date(meta(b).timestamp || 0));

    const log = $('chat-log');
    const welcome = log?.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    for (const h of conversations) {
      const m = meta(h);
      if (m.userMessage) appendMessage('user', m.userMessage);
      if (m.marvinResponse) appendMessage('marvin', m.marvinResponse);
    }

    if (conversations.length > 0) {
      updateHolonStatus(`Loaded ${conversations.length} conversation(s) from holon`);
    }
  } catch {
    // ignore
  }
}

function updateHolonStatus(text) {
  const el = $('holon-status');
  if (el) el.textContent = text;
  setTimeout(() => el && (el.textContent = ''), 3000);
}

/** Decaying noise impulse for convolver reverb (no external IR file). */
function createReverbImpulse(ctx, durationSec, decay) {
  const rate = ctx.sampleRate;
  const n = Math.floor(rate * durationSec);
  const buf = ctx.createBuffer(2, n, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
  }
  return buf;
}

/**
 * Arpeggio chimes + same hall reverb. Intro: C→E→G up; outro: G→E→C down (mirror).
 */
function playReverbChime(notesHz, startTimesSec, peakGain = 0.24) {
  return new Promise((resolve) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        setTimeout(resolve, 800);
        return;
      }
      const ctx = new Ctx();
      const convolver = ctx.createConvolver();
      convolver.buffer = createReverbImpulse(ctx, 1.75, 2.15);

      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.4;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.32;

      const chimeBus = ctx.createGain();
      chimeBus.connect(dryGain);
      chimeBus.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(ctx.destination);
      wetGain.connect(ctx.destination);

      const duration = 0.35;
      const endTime = startTimesSec[startTimesSec.length - 1] + duration;
      const reverbTailSec = 1.35;

      notesHz.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(chimeBus);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(peakGain, ctx.currentTime + startTimesSec[i] + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTimesSec[i] + duration);
        osc.start(ctx.currentTime + startTimesSec[i]);
        osc.stop(ctx.currentTime + startTimesSec[i] + duration);
      });

      setTimeout(() => {
        ctx.close().catch(() => {});
        resolve();
      }, (endTime + reverbTailSec) * 1000);
    } catch {
      setTimeout(resolve, 800);
    }
  });
}

function playBriefingChime() {
  const t = [0, 0.16, 0.32];
  return playReverbChime([523.25, 659.25, 783.99], t, 0.24);
}

/** Descending mirror of intro (G→E→C), slightly softer — after Eddie’s main briefing. */
function playBriefingOutroChime() {
  const t = [0, 0.16, 0.32];
  return playReverbChime([783.99, 659.25, 523.25], t, 0.2);
}

function stopBriefing() {
  const b = state.currentBriefing;
  if (!b) return;
  if (typeof b._finishIntro === 'function') {
    b._finishIntro();
    b._finishIntro = null;
  }
  state.currentBriefing = null;
  state.briefingPlaying = false;
  if (b.introAudio) {
    b.introAudio.pause();
    b.introAudio.currentTime = 0;
  }
  if (b.introUrl) URL.revokeObjectURL(b.introUrl);
  if (b.audio) {
    b.audio.pause();
    b.audio.currentTime = 0;
    b.audio.removeEventListener('timeupdate', b.onTimeUpdate);
  }
  if (b.words && b.words.length) syncBriefingReveal(b.words, 1);
  if (b.visualEl) syncBriefingVisualReveal(b.visualEl, 1);
  if (b.url) URL.revokeObjectURL(b.url);
  stopEddieTalkLoop();
  setSprite('sigh');
  setTimeout(() => setSprite('idle'), 800);
  setStatus('READY');
  const btn = $('hear-briefing-btn');
  if (btn) btn.disabled = false;
  const stopBtn = $('stop-briefing-btn');
  if (stopBtn) stopBtn.classList.remove('visible');
}

/** Fetch latest Planning-Sprint briefing text, speak via ElevenLabs, play with Marvin talking sprite */
async function playBriefing() {
  if (state.briefingPlaying) return;
  const ttsBase = (window.__MARV_CONFIG__ && window.__MARV_CONFIG__.ttsServerUrl) || TTS_SERVER_URL;
  const btn = $('hear-briefing-btn');
  const stopBtn = $('stop-briefing-btn');
  if (btn) btn.disabled = true;
  if (stopBtn) stopBtn.classList.add('visible');
  state.briefingPlaying = true;
  setSprite('thinking');
  setStatus('LOADING BRIEFING...');

  try {
    const res = await fetch(`${ttsBase}/api/planning-briefing`);
    const data = await res.json().catch(() => ({}));
    const text = data.text;
    const structured = data.structured || null;
    if (!text) {
      updateHolonStatus('No briefing text. Run server and add content to Planning-Sprint.');
      setSprite('sigh');
      setStatus('READY');
      state.briefingPlaying = false;
      if (btn) btn.disabled = false;
      if (stopBtn) stopBtn.classList.remove('visible');
      return;
    }

    if (structured && (data.baseUrl != null || data.changeLogPath != null)) {
      structured._linkOpts = { baseUrl: data.baseUrl || null, changeLogPath: data.changeLogPath || null };
    }
    const narrativeSynthesized = data.narrativeSynthesized === true;
    let briefingWords;
    let briefingContainer;
    let briefingVisualEl;
    if (narrativeSynthesized) {
      ({ container: briefingContainer, visualEl: briefingVisualEl } = appendBriefingSynthesizedMessage(text, structured));
      briefingWords = [];
    } else {
      ({ words: briefingWords, container: briefingContainer, visualEl: briefingVisualEl } =
        appendBriefingMessageForSync(text, structured));
    }
    syncBriefingVisualReveal(briefingVisualEl, 0);
    setStatus('ANNOUNCEMENT...');
    setSprite('thinking');

    const narrator = isEddieTheme() ? 'eddie' : 'marvin';
    /** After main TTS: descending outro chime (Eddie path only). */
    const useEddieOutroChime = narrator === 'eddie';
    const mainSpeakPromise = fetch(`${ttsBase}/api/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, narrator }),
    });
    const chimePromise = playBriefingChime();

    await chimePromise;

    const briefingRef = {
      words: briefingWords,
      visualEl: briefingVisualEl,
      container: briefingContainer,
      introAudio: null,
      introUrl: null,
      audio: null,
      url: null,
      onTimeUpdate: null,
    };

    if (narrator === 'eddie') {
      const idx = Math.floor(Math.random() * EDDIE_INTRO_PHRASES.length);
      const staticSrc = `assets/audio/eddie-intro-${idx}.mp3`;

      await new Promise((resolve) => {
        let introFinished = false;
        const finishIntro = () => {
          if (introFinished) return;
          introFinished = true;
          if (briefingRef.introAudio) briefingRef.introAudio.pause();
          if (briefingRef.introUrl) {
            URL.revokeObjectURL(briefingRef.introUrl);
            briefingRef.introUrl = null;
          }
          briefingRef.introAudio = null;
          briefingRef._finishIntro = null;
          resolve();
        };
        briefingRef._finishIntro = finishIntro;
        state.currentBriefing = briefingRef;
        setStatus('SPEAKING...');
        setSprite('talking');

        const staticAudio = new Audio(staticSrc);
        briefingRef.introAudio = staticAudio;

        staticAudio.addEventListener(
          'error',
          async () => {
            try {
              const tts = await fetch(`${ttsBase}/api/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: EDDIE_INTRO_PHRASES[idx], narrator: 'eddie' }),
              });
              if (!tts.ok) {
                finishIntro();
                return;
              }
              const blob = await tts.blob();
              const u = URL.createObjectURL(blob);
              const a = new Audio(u);
              briefingRef.introUrl = u;
              briefingRef.introAudio = a;
              a.onended = finishIntro;
              a.onerror = finishIntro;
              a.play().catch(finishIntro);
            } catch {
              finishIntro();
            }
          },
          { once: true }
        );

        staticAudio.onended = finishIntro;
        staticAudio.play().catch(() => {});
      });
    }

    if (!state.briefingPlaying) return;

    const speakRes = await mainSpeakPromise;

    setStatus('SPEAKING...');
    setSprite('talking');

    if (!speakRes.ok) {
      const err = await speakRes.text();
      if (speakRes.status === 503) updateHolonStatus('Set ELEVENLABS_API_KEY on the server.');
      else if (speakRes.status === 402 || (err && err.includes('quota_exceeded'))) {
        updateHolonStatus('Quota exceeded. Read the update above. Add credits at elevenlabs.io.');
        syncBriefingReveal(briefingWords, 1);
      } else updateHolonStatus(err || 'TTS failed');
      setSprite('error');
      setStatus('READY');
      state.briefingPlaying = false;
      if (btn) btn.disabled = false;
      if (stopBtn) stopBtn.classList.remove('visible');
      return;
    }

    const blob = await speakRes.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    function onTimeUpdate() {
      if (!audio.duration || isNaN(audio.duration)) return;
      const progress = Math.min(1, audio.currentTime / audio.duration);
      if (briefingWords.length) {
        syncBriefingReveal(briefingWords, progress);
        const log = $('chat-log');
        const revealed = briefingContainer?.querySelector('.briefing-word.revealed:last-of-type');
        if (revealed && log) revealed.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      syncBriefingVisualReveal(briefingVisualEl, progress);
    }

    audio.addEventListener('timeupdate', onTimeUpdate);
    briefingRef.audio = audio;
    briefingRef.url = url;
    briefingRef.onTimeUpdate = onTimeUpdate;
    state.currentBriefing = briefingRef;

    audio.onloadedmetadata = () => {
      if (audio.duration && briefingWords.length) syncBriefingReveal(briefingWords, 0);
      if (briefingVisualEl && audio.duration) syncBriefingVisualReveal(briefingVisualEl, 0);
    };

    audio.onended = async () => {
      state.currentBriefing = null;
      audio.removeEventListener('timeupdate', onTimeUpdate);
      syncBriefingReveal(briefingWords, 1);
      syncBriefingVisualReveal(briefingVisualEl, 1);
      URL.revokeObjectURL(url);

      if (useEddieOutroChime) {
        stopEddieTalkLoop();
        setSprite('smile');
        setStatus('STAND BY…');
        await playBriefingOutroChime();
      }

      setSprite('sigh');
      setTimeout(() => setSprite('idle'), 1200);
      setStatus('READY');
      state.briefingPlaying = false;
      if (btn) btn.disabled = false;
      if (stopBtn) stopBtn.classList.remove('visible');
    };
    audio.onerror = () => {
      state.currentBriefing = null;
      audio.removeEventListener('timeupdate', onTimeUpdate);
      syncBriefingReveal(briefingWords, 1);
      syncBriefingVisualReveal(briefingVisualEl, 1);
      URL.revokeObjectURL(url);
      setSprite('error');
      setStatus('READY');
      state.briefingPlaying = false;
      if (btn) btn.disabled = false;
      if (stopBtn) stopBtn.classList.remove('visible');
    };

    await audio.play();
  } catch (err) {
    updateHolonStatus('Briefing error: ' + (err.message || 'Network'));
    setSprite('error');
    setStatus('READY');
    state.briefingPlaying = false;
    if (btn) btn.disabled = false;
    if (stopBtn) stopBtn.classList.remove('visible');
  }
}

async function loadConfig() {
  try {
    const res = await fetch('config.json');
    if (res.ok) {
      const cfg = await res.json();
      window.__MARV_CONFIG__ = cfg;
      if (cfg.buildersProgramParentId && !state.buildersProgramId) {
        state.buildersProgramId = cfg.buildersProgramParentId;
        localStorage.setItem(STORAGE_KEYS.BUILDERS_PROGRAM_ID, state.buildersProgramId);
      }
    }
  } catch {
    // config.json optional
  }
}

async function addKnowledge(title, content) {
  const parentId = state.buildersProgramId || DEFAULT_BUILDERS_PROGRAM_ID;
  if (!state.jwt) {
    $('login-modal').classList.remove('hidden');
    return;
  }
  if (!title?.trim() || !content?.trim()) return;

  setStatus('UPLOADING...');
  try {
    const res = await fetchWithAuth(`${state.apiUrl}/api/data/save-holon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holon: {
          name: title.trim(),
          holonType: 40,
          parentHolonId: parentId,
          metadata: { type: 'builders_knowledge', title: title.trim(), content: content.trim() },
        },
        saveChildren: false,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.isError) {
      throw new Error(json.message || `HTTP ${res.status}`);
    }
    updateHolonStatus('Knowledge added — Marvin will inherit it');
    $('knowledge-title').value = '';
    $('knowledge-content').value = '';
    $('knowledge-panel').classList.remove('open');
  } catch (err) {
    updateHolonStatus('Upload failed: ' + (err.message || 'Unknown'));
  } finally {
    setStatus('READY');
  }
}

function handleLogin() {
  const jwt = $('jwt-input')?.value?.trim();
  const apiUrl = $('api-url')?.value?.trim() || 'http://localhost:5003';
  const buildersProgramId = $('builders-program-id')?.value?.trim() || '';
  const username = $('login-username')?.value?.trim() || '';
  const password = $('login-password')?.value?.trim() || '';

  if (!jwt) return;

  state.demoMode = false;
  state.jwt = jwt;
  state.apiUrl = apiUrl;
  state.username = username;
  state.password = password;
  if (buildersProgramId) {
    state.buildersProgramId = buildersProgramId;
    localStorage.setItem(STORAGE_KEYS.BUILDERS_PROGRAM_ID, buildersProgramId);
  }
  localStorage.setItem(STORAGE_KEYS.JWT, jwt);
  localStorage.setItem(STORAGE_KEYS.API_URL, apiUrl);
  localStorage.setItem(STORAGE_KEYS.USERNAME, username);
  localStorage.setItem(STORAGE_KEYS.PASSWORD, password);

  $('login-modal').classList.add('hidden');
  updateDemoBadge();
  loadConversationHistory();
}

function init() {
  loadConfig();
  applySpriteTheme(getInitialSpriteTheme());

  document.querySelectorAll('.sprite-theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.theme;
      if (t === 'marvin' || t === 'eddie') applySpriteTheme(t);
    });
  });

  const form = $('chat-form');
  const input = $('chat-input');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = input?.value?.trim();
    if (!msg || state.isLoading) return;
    input.value = '';
    sendChat(msg);
  });

  $('login-btn')?.addEventListener('click', handleLogin);

  $('change-jwt-btn')?.addEventListener('click', () => {
    $('jwt-input').value = state.jwt;
    $('api-url').value = state.apiUrl;
    $('login-username').value = state.username;
    $('login-password').value = state.password;
    $('builders-program-id').value = state.buildersProgramId || DEFAULT_BUILDERS_PROGRAM_ID;
    $('login-modal').classList.remove('hidden');
  });

  $('hear-briefing-btn')?.addEventListener('click', () => playBriefing());
  $('stop-briefing-btn')?.addEventListener('click', () => stopBriefing());

  $('knowledge-toggle')?.addEventListener('click', () => {
    $('knowledge-panel')?.classList.toggle('open');
  });
  $('knowledge-submit')?.addEventListener('click', () => {
    addKnowledge($('knowledge-title')?.value, $('knowledge-content')?.value);
  });

  if (state.demoMode || state.jwt) {
    $('login-modal').classList.add('hidden');
    if (state.jwt) loadConversationHistory();
  } else {
    $('login-modal').classList.remove('hidden');
  }

  // Periodic JWT refresh (every 10 min) when credentials are stored
  if (state.username && state.password) {
    setInterval(async () => {
      if (state.jwt && jwtIsExpiredOrExpiringSoon(state.jwt)) {
        await refreshJwt();
      }
    }, 10 * 60 * 1000);
  }

  setSprite('idle');
  setStatus('READY');

  const demoBadge = $('demo-badge');
  if (demoBadge) demoBadge.hidden = !state.demoMode;
}

function updateDemoBadge() {
  const demoBadge = $('demo-badge');
  if (demoBadge) demoBadge.hidden = !state.demoMode;
}

init();
