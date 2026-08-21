# S7 — OpenSSF Scorecard: the run and how to read it

**Run:** `scorecard --repo github.com/Codelak/docutrust` (v5.5.0, via
the official CLI, authenticated with a GitHub token). Raw output:
`scorecard-default.txt` (human) and `scorecard.json` (machine).
Screenshot: `docs/project-2/images/13-scorecard-repo.png`.

## The headline

**Aggregate score: 2.6 / 10.**

A low score is not a scandal; it is a snapshot of supply-chain
practices that are *mechanically visible from outside the repo*. The
skill is reading which checks are real gaps vs. artifacts of a young
repo — and knowing what each check measures. Check-by-check:

## The 18 checks, read

| Check | Score | What it measures | Why it is what it is |
|---|---|---|---|
| Binary-Artifacts | 10/10 | No compiled binaries checked in | Clean. |
| Dangerous-Workflow | 10/10 | No known-dangerous GitHub Actions patterns | Clean — P1's ci.yml is standard. |
| Branch-Protection | 0/10 | Protected `main` (reviews required, no force-push) | **Real gap.** No branch protection rules exist yet. |
| Code-Review | 0/10 | "0/28 approved changesets" — commits landed outside reviewed PRs | Real gap: work pushes straight to `main`. |
| Contributors | 0/10 | ≥2 companies/organizations contributing | Solo project; scorecard expects org-scale. |
| Maintained | 0/10 | Created <90 days ago | **Repo youth.** Nothing to do but wait/keep active. |
| Pinned-Dependencies | 2/10 | CI actions pinned by commit hash | Real gap: `actions/checkout@v4` style tags are not hash-pinned. |
| Token-Permissions | 0/10 | Workflow `GITHUB_TOKEN` permissions minimal? | Real gap: no `permissions:` blocks; tokens default to over-broad. |
| SAST | 0/10 | **CodeQL** workflow present? | Scorecard only counts CodeQL. P1's semgrep/gitleaks gates are invisible to this check — worth knowing. |
| Dependency-Update-Tool | 0/10 | Dependabot/Renovate enabled? | Real gap: no automated dependency update PRs. |
| Fuzzing | 0/10 | Fuzzing wired to OSS-Fuzz CI | DocuTrust has a Jazzer fuzz target locally (`fuzz/`) — not wired to CI, so the check sees nothing. Project 7's slot. |
| Security-Policy | 0/10 | `SECURITY.md` present | Real gap: no file, one-file fix. |
| License | 0/10 | License file present | Real gap: no LICENSE file. |
| Vulnerabilities | 6/10 | Dependabot alerts open | 4 alerts — these are the **pre-fix lodash** alerts; the fix is done locally but not yet pushed (S8 will change this). |
| CI-Tests | ? | PRs with CI | No PRs yet on the repo — only direct pushes. Related to Code-Review 0/10. |
| Packaging | ? | Release/packaging workflow | None exists. |
| Signed-Releases | ? | Signed release artifacts | No releases yet. |
| CII-Best-Practices | 0/10 | OpenSSF best-practices badge | Not applied for. |

## The honest read for DocuTrust

- **2 checks at 10, 12 at 0, 3 unknown, aggregate 2.6.** The zeros
  split into three groups:
  1. **Repo youth** (Maintained, Contributors) — structural, will
     improve with time/activity.
  2. **Real, cheaply fixable gaps** (Security-Policy, License,
     Token-Permissions, Pinned-Dependencies, Dependency-Update-Tool) —
     genuine supply-chain hygiene items, tracked as follow-ups.
  3. **Deliberate architecture** (Code-Review/Branch-Protection:
     this repo's projects are run sequentially by one person and CI
     gates do the blocking; still, PRs + protection are the
     professional norm and are on the follow-up list).
- **Project 1's gates (semgrep, gitleaks) score zero here.** Scorecard
  measures a specific, limited set of signals. That is not a failure
  of the gates; it is a reminder that "a score" is a lens, not the
  truth.

## What Project 2 actually needs from this

Deliverable 7 is the run + interpretation (this note). Deliverable 8
(S8) uses Scorecard for what it is good at here: **gating new
dependencies** by the health of their upstream repos — see
`evidence/16-ci-gates/scorecard-npm-deps.txt`.
