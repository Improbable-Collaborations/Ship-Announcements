/**
 * Reads latest Planning-Sprint content, extracts a concise structured summary,
 * and returns it in Marvin the Paranoid Android's voice for TTS.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { toMarvinVoice } = require('./marvin-voice');

const PLANNING_SPRINT = process.env.PLANNING_SPRINT_PATH || path.join(__dirname, '../../Planning-Sprint');
const DOC_SCAN_DAYS = parseInt(process.env.PLANNING_SPRINT_DOC_SCAN_DAYS || '21', 10);
const DOC_SCAN_MAX = parseInt(process.env.PLANNING_SPRINT_DOC_SCAN_MAX || '22', 10);

function readLatestInDir(dirPath, opts = {}) {
  const { extension = '.md', prefix = null } = opts;
  if (!fs.existsSync(dirPath)) return '';
  let files = fs.readdirSync(dirPath).filter((f) => f.endsWith(extension));
  if (prefix) files = files.filter((f) => f.startsWith(prefix));
  files.sort().reverse();
  if (files.length === 0) return '';
  const fullPath = path.join(dirPath, files[0]);
  return fs.readFileSync(fullPath, 'utf8');
}

/** Extract date from "Daily Briefing — Monday 17 March 2026" or "Change Log — 2026-03-17" */
function extractDate(text) {
  const match = text.match(/(?:Daily Briefing|Change Log)\s*[—\-]\s*([^\n`]+?)(?:\s*$|\s*`)/m);
  return match ? match[1].trim() : null;
}

/** Extract author from "**Author:** Graham" */
function extractAuthor(text) {
  const match = text.match(/\*\*Author:\*\*\s*([^\n*]+)/);
  return match ? match[1].trim() : null;
}

/** Get bullet points from a section (lines starting with - or *), strip markdown, limit length */
function extractBullets(text, maxItems = 8, maxLen = 120) {
  const bullets = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s+(.+)/);
    if (m) {
      let item = m[1]
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s*_\[source[^)]*\]_\s*$/, '')
        .trim();
      if (item.length > maxLen) item = item.slice(0, maxLen - 3) + '...';
      if (item) bullets.push(item);
    }
  }
  return bullets.slice(0, maxItems);
}

/** Get content between two headers (## or ###) */
function sectionBetween(text, startHeading, endHeading) {
  const lines = text.split('\n');
  let inSection = false;
  const out = [];
  for (const line of lines) {
    const isHeader = (line.startsWith('## ') || line.startsWith('### ')) && line.trim().length > 0;
    if (isHeader && line.includes(startHeading)) {
      inSection = true;
      continue;
    }
    if (inSection && isHeader && endHeading && line.includes(endHeading)) break;
    if (inSection) out.push(line);
  }
  return out.join('\n');
}

/** Parse a simple markdown table into rows of { what, who, when } (Needs attention) */
function parseNeedsAttentionTable(text) {
  const rows = [];
  const section = sectionBetween(text, 'Needs attention', 'Your action') || sectionBetween(text, 'Needs attention', '##');
  const lines = section.split('\n').filter((l) => l.trim().startsWith('|') && !l.includes('---'));
  const header = lines[0];
  if (!header || !header.includes('What') || !header.includes('Who')) return rows;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 3) rows.push({ what: cells[0], who: cells[1], when: cells[2] || '' });
  }
  return rows.slice(0, 6);
}

/** Extract "Documents created" as short lines (strip file paths for TTS) */
function extractDocumentsCreated(text) {
  const section = sectionBetween(text, 'Documents created', 'Your action') || sectionBetween(text, 'Documents created', 'Documents we need');
  let bullets = extractBullets(section, 5, 100);
  if (bullets.length) {
    bullets = bullets.map((b) => b.replace(/\s*[—\-]\s*[^—]*`[^`]+`.*$/, '').replace(/\s*`[^`]+`/g, '').trim().slice(0, 85));
    return bullets.filter(Boolean);
  }
  const lines = section.split('\n').filter((l) => l.trim().startsWith('-'));
  return lines.slice(0, 5).map((l) => l.replace(/^\s*-\s*\*\*([^*]+)\*\*.*/, '$1').replace(/\s*`[^`]+`/g, '').trim().slice(0, 85));
}

/** Extract "Documents created" as { title, path } for visual links (path from `...` in line) */
function extractDocumentsWithPaths(text) {
  const section = sectionBetween(text, 'Documents created', 'Your action') || sectionBetween(text, 'Documents created', 'Documents we need');
  const entries = [];
  const lines = section.split('\n').filter((l) => l.trim().startsWith('-'));
  for (const line of lines.slice(0, 6)) {
    const titleMatch = line.match(/^\s*-\s*\*\*([^*]+)\*\*/);
    const pathMatch = line.match(/`([^`]+)`/);
    const title = titleMatch ? titleMatch[1].trim().replace(/\s*[—\-:].*$/, '').trim() : null;
    const docPath = pathMatch ? pathMatch[1].trim() : null;
    if (title) entries.push({ title: title.slice(0, 80), path: docPath || null });
  }
  return entries;
}

const GIT_DOC_SKIP = [
  '.git',
  'node_modules',
  '.obsidian',
  '.DS_Store',
  'package-lock.json',
];
const GIT_DOC_EXT = new Set(['.md', '.mdx', '.txt', '.pdf']);

function gitDocPathOk(rel) {
  const n = rel.replace(/\\/g, '/');
  if (!n || n.length > 240) return false;
  if (GIT_DOC_SKIP.some((s) => n.includes(s))) return false;
  const ext = path.extname(n).toLowerCase();
  return GIT_DOC_EXT.has(ext);
}

function pathToDocTitle(relPath) {
  const base = path.basename(relPath, path.extname(relPath));
  let t = base
    .replace(/^\d{4}-\d{2}-\d{2}[-_T]\d*/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!t) t = base;
  return t.slice(0, 78);
}

/**
 * Recently added/changed docs across the whole Planning-Sprint git repo (not just briefing section).
 */
function getDocumentsFromGitRepo(root) {
  const gitDir = path.join(root, '.git');
  if (!fs.existsSync(gitDir)) return [];

  try {
    const sinceArg = `${Math.max(1, DOC_SCAN_DAYS)}.days.ago`;
    const out = execSync(
      `git log --since=${sinceArg} --name-only --pretty=format: --diff-filter=ACMR`,
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 6 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    const order = new Map();
    let i = 0;
    for (const line of out.split('\n')) {
      const rel = line.trim().replace(/\\/g, '/');
      if (!rel || !gitDocPathOk(rel)) continue;
      if (!order.has(rel)) order.set(rel, i++);
    }
    const sorted = [...order.entries()].sort((a, b) => a[1] - b[1]).map(([p]) => p);
    return sorted.slice(0, DOC_SCAN_MAX).map((p) => ({
      title: pathToDocTitle(p),
      path: p,
    }));
  } catch (e) {
    console.warn('[planning-briefing] git document scan:', e.message);
    return [];
  }
}

function mergeDocumentLists(fromGit, fromBriefing) {
  const seen = new Set();
  const out = [];
  for (const d of fromGit) {
    const key = (d.path || '').toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(d);
  }
  for (const d of fromBriefing || []) {
    const key = (d.path || d.title || '').toLowerCase();
    if (d.path && seen.has(d.path.toLowerCase())) continue;
    if (d.path) seen.add(d.path.toLowerCase());
    out.push({
      title: (d.title || pathToDocTitle(d.path || '')).slice(0, 80),
      path: d.path || null,
    });
  }
  return out.slice(0, Math.max(DOC_SCAN_MAX, 28));
}

/** One-line summary of changelog (commits by whom) — factual only */
function summarizeChangeLog(changeLogText) {
  if (!changeLogText) return '';
  const byMatch = changeLogText.match(/##\s+([^\n]+)/);
  const author = byMatch ? byMatch[1].trim() : '';
  const commitCount = (changeLogText.match(/-\s*`[a-f0-9]+`/g) || []).length;
  if (commitCount === 0) return '';
  return `Change log: ${commitCount} commit${commitCount !== 1 ? 's' : ''} today. ${author ? `By ${author}.` : ''}`;
}

/**
 * Build a structured summary from raw briefing and changelog text.
 */
function extractStructuredSummary(briefingText, changeLogText) {
  const summary = {
    date: extractDate(briefingText) || extractDate(changeLogText),
    author: extractAuthor(briefingText),
    whatHappened: [],
    documentsCreated: [],
    needsAttention: [],
    changeLogSummary: summarizeChangeLog(changeLogText),
  };

  if (briefingText) {
    const whatSection = sectionBetween(briefingText, 'What happened', 'Documents');
    summary.whatHappened = extractBullets(whatSection, 6, 100);
    if (summary.whatHappened.length === 0) {
      const sub = sectionBetween(briefingText, 'New infrastructure', 'Transcripts');
      if (sub) summary.whatHappened.push('New infrastructure and systems for comms and daily updates.');
      const transcripts = sectionBetween(briefingText, 'Transcripts processed', 'Documents');
      const tBullets = extractBullets(transcripts, 3, 80);
      summary.whatHappened.push(...tBullets);
    }
    summary.documentsCreated = extractDocumentsCreated(briefingText);
    summary.documentsWithPaths = extractDocumentsWithPaths(briefingText);
    summary.needsAttention = parseNeedsAttentionTable(briefingText);
  }

  return summary;
}

/**
 * Assemble briefing from files + git scan + template voice (before optional AI narration).
 * @returns {{ text: string, structured: object, changeLogPath: string|null }}
 */
function assemblePlanningBriefingData() {
  const briefingsDir = path.join(PLANNING_SPRINT, '__STARTHERE', 'Daily-Briefings');
  const changeLogDir = path.join(PLANNING_SPRINT, '__STARTHERE', 'Change-Log');
  const briefing = readLatestInDir(briefingsDir, { prefix: 'Briefing-' });
  const changeLog = readLatestInDir(changeLogDir, { prefix: 'Change-Log-' });

  const structured = extractStructuredSummary(briefing, changeLog);

  const fromGit = getDocumentsFromGitRepo(PLANNING_SPRINT);
  const fromBrief = structured.documentsWithPaths || extractDocumentsWithPaths(briefing);
  structured.documentsWithPaths = mergeDocumentLists(fromGit, fromBrief);
  structured.documentsCreated = structured.documentsWithPaths.slice(0, 14).map((d) => {
    if (d.path) return `${d.title} — ${d.path}`.slice(0, 120);
    return d.title;
  });

  let changeLogPath = null;
  if (fs.existsSync(changeLogDir)) {
    const files = fs.readdirSync(changeLogDir).filter((f) => f.startsWith('Change-Log-') && f.endsWith('.md')).sort().reverse();
    if (files.length) changeLogPath = `__STARTHERE/Change-Log/${files[0]}`;
  }

  const hasAny =
    structured.whatHappened?.length ||
    structured.documentsCreated?.length ||
    structured.needsAttention?.length ||
    structured.changeLogSummary;

  const text =
    !hasAny && !structured.date
      ? "No briefing or change log found. Add content to Planning-Sprint. I could have told you that would happen. I usually do."
      : toMarvinVoice(structured);

  return { text, structured, changeLogPath };
}

function getPlanningBriefing() {
  return assemblePlanningBriefingData();
}

/** @returns {string} Concise briefing in Marvin's voice for TTS (max ~4500 chars) */
function getPlanningBriefingText() {
  return assemblePlanningBriefingData().text;
}

module.exports = {
  getPlanningBriefingText,
  getPlanningBriefing,
  assemblePlanningBriefingData,
  extractStructuredSummary,
  getDocumentsFromGitRepo,
  PLANNING_SPRINT,
};
