# DevSecOps Project 2 — Final Dependency Risk Report

DocuTrust · SCA, Dependency Confusion Defense & OpenSSF Scorecard
Chain A (Detect), Project 2 of 9. Written to hand directly into
Project 3 (DAST/IAST/RASP).

---

## 1. Summary

DocuTrust's entire dependency tree — direct and transitive, production
and development — was scanned, reviewed, and brought under an enforced
policy. One real finding existed: the seeded lodash@4.17.15 pin
(1 high severity aggregate: prototype pollution, command injection,
ReDoS, code injection), which Project 1 had surfaced but not fixed.
It was remediated to lodash@4.18.1 and reverified with a live smoke
test. Defense against dependency confusion and typosquatting was
configured and demonstrated. OpenSSF Scorecard was run against the
repo and turned into a per-dependency CI gate. The pipeline now
blocks both known CVEs and unhealthy new dependencies before merge.

## 2. Findings inventory

| # | Finding | Location | Verdict | Evidence |
|---|---|---|---|---|
| 1 | lodash@4.17.15 exact pin — 6 advisories, 1 high (prototype pollution, command injection, ReDoS, template code injection) | `package.json`, used once via `_.cloneDeep` in `src/routes/documents.js` | **Fixed** → lodash@4.18.1, audit clean, smoke-tested | `evidence/10-sca-baseline/`, `evidence/12-lodash-fix/` |
| 2 | No transitive finding: tree single-instance, all express pins on patched lines (path-to-regexp 0.1.13, cookie 0.7.2, qs 6.15.3) | `npm ls --all` | **No concern** (named and reviewed) | `evidence/11-transitive-review/` |
| 3 | Dependency confusion: `@docutrust/*` scope resolved from the public registry by default (shadow-attack surface) | npm config | **Fixed** — `.npmrc` pins scope to private registry; demo shows shadow lookup blocked, control shows the risk | `evidence/13-scope-demo/` |
| 4 | Typosquatting: 8 of 14 probed near-variant names exist(ed) — incl. `zod-js` (npm security takedown, 2026-01), `lodash-package` (2024), classic `loadsh` | registry | **No concern for the tree** (none in use; defense = exact pins + lockfile + audit gate + scoping). Attack class confirmed active | `evidence/14-typosquat/` |
| 5 | No SCA gate in CI — the seeded finding could merge silently | `.github/workflows/ci.yml` | **Fixed** — `sca` job: `npm audit --audit-level=high` + scorecard gate for new deps | `evidence/16-ci-gates/` |
| 6 | Seeded risky dependency (left-pad@1.3.0, score 4.2/10) | PR #1 | **Blocked by the gate** before merge — PR closed, branch deleted, main untouched | `evidence/16-ci-gates/run-seeded-PR-FAILED.txt` |

## 3. What was fixed, and the discipline behind it

- **Remediation (not suppression):** `npm audit fix` alone could not
  move the exact pin; the fix was deliberate
  (`npm install lodash@4.18.1 --save-exact`), the rescan showed the
  advisory gone, the app was **restarted** (a stale process keeps the
  old version in memory) and the affected route smoke-tested over
  HTTP (`evidence/12-lodash-fix/smoke-test.txt`).
- **Policy, not vibes:** `docs/project-2/sca-policy.md` names the
  checkable thresholds — build blocks on `npm audit --audit-level=high`
  non-zero; new dependencies must score ≥ 5/10 on OpenSSF Scorecard;
  exceptions require written maintainer sign-off and expire.
- **The gates proved themselves:** main runs green with the `sca` job
  (S8); a deliberately seeded left-pad dependency turned the run red
  at the scorecard gate — even though npm audit passed it — and was
  blocked before merge (S9).

## 4. Scorecard — the repo, read honestly

Aggregate **2.6/10** (v5.5.0, run S7). 10/10 on Binary-Artifacts and
Dangerous-Workflow; 0 on Branch-Protection, Code-Review,
Token-Permissions, Pinned-Dependencies, Security-Policy, License,
Dependency-Update-Tool, SAST (CodeQL-specific), Fuzzing, Maintained
(repo <90 days), Contributors, CII-Best-Practices. Full per-check
reading: `evidence/15-scorecard/README.md`. Follow-ups recorded:
SECURITY.md, LICENSE, `permissions:` blocks in workflows,
Dependabot, and (for the track) PR-based contribution + branch
protection.

## 5. Enforced policy (what Project 3 inherits as the standing rule)

1. **Every push/PR:** `npm audit --audit-level=high` must exit 0.
2. **Every PR adding a dependency:** the dependency must score ≥ 5/10
   on OpenSSF Scorecard (`scorecard --npm`), or carry maintainer
   sign-off before merge.
3. **Internal packages** must use the `@docutrust` scope, resolvable
   only from the private registry (`.npmrc`).
4. **Quarterly:** full tree re-review (`npm ls --all`), low/moderate
   items re-examined, exceptions re-confirmed.

## 6. Dependency baseline handed to Project 3

Current as of 2026-08-21, on `main` (commit `4ef269a`):

| Package | Version | Pin | Audit | Scorecard |
|---|---|---|---|---|
| express | 4.22.2 | ^4.19.2 | clean | 8.2 |
| pg | 8.23.0 | ^8.13.0 | clean | 5.7 |
| zod | 3.25.76 | ^3.23.8 | clean | 5.3 |
| lodash | 4.18.1 | exact | clean | 6.8 |
| @jazzer.js/core (dev) | 4.0.0 | ^4.0.0 | clean | 6.0 |

`npm audit` → **0 vulnerabilities**. The tree is single-instance
(fully deduped); the only structural watch item is pg's optional
`pg-native` (not installed; review if ever enabled).

Project 3 tests DocuTrust's *runtime* behavior — its conclusions are
only trustworthy against a clean, current, enforced dependency
baseline. That baseline is this report.
