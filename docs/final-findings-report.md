# DevSecOps Project 1 — Final Findings Report

DocuTrust · SAST, Secrets Scanning & Live Secret Verification
Chain A (Detect), Project 1 of 9. Written to hand directly into Project 2 (SCA).

---

## 1. Summary

Three seeded findings were scanned for, found, triaged, and acted on. Two are
genuinely exploitable and were fixed; one is a credential-shaped placeholder
proven inert by a live AWS API check and retained as a documented artifact.
Two additional discoveries surfaced during the work (route shadowing, gitleaks
entropy gate) and were resolved. The pipeline now enforces both findings
classes in CI and demonstrably blocks new violations.

## 2. Findings inventory

| # | Finding | Location | Class | Verdict | Evidence |
|---|---|---|---|---|---|
| 1 | SQL injection (string concat into ILIKE query) | `src/routes/documents.js:76` (pre-fix) | **Exploitable** | Fixed | `evidence/05-custom-rule/run.txt`, `evidence/08-fixed-rerun/` |
| 2 | Reflected/stored XSS (unescaped title/body into HTML) | `src/routes/documents.js:104` (pre-fix) | **Exploitable** | Fixed | `evidence/01-sast-default/semgrep-owasp-javascript.txt` |
| 3 | AWS-key-shaped constant `AKIAIOSFODNN7EXAMPLE` | `src/config.js:15` | **Cosmetic (inert placeholder)** | Verified inert, retained | `evidence/06-secrets/`, `evidence/07-live-verification/` |
| 4 | `/search` route shadowed by `/:id` (endpoint unreachable) | `src/routes/documents.js` | **Functional bug (latent)** | Fixed with #1 | `evidence/01-sast-default/README.md` |
| 5 | Verification script hardcoded the key literal (own tooling) | `security/verify-credential.js` | **Self-introduced** | Fixed (uses constant); history rewritten | `evidence/09-ci-gate/run1-*.txt` |

## 3. Cosmetic vs genuinely exploitable — the distinction in practice

- **#1 SQLi — genuinely exploitable.** The seeded query interpolated the
  search term directly into SQL. A payload such as `q=quarterly' OR '1'='1`
  would alter the statement. Default semgrep rulesets (owasp-top-ten,
  javascript, security-audit) all **missed** it — the custom rule
  `docutrust-unsafe-sql-interpolation` was written for this codebase and
  catches four shapes of the bug class (direct interpolated call, direct
  concatenated call, SQL built by concat in a variable, SQL built by
  template-literal interpolation in a variable — the seeded shape).
- **#2 XSS — genuinely exploitable.** Default semgrep flagged it immediately
  (`raw-html-format`). A title containing `<script>` round-tripped into the
  response unescaped.
- **#3 Fake key — cosmetic, and that is the point.** It is AWS's own
  published example key: shaped like a real credential (every pattern-
  matching tool flags it) but inert. The live check proved it (below). It
  was **not** removed: Project 1's fix list covers SQLi and XSS; the
  constant is a documented track artifact, allowlisted in `gitleaks.toml`
  with a path-scoped justification.
- **Bonus discovery (default tools miss seeded findings):** gitleaks 8.30.1's
  default config did not flag the key either — its `aws-access-token` rule
  has an entropy threshold the placeholder fails (proved by a control test
  with a random high-entropy key). The project config (`gitleaks.toml`)
  removes the entropy gate and pins the rule.

## 4. Live verification (the deliverable that separates finding from proof)

`security/verify-credential.js` loads the found key straight from
`src/config.js`, configures an AWS STS client with it, and calls
`sts:GetCallerIdentity`. Real result (network call to AWS):

```
VERDICT: NOT LIVE — AWS rejected the token (error code: InvalidClientTokenId)
  message: The security token included in the request is invalid.
```

A live key would have returned the caller's account ARN (HTTP 200). AWS's
identity service rejecting it proves the constant is an inert, pattern-matched
placeholder — cosmetic. Raw output: `evidence/07-live-verification/`.

## 5. Fixes (real code changes, SAST-rerun verified)

1. **SQLi** — query parameterized: `... WHERE title ILIKE $1` with the term
   bound as `["%${searchTerm}%"]`. The `/search` route also moved above
   `/:id` (finding #4) so the endpoint is reachable.
2. **XSS** — `escapeHtml()` (escapes `& < > " '`) applied to `title` and
   `body` in the render endpoint.

Runtime proof (requests against the running app): search now returns rows;
`q=quarterly' OR '1'='1` returns `[]` (treated as literal); a `<script>`
payload renders as `&lt;script&gt;...`.

Rerun results: custom rule **0 findings** (was 1). The generic
`raw-html-format` rule still flags the escaped render line — triaged as a
false positive (it cannot model escaping; runtime proof confirms no
execution possible). Documented, not suppressed: `evidence/08-fixed-rerun/`.

## 6. Full-history secrets sweep

`gitleaks detect --log-opts="--all"` over every commit: exactly one leak —
the seeded constant in `src/config.js` (commit `685702f8`). **No other
secrets exist anywhere in history.** Raw output: `evidence/06-secrets/full-history.*`.

History note: the verification script initially hardcoded the key literal;
once committed, the full-history gate flagged it permanently. Our own
commits were amended (history rewritten) so the literal never existed in the
pushed history — the correct response to a committed secret. The stale
remote ref was the last visible occurrence and was pruned by the forced
update.

## 7. CI gate (proven, not described)

`.github/workflows/ci.yml` now has two enforcement jobs alongside build:

- **sast** — semgrep with the project custom rule, `--error` (findings fail).
- **secrets-scan** — gitleaks with `gitleaks.toml`, full history.

Proof (real GitHub Actions runs on `lakunzy7/docutrust`, private):

| Run | Outcome |
|---|---|
| main (fixed code) | ✅ all jobs green |
| PR `project1-violation-test` (fresh SQL concat + fresh fake key) | ❌ sast: 2 findings; secrets-scan: 1 leak |

Failure logs: `evidence/09-ci-gate/`. Also captured: the gate catching our
own real mistake (the script literal) before the rewrite — 
`run1-main-FAILED-gate-caught-real-literal.txt`.

## 8. Handoff to Project 2 (SCA)

Everything Project 2 needs is already known and documented:

- **`lodash@4.17.15`** pinned exactly (not a caret range) in `package.json`
  — the deliberate outdated dependency. `npm audit` reports multiple real,
  disclosed advisories against it (prototype pollution, command injection,
  ReDoS). It is used once, for a `_.cloneDeep` in `POST /documents`
  (`src/routes/documents.js`).
- The SAST/secrets gates in CI are live: Project 2's SCA stage (e.g. npm
  audit / OSV-Scanner in the same pipeline) slots into the same workflow
  file next to the existing jobs.
- Note: `npm ci` in CI warns but does not fail on the advisory — Project 2
  decides the enforcement policy.
- Seeded findings for later projects remain untouched: the search-query
  parser DoS (`src/lib/searchQuery.js`, Project 7) and the fuzz target
  (`fuzz/searchQuery.fuzz.js`).

## 9. Tooling & environment

- semgrep 1.173.0 (pipx), gitleaks 8.30.1 (binary), Node 20, Postgres 16.4
  (Docker), GitHub Actions (private repo `lakunzy7/docutrust`).
- Custom rule: `semgrep/rules/docutrust-unsafe-sql-interpolation.yml`
- Secrets config: `gitleaks.toml`
- Live verification: `security/verify-credential.js` (isolated deps under
  `security/package.json` so the app's dependency tree is untouched)
