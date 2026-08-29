# DocuTrust — Project 2 — DevSecOps Implementation Guide

---

# 1. Project Overview

## 1.1 Project Overview

DocuTrust's dependency tree is its attack surface. Project 1's SAST scan
surfaced one dependency problem and deliberately did not fix it —
dependencies are Project 2's job. The application carries a deliberately
outdated `lodash@4.17.15` exact pin (prototype pollution, command
injection, ReDoS advisories), and a set of questions nobody has asked:
what else is in the dependency tree, could a malicious package shadow
its way in, and how healthy are the upstream projects the application
relies on.

This project answers those questions with standard tooling — `npm
audit`, a transitive review, a scope-pinned private registry, real
registry probes for typosquats, the OpenSSF Scorecard, and a written
SCA policy — then wires the policy into CI and proves the gate blocks a
deliberately risky dependency before it can merge.

Every command in this guide actually ran, and every figure is a real
capture of that command on a real terminal. Evidence files are cited
along the way.

## 1.2 Project Objectives

1. Enumerate the dependency tree — direct and transitive.
2. Run the standard SCA scan (`npm audit`) and read the finding classes,
   not just the count (Deliverable 1).
3. Review the transitive tree by hand and state a verdict per package
   (Deliverable 2).
4. Remediate the lodash pin for real — rescan clean, smoke-test the app
   (Deliverable 3).
5. Write the SCA policy with checkable thresholds (Deliverable 4).
6. Defend against dependency confusion with a scoped private registry
   and demonstrate it live (Deliverable 5).
7. Review near-variant names for typosquats with real registry probes
   (Deliverable 6).
8. Run the OpenSSF Scorecard and read every check, not the headline
   number (Deliverable 7).
9. Enforce the policy in CI (Deliverable 8).
10. Prove the gate blocks a seeded risky dependency (Deliverable 9).
11. Hand a clean, current baseline to Project 3 (Deliverable 10).

## 1.3 Scope

**In scope:**

- The npm dependency tree as resolved by the lockfile — direct and
  transitive, production and development.
- Registry behavior: audit advisories, scope resolution, near-variant
  names.
- Supply-chain posture of the app's upstream repositories (OpenSSF
  Scorecard) and the CI gate that enforces the written policy.

**Out of scope:**

- Source-code vulnerabilities — Project 1 (SAST, secrets scanning).
- Runtime testing and defense — Project 3 (DAST/IAST/RASP).

**Branches:** Tasks 1–10 execute on `project2-starter` — the finished
Project 1 *plus* the seeded, still-vulnerable `lodash@4.17.15` pin.
The CI gate runs on your GitHub fork's `main`.

## 1.4 Technology Stack

| Component | Version / Pin | Purpose |
|---|---|---|
| Node.js | ≥ 20 | Application runtime (unchanged from Project 1) |
| npm | ships with Node | Package manager; `npm audit`, `npm ls`, `npm ci` |
| express | `^4.19.2` (declared) | Web framework |
| pg | `^8.13.0` (declared) | PostgreSQL driver |
| zod | `^3.23.8` (declared) | Schema validation |
| lodash | pinned `4.17.15` → fixed to `4.18.1` | The seeded finding; exact pin kept |
| OpenSSF Scorecard | v5.5.0 (CLI, pinned release) | Supply-chain health scoring of upstream repos |
| jq | any | JSON handling in the CI gate and probes |
| GitHub Actions | — | CI jobs incl. the new `sca` gate |
| GitHub CLI (`gh`) | any, authenticated | CI run status, seeded PR workflow |

## 1.5 DevSecOps Workflow

| Task | What you do | Why |
|---|---|---|
| 1 | Baseline the dependency tree | You cannot secure a tree you have not enumerated |
| 2 | SCA scan with `npm audit` | Which packages have known, disclosed vulnerabilities |
| 3 | Transitive review | A dangerous package three levels deep is what a direct-only review misses |
| 4 | Remediate lodash | The finding must actually go away — and the app must still run |
| 5 | Write the SCA policy | One fix is a moment; a policy is what stops the next finding |
| 6 | Dependency confusion defense | Pin the internal scope so npm never asks the public registry |
| 7 | Typosquatting review | Real probes of near-variant names, judged one by one |
| 8 | OpenSSF Scorecard | CVEs say nothing about "this project is abandoned" |
| 9 | The policy becomes a gate | A threshold nobody enforces is a suggestion |
| 10 | Prove the gate blocks | A gate that has never failed anything is a rumor |
| 11 | The report | A clean baseline handed to Project 3 |

---

# 2. Architecture

## 2.1 Architecture Overview

The attack surface is not the source code this time — it is the
dependency tree and the registry that resolves it.

```
[package.json declarations] ──▶ [package-lock.json] ──▶ [node_modules tree]
                                     │
   tools against the tree:
     npm audit ────────────▶ registry advisory database (known CVEs)
     npm ls --all ─────────▶ transitive inventory (direct + nested)
     .npmrc scope pin ─────▶ @docutrust/* → private registry, fail-closed
     scorecard --npm <pkg> ─▶ upstream repository health (score 0–10)
     typosquat probes ──────▶ npm view <near-variant> (registry truth)
   enforcement:
     CI job `sca` ──────────▶ npm audit --audit-level=high
                              + scorecard gate (new deps ≥ 5/10)
```

## 2.2 Application Architecture

The declared surface to defend — the starter's `package.json`
dependencies block, with the seeded finding declared with suspicious
precision:

```json
"dependencies": {
  "express": "^4.19.2",
  "pg": "^8.13.0",
  "zod": "^3.23.8",
  "lodash": "4.17.15"
}
```

Everything else uses a caret (`^4.19.2` — "any 4.x at least this new");
lodash is **pinned exactly** (`4.17.15` — "this version and no
other"). An exact pin is a reproducibility choice; it is also exactly
what a seeded vulnerable version looks like. The pin style is kept
after the fix — only the patched version is pinned.

The full tree (`npm ls --all`, 300+ lines on this machine) is the
inventory every later task scans. The application itself imports lodash
once, for `_.cloneDeep` — a deep copy of a database row in
`src/routes/documents.js`.

## 2.3 Security Architecture

| Layer | Tool | What it sees | Blind spot |
|---|---|---|---|
| Known advisories | `npm audit` | Packages with known, disclosed vulnerabilities | Repos that are abandoned but CVE-free (the left-pad class) |
| Tree shape | `npm ls --all` | The full inventory, dedupe state, invalid installs | No verdicts — it is a map, not a scan |
| Resolution | `.npmrc` scope pin | Where each scope resolves | Only the `@docutrust` scope; public names are untouched |
| Upstream health | OpenSSF Scorecard | Mechanical supply-chain hygiene of the source repo | A lens, not the truth — its SAST check counts CodeQL and nothing else |
| Name squatting | `npm view` probes | Registry truth per near-variant name | A snapshot; registry state moves |
| Enforcement | CI `sca` job | Every push/PR, new dependencies | Only checks what the policy names — by design |

## 2.4 CI/CD Flow

The pipeline inherits Project 1's gates and gains the SCA gate:

| Job | Runs | Blocks on |
|---|---|---|
| `build-and-test` | Builds and tests the application | Build or test failure |
| `sast` | semgrep with the custom rule (Project 1) | Any finding |
| `secrets-scan` | gitleaks with `gitleaks.toml`, full history (Project 1) | Any leak |
| `sca` | `npm audit --audit-level=high` + Scorecard gate for new dependencies | High/critical advisory; new dependency scoring < 5/10 or unscoreable |

Full stage-by-stage detail in Section 8.

---

# 3. Prerequisites

## 3.1 Operating System

Linux, macOS, or WSL2 on Windows. A Bash terminal. Project 1's setup
(Node.js ≥ 20, PostgreSQL 16.4, curl, jq, git) is assumed to persist.

## 3.2 Required Tools

| Tool | Required version | Notes |
|---|---|---|
| Node.js / npm | ≥ 20 | From Project 1 |
| PostgreSQL + `psql` | 16.4 | From Project 1 — its state and credentials persist |
| curl, jq, git | any | From Project 1 |
| GitHub CLI (`gh`) | any, authenticated | CI run status; the seeded PR workflow |
| OpenSSF Scorecard CLI | v5.5.0, pinned | Installed in Task 8 from the pinned release |

## 3.3 Required Accounts

- A GitHub account with a fork of `Codelak/docutrust` (Project 1's
  fork works). The CI runs happen on the fork's `main`.
- No new accounts. Registry probes are anonymous; the Scorecard reads
  the GitHub API with a token from `gh auth token`.

## 3.4 Required Permissions

- `sudo` on the machine (one use: move the Scorecard binary to
  `/usr/local/bin/`).
- Write permission on your GitHub fork.

## 3.5 Required Credentials

- Dev database credentials unchanged from Project 1
  (`docutrust` / `docutrust_dev_password`, dev-only).
- `GITHUB_AUTH_TOKEN` for the Scorecard run, exported from the
  authenticated `gh` CLI: `export GITHUB_AUTH_TOKEN=$(gh auth token)`.
- In CI, the same token is `${{ secrets.GITHUB_TOKEN }}` — no manual
  secret management.

## 3.6 Repository Access

- Branch `project2-starter`: finished Project 1 *plus* the seeded
  `lodash@4.17.15` pin — the state this guide assumes. Reset from
  `origin/project2-starter` (Section 5.1).
- Fork `main`: where the CI gate runs.

## 3.7 Environment Variables

| Variable | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://docutrust:docutrust_dev_password@localhost:5432/docutrust` | App database connection (unchanged from Project 1) |
| `GITHUB_AUTH_TOKEN` | `$(gh auth token)` | Scorecard reads the GitHub API (Task 8) |

---

# 4. Environment Preparation

## 4.1 Repository setup

From the existing clone (or clone `github.com/Codelak/docutrust` and
`cd docutrust`), select the starter branch and install from the
lockfile:

**COMMAND:**
```bash
git checkout project2-starter
npm ci
```

`npm ci` installs exactly what the lockfile declares — the professional
reinstall: `node_modules` is disposable, the lockfile is truth.

## 4.2 Database and configuration

The database, `.env.local`, and the `DATABASE_URL` load line are
unchanged from Project 1. The app must be stopped before the smoke
tests of Task 4:

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
set -a && . ./.env.local && set +a
```

> **NOTE:** every checkpoint in this guide carries these two lines. The
> reset contract itself (repo state and database state) is Section 5.

---

# 5. Checkpoints & Rerun Procedure

Read this section once — it fixes re-running for the whole project.

## 5.1 The two-state reset contract

This guide's numbers are reproducible. Two states can drift, and both
need resetting before a stage:

**A. The repository state.** Task 4 changes `package.json` /
`package-lock.json`, Task 6 creates an untracked `.npmrc`, Task 9 edits
`.github/workflows/ci.yml` — all on this branch, in the working tree.
To re-run from the ground truth, discard the changes:

**COMMAND:**
```bash
git checkout project2-starter
git reset --hard origin/project2-starter
git clean -fd          # removes the untracked .npmrc created in Task 6
npm ci
```

`git reset --hard` restores tracked files; `git clean -fd` removes
untracked ones like `.npmrc` — that is the one command the checkout
error message will not suggest. The pair is the honest reset.

> **WARNING:** `git reset --hard` and `git clean -fd` discard every
> change in the working tree. Only deliberate artifacts are committed
> on the branch; anything uncommitted here is noise.

**B. The database state.** Same contract as Project 1: stop the app,
truncate, prove empty:

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
set -a && . ./.env.local && set +a
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM documents;"
```

**EXPECTED RESULT:** the last command prints 0.

Project 1's guide has the same two blocks. They are the habit this
project cements: a baseline that cannot be re-created is a baseline
you cannot trust.

## 5.2 Rerun procedure

**First run.** Follow the tasks in order. The reset contract holds
naturally.

**Safe rerun.** Any task can be re-executed by resetting the state it
touches: repository state via block A, database state via block B.
Scans (`npm audit`, `npm ls`, `npm view`, `scorecard`) are pure readers
and can be re-run at any time; their output depends only on the tree
state and registry/upstream state at that moment.

**Recovery after a partial failure.** If `npm ls` ever reports
`invalid` or `ELSPROBLEMS`, the installed `node_modules` has drifted
from the lockfile — the fix is the professional rule: **the lockfile
is truth, `node_modules` is disposable**.

**COMMAND:**
```bash
npm ci
```

**Complete reset.** Blocks A and B, in that order, restore the exact
starting state.

## 5.3 Idempotency classification

Every command in this guide was reviewed against the question "what
happens if this runs twice?":

| Class | Operations | Rerun behavior |
|---|---|---|
| IDEMPOTENT | `npm audit`, `npm ls`, `npm view`, `scorecard`, `TRUNCATE … RESTART IDENTITY`, `pkill … \|\| true`, the `set -a` load line | Second run is a no-op or a clean re-assertion of the same state |
| IDEMPOTENT (as a reset) | `npm ci`, `git reset --hard origin/project2-starter`, `git clean -fd`, `git checkout project2-starter` | Re-asserts the ground truth; safe to repeat |
| CONDITIONALLY IDEMPOTENT | `npm install lodash@4.18.1 --save-exact` (after the fix is applied, re-running resolves to the same version), the `.npmrc` heredoc (rewrites identical content), `git branch -D` + `git checkout -b` (guarded re-runs) | Second run either confirms the state or is guarded with a check |
| NOT IDEMPOTENT | Appending the `sca:` job to `ci.yml` via heredoc, `gh pr create`, `POST /documents` | Appending a second `sca:` key makes the workflow file invalid — the walkthrough guards it with a `grep` check first (Task 9); a re-run of the seeded-PR block fails on the existing branch/PR and is skipped with one word (Task 10) |

Where a command cannot be made idempotent, this guide documents the
guard or rerun path instead.

---

# 6. Implementation Tasks

Every task begins with a checkpoint that establishes its known starting
state, per Section 5.

## Task 1 — Dependency Baseline

**Project Overview:** You cannot secure a dependency tree you have not
enumerated.

**Project Objective:** List the app's own declarations, then the whole
installed tree — the inventory every later task scans.

**Prerequisites:** Section 4 complete — `project2-starter` checked out,
`npm ci` run.

**Checkpoint — Known Starting State:** branch `project2-starter`,
clean tree, `node_modules` installed from the lockfile.

### Step 1.1 — The declared dependencies

**COMMAND:**
```bash
cat package.json
```

![Figure 6.1: Starter package.json — the dependencies block is the surface to defend, containing the seeded finding, declared with suspicious precision.](../../../project-2/images/08-baseline-packagejson.png)

**EXPECTED RESULT:** the dependencies block as shown in Section 2.2 —
three caret ranges and one exact pin (`lodash: "4.17.15"`).

### Step 1.2 — The whole tree

**COMMAND:**
```bash
npm ls --all
```

`npm ls --all` walks everything: what you declared, what those packages
declared, and what those declared. 300+ lines — this is the tree about
to be scanned. The digest your eyes should cut it to:

**COMMAND:**
```bash
npm ls depth=1
```

![Figure 6.2: npm ls depth=1 — the direct dependencies and their immediate children (the parts you can hold in your head). npm ls --all (304 lines on this machine) is the full inventory; keep its output for Task 3.](../../../project-2/images/09-baseline-tree.png)

**TASK RESULT:** the declared surface and the full inventory are
captured.

## Task 2 — The SCA Scan (Deliverable 1)

**Project Overview:** Which of these packages has a *known, disclosed*
vulnerability?

**Project Objective:** Run the standard SCA tool for npm — `npm audit`
— against the full tree (it scans transitives too, by default, in both
prod and dev) and capture the real output.

**Prerequisites:** Task 1 complete.

**Checkpoint — Known Starting State:** `project2-starter`, clean tree,
tree installed from lockfile.

### Step 2.1 — The scan

**COMMAND:**
```bash
npm audit
```

![Figure 6.3: Real npm audit against lodash@4.17.15 — one aggregate finding, six advisories. Registry data moves over time — the advisory list yours prints may differ by a line — but the shape (1 high, lodash <=4.17.23) is the thing to confirm.](../../../project-2/images/10-audit-finding.png)

**EXPECTED RESULT — real output from the starter state:** one aggregate
finding (the package) over six advisories (the vulnerabilities).

**Reading it like an engineer.** Do not stop at the count — read the
classes and ask what they would mean *in this app*:

- **Prototype pollution** (3 advisories) — an attacker crafts input
  that writes to `Object.prototype`. In Node, polluting a property
  that gets read as a default can become **remote code execution**.
  Classic entry points: `_.merge`, `_.defaultsDeep`, `_.unset`,
  `_.omit`.
- **Command injection** and **code injection** (2 advisories) — through
  lodash's `_.template` function when it compiles templates from
  attacker-influenced strings.
- **ReDoS** (1 advisory) — a crafted string makes lodash's internal
  regex hang, a cheap denial of service.

**The honest question: does this app call any of those functions?**
DocuTrust imports lodash once, for `_.cloneDeep` (a deep copy of a
database row, in `src/routes/documents.js`). None of the six vulnerable
functions is reachable today. So is this a real finding?

**Yes — and this is the professional judgment.** The vulnerable
functions live in the same package, one import away. The day someone
writes `_.merge(req.body, defaults)` — an extremely common refactor —
the app imports a high-severity advisory without a code review
noticing. The pin is deliberately stale. And a `1 high` result fails
any serious pipeline gate (that gate is built in Task 9). The fix is
free. There is no justification to carry it. It is fixed — in Task 4,
properly, not by magic.

### Step 2.2 — Machine-readable output and evidence

The reporting tool consumers are the JSON form:

**COMMAND:**
```bash
npm audit --json
```

A deliverable is not "I saw a finding", it is the output file:

**COMMAND:**
```bash
mkdir -p evidence/10-sca-baseline
npm audit > evidence/10-sca-baseline/npm-audit.txt
npm audit --json > evidence/10-sca-baseline/npm-audit.json
```

> **NOTE — troubleshooting:** `npm ERR! audit ... network` means npm
> could not reach `registry.npmjs.org` — check connectivity/proxy;
> nothing to do with the code. `found 0 vulnerabilities` when you
> expected the finding means the branch's `package.json` already has
> the fix — reset the branch (Section 5.1), then compare with
> `npm ls lodash`. `npm ci` reporting the audit finding but still
> succeeding is normal: `npm ci` warns, it does not gate. The gate
> comes in Task 9.

**TASK RESULT:** Deliverable 1 — full SCA scan with real output,
saved to `evidence/10-sca-baseline/`.

## Task 3 — Transitive Review (Deliverable 2)

**Project Overview:** A dangerous package three levels deep is exactly
what a direct-dependencies-only review misses.

**Project Objective:** Walk the `npm ls --all` tree and look at what
the app's own packages depend on — naming specific packages and stating
a verdict.

**Prerequisites:** Task 1 complete (keep the `npm ls --all` output).

**Checkpoint — Known Starting State:** `project2-starter`, clean tree.

### Step 3.1 — Ask npm for the interesting leaves

The full tree has 300+ entries, but the review is quick if you know
where to look: **the interesting ones are the leaves of popular
packages.** Ask npm for the specific leaves rather than reading 300
lines:

**COMMAND:**
```bash
npm ls path-to-regexp cookie qs pg-native
```

![Figure 6.4: npm ls for the four leaves worth your attention, directly. The UNMET (optional) line for pg-native is itself information: the bindings are not installed because nothing needs them.](../../../project-2/images/12-transitive-leaves.png)

### Step 3.2 — The verdicts

| Transitive package | Via | Why it matters | Verdict |
|---|---|---|---|
| `path-to-regexp@0.1.13` | express | The package behind express's ReDoS chain (CVE-2024-45296, CVE-2024-52960, CVE-2025-46665) | **patched line in use** — 0.1.13 is the fixed version express pins today |
| `cookie@0.7.2` | express | cookie <0.7.0 could corrupt memory on malformed cookies (CVE-2024-47764) | **patched** |
| `qs@6.15.3` | express / body-parser | qs <6.9.1 had prototype pollution (CVE-2022-24999) | **patched, well past** |
| `pg-native` (UNMET OPTIONAL) | pg | Native C++ bindings — only installed if explicitly requested; not in the tree | **absent** — watch item if ever enabled |

Two more observations that matter:

1. **`lodash@4.17.15` has zero dependencies of its own.** It is a leaf.
   Its six advisories live entirely in its own code — no deeper layer
   to inspect.
2. **The tree is single-instance.** Every shared transitive is
   `deduped` — no hidden second copies holding older vulnerable
   versions. That is the situation a naive review silently assumes;
   here, `npm ls --all` *proves* it instead of assuming it.

**Verdict:** no dangerous transitive package found; the single real
finding in the entire tree is the direct lodash pin. That clean
statement is itself a deliverable — a review that names its packages
and states a conclusion, not a wall of names.

> **NOTE — a real incident from the run:** `npm ls` reported
> `ELSPROBLEMS` — "npm error invalid: lodash@4.18.1
> /home/ubuntu/.../node_modules/lodash". The installed `node_modules`
> had drifted from the lockfile (the repo had been reset; the lockfile
> said 4.17.15, the folder held something else). The fix is the
> professional rule — the lockfile is truth, `node_modules` is
> disposable.

**COMMAND:**
```bash
npm ci
```

If `npm ls` ever prints `invalid` or `ELSPROBLEMS`, this is the
reason and this is the fix.

**TASK RESULT:** Deliverable 2 — transitive review with specific
packages named and a stated conclusion, evidence in
`evidence/project-2/11-transitive-review/`.

## Task 4 — Remediate lodash, for Real (Deliverable 3)

**Project Overview:** The finding must actually go away — not be
documented, not be suppressed.

**Project Objective:** The professional fix, in the professional order:
attempt the tool's own fix first, understand why it balks, fix
deliberately, rescan, and **reverify by running the app**.

**Prerequisites:** Task 2 complete.

**Checkpoint — Known Starting State:** `project2-starter`, clean tree,
the audit finding present (`1 high`).

### Step 4.1 — Try npm's suggestion without the dangerous flag

**COMMAND:**
```bash
npm audit fix
```

![Figure 6.5: npm audit fix — "up to date", then the same 1 high severity vulnerability with the hint npm audit fix --force. The exact pin is why: npm audit fix only updates within the declared semver range, and the seeded pin admits no range.](../../../project-2/images/13-audit-fix-nochange.png)

**EXPECTED RESULT — nothing changes.**

**Why does plain `npm audit fix` do nothing?** Because of the exact pin
from Task 1. `npm audit fix` only updates *within the declared semver
range*; `4.17.15` declares no range. Only `--force` overrides, and
`--force` is allowed to do breaking things — the flag you do not type
casually in a pipeline. The teaching point: **exact pins are great for
reproducibility and exactly what makes the automated fixer refuse to
touch you.** You fix by hand.

### Step 4.2 — The deliberate fix

Note `--save-exact`: the pin style is kept — only the *patched* version
is pinned:

**COMMAND:**
```bash
npm install lodash@4.18.1 --save-exact
```

![Figure 6.6: npm install lodash@4.18.1 --save-exact — the pin style kept, the patched version pinned.](../../../project-2/images/14-lodash-install.png)

### Step 4.3 — Rescan. The finding must be gone

**COMMAND:**
```bash
npm audit
```

**EXPECTED OUTPUT:**
```
found 0 vulnerabilities
```

![Figure 6.7: Real rescan after the fix. Registry time-dependence applies both ways: a future advisory against 4.18.1 would change this — the policy (Task 5) and the CI gate (Task 9) exist exactly for that.](../../../project-2/images/16-audit-clean.png)

### Step 4.4 — Reverify, don't trust

Two gotchas, both real:

- A **running app keeps the old version in memory** — restart it so the
  new lodash is actually loaded.
- The route that uses `_.cloneDeep` must still work over HTTP.

**Stop the app, reset the data, start fresh** (the two-command habit
from the top of this guide):

**COMMAND:**
```bash
pkill -f "node src/index.js" || true
set -a && . ./.env.local && set +a
psql "$DATABASE_URL" -c "TRUNCATE documents, comments RESTART IDENTITY CASCADE;"

# in a second terminal, from the project root:
node src/index.js
```

Then the smoke test:

**COMMAND:**
```bash
curl -s -X POST localhost:3000/documents \
  -H 'Content-Type: application/json' \
  -d '{"title":"smoke","body":"after upgrade"}' | jq .
```

![Figure 6.8: id: 1 (deterministic after the truncate), 201, deep-cloned row returned. The fix is verified end to end: the running process has lodash 4.18.1 loaded and the documents route still works.](../../../project-2/images/17-smoke-post-upgrade.png)

**EXPECTED RESULT:** `"id": 1`, HTTP 201, the deep-cloned row returned.

> **NOTE — troubleshooting:** `npm audit fix did nothing` — exact pin;
> see Step 4.1, not a bug. `npm ERR! code EEXIST / EPERM` — a stale
> process holds files; restart the app, remove `node_modules`,
> `npm ci`. App 503s after restart — the database env is not loaded;
> the app does not read `.env.local` itself: run the load line before
> starting.

**TASK RESULT:** Deliverable 3 — lodash remediated, rescan clean,
smoke-tested over HTTP. Evidence: `evidence/project-2/12-lodash-fix/`.

## Task 5 — The SCA Policy (Deliverable 4)

**Project Overview:** One fix is a moment; a policy is what stops the
next finding.

**Project Objective:** Write the threshold down — specific, checkable,
with an exception path — and make CI enforce it (Task 9).

**Prerequisites:** Tasks 1–4 complete.

**Checkpoint — Known Starting State:** the fixed tree (`0
vulnerabilities`).

The policy lives at `docs/project-2/sca-policy.md`. Its load-bearing
numbers:

- **Blocks the build:** any high or critical advisory —
  `npm audit --audit-level=high` must exit 0 on every push and PR.
- **Allowed with justification:** moderate/low advisories, listed in
  the risk report, re-reviewed quarterly.
- **Exceptions:** high/critical only if no patched release exists
  anywhere; written request → explicit maintainer sign-off → expires
  end of quarter.
- **New dependencies:** must pass the audit gate *and* score ≥ 5/10 on
  OpenSSF Scorecard (Tasks 8–9), and get the typosquat review
  (Task 7).

"Fix everything" is not a policy; "use good judgment" is not a policy.
A policy names a command, a threshold, and an approver. This one does —
every term ("block", "fail", "allow with justification") maps to a
specific severity level (`high`), a specific command
(`npm audit --audit-level=high`), a specific score (`5/10`), a
specific approver (the project maintainer).

**TASK RESULT:** Deliverable 4 — `docs/project-2/sca-policy.md`,
written and referenced by the CI gate in Task 9.

## Task 6 — Dependency Confusion Defense (Deliverable 5)

**Project Overview:** npm resolves a package by name against a registry
— and cannot tell "internal package" from "public package with the same
name." If an attacker publishes `@docutrust/shared` on the public
registry, and a developer adds `@docutrust/shared` to package.json,
npm installs the attacker's code. That attack is called **dependency
confusion**, and it works silently.

**Project Objective:** Pin the internal namespace to the private
registry so npm never even *asks* the public registry about it — and
prove the defense live.

**Prerequisites:** Tasks 1–4 complete.

**Checkpoint — Known Starting State:** `project2-starter`, clean tree.

### Step 6.1 — The `.npmrc`

**COMMAND:**
```bash
cat > .npmrc <<'EOF'
@docutrust:registry=https://npm.docutrust.internal/
registry=https://registry.npmjs.org/
EOF
```

In a real organization, the first line points at the org's private
registry — GitHub Packages, Verdaccio, Artifactory — usually behind
auth, which adds a second layer: the auth token is registry-specific,
so a public squat cannot be fetched even by mistake.

### Step 6.2 — Prove it works, don't describe it

Try to resolve an internal-sounding package, with the defense in
place:

**COMMAND:**
```bash
npm config get @docutrust:registry
npm view @docutrust/shared
```

![Figure 6.9: npm fails against the private host (ENOTFOUND ... npm.docutrust.internal) — it never contacted registry.npmjs.org for that scope. Fail-closed: no fallback, no silent shadow.](../../../project-2/images/18-scope-demo.png)

**EXPECTED RESULT:** `ENOTFOUND` against the private host — npm never
contacted the public registry for that scope. Fail-closed: no fallback,
no silent shadow.

Now the control — the same lookup pointed at the public registry
(which is npm's default behavior *without* the `.npmrc`):

**COMMAND:**
```bash
npm view @docutrust/shared --@docutrust:registry=https://registry.npmjs.org/
```

![Figure 6.10: The control: npm asks the public registry. The 404 today is luck — a squat with that name would have returned 200 and been installed. Defense: blocked at the private host. No defense: public registry consulted. That contrast is the demonstration.](../../../project-2/images/19-scope-control.png)

**EXPECTED RESULT:** a 404 from the public registry — today. A squat
with that name would return 200 and be installed. The contrast is the
demonstration.

Normal resolution is untouched:

**COMMAND:**
```bash
npm view lodash version
```

![Figure 6.11: 4.18.1 — the fix from Task 4, and the scope pinning leaves public packages alone.](../../../project-2/images/29-npm-view-lodash-version.png)

**EXPECTED RESULT:** `4.18.1` — public packages are unaffected.

> **NOTE — troubleshooting:** `npm view` of ANY `@docutrust/*` name
> failing with `ENOTFOUND` is correct — that is the defense. To probe
> the public registry deliberately, use the `--@docutrust:registry=`
> override (exactly what Task 7 does). `npm ci` failing after adding
> `.npmrc` happens only if a scoped dependency was added — that is the
> defense refusing; public dependencies are unaffected.

**TASK RESULT:** Deliverable 5 — confusion defense configured and
demonstrated live. Evidence: `evidence/project-2/13-scope-demo/`.

## Task 7 — Typosquatting Check (Deliverable 6)

**Project Overview:** A squatter publishes a near-variant of a popular
name — `loadsh` for `lodash`, `expresss` for `express` — hoping a typo
or autocomplete slips it into a build.

**Project Objective:** Manual review with real registry probes, one
near-variant at a time, each judged.

**Prerequisites:** Tasks 1–6 complete.

**Checkpoint — Known Starting State:** `project2-starter`, clean tree,
`.npmrc` in place (Task 6).

### Step 7.1 — The probe

The probe that answers "does this name exist, who owns it, since
when":

**COMMAND:**
```bash
npm view <name> version time.created maintainers
```

The version/creation metadata is a snapshot — registry state changes
over time (that is exactly why the quarterly re-check is in the
policy).

### Step 7.2 — The verdicts

![Figure 6.12: expresss — v0.0.0, created 2016, personal email. Squat-shaped: placeholder version, years after the original.](../../../project-2/images/20-typosquat-expresss.png)

| Probe | What came back | Verdict |
|---|---|---|
| `npm view expresss` | v0.0.0, created 2016, personal email | **squat-shaped** — placeholder version, 6 years after the original |
| `npm view express1` | v1.0.0, created 2019, QQ-mail owner | **squat-shaped** — one version, disposable-account pattern |
| `npm view js-express` | **Unpublished on 2026-04-03** | published then removed — registry churn, takedown-shaped |
| `npm view xpress` | v2.4.6, 52 versions | **legit alternative framework** — the judgment case |
| `npm view lodashs` | **Unpublished 2020-08-25** | a squat that existed and was removed |
| `npm view lodash-package` | v1.0.0, created **2024-02-01** | **squat-shaped and fresh** |
| `npm view loadsh` | v0.0.4, created 2018 | **the classic documented lodash squat** — still live |
| `npm view zod-js` | v0.0.1-security, created **2026-01-19** | **npm security takedown** — this version name is what npm leaves after removing a malicious package. A real squat, months ago, on a name adjacent to a dependency we actually use. |
| `npm view pg1` | **Unpublished 2023-06-29** | removed squat |
| `npm view js-pg`, `pgs` | 2017 / 2016, single versions | squat-shaped |

![Figure 6.13: loadsh — v0.0.4, created 2018 — the classic documented lodash squat, still live and installed-by-typo shaped.](../../../project-2/images/21-typosquat-loadsh.png)

![Figure 6.14: zod-js — version 0.0.1-security is the marker npm leaves after removing a malicious package — a real squat on a name adjacent to zod, one of our own dependencies.](../../../project-2/images/22-typosquat-zodjs.png)

![Figure 6.15: lodash-package — v1.0.0, created 2024 — squat-shaped and fresh: the name is new enough that a developer could reach for it without knowing it is not the real lodash.](../../../project-2/images/27-typosquat-lodash-package.png)

The judgment skill, in one table:

| Signal | Squat | Legit |
|---|---|---|
| published after the original | yes | possible (fork) |
| version count | 0–1, placeholder `0.0.0` | many, real releases |
| maintainer | unknown / disposable email | known maintainers |
| version `0.0.1-security` | **npm security takedown** | never |

### Step 7.3 — Probe our own namespace

The Task 6 scenario, other side: is there a squat waiting under
`@docutrust/*` on the public registry?

**COMMAND:**
```bash
npm view @docutrust/shared --@docutrust:registry=https://registry.npmjs.org/
# ...utils, config, core, auth
```

![Figure 6.16: 404 Not Found — nothing published under our scope. A genuine negative finding, and the Task 6 scoping is what keeps it negative.](../../../project-2/images/28-scope-check-own-namespace.png)

**Conclusion:** most of the probed near-variants exist or existed; zero
is in our tree. The defense is not luck — it is exact pins, the
lockfile, the audit gate, and the scope pinning, all already in place.
The `zod-js` takedown is the standing reminder that the attack is
live.

> **NOTE — troubleshooting:** an `E404` for a variant means the name is
> free right now — record it and re-check on the next quarterly review.
> Suspicious but few versions — check the maintainer email domain and
> creation date vs. the original: disposable mail + post-original
> creation + one version = squat profile.

**TASK RESULT:** Deliverable 6 — typosquat review with genuine
findings, verdicts, and the negative finding on our own scope.
Evidence: `evidence/project-2/14-typosquat/`.

## Task 8 — OpenSSF Scorecard (Deliverable 7)

**Project Overview:** CVEs say "this version has a known bug." They say
nothing about "this project is abandoned" — the risk class that killed
left-pad-style dependencies.

**Project Objective:** Run the OpenSSF Scorecard, the industry tool
that scores a repository's supply-chain hygiene mechanically, and
**read every check** rather than the headline number.

**Prerequisites:** Tasks 1–7 complete; `gh` authenticated.

**Checkpoint — Known Starting State:** `project2-starter`, clean tree.

### Step 8.1 — Install the pinned CLI

**COMMAND:**
```bash
# install the official CLI (scorecard v5.5.0)
curl -sL https://github.com/ossf/scorecard/releases/download/v5.5.0/scorecard_5.5.0_linux_amd64.tar.gz -o scorecard.tar.gz
tar -xzf scorecard.tar.gz scorecard
sudo mv scorecard /usr/local/bin/
```

### Step 8.2 — Run it against the repository

**COMMAND:**
```bash
export GITHUB_AUTH_TOKEN=$(gh auth token)   # scorecard reads the GitHub API
scorecard --repo github.com/Codelak/docutrust
```

![Figure 6.17: Real scorecard v5.5.0 run. The aggregate is a snapshot — the first run scored 2.6/10, this one 2.9/10 (checks move with repo age and CI activity). The per-check reading is what you learn from, not the number.](../../../project-2/images/23-scorecard-repo.png)

**EXPECTED RESULT — real result (this run): aggregate 2.9 / 10** — 2
checks at 10, the rest at 0 or N/A. Reading it properly, the zeros
split into three honest groups:

1. **Repo youth** — `Maintained` (created <90 days ago),
   `Contributors` (solo project). Structural; they improve with time
   and activity.
2. **Real, cheaply fixable gaps** — `Security-Policy` (no
   `SECURITY.md`), `License` (no `LICENSE`), `Token-Permissions` (no
   `permissions:` blocks), `Pinned-Dependencies` (actions pinned by
   tag, not hash — scored 2/10 after the pinned-hash fix),
   `Dependency-Update-Tool` (no Dependabot). All tracked as
   follow-ups.
3. **Deliberate architecture** — `Code-Review` 0/28 (this repo's
   projects are sequential and CI gates do the blocking; PR-based flow
   is the professional norm and is on the follow-up list). And a
   crucial one to understand: **`SAST` 0/10 even though Project 1 runs
   semgrep and gitleaks in CI** — Scorecard's SAST check counts CodeQL
   and nothing else. Your gates are real; this particular lens cannot
   see them. **A score is a lens, not the truth.**

The full per-check reading is in
`evidence/project-2/15-scorecard/README.md`.

> **NOTE — troubleshooting:** `scorecard: command not found` — the tar
> extracts a binary named `scorecard`; check the extraction path.
> Scorecard exiting with GitHub API errors — the token: `gh auth
> status`; if unauthenticated, `gh auth login` and export the token as
> above. Scores differing run to run — `Maintained` and
> `Vulnerabilities` move with the repo's age and open alerts;
> `CI-Tests`/`Code-Review` need PR activity. Same tool, same repo,
> later date — different snapshot. That is normal.

**TASK RESULT:** Deliverable 7 — scorecard run, every check read and
categorized. Evidence: `evidence/project-2/15-scorecard/`.

## Task 9 — The Policy Becomes a Gate (Deliverable 8)

**Project Overview:** A threshold nobody enforces is a suggestion.

**Project Objective:** Wire both gates into CI so every push and PR is
judged automatically: the new `sca` job in
`.github/workflows/ci.yml`, next to Project 1's `sast` and
`secrets-scan` jobs.

**Prerequisites:** Tasks 5 and 8 complete (policy written, scorecard
installed and understood).

**Checkpoint — Known Starting State:** `project2-starter`, clean tree,
deliberate changes from Tasks 4 and 6 present
(`package.json`/`package-lock.json` fixed, `.npmrc` created).

### Step 9.1 — The CVE gate, one line

The policy's §1 verbatim:

**COMMAND:**
```yaml
- name: npm audit gate (policy §1 — high/critical blocks)
  run: npm audit --audit-level=high
```

`npm audit` exits non-zero on a high/critical finding → the job fails →
the workflow fails → the merge is blocked. That non-zero exit *is* the
gate.

### Step 9.2 — The health gate for new dependencies

Policy §5. Read it line by line; it is five ordinary tools in
sequence:

**COMMAND:**
```yaml
- name: Scorecard gate — new dependencies must score >= 5/10 (policy §5)
  env:
    GITHUB_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    set -euo pipefail
    threshold=5

    # 1. Which dependencies are NEW in this branch?
    base="$(git show origin/main:package.json 2>/dev/null \
              | jq -r '.dependencies + .devDependencies | keys[]' || true)"
    now="$(jq -r '.dependencies + .devDependencies | keys[]' package.json)"
    new_deps="$(comm -13 <(printf '%s\n' "$base") <(printf '%s\n' "$now"))"

    if [ -z "$new_deps" ]; then
      echo "scorecard gate: no new dependencies vs main — pass"
      exit 0
    fi

    # 2. Score each new dependency with the official scorecard CLI.
    failed=0
    for dep in $new_deps; do
      score="$(scorecard --npm "$dep" --format json | jq -r '.score')"
      if [ "$score" = "null" ]; then
        echo "  FAIL  $dep — no score obtainable: manual review required"
        failed=1
      elif awk -v s="$score" -v t="$threshold" 'BEGIN { exit !(s >= t) }'; then
        echo "  PASS  $dep — score $score"
      else
        echo "  FAIL  $dep — score $score below threshold $threshold"
        failed=1
      fi
    done

    [ "$failed" = 0 ] || { echo "scorecard gate FAILED — sca-policy.md §5"; exit 1; }
    echo "scorecard gate: pass"
```

**Decoding it:** `git show origin/main:package.json` fetches the main
branch's dependency list; `jq` turns both lists into sorted names;
`comm -13` prints names that exist *only* in the new list (the "new
dependencies"); the loop runs the official `scorecard --npm <pkg>` for
each; `jq -r '.score'` reads the aggregate; `awk` does the numeric
comparison; any score below 5 (or no score at all — fail-closed) marks
`failed`; the step exits 1 → red run.

### Step 9.3 — Add the job

Check first — a second `sca:` key makes the whole file invalid (GitHub
Actions rejects duplicate job keys outright), then append through a
heredoc so the whole block lands as typed:

**COMMAND:**
```bash
grep -n "sca:" .github/workflows/ci.yml || echo "sca not present — safe to add"
```

**COMMAND:**
```bash
cat >> .github/workflows/ci.yml <<'EOF'

  # DevSecOps Project 2 (SCA): dependency gates. Enforced policy is
  # docs/project-2/sca-policy.md.
  sca:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci
      - name: npm audit gate (policy §1 — high/critical blocks)
        run: npm audit --audit-level=high
      - name: Install OpenSSF Scorecard
        run: |
          curl -sL https://github.com/ossf/scorecard/releases/download/v5.5.0/scorecard_5.5.0_linux_amd64.tar.gz -o scorecard.tar.gz
          tar -xzf scorecard.tar.gz scorecard
          sudo mv scorecard /usr/local/bin/
      - name: Scorecard gate — new dependencies must score >= 5/10 (policy §5)
        env:
          GITHUB_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          threshold=5
          base="$(git show origin/main:package.json 2>/dev/null | jq -r '.dependencies + .devDependencies | keys[]' || true)"
          now="$(jq -r '.dependencies + .devDependencies | keys[]' package.json)"
          new_deps="$(comm -13 <(printf '%s\n' "$base") <(printf '%s\n' "$now"))"
          if [ -z "$new_deps" ]; then
            echo "scorecard gate: no new dependencies vs main — pass"
            exit 0
          fi
          failed=0
          for dep in $new_deps; do
            score="$(scorecard --npm "$dep" --format json | jq -r '.score')"
            if [ "$score" = "null" ]; then
              echo "  FAIL  $dep — no score obtainable: manual review required"
              failed=1
            elif awk -v s="$score" -v t="$threshold" 'BEGIN { exit !(s >= t) }'; then
              echo "  PASS  $dep — score $score"
            else
              echo "  FAIL  $dep — score $score below threshold $threshold"
              failed=1
            fi
          done
          [ "$failed" = 0 ] || { echo "scorecard gate FAILED — sca-policy.md §5"; exit 1; }
          echo "scorecard gate: pass"
EOF
```

Then verify the job landed exactly once:

**COMMAND:**
```bash
grep -c "sca:" .github/workflows/ci.yml
```

**EXPECTED RESULT:** `1`.

### Step 9.4 — Get the work to a CI runner

The clean way, on your own fork: your fork's `main` is *your* sandbox
— push the starter's finished state there; the fork's `origin/main`
only needs your copy, and upstream `main` is the reference compared
against:

**COMMAND:**
```bash
# commit the deliberate changes first
git add package.json package-lock.json .npmrc .github/workflows/ci.yml docs/project-2/
git commit -m "p2: lodash fix, scope pin, sca gate in CI"

# make sure the gates are also in what will be tested, on your sandbox main:
git checkout main
git merge project2-starter
git push origin main
gh run list --workflow ci.yml -L 3
```

If the fork's `main` already contains the finished state, the merge is
a no-op and the finished run on the fork is the green baseline. What
matters for the deliverable is the *red* one in Task 10.

![Figure 6.18: Real gh run view of a main run — all four jobs: build-and-test, sast, secrets-scan, sca — green. On your fork, substitute your own latest run ID from gh run list.](../../../project-2/images/26-ci-green-scajob.png)

**EXPECTED RESULT:** the run is green, `sca` among the jobs.

> **NOTE — troubleshooting:** the sca job failing with "no new
> dependencies" never printed — the diff failed:
> `git show origin/main:package.json` needs the main branch present in
> the checkout; the job uses `fetch-depth: 0` for exactly this reason.
> A healthy new dependency failing with "no score obtainable" —
> scorecard could not find the package's source repo (or it is not on
> GitHub); fail-closed is deliberate, per policy §5. `jq: command not
> found` on your laptop — install it; GitHub runners ship it
> preinstalled.

**TASK RESULT:** Deliverable 8 — policy enforced in CI, green on the
sandbox `main`. Evidence: `evidence/project-2/16-ci-gates/`.

## Task 10 — Prove the Gate Blocks (Deliverable 9)

**Project Overview:** A gate that has never failed anything is a rumor.
The brief demands proof: a deliberately risky dependency, added on a
branch, must be blocked before it could reach main.

**Project Objective:** Seed one, let the gate do its job, read the
failure, revert.

**Prerequisites:** Task 9 complete — `sca` job green on the fork's
`main`.

**Checkpoint — Known Starting State:** fork `main` green with the `sca`
job; upstream `main` is the reference.

### Step 10.1 — Pick the seed

`left-pad@1.3.0` — a real package with a famous story (the 2016 npm
incident that broke the ecosystem), an archived repository, and a real
scorecard score that can be measured:

**COMMAND:**
```bash
scorecard --npm left-pad --format json | jq -r .score
# 4.2   <- below the 5/10 threshold, and npm audit passes it (no CVEs!)
```

![Figure 6.19: scorecard --npm left-pad = 4.2. Check it yourself — the score drifts with upstream repo state, which is precisely why the policy says "≥5" rather than quoting a number forever.](../../../project-2/images/24-leftpad-score.png)

**That last part is the point:** left-pad has no known CVEs, so the
npm audit gate will let it through. Only the scorecard gate can catch
it — an abandoned repository is exactly the risk class the CVE
database cannot see.

### Step 10.2 — Seed it on a branch, open the PR

Guarded — re-running the block while the branch already exists is a
normal failure that can be skipped with one word:

**COMMAND:**
```bash
git branch -D seed-risky-dep 2>/dev/null && echo "old branch removed"
git checkout -b seed-risky-dep
npm install left-pad@1.3.0 --save-exact
git add package.json package-lock.json
git commit -m "seed risky dependency"
git push origin seed-risky-dep
gh pr create --title "Seed risky dependency (left-pad) — SCA gates must block" --body "Intentional seed: left-pad has no CVEs (npm audit passes) but scores 4.2/10."
```

The `--title` is not optional polish: PR titles are what you grep for
in run lists afterwards.

### Step 10.3 — Read the failure

CI runs on the PR. The sca job's log:

```
npm audit gate (policy §1)          -> found 0 vulnerabilities      (passes!)
Scorecard gate: scoring new dependencies:
  - left-pad
  FAIL  left-pad — score 4.2 below threshold 5 (policy §5)
scorecard gate FAILED — docs/project-2/sca-policy.md §5
```

![Figure 6.20: Real run view of the seeded PR (the original one: run 32432495761) — X Process completed with exit code 1 on the sca job, while npm even added corroboration at install time (npm warn deprecated left-pad@1.3.0). Open the failure detail with gh run view 32432495761 --log-failed on the exact run you just made.](../../../project-2/images/25-ci-red-leftpad.png)

**EXPECTED RESULT:** `sca` job red; the npm audit gate passed (no CVEs)
— the scorecard gate caught what the CVE database cannot see.

### Step 10.4 — The professional close-out

Never hardcode the PR number; ask GitHub (a re-run in the same repo
gets a fresh number, and PRs do not restart at 1):

**COMMAND:**
```bash
PR=$(gh pr view --json number -q .number)
gh pr close "$PR" --comment "Blocked by the scorecard gate (4.2 < 5). Intentional seed."
gh pr delete "$PR" --yes
git checkout main
git branch -D seed-risky-dep
git branch -r --merged | grep seed-risky-dep && git push origin --delete seed-risky-dep || true
```

The seeded dependency never touched main. The gate proved itself.

> **NOTE — troubleshooting:** the PR run green when red was expected —
> did `npm install` actually add the package, and does the branch's
> package.json differ from main? The gate scores *new* names; a
> dependency that already existed on main is deliberately not
> re-scored. The sca job failing at `npm ci`, before the gates — a
> scoped `@docutrust/*` name was seeded; the Task 6 `.npmrc` defense
> refused it at install. That is the *other* gate working; either
> failure mode is a legitimate demonstration. `gh pr create` saying a
> PR already exists — a previous run was interrupted before the
> close-out; finish the close-out block first; never delete a live PR
> by hand — close and delete it through `gh pr`.

**TASK RESULT:** Deliverable 9 — seeded dependency blocked before
merge, PR closed, branch deleted, evidence saved
(`evidence/project-2/16-ci-gates/run-seeded-PR-FAILED.txt`).

## Task 11 — The Report (Deliverable 10)

**Project Overview:** All of this has to hand over to Project 3 with a
clean, current baseline.

**Project Objective:** One report —
`docs/project-2/final-findings-report.md` — that any engineer can read
in five minutes: what was found, what was fixed, what is enforced, and
the exact dependency list Project 3 starts from.

**Prerequisites:** Tasks 1–10 complete.

Fill the table from *your* lockfile, not this guide's — versions
drift, and a report that guesses is worse than a report that takes one
minute to verify:

**COMMAND:**
```bash
npm ls --depth=0 2>/dev/null | head -8
```

| Package | Version | Pin | Audit | Scorecard |
|---|---|---|---|---|
| express | 4.22.2 | ^4.19.2 | clean | 8.2 |
| pg | 8.23.0 | ^8.13.0 | clean | 5.7 |
| zod | 3.25.76 | ^3.23.8 | clean | 5.3 |
| lodash | 4.18.1 | exact | clean | 6.8 |
| @jazzer.js/core (dev) | 4.0.0 | ^4.0.0 | clean | 6.0 |

`npm audit` → **0 vulnerabilities.** That is the baseline Project 3's
runtime conclusions will stand on.

**TASK RESULT:** Deliverable 10 — final dependency risk report with
the verified baseline and the Project 3 handoff.

---

# 7. Security Findings & Fixes

## 7.1 Findings summary

| Finding | Tool | Result | Verified? | Action |
|---|---|---|---|---|
| `lodash@4.17.15` exact pin | `npm audit` | 1 high, 6 advisories (3 prototype pollution, 2 command/code injection, 1 ReDoS) | Yes — no vulnerable function reachable today (only `_.cloneDeep` used), but one common refactor away | Fixed — `4.18.1` exact pin, rescan clean, smoke-tested |
| Transitive packages | `npm ls` review | `path-to-regexp` 0.1.13 patched; `cookie` 0.7.2 patched; `qs` 6.15.3 patched; `pg-native` absent | Yes — named per package | None needed — clean statement is the deliverable |
| Near-variant names | `npm view` probes | 6 squat-shaped, 2 removed squats, 1 npm security takedown (`zod-js`), 1 legit alternative | Yes — registry truth per name | None in tree; quarterly re-check in policy |
| `@docutrust/*` namespace | `npm view` against public registry | 404 — nothing published | Yes — genuine negative | Scope pin keeps it negative |
| DocuTrust repo health | OpenSSF Scorecard | 2.9/10 — 2 checks at 10, rest 0/N/A | Yes — every check read | Youth items age out; cheap gaps tracked; deliberate architecture documented |
| `left-pad@1.3.0` (seed) | CI `sca` job | npm audit passes (no CVEs); scorecard 4.2 < 5 | Yes — red run, real log | Blocked, PR closed, branch deleted |

Scanner output alone is not a verdict: the lodash finding was judged
against actual usage (one import, `_.cloneDeep`), the typosquats were
judged name by name, and the scorecard number was read check by check
before any conclusion.

## 7.2 Fix record — lodash

1. **Vulnerability:** high-severity advisory on `lodash@4.17.15` —
   prototype pollution, command injection, code injection, ReDoS.
2. **Evidence:** `npm audit` — one aggregate finding over six
   advisories (Figure 6.3).
3. **Root cause:** an exact pin to a stale version, from before the
   fixed releases. The exact pin is also why `npm audit fix` refuses
   to touch it — it only updates within the declared semver range,
   and `4.17.15` declares no range (Figure 6.5).
4. **Remediation:** deliberate upgrade to the patched version,
   keeping the pin style: `npm install lodash@4.18.1 --save-exact`.
5. **Code change:** `package.json` / `package-lock.json` — lodash
   `4.17.15` → `4.18.1` (Figure 6.6).
6. **Validation:** `npm audit` → `found 0 vulnerabilities`
   (Figure 6.7); app restarted (a running process keeps the old
   version in memory) and the `_.cloneDeep` route smoke-tested over
   HTTP — id 1, 201, deep-cloned row (Figure 6.8).
7. **Security result:** the audit gate passes; the fix is verified
   end to end, not by inspection. Registry time-dependence applies
   both ways — the policy and the CI gate exist for the next
   advisory.

## 7.3 The SCA policy, in force

`docs/project-2/sca-policy.md` (Task 5), enforced in CI (Task 9):

| Policy clause | Threshold | Enforced by |
|---|---|---|
| §1 — blocks the build | any high/critical advisory | `npm audit --audit-level=high` (non-zero exit fails the job) |
| §2 — allowed with justification | moderate/low, listed in the risk report, quarterly review | report + review cadence |
| §4 — exceptions | only if no patched release exists; written request, explicit maintainer sign-off, expires end of quarter | maintainer approval |
| §5 — new dependencies | audit gate + Scorecard ≥ 5/10 + typosquat review + `@docutrust` scope for internal packages | CI scorecard gate (fail-closed on unscoreable) |
| §6 — cadence | every push/PR audit; every PR adding a dependency scorecard; quarterly full review | CI + calendar |

## 7.4 The judgment calls

- **lodash "not reachable today" ≠ "not a finding."** The vulnerable
  functions are one import away; the pin is deliberately stale; the
  fix is free. Professional judgment: fix it.
- **Typosquat verdicts are case-by-case.** `xpress` is a legit
  alternative framework with 52 versions; `expresss` is squat-shaped
  (placeholder version, 2016); `zod-js` carries npm's own
  `0.0.1-security` takedown marker. The signal table (Section 7.1 /
  Task 7) is the skill.
- **Scorecard 2.9/10 is a lens, not a verdict.** `SAST` 0/10 despite
  real semgrep + gitleaks gates (Scorecard counts CodeQL only);
  `Code-Review` 0/28 by design (sequential projects, CI gates do the
  blocking). A score is read per check, never in aggregate.
- **left-pad proved the gate's blind-spot coverage.** No CVEs — the
  audit gate passes it; only the scorecard gate catches an abandoned
  repository.

---

# 8. CI/CD

## 8.1 Pipeline stages

Workflow `ci.yml`, GitHub Actions. Every push to the fork's `main` and
every pull request runs all four jobs:

| Stage | Purpose | Tool | Input | Output | Failure condition |
|---|---|---|---|---|---|
| `build-and-test` | Application builds and tests pass | Node.js on ubuntu-latest | repository | green build | build/test failure |
| `sast` | No known vulnerability patterns | semgrep with `semgrep/rules/` (Project 1) | `src/` | finding count | any finding |
| `secrets-scan` | No credentials in tree or history | gitleaks with `gitleaks.toml`, full history (Project 1) | repository + git history | leak count | any leak |
| `sca` | Policy §1: no high/critical advisories | `npm audit --audit-level=high` | `package-lock.json` + registry | audit exit code | non-zero (high/critical) |
| `sca` — step 2 | Policy §5: new deps score ≥ 5/10 | `scorecard --npm <dep>` per new name, `jq`/`awk`/`comm` plumbing | diff of `package.json` vs `origin/main` | per-dep PASS/FAIL | any score < 5, or no score (fail-closed) |

The enforcement mechanism is the non-zero exit code: the step fails
the job, the job fails the workflow, the workflow blocks the merge.

## 8.2 The gate's two halves

The `sca` job's two steps cover two different risk classes:

1. **The audit gate** — known, disclosed vulnerabilities. One line:
   `npm audit --audit-level=high`. It cannot see abandoned-but-clean
   repositories.
2. **The scorecard gate** — upstream health for **new** dependencies
   only (names present in the branch's `package.json` but not on
   `origin/main`). It is fail-closed: an unscoreable dependency needs
   maintainer documentation per policy §5.

## 8.3 Gate proof

- **Green on good code:** the finished state pushed to the fork's
  `main` — all four jobs green (Figure 6.18).
- **Red on bad code:** the seeded `left-pad@1.3.0` PR — the audit gate
  passes ("found 0 vulnerabilities"), the scorecard gate fails
  ("score 4.2 below threshold 5") — real output saved, PR closed,
  branch deleted (Figure 6.20).

---

# 9. Troubleshooting

Separated into first-time setup and re-run/recovery — the traps differ.

## 9.1 First-time setup

| Error / Symptom | Cause | Resolution | Related step |
|---|---|---|---|
| `npm ERR! audit ... network` | npm cannot reach `registry.npmjs.org` | Check connectivity/proxy — nothing to do with the code | 2.1 |
| `found 0 vulnerabilities` when the finding was expected | The branch's `package.json` already has the fix (Task 4 done, or on `main`) | Reset the branch (Section 5.1), then compare `npm ls lodash` | 2.1 |
| `scorecard: command not found` | The tar's binary was not moved | Check the extraction path; `sudo mv scorecard /usr/local/bin/` | 8.1 |
| scorecard exits with GitHub API errors | Missing or expired token | `gh auth status`; if unauthenticated, `gh auth login`, then export `GITHUB_AUTH_TOKEN=$(gh auth token)` | 8.2 |
| `jq: command not found` | Not installed | Install it; GitHub runners ship it preinstalled | 9.2 |

## 9.2 Re-run / recovery

| Error / Symptom | Cause | Resolution | Related step |
|---|---|---|---|
| `npm error invalid: lodash@...` / `ELSPROBLEMS` from `npm ls` | `node_modules` drifted from the lockfile | The lockfile is truth, `node_modules` is disposable — `npm ci` | 3.2 |
| `npm audit fix` did nothing | Exact pin declares no semver range | Not a bug — fix deliberately: `npm install lodash@<patched> --save-exact` | 4.1 |
| `npm ERR! code EEXIST / EPERM` | A stale process holds files | Restart the app, remove `node_modules`, `npm ci` | 4.4 |
| App 503s after restart | Database env not loaded (the app does not read `.env.local` itself) | `set -a && . ./.env.local && set +a` before starting | 4.4 |
| `npm view` of ANY `@docutrust/*` fails with `ENOTFOUND` | The defense working | That is the defense — to probe the public registry deliberately use the `--@docutrust:registry=` override | 6.2 |
| `npm ci` fails after adding `.npmrc` | A scoped dependency was added | The defense refusing — public dependencies are unaffected | 6.2 |
| `npm view` of a variant returns `E404` | The name is free right now | Record it; re-check on the next quarterly review | 7.2 |
| Scores differ run to run | `Maintained`/`Vulnerabilities` move with repo age; `CI-Tests`/`Code-Review` need PR activity | Normal — same tool, same repo, later date, different snapshot | 8.2 |
| sca job fails with "no new dependencies" never printed | `git show origin/main:package.json` failed — main branch not in the checkout | The job uses `fetch-depth: 0` for exactly this reason | 9.3 |
| New dependency fails with "no score obtainable" | scorecard cannot find the source repo (or it is not on GitHub) | Fail-closed is deliberate — unscoreable needs maintainer documentation, policy §5 | 9.2 |
| PR run green when red was expected | The package was not actually new — the gate scores names not on main | Check `npm install` added it and the branch's package.json differs from main | 10.3 |
| sca job fails at `npm ci` before the gates | A scoped `@docutrust/*` name was seeded — the `.npmrc` refused it | The other gate working; either failure mode is a legitimate demonstration | 10.2 |
| `gh pr create` says a PR already exists for this branch | A previous run was interrupted before the close-out | Finish the close-out block first; never delete a live PR by hand — close and delete through `gh pr` | 10.4 |

---

# 10. Evidence Index

| Stage → Task | Deliverable | Evidence |
|---|---|---|
| 2 → Task 2 | 1 — full SCA scan, real output | `evidence/project-2/10-sca-baseline/` |
| 3 → Task 3 | 2 — transitive review, specific packages named | `evidence/project-2/11-transitive-review/` |
| 4 → Task 4 | 3 — lodash remediated, rescan clean, smoke-tested | `evidence/project-2/12-lodash-fix/` |
| 5 → Task 5 | 4 — SCA policy, checkable thresholds | `docs/project-2/sca-policy.md` |
| 6 → Task 6 | 5 — confusion defense configured + demonstrated | `evidence/project-2/13-scope-demo/` |
| 7 → Task 7 | 6 — typosquat review, genuine findings | `evidence/project-2/14-typosquat/` |
| 8 → Task 8 | 7 — scorecard run, every check read | `evidence/project-2/15-scorecard/` |
| 9 → Task 9 | 8 — scorecard policy enforced in CI | `evidence/project-2/16-ci-gates/` |
| 10 → Task 10 | 9 — seeded dep blocked before merge | `evidence/project-2/16-ci-gates/run-seeded-PR-FAILED.txt` |
| 11 → Task 11 | 10 — final dependency risk report | `docs/project-2/final-findings-report.md` |
| 1–11 | real terminal screenshots | `docs/project-2/images/` (Figures 6.1–6.20) |

The paths above are the committed reference evidence. On
`project2-starter` those directories do not exist — that is
intentional: your evidence is the output you save with the redirects
this guide marks ("save your evidence as you go"). Name your
directories the same way so your deliverable map matches this one.

---

# 11. Final Verification

Run this checklist before declaring the implementation complete:

**Environment**
- [ ] Branch `project2-starter`, clean tree
- [ ] `npm ls --all` runs without `invalid` / `ELSPROBLEMS`
- [ ] `gh auth status` authenticated; `GITHUB_AUTH_TOKEN` exportable
- [ ] Scorecard CLI v5.5.0 on PATH (`scorecard --version`)

**Application**
- [ ] Post-upgrade smoke test: `POST /documents` → id 1, 201, deep-cloned row
- [ ] App restarted after the lodash change (old version would linger in memory)

**Security**
- [ ] `npm audit` → `found 0 vulnerabilities`
- [ ] lodash pinned to `4.18.1` exact (`npm ls lodash`)
- [ ] `.npmrc` scope pin in place; `npm view @docutrust/shared` fails against the private host
- [ ] Typosquat review recorded with verdicts; `@docutrust/*` namespace 404 on public registry
- [ ] Scorecard run captured and every check read (three groups: youth / cheap gaps / deliberate)
- [ ] `docs/project-2/sca-policy.md` written with checkable thresholds

**CI/CD**
- [ ] Fork `main` run green: `build-and-test`, `sast`, `secrets-scan`, `sca`
- [ ] Seeded `left-pad@1.3.0` PR proven red on the scorecard gate (4.2 < 5); PR closed, branch deleted
- [ ] `grep -c "sca:" .github/workflows/ci.yml` → 1

**Evidence**
- [ ] Evidence directories 10–16 saved and complete
- [ ] `docs/project-2/final-findings-report.md` written with the verified dependency table — the baseline Project 3 starts from
