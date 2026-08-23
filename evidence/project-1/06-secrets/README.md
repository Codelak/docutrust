# Deliverable 5 + 8: Secrets scanning (current tree + full history)

## Commands
- Default config, current tree: `gitleaks detect --source . --no-banner`
  → `current-tree-DEFAULT-CONFIG.{json,log}` — **0 leaks (exit 0)**
- Project config, current tree: `gitleaks detect --source . -c gitleaks.toml`
  → `current-tree-project-config.{json,log}` — **1 leak (exit 1)**
- Project config, full history: `gitleaks detect --source . -c gitleaks.toml --log-opts="--all"`
  → `full-history.{json,log}` — **1 leak (exit 1)**

## The finding
```
aws-access-token | src/config.js : 15 | commit 685702f8
```
The seeded `AKIAIOSFODNN7EXAMPLE` constant — confirmed, with real output.

## Discovery worth a walkthrough paragraph
Gitleaks 8.30.1's **default** config does **not** flag the seeded key. Root
cause (proved experimentally, see `/tmp/gltest` notes): the default
`aws-access-token` rule has `entropy = 3.0`, and AWS's placeholder key is
deliberately low-entropy — it fails the gate. A random high-entropy AKIA key
in the same repo IS flagged by the default config, proving the rule works and
the threshold is the blocker.

Engineering response (same theme as the custom semgrep rule — the default
missed it, the project config catches it): `gitleaks.toml` at the repo root
pins `aws-access-token` without the entropy gate, plus generic api-key /
private-key / password rules so the sweep keeps its breadth.

The README.md mention of the same key (line 43) is intentional documentation
of the seeded finding and is allowlisted in `gitleaks.toml` with
justification — triage, not hiding.

## Full-history sweep (deliverable 8)
`--log-opts="--all"` scanned every commit (1 commit, `685702f8`): exactly one
leak, the seeded constant. **No other secrets exist anywhere in the
repository's history** — a current-state-only scan would have missed nothing
here, but the sweep proves it rather than assuming it.
