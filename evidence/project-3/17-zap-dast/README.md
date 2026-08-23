# 17 — ZAP DAST: both seeded findings confirmed externally

OWASP ZAP 2.17.0, run for real against a deployed DocuTrust instance
(`node src/index.js`, Postgres, port 3000) — black-box, no source access.

## Two scan runs

| Run | App build | Result |
|---|---|---|
| `zap-vuln-scan.html` / `zap-vuln-alerts.json` | `DOCUTRUST_VULN_MODE=1` (deliberately vulnerable test build, Project 3) | **2 High alerts** — SQLi on `/documents/search`, stored XSS on `/documents/10/render` |
| `zap-fixed-scan.html` / `zap-fixed-alerts.json` | default (fixed) build | **0 High alerts** — the Project 1 fixes defeat both payload families |

High alerts found (from `zap-vuln-alerts.json`):

```
- SQL Injection - Single-Quote Probes (DocuTrust)
    risk: High   url: /documents/search?q=%27+OR+1%3D1+--
    attack: ' OR 1=1 --   evidence: ' OR 1=1 --
- Stored XSS - Script Payload in HTML Response (DocuTrust)
    risk: High   url: /documents/10/render
    evidence: <script>alert(1)</script>
```

## How the scan was configured (and why)

The rules live in `security/zap/` and are loaded into ZAP from its Scripts
panel (or the API) — the same steps shown in the walkthrough.

- **`sqli-single-quote.js`** (active rule, id 90099): probes the `q`
  parameter with a curated single-quote-only payload set and detects the
  injection by response differential (`' OR 1=1 --` dumps the whole
  table). **Double-quote payloads are deliberately excluded:** DocuTrust's
  naive search parser (`src/lib/searchQuery.js`) hangs in an infinite loop
  on an unclosed `"` and grows memory until the process dies — a real DoS
  bug reserved as Project 7's fuzz target. The very first stock-rule scan
  hit it for real: the app OOM-crashed mid-scan and the run aborted with
  only passive findings (that crash is documented in
  `docs/project-3/walkthrough.md`). Restricting the probe set is standard
  scanner tuning and keeps the target alive.
- **`xss-stored-passive.js`** (passive rule, id 90100): raises an XSS
  alert when an HTML response carries an executable script payload — the
  response-side signature of stored XSS. Stock ZAP active rules inject
  payloads into request parameters; a stored payload is database state,
  not a parameter, so nothing reflects and the stock rules stay silent
  (ZAP does flag the payload's presence as an informational — see
  "Modern Web Application" in the report). This is the classic DAST
  limitation on stored XSS, and the exact gap IAST closes (deliverable 5).

Both rules are honest about being illustrative: pattern-based, no
encoding/obfuscation resistance, not production-grade.

## What the attack looked like end-to-end

1. Attacker stores the XSS payload via the app's own API:
   `POST /documents {"title":"<script>alert(1)</script>"}` (document id 10).
2. ZAP spiders/feeds `/documents/search?q=quarterly` and
   `/documents/10/render`, active-scans the search parameter, and passive-
   scans every response.
3. The SQLi probe `' OR 1=1 --` returns the entire documents table (all
   10 rows vs the baseline's 1) — differential confirmed, High alert.
4. The render response contains the unescaped `<script>` — High alert.
5. Same two scans against the **fixed** build: parameterized query → no
   differential; escaped output → no payload in the response. Clean.

## Screenshots (UI walkthrough figures)

- `screenshots/zap-webui.png` — the ZAP web UI (API explorer) as a
  mentee sees it through an SSH tunnel (`ssh -L 8090:127.0.0.1:8090`).
- `screenshots/zap-report-vuln.png` — the vulnerable-build scan report
  rendered in a browser: both High alerts listed.
- `screenshots/app-sqli-vuln.png` — the SQLi payload's effect in a
  browser: `GET /documents/search?q=' OR 1=1 --` returns the full table.
  (The XSS render page was captured as a terminal figure instead — a real
  browser executing the stored `<script>` pops `alert(1)` and blocks
  headless screenshotting, which is the vulnerability working.)
