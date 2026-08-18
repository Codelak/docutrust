# Deliverable 4: Custom SAST rule — docutrust-unsafe-sql-interpolation

## The rule
`sempgrep/rules/docutrust-unsafe-sql-interpolation.yml` — one rule, four
branches, written for this codebase but generalizing past the one seeded line:

1. Direct interpolated call: `pool.query(`...${x}...`)`
2. Direct concatenated call: `pool.query("SELECT ... " + x)`
3. SQL string assembled by concatenation in a variable first
   (SQL-keyword regex on the leading literal keeps non-SQL concatenation
   like URLs and log strings clean)
4. SQL string assembled in a variable via template-literal interpolation and
   passed to the query method later — **the exact seeded shape** at
   `src/routes/documents.js:76-77`

## Verification (`run.txt`)
`semgrep --metrics=off --config semgrep/rules/ --error src/ evidence/05-custom-rule/test-cases.js`
→ exit code **1** (blocking), 7 findings. (Historical run against the
*vulnerable* code — includes the seeded line; the code has since been
fixed. `run-committed-path.txt` is a fresh run against the committed
`test-cases.js` path on the current fixed code: 6 findings, all in
`test-cases.js` — the seeded line no longer exists to flag, which is
itself the rerun proof.):

| Location | Shape | Branch |
|---|---|---|
| `src/routes/documents.js:77` | seeded SQLi (interpolated variable) | 4 |
| test-cases.js:8  | direct interpolated | 1 |
| test-cases.js:14 | direct concatenated | 2 |
| test-cases.js:21 | indirect interpolated (seeded shape) | 4 |
| test-cases.js:27 | UPDATE via concatenation | 2 |
| test-cases.js:32 | indirect concatenated | 3 (matched twice — branch overlap, cosmetic) |

**Negative cases stay clean:** parameterized `$1` query, static SQL string,
non-SQL template interpolation (`greeting`), non-SQL string concat
(`url = "https://" + host` — verified separately against rule-S).

## Engineering notes (worth a walkthrough paragraph)
- Default rulesets (`p/owasp-top-ten`, `p/javascript`, `p/security-audit`)
  did **not** flag this SQLi — the gap the custom rule fills.
- Semgrep version quirk found during development: `metavariable-regex` and
  `metavariable-pattern` capture **empty content for template-literal
  bindings** (any regex except `.*` fails), but capture plain string
  literals correctly. Hence branch 3 uses regex-on-literal while branch 4
  uses `pattern-inside` + metavariable propagation instead.
- Branch overlap: the same node matched by two branches reports twice in the
  JSON/text output. Scanner output needs triage — cosmetic, documented.
