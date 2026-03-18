/**
 * Planning-Sprint narration for TTS — fast open, then depth.
 * 1) Title: Update for DATE
 * 2) One sentence: what the team did (from "what happened" bullets)
 * 3) Themed blocks: documents, needs attention, change log
 */

const ACCENTS = ['That is all.', 'There we are.', 'Naturally.'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cap(s) {
  const t = s.trim();
  return t.replace(/^[a-z]/, (c) => c.toUpperCase());
}

function decap(s) {
  return s.trim().replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/** Turn 1–4 bullets into one spoken sentence (no "Here's what happened"). */
function overviewSentence(items) {
  if (!items || items.length === 0) return '';
  const x = items.slice(0, 4).map((t) => t.replace(/\.$/, '').trim());
  if (x.length === 1) return `${cap(x[0])}.`;
  if (x.length === 2) return `${cap(x[0])}, and ${decap(x[1])}.`;
  const first = cap(x[0]);
  const mid = x.slice(1, -1).map(decap).join(', ');
  const last = decap(x[x.length - 1]);
  return mid ? `${first}, plus ${mid}, and ${last}.` : `${first}, and ${last}.`;
}

function toMarvinVoice(summary) {
  const parts = [];

  // 1) Title — immediate anchor
  if (summary.date) {
    parts.push(`Update for ${summary.date}.`);
  } else {
    parts.push('Planning update.');
  }

  // 2) Single overview sentence from "what happened"
  const overview = overviewSentence(summary.whatHappened || []);
  if (overview) {
    parts.push(overview);
  }

  // 3) Themed detail (was already the stronger half — clearer section labels for ear)
  if (summary.documentsCreated && summary.documentsCreated.length > 0) {
    const docs = summary.documentsCreated.slice(0, 5);
    parts.push('Documents.');
    docs.forEach((d) => parts.push(`${d.replace(/\.$/, '')}.`));
  }

  if (summary.needsAttention && summary.needsAttention.length > 0) {
    const needs = summary.needsAttention.slice(0, 5);
    parts.push('Needs attention.');
    needs.forEach((n) => {
      parts.push(`${n.what} — ${n.who}, ${n.when}.`);
    });
  }

  if (summary.changeLogSummary) {
    parts.push('Change log.');
    parts.push(summary.changeLogSummary.replace(/^Change log:\s*/i, '').trim());
  }

  // Author credit last so it does not slow the hook (optional)
  if (summary.author) {
    parts.push(`Compiled by ${summary.author}.`);
  }

  if (parts.length <= (summary.date ? 1 : 0) + (overview ? 1 : 0)) {
    // almost nothing beyond title — still allow accent
    parts.push(pick(ACCENTS));
  } else if (Math.random() < 0.35) {
    parts.push(pick(ACCENTS));
  }

  const full = parts.join(' ').replace(/\s+/g, ' ').trim();
  return full.slice(0, 4500);
}

module.exports = { toMarvinVoice, overviewSentence };
