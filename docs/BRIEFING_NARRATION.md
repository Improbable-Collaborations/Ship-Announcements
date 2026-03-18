# Briefing narration shape (TTS)

Built in `server/marvin-voice.js` from the structured extract in `planning-briefing.js`.

## Order (fast → specific)

| Block | Role |
|-------|------|
| **1. Title** | `Update for {date}.` — instant context, no warmup. |
| **2. One sentence** | Synthesises the **What happened** bullets (up to 4) into a single overview so listeners get the gist before detail. |
| **3. Documents** | Section label **Documents.** then each new doc as its own short sentence. |
| **4. Needs attention** | **Needs attention.** then table rows as before (what — who, when). |
| **5. Change log** | **Change log.** then commit summary. |
| **6. Credit** | `Compiled by {author}.` at the end so it doesn’t delay the hook. |

## Why this order

- **Title first** answers “which day?” in one breath.
- **One sentence** carries the narrative thread (what the team actually did) instead of a bullet parade at the start.
- **Themed sections** match how people scan the written briefing and are easy to follow by ear.

## Tweaking

- Edit bullet extraction in `planning-briefing.js` (`whatHappened`, sections) if the overview sentence feels thin.
- For richer overview without longer TTS, add a single **Executive line** field to daily briefings and prefer that when present (future enhancement).
