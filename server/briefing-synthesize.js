/**
 * Turn raw briefing facts + git doc list into one clear spoken narrative (OpenAI).
 * Set OPENAI_API_KEY in marv-ui/.env. Disable: PLANNING_BRIEFING_SYNTHESIS=0
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM = `You write the spoken script for Eddie, the Heart of Gold ship computer—a friendly, clear voice briefing the crew.

You receive JSON: themes from the daily note, a list of recently touched files (paths + titles), action items, and a one-line change-log summary.

Before writing, you must:
1. Infer what actually happened: group files by folder and topic (e.g. everything under Hitchhikers-Guide = one theme). Do not treat each file as unrelated noise.
2. Connect themes to the "what happened" bullets when they align.
3. Turn action items into short, spoken sentences (who, what, when)—not a table.

Output rules:
- Plain sentences only. No markdown, bullets, numbers-as-lists, file paths read aloud, or stage directions.
- First sentence must be: "Update for [DATE]." using the date field exactly as given (or "Planning update." if missing).
- Do not read filenames or repo paths. Say what was added in human terms ("new Hitchhikers Guide pages", "a holons design note", "standup notes from Improbable Productions").
- If there are many docs in one area, one paragraph for that area is enough.
- Then cover the important action items in 2–5 short sentences.
- One closing sentence for repo activity if changeLog is non-empty.
- Target 160–320 words. Must be easy to follow when heard once.`;

async function maybeSynthesizeNarration(base) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || String(process.env.PLANNING_BRIEFING_SYNTHESIS).toLowerCase() === '0') {
    return { text: base.text, narrativeSynthesized: false };
  }

  const s = base.structured || {};
  const hasContent =
    (s.whatHappened && s.whatHappened.length) ||
    (s.documentsWithPaths && s.documentsWithPaths.length) ||
    (s.needsAttention && s.needsAttention.length) ||
    s.changeLogSummary ||
    s.date;

  if (!hasContent) {
    return { text: base.text, narrativeSynthesized: false };
  }

  const payload = {
    date: s.date || null,
    author: s.author || null,
    whatHappened: (s.whatHappened || []).slice(0, 12),
    recentDocuments: (s.documentsWithPaths || []).slice(0, 35).map((d) => ({
      title: d.title,
      path: d.path,
    })),
    needsAttention: (s.needsAttention || []).slice(0, 10).map((r) => ({
      what: r.what,
      who: r.who,
      when: r.when,
    })),
    changeLogSummary: s.changeLogSummary || null,
  };

  const user = `Produce the spoken briefing from this data:\n\n${JSON.stringify(payload, null, 2)}`;

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_BRIEFING_MODEL || 'gpt-4o-mini',
        max_tokens: 1100,
        temperature: 0.45,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('[briefing-synthesize] OpenAI error:', res.status, err.slice(0, 200));
      return { text: base.text, narrativeSynthesized: false };
    }

    const data = await res.json();
    const narr = data.choices?.[0]?.message?.content?.trim();
    if (!narr || narr.length < 120) {
      return { text: base.text, narrativeSynthesized: false };
    }

    return { text: narr.slice(0, 4500), narrativeSynthesized: true };
  } catch (e) {
    console.warn('[briefing-synthesize]', e.message);
    return { text: base.text, narrativeSynthesized: false };
  }
}

module.exports = { maybeSynthesizeNarration };
