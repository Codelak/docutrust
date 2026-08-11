# DocuTrust

A small internal document-sharing API. This is the single, shared
codebase for the entire Expadox Portfolio DevSecOps track, all 9
projects across all 3 chains (Detect, Prove, Validate and Mature) work
against this one app, not three separate products.

## Why one shared app, unlike Product Security and DevOps
DevSecOps is inherently one continuous story: writing code, building
it, signing it, deploying it, watching it, and proving all of that
actually holds up. A real chain of custody, a real SLSA provenance
trail, a real attestation graph, none of that means anything split
across three unrelated apps. So this track uses one codebase throughout,
divided into 3 chains of 3 projects for contributor assignment, all
pointed at the same artifact's real lifecycle.

---

## What it is
- **POST /documents** create a document
- **GET /documents/:id** fetch one
- **GET /documents/search?q=** search by title
- **GET /documents/:id/render** render a document as HTML
- **POST /documents/:id/comments** comment on a document

## Seeded findings, intentional, documented, and load-bearing
This app deliberately contains a small number of real, contained
findings, the same standard practice used by OWASP Juice Shop, WebGoat,
and DVWA, so the scanning and testing tools this track teaches have
something genuine to find, not a synthetic example bolted on separately.
Every one is commented at its exact location in the code:

- **SQL injection** in `GET /documents/search`, built with raw string
  concatenation instead of a parameterized query, the target for
  Project 1 (SAST) and Project 3 (DAST)
- **Reflected XSS** in `GET /documents/:id/render`, unescaped output,
  the target for Project 1 (SAST) and Project 3 (DAST/IAST)
- **An intentionally outdated dependency**, `lodash@4.17.15`, pinned
  exactly (not a caret range), confirmed by `npm audit` to carry
  multiple real, disclosed advisories (prototype pollution, command
  injection, ReDoS), the target for Project 2 (SCA)
- **A fake, industry-standard example secret**, AWS's own published
  placeholder access key (`AKIAIOSFODNN7EXAMPLE`), shaped like a real
  credential for pattern-matching tools but never a real, functioning
  one, in `src/config.js`, the target for Project 1 (secrets scanning
  and live-verification)
- **A denial-of-service bug via unbounded memory growth** in
  `src/lib/searchQuery.js`'s naive parser, confirmed for real by
  actually running Jazzer.js against it (an unclosed quote sends the
  parser's cursor back to 0 instead of advancing, an infinite loop that
  pushes tokens until the process OOMs), the target for Project 7
  (Continuous Fuzzing). The Kubernetes deployment's memory limit exists
  specifically to contain this bug's blast radius to one pod.

None of these should be "fixed" outside the project they belong to,
each one is a real deliverable, not a bug report.

---

## Tech stack
Node.js/Express, Postgres, Jazzer.js for fuzzing, a local k3d cluster.
Every tool this track's 9 projects add (Cosign, Fulcio, Rekor, Kyverno,
GUAC, OpenSSF Scorecard, and the rest) layers on top of this same base,
none of it is pre-installed here, that is each project's own work.

## Local setup
```bash
npm install
cp .env.example .env.local   # DATABASE_URL
npm run migrate
npm start
```

### Run the fuzz target for real
```bash
npx jazzer fuzz/searchQuery.fuzz.js -- -max_total_time=30
```
This should surface a real timeout finding within seconds, not a
placeholder, it already has for us during development.

### Deploy to a local cluster
```bash
k3d cluster create docutrust --agents 2
docker build -t docutrust:0.1.0 --build-arg APP_VERSION=0.1.0 .
k3d image import docutrust:0.1.0 -c docutrust
kubectl apply -f k8s/base.yaml
```

## Total cost
Zero. Postgres, Jazzer.js, and the local cluster are all free and
self-hosted, and every project's added tooling (Sigstore, Kyverno, GUAC,
Scorecard, breach simulation tooling) is open source.
