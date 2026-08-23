# S1 — Full SCA scan: reading the output like an engineer

**Run:** `npm audit` — full tree, direct and transitive, prod and dev.
Raw output: `npm-audit.txt` (human) and `npm-audit.json` (machine).
Screenshot: `docs/project-2/images/08-npm-audit-finding.png`.

## What the scan found

**One package, one finding:**

```
lodash  <=4.17.23   Severity: high   (direct dependency, exact pin 4.17.15)
1 high severity vulnerability
```

npm reports the aggregate as 1 high; the JSON breaks it out into
**6 advisories** (3 high, 3 moderate) against the installed 4.17.15:

| Severity | Advisory | Vulnerable function(s) |
|---|---|---|
| high | Command Injection (GHSA-35jh-r3h4-6jhm) | `_.template` |
| high | Prototype Pollution (GHSA-p6mc-m468-83gw) | `_.defaultsDeep`, `_.merge` |
| moderate | ReDoS (GHSA-29mw-wpgm-hmr9) | `_.template` |
| high | Code Injection via `_.template` imports (GHSA-r5fr-rjxr-66jc) | `_.template` |
| moderate | Prototype Pollution via array path bypass (GHSA-f23m-r3pf-42rh) | `_.unset`, `_.omit` |
| moderate | Prototype Pollution (GHSA-xxjr-mmjv-4gpg) | `_.unset`, `_.omit` |

## Reading it: how bad is this *for DocuTrust*?

The honest read, function by function:

- The app imports lodash once and calls exactly one function:
  `_.cloneDeep(result.rows[0])` at `src/routes/documents.js:28`.
- **None of the six vulnerable functions (`_.template`, `_.merge`,
  `_.defaultsDeep`, `_.unset`, `_.omit`) is called anywhere in the
  codebase today.** `cloneDeep` is not in any advisory range.
- So today's *exploitability* is low: an attacker cannot reach any of
  these code paths through this app's current behavior.

That does **not** make it a non-finding. The professional reasons it
gets fixed, immediately:

1. **Prototype pollution is RCE in Node.** The vulnerable functions
   are *in the same package, one import away*. The first future change
   that uses `_.merge` (deep-merging request bodies is a classic
   refactor) imports a high-severity advisory into a live app without
   anyone noticing.
2. **The pin is exact and deliberately outdated** — `"lodash": "4.17.15"`
   with no caret. This is the seeded finding from Project 1, still in
   the tree.
3. **It fails any real gate.** `npm audit --audit-level=high` exits
   non-zero. In a real pipeline this dependency alone blocks every
   merge — which is exactly what the SCA policy (S4) enforces.
4. **The fix is free.** lodash 4.18.1 is the patched line; the bump is
   *not* a semver-major change (`fixAvailable.isSemVerMajor: false`),
   and `_.cloneDeep` keeps the same signature. No code change, no
   risk, no reason to stay vulnerable.

## Why `npm audit fix` alone will not fix it (important)

npm's own suggestion is `npm audit fix --force`. Why force?

```
fix available via `npm audit fix --force`
Will install lodash@4.18.1, which is outside the stated dependency range
```

The pin is **exact** (`4.17.15`, no `^`). `npm audit fix` only performs
semver-compatible updates *inside* the declared range; an exact pin
has no range to move within, so plain `npm audit fix` does nothing.
Only `--force` overrides this — and `--force` is allowed to break
things, so a real engineer does the fix by hand instead (S3) and
verifies it.
