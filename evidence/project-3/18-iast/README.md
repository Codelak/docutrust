# 18 — IAST: the same two bugs, watched from inside

The hand-built tracer in `src/lib/iast.js` (DevSecOps Project 3,
deliverable 4) instruments DocuTrust's request handling the way a real
IAST agent does: values originating at HTTP sources (`req.query`,
`req.body`) are registered as tainted fragments; the two dangerous sinks
(`pool.query` SQL text, `res.send` HTML body) are wrapped; a finding is
logged when tainted data reaches a sink without passing through a
recognized sanitizer. The mechanism and its honest scope are documented
in the module header.

Enabled with `DOCUTRUST_IAST=1` (plus `DOCUTRUST_VULN_MODE=1` for the
vulnerable run). The same five requests were executed in both modes:

1. `POST /documents` with `{"title":"<script>alert(1)</script>", ...}`
   (the attacker's write side of the stored XSS — request #2)
2. `GET /documents/search?q=' OR 1=1 --` (the SQLi payload)
3. `GET /documents/10/render` (the victim's read side of the stored XSS)

## Vulnerable build (`iast-vuln.log`) — 2 findings

```
FINDING SQL — tainted input reached a dangerous sink
    source:     req.query (GET /documents/search, request #5)
    sink:       pool.query(sql)
    at:         src/routes/documents.js:72
    fragment:   "' OR 1=1 --"

FINDING HTML — tainted input reached a dangerous sink
    source:     req.body (POST /documents, request #4)
    sink:       res.send() [GET /documents/10/render]
    at:         src/routes/documents.js:135
    fragment:   "<script>alert(1)</script>"
```

Note the second one: the source is request #4 (the POST) but the sink is
a *different*, later request (the render). That cross-request chain is
the stored XSS: the fragment registry stands in for the database
round-trip a real IAST agent tracks through DB instrumentation. The SQLi
finding is same-request (query param → SQL string).

## Fixed build (`iast-fixed.log`) — 0 findings

Every sink check observes taint NOT reaching the sink:

- SQL: the payload goes into a bound parameter, never into the query
  text — the check finds no fragment in the SQL string.
- HTML: `escapeHtml` output (`&lt;script&gt;`) no longer contains the
  tainted fragment — logged as `(escapeHtml outcome: neutralized)`.

Sanitizer recognition by outcome — the tracer observes the sanitizer's
effect, it does not hardcode the fixed paths.

## The DAST-versus-IAST difference, from these files

ZAP (17-zap-dast) said: endpoint `/documents/search` is SQLi-vulnerable,
endpoint `/documents/10/render` carries a script payload. The IAST tracer
says: `req.query.q` from `GET /documents/search` reaches `pool.query` at
`src/routes/documents.js:72`; `req.body.title` from a POST reaches
`res.send` at `src/routes/documents.js:135` two requests later. DAST
names endpoints, IAST names lines and data paths. Both are real tool
outputs over the same two bugs.

Honest limits (stated in the module header, not hidden): fragment-based
propagation breaks under transformations that alter the fragment;
`req.params` values are not marked (no seeded sink consumes them);
illustrative instrumentation, not a production product.
