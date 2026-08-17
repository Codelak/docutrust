# Deliverable 7: Fixes applied, SAST rerun

## Fixes (src/routes/documents.js)
1. **SQL injection** — query parameterized: `WHERE title ILIKE $1` with
   `["%${searchTerm}%"]` bound. Bonus fix: `/search` route moved above
   `/:id` (was shadowed — endpoint unreachable, returning 503).
2. **XSS** — `escapeHtml()` (escapes `& < > " '`) applied to `title` and
   `body` before interpolation into the HTML response.

## Runtime proof (real requests against the running app)
- `GET /documents/search?q=quarterly` → `[{"id":1,"title":"Quarterly Report"}]`
  (endpoint now reachable)
- `GET /documents/search?q=quarterly' OR '1'='1` → `[]` (payload treated as
  literal text; before the fix this would have injected)
- `GET /documents/2/render` with `<script>alert(1)</script>` / `<img onerror>`
  title+body → `&lt;script&gt;alert(1)&lt;/script&gt;` (rendered as inert text)

## SAST rerun
| Scan | Before fix | After fix |
|---|---|---|
| Custom rule `docutrust-unsafe-sql-interpolation` | 1 finding (documents.js:77) | **0 findings, exit 0** |
| Default rulesets (owasp-top-ten + javascript) | XSS at documents.js:104 + SQLi missed | 1 remaining flag |

## The one remaining default-rule flag: triaged as NOT exploitable
`javascript.express.security.injection.raw-html-format` still flags
`documents.js:108` (the escaped render line). Analysis: the rule heuristically
flags any manual HTML construction with interpolation; it cannot model that
the interpolated values passed through `escapeHtml()`. It is a false positive
against the fixed code, proven two ways:
1. Runtime: the payload round-trip renders as `&lt;script&gt;...`, no browser
   execution is possible from this response.
2. The rule's own remediation advice (DOMPurify) is a client-side library
   irrelevant to server-side escaping.

This is the cosmetic-vs-exploitable distinction the brief demands be made
explicitly, and it is why the CI gate enforces the project's precise custom
rule rather than the generic heuristic.
