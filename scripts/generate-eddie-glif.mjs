/**
 * Eddie — ASCII-style faces filling the square (no monitor bezel).
 * Row 0: talking loop (8). Row 1: static moods (8). → build with build-eddie-sprite.py
 * GLIF_API_TOKEN in MCP/.env
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(repoRoot, 'MCP', '.env') });

const token = process.env.GLIF_API_TOKEN;
if (!token) {
  console.error('Set GLIF_API_TOKEN in MCP/.env');
  process.exit(1);
}

const GLIF_URL = process.env.GLIF_API_URL || 'https://simple-api.glif.app';
const WORKFLOW_ID = process.env.GLIF_WORKFLOW_ID || 'cmigcvfwm0000k004u9shifki';

const MASTER = `Square pixel-art canvas. Flat dark background (#080c10 to #0f1419) filling the whole image.
NO computer monitor, NO screen bezel, NO frame — the emoticon IS the subject, centered, large.
ASCII-terminal AESTHETIC: chunky pixel smiley like typed emoticons (colon eyes, line or arc mouth),
glowing green or cyan on near-black, monospace / retro terminal mood. Same face scale and position in every image.
Readable as classic text emoticon translated to pixel art. No watermark, no captions.`;

const SAME = 'Identical canvas size and face placement. Face only:';

/** Row 0: cycle during TTS. Row 1: static moods (build script order). */
const FRAMES = [
  { id: 'r0-t00-smile', d: `${SAME} gentle closed smile : ) style, relaxed happy.` },
  { id: 'r0-t01-small-o', d: `${SAME} small open mouth : o speaking softly.` },
  { id: 'r0-t02-wide-O', d: `${SAME} wider round open mouth : O mid-word.` },
  { id: 'r0-t03-grin', d: `${SAME} big grin : D enthusiastic announcement.` },
  { id: 'r0-t04-flat', d: `${SAME} neutral flat mouth : | brief pause between words.` },
  { id: 'r0-t05-wink', d: `${SAME} one eye winking ; ) playful beat.` },
  { id: 'r0-t06-equals', d: `${SAME} equals-sign happy eyes =) warm closed-mouth smile.` },
  { id: 'r0-t07-slash', d: `${SAME} slight asymmetrical mouth : / or :\\ talking transition.` },
  { id: 'r1-idle', d: `${SAME} default friendly :-) calm idle.` },
  { id: 'r1-thinking', d: `${SAME} wide eyes small o mouth o_o thinking loading.` },
  { id: 'r1-working', d: `${SAME} slightly narrowed eyes focused |-| crunching.` },
  { id: 'r1-sigh', d: `${SAME} tired smile sweat-drop vibe ^_^' relieved stress.` },
  { id: 'r1-error', d: `${SAME} X eyes or spiral X_X glitch sorry.` },
  { id: 'r1-surprised', d: `${SAME} huge O mouth :O eyebrows up.` },
  { id: 'r1-smile', d: `${SAME} extra big cheerful :D beaming.` },
  { id: 'r1-sleeping', d: `${SAME} flat line eyes - - mouth u_u winding down.` },
];

const outDir = path.join(__dirname, '..', 'assets', 'eddie-glif-raw');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  for (const { id, d } of FRAMES) {
    const prompt = `${MASTER}\n\n${d}`;
    console.log(`Generating ${id}...`);
    const res = await fetch(GLIF_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: WORKFLOW_ID, inputs: { input1: prompt } }),
      signal: AbortSignal.timeout(180000),
    });
    const data = await res.json();
    if (data.error) {
      console.error(`${id} Glif error:`, data.error);
      process.exit(1);
    }
    const url = data.output;
    if (!url || typeof url !== 'string') {
      console.error(`${id}: no output URL`, data);
      process.exit(1);
    }
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!imgRes.ok) throw new Error(`Download failed ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(path.join(outDir, `${id}.png`), buf);
    console.log(`  saved ${id}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('Run: python3 scripts/build-eddie-sprite.py');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
