# AI narration (easy-to-hear updates)

## Problem

Git scan lists many files; reading titles/paths aloud is hard to follow.

## Fix

With **`OPENAI_API_KEY`** in `marv-ui/.env`, each **GET /api/planning-briefing** call:

1. Builds the same **structured** data (what happened, docs + paths, needs attention, change log).
2. Sends a **JSON summary** to **OpenAI** (`gpt-4o-mini` by default).
3. Gets back **one continuous script**: grouped themes, plain English, action items as sentences—**no path salad**.

Eddie’s TTS reads that script. The **grid below** still shows the real lists and links for reference.

## Env

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Required for synthesis |
| `OPENAI_BRIEFING_MODEL` | Default `gpt-4o-mini` |
| `PLANNING_BRIEFING_SYNTHESIS=0` | Force old template even with key |

## Cost / privacy

Briefing JSON may include file paths and standup text—only send if acceptable for your OpenAI policy. Typical call is small (a few hundred tokens in, ~300–500 out).
