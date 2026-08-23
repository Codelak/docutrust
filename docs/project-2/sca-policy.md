# DocuTrust SCA Policy — Software Composition Analysis

**Owner:** project maintainer (Codelak)
**Scope:** every package DocuTrust installs — direct and transitive,
production and development — as resolved by the npm lockfile.
**Status:** enforced in CI (`.github/workflows/ci.yml`, job `sca`,
wired in S8), evidence in `evidence/project-2/16-ci-gates/`.

## 1. Threshold: what blocks a build

`npm audit` runs on every push to `main` and every pull request. The
command that enforces the threshold is:

```sh
npm audit --audit-level=high
```

- **Exit 0 (no high/critical advisories) — build passes.**
- **Exit non-zero (any high or critical advisory) — build FAILS.**
  Non-zero exit is the whole mechanism: npm audit fails the job, the
  job fails the workflow, the workflow blocks the merge. A finding
  cannot merge.

Severity is the advisory severity assigned in the npm advisory
database (per CVE/GHSA), not our estimate. Project 1's seeded lodash
pin was the standing example: `4.17.15` (1 high, 6 advisories) →
`4.18.1` (0 vulnerabilities), verified in `evidence/project-2/12-lodash-fix/`.

## 2. Allowed with documented justification

- **Moderate and low advisories** do not block the build. They must be
  listed in the current dependency risk report
  (`docs/project-2/final-findings-report.md`, or the report in place
  at the time) with a one-line justification each, reviewed at least
  quarterly.
- **No standing exceptions for high/critical**: DocuTrust has no
  production package so fundamental that a high-severity advisory
  cannot be remediated within one cycle. If one appears, the
  remediation is: upgrade, then rescan (section 3).

## 3. Remediation and reverification discipline

1. The finding is fixed by upgrading the package — never by editing
   the lockfile by hand, never by suppressing the audit.
2. `npm audit` is re-run; the evidence capture must show the advisory
   gone.
3. The app is **restarted** (a running process keeps the old version
   in memory) and the affected route is smoke-tested over HTTP, not
   trusted by inspection.

## 4. Exceptions

If a high/critical advisory genuinely cannot be fixed (no patched
release exists anywhere in the dependency's ecosystem):

- The request goes to the **project maintainer** in writing (issue or
  PR comment), stating the advisory, why no patched release exists,
  and the planned removal date.
- Approval must be explicit (maintainer comment/approval). No
  exception is "approved by silence."
- Exceptions expire at the end of the quarter; an expired exception
  blocks the build again.
- To date DocuTrust has never needed one.

## 5. New dependencies

- Any new dependency must resolve cleanly under `npm audit
  --audit-level=high` at the moment it is added (the CI gate covers
  this on the PR).
- **Minimum OpenSSF Scorecard score: 5/10.** Any dependency not
  already in the tree on `main` must score at least 5 out of 10 on
  the OpenSSF Scorecard of its source repository, scored with the
  official CLI (`scorecard --npm <package>`). A lower score — or no
  obtainable score — fails the `sca` CI job with "manual review
  required": the dependency is blocked until the maintainer documents
  why it is acceptable. (Wired in S8; the current tree's scores are
  captured in `evidence/project-2/16-ci-gates/scorecard-npm-deps.txt`.)
- New dependencies are reviewed for typosquatting risk before being
  accepted (S6 method, `evidence/project-2/14-typosquat/`).
- Internal packages must use the `@docutrust` scope, which `.npmrc`
  pins to the private registry — a package with an internal-sounding
  name can never silently resolve from the public registry
  (`evidence/project-2/13-scope-demo/`).

## 6. Cadence

- **Every push/PR:** automated `npm audit --audit-level=high` gate.
- **Every PR adding a dependency:** the Scorecard gate (new
  dependencies only, section 5).
- **Quarterly:** full dependency review — re-read the transitive tree
  (`npm ls --all`), revisit low/moderate items, re-confirm exceptions.
- **Every project:** the final dependency risk report restates the
  current baseline (Project 2 → Project 3 handoff).

---

*Written for Project 2 of the DocuTrust DevSecOps track. Every
threshold term here ("block", "fail", "allow with justification") is
checkable: a specific severity level (`high`), a specific command
(`npm audit --audit-level=high`), a specific score (`5/10`), a
specific approver (the project maintainer).*
