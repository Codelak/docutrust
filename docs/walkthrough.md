# Walkthrough skeleton — DevSecOps Project 1 (DocuTrust)

Use this as the outline for your writeup. Every section maps to a deliverable
in `Project-Requirement/project1`, with the commands you ran and the evidence
file that proves it. Expand each with your own words — beginner explanations
are the point of the walkthrough.

---

## 1. Baseline: environment and app running (deliverable 1)
**What I did:** checked tooling (node 20, npm, Docker daemon), installed
semgrep (pipx) and gitleaks (binary), started Postgres 16.4 in Docker with
the app's credentials, `npm install`, `npm run migrate`, started the app.
**Proved:** `/healthz` ok, created a document, fetched it, rendered it.
**Surprise found:** `GET /documents/search` returned 503 — see §4.

## 2. SAST with default rulesets (deliverable 1)
**Command:** `semgrep --metrics=off --config=p/owasp-top-ten --config=p/javascript src/`
**Result:** 1 finding — the XSS (`raw-html-format`, documents.js:104).
**Key lesson:** default rulesets found the XSS but **missed the SQLi**. Tried
`p/security-audit` too — still nothing. This is why the custom rule exists.
*Evidence: `evidence/01-sast-default/`*

## 3. Confirming the XSS finding (deliverable 3)
The rule output, the line, and what "unescaped user data into HTML" means.

## 4. Reachability check — the route shadowing discovery
`/documents/search` behaved identically to `/documents/abc` (both 503).
Express matches routes in registration order: `/:id` was registered first, so
`"search"` bound to `id` and Postgres rejected it as an integer. The seeded
SQLi existed in code but was unreachable through routing. A static scan can't
tell you this — only running the app can. Fixed as part of deliverable 7.

## 5. The custom semgrep rule (deliverable 4 — the differentiator)
**Requirement:** flags SQL built with interpolation/concatenation, and
**generalizes past the seeded line** (a rule matching only line 76 fails the
brief).
**Design:** four branches — direct interpolated call, direct concatenated
call, SQL built in a variable via concat (SQL-keyword regex keeps non-SQL
strings clean), SQL built in a variable via template literal (the seeded
shape, via `pattern-inside` + metavariable propagation).
**Proving generalization:** `evidence/05-custom-rule/test-cases.js` — 5
positive shapes, 3 negative shapes; all positives flagged, all negatives
clean, seeded line flagged, exit code 1.
**Engineering note (semgrep quirk):** `metavariable-regex` captures empty
content for template-literal bindings in semgrep 1.173 — discovered through
the debugging trail, worked around by design. This paragraph makes a great
"how I actually built it" story.
*Evidence: `semgrep/rules/`, `evidence/05-custom-rule/`*

## 6. Secrets scan (deliverable 5 + 8)
**Commands:** default config, then project config, current tree + full
history (`--log-opts="--all"`).
**Discovery:** default gitleaks 8.30.1 did **not** flag the seeded key — its
`aws-access-token` rule has an entropy threshold the placeholder fails.
Proved with a control experiment (random high-entropy AKIA key → flagged).
Response: `gitleaks.toml` pins the rule without the entropy gate + allowlists
documented references (README, evidence/, src/config.js) with justification.
**Full history:** 1 commit scanned, exactly one leak (the seeded constant),
no others anywhere.
*Evidence: `evidence/06-secrets/`*

## 7. Live secret verification (deliverable 6 — finding vs proof)
**Command:** `node security/verify-credential.js` (STS SDK, key loaded from
src/config.js, `sts:GetCallerIdentity`).
**Real result:** `InvalidClientTokenId — The security token included in the
request is invalid.` → the key is inert. A live key returns your account ARN.
This is what separates scanner output from a real security finding.
*Evidence: `evidence/07-live-verification/`*

## 8. Fixes and clean rerun (deliverable 7)
SQLi → bound parameter `$1` (+ route order fix). XSS → `escapeHtml()` on
title/body. Runtime proof with curl (injection payload → `[]`, script tag →
`&lt;script&gt;`). Rerun: custom rule 0 findings. The one remaining default-
rule flag (`raw-html-format`) is a false positive — triaged with evidence,
not suppressed blindly.
*Evidence: `evidence/08-fixed-rerun/`*

## 9. CI gate, proven (deliverable 9)
Wired `sast` (custom rule, `--error`) and `secrets-scan` (gitleaks, full
history) jobs into ci.yml. Pushed to a private repo (`lakunzy7/docutrust`).
Green on main. Then a `project1-violation-test` branch with a fresh SQL
concat + fresh fake key → PR → **both jobs failed with real output**.
Extra story: the gate also caught our own real mistake — the verification
script's hardcoded key literal — which forced a history rewrite (amend +
rebase + forced update) and a pruning of the stale remote ref. That's the
"committed secrets live forever" lesson in action.
*Evidence: `evidence/09-ci-gate/`*

## 10. Final report and Project 2 handoff (deliverable 10)
`docs/final-findings-report.md` — full inventory, cosmetic-vs-exploitable
verdicts, live-verification proof, CI state, and the lodash@4.17.15
starting point for Project 2 (SCA).

---

## Evidence index
| Evidence | Deliverable |
|---|---|
| `evidence/01-sast-default/` | 1–3 (default SAST, XSS confirmed, SQLi missed) |
| `evidence/05-custom-rule/` | 4 (custom rule + generalization proof) |
| `evidence/06-secrets/` | 5, 8 (secrets scan, full history) |
| `evidence/07-live-verification/` | 6 (live check result) |
| `evidence/08-fixed-rerun/` | 7 (fixes + clean rerun) |
| `evidence/09-ci-gate/` | 9 (CI blocked, both runs) |
| `docs/final-findings-report.md` | 10 (report + Project 2 handoff) |
