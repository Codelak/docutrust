#!/usr/bin/env python3
"""Render real evidence text files as terminal-style PNG figures."""
import re, sys
from PIL import Image, ImageDraw, ImageFont

BG       = (16, 19, 24)
FG       = (216, 222, 233)
DIM      = (110, 118, 132)
TBAR     = (30, 36, 46)
DOT      = (96, 104, 116)
FONT_P   = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_B   = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FSZ      = 15
CHAR_W   = 9
LINE_H   = 22
PAD_X    = 26
PAD_Y    = 18
MAXW     = 118

def strip_ansi(s):
    return re.sub(r"\x1b\[[0-9;]*m", "", s)

def wrap(line, max_chars):
    if len(line) <= max_chars:
        return [line]
    out = []
    while len(line) > max_chars:
        out.append(line[:max_chars]); line = line[max_chars:]
    out.append(line)
    return out

def render(in_path, out_path, title, subtitle, accent):
    raw = strip_ansi(open(in_path).read()).rstrip("\n")
    lines = []
    for ln in raw.splitlines():
        lines.extend(wrap(ln, MAXW))

    font  = ImageFont.truetype(FONT_P, FSZ)
    fbold = ImageFont.truetype(FONT_B, FSZ)
    fbold_small = ImageFont.truetype(FONT_B, 12)

    width  = PAD_X * 2 + MAXW * CHAR_W
    tbar_h = 40
    height = PAD_Y + tbar_h + len(lines) * LINE_H + PAD_Y

    img = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, width, tbar_h], fill=TBAR)
    for i, dx in enumerate((18, 34, 50)):
        d.ellipse([dx, 16, dx + 9, 25], fill=DOT)
    d.text((74, 8), title, font=fbold, fill=accent)
    d.text((74, 25), subtitle, font=fbold_small, fill=DIM)
    d.line([(0, tbar_h), (width, tbar_h)], fill=(58, 66, 80), width=1)

    y = PAD_Y + tbar_h + 6
    for ln in lines:
        d.text((PAD_X, y), ln, font=font, fill=FG)
        y += LINE_H
    img.save(out_path)
    print(f"{out_path}: {width}x{height}, {len(lines)} lines")

AMBER = (240, 178, 90)
GREEN = (98, 200, 120)
RED   = (232, 92, 104)

render("evidence/01-sast-default/semgrep-owasp-javascript.txt",
       "docs/images/01-sast-default-xss.png",
       "semgrep --config=p/owasp-top-ten --config=p/javascript src/",
       "Default rulesets — the XSS finding (deliverables 1 & 3) · exit 0, 1 finding", AMBER)

render("evidence/05-custom-rule/run.txt",
       "docs/images/02-sast-custom-sqli.png",
       "semgrep --config=semgrep/rules/ --error src/ test-cases.js",
       "Project custom rule — the SQLi the defaults missed + 5 generalized shapes (deliverables 2 & 4) · exit 1", AMBER)

render("/tmp/gitleaks-history.txt",
       "docs/images/03-gitleaks-full-history.png",
       "gitleaks detect -c gitleaks.toml --log-opts=\"--all\"",
       "Full-history secrets sweep — the seeded key, exactly one leak (deliverables 5 & 8) · exit 1", AMBER)

render("evidence/07-live-verification/07-live-verification.txt",
       "docs/images/04-live-verification.png",
       "node security/verify-credential.js",
       "Live check — sts:GetCallerIdentity against the found key (deliverable 6) · verdict: NOT LIVE", GREEN)

render("evidence/08-fixed-rerun/semgrep-custom.txt",
       "docs/images/05-rerun-clean.png",
       "semgrep --config=semgrep/rules/ --error src/  (after fixes)",
       "Deliverable 7 rerun — 0 findings, exit 0", GREEN)

render("/tmp/ci-main-green.txt",
       "docs/images/06-ci-main-green.png",
       "gh run view — CI on main (fixed code)",
       "All three jobs green: build-and-test, sast, secrets-scan (deliverable 9)", GREEN)

render("/tmp/ci-violation-red.txt",
       "docs/images/07-ci-violation-red.png",
       "gh run view — CI on the seeded violation PR",
       "Both gates blocked it: sast exit 1, secrets-scan exit 1 (deliverable 9)", RED)
