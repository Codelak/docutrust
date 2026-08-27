# DocuTrust Walkthrough — SAST, Secrets Scanning, and Live Secret Verification

*A beginner's guide to how I carried out Project 1 of the DevSecOps track on
DocuTrust. Every command below actually ran, and every screenshot below is a
real capture of that command on a real terminal — not a drawing, not the
tool's documentation page. Evidence files are cited along the way. The guide
assumes a Bash terminal (macOS, Linux, or WSL2 on Windows).*

---

## Starting from this repo (not from the course handout)?

This repo holds the **finished** Project 1 — on `main`, both bugs are
already fixed and the CI gates already exist. To do the project yourself,
start on the `project1-starter` branch instead: it is the same app *before*
the fixes, exactly as this guide assumes, and it carries this walkthrough
with it.

```bash
git checkout project1-starter
```

**Before every `git checkout` in this guide, check that your working tree
is clean** — a checkout silently refuses when a tracked file has local
changes, and the error ("Your local changes… would be overwritten") sounds
alarming when it's actually just housekeeping:

```bash
git status
```

The line `nothing to commit, working tree clean` is the green light. If it
isn't clean, either commit your work or throw it away:

```bash
# keep it:  git add -A && git commit -m "wip"
# or discard it (works, then re-checkout):
git checkout -- .
```

Work through Stages 1–11 there. For Stage 12 (the CI gate), come back
to `main` — it holds the finished CI config — and push to **your own
GitHub fork** so GitHub Actions runs for you:

```bash
git checkout main
```

---

## Resetting between runs (read this once — it fixes re-running)

All the examples in this guide assume a **known starting state**: an empty
`documents` table with ids starting at 1. The first time you run a stage that
creates data, that's naturally true. The second time — after a pause, a
failed run, or a page you skipped — it is not: every re-pasted
`POST /documents` adds another row, ids keep climbing, and the numbers in
the outputs below stop matching.

So every stage begins with a **checkpoint**: what state it assumes, and the
three commands that establish it. They are standard tools, and you can type
them without understanding anything advanced:

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

![A checkpoint in action](images/25-reset-truncate.png)

*Figure 1 — `TRUNCATE documents, comments RESTART IDENTITY CASCADE;` —
the whole data state of the dev database back to row zero, sequence
reset, cross-table references now dangling-safe via `CASCADE`.*

![Proof the reset worked](images/26-reset-count.png)

*Figure 2 — the proof: `count(*)` is 0 before any work of a stage. Never
skip the proof — it turns "I wonder why the numbers are odd" into an
immediate answer.*

Why these exact choices:

- **`TRUNCATE … RESTART IDENTITY`, not `DROP DATABASE`** — the schema
  (tables, columns, the `schema_migrations` bookkeeping that `npm run
  migrate` uses) survives, so the app and its settings keep working. Only
  *data* and the id *sequence* return to zero. Deleting the database is
  heavier than needed and risks clobbering other work in the same PG
  instance.
- **Stop the app first** — the app holds connections to the same database;
  and more importantly, the *next* stage's `npm start` must be the one that
  gets port 3000. Re-running `node src/index.js` while the old one is still
  up fails with `EADDRINUSE` (see the troubleshooting table).
- **Flags and configuration are read when the app starts** — that's why a
  checkpoint always restarts the app after a reset, rather than assuming a
  half-process saw the new settings.

---

## The project in one paragraph (read this first)

You are given an app — **DocuTrust**, a small web API (a program other
programs can talk to over the network), built on Node.js and Express (a
popular Node.js web framework), storing documents in PostgreSQL. Nobody
has ever scanned it for security problems. Your job is to do the things a
real DevSecOps engineer does:

1. Run real security tools against it and **capture the real output**.
2. Write a **custom rule** that catches a vulnerability the built-in rules
   miss.
3. Prove whether a suspicious string is **actually a working credential** or
   just something that *looks* like one.

The app ships with three interesting things hidden in its code (the brief
calls them "seeded findings" — they were put there on purpose for you to
find):

| Seeded finding | What it is | Is it a real problem? |
|:---|:---|:---|
| SQL injection in the search endpoint | A search box that pastes your text directly into a database query | ✅ Real — must be fixed |
| Stored/reflected XSS in the render endpoint | A page that prints document titles/body into HTML without escaping | ✅ Real — must be fixed |
| An "AWS key" constant (`AKIAIOSFODNN7EXAMPLE`) | Shaped exactly like a real AWS key, but it's AWS's **published example key** | ❌ Not real — but you must *prove* that |

> **What is a "finding"?** A finding is a message from a scanner saying
> "I saw something suspicious at this line of code." A finding is **not**
> automatically a vulnerability — part of this project is learning to
> tell the difference.

Here is the stage map for this whole walkthrough:

| Stage | What you do | Why |
|:---|:---|:---|
| 1–2 | Install the tools, start the database | You need a working setup |
| 3–4 | Run the app and smoke-test it | You can't judge a scanner finding without knowing what the code does when it runs |
| 5 | Confirm the XSS by hand | See what generic tools catch — and prove it's real |
| 6 | Write a custom SAST rule | Catch what the defaults miss |
| 7–8 | Scan for secrets, verify the "key" live | Pattern match ≠ proof |
| 9 | The reachability discovery | The surprise that changed how you read code |
| 10–11 | Fix both vulnerabilities, prove the fixes | The actual job |
| 12–13 | Wire the CI gate, write the report | Make it stick |

*Plan for roughly 60–90 minutes end to end.*

---

## Stage 1 — Install the tools you need

### A note about commands in this guide

- Every command is written **on its own line**, with a short explanation
  before or after it and (usually) the output you should see after it.
- Paste **one command at a time**, look at what it printed, then move on.
  Do not copy-paste a whole block — the whole point of this guide is that
  you understand every step.
- A `#` after a command is a **comment** — it explains what the command
  does. You don't type the comment.
- `$` at the start of a line just means "this is a terminal prompt". Don't
  type the `$`.
- In the Word version of this guide, every command is printed in **red** —
  those are the lines you type. Everything else (explanations, file
  contents, tool output) stays black.

### Step 1.1 — Check what you already have

Open a terminal and run these **check** commands one by one. Each one just
prints a version number. If a tool is missing, you'll see an error like
`command not found` — that's fine, the next step installs it.

```bash
node --version
```

You should see something like `v20.20.0`.

```bash
npm --version
```

You should see something like `11.18.0`.

```bash
docker --version
```

This might say `command not found` — that's OK, keep reading.

```bash
psql --version
```

Same deal: a version number, or `command not found`.

```bash
curl --version
```

curl is usually already installed. You'll use it to talk to the app.

### Step 1.2 — Install Node.js and npm (if missing)

DocuTrust is a Node.js app, so you need Node to run it. npm is Node's
package manager — it downloads the app's dependencies (the libraries it
uses, like Express).

The easiest way for beginners is the official installer from
[nodejs.org](https://nodejs.org) — download the "LTS" version and run the
installer like you would any program. After installing, open a **new**
terminal and re-check:

```bash
node --version
```

```bash
npm --version
```

Both should print versions now. (If you prefer the command line, the common
method is called **nvm** — Node Version Manager. It's optional; don't let
tool setup become a project of its own.)

### Step 1.3 — Install PostgreSQL

DocuTrust stores its documents in PostgreSQL (a database). There are two
ways to get one — **pick one path**:

**Path A — PostgreSQL in Docker (recommended, cleanest)**

Docker runs "containers": small, isolated virtual machines that you can
create and delete in one command. This is the easiest way to get a database
without installing anything into your system.

If `docker --version` said `command not found`, install Docker first.
On Windows/WSL2 install **Docker Desktop** (from docker.com). On Ubuntu:

```bash
sudo apt-get install -y docker.io
```

Then check the Docker daemon (background service) is running:

```bash
docker ps
```

If this prints a table of containers, Docker works. (On Ubuntu you may need
`sudo service docker start` first, or add your user to the `docker` group
and log out/in.)

**Path B — PostgreSQL installed natively (no Docker)**

On Ubuntu:

```bash
sudo apt-get install -y postgresql
```

This installs and starts the PostgreSQL server. Check it's running:

```bash
pg_isready
```

![pg_isready says the server is up](images/28-pg_isready.png)

*Figure 3 — `pg_isready` — the cheap truth about whether PostgreSQL is
accepting connections, and therefore whether the next stage's
`npm run migrate` has a database to talk to.*

*(If you already have PostgreSQL running — for example `psql --version`
worked and `pg_isready` says `accepting connections` — you're done here.
Jump to Stage 2.)*

### Step 1.4 — Install semgrep

**What is semgrep?** It's a *SAST* tool. **SAST** stands for **Static
Application Security Testing** — "static" means it reads the source code
like a text file and looks for known-dangerous patterns, without ever
running the app. Think of it as a very strict proofreader for security
mistakes. It's the tool that will catch the XSS bug.

semgrep is a Python program, and the cleanest way to install it is with
**pipx** (a tool that installs Python programs into their own little
folder so they don't clash with your system Python):

```bash
pipx install semgrep
```

> **Re-running:** if pipx says the package "is already installed" — that's
> success for our purposes; you're not installing a fresh instance, you're
> checking it's there. Move on to the version check.

You should see it print something like `installed package semgrep 1.173.0`.

Check it works:

```bash
semgrep --version
```

You should see something like `semgrep 1.173.0`. semgrep updates fast; your
version number will differ from mine, and the *output text* of a scan may
differ slightly — the pattern of "1 finding for the XSS" is the thing to
compare, not exact wording.

### Step 1.5 — Install gitleaks

**What is gitleaks?** It's a *secrets scanner*. It reads your code (and
your git history) looking for things that look like passwords or API keys:
`AKIA...`, `sk-...`, `password=...`, and hundreds of other patterns. It
will find the seeded AWS-key-shaped constant.

gitleaks is a compiled program distributed as a zip file. **Install
version 8.30.1 — the version this guide's figures and the evidence files
were made with.** gitleaks' default `aws-access-token` rule changed
between versions, and the whole point of Stage 7 is to watch that behavior
change from one version to the next; using a consistent version keeps the
comparison honest. (If a newer version flags the seeded key by default,
that's the same phenomenon worth writing in your report — see Step 7.2.)

```bash
curl -sL -o gitleaks.tar.gz https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz
```

This downloads the zip file. `-sL` means "silent" (no progress spam) and
"follow redirects" (the GitHub download link bounces through a couple of
URLs before reaching the file). (macOS: `gitleaks_8.30.1_darwin_x64.tar.gz`;
ARM: `_darwin_arm64` / `_linux_arm64`.)

```bash
tar -xzf gitleaks.tar.gz
```

This unpacks the zip into the current folder. Check it works:

```bash
./gitleaks version
```

If it prints a version, move it somewhere on your PATH (a folder of
executables your terminal searches) so you can just type `gitleaks`:

```bash
sudo mv gitleaks /usr/local/bin/
```

> **Re-running:** if `mv` says `cannot stat 'gitleaks': No such file or
> directory`, the binary is already where it belongs — re-run only the
> version check. And if you already have *some* gitleaks on your PATH, the
> version check tells you which one you'll get; `gitleaks --version`
> prints it.

```bash
gitleaks version
```

*(On macOS you can also `brew install gitleaks`, and on Ubuntu
`sudo snap install gitleaks` — but then the version is whatever the
package ships, not 8.30.1. Pin the version: the output differences later
in this guide are the lesson.)*

### Step 1.6 — Double-check everything

Run all five checks quickly:

```bash
node --version && npm --version && semgrep --version && gitleaks version
```

*(This is the one place I join commands, and only because it's a pure
check. If one fails you'll see it right away.)*

---

## Stage 2 — Start the database and get the app running

### Step 2.1 — Start PostgreSQL

**Path A — Docker container** (if you chose the Docker path):

This command creates a PostgreSQL database container. Every part of it
means something:

```bash
docker run -d --name docutrust-postgres \
  -e POSTGRES_USER=docutrust \
  -e POSTGRES_PASSWORD=docutrust_dev_password \
  -e POSTGRES_DB=docutrust \
  -p 5432:5432 \
  postgres:16.4
```

Breaking it down:

| Part | What it does |
|:---|:---|
| `docker run` | "create a new container" |
| `-d` | "detached" — run it in the background, don't block this terminal |
| `--name docutrust-postgres` | give the container a name so you can control it later |
| `-e POSTGRES_USER=docutrust` | set an environment variable *inside* the container: the database user is `docutrust` |
| `-e POSTGRES_PASSWORD=docutrust_dev_password` | the password for that user — **this is a development-only password**, the same one the app ships with in `.env.example`, not a real credential |
| `-e POSTGRES_DB=docutrust` | create a database named `docutrust` |
| `-p 5432:5432` | "port mapping": the app talks to the database on port 5432, and this makes the container listen on that port from outside |
| `postgres:16.4` | the image (the template) to build the container from — version 16.4 |

The `\` at the end of a line just means "this command continues on the
next line" — you can also type it all on one line. If you want, you can
paste the whole command including the `\`s, it's still one command.

> **Re-running long after a restart:** a stopped container isn't a failed
> one. `docker ps` only lists *running* containers — use `docker ps -a`
> to see the stopped one, and `docker start docutrust-postgres` to bring
> it back. If you've seen all of this and the error says the *name* is
> already in use, a container with that name exists — reuse it
> (`docker start`) or delete it (`docker rm -f docutrust-postgres`) and
> run the create line again. Never run two containers for the same
> database: they'd fight over port 5432.

**Path B — native PostgreSQL** (no Docker):

Create the database user and database with the *exact same credentials*
that the app expects (from `.env.example` — a dev-only password):

```bash
sudo -u postgres psql -c "CREATE ROLE docutrust WITH LOGIN PASSWORD 'docutrust_dev_password';"
```

```bash
sudo -u postgres psql -c "CREATE DATABASE docutrust OWNER docutrust;"
```

![The idempotent case: the role already exists](images/27-role-exists.png)

*Figure 4 — running the Create role line a second time. The error `already
exists` is not breakage — it is the confirmation that the setup from the
first run is still in place. Same for the database line.*

*(If these say "already exists", that's fine — the database is already
set up, move on. And if you ran **both** paths, only Path B's lines can
succeed: a native and a container Postgres cannot both own port 5432.
Pick one, as Step 1.3 said.)*

### Step 2.2 — Install the app's dependencies

Now go into the project folder and install the libraries the app needs:

```bash
cd docutrust
```

**What just happened:** `cd` ("change directory") moves your terminal into
the project folder. From here on, run every command from inside
`docutrust`.

```bash
npm install
```

This reads `package.json` (the app's shopping list) and downloads every
library into a folder called `node_modules`. You'll see a progress list
finishing with something like `added 100 packages`.

> **Re-running:** a re-run is a no-op-ish check ("up to date"), and
> deleting `node_modules` + re-running `npm install` is the standard cure
> for a corrupted install. `npm` is fine on repeat as long as you're in
> the right directory.

### Step 2.3 — Create the app's config file

The app needs to know where the database is. The project ships with a
template config file called `.env.example`:

```bash
cp .env.example .env.local
```

**What just happened:** `cp` copies the file. `.env` files hold
"environment variables" — settings the app reads at startup. `.env.example`
is the template (safe to share), and `.env.local` is your real copy (never
committed to git — it may hold real credentials one day). Open `.env.local`
in an editor and look at it — it should contain one line:

```
DATABASE_URL="postgresql://docutrust:docutrust_dev_password@localhost:5432/docutrust"
```

Read it like this: `postgresql://` the *username* `docutrust`, the
*password* `docutrust_dev_password`, on *host* `localhost`, *port* `5432`,
database `docutrust`. It exactly matches the database you created in
Step 2.1. That match is what makes everything work.

> **Re-running:** a re-copy overwrites `.env.local` with the template. If
> you changed the file intentionally (different password, different port),
> keep a backup or don't re-copy.

### Step 2.4 — Load the config into your terminal (important!)

Here is a trap that will otherwise waste 10 minutes of your life:

**The app does not read `.env.local` by itself.** Node.js only reads
environment variables that are already in your terminal. So you have to
tell your terminal to load the file, *in every terminal where you run the
app*:

```bash
set -a && source .env.local && set +a
```

This runs the file's contents in your current terminal and exports them,
so `DATABASE_URL` reaches every command you run afterwards — including
`node`, which only sees *exported* variables.

> ⚠️ **Why `set -a`?** A plain `source .env.local` only sets a *shell*
> variable, and child programs like Node never see shell variables. The
> symptom: `npm run migrate` or `npm start` fails with
> `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`
> (the app silently tries to connect as your OS user with no password).
> `set -a` turns on auto-export for the source, and `set +a` turns it off
> again. If you open a new terminal later, run this same line again —
> that's normal and expected. And since `source` re-reads the file, it
> picks up any edits you made; it's safe to re-run.

### Step 2.5 — Create the database tables

The app needs two tables (`documents` and `comments`) to store things in.
The project includes a small program that creates them from a SQL file:

```bash
npm run migrate
```

**What just happened:** `npm run migrate` runs the `migrate` script from
`package.json`, which executes `src/migrate.js`. That script reads the
`migrations/` folder and applies any SQL files that haven't run yet.

On a fresh database you'll see:

```
Applying 0001_init.sql ... done
Migrations up to date
```

If the database was already set up, you'll just see `Migrations up to
date` — **that's also success**, and your guide's second-run experience
will look like this:

![The second run of migrate is a no-op — by design](images/24-migrate.png)

*Figure 5 — `npm run migrate` a second time. Nothing to apply, no error
— the migration runner keeps a bookkeeping table (`schema_migrations`) of
the files it already ran. This is the one part of the app that was
idempotent from the start; the reset contract (above) makes the rest
match it.*

### Step 2.6 — Start the app

Now run the actual web server:

```bash
node src/index.js
```

You should see:

```
DocuTrust dev listening on 3000
```

**What just happened:** your terminal is now *blocked* — the app is
running, and it will keep running until you press `Ctrl+C`. Leave this
terminal alone. Open a **second terminal** for the next stage. (If you
later want to stop the app, press `Ctrl+C` in this terminal.)

> **Re-running / second instance:** if you see `Error: listen
> EADDRINUSE: address already in use :::3000`, an instance is already
> running. Quit that one (`Ctrl+C` in its terminal), or run this stage's
> checkpoint (`pkill -f "node src/index.js" || true`). The checkpoint is
> the safe habit.
>
> ![What a second instance looks like](images/29-eaddr-in-use.png)
>
> *Figure 6 — the dead giveaway: `EADDRINUSE`, `address :::3000`.*

---

## Stage 3 — Smoke test: prove the app actually works

**Checkpoint (state this stage assumes):** the app is running on port
3000 from `project1-starter`, and the `documents` table is empty with the
id sequence at 1. If you're not sure, run this before anything else:

```bash
pkill -f "node src/index.js" || true
set -a && . ./.env.local && set +a
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM documents;"
```

then start the app again (`node src/index.js` in its own terminal). This
is why the ids below say exactly 1 and 2.

"Smoke test" = a handful of quick checks that the app is alive and
behaving. We talk to the app with **curl** — a command-line tool that
sends HTTP requests, the same kind of requests your browser sends when
you visit a website.

### Step 3.1 — Health check

```bash
curl localhost:3000/healthz
```

Expected output:

```json
{"status":"ok","version":"dev"}
```

![The health check](images/07-smoke-health.png)

*Figure 7 — `curl localhost:3000/healthz` — the app says it's alive, and
it means it: the endpoint itself checks the database connection before
answering.*

**What just happened:** curl asked the app "are you alive?" The app
checked that it can reach the database, and answered `"status":"ok"`.
This is the app's health endpoint — the kind of thing monitoring tools
ping every minute.

### Step 3.2 — Create a document

The app's main job is storing documents. This command creates one:

```bash
curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' -d '{"title":"Quarterly Report","body":"Q2 numbers"}' | jq .
```

Breaking it down:

| Part | What it does |
|:---|:---|
| `curl` | the tool we use to send HTTP requests |
| `-X POST` | use the POST method — "create something new" (browsers use GET to *read*, POST to *create*) |
| `localhost:3000/documents` | the app's address + the documents resource |
| `-H 'Content-Type: application/json'` | tell the app "what follows is JSON" (JSON is a plain-text format for describing data) — the app only parses the body if you send this header |
| `-d '...'` | the data ("body") to send — a title and a body in JSON format |
| `\| jq .` | pretty-print the JSON the server returns, instead of one long line |

Expected output (note the `id` the server assigned):

```json
{
  "id": 1,
  "title": "Quarterly Report",
  "body": "Q2 numbers",
  "created_at": "2026-08-27T12:33:41.000Z"
}
```

![Creating the document](images/08-smoke-create.png)

*Figure 8 — the server assigned id 1. After a reset, that's deterministic
— it's always 1. Without the reset contract, it's whatever comes next.*

> **From now on, capture ids — don't trust literals.** The next commands
> need the id. Let me show you the one-liner I use, then explain it:

```bash
DOC_ID=$(curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' -d '{"title":"Quarterly Report","body":"Q2 numbers"}' | jq -r .id) && echo "DOC_ID=$DOC_ID"
```

> `$( ... )` runs the curl and captures its output; `jq -r .id` pulls just
> the id field; `echo "DOC_ID=$DOC_ID"` prints it so you can *see* what
> you captured. I'll use `$DOC_ID` below. This habit is what makes a guide
> readable on any machine: after a reset the value is 1, before a reset
> it's "the next one" — either way, your commands keep working.

### Step 3.3 — Fetch the document back

```bash
curl localhost:3000/documents/$DOC_ID
```

(Use the id you got in the previous step.) You should get the same JSON
back — this proves the document was actually stored in the database.

![Fetching the document back](images/09-smoke-fetch.png)

*Figure 9 — round trip: the id the server printed is the key that reads
it back.*

### Step 3.4 — Render the document as an HTML page

The app can also present a document as a web page:

```bash
curl localhost:3000/documents/$DOC_ID/render
```

Expected output:

```html
<html><body><h1>Quarterly Report</h1><p>Q2 numbers</p></body></html>
```

![The rendered page](images/10-smoke-render.png)

*Figure 10 — the document wrapped in HTML tags: the title in an
`<h1>` heading, the body in a `<p>` paragraph. **Remember this
endpoint — it's the one with the XSS bug (Stage 5).***

### Step 3.5 — Search for a document

```bash
curl "localhost:3000/documents/search?q=quarterly"
```

Expected output — hold on to it, because it's a surprise:

```json
{"error":"Database unavailable"}
```

![The surprise: search fails](images/11-smoke-search.png)

*Figure 11 — `?q=quarterly` should match the document we just created,
but the app answers `Database unavailable`. This is the endpoint with
the SQL injection bug, and it's *not supposed to work like this* —
the full story is Stage 9. Notice the quotes around the URL: the
`?q=...` part is how you pass a parameter in a URL, and quotes protect
the `?` and `=` from the shell.*

> **Don't skip this moment.** A search for a document that provably
> exists failing with a database error is not noise — it's a finding in
> disguise, and it's the discovery Stage 9 is about. (If search *does*
> return `[{"id":1,...}]` for you, you're on a branch where the route
> order is already fixed — the same discovery, already resolved; you'll
> still see both sides in Stages 10–11.)

---

## Stage 4 — SAST scan with the default rulesets

**Checkpoint:** you're on `project1-starter` (unfixed code) with a clean
tree. Static scans don't care about the database — but they do care about
the code state, and that's what this stage's output is about:

```bash
git status
git log --oneline -1    # should reference project1-starter's pre-fix commit
```

Now the fun part: point a real security scanner at the code.

### Step 4.1 — Run semgrep with the default rules

semgrep's default "rulesets" are community-maintained collections of
patterns for known vulnerabilities. These two are the most relevant here:
the **OWASP Top Ten** ruleset (named after the industry's famous top-10
web security risks list) and the **JavaScript** ruleset:

```bash
semgrep --metrics=off --config=p/owasp-top-ten --config=p/javascript src/
```

Breaking it down:

| Part | What it does |
|:---|:---|
| `semgrep` | the scanner |
| `--metrics=off` | don't send anonymous usage statistics — good hygiene |
| `--config=p/owasp-top-ten` | use the OWASP Top Ten ruleset (`p/` is semgrep's shorthand for "registry") |
| `--config=p/javascript` | also use the JavaScript ruleset |
| `src/` | scan this folder (the app's source code) |

Expected result — **one finding** (the run takes a few seconds; the
rulesets are fetched and cached on first use):

![The default rulesets catch the XSS and miss the SQLi](images/12-sast-default.png)

*Figure 12 — real semgrep output against `project1-starter`: the default
rulesets found **one** finding — the manually-constructed HTML at
`src/routes/documents.js:104`, and the summary "Ran 74 rules on 7 files:
1 finding".*

**What just happened:** semgrep found the render endpoint's HTML
construction (Stage 3.4). It's flagging that user data (`title`, `body`)
gets interpolated into HTML — the classic XSS pattern (printing user
input into a web page unescaped; the plain-language definition is in
Stage 5).

**And now the part that matters:** where was the SQL injection? Nowhere.
Zero findings for it. The textbook SQL injection in the search endpoint —
raw string concatenation into a database query — was invisible to every
generic ruleset I tried.

> **Lesson 1:** generic rulesets don't know your stack. They don't model
> "template literal flows into `pool.query()`" for this specific
> JavaScript/Postgres combination. The finding is there — the tool that
> catches it is the one you write yourself (Stage 6). This is exactly
> why the project brief demands a custom rule.

---

## Stage 5 — Confirm the XSS finding by hand

**Checkpoint:** the app is running, and the database is in the state Stage
3 left it (ids 1 and 2). If `quarterly` documents are multiplying, reset
as in Stage 3, then re-create one normal document and the script document
below.

A scanner saying "this might be XSS" is a hypothesis. Let's *prove* it
against the running app — this is what separates a scanner output from
a confirmed vulnerability.

**XSS in one sentence:** if an app prints user-provided text into an HTML
page without escaping it, a user can put a `<script>` tag in their text
and make it execute in *other people's browsers* when they view the page.

### Step 5.1 — Create a document containing a script tag

```bash
XSS_ID=$(curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' -d '{"title":"<script>alert(1)</script>","body":"hello"}' | jq -r .id) && echo "XSS_ID=$XSS_ID"
```

Note the title: it's an HTML `<script>` tag. A real attacker would put a
script that steals cookies; `alert(1)` is the harmless "hello world" of
XSS demos — it pops a dialog box. **Never test with a malicious payload
on a system you don't own; this is your own dev app, so it's fine.**

![Creating the script document](images/30-xss-create.png)

*Figure 13 — the `<script>alert(1)</script>` document is stored, id 2
after the reset.*

### Step 5.2 — Render it

```bash
curl localhost:3000/documents/$XSS_ID/render
```

(Use `$XSS_ID` — or the id from the response.)

Expected output:

```html
<html><body><h1><script>alert(1)</script></h1><p>hello</p></body></html>
```

![The payload round-trips unescaped](images/14-confirm-xss-render.png)

*Figure 14 — the `<script>` tag came out of the app **completely
unescaped**. If a victim opens that URL in a browser, the script executes
on their machine. Confirmed: genuinely exploitable, not a scanner
artifact. (We'll fix it in Stage 10, and you'll see the same request
come back *escaped* in Stage 11.3.)*

**There it is.** The `<script>` tag came out of the app **completely
unescaped**. If a victim opens that URL in a browser, the script executes
on their machine. Confirmed: genuinely exploitable, not a scanner
artifact. (We'll fix it in Stage 10, and you'll see the same request
come back *escaped*.)

---

## Stage 6 — The custom SAST rule (the part that separates this from a tutorial)

**Checkpoint:** `project1-starter`, clean tree, `src/` unmodified.

### Step 6.1 — The problem, in plain words

Semgrep's default rulesets missed the SQL injection entirely. Why?
Because the dangerous code looks like this:

```js
const query = `SELECT ... WHERE title ILIKE '%${searchTerm}%'`;
pool.query(query);
```

The `searchTerm` (user input!) is glued straight into a database query.
That's a **SQL injection**: the user can break out of the quote marks
and rewrite the query — e.g. search for `' OR '1'='1` and make the
database return *everything*, or worse, run any SQL command.

Generic rulesets missed it because they don't know that "a template
literal that flows into `pool.query()`" is dangerous *in this stack*.
So the brief demands a custom rule: one that flags **any SQL query string
built with template-literal interpolation or string concatenation instead
of a parameterized query**.

### Step 6.2 — The rule

The rule lives at `semgrep/rules/docutrust-unsafe-sql-interpolation.yml`.
Open it — it's designed to catch **four different shapes** of the same
mistake:

1. Direct interpolated call — `pool.query(`...${x}...`)`
2. Direct concatenated call — `pool.query("SELECT ... " + x)`
3. SQL string built by concatenation into a variable, passed later
4. SQL string built by template-literal interpolation into a variable,
   passed later — **the seeded shape**

Each shape is one `pattern:` block under `pattern-either` (semgrep
"either of these patterns is a finding"). Shape 3 adds a
`metavariable-pattern` check that the concatenation starts with SQL
keywords (`SELECT`, `INSERT`, `UPDATE`, …) so that innocent code like
`const greeting = "hello " + name` is **not** flagged. Shape 4 (the
template-literal one) needed a different technique — `pattern-inside`
to look at the assignment block, then metavariable propagation to the
`.query()` call.

> **The debugging trail (short version):** my first version combined all
> four shapes and found *nothing* — even on the seeded line. Controlled
> experiments showed that in this semgrep version, regex constraints
> against a metavariable bound to a **template literal** see empty
> content, while plain string literals work fine. So: regex on the
> literal for the concatenation shapes, `pattern-inside` for the
> template shape. That's the kind of tool-specific gotcha you only learn
> by experimenting.

### Step 6.3 — Run the rule against the app

```bash
semgrep --metrics=off --config semgrep/rules/ src/
```

Expected result on the unfixed code — **1 finding, exit code 1**:

![The custom rule finds the seeded SQLi](images/16-sast-custom-rule.png)

*Figure 15 — the custom rule against `project1-starter`: the seeded SQLi
at `src/routes/documents.js:77` — "Ran 1 rule on 7 files: 1 finding".
The number of files matters: on `main` there are 12 (later projects add
files), on the starter there are 7. That's why the docs for each project
say where to run them.*

The exit code is what makes this usable: `--error` turns findings into a
non-zero exit, which is how the CI gate in Stage 12 knows to fail. Check
it with:

```bash
semgrep --metrics=off --config semgrep/rules/ --error src/; echo "exit code: $?"
```

### Step 6.4 — Prove the rule generalizes

A rule that only matches the one seeded line "has not actually
generalized the pattern" — that's a direct requirement of the brief. So
I wrote a throwaway test file, `evidence/05-custom-rule/test-cases.js`,
containing **5 positive shapes** (all four branches plus an UPDATE
variant) and **3 negative shapes** (a correct parameterized query, a
non-SQL interpolated greeting, a static SQL string). The negatives are
the proof you understand the difference between a vulnerability and the
*shape* of the code.

```bash
semgrep --metrics=off --config semgrep/rules/ --error src/ evidence/05-custom-rule/test-cases.js; echo "exit code: $?"
```

Breaking it down:

| Part | What it does |
|:---|:---|
| `--config semgrep/rules/` | use *our* rule file |
| `--error` | "exit with a non-zero code if any finding" — this is how scripts and CI know a scan failed |
| `src/ evidence/05-custom-rule/test-cases.js` | scan the app *and* the test file |

Expected result — exit code 1, **7 findings** (POSITIVE 1–5, the last
matched twice, plus the seeded line itself), all 3 negatives clean:

![The rule catches every positive shape and none of the negatives](images/17-sast-rule-generalizes.png)

*Figure 16 — real run: "Ran 1 rule on 8 files: 7 findings", exit code 1.
The finding at `src/routes/documents.js:77` plus the test file's five
positive shapes (the last matches twice) — and every negative case
(parameterized query, greeting, static string) stayed clean.*

> **Lesson 2:** writing a rule is 20% the rule and 80% proving it. The
> negative cases are what show you understand the vulnerability.

---

## Stage 7 — Secrets scanning with gitleaks

**Checkpoint:** `project1-starter`, clean tree, and **gitleaks 8.30.1**
as installed in Stage 1.5 (verify: `gitleaks version`).

### Step 7.1 — The problem, in plain words

The app contains `src/config.js` with this constant:

```js
const LEGACY_INTEGRATION_KEY = "AKIAIOSFODNN7EXAMPLE";
```

That's *shaped* exactly like an AWS access key: `AKIA` + 16 more
characters. It was put there on purpose — pattern-matching tools should
find it. But is it a real credential? That's Stage 8. First, the scan:

### Step 7.2 — Scan with gitleaks' default config

```bash
gitleaks detect --source .
```

Breaking it down:

| Part | What it does |
|:---|:---|
| `gitleaks` | the secrets scanner |
| `detect` | scan for secrets |
| `--source .` | scan the current folder (`.` = "here") |

![The default config misses the seeded key — by design](images/18-gitleaks-default.png)

*Figure 17 — real gitleaks 8.30.1 run: `INF no leaks found`. The seeded
key, sitting in plain view, not flagged.*

**This is not a bug — it's the lesson.** I tested it in isolation
(control experiment): the key alone in a fresh repo → **not flagged**.
A random high-entropy `AKIA…` key → **flagged**. So the rule wasn't
broken — the *default rule's entropy threshold* was rejecting the
placeholder. AWS's example key is deliberately low-entropy, and the
default `aws-access-token` rule requires a minimum entropy of 3.0 (real
keys are random strings, high entropy; placeholders like `EXAMPLE` are
predictable, low entropy).

> **Version footnote — worth writing in your report:** on a gitleaks
> newer than 8.30.1, the default config often *does* flag this key —
> I've seen "leaks found: 23" on one newer install (the project's own
> docs and evidence quote the key dozens of times, and newer defaults
> don't filter the placeholder). Same phenomenon, different default:
> a "clean" scan is only clean if you know what your tool's defaults
> actually filter. (Not that this one is real — that's Stage 8.)

> **Lesson 3:** default tool configs quietly filter out low-entropy
> credentials — exactly the ones attackers know how to use if you leave
> them in a repo.

### Step 7.3 — The project config (same theme as the custom rule)

The engineering response was a project config file, `gitleaks.toml` at
the repo root, that pins the AWS rule **without the entropy gate**, and
keeps the other useful defaults:

```toml
[[rules]]
id = "aws-access-token"
description = "AWS access token (entropy gate removed for the seeded placeholder key)"
regex = '''(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}'''
# + generic-api-key, private-key, password rules for sweep breadth
```

Now scan with it:

```bash
gitleaks detect --source . -c gitleaks.toml
```

Breaking it down: `-c gitleaks.toml` means "use *our* config file
instead of the built-in one".

**Expected output on the project as-shipped (config with the original
README/evidence allowlist):**

![The project config finds the key — and a lot of documentation](images/19-gitleaks-config-initial.png)

*Figure 18 — real gitleaks 8.30.1 run against the current tree:
`WRN leaks found: 21`. The seeded constant is in there — but so are
twenty mentions in the project's own documentation: the walkthrough and
the final report both quote `AKIA…` and the dev password, on this tree
and in earlier commits.*

That's the **triage moment**, and it's the same call the original project
made. The key also appears in `README.md` and inside the `evidence/`
files — *because those documents describe the finding*. Flagging them
adds noise, so the config allowlists those paths with the reason written
into the config:

```toml
[allowlist]
description = "Documentation and evidence quote the seeded placeholder key and the dev password intentionally (Project 1 brief and deliverables). Triage, not hiding: the paths are scoped exactly, so a real key anywhere else is still flagged."
paths = ["README.md", "docs/", "Project-Requirement/", "evidence/"]
```

Allowlisting documented references — with the reason written down — is
**triage, not hiding**: the allowlist is scoped to those exact paths, so
a fresh key anywhere else is still flagged.

> **How to see it yourself:** run the scan, read the `File : Line`
> column, and confirm each hit is a *documentation* line quoting the
> finding. `<gitleaks detect --source . -c gitleaks.toml -f json -r report.json>` gives you the machine-readable list; `jq` makes it readable:

```bash
gitleaks detect --source . -c gitleaks.toml -f json -r /tmp/report.json; jq -r '.[] | "\(.RuleID) \(.File):\(.StartLine)"' /tmp/report.json
```

Now scan again — the only leak left is the real one:

![After triage: exactly one leak, the real one](images/19-gitleaks-config.png)

*Figure 19 — the same scan after the allowlist extension:
`WRN leaks found: 1` — `src/config.js:15`, the seeded constant. The
verdict on the real finding is unchanged: documentation hits are
suppressed with a comment saying so, real hits are not.*

### Step 7.4 — The full-history sweep

Scanning the current code only misses secrets that were *deleted or
changed in past commits*. A secret that was committed and later removed
is still recoverable from git history — that's why the sweep scans every
commit ever made:

```bash
gitleaks detect --source . -c gitleaks.toml --log-opts="--all"
```

Breaking it down: `--log-opts="--all"` tells git "don't just look at
the current files — look at every commit".

![The full-history sweep: exactly one leak across all history](images/20-gitleaks-full-history.png)

*Figure 20 — real sweep across 42 commits: exactly one leak, the seeded
constant, in the commit that introduced it (`685702f8`).* The
machine-readable output gives the exact commit:

```bash
gitleaks detect --source . -c gitleaks.toml --log-opts="--all" -f json -r /tmp/history.json
jq -r '.[] | "\(.RuleID) \(.File):\(.StartLine) | commit \(.Commit)"' /tmp/history.json
```

You'll see one line: `aws-access-token src/config.js:15 | commit
685702f8…`. The "clean elsewhere" claim is *proven*, not assumed.

> **Lesson 4 (the dark one):** committed secrets live forever. A secret
> pushed to git is in the history even after you delete the line — you'll
> meet this again in Stage 12, when the CI gate caught a real mistake I
> made.

---

## Stage 8 — Live secret verification (scanner output vs. security finding)

**Checkpoint:** repo as in Stage 7 (scan ran, key found). Network required
for this stage.

### Step 8.1 — The problem, in plain words

Pattern-matching says "this *looks* like an AWS key." The brief demands
proof of whether it **is** one. This is the step that separates a
scanner output from a security finding.

The cheapest real check that establishes identity is
`sts:GetCallerIdentity` — AWS's own "who am I?" call. A live key answers
with your AWS account details. Anything else is rejected by AWS's
identity service with a specific error code. So the plan: hand AWS the
found key and let AWS itself tell us if it works.

### Step 8.2 — The verification script

The project includes `security/verify-credential.js`. It loads the found
key straight from `src/config.js` — the exact string the scanner
reported — configures an AWS STS client with it (the AWS SDK is the
library that speaks AWS's API), and makes the call.
(If you look at the script you'll notice it needs *some* secret key
field to construct the client — a clearly fake one is fine, because an
unrecognized access key is rejected *before* anything else happens.)

First, the script's own dependencies need installing (it's a separate
little project so it doesn't touch the app's dependencies):

```bash
cd security
```

```bash
npm install
```

```bash
cd ..
```

**What just happened:** we stepped into `security/`, installed that
script's own dependencies, and stepped back to the project root — the
next command runs from there.

Then run the check:

```bash
node security/verify-credential.js
```

**What just happened:** Node runs the verification script — it reads the
found key straight from `src/config.js`, makes the call to AWS, and
prints the verdict.

### Step 8.3 — The verdict

This makes a **real network call to AWS**. The output:

![AWS's own verdict: InvalidClientTokenId](images/21-live-verification.png)

*Figure 21 — real network call to AWS `sts:GetCallerIdentity` against the
found key. The key is inert: AWS itself says it doesn't exist in its
identity service (`InvalidClientTokenId`).*

**The key is inert.** It matches every pattern, and AWS itself says it
doesn't exist in its identity service:

> **Lesson 5:** a scanner *finding* is a pattern match; a *security
> finding* is one you have verified. This constant is cosmetic —
> documented, not a fix target. The brief fixes the two real
> vulnerabilities; this one is a documented track artifact.

---

## Stage 9 — The reachability discovery (the surprise from Stage 3)

**Checkpoint:** `project1-starter`, app running, DB in post-reset state
(Stage 3's checkpoint).

Remember the surprise in Stage 3.5 — search returning
`Database unavailable`? Here's the story, because it changed how I read
code.

I tested a nonsense path:

```bash
curl localhost:3000/documents/abc
```

Response:

![The two identical errors](images/22-reachability-abc.png)

*Figure 22 — `{"error":"Database unavailable"}` for a nonsense path —
because `abc` isn't an integer id and the database rejects it.*

Then search:

```bash
curl localhost:3000/documents/search
```

![The same response for a request that should work](images/23-reachability-search.png)

*Figure 23 — the *same* error for `/documents/search` — a request that
has a handler and should work.*

Two completely different requests, one identical answer. That told me
`/documents/search` was **never reaching the search handler at all**. In
Express, routes match in the order you register them — and `GET /:id`
was registered *before* `GET /search`. So the request for `/search` was
being captured by `/:id`, which binds `id = "search"`, and the database
rejected `"search"` as an integer (it expects numbers).

**The seeded SQLi existed in the code but was unreachable through normal
routing.** A static scan flags the line (it scans text, not
reachability); only running the app showed me it was shadowed. That's a
"cosmetic vs. exploitable" distinction the tools can't make for you —
it's the engineer's job. I filed it and fixed it together with the SQLi
(Stage 10).

> **Lesson 6:** run the app before believing the scanner. And label
> every expected output with *which code state* it comes from — in
> Stages 10–11 you'll see the same requests give different answers on
> the fixed branch.

---

## Stage 10 — Fix both vulnerabilities for real

**Checkpoint:** `project1-starter`, clean tree (your Stage 6/7 work was
scans only, so nothing should be modified; verify with `git status`).
Stop the app for the next restart:

```bash
pkill -f "node src/index.js" || true
```

### Step 10.1 — Fix the SQL injection

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

I also fixed the route shadowing from Stage 9 by registering `/search`
*before* `/:id` — without it, the endpoint (and the fix) would be
unreachable.

### Step 10.2 — Fix the XSS

**Before** — raw interpolation into the HTML response:

```js
res.send(`<html><body><h1>${title}</h1><p>${body}</p></body></html>`);
```

**After** — every interpolated value passes through an `escapeHtml()`
helper that turns `& < > " '` into their HTML entities (`&lt;` etc.), so
a script tag renders as *inert text*:

```js
res.send(`<html><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`);
```

**What changed — look at the diff before you trust it:**

```bash
git diff src/routes/documents.js
```

![The actual changes](images/35-fix-diff.png)

*Figure 24 — `git diff` after the fix: the SQLi bound-parameter change,
the route reorder (search before `/:id`), and the `escapeHtml` calls.
This is what "fixed" means — read it before you restart the app.*

---

## Stage 11 — Prove the fixes at runtime (not just "it compiles")

**Checkpoint:** fixes applied, app stopped. Restart it (this time from
the branch with the fixes), then **reset the data** — the proofs below
expect ids 1 and 2 again:

```bash
pkill -f "node src/index.js" || true
set -a && . ./.env.local && set +a
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"

# in a second terminal:
node src/index.js
```

then re-create the two documents (id 1 = "Quarterly Report", id 2 = the
script tag):

```bash
DOC_ID=$(curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' -d '{"title":"Quarterly Report","body":"Q2 numbers"}' | jq -r .id) && echo "DOC_ID=$DOC_ID"
XSS_ID=$(curl -s -X POST localhost:3000/documents -H 'Content-Type: application/json' -d '{"title":"<script>alert(1)</script>","body":"hello"}' | jq -r .id) && echo "XSS_ID=$XSS_ID"
```

### Step 11.1 — Search works now

```bash
curl "localhost:3000/documents/search?q=quarterly"
```

![Search returns the document](images/31-search-works.png)

*Figure 25 — after the route-order fix, `/documents/search` reaches its
handler and returns the result.*

### Step 11.2 — The SQL injection attempt

Now the attempt that used to be dangerous. **Important curl detail:** a
URL can't contain raw spaces or quotes — they must be *percent-encoded*
(`%20` is a space, `%27` is a single quote). This is what the browser
does to your address bar automatically; here we do it by hand:

```bash
curl "localhost:3000/documents/search?q=quarterly%27%20OR%20%271%27%3D%271"
```

(Decoded, that's `q=quarterly' OR '1'='1` — the classic "show me
everything" injection.)

An **empty array** — the database searched for the literal text
`quarterly' OR '1'='1`, found nothing, and returned nothing. If the
injection were still live, this would have returned *every* document.

![The injection returns nothing](images/32-sqli-attempt.png)

*Figure 26 — `[]` — the bound parameter treated the payload as text. On
the unfixed code, exactly this URL returns the whole table.*

### Step 11.3 — The XSS attempt

```bash
curl localhost:3000/documents/$XSS_ID/render
```

(Use `$XSS_ID` — the id of the `<script>` document from the checkpoint.)

Expected result — compare with Figure 14:

```html
<html><body><h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1><p>hello</p></body></html>
```

![Escaped and inert](images/33-xss-render-escaped.png)

*Figure 27 — the raw `<script>` is gone — it's now `&lt;script&gt;`,
which a browser displays as *text* but never executes. Escaped, inert,
fixed.*

**Compare with Figure 14:** the raw `<script>` is gone — it's now
`&lt;script&gt;`, which a browser displays as *text* but never executes.
Escaped, inert, fixed.

### Step 11.4 — The rerun (this is what "fixed for real" means)

```bash
semgrep --metrics=off --config semgrep/rules/ --error src/; echo "exit code: $?"
```

Expected result — **0 findings, exit code 0**:

![The custom rule is clean after the fix](images/34-semgrep-rerun.png)

*Figure 28 — real rerun after the fixes: 0 findings, exit code 0. The
SQL injection finding is gone.*

**One flag remained** from the *default* ruleset: `raw-html-format`
still points at the render line even though the output is escaped.
Triage: **false positive**. The rule heuristically flags *any* manual
HTML construction with interpolation and can't model that `escapeHtml()`
sanitizes the data — and the runtime proof above (Step 11.3) shows no
execution is possible. I documented it instead of suppressing it
(`evidence/08-fixed-rerun/`). That's the "cosmetic vs. genuinely
exploitable" judgment call the brief grades.

---

## Stage 12 — The CI gate, proven

**Checkpoint:** your fixes are committed where? For this guide, the gates
run in GitHub Actions — so you need a repo on GitHub. This stage is the
one that genuinely can't be local-only: `git checkout main`, push to
**your own fork**, watch the runs.

### Step 12.1 — What "CI" means here

**CI** = Continuous Integration: a pipeline that runs automatically on
every push to the repo (here, GitHub Actions). The point of this stage:
make the checks from Stages 4–8 run on every commit forever, so a new
vulnerability or secret gets *blocked* — not just noticed.

`ci.yml` shipped with a deliberate placeholder under the build job,
waiting for exactly this project. I added two enforcement jobs:

| Job | What it runs | How it blocks |
|:---|:---|:---|
| `sast` | semgrep with our custom rule | `--error` → any finding fails the build |
| `secrets-scan` | gitleaks with `gitleaks.toml`, full history | any leak fails the build |

### Step 12.2 — Run 1: green on the fixed code

Push `main`. CI: `build-and-test` ✅, `sast` ✅, `secrets-scan` ✅ — and
because CI is an API too, you don't need to read the web UI to see it:

```bash
gh run list --workflow ci.yml -L 6
```

![The real run history](images/36-ci-run-list.png)

*Figure 29 — real `gh run list` output. Green runs on `main`, plus the
red ones this stage is about. The run IDs are what the next commands
reference.*

```bash
gh run view 32167821478
```

![The green run in detail](images/37-ci-green.png)

*Figure 30 — real `gh run view` of the green `main` run: build-and-test,
sast, secrets-scan — three jobs, three checkmarks. Run the command
yourself against your own latest run ID.*

### Step 12.3 — The gate catching our own real mistake

Run 1 actually **failed first** — and that's evidence too. The secrets
gate flagged the verification script itself: I had written
`AKIAIOSFODNN7EXAMPLE` into the script's output message instead of
using the constant. **The gate caught a real mistake I made, not just
the seeded one** — the whole point of a gate. Fix: use the constant, not
the literal.

But that literal was already in a commit — and once committed, a
full-history scan flags it forever. This is Lesson 4 ("committed secrets
live forever") in the flesh. The correct response: **rewrite the history
so it never existed**. I amended the evidence commit (replaced the
script file, kept the message), rebased the follow-up commits on top,
verified locally that the full-history scan was clean, and force-pushed
(overwrote the remote history with) the rewritten `main`. (Safe here:
private repo, no collaborators, minutes old.) Run 2: all green.

### Step 12.4 — Run 2: red on the violation branch (the deliverable)

Then the actual proof. From clean `main`, a test branch carrying a
**fresh** seeded violation — a new SQL string concatenation
(`src/routes/legacy.js`) and a new credential-shaped constant
(`src/legacy-config.js`) — opened as a PR (pull request — a proposed
change, reviewed before merging):

```
X sast           → semgrep.rules.docutrust-unsafe-sql-interpolation: Findings: 2 (2 blocking)
X secrets-scan   → WRN leaks found: 1
✓ build-and-test
```

**CI blocked it. Both gates red on real GitHub Actions, with real
output** (saved in `evidence/09-ci-gate/run2-violation-PR-FAILED-both-gates.txt`).
I closed the PR and deleted the branch — the gates stay; the violation
doesn't.

![The red run that proves the gates can block](images/38-ci-red.png)

*Figure 31 — real `gh run view` of a failed run: `sast` passed but
`secrets-scan` failed — the exact shape of the gate catching a real
mistake. On your fork, find the failed run with
`gh run list --status failure`.*

> **Lesson 7:** a gate is only a gate if it can block. Green on good code
> is easy; red on bad code is the proof.

---

## Stage 13 — The final report

`docs/project-1/final-findings-report.md` ties it together for the track: every
finding with its cosmetic-or-exploitable verdict, what the live check
proved, what CI now enforces — plus the handoff to Project 2 (SCA):
the deliberately outdated `lodash@4.17.15` pin (confirmed by
`npm audit`: prototype pollution, command injection, ReDoS), the one
`_.cloneDeep` usage it exists for, and where the SCA stage slots into
the same pipeline.

---

## If something goes wrong

A quick reference for the traps scattered through this walkthrough — the
full explanation lives at the step named in each row. The table is
split into "first-time setup" and "you're re-running" because the traps
differ:

| If you see this | What it means and what to do |
|:---|:---|
| `command not found` | The tool isn't installed (or not on your `PATH`). Go back to its install step: Node/npm — Step 1.2, PostgreSQL — Step 1.3, semgrep — Step 1.4, gitleaks — Step 1.5. |
| `docker ps` doesn't print a table of containers | The Docker service probably isn't running. Start it with `sudo service docker start` (Step 1.3, Path A). |
| `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` | `DATABASE_URL` never reached Node. Re-run the load line: `set -a && source .env.local && set +a` (Step 2.4). |
| `already exists` from the database setup commands | The database/user already exists — that's success, move on (Step 2.1). |
| `ERROR: role ... already exists` after `CREATE ROLE` | Same — success for our purposes. The role/database from the first run is still there (Figure 4). |
| `Error: listen EADDRINUSE address already in use :::3000` | An app instance is already running. `Ctrl+C` it, or re-run the checkpoint's `pkill -f "node src/index.js"`. Never try to fix this by editing code (Figure 6). |
| `Error: No such file or directory` from `git checkout` with a half-finished stage | Your working tree has uncommitted changes from a previous stage; `git status` shows them. Commit or `git checkout -- .` and retry. |
| A different number of results than in the examples (e.g. two Quarterly Reports) | The database was reset off-schedule: rows from a previous run survived. Re-run the stage's checkpoint (`TRUNCATE ...`) — never edit the data by hand in a way you can't explain. |
| `Migrations up to date` without an "Applying …" line | The tables already exist — success (Step 2.5, Figure 5). |
| `INF no leaks found` from gitleaks (default config) | That's the version we pinned: the default rule's entropy gate skips the placeholder. The project config (`gitleaks.toml`) catches it anyway (Step 7.2). |
| `WRN leaks found: 21` (or any number > 1) from the project config | The findings beyond the first are documentation quoting the key. Triage: extend the allowlist with the docs paths, with a comment saying why (Step 7.3, Figures 18–19). |
| `gh run view` says "no run found" | You're referencing a run ID from my repo. Replace it with your own: `gh run list -L 3` first. |
| Your screenshot shows more/different `Runner` lines than Figure 12 | semgrep's registry rules and your version differ; the shape (1 finding at the render line, SQLi missing) is what matters, not the exact wording. |

---

## What I learned (the short version)

1. **Run the app before trusting the scanner.** The reachability
   discovery (`/search` shadowed by `/:id`) was invisible to every
   static tool (Stage 9).
2. **Default rulesets miss seeded findings — by design.** Both semgrep
   and gitleaks 8.30.1 defaults failed to flag this project's seeded
   items; the custom rule and project config are what caught them.
   That's not a tool failure; it's why the brief demands both
   (Stages 6–7).
3. **Scanner output is a starting point, not a verdict.** One remaining
   default-rule flag after the XSS fix is a false positive — proven,
   triaged, documented (Stage 11.4). And the secrets "finding" is inert —
   proven by AWS itself (Stage 8.3).
4. **Committed secrets live forever.** The gate caught a literal I'd
   committed; only rewriting the history removed it from the sweep
   (Stage 12.3).
5. **A gate is only a gate if it can block.** The violation PR proved it
   (Stage 12.4).
6. **Get comfortable with resets, or your second run will lie to you.**
   The checkpoint pattern — stop the app, reset the data, prove it's
   empty — is the reason every number in this guide reproduced on a
   second pass.

## Evidence index

Every evidence directory on `project1-starter` is the raw capture backing a
stage; on this repo the finished versions live under `evidence/project-1/`,
and the starter branch's tree carries the same files without the
`project-1/` level:

| Evidence | Deliverable |
|:---|:---|
| `evidence/01-sast-default/` | 1–3 — default SAST, XSS confirmed, SQLi missed |
| `evidence/05-custom-rule/` | 4 — custom rule + generalization proof (test-cases.js) |
| `evidence/06-secrets/` | 5, 8 — secrets scan, full-history sweep |
| `evidence/07-live-verification/` | 6 — live check: `InvalidClientTokenId` |
| `evidence/08-fixed-rerun/` | 7 — fixes, runtime proof, clean rerun, FP triage |
| `evidence/09-ci-gate/` | 9 — gate caught our literal; violation PR blocked |
| `docs/project-1/final-findings-report.md` | 10 — report + Project 2 handoff |
| `docs/project-1/images/` | Figures 1–31 — real captures of the tool outputs |

*One note on the figures: in this guide, every screenshot was taken from
a real terminal running the exact command above on the starter branch.
The history-sweep/verification figure captions name the tool version so
you can reproduce them on your machine with the same version.*
