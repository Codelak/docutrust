# 19 — RASP: live attacks blocked at the boundary

`src/lib/rasp.js` (DevSecOps Project 3, deliverables 6–8): Express
middleware mounted before the document routes. It inspects every
incoming request — query parameters, path parameters, JSON body — for
the two seeded attack families (SQL injection, cross-site scripting)
and answers **403** before the request can reach the vulnerable route
code.

- **Enable:** `DOCUTRUST_RASP=1` — the documented kill switch is simply
  unsetting it (`DOCUTRUST_RASP=0`), demonstrated by the control run.
- **Illustrative, not production-grade — stated plainly:** detection is
  pattern-based and trivially bypassable by encoding or any variant
  outside the pattern set. A real RASP product blocks by runtime
  *behavior*; this module demonstrates the mechanism and placement
  (boundary inspection before the route) against the exact payloads
  DocuTrust is seeded with. Every pattern is visible in the module; the
  block decision is a single logged, auditable line.

## Deliverable 7 — live SQLi attempt, blocked (`rasp-on-transcript.txt`)

`GET /documents/search?q=' OR 1=1 --` → **HTTP 403**
`{"error":"blocked by DocuTrust RASP: SQL injection","pattern":"..."}`
and the app logs `[RASP] BLOCKED GET /documents/search ... SQL injection`.
The request never reached `pool.query` — with RASP off (control), the
same payload dumps the whole documents table (HTTP 200, `rasp-off-...`).

## Deliverable 8 — live XSS attempt, blocked

`POST /documents` with `{"title":"<script>alert(1)</script>"}` → **HTTP
403**, `blocked by DocuTrust RASP: cross-site scripting`. The payload is
stopped at the write side, so it never lands in the database and never
reaches a victim's browser via `/documents/:id/render`. With RASP off
(control), the same POST stores the payload (HTTP 201) and
`/documents/23/render` serves it unescaped.

## Honest boundary note

RASP blocks the XSS *delivery* (the POST that would store the payload),
not the render of a payload stored *before* RASP was enabled — input
side only, as the brief specifies ("blocks them before they reach the
vulnerable route"). That boundary is part of the four-way comparison in
the final report: each technology covers a different phase of the same
attack.
