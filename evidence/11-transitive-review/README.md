# S2 — Transitive dependency review: walking the tree like an engineer

**Run:** `npm ls --all` (full tree) and `npm ls --depth=1` (direct deps +
one transitive layer). Full output: `npm-ls-all.txt` (304 lines),
`npm-ls-depth1.txt`. Screenshot: `docs/project-2/images/09-npm-ls-tree.png`.

> **Troubleshooting note that happened during this stage:** the first
> `npm ls --all` ended with `npm error invalid: lodash@4.18.1` — the
> installed `node_modules` had drifted from the lockfile (the repo had
> been reset). `node_modules` is disposable; the lockfile is truth.
> Fix: `npm ci`. If `npm ls` ever prints `ELSPROBLEMS`/`invalid`, that
> is the reason and this is the fix.

## The direct dependencies (package.json)

| Package | Version | Role |
|---|---|---|
| express | ^4.19.2 → 4.22.2 | HTTP framework (prod) |
| pg | ^8.13.0 → 8.23.0 | Postgres client (prod) |
| zod | ^3.23.8 → 3.25.76 | Request validation (prod) |
| lodash | **4.17.15 (exact pin)** | `_.cloneDeep`, src/routes/documents.js (prod) |
| @jazzer.js/core | ^4.0.0 → 4.0.0 | Fuzzing harness (dev only) |

## Transitive packages reviewed (specific, from the real tree)

1. **lodash@4.17.15 — zero transitive dependencies.** It is a leaf in
   the tree. Its 6 advisories (S1) live entirely in its own code; there
   is no deeper lodash layer to inspect. **Concern: high (seeded; fixed
   in S3).**

2. **path-to-regexp@0.1.13 — via express.** This is the package behind
   the express route-parsing ReDoS chain (CVE-2024-45296,
   CVE-2024-52960, CVE-2025-46665). 0.1.13 is the **patched** line that
   express 4.22.2 pins. How we know it is patched without guessing:
   `npm audit` covers the transitive tree and reported nothing for it.
   **Concern: none — patched version in use.**

3. **cookie@0.7.2 — via express.** cookie <0.7.0 carried
   CVE-2024-47764 (malformed cookies can corrupt memory). 0.7.2 is
   patched. **Concern: none.**

4. **qs@6.15.3 — via express (and body-parser).** qs <6.9.1 / <6.10.3
   had prototype pollution (CVE-2022-24999). 6.15.3 is far past the
   patched line, deduped to a single instance. **Concern: none.**

5. **pg-native@>=3.0.1 — UNMET OPTIONAL, via pg.** Only installed if
   the native (C++) bindings are explicitly requested; it is not
   present in the tree and pg works without it. Flagged as a watch
   item: if a future change enables it, that decision gets a review.
   **Concern: none at present.**

6. **@babel/* 7.29.x family — via @jazzer.js/core (dev only).** The
   only genuinely deep subtree, pulled by the fuzzing toolchain
   (babel core/generator/traverse, istanbul, cmake-js, tar…). Current
   releases, dev-only, never shipped. **Concern: none.**

## Structure observation

The tree is **single-instance throughout** — every shared transitive
package is `deduped`, so there are no hidden second copies holding
older vulnerable versions and no version-drift bloat. A package
appearing twice at different versions is precisely the situation a
direct-dependencies-only review misses; here, `npm ls --all` confirms
it does not exist.

## Verdict

No dangerous transitive package found. The single real finding in the
whole tree — direct or transitive — is the seeded lodash@4.17.15 pin,
which S3 removes. The tree being otherwise current is the baseline
Project 3 inherits (S10).
