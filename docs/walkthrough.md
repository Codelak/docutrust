# DevSecOps Project 1 Walkthrough — SAST, Secrets Scanning, and Live Secret Verification

*How I carried out Project 1 of the DevSecOps track on DocuTrust, as a
beginner DevSecOps engineer. Every command below actually ran, and every
output quoted below is the real output I got. Evidence files are cited
along the way.*

---

## 0. What this project actually is

The brief (`Project-Requirement/project1`) is deliberately not a tutorial. It
gives you an app — DocuTrust, a Node.js/Express + Postgres document API —
that has never been scanned, and asks three things that a copy of any SAST-101
tutorial does not:

1. Run real tools and **capture real output** (not describe it).
2. Write a **custom rule tuned to this exact codebase** — one that
   generalizes past the one seeded example.
3. Go beyond "it matches a pattern" and **prove whether a suspicious string
   is actually a live credential**.

The app itself documents its seeded findings in code comments: a SQL
injection in the search endpoint, a reflected XSS in the render endpoint, and
an AWS-key-shaped constant that is AWS's own *published example key* — shaped
to be found, but inert. My job: find all of it with real tools, fix the two
real vulnerabilities, and leave a CI pipeline that catches the next one.

---

## 1. Baseline: environment and getting the app running (deliverable 1)

First step: what do I have? I checked my machine (WSL2, Ubuntu):

```bash
node --version      # v20.20.0
npm --version       # 11.18.0
docker --version    # 29.6.1, daemon running
psql --version      # not installed — fine, Postgres will come from Docker
semgrep --version   # not installed
gitleaks version    # not installed
```

So I installed the two tools I'd need — semgrep (SAST) via pipx, gitleaks
(secrets) via its release binary:

```bash
pipx install semgrep          # → semgrep 1.173.0
curl -sL .../gitleaks_8.30.1_linux_x64.tar.gz -o gitleaks.tar.gz && tar -xzf ... # → gitleaks 8.30.1
```

Then Postgres, using the exact credentials the app ships with in
`.env.example` (a dev-only password, not a real one):

```bash
docker run -d --name docutrust-postgres \
  -e POSTGRES_USER=docutrust -e POSTGRES_PASSWORD=docutrust_dev_password \
  -e POSTGRES_DB=docutrust -p 5432:5432 postgres:16.4
npm install
cp .env.example .env.local
npm run migrate        # "Applying 0001_init.sql ... Migrations up to date"
node src/index.js      # "DocuTrust dev listening on 3000"
```

Smoke test with curl:

```bash
curl localhost:3000/healthz                      # {"status":"ok","version":"dev"}
curl -X POST localhost:3000/documents -d '{"title":"Quarterly Report","body":"Q2 numbers"}' ...
curl localhost:3000/documents/1/render           # renders the HTML page
curl "localhost:3000/documents/search?q=quarterly"   # {"error":"Database unavailable"}  ← surprise!
```

Everything worked except search, which returned `Database unavailable` for a
query I knew was valid. I parked it and came back — it turned out to be a
discovery of its own (section 4).

> **Lesson 1:** stand up the app *before* scanning it. You can't judge a
> scanner finding without knowing what the code actually does when it runs.

---

## 2. SAST with default rulesets (deliverable 1, part 1)

Semgrep's free registry rulesets need no login, so I ran the two most
relevant defaults — OWASP Top Ten and the JavaScript ruleset — plus
`p/security-audit` for good measure:

```bash
semgrep --metrics=off --config=p/owasp-top-ten --config=p/javascript src/
```

Real output (saved in `evidence/01-sast-default/semgrep-owasp-javascript.txt`):

```
• Findings: 1 (1 blocking)
❯❱ javascript.express.security.injection.raw-html-format.raw-html-format
   User data flows into the host portion of this manually-constructed HTML.
   This can introduce a Cross-Site-Scripting (XSS) vulnerability ...
   104┆ res.send(`<html><body><h1>${title}</h1><p>${body}</p></body></html>`);
```

One finding: the XSS in the render endpoint — `title` and `body` written
into an HTML response without any escaping. Default rulesets caught it.

**The SQL injection? Zero findings.** `p/security-audit`: also zero. The
textbook SQLi in the search endpoint — raw string concatenation into a
Postgres query — was invisible to every generic ruleset I tried.

> **Lesson 2:** this is exactly the gap the brief predicts. Generic rulesets
> don't model "template literal flows into `pool.query()`" for this stack.
> The finding is there; the tool you need to catch it is the one you write
> yourself. That's deliverable 4.

---

## 3. Confirming the XSS finding (deliverable 3)

I didn't just take the scanner's word — I proved it against the running app.
A document whose title contains a script tag should round-trip straight into
the response:

```bash
curl -X POST localhost:3000/documents -H 'Content-Type: application/json' \
  -d '{"title":"<script>alert(1)</script>","body":"hello"}'
curl localhost:3000/documents/2/render
# <html><body><h1><script>alert(1)</script></h1><p>hello</p></body></html>
```

The raw `<script>` is in the output, unescaped — if a victim opens that URL,
the script executes in their browser. Confirmed: genuinely exploitable, not
a scanner artifact.

---

## 4. The reachability check that changed how I read the code

Back to the search endpoint's 503. I tested a nonsense path:

```bash
curl localhost:3000/documents/abc      # {"error":"Database unavailable"}
curl localhost:3000/documents/search   # {"error":"Database unavailable"}
```

Identical responses. That told me `/documents/search` was never reaching the
search handler at all. In Express, routes match in the order you register
them — and `GET /:id` was registered *before* `GET /search`. So `/search`
was being captured by `/:id`, binding `id = "search"`, and Postgres was
rejecting `"search"` as an integer.

**The seeded SQLi existed in the code but was unreachable through normal
routing.** A static scan flags the line (it scans text, not reachability);
only running the app showed me it was shadowed. That's a "cosmetic vs
exploitable" distinction the tools can't make for you — it's the engineer's
job. I filed it and fixed it together with the SQLi (section 8).

---

## 5. The custom SAST rule (deliverable 4 — the part that separates this from a tutorial)

### What it had to do

The brief is explicit: the rule must flag "any SQL query string built with
template literal interpolation or concatenation instead of a parameterized
query" and it must **generalize past the one seeded example**. A rule that
only matches line 76 verbatim fails the evaluation criteria. So I designed
for four shapes of the same mistake:

1. Direct interpolated call — `pool.query(`...${x}...`)`
2. Direct concatenated call — `pool.query("SELECT ... " + x)`
3. SQL string built by concatenation in a variable, passed later
4. SQL string built in a variable via template-literal interpolation, passed
   later — **the seeded shape** (`const query = `...${term}...`; pool.query(query)`)

### Building it — and the debugging trail that taught me the tool

My first version combined all four branches with a regex that required SQL
keywords (so `const greeting = `hello ${name}`` wouldn't be flagged). It
validated cleanly but found **nothing** — even on the seeded line that the
simplest pattern matched instantly. I ran controlled experiments to find out
which piece was the problem:

| Experiment | Result |
|---|---|
| `$X = `...${...}...`` alone | ✅ matches line 76 |
| Same + `metavariable-regex: SELECT` on `$X` | ❌ 0 findings |
| Same + `metavariable-pattern` + `pattern-regex: ".*"` | ✅ matches |
| Same + `pattern-regex: "SELECT"` | ❌ 0 findings |
| Regex on a **plain string** metavariable (`$A = "SELECT ..." + x`) | ✅ works, and skips non-SQL concat |

Conclusion: in semgrep 1.173, regex-based constraints against a metavariable
bound to a **template literal** see empty content — only `.*` matches — while
plain string literals capture correctly. The workaround that worked: for the
template-literal shape, use `pattern-inside` (the assignment block as the
scope) with metavariable propagation to the `.query()` call; for the
concatenation shapes, use the regex on the leading string literal only.

The final rule (`semgrep/rules/docutrust-unsafe-sql-interpolation.yml`):

```yaml
patterns:
  - pattern-either:
      # 1. direct interpolated call
      - pattern: "$QUERY.query(`...${...}...`, ...)"
      # 2. direct concatenated call
      - pattern: "$QUERY.query($A + $B, ...)"
      # 3. SQL built by concat in a variable (SQL-keyword filter on $A)
      - patterns:
          - pattern: "$X = $A + $B"
          - metavariable-pattern:
              metavariable: $A
              pattern-regex: "(?i)\\b(SELECT|INSERT|UPDATE|DELETE|...)\\b"
      # 4. SQL built by template-literal interpolation in a variable (seeded shape)
      - patterns:
          - pattern-inside: |
              $X = `...${...}...`
              ...
          - pattern: "$QUERY.query($X, ...)"
```

### Proving it generalizes

The brief says a rule that only matches the seeded line "has not actually
generalized the pattern." So I wrote a throwaway test file with **5 positive
shapes** (all four branches + an UPDATE variant) and **3 negative shapes**
(a correct parameterized query, a non-SQL interpolated greeting, a static
SQL string) — `evidence/05-custom-rule/test-cases.js`.

```bash
semgrep --metrics=off --config semgrep/rules/ --error src/ evidence/05-custom-rule/test-cases.js
```

Result: **exit code 1, 7 findings** — the seeded line (`documents.js:77`)
plus all 5 positives, and every negative stayed clean. The SQL injection
finding the default rulesets missed was now confirmed by *our own* rule
(deliverable 2 ✅).

> **Lesson 3:** writing a rule is 20% the rule and 80% proving it. The
> negative cases are what show you understand the difference between the
> vulnerability and the shape of the code.

---

## 6. Secrets scanning (deliverables 5 + 8)

### The default config missed the seeded key

`src/config.js` holds `AKIAIOSFODNN7EXAMPLE` — AWS's own documented example
key, shaped exactly like a real credential so pattern-matching tools find it.
I ran gitleaks with its default config:

```bash
gitleaks detect --source .
# "no leaks found"   ← what?
```

The seeded key, sitting in plain view, not flagged. I tested in isolation
(control experiment, `/tmp/gltest`): the key alone, in a fresh repo, default
config → **no leaks**. A random high-entropy `AKIA...` key → **flagged**.
So the rule wasn't broken — the *default rule's entropy threshold* was
rejecting the placeholder. AWS's example key is deliberately low-entropy, and
gitleaks' `aws-access-token` rule requires entropy ≥ 3.0.

That's a genuinely useful finding in itself: **default tool configs quietly
filter out low-entropy credentials — exactly the ones attackers know how to
use if you leave them in a repo.** (Not that this one is real.)

### The project config (same theme as the custom rule)

Engineering response: pin the rule without the entropy gate, and keep the
other useful defaults — `gitleaks.toml` at the repo root:

```toml
[[rules]]
id = "aws-access-token"
description = "AWS access token (entropy gate removed for the seeded placeholder key)"
regex = '''(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}'''
# + generic-api-key, private-key, password rules for sweep breadth
```

Now the scan works, with one triage decision to make: the key appears in
`src/config.js` (the real finding), but also in `README.md` and inside the
evidence files — *because those documents describe the finding*. Allowlisting
documented references (with the reason written into the config) is triage,
not hiding. A fresh key anywhere else is still flagged.

```bash
gitleaks detect --source . -c gitleaks.toml
# WRN leaks found: 1   →   aws-access-token | src/config.js : 15   (exit 1)
```

### Full history sweep (deliverable 8)

A current-tree scan misses secrets deleted or changed in past commits, so
the sweep scans every commit:

```bash
gitleaks detect --source . -c gitleaks.toml --log-opts="--all"
# 1 commits scanned. leaks found: 1 → aws-access-token | src/config.js : 15 | commit 685702f8
```

Exactly one leak, the seeded constant, in the only commit. **No other
secrets exist anywhere in the repository's history.** The sweep was executed
and the "clean elsewhere" claim is proven, not assumed.

---

## 7. Live secret verification (deliverable 6 — the one that separates a scanner output from a security finding)

Pattern-matching says "this looks like a key." The brief demands proof of
whether it *is* one. The cheapest real check that establishes identity is
`sts:GetCallerIdentity` — AWS's own "who am I?" call. A live key answers
with your account ARN; anything else is rejected by AWS's identity service.

I wrote `security/verify-credential.js`: it loads the found key straight
from `src/config.js` (the exact string the scanner reported), configures an
AWS STS client with it, and makes the call. (The AWS SDK needs a secret key
field to construct a client — a clearly fake one is fine, because an
unrecognized access key is rejected before anything else happens.)

```bash
node security/verify-credential.js
```

Real result (an actual network call to AWS):

```
Verifying credential found by scanners:
  key:     AKIAIOSFODNN7EXAMPLE
  source:  src/config.js (LEGACY_INTEGRATION_KEY)
  check:   sts:GetCallerIdentity via AWS SDK

VERDICT: NOT LIVE — AWS rejected the token (error code: InvalidClientTokenId)
  message: The security token included in the request is invalid.
```

**The key is inert.** It matches every pattern, and AWS itself says it
doesn't work. That's the whole distinction this project exists to teach:
a scanner *finding* is a pattern match; a *security finding* is one you have
verified. Cosmetic — documented, not a fix target (the brief fixes the two
real vulnerabilities; this constant is a documented track artifact).

---

## 8. Fixing both vulnerabilities for real (deliverable 7)

### SQL injection

Before: `const query = `SELECT ... WHERE title ILIKE '%${searchTerm}%'`;`
After: bound parameter — the search term becomes *data*, not SQL text:

```js
const result = await pool.query(
  "SELECT id, title FROM documents WHERE title ILIKE $1",
  [`%${searchTerm}%`]
);
```

I also fixed the route shadowing from section 4 by registering `/search`
before `/:id` — without it, the endpoint (and the fix) would be unreachable.

### XSS

Before: `res.send(`<html>...<h1>${title}</h1><p>${body}</p>...`)` — raw.
After: every interpolated value passes through an `escapeHtml()` helper that
turns `& < > " '` into entities, so a script tag renders as inert text:

```js
res.send(`<html><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`);
```

### Proof at runtime (not just "it compiles")

```bash
curl "localhost:3000/documents/search?q=quarterly"                  # now returns rows ✅
curl "localhost:3000/documents/search?q=quarterly' OR '1'='1"      # [] — literal text, no injection ✅
curl localhost:3000/documents/2/render
# <h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1> ...                # escaped, inert ✅
```

### The rerun (this is what "fixed for real" means)

```bash
semgrep --metrics=off --config semgrep/rules/ --error src/    # → 0 findings, exit 0
```

One flag remained from the *default* ruleset: `raw-html-format` still points
at the render line even though the output is escaped. Triage: **false
positive**. The rule heuristically flags any manual HTML construction with
interpolation and can't model that `escapeHtml()` sanitizes the data — and
the runtime proof above shows no execution is possible. I documented it
instead of suppressing it (`evidence/08-fixed-rerun/`). That's the
"cosmetic vs genuinely exploitable" judgment call the brief grades.

---

## 9. The CI gate, proven (deliverable 9)

### Wiring the stages

`ci.yml` shipped with a deliberate placeholder under the build job, waiting
for exactly this project. I added two enforcement jobs: `sast` (semgrep with
our custom rule, `--error` so findings fail the build) and `secrets-scan`
(gitleaks with `gitleaks.toml`, full history, so nothing hides in old
commits). The upstream repo `expadox/docutrust` is read-only for me, so the
proof runs on my own private repo, `lakunzy7/docutrust`.

### Run 1: green on the fixed code

Pushed `main`. CI: `build-and-test` ✅, `sast` ✅, `secrets-scan` ✅.

### The gate catching our own real mistake

Run 1 actually *failed* first — and that's evidence too. The secrets gate
flagged the verification script itself: I had written `AKIAIOSFODNN7EXAMPLE`
into the script's output message instead of using the constant. **The gate
caught a real mistake I made, not just the seeded one** — the whole point of
a gate. Fix: use the constant, not the literal.

But that literal was already in a commit — and once committed, a full-history
scan flags it forever. This is the "committed secrets live forever" lesson,
and the response is the correct one: **rewrite the history so it never
existed**. I amended the evidence commit (replaced the script file, kept the
message), rebased the follow-up commits on top, verified locally that the
full-history scan was clean, and force-pushed the rewritten `main` (safe:
private repo, no collaborators, minutes old). The stale remote ref was
pruned with the push. Run 2: all green.

### Run 2: red on the violation branch (the deliverable)

Then the actual proof. From clean `main`, a test branch
`project1-violation-test` carrying a **fresh** seeded violation — a new SQL
string concatenation (`src/routes/legacy.js`) and a new credential-shaped
constant (`src/legacy-config.js`) — opened as a PR:

```
gh run view <run-id> --log-failed

X sast           → semgrep.rules.docutrust-unsafe-sql-interpolation: Findings: 2 (2 blocking)
X secrets-scan   → WRN leaks found: 1
✓ build-and-test
```

**CI blocked it. Both gates red on real GitHub Actions, with real output**
(`evidence/09-ci-gate/run2-violation-PR-FAILED-both-gates.txt`). I closed
the PR and deleted the branch — the gates stay; the violation doesn't.

---

## 10. The final report (deliverable 10)

`docs/final-findings-report.md` ties it together for the track:
every finding with its cosmetic-or-exploitable verdict, what the live check
proved, what CI now enforces — and the Project 2 (SCA) handoff: the
deliberately outdated `lodash@4.17.15` pin (confirmed by `npm audit`:
prototype pollution, command injection, ReDoS), the one `_.cloneDeep` usage
it exists for, and where the SCA stage slots into the same pipeline.

---

## What I learned (the short version)

1. **Run the app before trusting the scanner.** The reachability discovery
   (`/search` shadowed by `/:id`) was invisible to every static tool.
2. **Default rulesets miss seeded findings — by design.** Both semgrep and
   gitleaks defaults failed to flag this project's seeded items; the custom
   rule and project config are what caught them. That's not a tool failure;
   it's why the project brief demands both.
3. **Scanner output is a starting point, not a verdict.** One remaining
   default-rule flag after the XSS fix is a false positive — proven, triaged,
   documented. And the secrets "finding" is inert — proven by AWS itself.
4. **Committed secrets live forever.** The gate caught a literal I'd
   committed; only rewriting the history removed it from the sweep.
5. **A gate is only a gate if it can block.** The violation PR proved it.

## Evidence index

| Evidence | Deliverable |
|---|---|
| `evidence/01-sast-default/` | 1–3 — default SAST, XSS confirmed, SQLi missed |
| `evidence/05-custom-rule/` | 4 — custom rule + generalization proof (test-cases.js) |
| `evidence/06-secrets/` | 5, 8 — secrets scan, full-history sweep |
| `evidence/07-live-verification/` | 6 — live check: `InvalidClientTokenId` |
| `evidence/08-fixed-rerun/` | 7 — fixes, runtime proof, clean rerun, FP triage |
| `evidence/09-ci-gate/` | 9 — gate caught our literal; violation PR blocked |
| `docs/final-findings-report.md` | 10 — report + Project 2 handoff |
