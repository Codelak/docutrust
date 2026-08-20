# DevSecOps Project 1: SAST, Secrets Scanning, and Live Secret Verification

**Product:** DocuTrust

First of nine projects in the DevSecOps track, and the first of three projects in **Chain A, Detect**. This chain treats SAST, secrets scanning, SCA, and DAST as the baseline every DevSecOps engineer should already know, not the destination. What separates this project from a copy of any beginner tutorial is what it demands past the first scanner result: a custom rule written for this exact codebase, and the difference between finding something that merely looks like a secret and proving whether it actually is one.

## Project Metadata

- **Prerequisite 1:** this brief covers the DevSecOps tasks only. DocuTrust itself is a separate deliverable in this repo (https://github.com/expadox/docutrust.git, with a README.md inside covering local setup). Clone it and get it running before starting this project. DocuTrust ships with real, documented, seeded findings this project is built to find, not synthetic examples layered on afterward.
- **Difficulty:** Advanced. The bar for this entire track is senior level; this project alone should feel more demanding than a typical SAST-101 tutorial by the second deliverable.
- **Prerequisite 2:** comfort reading JavaScript and SQL, and a working understanding of what SQL injection and cross-site scripting actually are, not just their names.
- **Estimated time:** 20 to 25 hours.
- **Tools used:** Semgrep, Gitleaks or TruffleHog, a scripted live credential verification check (an AWS SDK call is sufficient, no paid service required).
- **Skills gained:** writing a custom SAST rule tuned to a real codebase instead of relying only on default rulesets, distinguishing a cosmetic scanner finding from a genuinely exploitable one, verifying whether a discovered secret is actually live, sweeping full Git history rather than only the current commit, and wiring both SAST and secrets scanning into CI as real, enforced gates.

## Scenario

DocuTrust has never been scanned. It contains, by design, a SQL injection in its search endpoint, a reflected XSS in its render endpoint, and a credential-shaped constant that looks exactly like a real AWS access key. Nobody has confirmed any of this the way a real security engineer would: by running real tools, reading their actual output, writing a rule specific enough to catch what a generic ruleset would miss, and proving whether a suspicious string is a real, exploitable credential or just something that happens to match a pattern. You are asked to do all of that, fix what needs fixing, and leave behind a pipeline that catches the next one automatically.

## Objectives

- Stand up a real SAST pipeline against DocuTrust and confirm it finds both seeded vulnerabilities.
- Write a custom rule specific to DocuTrust, not a restatement of a default rule.
- Stand up real secrets scanning and confirm it finds the seeded credential-shaped constant.
- Build a live verification step that proves whether a found credential is actually active, not just pattern-matched.
- Fix both seeded vulnerabilities for real, and wire CI to block their return.

## Deliverables

1. **Working SAST pipeline.** Semgrep run for real against DocuTrust, with actual output captured, not a description of what running it would show.
2. **SQL injection finding, confirmed.** Evidence that the SAST run flagged the raw string-concatenated query in `GET /documents/search`, with the actual finding output included.
3. **XSS finding, confirmed.** The same, for the unescaped output in `GET /documents/:id/render`.
4. **A custom SAST rule.** Written specifically for DocuTrust, not copied from a public ruleset. A strong candidate: a rule that flags any SQL query string built with template literal interpolation or concatenation instead of a parameterized query, generalizing past this one seeded example so it would catch the next one too.
5. **Working secrets scan.** Gitleaks or TruffleHog run for real against the repository, confirmed to flag the AWS-key-shaped constant in `src/config.js`.
6. **Live secret verification.** A real, working check (an AWS SDK call such as `sts:GetCallerIdentity` against the found key) proving whether it is an active, exploitable credential or an inert, pattern-matched placeholder, with the actual result captured. This is the deliverable that separates a scanner output from a real security finding.
7. **Both vulnerabilities are fixed, for real.** The SQL injection replaced with a parameterized query, the XSS output properly escaped, with a rerun of the SAST pipeline showing both findings gone.
8. **Full Git history secrets sweep.** A scan covering the repository's complete history, not just its current state, confirming no additional secret exists anywhere in past commits that a current-state-only scan would miss.
9. **CI gate, proven.** A seeded new violation (a fresh SQL string concatenation or a fresh hardcoded credential-shaped constant) added in a test branch, with evidence that CI actually blocks it.
10. **Final findings report.** A summary covering every finding, what was cosmetic versus genuinely exploitable, what was fixed, and what the live verification step actually proved, written to hand directly into Project 2's dependency work.

## Evaluation Criteria

- The SAST pipeline's output is real and included as evidence, not summarized from memory.
- Both seeded findings are shown caught with the actual tool output, not asserted.
- The custom rule generalizes past the one seeded example; a rule that only matches the exact seeded line and nothing else has not actually generalized the pattern.
- The secrets scan's output showing the AWS-key-shaped finding is real and included.
- The live verification step actually executes a real check against the found credential and reports a real result; this cannot be asserted without running it.
- Both fixes are real, working code changes, confirmed by a real, rerun SAST scan showing a clean result.
- The Git history sweep is a real, executed scan of full history, not just the current working tree.
- The CI gate demonstrably blocks the seeded new violation, with evidence, not a description of what the gate would do.
- The final report correctly and honestly distinguishes cosmetic findings from genuinely exploitable ones, and would let Project 2 start immediately without needing anything re-explained.
