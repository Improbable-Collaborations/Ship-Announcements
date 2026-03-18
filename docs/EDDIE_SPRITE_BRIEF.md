# Eddie — ASCII box sprites (Glif)

## Concept

**No monitor bezel** — the square **is** the face. **ASCII-terminal aesthetic**: chunky pixel emoticons (colon eyes, line/arc mouths), green/cyan glow on dark. Same face scale/position every frame.

- **Row 0 (8 frames):** mouth variants for **talk animation** while TTS plays — cycles ~9/sec in the UI.
- **Row 1 (8 frames):** static moods — idle, thinking, working, sigh, error, surprised, smile, sleeping.

## Regenerate

```bash
cd Hitchhikers/marv-ui
node scripts/generate-eddie-glif.mjs   # GLIF_API_TOKEN in MCP/.env
python3 scripts/build-eddie-sprite.py
```

Outputs: `assets/eddie-glif-raw/*.png` → `assets/eddie-sprite-sheet.png` (640×160, 8×2 @ 80px).

## App wiring

- **Eddie theme:** `setSprite('talking')` starts the row-0 loop during briefing narration; other expressions map to row 1.
- **Marvin theme:** unchanged expression sheet.
