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

    try:
        font  = ImageFont.truetype(FONT_P, FSZ)
        fbold = ImageFont.truetype(FONT_B, FSZ)
        fbold_small = ImageFont.truetype(FONT_B, 12)
    except OSError:  # DejaVu fonts not installed — degrade gracefully
        font = fbold = fbold_small = ImageFont.load_default()

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

import os

def render_if_exists(in_path, out_path, title, subtitle, accent):
    if not os.path.exists(in_path):
        print(f"SKIP {out_path}: source {in_path} not present")
        return
    render(in_path, out_path, title, subtitle, accent)

AMBER = (240, 178, 90)
GREEN = (98, 200, 120)
RED   = (232, 92, 104)

render("evidence/project-1/01-sast-default/semgrep-owasp-javascript.txt",
       "docs/project-1/images/01-sast-default-xss.png",
       "semgrep --config=p/owasp-top-ten --config=p/javascript src/",
       "Default rulesets — the XSS finding (deliverables 1 & 3) · exit 0, 1 finding", AMBER)

render("evidence/project-1/05-custom-rule/run.txt",
       "docs/project-1/images/02-sast-custom-sqli.png",
       "semgrep --config=semgrep/rules/ --error src/ test-cases.js",
       "Project custom rule — the SQLi the defaults missed + 5 generalized shapes (deliverables 2 & 4) · exit 1", AMBER)

render_if_exists("evidence/project-1/06-secrets/full-history-sweep.txt",
       "docs/project-1/images/03-gitleaks-full-history.png",
       "gitleaks detect -c gitleaks.toml --log-opts=\"--all\"",
       "Full-history secrets sweep — the seeded key, exactly one leak (deliverables 5 & 8) · exit 1", AMBER)

render("evidence/project-1/07-live-verification/07-live-verification.txt",
       "docs/project-1/images/04-live-verification.png",
       "node security/verify-credential.js",
       "Live check — sts:GetCallerIdentity against the found key (deliverable 6) · verdict: NOT LIVE", GREEN)

render("evidence/project-1/08-fixed-rerun/semgrep-custom.txt",
       "docs/project-1/images/05-rerun-clean.png",
       "semgrep --config=semgrep/rules/ --error src/  (after fixes)",
       "Deliverable 7 rerun — 0 findings, exit 0", GREEN)

# Figure 6's capture was never committed with the repo (the original green
# main run happened on the pre-rename account). Regenerate it by saving a
# fresh green run's view: gh run view <id> > evidence/project-1/09-ci-gate/run2-main-GREEN.txt
render_if_exists("evidence/project-1/09-ci-gate/run2-main-GREEN.txt",
       "docs/project-1/images/06-ci-main-green.png",
       "gh run view — CI on main (fixed code)",
       "All three jobs green: build-and-test, sast, secrets-scan (deliverable 9)", GREEN)

render("evidence/project-1/09-ci-gate/run2-violation-PR-FAILED-both-gates.txt",
       "docs/project-1/images/07-ci-violation-red.png",
       "gh run view — CI on the seeded violation PR",
       "Both gates blocked it: sast exit 1, secrets-scan exit 1 (deliverable 9)", RED)

# ─────────────────────────────────────────────────────────────────────
# Project 2 (SCA, Dependency Confusion, Scorecard) — figures 08-15.
# Sources are real captures under evidence/project-2/10..16-*, written during the
# project's stages; every figure below is the actual tool output.
# ─────────────────────────────────────────────────────────────────────

render("evidence/project-2/10-sca-baseline/npm-audit.txt",
       "docs/project-2/images/08-npm-audit-finding.png",
       "npm audit",
       "S1 — full SCA scan: the seeded lodash finding, 1 high, 6 advisories (D1)", RED)

render("evidence/project-2/11-transitive-review/npm-ls-depth1.txt",
       "docs/project-2/images/09-npm-ls-tree.png",
       "npm ls --depth=1",
       "S2 — direct deps + one transitive layer; lodash the only leaf with a finding (D2)", AMBER)

render("evidence/project-2/12-lodash-fix/npm-install-and-rescan.txt",
       "docs/project-2/images/10-lodash-fix-clean.png",
       "npm install lodash@4.18.1 --save-exact  &&  npm audit",
       "S3 — remediated: exact pin 4.18.1, rescan 0 vulnerabilities (D3)", GREEN)

render("evidence/project-2/13-scope-demo/demo-with-defense.txt",
       "docs/project-2/images/11-scope-demo.png",
       "npm config get @docutrust:registry  &&  npm view @docutrust/shared",
       "S5 — confusion defense live: scoped resolution fails against the private host, never npmjs (D5)", GREEN)

render("evidence/project-2/14-typosquat/manual-review.txt",
       "docs/project-2/images/12-typosquat-probes.png",
       "npm view <near-variant> version time.created maintainers",
       "S6 — manual typosquat probes: 8 of 14 near-variants exist, none in our tree; zod-js = npm security takedown (D6)", AMBER)

render("evidence/project-2/15-scorecard/scorecard-default.txt",
       "docs/project-2/images/13-scorecard-repo.png",
       "scorecard --repo github.com/Codelak/docutrust",
       "S7 — OpenSSF Scorecard: aggregate 2.6/10, all 18 checks read in evidence/project-2/15-scorecard (D7)", AMBER)

render("evidence/project-2/16-ci-gates/run-main-GREEN.txt",
       "docs/project-2/images/14-ci-main-green.png",
       "gh run view — CI on main with the new sca job",
       "S8 — all four jobs green: build-and-test, sast, secrets-scan, sca (D8)", GREEN)

render("evidence/project-2/16-ci-gates/run-seeded-PR-FAILED.txt",
       "docs/project-2/images/15-seeded-pr-blocked.png",
       "gh run view — CI on the seeded dependency PR",
       "S9 — the gate blocks: sca failed on left-pad score 4.2 < 5 (D9); PR closed, branch deleted", RED)
