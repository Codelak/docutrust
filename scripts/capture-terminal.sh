#!/usr/bin/env bash
# Captures REAL terminal screenshots: runs a command in a real xterm on an
# Xvfb virtual display and photographs it with ImageMagick `import`.
#
# Why: the walkthrough docs embed screenshots, and a screenshot somebody
# drew with PIL is a drawing, not a capture. This script is the reproducible
# path on a headless machine: xterm + Xvfb + import, nothing else.
#
# Usage:
#   ./scripts/capture-terminal.sh "NAME" "command to run" [--repo DIR] [--cwd DIR] [--wait SECS] [--out DIR]
#
#   NAME      short slug, used in the output filename
#   command   the command to run inside the terminal, exactly as a mentee
#             would type it
#   --repo    project directory; its .env.local is sourced so DATABASE_URL
#             reaches the process (default: current project root)
#   --cwd     directory to start the command in (default: --repo)
#   --wait    seconds to wait before the screenshot (default: 3)
#   --out     directory to save NAME.png into (default: docs/project-1/images)
#
# Env: CAPTURE_DISPLAY (default :99).
#
# Style: 95x30 terminal, DejaVu Sans Mono 12, dark background.
#
# Robustness (the hard-won part):
#   - the command runs from a FILE, not a -c string: no quoting of a
#     multi-line script inside a shell
#   - -hold keeps the window open until we kill it
#   - the window title is unique per capture, so a leftover window from an
#     interrupted run can never fake a match
#   - if the window never maps, we fall back to photographing the whole
#     screen and cropping the known xterm region; if that crop is blank
#     (mean brightness ≈ 0) it is a genuine failure, reported honestly
#     instead of saving an empty screenshot

set -e

NAME="$1"; shift
CMD="$1"; shift
REPO=""
CWD=""
WAIT=3
OUTDIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2;;
    --cwd)  CWD="$2"; shift 2;;
    --wait) WAIT="$2"; shift 2;;
    --out)  OUTDIR="$2"; shift 2;;
    *) echo "unknown option: $1" >&2; exit 2;;
  esac
done

# Find the project root when --repo wasn't given: walk up to the git tree
# that owns the docs (or use the current repo if inside one).
if [ -z "$REPO" ]; then
  REPO="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -z "$REPO" ]; then
    d="$PWD"
    while [ "$d" != "/" ] && [ ! -d "$d/docs" ]; do d="${d%/..}"; done
    [ -d "$d/docs" ] && REPO="$d"
  fi
fi
[ -n "$REPO" ] || { echo "cannot locate the project root; pass --repo" >&2; exit 2; }

DISPLAY_NUM="${CAPTURE_DISPLAY:-:99}"
[ -n "$OUTDIR" ] || OUTDIR="$REPO/docs/project-1/images"
mkdir -p "$OUTDIR"

# One Xvfb for all captures of a run. Start it lazily so the script also
# works as a one-shot.
if ! pgrep -f "Xvfb ${DISPLAY_NUM}" >/dev/null 2>&1; then
  Xvfb "${DISPLAY_NUM}" -screen 0 1400x800x24 -nolisten tcp &
  sleep 1
fi

REPO_ABS="$(cd "$REPO" && pwd)"
if [ -n "$CWD" ]; then
  START_DIR="$(cd "${REPO_ABS}/${CWD}" 2>/dev/null && pwd || echo "$REPO_ABS")"
else
  START_DIR="$REPO_ABS"
fi

# Load .env.local so DATABASE_URL reaches every process, then run the
# captured command. File-based: no -c quoting to get wrong.
# The shot should look like a real terminal session: the typed command is
# echoed, then its output follows. The command line is printed with its
# prompt marker; the command itself runs once.
PROFILE_FILE="$(mktemp /tmp/capture-profile.XXXXXX)"
cat > "$PROFILE_FILE" <<EOF
set +a
[ -f "${REPO_ABS}/.env.local" ] && set -a && . "${REPO_ABS}/.env.local" && set +a
cd '${START_DIR}'
printf '\n\e[1;32m$ \e[0m'
printf '%s\n' "${CMD}"
${CMD}
EOF

export DISPLAY="${DISPLAY_NUM}"
TITLE="capture-${NAME}-$$"
xterm -geometry 95x30+0+0 \
  -fa "DejaVu Sans Mono" -fs 14 \
  -bg "#101314" -fg "#e8eef0" -bd "#606060" -bw 2 \
  -T "${TITLE}" \
  -hold \
  -e /bin/bash --noprofile --norc "${PROFILE_FILE}" &
XP=$!
sleep "${WAIT}"

# Find the xterm window by title. ImageMagick's -window takes a window id,
# so resolve the title to an id first; poll because the window maps a
# moment after the process forks.
wid=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  wid="$(xwininfo -display "${DISPLAY_NUM}" -root -tree 2>/dev/null \
    | awk -v t="${TITLE}" 'index($0, t) { match($0, /0x[0-9a-f]+/); if (RSTART) { print substr($0, RSTART, RLENGTH); exit } }')"
  [ -n "$wid" ] && break
  sleep 0.5
done

success=0
if [ -n "$wid" ]; then
  import -display "${DISPLAY_NUM}" -window "${wid}" "${OUTDIR}/${NAME}.png"
  success=1
else
  # Fallback: the window did not map but the screen still shows it as an
  # X child region anyway. Photograph the whole screen, crop the area the
  # 95x30 xterm occupies, and reject a blank (mean≈0) crop loudly.
  tmp="${OUTDIR}/${NAME}.root.png"
  import -display "${DISPLAY_NUM}" -window root "$tmp"
  convert "$tmp" -crop 980x640+0+0 +repage "${OUTDIR}/${NAME}.png"
  rm -f "$tmp"
  mean="$(identify -format "%[fx:mean]" "${OUTDIR}/${NAME}.png")"
  if awk -v m="$mean" 'BEGIN { exit !(m > 0.02) }'; then
    success=1
    echo "note: captured via full-screen crop for ${NAME}" >&2
  else
    rm -f "${OUTDIR}/${NAME}.png"
    echo "FAILED: xterm window not found and full-screen crop is blank for ${NAME}" >&2
  fi
fi

kill -- -"$XP" 2>/dev/null || pkill -P "$XP" 2>/dev/null || true
kill "$XP" 2>/dev/null || true
rm -f "$PROFILE_FILE"

if [ "$success" = 1 ]; then
  echo "captured ${OUTDIR}/${NAME}.png"
else
  exit 1
fi
