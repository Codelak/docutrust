# DevSecOps Project 3 — Final Report: DAST, IAST & RASP, Compared for Real

DocuTrust · Black-box scanning (OWASP ZAP), in-process taint tracing
(hand-built IAST), live attack blocking (hand-built RASP)
Chain A (Detect), Project 3 of 9 — closes the detection chain.

---

## 1. Summary

The two vulnerabilities Project 1 found by reading the source — SQLi in
`GET /documents/search`, stored XSS in `GET /documents/:id/render` —
were tested three more ways, all against the same running application,
all with real tool output: **externally** (OWASP ZAP DAST, black-box),
**from inside during execution** (a hand-built IAST-style taint tracer
instrumenting request handling), and **live, at the boundary** (a
hand-built RASP-style middleware blocking the attacks before they reach
the vulnerable routes). The deliberately vulnerable test build is a
documented mode (`DOCUTRUST_VULN_MODE=1`); the production default stays
fixed, and the same five requests run against the fixed build produce a
clean result from every technology — the fixes from Project 1 are
re-proven at runtime, not just by static re-scan.

**What each technology said about the same two bugs** (all real outputs,
evidence paths in the table below):

| | SAST (P1) | DAST (P3) | IAST (P3) | RASP (P3) |
|---|---|---|---|---|
| SQLi on `/documents/search` | found at `documents.js:76` (concat ILIKE) | **High alert**, param `q`, attack `' OR 1=1 --` | source `req.query.q` → `pool.query` at `documents.js:72` | **403 blocked** before the route |
| Stored XSS on `/:id/render` | found at `documents.js:104` (unescaped interpolation) | **High alert**, evidence `<script>alert(1)</script>` in response | source `req.body.title` (POST) → `res.send` at `documents.js:135`, across requests | **403 blocked** at the POST that would store it |
| Fixed build, same requests | clean rerun (P1) | **0 High alerts** | 0 findings (neutralized/isolated) | not needed — nothing to block |

## 2. Findings inventory (this project)

| # | Finding | Tool / mechanism | Verdict | Evidence |
|---|---|---|---|---|
| 1 | SQLi confirmed externally — ZAP High alert on `q` with `' OR 1=1 --` (full-table differential) | ZAP 2.17.0, custom single-quote active rule | **Confirmed** (vulnerable build); **clean** on fixed | `evidence/project-3/17-zap-dast/` |
| 2 | Stored XSS confirmed externally — ZAP High alert, payload evidence in the render response | ZAP 2.17.0, custom stored-XSS passive rule | **Confirmed** (vulnerable build); **clean** on fixed | `evidence/project-3/17-zap-dast/` |
| 3 | IAST: exact source→sink path for both bugs, with line numbers | hand-built tracer (`src/lib/iast.js`) | **Both chains traced** on the vulnerable build; **0 findings** on fixed | `evidence/project-3/18-iast/` |
| 4 | RASP: both attack families blocked live (403) before the route; benign traffic passes | hand-built middleware (`src/lib/rasp.js`) | **Blocked**; control run (RASP off) shows the same payloads reach the sinks | `evidence/project-3/19-rasp/` |
| 5 | First stock-rule scan crashed the app — a ZAP payload with an unclosed `"` tripped the naive search parser's infinite loop (Project 7's fuzz target) and OOM'd the process | ZAP stock rules | **Real incident, root-caused, worked around** (single-quote-only payload set; documented in the evidence README) | `evidence/project-3/17-zap-dast/README.md` |

## 3. The four-way comparison, from real outputs

Same two bugs, four technologies. What each catches that the others
structurally cannot — every claim below is the observed behavior in the
evidence, not a textbook definition.

- **SAST reads the source, sees every shape, knows nothing of runtime.**
  It flagged the concatenation and the unescaped interpolation at rest
  (Project 1). It cannot know whether the code path is reachable at
  runtime, whether the database actually returns rows, or whether
  runtime data (a stored payload) exists at all. It says "this code
  shape is dangerous" — and on the fixed build it says "shape gone",
  which is why the P1 rerun is clean.

- **DAST attacks from outside, black-box — no source access at all.**
  ZAP flagged the *endpoints*: `GET /documents/search` with a High
  SQLi alert, `GET /documents/10/render` with a High stored-XSS alert.
  It saw the payload's effect (the table dump, the script tag in the
  response) and could not see *why*: no line numbers, no data paths,
  no knowledge that `q` flows into a string-concatenated query. It also
  cannot plant or discover database state: ZAP's stock active rules
  inject into request parameters, so the *stored* payload is only
  caught in the response — the classic black-box limitation this
  project hit for real (hence the response-side passive rule).

- **IAST watches from inside during execution, sees the data move.**
  The tracer named the exact chains: `req.query.q` from
  `GET /documents/search` into `pool.query` at `documents.js:72`;
  `req.body.title` from a POST into `res.send` at `documents.js:135`
  **two requests later** (the database round-trip). That cross-request
  chain is precisely what DAST structurally cannot see — DAST has no
  notion that the render response and the earlier POST are the same
  piece of data. IAST's structural blind spot: it only sees paths that
  *execute* during the test run, and it needs the instrumentation to
  be present in the first place — no value in a production build
  without the agent.

- **RASP blocks, live, at the boundary.** It answered 403 to the SQLi
  payload and to the XSS delivery POST *before the vulnerable route
  executed*, logged the block, and let benign traffic through. Its
  structural limits, demonstrated and stated: it is input-side and
  pattern-based (trivially bypassable with encoding); it cannot detect
  a payload that is already stored before it is enabled; and by
  definition it only reacts to attacks that actually arrive — it says
  nothing about the application's safety.

**The DAST-vs-IAST contrast, stated concretely (deliverable 5):** ZAP
told us *an endpoint is vulnerable* — its alert names the URL and the
parameter. IAST told us *exactly which line and which data path* —
`documents.js:72` for SQLi, `documents.js:135` for the stored XSS, with
the source request identified. Both tools were right; they answer
different questions, which is the point: DAST proves the attack works
from outside; IAST proves the code-level reason it works.

## 4. What was built, and how honest it must be

- **The test build (`DOCUTRUST_VULN_MODE=1`)** restores the two seeded
  shapes verbatim from before the Project 1 fix, behind a documented
  flag. Production default is the fixed code; the flag is a footgun and
  is documented as such.
- **The two ZAP rules** (`security/zap/`) exist because stock rules
  sent an unclosed double quote into the naive search parser and
  crashed the app mid-scan — a real DoS bug that is Project 7's fuzz
  target and must not be fixed here. Restricting the probe set to
  single quotes is standard scanner tuning; the crash itself is
  documented as evidence.
- **The IAST tracer** is a genuine source→sink implementation with an
  honest scope statement (fragment-based propagation, no
  inter-procedural dataflow beyond containment).
- **The RASP middleware** is pattern-based, input-side, and explicitly
  illustrative — not a production product. The brief requires that
  honesty; it is written into the module header and this report.

## 5. Handoff to Chain B (Prove)

DocuTrust's detection posture across Chain A, in one paragraph: static
analysis (P1) finds dangerous shapes in source; dependency analysis (P2)
keeps the tree trusted and gated; runtime testing (P3) proves the two
seeded bugs are exploitable from outside (DAST), explains them to the
line (IAST), and demonstrates a live blocking layer (RASP) — with the
fixed build clean under all three. The deliberately vulnerable test
build, the IAST tracer, and the RASP middleware remain in the repo as
working, documented artifacts Chain B can reuse to prove mitigations,
and the CI gates from Projects 1–2 keep standing guard. Chain B starts
from: *DocuTrust's own code and dependencies are understood and
defended at rest and at runtime; anything Chain B needs to prove can be
tested against the same two bugs, three ways.*
