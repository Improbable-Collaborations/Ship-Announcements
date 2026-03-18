/**
 * One-shot: generate 4 Eddie intro MP3s via ElevenLabs (same voice/settings as server Eddie preset).
 * Run once, commit the files — briefing plays them instantly (no TTS round-trip).
 *
 *   cd Hitchhikers/marv-ui && node scripts/generate-eddie-intro-clips.mjs
 *
 * Needs ELEVENLABS_API_KEY in .env (and optional ELEVENLABS_VOICE_ID_EDDIE).
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE =
  process.env.ELEVENLABS_VOICE_ID_EDDIE || 'cgSgspJ2msm6clMCkdW9';

const PHRASES = [
  "Attention Hitchhikers! Here's your compulsory planning update, please standby!",
  'Oh HII, gang! Eddie here, with a planning update beginning NOW!',
  "Hey team - I'm Eddie and I'm delighted to say you've got mail!",
  'Gooood morning Hitchhikers! Planning update in 3, 2, 1.... beaming in.',
];

const OUT_DIR = path.join(__dirname, '..', 'assets', 'audio');

async function main() {
  if (!KEY) {
    console.error('Set ELEVENLABS_API_KEY in Hitchhikers/marv-ui/.env');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (let i = 0; i < PHRASES.length; i++) {
    const text = PHRASES[i];
    console.log(`Generating eddie-intro-${i}.mp3 ...`);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': KEY,
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.52,
          similarity_boost: 0.78,
          style: 0.42,
          use_speaker_boost: true,
        },
      }),
    });
    if (!res.ok) {
      console.error(await res.text());
      process.exit(1);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const file = path.join(OUT_DIR, `eddie-intro-${i}.mp3`);
    fs.writeFileSync(file, buf);
    console.log('  wrote', file);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log('Done. Refresh marv-ui — intros play from assets/audio/*.mp3');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
