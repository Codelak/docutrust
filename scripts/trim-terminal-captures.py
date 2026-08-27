#!/usr/bin/env python3
"""Frame terminal-screenshot PNGs for the Word walkthroughs.

Each capture is (1) trimmed to its content so no dead black space is
embedded, then (2) framed like a terminal window: a thin border and a
label bar with the capture's name, so figures look deliberate in the
document rather than like raw dialogs.

Usage: python3 scripts/trim-terminal-captures.py docs/images ...
"""
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

BG = (16, 19, 20)            # xterm background
FRAME = (59, 66, 82)         # window border
BAR = (46, 52, 64)           # window title bar
BAR_TEXT = (216, 222, 233)
PAD_X, PAD_Y = 18, 14
BAR_H = 30
BORDER = 2
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"


def label_for(path, stem):
    # "16-sast-custom-rule.png" -> "16 · sast custom rule"
    import re
    m = re.match(r"(\d+)[-_](.*)", stem)
    num, rest = m.group(1), m.group(2) if m else stem
    return f"{num} · " + rest.replace("-", " ").replace("_", " ")


def trim_frame(path):
    img = Image.open(path).convert("RGB")
    diff = ImageChops.difference(img, Image.new("RGB", img.size, BG))
    mask = diff.convert("L").point(lambda v: 255 if v > 12 else 0)
    bbox = mask.getbbox()
    if bbox is not None:
        img = img.crop(bbox)

    w, h = img.size
    out = Image.new("RGB", (w + PAD_X * 2, h + BAR_H + PAD_Y + BORDER * 2),
                    FRAME)

    d = ImageDraw.Draw(out)
    try:
        f = ImageFont.truetype(FONT, 13)
    except OSError:
        f = ImageFont.load_default()
    # chrome first: border, title bar, background
    d.rectangle([0, 0, out.width - 1, out.height - 1], fill=FRAME)
    d.rectangle([0, BAR_H, out.width - 1, out.height - 1 - BORDER], fill=BG)
    d.rectangle([0, 0, out.width - 1, BAR_H - 1], fill=BAR)
    d.text((12, 8), "docuTrust shell — " + label_for(path, path.stem),
           font=f, fill=BAR_TEXT)

    # then the trimmed capture sits in the content area
    out.paste(img, (PAD_X, BAR_H + PAD_Y - BORDER))
    d.line([0, BAR_H, out.width, BAR_H], fill=FRAME, width=BORDER)
    out.save(path)


def main(dirs):
    n = 0
    for d in dirs:
        for p in sorted(Path(d).glob("*.png")):
            trim_frame(p)
            n += 1
    print(f"framed {n} captures")


if __name__ == "__main__":
    main(sys.argv[1:])
