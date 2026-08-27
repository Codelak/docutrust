# Chain A Closing Report — DocuTrust's Full Detection Posture

DocuTrust · DevSecOps Projects 1–3 (Detect): SAST, Secrets, SCA, DAST,
IAST, RASP — six techniques over two seeded vulnerabilities
Written to hand directly into Chain B (Prove). Nothing about DocuTrust's
detection posture should need re-explaining after this document.

---

## 1. The two seeded vulnerabilities — the spine of Chain A

Every project in Chain A attacked the same two real bugs, deliberately
seeded when the application was written and left findable:

1. **SQL injection** in `GET /documents/search` — the title search built
   its ILIKE query by string concatenation instead of a bound parameter.
2. **Stored XSS** in `GET /documents/:id/render` — document titles were
   interpolated into the HTML response without escaping.

Both were **fixed in Project 1** (deliverable 7) and the fixes are the
baseline every later project verified against. Project 3's test build
(`DOCUTRUST_VULN_MODE=1`) restores the pre-fix shapes verbatim behind a
documented flag so the runtime techniques have a genuine target; the
production default is the fixed code.

## 2. Detection posture, project by project

### Project 1 — source (SAST + secrets)

| Technique | What it found | Status |
|---|---|---|
| Semgrep default rules | XSS at `documents.js:104` (SQLi missed — hence the custom rule) | found, fixed |
| Custom Semgrep rule | SQLi at `documents.js:76` (string-concat shape) | found, fixed |
| Gitleaks + full-history sweep | seeded `AKIAIOSFODNN7EXAMPLE` placeholder, verified **inert** live via `sts:GetCallerIdentity` | documented, retained |
| CI gate | seeded literal re-flagged on main; violation PR blocked | proven |

Leaves behind: `semgrep/` custom rules, `gitleaks.toml`, CI `sast` +
`secrets-scan` gates.

### Project 2 — dependencies (SCA)

| Technique | What it found | Status |
|---|---|---|
| `npm audit` | lodash@4.17.15 pin — 6 advisories, 1 high | **fixed** to 4.18.1, smoke-tested |
| `npm ls --all` | tree single-instance, express pins on patched lines | reviewed, no concern |
| Dependency confusion | `@docutrust/*` scope resolved from public registry | **fixed** (`.npmrc` private-scope pin), demo + control |
| Typosquatting review | 8/14 probed near-variants exist, incl. takedowns | none in use; defense documented |
| OpenSSF Scorecard | repo aggregate 2.6/10; per-dependency ≥5/10 gate | gate enforced |
| CI gates | audit (high) + scorecard; seeded left-pad blocked pre-merge | proven |

Leaves behind: `.npmrc`, `docs/project-2/sca-policy.md`, CI `sca` gate.

### Project 3 — runtime (DAST + IAST + RASP)

| Technique | What it found | Status |
|---|---|---|
| OWASP ZAP DAST | SQLi **High** on `/documents/search` (attack `' OR 1=1 --`); stored XSS **High** on `/documents/10/render` (evidence `<script>alert(1)</script>`) | confirmed; fixed build clean (0 High) |
| Hand-built IAST tracer | exact chains: `req.query.q` → `pool.query` at `documents.js:72`; `req.body.title` (POST) → `res.send` at `documents.js:135` across requests | both traced; fixed build 0 findings |
| Hand-built RASP | both attack families blocked **403** before the routes; benign traffic passes; control run (off) reaches the sinks | proven live |
| Incident | first stock-rule scan OOM-crashed the app via the P7 parser DoS | root-caused, worked around, documented |

Leaves behind: `DOCUTRUST_VULN_MODE` test build, `src/lib/iast.js`,
`src/lib/rasp.js`, `security/zap/` custom rules, evidence 17–19.

## 3. What Chain B (Prove) inherits, without re-explanation

- **The application** (Express + Postgres, `src/`) with both seeded bugs
  **fixed by default** and a **documented test build** that restores
  them; `k8s/base.yaml` deployment manifest; Dockerfile.
- **Two real, findable vulnerabilities** and **three working ways to
  test them**: ZAP rules + reports (17-zap-dast), the IAST tracer
  (18-iast), the RASP middleware (19-rasp) — Chain B can re-run any of
  them against a proposed mitigation and get a before/after verdict.
- **Standing CI gates** that already protect main: semgrep (SAST),
  gitleaks (secrets), `npm audit` + scorecard (SCA). Chain B does not
  need to re-establish any of these.
- **Documented known issues deliberately not fixed**: the naive search
  parser's unclosed-quote infinite loop is Project 7's fuzz target
  (this project observed it crashing the app for real and worked
  around it in the scanner); the RASP middleware is pattern-based and
  illustrative; the IAST tracer's propagation is fragment-based.
- **Evidence conventions**: `evidence/project-N/NN-name/` with READMEs;
  `docs/project-N/` with walkthrough + final report; all figures
  reproducible from committed evidence.

## 4. Honest boundaries of Chain A

Static analysis cannot prove exploitability; dependency analysis cannot
see runtime data flow; black-box scanning cannot name lines; IAST only
sees executed paths; RASP only reacts to arriving attacks. Chain A
*detects*; Chain B *proves* — and it starts with a baseline where every
detection technique has already said "vulnerable" about the same two
bugs, and "clean" about the fixed build.
