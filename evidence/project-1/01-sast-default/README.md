# Deliverable 1-4: Default SAST run

## Commands
- `semgrep --metrics=off --config=p/owasp-top-ten --config=p/javascript src/` → `semgrep-owasp-javascript.txt`
- `semgrep --metrics=off --config=p/security-audit src/` → `semgrep-security-audit.txt`

## Result: 1 finding total (XSS only)

### XSS — CONFIRMED ✅
Rule: `javascript.express.security.injection.raw-html-format.raw-html-format`
Location: `src/routes/documents.js:104`
```
104┆ res.send(`<html><body><h1>${title}</h1><p>${body}</p></body></html>`);
```

### SQL injection — MISSED by all three default rulesets ❌
No default rule (owasp-top-ten, javascript, security-audit) flags the
string-concatenated query at `src/routes/documents.js:76`. Generic rulesets
don't model "template literal flows into pg pool.query" for this stack.

**Why this matters:** this is the exact scenario the project brief predicts —
"a rule specific enough to catch what a generic ruleset would miss". The
SQLi confirmation therefore comes from the project-specific custom rule
(deliverable 4), not the default scan.

## Bonus discovery (reachability check)
`GET /documents/search` is shadowed by `GET /:id` (registered first at
`src/routes/documents.js:35`), so Express never routes `/documents/search`
to the search handler — `id` is bound to the literal string "search", which
Postgres rejects as an integer (invalid input syntax for type integer) →
HTTP 503. Proved by identical behavior of `/documents/abc` and
`/documents/search`. The seeded SQLi is present in code but currently
unreachable through normal routing. Fixed in deliverable 7 alongside the
parameterization fix.
