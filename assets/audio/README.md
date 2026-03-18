# Eddie intro clips (pre-rendered)

Four interchangeable MP3s played **after the chime** before the main briefing — **no ElevenLabs wait** once files exist.

**Generate (one-time):**

```bash
cd Hitchhikers/marv-ui
# ELEVENLABS_API_KEY in .env
node scripts/generate-eddie-intro-clips.mjs
```

Outputs `eddie-intro-0.mp3` … `eddie-intro-3.mp3`. Commit them so the team gets instant intros.

If files are missing, the UI falls back to live TTS for the same line.
