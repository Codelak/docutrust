# DocuTrust — Project 1 — DevSecOps Implementation Guide

---

# 1. Project Overview

## 1.1 Project Overview

DocuTrust is a small Express/PostgreSQL web API that stores documents. It
has never been scanned for security problems, and this project applies
real security tooling to it for the first time — SAST, secrets scanning,
and live credential verification — and keeps the output.

The project deliberately contains three seeded findings: a SQL injection
in the search endpoint, a stored/reflected XSS in the render endpoint,
and an AWS-key-shaped constant that is not a real credential. The work
for each is different: the SQLi must be caught by a rule the default
scanners do not have, the XSS must be confirmed by hand and fixed, and
the "AWS key" must be proven inert against AWS itself before it is
dismissed.

Every command in this guide actually ran, and every figure is a real
capture of that command on a real terminal. Evidence files are cited
along the way.

## 1.2 Project Objectives

1. Run real security tools against the application and capture the real
   output as evidence.
2. Write a custom SAST rule that catches a vulnerability the built-in
   rules miss, and prove the rule generalizes beyond the seeded line.
3. Prove whether a suspicious string is an actual working credential or
   a pattern match that only looks like one.
4. Fix the two real vulnerabilities — SQL injection and stored XSS — and
   prove the fixes at runtime, not by inspection.
5. Wire CI gates (SAST and secrets scanning) that block bad code, and
   demonstrate they fail on a deliberately injected violation.
6. Produce the final findings report and hand off the known state to
   Project 2 (SCA).

## 1.3 Scope

**In scope:**

- The application source (`src/`, 7 files on the starter branch), its git
  history, and its runtime behavior on a local dev database.
- Static analysis with semgrep (default rulesets and the project's custom
  rule), secrets scanning with gitleaks (working tree and full history),
  and live verification of the seeded credential against AWS STS.
- The CI gates in GitHub Actions (`sast`, `secrets-scan`).

**Out of scope:**

- Dependency scanning and supply-chain policy — Project 2.
- Runtime scanning (DAST/IAST/RASP) — Project 3.
- Cloud deployment of the application.

**Branches:** Tasks 1–9 execute on `project1-starter` (the app before the
fixes, exactly as this guide assumes). Task 10 (the CI gate) requires
`main` and a GitHub fork, because GitHub Actions cannot run locally.

## 1.4 Technology Stack

| Component | Version / Pin | Purpose |
|---|---|---|
| Node.js | v20.20.0 (verified at install) | Application runtime |
| Express | (per `package.json`) | Web framework — API routes |
| PostgreSQL | 16.4 | Document store — `documents`, `comments` tables |
| semgrep | 1.173.0 (installed via pipx) | SAST scanner — default rulesets and custom rule |
| gitleaks | 8.30.1 (pinned) | Secrets scanner — tree and full-history sweep |
| curl + jq | (per OS) | HTTP client and JSON parsing for smoke tests and evidence capture |
| Docker | optional | Containerized PostgreSQL (alternative to native install) |
| GitHub Actions | — | CI gates: `sast`, `secrets-scan` |
| GitHub CLI (`gh`) | (per OS) | Reading CI run status from the terminal |

Note on versions: semgrep updates fast — the installed version will
differ, and scan output wording may differ slightly. Compare the pattern
of the result (e.g. "1 finding at the render line"), not the exact
wording. gitleaks is pinned to 8.30.1 deliberately: the default
`aws-access-token` rule changed between versions, and the whole point of
Task 5 is to observe that behavior from a fixed version.

## 1.5 DevSecOps Workflow

The implementation map for the whole project:

| Task | What you do | Why |
|---|---|---|
| 1 | Smoke-test the running app | You cannot judge a scanner finding without knowing what the code does when it runs |
| 2 | SAST scan with default rulesets | See what generic tools catch — and miss |
| 3 | Confirm the XSS by hand | Prove a scanner hypothesis against the running app |
| 4 | Write a custom SAST rule | Catch what the defaults miss; prove the rule generalizes |
| 5 | Scan for secrets | Defaults vs. project config; triage documentation hits; full-history sweep |
| 6 | Verify the "key" live | Pattern match is not proof — ask AWS |
| 7 | The reachability discovery | Understand why the seeded SQLi is invisible to static tools |
| 8 | Fix both vulnerabilities | The actual job — parameterized query, escaping, route order |
| 9 | Prove the fixes at runtime | Search works, injections inert, scan clean |
| 10 | Wire and prove the CI gates | Green on good code, red on bad code |
| 11 | Write the findings report | Verdicts, evidence, handoff to Project 2 |

Plan for roughly 60–90 minutes end to end.

---

# 2. Architecture

## 2.1 Architecture Overview

The application is a single Node.js process speaking HTTP on port 3000,
with PostgreSQL behind it on port 5432. All security tooling runs
outside the application: scanners read the source and the git history;
verification talks to AWS; CI runs the scanners on every push.

```
[curl / browser] ──HTTP──▶ [Express app (Node 20, port 3000)] ──SQL──▶ [PostgreSQL 16 (port 5432)]
                                    │                                          documents / comments
                                    ├─ GET  /healthz               → DB connectivity check
                                    ├─ POST /documents             → create a document
                                    ├─ GET  /documents/:id         → fetch a document
                                    ├─ GET  /documents/:id/render  → HTML page (XSS seeded)
                                    └─ GET  /documents/search?q=   → search (SQLi seeded)

[security tooling]
  semgrep  ──reads──▶ src/ (static analysis)
  gitleaks ──reads──▶ working tree + full git history (secrets)
  security/verify-credential.js ──calls──▶ AWS STS (identity check of the found key)
  GitHub Actions ──runs──▶ sast + secrets-scan gates on every push/PR
```

## 2.2 Application Architecture

- **`src/index.js`** — the web server; prints `DocuTrust dev listening
  on 3000` and blocks the terminal.
- **`src/routes/documents.js`** — all document routes. Contains the two
  seeded vulnerabilities before the fix: the search endpoint builds SQL
  by string interpolation (`documents.js:77`), and the render endpoint
  interpolates the title and body into HTML (`documents.js:104`).
- **`src/config.js`** — configuration; contains the seeded
  `LEGACY_INTEGRATION_KEY` constant (`config.js:15`).
- **`src/migrate.js`** — migration runner; applies SQL files in
  `migrations/` that have not run yet, tracked in the
  `schema_migrations` bookkeeping table.
- **Database** — two tables, `documents` (id, title, body, created_at)
  and `comments`, created from `migrations/0001_init.sql`.

The route that matters for the search bug: `GET /search` must be
registered before `GET /:id`. In the starter state it is registered
after, so the search handler is unreachable — see Task 7.

## 2.3 Security Architecture

| Layer | Tool | What it sees | Blind spot |
|---|---|---|---|
| Source code | semgrep, default rulesets | Dangerous patterns in text | Stack-specific flows it does not model (the SQLi) |
| Source code | semgrep, custom rule | Template-literal/concatenation flows into `pool.query()` | Reachability — it scans text, not execution |
| Secrets | gitleaks, default config | High-entropy credential shapes | Low-entropy placeholders (entropy gate) |
| Secrets | gitleaks, project config | Credential shapes without the entropy gate, scoped allowlist | Whether the key actually works |
| Identity | AWS STS via `verify-credential.js` | Whether the found key exists in AWS's identity service | Nothing — this is the verdict layer |
| Enforcement | GitHub Actions `sast` / `secrets-scan` | Every push and PR | Nothing locally — the gates live on GitHub |

## 2.4 CI/CD Flow

Pipeline on every push to `main` and every pull request (GitHub Actions,
workflow `ci.yml`):

| Job | Runs | Blocks on |
|---|---|---|
| `build-and-test` | Builds and tests the application | Build or test failure |
| `sast` | semgrep with the project's custom rule | Any finding (via `--error`) |
| `secrets-scan` | gitleaks with `gitleaks.toml`, full history | Any leak |

Full stage-by-stage detail in Section 8.

---

# 3. Prerequisites

## 3.1 Operating System

Linux, macOS, or WSL2 on Windows. A Bash terminal. Everything below is
assumed to run from a shell where `#` starts a comment and `$` is the
prompt.

## 3.2 Required Tools

| Tool | Required version | Install |
|---|---|---|
| Node.js | ≥ 20 (v20.20.0 used) | nodejs.org LTS installer, or nvm |
| npm | ships with Node | bundled |
| PostgreSQL server | 16.4 | Docker container, or native install (Section 4.2) |
| `psql` client | matches server | ships with PostgreSQL |
| curl | any | usually preinstalled |
| jq | any | distro package |
| git | any | distro package |
| semgrep | 1.173.0 | `pipx install semgrep` (Section 4.3) |
| gitleaks | 8.30.1, pinned | release binary from GitHub (Section 4.3) |
| Docker | any | only needed for the containerized PostgreSQL path |
| GitHub CLI (`gh`) | any | required for Task 10 (CI status from the terminal) |

## 3.3 Required Accounts

- A GitHub account. The CI stage (Task 10) pushes to **your own fork**
  of the DocuTrust repository so GitHub Actions runs for you.
- No AWS account is required. The live credential check is an identity
  probe against AWS's public STS endpoint; it needs no credentials of
  yours.

## 3.4 Required Permissions

- `sudo` on the machine (used once to move the gitleaks binary to
  `/usr/local/bin/`, and for the native PostgreSQL install).
- Docker daemon access if using the container path (add your user to the
  `docker` group, or use `sudo service docker start`).
- Write permission on your GitHub fork.

## 3.5 Required Credentials

- Database credentials are dev-only and hardcoded in the project:
  user `docutrust`, password `docutrust_dev_password`, database
  `docutrust`, host `localhost:5432`. They match `.env.example`.
- No production credentials are used anywhere in this project.
- The verification script (Task 6) needs no real AWS secret — a clearly
  fake value is sufficient, because an unrecognized access key is
  rejected before anything else is checked.

## 3.6 Repository Access

- Repository: `github.com/Codelak/docutrust` (clone with HTTPS).
- Branch `project1-starter`: the app **before** the fixes — used for
  Tasks 1–9.
- Branch `main`: the finished state including CI config — used for
  Task 10.
- Clone and branch selection are covered in Section 4.1.

## 3.7 Environment Variables

| Variable | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://docutrust:docutrust_dev_password@localhost:5432/docutrust` | The only variable the app reads; created from `.env.example` |

Two load-bearing facts about it:

- Node does **not** read `.env.local` by itself — the file must be
  sourced with `set -a` in every terminal that runs the app (Section
  4.5).
- A plain `source` is not enough: without `set -a`, Node silently
  connects as your OS user and the app fails with a SASL password
  error. The load line is part of every checkpoint in this guide.

---

# 4. Environment Preparation

## 4.1 Repository setup

Clone the repository and select the starter branch:

**COMMAND:**
```bash
git clone https://github.com/Codelak/docutrust.git
cd docutrust
git checkout project1-starter
```

`project1-starter` carries the app in its pre-fix state — the state every
task below assumes. Before every `git checkout` in this guide, check
that the working tree is clean — a checkout silently refuses when a
tracked file has local changes:

**COMMAND:**
```bash
git status
```

**EXPECTED RESULT:** `nothing to commit, working tree clean`. If it is
not clean, either commit the work or discard it:

```bash
# keep it:  git add -A && git commit -m "wip"
# or discard it (works, then re-checkout):
git checkout -- .
```

## 4.2 Database setup

**Path A — PostgreSQL in Docker (recommended).** If `docker --version`
reported `command not found`, install Docker first (Docker Desktop on
Windows/WSL2, or `sudo apt-get install -y docker.io` on Ubuntu), then
confirm the daemon is running:

**COMMAND:**
```bash
docker ps
```

**EXPECTED RESULT:** a table of containers (possibly empty) — Docker
works. On Ubuntu you may need `sudo service docker start` first, or to
add your user to the `docker` group and log out/in.

**Path B — PostgreSQL installed natively.** On Ubuntu:

**COMMAND:**
```bash
sudo apt-get install -y postgresql
```

This installs and starts the PostgreSQL server. Confirm it accepts
connections:

**COMMAND:**
```bash
pg_isready
```

![Figure 3.1: pg_isready confirms PostgreSQL is accepting connections — the cheap truth that the next stage's migration has a database to talk to.](../../../project-1/images/28-pg_isready.png)

If `psql --version` already worked and `pg_isready` says
`accepting connections`, the server is already running — continue at
Section 4.3.

> **NOTE:** Pick exactly one path. A native and a containerized
> PostgreSQL cannot both own port 5432.

## 4.3 Tool installation

**semgrep** — a SAST tool: reads source like a text file and flags
dangerous patterns, without running the app. Install with pipx, which
keeps Python programs out of your system Python:

**COMMAND:**
```bash
pipx install semgrep
```

**EXPECTED OUTPUT:** something like `installed package semgrep 1.173.0`.
If pipx says the package is already installed, that is success for our
purposes — proceed to the version check.

**COMMAND:**
```bash
semgrep --version
```

**gitleaks** — a secrets scanner: reads code and git history looking for
things shaped like passwords or API keys. Install the pinned version
8.30.1 — the version this guide's figures and evidence files were made
with. The default `aws-access-token` rule changed between versions, and
a consistent version keeps the comparison honest:

**COMMAND:**
```bash
curl -sL -o gitleaks.tar.gz https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz
tar -xzf gitleaks.tar.gz
```

macOS: `gitleaks_8.30.1_darwin_x64.tar.gz`; ARM builds use
`_darwin_arm64` / `_linux_arm64`.

Move the binary onto your PATH so you can type `gitleaks` directly, then
verify:

**COMMAND:**
```bash
sudo mv gitleaks /usr/local/bin/
gitleaks version
```

> **NOTE:** if `mv` says `cannot stat 'gitleaks': No such file or
> directory`, the binary is already installed — run only the version
> check. If you already have *some* gitleaks on your PATH, the version
> check tells you which one you will get. `brew install gitleaks` or
> `snap` are possible, but they ship whatever version the package
> carries — not 8.30.1. Pin the version: the output differences in
> Task 5 are the lesson.

**Double-check everything:**

**COMMAND:**
```bash
node --version && npm --version && semgrep --version && gitleaks version
```

This is the one place commands are joined, and only because it is a pure
check — a failure shows immediately.

## 4.4 Create the database

**Path A — Docker container:**

**COMMAND:**
```bash
docker run -d --name docutrust-postgres \
  -e POSTGRES_USER=docutrust \
  -e POSTGRES_PASSWORD=docutrust_dev_password \
  -e POSTGRES_DB=docutrust \
  -p 5432:5432 \
  postgres:16.4
```

`-d` detaches, `--name` names the container, the three `-e` flags set
the environment values the app expects (dev-only, same as
`.env.example`), `-p 5432:5432` publishes the Postgres port, and
`postgres:16.4` pins the image.

> **NOTE — re-running long after a restart:** a stopped container is not
> a failed one. `docker ps` lists only *running* containers — use
> `docker ps -a` to see the stopped one and `docker start
> docutrust-postgres` to bring it back. If the create command says the
> *name* is already in use, reuse the container (`docker start`) or
> delete it (`docker rm -f docutrust-postgres`) and re-run the create
> line. Never run two containers for the same database — they would
> fight over port 5432.

**Path B — native PostgreSQL:**

Create the role and database with the exact same credentials the app
expects:

**COMMAND:**
```bash
sudo -u postgres psql -c "CREATE ROLE docutrust WITH LOGIN PASSWORD 'docutrust_dev_password';"
sudo -u postgres psql -c "CREATE DATABASE docutrust OWNER docutrust;"
```

![Figure 4.1: Running the CREATE ROLE line a second time — "already exists" is not breakage; it confirms the first run's setup is still in place. Same for the database line.](../../../project-1/images/27-role-exists.png)

> **NOTE:** if the commands answer `already exists`, the database is
> already set up — continue. Re-running is safe.

## 4.5 Application setup

Install the application's dependencies (inside `docutrust`, from here on
every command runs from the project root):

**COMMAND:**
```bash
npm install
```

**EXPECTED OUTPUT:** summary ends with `added N packages`. Re-running is
a no-op check ("up to date"); deleting `node_modules` and re-installing
is the standard cure for a corrupted install.

Create the application's config file from the shipped template:

**COMMAND:**
```bash
cp .env.example .env.local
```

`.env.example` is safe to share; `.env.local` is your real copy — never
commit it. It contains one line:

```
DATABASE_URL="postgresql://docutrust:docutrust_dev_password@localhost:5432/docutrust"
```

username `docutrust`, password `docutrust_dev_password`, host
`localhost`, port `5432`, database `docutrust` — exactly the database
created in Section 4.4. That match is what makes everything work.

> **CAUTION:** a re-copy overwrites `.env.local` with the template. If
> you changed the file intentionally, keep a backup or do not re-copy.

Load the config into this terminal. The app does not read `.env.local`
by itself — Node only sees exported variables, so every terminal that
runs the app must load the file:

**COMMAND:**
```bash
set -a && source .env.local && set +a
```

> **CAUTION — why `set -a`?** A plain `source` sets only a *shell*
> variable; child programs like Node never see shell variables. The
> symptom of skipping it: `npm run migrate` or `npm start` fails with
> `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`
> (the app silently connects as your OS user with no password). `set -a`
> turns on auto-export for the source; `set +a` turns it off again.
> Because `source` re-reads the file, the line is safe to re-run and
> picks up edits.

Create the database tables (the project ships a migration runner):

**COMMAND:**
```bash
npm run migrate
```

**EXPECTED OUTPUT** on a fresh database:

```
Applying 0001_init.sql ... done
Migrations up to date
```

![Figure 4.2: npm run migrate a second time — nothing to apply, no error. The migration runner keeps a schema_migrations bookkeeping table of the files it already ran. This is the one part of the app that was idempotent from the start.](../../../project-1/images/24-migrate.png)

If the database was already set up, only `Migrations up to date`
prints — that is also success.

Start the application:

**COMMAND:**
```bash
node src/index.js
```

**EXPECTED OUTPUT:**

```
DocuTrust dev listening on 3000
```

The terminal is now blocked by the running app. Leave it open and use a
second terminal for the tasks below; stop the app with `Ctrl+C` when
done with a stage.

> **CAUTION — second instance:** `Error: listen EADDRINUSE: address
> already in use :::3000` means an instance is already running. Quit it
> (`Ctrl+C` in its terminal) or run the checkpoint's stop line —
> `pkill -f "node src/index.js" || true`. The checkpoint is the safe
> habit.
>
> ![Figure 4.3: The dead giveaway of a second instance — EADDRINUSE, address :::3000.](../../../project-1/images/29-eaddr-in-use.png)

---

# 5. Checkpoints & Rerun Procedure

Read this section once — it fixes re-running for the whole project.

## 5.1 The reset contract

All examples in this guide assume a **known starting state**: an empty
`documents` table with ids starting at 1. The first time a task runs,
that is naturally true. The second time — after a pause, a failed run,
or a skipped page — it is not: every re-pasted `POST /documents` adds
another row, ids keep climbing, and the numbers in the outputs stop
matching.

Every task therefore begins with a **checkpoint**: the state it assumes,
and the commands that establish it. The block is the same everywhere,
and every command in it is safe to run on any state:

**COMMAND:**
```bash
# 1. Stop the app if it's still running (a second instance would fail
#    with EADDRINUSE). Nothing means this prints nothing — that's fine.
pkill -f "node src/index.js" || true

# 2. Load the database credentials into THIS terminal. Node only sees
#    exported variables, which is why this line is needed.
set -a && . ./.env.local && set +a

# 3. Reset the data, not the schema: rows and the id sequence go back
#    to the beginning; the tables and their structure stay.
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"

# 4. Prove it worked before continuing (should print one row: 0).
psql "$DATABASE_URL" -c "SELECT count(*) FROM documents;"
```

![Figure 5.1: TRUNCATE documents, comments RESTART IDENTITY CASCADE — the whole data state of the dev database back to row zero, sequence reset, cross-table references dangling-safe via CASCADE.](../../../project-1/images/25-reset-truncate.png)

![Figure 5.2: The proof — count(*) is 0 before any work of a stage. Never skip the proof: it turns "I wonder why the numbers are odd" into an immediate answer.](../../../project-1/images/26-reset-count.png)

Why these exact choices:

- **`TRUNCATE … RESTART IDENTITY`, not `DROP DATABASE`** — the schema
  (tables, columns, the `schema_migrations` bookkeeping that
  `npm run migrate` uses) survives, so the app and its settings keep
  working. Only *data* and the id *sequence* return to zero. Deleting
  the database is heavier than needed and risks clobbering other work
  in the same PostgreSQL instance.
- **Stop the app first** — the app holds connections to the same
  database, and the next task's `npm start` must be the one that gets
  port 3000. Re-running `node src/index.js` while the old one is still
  up fails with `EADDRINUSE` (see the troubleshooting table).
- **Flags and configuration are read when the app starts** — that is why
  a checkpoint always restarts the app after a reset, rather than
  assuming a half-process saw the new settings.

## 5.2 Rerun procedure

**First run.** Follow the tasks in order from Section 6. The reset
contract holds naturally.

**Safe rerun.** Any task can be re-executed by running its checkpoint
first: stop the app, load the environment, truncate, prove count 0, then
restart the app. Scans (semgrep, gitleaks) are pure readers and can be
re-run at any time; their output depends only on the code state and
tool versions.

**Recovery after a partial failure.** If a task stopped halfway:
1. Run the task's checkpoint (stop app, reset data, prove empty).
2. Restart the app and resume at the failed step.
3. If the working tree was modified (e.g. an interrupted edit), `git
   status` shows it — commit it or `git checkout -- .`, then re-checkout
   the branch.

**Complete reset.** To restore the exact starting state of
`project1-starter`:

**COMMAND:**
```bash
git checkout project1-starter
git checkout -- .
npm install
```

followed by the checkpoint block in 5.1 (database) and the `.env.local`
copy from Section 4.5 if the file was lost.

> **WARNING:** `git checkout -- .` discards every uncommitted change in
> the working tree. There is nothing in this project worth keeping
> uncommitted — the deliberate artifacts (rule file, config) are
> committed on the branch.

## 5.3 Idempotency classification

Every command in this guide was reviewed against the question "what
happens if this runs twice?":

| Class | Operations | Rerun behavior |
|---|---|---|
| IDEMPOTENT | `npm run migrate`, `npm install`, `npm ci`, semgrep scans, gitleaks scans, `TRUNCATE … RESTART IDENTITY`, `pkill … \|\| true`, the `set -a && . ./.env.local` load line | Second run is a no-op or a clean re-assertion of the same state |
| CONDITIONALLY IDEMPOTENT | `docker run … postgres:16.4`, `CREATE ROLE` / `CREATE DATABASE`, `cp .env.example .env.local`, `pipx install semgrep`, gitleaks binary install | Second run fails with "already exists / in use" — that failure *is* the confirmation the state exists; reuse (`docker start`) or re-copy deliberately |
| NOT IDEMPOTENT | `POST /documents` (creates a row), the CI history rewrite (Task 10) | Creating data is the point; the checkpoint resets it. The history rewrite is a deliberate one-time operation, documented in Task 10 |

Where a command cannot be made idempotent, this guide documents the
rerun path instead — that is the checkpoint pattern.

---

# 6. Implementation Tasks

Every task begins with a checkpoint that establishes its known starting
state, per Section 5. Commands are shown as they were run; outputs show
the state they produced.

## Task 1 — Application Smoke Test

**Project Overview:** Smoke testing proves the application is alive and
behaving before any scanner is pointed at it. You cannot judge a
scanner finding without knowing what the code does when it runs.

**Project Objective:** Verify health, create/fetch/render/search flows
against the running app, and record the search endpoint's anomalous
response — the finding in disguise that Task 7 explains.

**Prerequisites:** Section 4 complete — app running on port 3000 from
`project1-starter`; `documents` table empty with the id sequence at 1.

**Checkpoint — Known Starting State:**

1. App running on port 3000, from `project1-starter`.
2. `documents` table empty, ids starting at 1.

If not sure, run:

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
set -a && . ./.env.local && set +a
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM documents;"
```

**EXPECTED RESULT:** the last command prints 0. Then start the app again
(`node src/index.js` in its own terminal). This is why the ids below
say exactly 1 and 2.

### Step 1.1 — Health check

**COMMAND:**
```bash
curl localhost:3000/healthz
```

**EXPECTED OUTPUT:**
```json
{"status":"ok","version":"dev"}
```

![Figure 6.1: The health check — the app says it is alive, and means it: the endpoint checks the database connection before answering.](../../../project-1/images/07-smoke-health.png)

### Step 1.2 — Create a document

**COMMAND:**
```bash
curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' -d '{"title":"Quarterly Report","body":"Q2 numbers"}' | jq .
```

**EXPECTED OUTPUT** (note the `id` the server assigned):

```json
{
  "id": 1,
  "title": "Quarterly Report",
  "body": "Q2 numbers",
  "created_at": "2026-08-27T12:33:41.000Z"
}
```

![Figure 6.2: The server assigned id 1. After a reset that is deterministic — always 1. Without the reset contract, it is whatever comes next.](../../../project-1/images/08-smoke-create.png)

From now on, capture ids — do not trust literals. The following
one-liner is the habit that keeps the guide's commands working on any
machine:

**COMMAND:**
```bash
DOC_ID=$(curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' -d '{"title":"Quarterly Report","body":"Q2 numbers"}' | jq -r .id) && echo "DOC_ID=$DOC_ID"
```

`$( ... )` runs the curl and captures its output; `jq -r .id` pulls just
the id field; `echo "DOC_ID=$DOC_ID"` prints it. `$DOC_ID` is used below.

### Step 1.3 — Fetch the document back

**COMMAND:**
```bash
curl localhost:3000/documents/$DOC_ID
```

**EXPECTED OUTPUT:** the same JSON as Step 1.2 — proving the document
was actually stored in the database.

![Figure 6.3: Round trip — the id the server printed is the key that reads it back.](../../../project-1/images/09-smoke-fetch.png)

### Step 1.4 — Render the document as an HTML page

**COMMAND:**
```bash
curl localhost:3000/documents/$DOC_ID/render
```

**EXPECTED OUTPUT:**
```html
<html><body><h1>Quarterly Report</h1><p>Q2 numbers</p></body></html>
```

![Figure 6.4: The document wrapped in HTML tags — the title in an h1 heading, the body in a p paragraph. This endpoint carries the XSS bug (Task 3).](../../../project-1/images/10-smoke-render.png)

### Step 1.5 — Search for a document

**COMMAND:**
```bash
curl "localhost:3000/documents/search?q=quarterly"
```

**EXPECTED OUTPUT** — hold on to it, because it is a surprise:

```json
{"error":"Database unavailable"}
```

![Figure 6.5: ?q=quarterly should match the document just created, but the app answers "Database unavailable". This is the endpoint with the SQL injection bug, and it is not supposed to work like this — the full story is Task 7. The quotes protect the ? and = from the shell.](../../../project-1/images/11-smoke-search.png)

> **CAUTION:** a search for a document that provably exists failing with
> a database error is not noise — it is a finding in disguise (Task 7).
> If search *does* return results, the checkout has the route order
> already fixed; the fixed behavior is verified in Task 9.

**TASK RESULT:** app alive; create/fetch/render proven; the search
anomaly recorded as evidence.

## Task 2 — SAST Baseline Scan

**Project Overview:** A SAST scan with the community default rulesets
establishes what generic tools find — and, decisively for this project,
what they miss.

**Project Objective:** Run semgrep's OWASP Top Ten and JavaScript
rulesets against `src/` and capture the real output. Expected: exactly
one finding, for the XSS. The SQL injection is invisible to these
rulesets — that is why the brief demands a custom rule (Task 4).

**Prerequisites:** Section 4 complete; `project1-starter` with a clean
tree.

**Checkpoint — Known Starting State:**

1. Branch `project1-starter`, working tree clean.
2. Static scans do not care about the database — but they do care about
   the code state.

**COMMAND:**
```bash
git status
git log --oneline -1    # should reference project1-starter's pre-fix commit
```

### Step 2.1 — Run semgrep with the default rulesets

**COMMAND:**
```bash
semgrep --metrics=off --config=p/owasp-top-ten --config=p/javascript src/
```

`--metrics=off` is hygiene (no anonymous stats); `--config=p/...`
selects the registry rulesets; `src/` is what gets scanned. The run
takes a few seconds; the rulesets are fetched and cached on first use.

**EXPECTED RESULT — one finding:**

![Figure 6.6: Real semgrep output against project1-starter — the default rulesets found one finding: the manually constructed HTML at src/routes/documents.js:104, and the summary "Ran 74 rules on 7 files: 1 finding".](../../../project-1/images/12-sast-default.png)

**What the finding is:** semgrep flags the render endpoint's HTML
construction (Step 1.4) — user data (`title`, `body`) interpolated into
HTML, the classic XSS pattern.

**What is missing:** the SQL injection. Zero findings for it. The
textbook SQL injection in the search endpoint — raw string
concatenation into a database query — is invisible to every generic
ruleset tried.

> **NOTE — Lesson 1:** generic rulesets do not know this stack. They do
> not model "template literal flows into `pool.query()`" for this
> specific JavaScript/PostgreSQL combination. The finding is there —
> the tool that catches it is the one written by hand (Task 4). This is
> exactly why the project brief demands a custom rule.

**VALIDATION:** save the output as evidence. The evidence directory
convention for this project's deliverables is
`evidence/01-sast-default/` (see the evidence index, Section 10).

## Task 3 — Confirm the XSS Finding by Hand

**Project Overview:** A scanner saying "this might be XSS" is a
hypothesis. This task proves it against the running app — the step
that separates scanner output from a confirmed vulnerability.

**Project Objective:** Create a document whose title is a `<script>`
tag, render it, and show the payload comes back unescaped —
exploitable in a victim's browser.

**Prerequisites:** Task 1 complete — app running, database in the state
Task 1 left it (ids 1 and 2).

**Checkpoint — Known Starting State:** app running; `documents` table
with ids 1 and 2. If `quarterly` documents are multiplying, reset as in
Task 1's checkpoint, then re-create one normal document and the script
document below.

**XSS in one sentence:** if an application prints user-provided text
into an HTML page without escaping it, a user can put a `<script>` tag
in their text and make it execute in *other people's browsers* when
they view the page.

### Step 3.1 — Create a document containing a script tag

**COMMAND:**
```bash
XSS_ID=$(curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' -d '{"title":"<script>alert(1)</script>","body":"hello"}' | jq -r .id) && echo "XSS_ID=$XSS_ID"
```

**EXPECTED OUTPUT:** `XSS_ID=2` (after a reset).

![Figure 6.7: The <script>alert(1)</script> document is stored, id 2 after the reset.](../../../project-1/images/30-xss-create.png)

> **CAUTION:** never test with a malicious payload on a system you do
> not own. This is the local dev app — it is fine. A real attacker
> would put a cookie-stealing script in place of `alert(1)`, the
> harmless "hello world" of XSS demos.

### Step 3.2 — Render it

**COMMAND:**
```bash
curl localhost:3000/documents/$XSS_ID/render
```

**EXPECTED OUTPUT:**
```html
<html><body><h1><script>alert(1)</script></h1><p>hello</p></body></html>
```

![Figure 6.8: The <script> tag came out of the app completely unescaped. If a victim opens that URL in a browser, the script executes on their machine. Confirmed: genuinely exploitable, not a scanner artifact. The fix (Task 8) makes the same request come back escaped (Task 9).](../../../project-1/images/14-confirm-xss-render.png)

**EXPECTED RESULT — the verdict:** the `<script>` tag is returned
**completely unescaped**. If a victim opens that URL in a browser, the
script executes on their machine. The scanner's hypothesis is
confirmed: genuinely exploitable, not a scanner artifact. Recorded as
evidence with the fix in `evidence/08-fixed-rerun/`.

## Task 4 — Custom SAST Rule

**Project Overview:** The project brief demands a rule that flags **any
SQL query string built with template-literal interpolation or string
concatenation instead of a parameterized query**. This is the task that
separates the project from a tutorial.

**Project Objective:** Write and prove the rule — it must catch the
seeded SQLi, generalize to four shapes of the same mistake, and leave
correct parameterized code alone.

**Prerequisites:** Task 2 complete; `project1-starter`, clean tree,
`src/` unmodified.

**Checkpoint — Known Starting State:** `project1-starter`, clean tree,
`src/` unmodified.

### Step 4.1 — The problem, in plain words

The dangerous code looks like this:

```js
const query = `SELECT ... WHERE title ILIKE '%${searchTerm}%'`;
pool.query(query);
```

`searchTerm` (user input) is glued straight into a database query. That
is a **SQL injection**: the user can break out of the quote marks and
rewrite the query — e.g. search for `' OR '1'='1` and make the database
return *everything*, or worse, run any SQL command.

Generic rulesets missed it because they do not know that "a template
literal that flows into `pool.query()`" is dangerous *in this stack*.
So the rule must catch **four different shapes** of the same mistake:

1. Direct interpolated call — `pool.query(`...${x}...`)`
2. Direct concatenated call — `pool.query("SELECT ... " + x)`
3. SQL string built by concatenation into a variable, passed later
4. SQL string built by template-literal interpolation into a variable,
   passed later — **the seeded shape**

### Step 4.2 — The rule

The rule lives at `semgrep/rules/docutrust-unsafe-sql-interpolation.yml`
(committed on the branch). Each shape is one `pattern:` block under
`pattern-either` (semgrep: "either of these patterns is a finding").
Shape 3 adds a `metavariable-pattern` check that the concatenation
starts with SQL keywords (`SELECT`, `INSERT`, `UPDATE`, …) so that
innocent code like `const greeting = "hello " + name` is **not**
flagged. Shape 4 (the template-literal one) uses `pattern-inside` to
look at the assignment block, then metavariable propagation to the
`.query()` call.

> **NOTE — the debugging trail, short version:** the first version
> combined all four shapes and found *nothing* — even on the seeded
> line. Controlled experiments showed that in this semgrep version,
> regex constraints against a metavariable bound to a **template
> literal** see empty content, while plain string literals work fine.
> So: regex on the literal for the concatenation shapes,
> `pattern-inside` for the template shape. That is the kind of
> tool-specific gotcha you only learn by experimenting.

### Step 4.3 — Run the rule against the app

**COMMAND:**
```bash
semgrep --metrics=off --config semgrep/rules/ src/
```

**EXPECTED RESULT — on the unfixed code: 1 finding, exit code 1:**

![Figure 6.9: The custom rule against project1-starter — the seeded SQLi at src/routes/documents.js:77 — "Ran 1 rule on 7 files: 1 finding". The file count matters: on main there are 12 files (later projects add files), on the starter there are 7.](../../../project-1/images/16-sast-custom-rule.png)

The exit code is what makes this usable: `--error` turns findings into a
non-zero exit, which is how the CI gate (Task 10) knows to fail.

**VALIDATION:**
```bash
semgrep --metrics=off --config semgrep/rules/ --error src/; echo "exit code: $?"
```

**EXPECTED RESULT:** `exit code: 1`.

### Step 4.4 — Prove the rule generalizes

A rule that only matches the one seeded line has not generalized the
pattern — a direct requirement of the brief. The throwaway test file
`evidence/05-custom-rule/test-cases.js` contains **5 positive shapes**
(all four branches plus an UPDATE variant) and **3 negative shapes** (a
correct parameterized query, a non-SQL interpolated greeting, a static
SQL string). The negatives are the proof that the difference between a
vulnerability and the *shape* of the code is understood.

**COMMAND:**
```bash
semgrep --metrics=off --config semgrep/rules/ --error src/ evidence/05-custom-rule/test-cases.js; echo "exit code: $?"
```

| Part | What it does |
|---|---|
| `--config semgrep/rules/` | use *our* rule file |
| `--error` | exit non-zero if any finding — how scripts and CI know a scan failed |
| `src/ evidence/05-custom-rule/test-cases.js` | scan the app *and* the test file |

**EXPECTED RESULT — exit code 1, 7 findings** (POSITIVE 1–5, the last
matched twice, plus the seeded line itself), all 3 negatives clean:

![Figure 6.10: Real run — "Ran 1 rule on 8 files: 7 findings", exit code 1. The finding at src/routes/documents.js:77 plus the test file's five positive shapes (the last matches twice) — and every negative case (parameterized query, greeting, static string) stayed clean.](../../../project-1/images/17-sast-rule-generalizes.png)

> **NOTE — Lesson 2:** writing a rule is 20% the rule and 80% proving
> it. The negative cases are what show the vulnerability is understood.

**TASK RESULT:** the rule catches the seeded SQLi, generalizes to all
positive shapes, and rejects the negatives. Evidence:
`evidence/05-custom-rule/`.

## Task 5 — Secrets Scanning with gitleaks

**Project Overview:** The application contains `src/config.js` with a
constant shaped exactly like an AWS access key. Pattern-matching tools
should find it — but the defaults quietly filter it out. This task
scans, triages, and proves.

**Project Objective:** Run gitleaks with its default config (expect:
no finding), then with the project config (expect: the key found and
documentation hits triaged to exactly one leak), then sweep the full
git history.

**Prerequisites:** `project1-starter`, clean tree, **gitleaks 8.30.1**
as installed in Section 4.3.

**Checkpoint — Known Starting State:** `project1-starter`, clean tree,
gitleaks 8.30.1 (verify with `gitleaks version`).

### Step 5.1 — The constant in question

`src/config.js` contains:

```js
const LEGACY_INTEGRATION_KEY = "AKIAIOSFODNN7EXAMPLE";
```

That is *shaped* exactly like an AWS access key: `AKIA` + 16 more
characters. It was put there on purpose — pattern-matching tools should
find it. Whether it is a real credential is Task 6. First, the scan.

### Step 5.2 — Scan with gitleaks' default config

**COMMAND:**
```bash
gitleaks detect --source .
```

| Part | What it does |
|---|---|
| `gitleaks` | the secrets scanner |
| `detect` | scan for secrets |
| `--source .` | scan the current folder (`.` = "here") |

![Figure 6.11: Real gitleaks 8.30.1 run — "INF no leaks found". The seeded key, sitting in plain view, not flagged.](../../../project-1/images/18-gitleaks-default.png)

**EXPECTED RESULT:** `INF no leaks found`. This is not a bug — it is
the lesson. In isolation (control experiment) the key alone in a fresh
repo is **not flagged**, while a random high-entropy `AKIA…` key
**is**. The rule was not broken — the *default rule's entropy
threshold* rejects the placeholder. AWS's example key is deliberately
low-entropy, and the default `aws-access-token` rule requires a minimum
entropy of 3.0 (real keys are random strings, high entropy;
placeholders like `EXAMPLE` are predictable, low entropy).

> **NOTE — version footnote, worth writing in the report:** on a
> gitleaks newer than 8.30.1, the default config often *does* flag this
> key — "leaks found: 23" has been seen on a newer install (the
> project's own docs and evidence quote the key dozens of times, and
> newer defaults do not filter the placeholder). Same phenomenon,
> different default: a "clean" scan is only clean if you know what your
> tool's defaults actually filter.

> **NOTE — Lesson 3:** default tool configs quietly filter out
> low-entropy credentials — exactly the ones attackers know how to use
> if you leave them in a repository.

### Step 5.3 — The project config

The engineering response is a project config file, `gitleaks.toml` at
the repository root, that pins the AWS rule **without the entropy
gate** and keeps the other useful defaults:

```toml
[[rules]]
id = "aws-access-token"
description = "AWS access token (entropy gate removed for the seeded placeholder key)"
regex = '''(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}'''
# + generic-api-key, private-key, password rules for sweep breadth
```

**COMMAND:**
```bash
gitleaks detect --source . -c gitleaks.toml
```

**EXPECTED OUTPUT — on the project as-shipped (config with the original
README/evidence allowlist):**

![Figure 6.12: Real gitleaks 8.30.1 run against the current tree — "WRN leaks found: 21". The seeded constant is in there — but so are twenty mentions in the project's own documentation: the walkthrough and the final report both quote AKIA… and the dev password, on this tree and in earlier commits.](../../../project-1/images/19-gitleaks-config-initial.png)

**The triage moment.** The key also appears in `README.md` and inside
the `evidence/` files — because those documents *describe* the finding.
Flagging them adds noise, so the config allowlists those paths with the
reason written into the config:

```toml
[allowlist]
description = "Documentation and evidence quote the seeded placeholder key and the dev password intentionally (Project 1 brief and deliverables). Triage, not hiding: the paths are scoped exactly, so a real key anywhere else is still flagged."
paths = ["README.md", "docs/", "Project-Requirement/", "evidence/"]
```

Allowlisting documented references — with the reason written down — is
**triage, not hiding**: the allowlist is scoped to those exact paths,
so a fresh key anywhere else is still flagged.

**To see it yourself:** read the `File : Line` column of the scan and
confirm each hit is a *documentation* line quoting the finding. The
machine-readable report makes the triage auditable:

**COMMAND:**
```bash
gitleaks detect --source . -c gitleaks.toml -f json -r /tmp/report.json; jq -r '.[] | "\(.RuleID) \(.File):\(.StartLine)"' /tmp/report.json
```

Now scan again — the only leak left is the real one:

![Figure 6.13: The same scan after the allowlist extension — "WRN leaks found: 1" — src/config.js:15, the seeded constant. The verdict on the real finding is unchanged: documentation hits are suppressed with a comment saying so, real hits are not.](../../../project-1/images/19-gitleaks-config.png)

**EXPECTED RESULT:** `WRN leaks found: 1` — `src/config.js:15`.

### Step 5.4 — The full-history sweep

Scanning the current code only misses secrets that were *deleted or
changed in past commits*. A secret that was committed and later removed
is still recoverable from git history — that is why the sweep scans
every commit ever made:

**COMMAND:**
```bash
gitleaks detect --source . -c gitleaks.toml --log-opts="--all"
```

`--log-opts="--all"` tells git to look at every commit, not just the
current files.

![Figure 6.14: Real sweep across 42 commits — exactly one leak, the seeded constant, in the commit that introduced it (685702f8).](../../../project-1/images/20-gitleaks-full-history.png)

**EXPECTED RESULT — exactly one leak across all history.** The
machine-readable output gives the exact commit:

**COMMAND:**
```bash
gitleaks detect --source . -c gitleaks.toml --log-opts="--all" -f json -r /tmp/history.json
jq -r '.[] | "\(.RuleID) \(.File):\(.StartLine) | commit \(.Commit)"' /tmp/history.json
```

**EXPECTED RESULT:** one line —
`aws-access-token src/config.js:15 | commit 685702f8…`. The "clean
elsewhere" claim is *proven*, not assumed.

> **NOTE — Lesson 4 (the dark one):** committed secrets live forever. A
> secret pushed to git is in the history even after the line is
> deleted — it appears again in Task 10, when the CI gate catches a
> real mistake.

**TASK RESULT:** default config misses the seeded key (entropy gate);
project config finds it; documentation hits triaged to exactly one
leak; full-history sweep proves one leak across 42 commits. Evidence:
`evidence/06-secrets/`.

## Task 6 — Live Secret Verification

**Project Overview:** Pattern matching says "this *looks* like an AWS
key." The brief demands proof of whether it **is** one. This is the
step that separates a scanner output from a security finding.

**Project Objective:** Hand the found key to AWS itself —
`sts:GetCallerIdentity`, AWS's own "who am I?" call — and let AWS's
identity service return the verdict.

**Prerequisites:** Task 5 complete (scan ran, key found). Network
required for this stage.

**Checkpoint — Known Starting State:** repository as left in Task 5.

### Step 6.1 — The approach

The cheapest real check that establishes identity is
`sts:GetCallerIdentity`. A live key answers with the AWS account
details. Anything else is rejected by AWS's identity service with a
specific error code.

### Step 6.2 — The verification script

The project includes `security/verify-credential.js`. It loads the
found key straight from `src/config.js` — the exact string the scanner
reported — configures an AWS STS client with it, and makes the call.
The script needs *some* secret key field to construct the client; a
clearly fake one is fine, because an unrecognized access key is
rejected *before* anything else happens.

The script keeps its own dependencies, so it gets its own install:

**COMMAND:**
```bash
cd security
npm install
cd ..
```

**COMMAND:**
```bash
node security/verify-credential.js
```

### Step 6.3 — The verdict

This makes a **real network call to AWS**. The output:

![Figure 6.15: Real network call to AWS sts:GetCallerIdentity against the found key. The key is inert: AWS itself says it does not exist in its identity service (InvalidClientTokenId).](../../../project-1/images/21-live-verification.png)

**EXPECTED RESULT:** the key is **inert**. It matches every pattern,
and AWS itself says it does not exist in its identity service
(`InvalidClientTokenId`).

> **NOTE — Lesson 5:** a scanner *finding* is a pattern match; a
> *security finding* is one that has been verified. This constant is
> cosmetic — documented, not a fix target. The brief fixes the two real
> vulnerabilities; this one is a documented track artifact. Evidence:
> `evidence/07-live-verification/`.

## Task 7 — Route Shadowing Discovery

**Project Overview:** The "Database unavailable" surprise from
Step 1.5 has a story, and the story changed how the project reads code:
the seeded SQLi existed in the code but was **unreachable through
normal routing**. A static scan flags the line; only running the app
shows it is shadowed.

**Project Objective:** Reproduce the two identical errors, derive the
route-ordering explanation, and record the cosmetic-vs-exploitable
judgment.

**Prerequisites:** `project1-starter`, app running, database in
post-reset state (Task 1's checkpoint).

**Checkpoint — Known Starting State:** `project1-starter`, app running,
database in post-reset state.

### Step 7.1 — A nonsense path

**COMMAND:**
```bash
curl localhost:3000/documents/abc
```

**EXPECTED OUTPUT:**
```json
{"error":"Database unavailable"}
```

![Figure 6.16: {"error":"Database unavailable"} for a nonsense path — because abc is not an integer id and the database rejects it.](../../../project-1/images/22-reachability-abc.png)

### Step 7.2 — A request that should work

**COMMAND:**
```bash
curl localhost:3000/documents/search
```

![Figure 6.17: The same error for /documents/search — a request that has a handler and should work.](../../../project-1/images/23-reachability-search.png)

### Step 7.3 — The analysis

Two completely different requests, one identical answer. That tells you
`/documents/search` is **never reaching the search handler at all**. In
Express, routes match in the order they are registered — and `GET /:id`
is registered *before* `GET /search`. The request for `/search` is
captured by `/:id`, which binds `id = "search"`, and the database
rejects `"search"` as an integer.

**The seeded SQLi existed in the code but was unreachable through
normal routing.** A static scan flags the line (it scans text, not
reachability); only running the app shows it was shadowed. That is a
"cosmetic vs. exploitable" distinction the tools cannot make — it is
the engineer's job. The finding is filed and fixed together with the
SQLi (Task 8).

> **NOTE — Lesson 6:** run the app before believing the scanner. And
> label every expected output with *which code state* it comes from —
> Tasks 8–9 show the same requests giving different answers on the
> fixed branch.

**TASK RESULT:** the search endpoint is shadowed by `/:id`; the
exploitable-by-construction SQLi is unreachable today and fixed with the
code (Task 8).

## Task 8 — Vulnerability Remediation

**Project Overview:** The actual job — fix both vulnerabilities for
real: a bound parameter for the SQLi, HTML escaping for the XSS, and a
route reorder that makes the search endpoint reachable.

**Project Objective:** Apply and review the code changes before
restarting the app. Runtime proof is Task 9.

**Prerequisites:** `project1-starter`, clean tree (Tasks 4–6 were scans
only, so nothing should be modified; verify with `git status`). The app
is stopped for the restart:

**Checkpoint — Known Starting State:** `project1-starter`, clean tree,
app stopped.

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
```

### Step 8.1 — Fix the SQL injection

**Before** — user input glued into the query text:

```js
const query = `SELECT id, title FROM documents WHERE title ILIKE '%${searchTerm}%'`;
const result = await pool.query(query);
```

**After** — a *bound parameter* (`$1`): the search term becomes **data**,
not SQL text. The database treats it as a plain string, so quotes and
SQL keywords in it have no power:

```js
const result = await pool.query(
  "SELECT id, title FROM documents WHERE title ILIKE $1",
  [`%${searchTerm}%`]
);
```

The route shadowing from Task 7 is fixed in the same change by
registering `/search` *before* `/:id` — without it, the endpoint (and
the fix) would be unreachable.

### Step 8.2 — Fix the XSS

**Before** — raw interpolation into the HTML response:

```js
res.send(`<html><body><h1>${title}</h1><p>${body}</p></body></html>`);
```

**After** — every interpolated value passes through an `escapeHtml()`
helper that turns `& < > " '` into their HTML entities (`&lt;` etc.),
so a script tag renders as *inert text*:

```js
res.send(`<html><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`);
```

### Step 8.3 — Read the diff before you trust it

**COMMAND:**
```bash
git diff src/routes/documents.js
```

![Figure 6.18: git diff after the fix — the SQLi bound-parameter change, the route reorder (search before /:id), and the escapeHtml calls. This is what "fixed" means — read it before restarting the app.](../../../project-1/images/35-fix-diff.png)

**TASK RESULT:** both fixes applied to `src/routes/documents.js`.
Commit the work or carry it to Task 9; Task 9 restarts the app from
this (now fixed) code state.

## Task 9 — Prove the Fixes at Runtime

**Project Overview:** "It compiles" is not "fixed." The proofs below
re-run the exact requests that were dangerous in Tasks 1 and 3 and show
they now behave correctly — then re-run the scanner and show the
finding is gone.

**Project Objective:** Search works; the SQLi payload returns an empty
array; the XSS payload renders escaped; the custom rule is clean.

**Prerequisites:** fixes applied (Task 8), app stopped.

**Checkpoint — Known Starting State:** fixes applied, app stopped.
Restart the app (this time from the branch with the fixes), then reset
the data — the proofs expect ids 1 and 2 again:

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
set -a && . ./.env.local && set +a
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"

# in a second terminal:
node src/index.js
```

Then re-create the two documents (id 1 = "Quarterly Report", id 2 = the
script tag):

**COMMAND:**
```bash
DOC_ID=$(curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' -d '{"title":"Quarterly Report","body":"Q2 numbers"}' | jq -r .id) && echo "DOC_ID=$DOC_ID"
XSS_ID=$(curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' -d '{"title":"<script>alert(1)</script>","body":"hello"}' | jq -r .id) && echo "XSS_ID=$XSS_ID"
```

### Step 9.1 — Search works now

**COMMAND:**
```bash
curl "localhost:3000/documents/search?q=quarterly"
```

![Figure 6.19: After the route-order fix, /documents/search reaches its handler and returns the result.](../../../project-1/images/31-search-works.png)

### Step 9.2 — The SQL injection attempt

**Important curl detail:** a URL cannot contain raw spaces or quotes —
they must be *percent-encoded* (`%20` is a space, `%27` is a single
quote). This is what the browser does to your address bar
automatically; here it is done by hand:

**COMMAND:**
```bash
curl "localhost:3000/documents/search?q=quarterly%27%20OR%20%271%27%3D%271"
```

(Decoded, that is `q=quarterly' OR '1'='1` — the classic "show me
everything" injection.)

**EXPECTED OUTPUT:** an **empty array** — the database searched for the
literal text `quarterly' OR '1'='1`, found nothing, and returned
nothing. If the injection were still live, this would return *every*
document.

![Figure 6.20: [] — the bound parameter treated the payload as text. On the unfixed code, exactly this URL returns the whole table.](../../../project-1/images/32-sqli-attempt.png)

### Step 9.3 — The XSS attempt

**COMMAND:**
```bash
curl localhost:3000/documents/$XSS_ID/render
```

**EXPECTED RESULT — compare with Figure 6.8:**

```html
<html><body><h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1><p>hello</p></body></html>
```

![Figure 6.21: The raw <script> is gone — it is now &lt;script&gt;, which a browser displays as text but never executes. Escaped, inert, fixed.](../../../project-1/images/33-xss-render-escaped.png)

### Step 9.4 — The rerun (what "fixed for real" means)

**COMMAND:**
```bash
semgrep --metrics=off --config semgrep/rules/ --error src/; echo "exit code: $?"
```

**EXPECTED RESULT — 0 findings, exit code 0:**

![Figure 6.22: Real rerun after the fixes — 0 findings, exit code 0. The SQL injection finding is gone.](../../../project-1/images/34-semgrep-rerun.png)

**One flag remained** from the *default* ruleset: `raw-html-format`
still points at the render line even though the output is escaped.
Triage: **false positive**. The rule heuristically flags *any* manual
HTML construction with interpolation and cannot model that
`escapeHtml()` sanitizes the data — and the runtime proof above
(Step 9.3) shows no execution is possible. It is documented instead of
suppressed (`evidence/08-fixed-rerun/`). That is the "cosmetic vs.
genuinely exploitable" judgment call the brief grades.

**TASK RESULT:** three runtime proofs (search works, injection inert,
XSS escaped) plus a clean scanner rerun. Evidence:
`evidence/08-fixed-rerun/`.

## Task 10 — The CI Gate, Proven

**Project Overview:** CI = Continuous Integration: a pipeline that runs
automatically on every push to the repository (here, GitHub Actions).
The point of this task is to make the checks from Tasks 2–6 run on
every commit forever, so a new vulnerability or secret gets *blocked* —
not just noticed.

**Project Objective:** Wire the two enforcement jobs, prove green on
good code, and prove red on a deliberately injected violation.

**Prerequisites:** your fixes committed; a repository on GitHub (your
**own fork**). This is the one task that genuinely cannot be
local-only: `git checkout main`, push to the fork, watch the runs.

**Checkpoint — Known Starting State:** fixes committed; `main` checked
out with the finished CI config; a fork on GitHub to push to.

### Step 10.1 — What the gate runs

`ci.yml` ships with a deliberate placeholder under the build job,
waiting for exactly this project. The two enforcement jobs:

| Job | What it runs | How it blocks |
|---|---|---|
| `sast` | semgrep with the custom rule | `--error` → any finding fails the build |
| `secrets-scan` | gitleaks with `gitleaks.toml`, full history | any leak fails the build |

### Step 10.2 — Run 1: green on the fixed code

Push `main`. CI: `build-and-test` ✓, `sast` ✓, `secrets-scan` ✓ — and
because CI is an API too, it does not need the web UI to be read:

**COMMAND:**
```bash
gh run list --workflow ci.yml -L 6
```

![Figure 6.23: Real gh run list output — green runs on main, plus the red ones this task is about. The run IDs are what the next commands reference.](../../../project-1/images/36-ci-run-list.png)

**COMMAND:**
```bash
gh run view 32167821478
```

![Figure 6.24: Real gh run view of the green main run — build-and-test, sast, secrets-scan — three jobs, three checkmarks. Run the command against your own latest run ID.](../../../project-1/images/37-ci-green.png)

> **NOTE:** the run ID above belongs to the original run. Replace it
> with your own: `gh run list -L 3` first.

### Step 10.3 — The gate catching a real mistake

Run 1 actually **failed first** — and that is evidence too. The secrets
gate flagged the verification script itself: `AKIAIOSFODNN7EXAMPLE`
had been written into the script's output message instead of using the
constant. **The gate caught a real mistake, not just the seeded one** —
the whole point of a gate. Fix: use the constant, not the literal.

But that literal was already in a commit — and once committed, a
full-history scan flags it forever. This is Lesson 4 ("committed
secrets live forever") in the flesh. The correct response: **rewrite
the history so it never existed** — amend the evidence commit (replace
the script file, keep the message), rebase the follow-up commits on
top, verify locally that the full-history scan is clean, and force-push
the rewritten `main`. Run 2: all green.

> **WARNING:** rewriting history is only safe when the conditions hold
> exactly as here — a private repository, no collaborators, history
> minutes old. On shared repositories the response is the opposite:
> rotate the secret, never rewrite.

### Step 10.4 — Run 2: red on the violation branch (the deliverable)

The actual proof. From clean `main`, a test branch carrying a **fresh**
seeded violation — a new SQL string concatenation
(`src/routes/legacy.js`) and a new credential-shaped constant
(`src/legacy-config.js`) — opened as a pull request:

```
X sast           → semgrep.rules.docutrust-unsafe-sql-interpolation: Findings: 2 (2 blocking)
X secrets-scan   → WRN leaks found: 1
✓ build-and-test
```

**CI blocked it. Both gates red on real GitHub Actions, with real
output** (saved in
`evidence/09-ci-gate/run2-violation-PR-FAILED-both-gates.txt`). Close
the PR and delete the branch — the gates stay; the violation does not.

![Figure 6.25: Real gh run view of a failed run — sast passed but secrets-scan failed — the exact shape of the gate catching a real mistake. On your fork, find the failed run with gh run list --status failure.](../../../project-1/images/38-ci-red.png)

> **NOTE — Lesson 7:** a gate is only a gate if it can block. Green on
> good code is easy; red on bad code is the proof. Evidence:
> `evidence/09-ci-gate/`.

## Task 11 — Final Report & Handoff

**Project Overview:** The project ends with a report that ties
everything together for the track.

**Project Objective:** Produce `docs/project-1/final-findings-report.md`
— every finding with its cosmetic-or-exploitable verdict, what the live
check proved, what CI now enforces — plus the handoff to Project 2
(SCA).

**Prerequisites:** Tasks 1–10 complete.

The report covers:

- The SQL injection: caught by the custom rule, unreachable via normal
  routing until the route reorder, now parameterized and clean.
- The stored XSS: confirmed by hand, escaped, proven inert at runtime,
  with the remaining default-rule flag triaged as a false positive.
- The AWS-key-shaped constant: found by the project config, proven
  inert by AWS STS itself, documented as a track artifact.
- The CI gates: `sast` and `secrets-scan`, proven green on the fixed
  code and red on the violation branch.
- **The Project 2 handoff:** the deliberately outdated `lodash@4.17.15`
  pin (confirmed by `npm audit`: prototype pollution, command
  injection, ReDoS), the one `_.cloneDeep` usage it exists for, and
  where the SCA stage slots into the same pipeline.

**TASK RESULT:** the report is the deliverable that hands the verified
state to Project 2.

---

# 7. Security Findings & Fixes

## 7.1 Findings summary

| Finding | Tool | Result | Verified? | Action |
|---|---|---|---|---|
| SQL injection in `/documents/search` | semgrep, custom rule | 1 finding (`documents.js:77`) | Yes — code-level confirmed; route shadowing made it unreachable (Task 7) | Fixed — bound parameter + route reorder (Task 8) |
| Stored/reflected XSS in `/documents/:id/render` | semgrep, default rulesets | 1 finding (`documents.js:104`) | Yes — confirmed by hand, payload returned unescaped (Task 3) | Fixed — `escapeHtml()` on all interpolated values (Task 8) |
| `AKIAIOSFODNN7EXAMPLE` in `src/config.js` | gitleaks, project config | 1 leak (default config: 0) | Yes — proven inert via AWS STS `InvalidClientTokenId` (Task 6) | Documented, no fix (track artifact) |
| `raw-html-format` flag on the render line (after fix) | semgrep, default rulesets | 1 flag | No — false positive: cannot model `escapeHtml()` sanitization; runtime proof shows no execution (Step 9.4) | Documented, not suppressed |

Scanner output alone is not proof of exploitability. Every finding
above was either verified against the running application, against
AWS, or both — the table's "Verified?" column is the discipline.

## 7.2 Fix record — SQL injection

1. **Vulnerability:** SQL injection in `GET /documents/search` — user
   input interpolated into the query text.
2. **Evidence:** custom rule finding at `src/routes/documents.js:77`
   (Figure 6.9); search endpoint behavior observed in Steps 1.5 and 7.2.
3. **Root cause:** the query string was built with template-literal
   interpolation — `SELECT … ILIKE '%${searchTerm}%'` — making user
   input executable SQL text. Additionally, `GET /search` was
   registered after `GET /:id`, so the handler was unreachable through
   normal routing (Task 7).
4. **Remediation:** parameterized query with a bound parameter (`$1`);
   route order corrected (`/search` before `/:id`).
5. **Code change:** `pool.query("SELECT … ILIKE $1", [`%${searchTerm}%`])`
   (Figure 6.18).
6. **Validation:** the payload `q=quarterly' OR '1'='1` returns an
   empty array (Figure 6.20); search returns the created document
   (Figure 6.19); custom rule rerun: 0 findings, exit 0 (Figure 6.22).
7. **Security result:** the search term is data, not SQL text; the
   endpoint is reachable and safe. The CI `sast` gate enforces the
   rule from now on.

## 7.3 Fix record — stored/reflected XSS

1. **Vulnerability:** stored/reflected XSS in `GET
   /documents/:id/render` — document title/body printed into HTML
   without escaping.
2. **Evidence:** default-ruleset finding at `documents.js:104` (Figure
   6.6); manual confirmation — a `<script>alert(1)</script>` title
   rendered unescaped (Figure 6.8).
3. **Root cause:** raw interpolation of user data into the HTML
   response — `res.send(`<html>…${title}…` )`.
4. **Remediation:** an `escapeHtml()` helper converting `& < > " '` to
   their HTML entities on every interpolated value.
5. **Code change:** both interpolations wrapped — `escapeHtml(title)`,
   `escapeHtml(body)` (Figure 6.18).
6. **Validation:** the identical request now returns
   `&lt;script&gt;alert(1)&lt;/script&gt;` — inert text (Figure 6.21).
7. **Security result:** a stored payload renders as text and cannot
   execute in a victim's browser. The remaining default-rule flag
   (`raw-html-format`) is a proven false positive (Step 9.4).

## 7.4 Inert finding — the AWS-key-shaped constant

`src/config.js:15` holds `LEGACY_INTEGRATION_KEY =
"AKIAIOSFODNN7EXAMPLE"` — AWS's **published example key**, shaped
exactly like a real access key. Three layers of evidence:

1. The default gitleaks rule rejects it (entropy gate ≥ 3.0 — a
   control experiment with a random high-entropy `AKIA…` key *was*
   flagged), so the project config pins the rule without the gate
   (Task 5).
2. The full-history sweep finds exactly one occurrence, in the commit
   that introduced it — no historical exposure (Task 5).
3. **The verdict layer:** AWS itself answers `InvalidClientTokenId`
   when handed the key — it does not exist in AWS's identity service
   (Task 6).

**Verdict:** cosmetic. Documented in the findings report as a track
artifact; not a fix target.

## 7.5 Route shadowing — the tool-blind finding

The seeded SQLi was present in the source but unreachable: `GET /:id`
matched `/documents/search` first and the handler never ran. No static
tool can see this — scanners read text, not route tables. Only running
the app showed both requests answering identically (Task 7). Resolved
by the route reorder in Task 8. It is the standing example of why this
project verifies scanner findings at runtime.

---

# 8. CI/CD

## 8.1 Pipeline stages

Workflow `ci.yml`, GitHub Actions. Every push to `main` and every pull
request runs all three jobs:

| Stage | Purpose | Tool | Input | Output | Failure condition |
|---|---|---|---|---|---|
| `build-and-test` | Application builds and tests pass | Node.js on ubuntu-latest | repository | green build | build/test failure |
| `sast` | No known vulnerability patterns | semgrep with `semgrep/rules/` | `src/` | finding count | any finding (`--error` → non-zero exit) |
| `secrets-scan` | No credentials in tree or history | gitleaks with `gitleaks.toml`, full history (`--log-opts="--all"`) | repository + git history | leak count | any leak |

The enforcement mechanism in both security jobs is a non-zero exit
code: the tool fails the job, the job fails the workflow, the workflow
blocks the merge. A finding cannot merge.

## 8.2 Gate proof

The gates are only a gate if they can block. Three pieces of evidence:

1. **Green on good code** — `main` run: three jobs, three checkmarks
   (Figure 6.24).
2. **The gate caught a real mistake** — the secrets gate flagged a
   literal `AKIA…` written into the verification script's output
   message instead of the constant. The committed literal was removed
   by rewriting the history (amend + rebase + force-push — safe here:
   private repo, no collaborators, minutes old); Run 2 green
   (Step 10.3).
3. **Red on bad code** — a branch carrying a fresh SQL concatenation
   and a fresh credential-shaped constant, opened as a PR: both gates
   red, `build-and-test` green, real output saved
   (`evidence/09-ci-gate/run2-violation-PR-FAILED-both-gates.txt`).
   The PR was closed and the branch deleted (Figure 6.25).

---

# 9. Troubleshooting

Separated into first-time setup and re-run/recovery — the traps differ.

## 9.1 First-time setup

| Error / Symptom | Cause | Resolution | Related step |
|---|---|---|---|
| `command not found` | The tool is not installed (or not on `PATH`) | Install it: Node/npm — 4.3, PostgreSQL — 4.2, semgrep — 4.3, gitleaks — 4.3 | 4.2–4.3 |
| `docker ps` prints no table | Docker service not running | `sudo service docker start`, or add user to `docker` group and log out/in | 4.2 |
| `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` | `DATABASE_URL` never reached Node | Re-run the load line: `set -a && source .env.local && set +a` | 4.5 |
| `already exists` from the database setup commands | The database/user already exists | That is success — continue | 4.4 |
| `ERROR: role ... already exists` after `CREATE ROLE` | The role from the first run is still there | That is success — continue (Figure 4.1) | 4.4 |
| `Error: listen EADDRINUSE address already in use :::3000` | An app instance is already running | `Ctrl+C` it, or re-run the checkpoint's `pkill -f "node src/index.js"`; never fix by editing code | 4.5 |
| `gh run view` says "no run found" | A run ID from this guide was used | Replace it with your own: `gh run list -L 3` first | 10.2 |
| Screenshot shows more/different `Runner` lines than Figure 6.6 | semgrep's registry rules and your version differ | The shape (1 finding at the render line, SQLi missing) is what matters, not exact wording | 2.1 |

## 9.2 Re-run / recovery

| Error / Symptom | Cause | Resolution | Related step |
|---|---|---|---|
| `Error: No such file or directory` from `git checkout` with a half-finished stage | Working tree has uncommitted changes from a previous stage | `git status` to see them; commit or `git checkout -- .` and retry | 4.1 |
| A different number of results than in the examples (e.g. two Quarterly Reports) | Database reset off-schedule — rows from a previous run survived | Re-run the stage's checkpoint (`TRUNCATE …`); never edit data by hand in a way you cannot explain | 5.1 |
| `Migrations up to date` without an "Applying …" line | The tables already exist | That is success | 4.5 |
| `INF no leaks found` from gitleaks (default config) | That is the pinned version: the default rule's entropy gate skips the placeholder | The project config (`gitleaks.toml`) catches it anyway | 5.2 |
| `WRN leaks found: 21` (or any number > 1) from the project config | The findings beyond the first are documentation quoting the key | Triage: extend the allowlist with the docs paths, with a comment saying why | 5.3 |
| gitleaks binary `mv` fails with `cannot stat` | The binary is already installed | Re-run only the version check | 4.3 |
| Semgrep run with a newer version gives different wording | semgrep updates fast | Compare the pattern of the result, not exact wording | 2.1 |

---

# 10. Evidence Index

Every evidence directory on `project1-starter` is the raw capture
backing a task; the finished versions live under `evidence/project-1/`:

| Evidence | Deliverable |
|---|---|
| `evidence/01-sast-default/` | Tasks 2–3 — default SAST, XSS confirmed, SQLi missed |
| `evidence/05-custom-rule/` | Task 4 — custom rule + generalization proof (test-cases.js) |
| `evidence/06-secrets/` | Task 5 — secrets scan, full-history sweep |
| `evidence/07-live-verification/` | Task 6 — live check: `InvalidClientTokenId` |
| `evidence/08-fixed-rerun/` | Tasks 8–9 — fixes, runtime proof, clean rerun, FP triage |
| `evidence/09-ci-gate/` | Task 10 — gate caught the literal; violation PR blocked |
| `docs/project-1/final-findings-report.md` | Task 11 — report + Project 2 handoff |
| `docs/project-1/images/` | Figures 3.1–6.25 — real captures of the tool outputs |

Every figure in this guide is a real capture from a real terminal
running the exact command above on the starter branch. The
history-sweep and verification figure captions name the tool version so
the runs can be reproduced with the same version.

---

# 11. Final Verification

Run this checklist before declaring the implementation complete:

**Environment**
- [ ] `node --version && npm --version && semgrep --version && gitleaks version` all print versions (gitleaks 8.30.1)
- [ ] Branch `project1-starter`, working tree clean (`git status`)
- [ ] PostgreSQL accepting connections (`pg_isready`)
- [ ] `.env.local` exists and matches `.env.example`

**Application**
- [ ] `curl localhost:3000/healthz` → `{"status":"ok","version":"dev"}`
- [ ] Create → fetch → render round trip works on ids 1 and 2
- [ ] `/documents/search?q=quarterly` returns the document (fixed behavior)

**Security**
- [ ] Custom rule: 0 findings, exit 0 on fixed code (`semgrep --config semgrep/rules/ --error src/`)
- [ ] gitleaks project config: exactly 1 leak (`src/config.js:15`), triage documented
- [ ] Full-history sweep: exactly 1 leak, commit `685702f8…`
- [ ] Live check done: AWS answers `InvalidClientTokenId` for the found key
- [ ] XSS payload renders escaped (`&lt;script&gt;`)
- [ ] SQLi payload returns `[]`
- [ ] `raw-html-format` flag documented as a false positive, not suppressed

**CI/CD**
- [ ] `main` pushed to fork; last run green: `build-and-test`, `sast`, `secrets-scan`
- [ ] Violation PR proven red on both gates; PR closed, branch deleted

**Evidence**
- [ ] Evidence directories 01–09 saved and complete
- [ ] `docs/project-1/final-findings-report.md` written, with the Project 2 handoff (lodash pin, `_.cloneDeep` usage, SCA slot in the pipeline)
