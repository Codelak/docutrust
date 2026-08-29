# DocuTrust — Project 3 — DevSecOps Implementation Guide

---

# 1. Project Overview

## 1.1 Project Overview

Projects 1 and 2 found and fixed two real vulnerabilities by reading
the source and scanning dependencies — SQL injection in the search
endpoint and stored XSS in the document render page. A real attacker
has none of that. This project tests the *same two bugs* the way an
outside attacker would (DAST), the way a security-instrumented QA
process would (IAST), and builds a live defense that blocks
exploitation as it happens (RASP) — then explains, from real output,
what each of the three can catch that the others cannot.

Because the two vulnerabilities were fixed in Project 1, the running
app is no longer exploitable — so the project's answer is a documented
**test build**: the two pre-fix code shapes, restored verbatim behind
an environment flag, default OFF.

Every command in this guide actually ran, and every figure is a real
capture of that command on a real terminal. Evidence files are cited
along the way.

## 1.2 Project Objectives

1. Real ZAP scan of the running app, output captured (Deliverable 1).
2. SQLi confirmed externally — black-box, no source access
   (Deliverable 2).
3. XSS confirmed externally (Deliverable 3).
4. Working IAST tracer — source-to-sink with line numbers
   (Deliverable 4).
5. DAST vs IAST compared from real output (Deliverable 5).
6. Working RASP middleware (Deliverable 6).
7. Live SQLi blocked — 403 with auditable log line (Deliverable 7).
8. Live XSS blocked (Deliverable 8).
9. The four-way comparison — SAST vs DAST vs IAST vs RASP
   (Deliverable 9).
10. Chain A closing report and handoff to Chain B (Deliverable 10).

## 1.3 Scope

**In scope:**

- Runtime behavior of the application — the test build
  (`DOCUTRUST_VULN_MODE=1`) and the fixed production build, side by
  side.
- Black-box scanning with OWASP ZAP (custom active and passive rules),
  an in-process IAST-style taint tracer, and a RASP middleware.
- The comparison of all four techniques against the same two bugs,
  grounded in captured output.

**Out of scope:**

- Source scanning and secrets — Project 1 (the findings those gates
  produced are the baseline this project proves at runtime).
- Dependency scanning and policy — Project 2.
- The parser denial-of-service bug discovered in Stage 1.2 — real,
  documented, and deliberately **not** fixed: it is Project 7's fuzz
  target.

**Branches:** all tasks execute on `project3-starter` — the finished
Project 2 (the cumulative snapshot) *plus* this project's test build:
the two seeded bugs behind the `DOCUTRUST_VULN_MODE` flag, and the
runtime modules and ZAP rules used here.

## 1.4 Technology Stack

| Component | Version / Pin | Purpose |
|---|---|---|
| Node.js | ≥ 20 (from Project 1) | Application runtime |
| PostgreSQL | 16.4 (from Project 1) | Document store |
| OpenJDK | 17 (headless JRE) | ZAP's runtime |
| OWASP ZAP | 2.17.0 (Linux build) | DAST scanner — daemon mode, API-driven |
| ZAP custom rules | `sqli-single-quote.js` (id 90099), `xss-stored-passive.js` (id 90100) | The scan's detection logic (`security/zap/`) |
| IAST tracer | `src/lib/iast.js` (project module) | Source-to-sink taint tracing |
| RASP middleware | `src/lib/rasp.js` (project module) | Inline blocking middleware |
| curl, jq, python3 | any | API calls, JSON read-back |
| GitHub Actions | inherited from Projects 1–2 | Standing CI gates (unchanged) |

## 1.5 DevSecOps Workflow

| Task | What you do | Why |
|---|---|---|
| 1 | Build and seed the test build | You cannot scan what does not exist — the bugs come back, on purpose |
| 2 | Install and verify ZAP | The black-box scanner, driven from the API |
| 3 | Load the two custom rules | The stock rules cannot see these bugs — and would kill the app |
| 4 | Scan the vulnerable and the fixed build | Prove both bugs externally; prove they are gone from the fixed build |
| 5 | IAST the same two requests | Name the exact source→sink path — including the cross-request chain |
| 6 | RASP the same two payloads | Block them live, and prove it was the middleware |
| 7 | The four-way comparison | What each technique structurally cannot do — from your own output |
| 8 | Chain A closing | Tie Projects 1–3 together; hand off to Chain B |

---

# 2. Architecture

## 2.1 Architecture Overview

The same two bugs are examined from three positions: outside the app
(DAST), inside the app (IAST), and at the edge of the app (RASP). The
test build makes them present behind a boot-time flag; the production
build has them fixed.

```
[attacker / curl] ──▶ [RASP middleware (DOCUTRUST_RASP=1)] ──▶ [Express routes]
                            │ 403 on seeded payloads              │
                            │                                    │ IAST sink wrappers:
                                                                  ├─ pool.query (SQL text)
                                                                  └─ res.send (HTML responses)

[OWASP ZAP daemon (port 8090)] ──attacks──▶ http://localhost:3000    (DAST, black-box)
[IAST tracer (DOCUTRUST_IAST=1)] ──inside──▶ taint registry + sinks  (IAST)
[test build]  DOCUTRUST_VULN_MODE=1 ──restores──▶ the two pre-fix shapes at boot
[production]  no flag ──▶ the fixed code from Project 1
```

## 2.2 Application Architecture

- **`src/routes/documents.js`** — the two routes under test: the
  search endpoint (SQL built by string concatenation in the test
  build) and the render endpoint (title interpolated unescaped).
- **`src/lib/searchQuery.js`** — the naive search parser; an unclosed
  double quote sends it into an infinite loop that grows memory until
  the process dies — the denial-of-service bug (Stage 1.2).
- **`src/lib/iast.js`** — the taint tracer: registers tainted
  fragments (value → origin → request), wraps the `pool.query` and
  `res.send` sinks, and recognizes sanitization by outcome.
- **`src/lib/rasp.js`** — Express middleware mounted **before** the
  routes; answers 403 when a request carries a seeded attack-family
  payload.
- **`security/zap/`** — the two custom ZAP rules:
  `sqli-single-quote.js` (active rule 90099) and
  `xss-stored-passive.js` (passive rule 90100).
- **Environment flags** — `DOCUTRUST_VULN_MODE` (test build),
  `DOCUTRUST_IAST` (tracer on), `DOCUTRUST_RASP` (middleware on),
  `IAST_LOG` (tracer output path). **All flags are read once, at
  boot** — a running instance never picks up a changed flag; every
  flag change is a stop/restart.

## 2.3 Security Architecture

| Position | Tool | What it sees | Blind spot |
|---|---|---|---|
| Outside | OWASP ZAP (DAST) | What a black-box attacker sees — endpoint + parameter exploitable | The line of code; data across requests |
| Inside | IAST tracer | Exact source→sink path with line numbers — including the database round-trip of stored XSS | Paths that do not execute during the run |
| Edge | RASP middleware | Every arriving request before the routes | Payloads its patterns do not recognize; render of payloads stored before it was enabled |
| Source (P1) | semgrep | Every dangerous shape at rest | Runtime reachability and data |
| Tree (P2) | npm audit / Scorecard | Known advisories and upstream health | Runtime behavior |

## 2.4 CI/CD Flow

The pipeline from Projects 1–2 stands unchanged — `build-and-test`,
`sast`, `secrets-scan`, `sca` — and this project adds no CI job: the
runtime tooling runs locally by design, and its deliverable is the
evidence-based comparison, not a new gate. The standing gates remain
the enforcement point for source and dependency findings.

---

# 3. Prerequisites

## 3.1 Operating System

Linux, macOS, or WSL2 on Windows. A Bash terminal. Projects 1–2 setup
(Node.js ≥ 20, PostgreSQL 16.4, curl, jq, git) is assumed to persist.

## 3.2 Required Tools

| Tool | Required version | Notes |
|---|---|---|
| Node.js / npm | ≥ 20 | From Project 1 |
| PostgreSQL + `psql` | 16.4 | From Project 1 |
| OpenJDK | 17 (headless JRE) | Installed in Task 2 |
| OWASP ZAP | 2.17.0 (Linux build) | Installed in Task 2; a healthy install answers the API version check |
| python3 | any | JSON read-back of ZAP API responses |
| curl, jq, git | any | From Project 1 |

## 3.3 Required Accounts

None. ZAP is downloaded from GitHub releases (no auth); the registry
and GitHub API are not consulted by this project.

## 3.4 Required Permissions

- `sudo` on the machine — one use: `apt-get install
  openjdk-17-jre-headless`.
- Write access to the working tree (`security/zap/` rules are read,
  `evidence/` is written).

## 3.5 Required Credentials

- Dev database credentials unchanged from Projects 1–2
  (`docutrust` / `docutrust_dev_password`, dev-only).
- No other credentials. The ZAP API is accessed with
  `api.disablekey=true` on 127.0.0.1 only.

## 3.6 Repository Access

- Branch `project3-starter`: the finished Project 2 (cumulative
  snapshot) *plus* the test build — the state this guide assumes.
- No fork required — nothing in this project is pushed; the CI gates
  from Projects 1–2 already run on the fork from previous work.

## 3.7 Environment Variables

| Variable | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://docutrust:docutrust_dev_password@localhost:5432/docutrust` | App database connection (unchanged) |
| `DOCUTRUST_VULN_MODE` | `1` | Test build: restores the two pre-fix code shapes at boot. Default OFF. |
| `DOCUTRUST_IAST` | `1` | Enable the IAST tracer |
| `IAST_LOG` | path (e.g. `evidence/project-3/18-iast/iast-vuln.log`) | Tracer output file |
| `DOCUTRUST_RASP` | `1` | Enable the RASP middleware |

> **WARNING — the flag is a footgun:** `DOCUTRUST_VULN_MODE` is a
> test-build switch. Production must never set it. The flags are read
> once at boot — a changed flag only takes effect after a restart.

---

# 4. Environment Preparation

## 4.1 Repository setup

From the existing clone, select the starter branch and install from
the lockfile:

**COMMAND:**
```bash
git checkout project3-starter
npm ci
```

## 4.2 Database and configuration

The database, `.env.local`, and the load line are unchanged from
Projects 1–2:

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
set -a && . ./.env.local && set +a
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"
```

**EXPECTED RESULT:** the truncate succeeds; the tables and their
structure stay, rows return to zero.

> **NOTE:** every checkpoint in this guide restarts the app with a
> different flag combination. The flag is read **at boot** — that is
> why the stop line is always first.

## 4.3 The test build (read once)

The two vulnerabilities were **fixed** in Project 1, so the running
app is no longer exploitable. But you cannot scan what does not exist —
so the project's answer is a documented **test build**: the same two
pre-fix code shapes, restored verbatim behind an environment flag,
default OFF. The app reads `DOCUTRUST_VULN_MODE` once, at boot.

**The control for every stage:** restart the app **without** the flag
(`node src/index.js`) and both probes come back clean — that is the
fixed build you contrast against.

---

# 5. Checkpoints & Rerun Procedure

Read this section once — it fixes re-running for the whole project.

## 5.1 The flag-and-state contract

Every stage restarts the app with a different flag combination, and
the flag is read **at boot** — a running instance never picks up a
changed flag. The standard block, used by every checkpoint below:

**COMMAND:**
```bash
# 1. stop anything still listening on 3000
pkill -f "node src/index.js" || true

# 2. load the DB credentials
set -a && . ./.env.local && set +a

# 3. reset the data (schema stays; rows and ids go back to zero)
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"

# 4. prove it (should print one row: 0)
psql "$DATABASE_URL" -c "SELECT count(*) FROM documents;"

# 5. then start the build you need, in a second terminal:
#    DOCUTRUST_VULN_MODE=1 node src/index.js   (vulnerable test build)
#    node src/index.js                          (fixed, production default)
#    DOCUTRUST_IAST=1 DOCUTRUST_VULN_MODE=1 …   (IAST, vulnerable)
#    DOCUTRUST_RASP=1 DOCUTRUST_VULN_MODE=1 …   (RASP, vulnerable)
```

## 5.2 Rerun procedure

**First run.** Follow the tasks in order. The reset contract holds
naturally.

**Safe rerun.** Any task can be re-executed by restarting the app with
the task's flag combination and re-seeding the data if the task needs
it (Task 1's seed block). ZAP itself is a stateful daemon on port
8090 — an already-running daemon can be reused; a second one fails on
the port and should be stopped first.

**Recovery after a partial failure.** The one failure mode that is
*expected*: the stock ZAP scan can kill the app (Stage 1.2 — the
parser DoS). The cure is not a code change — restart the app and
continue with the custom-rule scans.

**Complete reset.** To restore the exact starting state of
`project3-starter`:

**COMMAND:**
```bash
git checkout project3-starter
git reset --hard origin/project3-starter
git clean -fd
```

followed by the Section 5.1 block (database + flags) and `npm ci`
if `node_modules` is in doubt.

> **WARNING:** `git reset --hard` and `git clean -fd` discard every
> change in the working tree. This project does not patch `src/` —
> anything uncommitted here is noise.

## 5.3 Idempotency classification

| Class | Operations | Rerun behavior |
|---|---|---|
| IDEMPOTENT | ZAP API calls (version, listEngines, spider, ascan status, alert read-back), `TRUNCATE … RESTART IDENTITY`, `pkill … \|\| true`, the `set -a` load line, `npm ci` | Second run is a no-op or a clean re-assertion |
| CONDITIONALLY IDEMPOTENT | `apt-get install openjdk-17-jre-headless` ("already installed" = success), ZAP daemon start (port 8090 — reuse the running daemon or stop it first), `git reset --hard` + `git clean -fd` (a reset is safe to repeat) | Second run either confirms the state or needs the running instance stopped |
| NOT IDEMPOTENT | `POST /documents` (the seed — each call creates a row), the ZAP script-load calls (an already-loaded name errors — reload with a fresh daemon session), the app process itself (one instance per port) | Creating data is the point — the checkpoint resets it; script loads are one-time per daemon session |

---

# 6. Implementation Tasks

Every task begins with a checkpoint that establishes its known
starting state, per Section 5.

## Task 1 — The Test Build & Seed

**Project Overview:** The two vulnerabilities were fixed in Project 1 —
to scan them you must bring them back, deliberately, behind a flag.

**Project Objective:** Start the vulnerable test build, seed the
database deterministically, and verify both bugs are live exactly as
seeded — this is also the baseline "vulnerable" evidence.

**Prerequisites:** Section 4 complete.

**Checkpoint — Known Starting State:** app stopped, database reset
(Section 5.1), `npm run migrate` done once.

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
set -a && . ./.env.local && set +a
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"

# in a second terminal, from the project root:
npm run migrate
DOCUTRUST_VULN_MODE=1 node src/index.js
```

### Step 1.1 — Seed the table

Deterministically, with captured ids. The DAST rule's differential
check needs a baseline query matching a *subset* of rows, so five "vm
test"/"Quarterly Report" documents are planted plus one payload row:

**COMMAND:**
```bash
for t in "vm test 1" "vm test 2" "vm test 3" "vm test 4" "Quarterly Report"; do
  curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' \
    -d "{\"title\":\"$t\",\"body\":\"seed\"}" >/dev/null
done
XSS_ID=$(curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' \
  -d '{"title":"<script>alert(1)</script>","body":"xss"}' | jq -r .id)
echo "XSS_ID=$XSS_ID"        # 6 after a reset — this is what the scans reference
```

### Step 1.2 — Verify the bugs are back

The SQL injection — the search query is built by string concatenation
(`src/routes/documents.js`, the original seeded shape):

**COMMAND:**
```bash
curl -s "localhost:3000/documents/search?q=%27%20OR%201=1%20--" | head -c 120
# [{"id":1,"title":"vm test 1"},...   <- the whole table, HTTP 200 (the SQLi)
```

The stored XSS — the render page interpolates the title unescaped:

**COMMAND:**
```bash
curl -s localhost:3000/documents/$XSS_ID/render | head -c 90
# <html><body><h1><script>alert(1)</script></h1>...   <- unescaped payload (the XSS)
```

**The control for every stage:** restart the app **without** the flag
(`node src/index.js`) and both probes come back clean — that is the
fixed build you contrast against.

**TASK RESULT:** both bugs live in the test build; the seed and the
probes are the vulnerable baseline every later stage contrasts with.
Evidence described in `evidence/project-3/17-zap-dast/` and the
findings report.

## Task 2 — DAST: Install & Verify ZAP (Deliverable 1)

**Project Overview:** OWASP ZAP is the black-box scanner — a Java
application driven here entirely from its API on port 8090.

**Project Objective:** Install Java 17 and ZAP 2.17.0, start the daemon
with the API exposed locally, and verify the install answers.

**Prerequisites:** Task 1 complete (the vulnerable build is running).

**Checkpoint — Known Starting State:** vulnerable build running
(`DOCUTRUST_VULN_MODE=1`); database seeded per Task 1.

### Step 2.1 — Install ZAP

**COMMAND:**
```bash
sudo apt-get install -y openjdk-17-jre-headless
# download ZAP from https://github.com/zaproxy/zaproxy/releases (the
# ZAP_2.17.0_Linux.tar.gz build), extract it:
mkdir -p ~/zap && tar -xzf ZAP_2.17.0_Linux.tar.gz -C ~/zap --strip-components=1
```

### Step 2.2 — Start the daemon

The API on port 8090 — this run is driven from the terminal, not the
browser:

**COMMAND:**
```bash
~/zap/zap.sh -daemon -port 8090 \
  -config api.disablekey=true \
  -config api.addrs.addr.name=127.0.0.1 -config api.addrs.addr.regex=false \
  -config updater.checkOnStartup=false
```

`updater.checkOnStartup=false` prevents the first-boot addon swap that
drifted a fresh 2.17.0 into breaking rule loading — a real verification
run hit it; the rule-load check in Task 3 tells you if yours does.

In a *healthy* install, ZAP starts into an empty session. Verify the
API is up:

**COMMAND:**
```bash
curl -s "http://127.0.0.1:8090/JSON/core/view/version/"
# {"version":"2.17.0"}
```

### Step 2.3 — The incident: the first scan kills the app (real, and expected)

A quick story, because the order matters. ZAP's *stock* SQL injection
rule sends probes containing unclosed **double quotes**; DocuTrust's
naive search parser (`src/lib/searchQuery.js`) enters an infinite loop
on an unclosed double quote and grows memory until the process dies.
The stock scan hits it for real:

```
FATAL ERROR: Ineffective mark-compacts near heap limit
             Allocation failed - JavaScript heap out of memory
```

![Figure 6.1: The real crash. A genuine denial-of-service bug, deliberately not fixed by this project: it is Project 7's fuzz target.](../../../project-3/images/18-zap-first-run-crash.png)

**What comes next is the fix for the scan, not a change to the app:**
the project's custom rules (Task 3) restrict the probe set to single
quotes — standard scanner tuning, and it keeps the target alive. If
you ran the stock scan and killed the app, restart it before going on:

**COMMAND:**
```bash
# check the app is up; if not, restart the vulnerable build
curl -s localhost:3000/healthz || true
```

**TASK RESULT:** Deliverable 1 (partial) — ZAP installed, daemon
verified, and the first crash captured as evidence: the stock scanner
provably kills the app, which is why the custom rules exist.

## Task 3 — DAST: Custom Rules

**Project Overview:** The stock rules cannot see these two bugs — and
one of them kills the app. The project ships two custom rules that
make the scan possible and the findings visible.

**Project Objective:** Load `sqli-single-quote.js` (active, 90099) and
`xss-stored-passive.js` (passive, 90100) via the ZAP API, and verify
they loaded clean.

**Prerequisites:** Task 2 complete.

**Checkpoint — Known Starting State:** ZAP daemon running on 8090;
vulnerable build running (restart it if the stock scan killed it).

### Step 3.1 — The two rules

- **`sqli-single-quote.js`** (active rule, id 90099) — probes the `q`
  parameter with a curated single-quote-only payload set and detects
  the injection by response differential: the `' OR 1=1 --` payload
  dumps the whole table, so the response is far longer than the
  baseline. Double-quote payloads are deliberately excluded for the
  reason above.
- **`xss-stored-passive.js`** (passive rule, id 90100) — raises an XSS
  alert when an HTML response contains an executable script payload:
  the response-side signature of stored XSS, which stock rules cannot
  see (they inject into request parameters; a stored payload is
  database state, not a parameter).

Both rules are deliberately simple and documented as illustrative —
pattern-based, no encoding resistance.

### Step 3.2 — Find the engine name ZAP actually uses

It changed from "Nashorn" to Graal.js and the label varies by build:

**COMMAND:**
```bash
curl -s "http://127.0.0.1:8090/JSON/script/view/listEngines/"
# {"listEngines":["ECMAScript : Graal.js","Zest : Mozilla Zest"]}
```

### Step 3.3 — Load each rule

The engine parameter is the *label* from that line, and `fileName` is
the absolute path:

**COMMAND:**
```bash
curl -s "http://127.0.0.1:8090/JSON/script/action/load/?scriptName=docutrust-sqli&scriptType=active&scriptEngine=ECMAScript%20:%20Graal.js&fileName=$PWD/security/zap/sqli-single-quote.js"
curl -s "http://127.0.0.1:8090/JSON/script/action/load/?scriptName=docutrust-xss-stored&scriptType=passive&scriptEngine=ECMAScript%20:%20Graal.js&fileName=$PWD/security/zap/xss-stored-passive.js"
```

Check they actually loaded — `error: false` is the green light:

**COMMAND:**
```bash
curl -s "http://127.0.0.1:8090/JSON/script/view/listScripts/" \
  | python3 -c "import sys,json; [print(s['name'],'error=',s['error']) for s in json.load(sys.stdin)['listScripts'] if s['name'].startswith('docutrust')]"
# docutrust-sqli error= false
# docutrust-xss-stored error= false
```

> **NOTE — if the load reports `error=true` with `Could not initialize
> class org.zaproxy.addon.commonlib.scanrules.ScanRuleMetadata`:**
> your ZAP build's addons have drifted — a fresh 2.17.0 hit exactly
> this; the *bundled* SwaggerSecretDetector failed the same way. It is
> environmental, not your rules. Two cures: start with
> `-config updater.checkOnStartup=false` from a clean home, or use an
> older ZAP (2.16.0 loads these rules clean on JDK 17). After fixing,
> re-run this check. The rule *contents* are unchanged either way —
> the failure is in ZAP's class loading, not the scripts.

**The remaining configuration this stage needs** — disabling every
stock active rule so no double-quote probe reaches the app — is a one
click in ZAP's Active Scan dialog (Tools → Options → Active Scan →
Rules). The API endpoint that toggles individual rules has been
removed from this build's addon set; the scan and report parts are
all API-driven, and the rules themselves are API-loaded — this single
dialog interaction is the one UI touch.

**TASK RESULT:** both rules loaded (`error= false`); the scan policy
is set to custom-rule-only.

## Task 4 — DAST: The Scan (Deliverables 2 and 3)

**Project Overview:** Feed ZAP the two target URLs, run the active
scan, and read the alerts — the two High findings this project is
about, from a scanner with **no source access at all**.

**Project Objective:** Confirm SQLi (Deliverable 2) and stored XSS
(Deliverable 3) externally on the vulnerable build; then repeat the
identical scan against the fixed build and show zero findings.

**Prerequisites:** Tasks 1–3 complete.

**Checkpoint — Known Starting State:** ZAP daemon on 8090, rules
loaded, policy set; vulnerable build running with the Task 1 seed.

### Step 4.1 — The scan

Three API calls: register the search URL in ZAP's site tree (spider),
run the active scan against the search endpoint's `q` parameter, and
let the passive scanner see the XSS render — the passive scanner
processes every response ZAP sees, including the render page requested
through the proxy:

**COMMAND:**
```bash
# 1. discover the endpoints
curl -s "http://127.0.0.1:8090/JSON/spider/action/scan/?url=http%3A%2F%2Flocalhost%3A3000%2Fdocuments%2Fsearch&recurse=false"
# 2. the active scan on the search endpoint (the custom 90099 rule runs)
curl -s "http://127.0.0.1:8090/JSON/ascan/action/scan/?url=http%3A%2F%2Flocalhost%3A3000%2Fdocuments%2Fsearch%3Fq%3Dquarterly&recurse=false"
# 3. let the passive scanner see the XSS render (request it THROUGH ZAP)
curl -s -x 127.0.0.1:8090 "http://localhost:3000/documents/$XSS_ID/render" >/dev/null
```

Poll the active scan to completion (scan id 0 for the first run):

**COMMAND:**
```bash
curl -s "http://127.0.0.1:8090/JSON/ascan/view/status/?scanId=0"
# {"status":"100"}   <- when it says 100, the scan is done
```

### Step 4.2 — Read the alerts

**COMMAND:**
```bash
curl -s "http://127.0.0.1:8090/JSON/alert/view/alerts/?baseurl=http%3A%2F%2Flocalhost%3A3000&count=40" \
  | python3 -c "import sys,json; [print(a['name'], a.get('url')) for a in json.load(sys.stdin).get('alerts',[])]"
```

![Figure 6.2: Real alert read-back — Stored XSS - Script Payload in HTML Response (DocuTrust) at http://localhost:3000/documents/6/render. The SQLi alert lands in the same list when the policy is right on your ZAP.](../../../project-3/images/35-zap-alerts-api.png)

**EXPECTED RESULT — the original run's two High alerts:**

```
High: SQL Injection - Single-Quote Probes (DocuTrust)
      url:      http://localhost:3000/documents/search?q=%27+OR+1%3D1+--
      param:    q
      attack:   ' OR 1=1 --
      evidence: ' OR 1=1 --

High: Stored XSS - Script Payload in HTML Response (DocuTrust)
      url:      http://localhost:3000/documents/6/render
      evidence: <script>alert(1)</script>
```

ZAP found the same two bugs Project 1 found by reading the source —
except ZAP had **no source access at all**: it attacked the running
app from outside. Both alerts land in the scan report
(`evidence/project-3/17-zap-dast/zap-vuln-scan.html` — ZAP's own HTML;
a browser shows the two highlight rows):

![Figure 6.3: The real generated report rendered in a browser — both High alerts listed, with the URLs, attack strings and evidence.](../../../project-3/images/24-zap-report-vuln.png)

The payloads' effect is visible in the app too — the SQLi probe
returns the whole documents table:

![Figure 6.4: The payload's effect, real browser render of GET /documents/search?q=' OR 1=1 -- — the full table vs. the baseline's single row. That response-length differential is the rule's detection mechanism.](../../../project-3/images/25-app-sqli-vuln.png)

### Step 4.3 — The contrast: same scan, fixed build (zero findings)

**The missing restart, made explicit:** between the two scans the
build changes. Stop the vulnerable instance, then start the fixed one
— and request the render through the same scan path, so the comparison
is apples to apples:

**COMMAND:**
```bash
# stop the vulnerable instance (Ctrl+C in its terminal, or:)
pkill -f "node src/index.js" || true

# start the fixed build in a second terminal:
node src/index.js
```

Then repeat exactly the same API-driven scan (spider → scan → render
through proxy → wait → read alerts). The custom SQLi rule finds no
differential (the bound parameter returns no row dump), and the
escaped render output contains no script payload:

```
High alerts: 0
Medium alerts: 0
Low/info: X-Content-Type-Options, X-Powered-By, CSP header,
          anti-clickjacking — application hardening only.
```

**EXPECTED RESULT:** zero High/Medium alerts on the fixed build; only
application-hardening low/informational items (the original run's full
list: `evidence/project-3/17-zap-dast/zap-fixed-alerts.json`).

DAST now tells you something precise about the fixed build: the
vulnerabilities it proved against the test build are gone from the
running application. What it still cannot tell you is *which line of
code* was at fault — that is the IAST stage.

**TASK RESULT:** Deliverables 2 and 3 — SQLi and XSS confirmed
externally (two High alerts, real report saved); fixed build clean.

## Task 5 — IAST: Watch the Data Move (Deliverables 4 and 5)

**Project Overview:** There is no viable free Node.js IAST product —
the one OWASP's own list names reached end-of-life and never supported
Node anyway. So, per the brief, this project builds the underlying
mechanism from first principles: `src/lib/iast.js`, a real
source-to-sink taint tracer.

**Project Objective:** Instrument the app, run the same five requests
against both builds, and read the tracer's findings —
source→sink with line numbers, including the cross-request chain DAST
structurally cannot see (Deliverable 4); then compare DAST vs IAST from
real output (Deliverable 5).

**Prerequisites:** Tasks 1–4 complete.

**Checkpoint — Known Starting State:** app stopped, database reset.

### Step 5.1 — How the tracer works (the module header says it all, honestly)

- **Sources:** query and body values are registered as *tainted
  fragments* (value → where it came from → which request). The
  registry is shared across requests — that is what lets taint
  survive the database round-trip of stored XSS.
- **Sinks:** `pool.query` (SQL text) and `res.send` (HTML responses)
  are wrapped. If a sink argument contains a tainted fragment, the
  taint reached it.
- **Sanitizer recognition by outcome:** `escapeHtml` output no longer
  contains the fragment, so the fixed path logs the taint as
  neutralized — observed, not hardcoded.
- Documented scope: fragment-based propagation (no encoding
  resistance), `req.params` not marked (no seeded sink consumes
  them), illustrative, not production.

Enable it: `DOCUTRUST_IAST=1` (add `DOCUTRUST_VULN_MODE=1` for the
vulnerable run). **Both flags live in the boot environment** — same
restart rule as everything else.

### Step 5.2 — The run: the same five requests, two builds

**Checkpoint** (vulnerable run): stop the app, reset the data, start
the IAST-instrumented vulnerable build:

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
set -a && . ./.env.local && set +a
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"
```

**COMMAND:**
```bash
# second terminal:
DOCUTRUST_IAST=1 DOCUTRUST_VULN_MODE=1 IAST_LOG=evidence/project-3/18-iast/iast-vuln.log node src/index.js
```

The five requests — written out, the same five in both builds.
(Request #2/#3 in the tracer's output counts the whole session:
health first, then the three below; the numbering is per-process, so
do not force a match — look at the *sink* lines.)

**COMMAND:**
```bash
curl -s localhost:3000/healthz                                   # 1. baseline request
curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' \
  -d '{"title":"<script>alert(1)</script>","body":"xss"}'        # 2. the write side (XSS)
curl -s "localhost:3000/documents/search?q=%27%20OR%201=1%20--"  # 3. the SQLi payload
curl -s localhost:3000/documents/$XSS_ID/render                  # 4. the read side (XSS)
curl -s localhost:3000/healthz                                   # 5. sanity
```

> **NOTE — request #4's id:** it must reference the document request
> #2 just stored. After the checkpoint's truncate, that id is 1 — if
> your `$XSS_ID` shell variable points at an earlier seed (e.g. 6
> from Task 1's run), re-capture it from the POST response. The
> tracer's registry is shared across requests — the finding fires on
> the render because the POST's tainted fragment survives the
> database round-trip.

Read the findings — the tracer logs one line per sink inspection:

**COMMAND:**
```bash
grep -A6 FINDING evidence/project-3/18-iast/iast-vuln.log
```

![Figure 6.5: Real IAST output from the vulnerable build — both findings, source→sink with line numbers — req.query (GET /documents/search) → pool.query(sql) and req.body (POST /documents) → res.send() [GET /documents/$XSS_ID/render] — the second one two requests later, the database round-trip that DAST structurally cannot see.](../../../project-3/images/36-iast-vuln.png)

**EXPECTED RESULT:** both findings — `req.query (GET /documents/search)`
→ `pool.query(sql)` and `req.body (POST /documents)` →
`res.send() [GET /documents/$XSS_ID/render]` — the second one **two
requests later**.

Fixed build — same five requests, zero findings (this restart is the
whole point of the checkpoint):

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
# second terminal:
DOCUTRUST_IAST=1 IAST_LOG=evidence/project-3/18-iast/iast-fixed.log node src/index.js
# ... same five requests ...
grep -E "OBSERVATION" evidence/project-3/18-iast/iast-fixed.log
```

**EXPECTED OUTPUT:**
```
OBSERVATION SQL — no tainted fragment in sink [pool.query(sql, params)]
OBSERVATION HTML — no tainted fragment in sink
    (escapeHtml outcome: neutralized) [res.send() [GET /documents/$XSS_ID/render]]
```

### Step 5.3 — DAST versus IAST, from real output (Deliverable 5)

Lay the two tools' output side by side. **ZAP said:**
`/documents/search` is SQLi-vulnerable (URL + parameter). **IAST
said:** `req.query.q` from `GET /documents/search` reaches
`pool.query` at `documents.js:72`. For the XSS: **ZAP said** the
render endpoint carries a script payload; **IAST said**
`req.body.title` from a POST reaches `res.send` at
`documents.js:135` — **two requests later**, the database round-trip
that DAST structurally cannot see. Both tools are right; they answer
different questions. That concrete difference — endpoint versus
line-and-path — is what most engineers collapse into "they're all
runtime scanners". They are not.

**TASK RESULT:** Deliverables 4 and 5 — working IAST tracer with both
findings (vulnerable) and none (fixed); DAST vs IAST compared from
real output. Evidence: `evidence/project-3/18-iast/`.

## Task 6 — RASP: Block It Live (Deliverables 6, 7, 8)

**Project Overview:** A live defense: block the attacks before they
reach the vulnerable code.

**Project Objective:** Enable the middleware, prove both payloads are
answered 403 (Deliverables 7 and 8), and run the control that proves
it was the middleware — not the app (Deliverable 6 is the middleware
itself).

**Prerequisites:** Tasks 1–5 complete.

**Checkpoint — Known Starting State:** app running with
`DOCUTRUST_VULN_MODE=1 DOCUTRUST_RASP=1`; database has the stage seed
(5 + XSS row).

### Step 6.1 — The middleware

`src/lib/rasp.js` is Express middleware mounted **before** the routes:
it inspects every incoming request (query, path params, JSON body)
for the two seeded attack families and answers **403** before the
request can reach the vulnerable code. Enable with
`DOCUTRUST_RASP=1`; the kill switch is documented — unset it. The
module header states its honest scope in plain words: pattern-based,
trivially bypassable by encoding, **illustrative infrastructure, not a
production-grade product** — the brief explicitly requires that
framing, and it is not oversold anywhere in this project.

### Step 6.2 — Live blocks (Deliverables 7 and 8)

**COMMAND:**
```bash
curl -s -w " [%{http_code}]\n" "localhost:3000/documents/search?q=%27%20OR%201=1%20--"
# {"error":"blocked by DocuTrust RASP: SQL injection","pattern":"..."}  [403]

curl -s -w " [%{http_code}]\n" -X POST localhost:3000/documents \
  -H 'Content-Type: application/json' -d @/tmp/xss-payload.json
# {"error":"blocked by DocuTrust RASP: cross-site scripting","pattern":"..."} [403]
```

`/tmp/xss-payload.json` = `{"title":"<script>alert(1)</script>","body":"xss"}`
— writing a one-line payload file avoids the quote-tangle in a
single-line curl `-d`.

![Figure 6.6: Real output with RASP on — 403 for both payloads, and the app log records each block as a single auditable line.](../../../project-3/images/37-rasp-on.png)

**EXPECTED RESULT — 403 for both payloads**, and the app log records
each block as a single auditable line:

```
[RASP] BLOCKED GET /documents/search?q=%27%20OR%201=1%20-- — SQL injection (pattern: ...)
[RASP] BLOCKED POST /documents — cross-site scripting (pattern: ...)
```

Benign traffic passes untouched (control requests are part of the
evidence): `?q=quarterly` returns 200, and the same SQLi payload with
RASP off is a 200 (Step 6.3).

### Step 6.3 — The control run: prove it was RASP (not the app)

Kill the app, restart with **no** RASP flag, fire the identical
payloads — **this kill/restart is not optional; the flag is read at
boot, and the whole point of the control is to prove the middleware
did it**:

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
# second terminal:
DOCUTRUST_VULN_MODE=1 node src/index.js
```

**COMMAND:**
```bash
curl -s -w " [%{http_code}]\n" "localhost:3000/documents/search?q=%27%20OR%201=1%20--"
# [{"id":1,"title":"vm test 1"},...]   <- the whole table, HTTP 200

curl -s -w " [%{http_code}]\n" -X POST localhost:3000/documents \
  -H 'Content-Type: application/json' -d @/tmp/xss-payload.json
# {"id":7,...}   <- stored, HTTP 201
```

![Figure 6.7: The control — identical payloads, 200/201. The 403 blocks were the middleware's work, proven by contrast.](../../../project-3/images/38-rasp-off-control.png)

**EXPECTED RESULT:** identical payloads answer 200/201 without RASP —
the 403 blocks were the middleware's work, proven by contrast.

Note the honest boundary stated in the evidence README: RASP blocks
the XSS **delivery** (the POST that would store the payload), not the
render of a payload stored *before* RASP was enabled — input side
only, exactly what the brief asks ("blocks them before they reach the
vulnerable route").

**TASK RESULT:** Deliverables 6, 7, 8 — middleware shipped with a
documented kill switch; live blocks proven (403 + log lines); control
run proves the blocks were the middleware. Evidence:
`evidence/project-3/19-rasp/`.

## Task 7 — The Four-Way Comparison (Deliverable 9)

**Project Overview:** The full comparison — SAST (Project 1) vs DAST
vs IAST vs RASP, applied to the same two bugs, every claim grounded in
the evidence above.

**Project Objective:** Produce the comparison —
`docs/project-3/final-findings-report.md`.

**Prerequisites:** Tasks 1–6 complete.

The one-paragraph version, from real output:

**SAST** reads the source and sees every dangerous shape at rest, but
knows nothing of runtime reachability or data. **DAST** attacks from
outside with no source access and proves an endpoint is exploitable,
but cannot name the line or follow data across requests. **IAST**
watches from inside and names the exact source→sink path — including
the cross-request stored-XSS chain — but only sees paths that execute
during the run. **RASP** blocks arriving attacks before the vulnerable
route, but is input-side and pattern-based: it says nothing about
what the application would do if a payload it does not recognize gets
through.

| Technique | What it proved here | What it structurally cannot do |
|---|---|---|
| SAST (P1) | Every dangerous shape at rest — both bugs flagged in source | Know runtime reachability or data |
| DAST (Task 4) | Endpoint + parameter exploitable — two High alerts, no source access | Name the line of code; follow data across requests |
| IAST (Task 5) | Exact source→sink path with line numbers, incl. the two-request stored-XSS chain | See paths that never execute during the run |
| RASP (Task 6) | 403 before the routes, auditable log lines | Recognize payloads outside its patterns; block render of pre-existing stored payloads |

Each one structurally cannot do what the others can; the report says
which, with the actual alert and log lines as evidence.

**TASK RESULT:** Deliverable 9 — the four-way comparison grounded in
the captured evidence.

## Task 8 — Chain A Closing & Handoff (Deliverable 10)

**Project Overview:** Chain A (Detect) is complete. The closing report
ties Projects 1–3 together.

**Project Objective:** Produce `docs/project-3/chain-a-closing-report.md`.

**Prerequisites:** Tasks 1–7 complete.

The report covers:

- The same two bugs, six techniques — SAST, secrets scanning, SCA,
  DAST, IAST, RASP.
- The standing CI gates (Projects 1–2) — source and dependency
  enforcement.
- The deliberately-unfixed known issue: the parser denial-of-service
  (Stage 1.2) — Project 7's fuzz target.
- What Chain B (Prove) inherits without needing anything re-explained.

**TASK RESULT:** Deliverable 10 — Chain A closed; the handoff to
Chain B is explicit.

---

# 7. Security Findings & Fixes

## 7.1 Findings summary

| Finding | Tool | Result | Verified? | Action |
|---|---|---|---|---|
| SQLi in `/documents/search` (test build) | ZAP (DAST) | High alert — `' OR 1=1 --` dumps the table (Figure 6.2–6.4) | Yes — black-box, no source access | Fixed in production build (P1); blocked by RASP when present |
| SQLi — source→sink path | IAST tracer | `req.query.q` → `pool.query` at `documents.js:72` (Figure 6.5) | Yes — inside the app, with line numbers | Same — fixed build logs no tainted fragment |
| Stored XSS in `/documents/:id/render` (test build) | ZAP (DAST) | High alert — script payload in HTML response (Figure 6.2) | Yes — externally confirmed | Fixed in production build (P1); blocked at delivery by RASP |
| Stored XSS — cross-request chain | IAST tracer | `req.body.title` (POST) → `res.send` at `documents.js:135`, two requests later (Figure 6.5) | Yes — the DB round-trip DAST cannot see | Same — fixed build logs "escapeHtml outcome: neutralized" |
| SQLi + XSS live delivery | RASP middleware | 403 for both payloads, auditable log lines (Figure 6.6) | Yes — control run: 200/201 with RASP off (Figure 6.7) | Defense-in-depth; input-side only, by design |
| Parser denial-of-service | ZAP stock scan | `FATAL ERROR: … heap out of memory` (Figure 6.1) | Yes — real, reproducible | Deliberately not fixed — Project 7's fuzz target |
| Fixed build, full scan | ZAP (DAST) | 0 High / 0 Medium; hardening-only low/info items | Yes — identical scan path | No action — application hardening items noted |

Every finding above is verified at runtime — none is scanner output
alone.

## 7.2 Verification record — SQL injection

1. **Vulnerability:** SQL injection in `GET /documents/search` (the
   seeded shape from Project 1, present only in the test build).
2. **Evidence:** DAST — High alert with URL, parameter, attack string
   and evidence (`' OR 1=1 --`, Figure 6.2); the payload's effect in
   the browser (Figure 6.4). IAST — `req.query.q` from
   `GET /documents/search` reaches `pool.query` at `documents.js:72`
   (Figure 6.5).
3. **Root cause:** query built by string concatenation (fixed in
   Project 1 with a bound parameter).
4. **Defense:** the production build is the fixed code; the RASP
   middleware answers 403 before the route when the test build is
   active (Figure 6.6).
5. **Validation:** fixed build — ZAP finds no differential (0 High);
   IAST logs "no tainted fragment in sink".
6. **Security result:** an outside attacker cannot exploit the fixed
   build; the test build is non-exploitable with RASP enabled.

## 7.3 Verification record — stored XSS

1. **Vulnerability:** stored/reflected XSS in
   `GET /documents/:id/render` (test build only).
2. **Evidence:** DAST — High alert, `<script>alert(1)</script>` in the
   HTML response (Figure 6.2, report in Figure 6.3). IAST —
   `req.body.title` from a POST reaches `res.send` at
   `documents.js:135` **two requests later** (Figure 6.5) — the
   database round-trip.
3. **Root cause:** unescaped interpolation (fixed in Project 1 with
   `escapeHtml()`).
4. **Defense:** escaped render in the production build; RASP blocks
   the payload's *delivery* (the POST), 403 before storing
   (Figure 6.6).
5. **Validation:** fixed build — escaped output, no script payload in
   responses; IAST logs "escapeHtml outcome: neutralized".
6. **Security result:** stored XSS is closed end to end — the write
   side is blocked or sanitized, the read side renders inert.

## 7.4 The deliberately-unfixed finding — parser DoS

ZAP's stock SQLi rule killed the app: an unclosed double quote sends
`src/lib/searchQuery.js` into an infinite loop that grows memory until
the process dies. The response is a real denial-of-service bug —
**documented, not fixed**: it is Project 7's fuzz target. The project's
custom rules restrict probes to single quotes so the scan keeps the
target alive; that is scanner tuning, not a code change.

## 7.5 The comparison, as findings

The four techniques answer different questions — Section 7.1's table
and Task 7's matrix are the deliverable. The engineering point: a
"runtime scanner" label collapses DAST, IAST and RASP into one thing,
but the evidence here shows three different capabilities — endpoint
proof, line-and-path proof, and live blocking — each with a
structural blind spot the others cover.

---

# 8. CI/CD

## 8.1 Pipeline stages

The standing pipeline from Projects 1–2 — unchanged by this project:

| Stage | Purpose | Tool | Input | Output | Failure condition |
|---|---|---|---|---|---|
| `build-and-test` | Application builds and tests pass | Node.js on ubuntu-latest | repository | green build | build/test failure |
| `sast` | No known vulnerability patterns | semgrep with `semgrep/rules/` | `src/` | finding count | any finding |
| `secrets-scan` | No credentials in tree or history | gitleaks with `gitleaks.toml`, full history | repository + git history | leak count | any leak |
| `sca` | Policy §1 + §5 enforcement | `npm audit --audit-level=high` + scorecard gate | lockfile + new deps | gate exit codes | high/critical advisory; new dep < 5/10 |

## 8.2 Why the runtime tooling is not a CI job

The DAST/IAST/RASP tooling runs locally by design: a scanner that
kills the app it scans (Stage 1.2), an instrumented build behind a
test flag, and a middleware that answers 403 on seeded payloads are
all demonstration tooling. The deliverables are the evidence and the
comparison, not a new gate. The standing gates remain the enforcement
point for the findings this project proves at runtime.

---

# 9. Troubleshooting

Separated into first-time setup and re-run/recovery — the traps differ.

## 9.1 First-time setup

| Error / Symptom | Cause | Resolution | Related step |
|---|---|---|---|
| `FATAL ERROR: Ineffective mark-compacts near heap limit` | ZAP's stock SQLi rule sent an unclosed double quote; the naive parser looped | Expected — restart the vulnerable build; the custom rules keep the target alive | 2.3 |
| ZAP rules load with `error=true` / `ScanRuleMetadata` class-init error | Addon drift in the ZAP build | Start with `-config updater.checkOnStartup=false` from a clean home, or use ZAP 2.16.x. Not a rule problem | 3.3 |
| The scan's alerts list has no custom-rule entries | Stock active rules still enabled (double-quote hang), or the engine label in the load call was wrong | Check `error=false` (3.3) and the policy dialog (4.1) | 3.3 / 4.1 |
| ZAP daemon fails to start (port in use) | An earlier daemon instance holds 8090 | Reuse the running daemon or stop it first | 2.2 |
| `Could not initialize class …ScanRuleMetadata` on the bundled addon too | Environmental, not your rules | Same cure as the rule-load error | 3.3 |

## 9.2 Re-run / recovery

| Error / Symptom | Cause | Resolution | Related step |
|---|---|---|---|
| `EADDRINUSE` on every `npm start` | A server is already running from a previous stage | The checkpoint's first line — `pkill -f "node src/index.js" || true` — is safe on any state | 5.1 |
| IAST logs nothing | `DOCUTRUST_IAST=1` and `IAST_LOG` not in the *boot* environment | Flags are read once — restart with the flags in the start command | 5.2 |
| RASP blocks 403s that shouldn't, or misses payloads | The patterns are illustrative | See the module header's honest scope; that framing is the deliverable | 6.1 |
| Findings numbers don't match the guide | The seed drifted (extra rows, wrong ids) | Re-run Task 1's checkpoint + seed block — ids are deterministic after a reset | 1.1 |
| Wrong build answers the probe (probe comes back clean on the "vulnerable" run) | The app was not restarted after a flag change | Flags are read at boot — stop, start with the flag combination the task needs | 5.1 |

---

# 10. Evidence Index

| Brief deliverable → Task | Where it lives |
|---|---|
| 1 — Real ZAP scan, output captured (Task 2–4) | `evidence/project-3/17-zap-dast/` (report + alerts JSON) |
| 2 — SQLi confirmed externally (Task 4) | `zap-vuln-scan.html`, High alert on `/documents/search` (`' OR 1=1 --`) |
| 3 — XSS confirmed externally (Task 4) | `zap-vuln-scan.html`, High alert on `/documents/$XSS_ID/render` (`<script>alert(1)</script>`) |
| 4 — Working IAST tracer (Task 5) | `src/lib/iast.js`, runs in `evidence/project-3/18-iast/` |
| 5 — DAST vs IAST, compared (Task 5) | Task 5.3 above + report §3 |
| 6 — Working RASP middleware (Task 6) | `src/lib/rasp.js`, disable switch documented in the module |
| 7 — Live SQLi blocked (Task 6) | `evidence/project-3/19-rasp/rasp-on-transcript.txt` (403 + log line) |
| 8 — Live XSS blocked (Task 6) | same — XSS POST answered 403 before storing |
| 9 — Four-way comparison (Task 7) | `docs/project-3/final-findings-report.md` |
| 10 — Chain A closing (Task 8) | `docs/project-3/chain-a-closing-report.md` |
| Tasks 2–6 | real terminal screenshots | `docs/project-3/images/` (Figures 6.1–6.7) |

---

# 11. Final Verification

Run this checklist before declaring the implementation complete:

**Environment**
- [ ] Branch `project3-starter`, clean tree
- [ ] ZAP 2.17.0 daemon on 8090; API answers `{"version":"2.17.0"}`
- [ ] Both custom rules loaded: `docutrust-sqli error= false`, `docutrust-xss-stored error= false`
- [ ] Stock active rules disabled in the policy dialog (no double-quote probes)

**Application**
- [ ] Test build (`DOCUTRUST_VULN_MODE=1`) seeds 5 + 1 rows; both probes live (whole table; unescaped `<script>`)
- [ ] Fixed build (no flag) — both probes clean
- [ ] App restarted after every flag change (flags read at boot)

**Security**
- [ ] DAST vulnerable build: 2 High alerts with URL, attack, evidence
- [ ] DAST fixed build: 0 High / 0 Medium, hardening-only low/info
- [ ] IAST vulnerable: both findings with source→sink lines; IAST fixed: "no tainted fragment" observations
- [ ] RASP: 403 + auditable log lines for both payloads; control run 200/201 with RASP off
- [ ] Parser DoS documented as deliberately unfixed (Project 7 target)

**CI/CD**
- [ ] Standing gates unchanged and green on the fork (Projects 1–2)
- [ ] No new CI job introduced (runtime tooling is local by design)

**Evidence**
- [ ] `evidence/project-3/17-zap-dast/`, `18-iast/`, `19-rasp/` saved and complete
- [ ] `docs/project-3/final-findings-report.md` (four-way comparison) written
- [ ] `docs/project-3/chain-a-closing-report.md` written — Chain B handoff explicit
