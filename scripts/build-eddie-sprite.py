#!/usr/bin/env python3
"""Tile eddie-glif-raw frames into 8x2 sprite sheet (8 talk + 8 static). Cell 80px."""
import os
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(SCRIPT_DIR, "..", "assets", "eddie-glif-raw")
OUT = os.path.join(SCRIPT_DIR, "..", "assets", "eddie-sprite-sheet.png")
CELL = 80
COLS, ROWS = 8, 2

ORDER = [
    "r0-t00-smile", "r0-t01-small-o", "r0-t02-wide-O", "r0-t03-grin",
    "r0-t04-flat", "r0-t05-wink", "r0-t06-equals", "r0-t07-slash",
    "r1-idle", "r1-thinking", "r1-working", "r1-sigh",
    "r1-error", "r1-surprised", "r1-smile", "r1-sleeping",
]

def main():
    sheet = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (8, 12, 16, 255))
    for i, name in enumerate(ORDER):
        path = os.path.join(RAW, f"{name}.png")
        if not os.path.isfile(path):
            print(f"Missing {path} — run generate-eddie-glif.mjs first")
            return 1
        im = Image.open(path).convert("RGBA")
        im = im.resize((CELL, CELL), Image.Resampling.LANCZOS)
        c, r = i % COLS, i // COLS
        sheet.paste(im, (c * CELL, r * CELL))
    sheet.save(OUT, optimize=True)
    print(f"Wrote {OUT} ({COLS * CELL}x{ROWS * CELL})")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
