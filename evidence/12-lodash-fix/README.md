# S3 — Lodash remediated: the fix journey and reverification

Screenshot: `docs/project-2/images/10-lodash-fix-clean.png`.

## The journey (why this order)

1. **`npm audit fix` (no `--force`)** — did *nothing*. The pin is exact
   (`4.17.15`, no caret), so there is no semver range to move within;
   only `--force` would override, and `--force` is allowed to break
   things. Evidence: `npm-audit-fix-noforce.txt`.
2. **The deliberate fix** — `npm install lodash@4.18.1 --save-exact`.
   The patched line is a minor bump (`fixAvailable.isSemVerMajor:
   false`), same API, no code change required. package.json now pins
   `"lodash": "4.18.1"`. Evidence: `npm-install-and-rescan.txt`.
3. **Rescan** — `npm audit` → **0 vulnerabilities**. Finding gone.
4. **Reverify, not trust** — the app was restarted (the old process
   had loaded lodash 4.17.15 into memory) and the real route that uses
   `_.cloneDeep` was exercised over HTTP: `POST /documents` → 201 with
   the cloned row; `GET /documents/:id` → 200. Evidence:
   `smoke-test.txt`.
5. The load-bearing comment at `src/routes/documents.js:20` was
   updated so the code no longer claims the outdated pin is current.

## Reversion check (for reviewers)

`git diff main` on this stage should show exactly three changes:
package.json (pin), package-lock.json, and the comment in
documents.js. Nothing else.
