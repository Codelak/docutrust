# DevSecOps Project 3: DAST, IAST, and RASP, Compared for Real

**Product:** DocuTrust

Third and final project in **Chain A, Detect**. Project 1 found DocuTrust's two seeded vulnerabilities by reading the source. Project 2 made sure the dependencies underneath it can be trusted. This project takes the exact same two vulnerabilities and tests them three more ways: from outside the running application (DAST), from inside it during testing (IAST), and live, in production, blocking the attack as it happens (RASP). Most engineers use these three terms almost interchangeably. By the end of this project, the differences should be impossible to confuse again.

## Project Metadata

- **Prerequisite 1:** this project continues in the same DocuTrust repo from Projects 1 and 2 (docutrust.zip), with both prior projects' work already in place.
- **Difficulty:** Advanced, and honest about a real gap in the market: there is currently no viable free, dedicated Node.js IAST or RASP tool. Contrast Community Edition, the one OWASP's own tooling list names, reached end-of-life in June 2025 and only ever supported Java and .NET regardless. Rather than pretend a free product exists, this project builds the real underlying mechanism from first principles, arguably a more senior skill than clicking through a vendor trial.
- **Prerequisite 2:** Projects 1 and 2 completed on this repo, and enough comfort with Express middleware to write request-inspection logic by hand.
- **Estimated time:** 20 to 25 hours.
- **Tools used:** OWASP ZAP for DAST, a hand-built request-tracing module for IAST, a hand-built blocking middleware for RASP.
- **Skills gained:** running and interpreting a real black-box DAST scan, understanding source-to-sink taint tracking well enough to implement a working version of it, building real-time attack-blocking middleware, and being able to explain precisely what DAST, IAST, and RASP each catch that the others miss, from direct experience, not a vendor comparison chart.

## Scenario

DocuTrust's SQL injection and XSS vulnerabilities have already been found by reading the code. A real attacker does not have that luxury, and a real production system does not get the benefit of static analysis alone. You are asked to test the same two vulnerabilities the way an external attacker would (DAST), the way a security-instrumented QA process would (IAST), and to build a live defense that blocks exploitation attempts as they happen (RASP), proving all three against the same two real bugs so the comparison is grounded in one consistent example, not three different demonstrations.

## Deliverables

1. **Real DAST scan.** OWASP ZAP run for real against a deployed DocuTrust instance, with the actual scan output captured.
2. **SQL injection, confirmed externally.** Evidence that ZAP's black-box scan flagged `GET /documents/search`, found the same way an outside attacker would, with no access to source code.
3. **XSS, confirmed externally.** The same, for `GET /documents/:id/render`.
4. **A real, working IAST-style tracer.** A small module that instruments DocuTrust's request handling to track a value from HTTP input (the source) through to the raw SQL string or raw HTML output (the sink), logging when tainted input reaches a dangerous sink without passing through a recognized sanitizer. A genuine, working implementation of the actual technique, not a description of it.
5. **DAST versus IAST, compared directly.** A real, side-by-side comparison using the actual output from deliverables 1 through 4: DAST tells you an endpoint is vulnerable, IAST tells you exactly which line of code and which data path caused it. That difference should now be demonstrated, not just stated.
6. **A real, working RASP-style middleware.** Express middleware that inspects incoming requests for the two seeded attack patterns and blocks them before they reach the vulnerable route, with a clear, documented way to disable it. This is illustrative infrastructure, not a production-grade product, and the brief should say so.
7. **Live SQL injection attempt, blocked.** A real attack payload sent against the running application with the RASP middleware active, with evidence it was actually blocked, not merely configured to be.
8. **Live XSS attempt, blocked.** The same, for the seeded cross-site scripting vulnerability.
9. **Four-way comparison report.** SAST (Project 1, reads the source), DAST (this project, attacks from outside), IAST (this project, watches from inside during testing), and RASP (this project, blocks live), all applied to the same two real bugs, with a clear statement of what each one catches that the others structurally cannot.
10. **Chain A closing report.** A summary tying Projects 1 through 3 together: DocuTrust's full detection posture across static analysis, dependencies, and three different runtime testing approaches, handed off as the starting point for Chain B, Prove.

## Evaluation Criteria

- The ZAP scan output is real and included, not summarized from memory of how ZAP generally behaves.
- Both seeded findings are shown caught externally, with real scan output as evidence.
- The IAST tracer is real, working code that genuinely tracks a value from source to sink, not a comment describing what taint tracking is.
- The DAST versus IAST comparison uses real output from both, and states a specific, concrete difference the two approaches revealed about the same vulnerability, not a generic definition of each term.
- The RASP middleware is demonstrated actually intercepting and blocking a real request, with evidence, and the brief's honesty about its illustrative, non-production nature is reflected in how it's described, not oversold.
- Both live-blocking deliverables show a real attack payload sent and a real blocked response, not an assumption that the middleware would work.
- The four-way comparison report correctly and specifically distinguishes what SAST, DAST, IAST, and RASP each catch, using DocuTrust's own two real vulnerabilities as the evidence throughout, not textbook definitions.
- The closing report accurately represents all three Chain A projects together and would let Chain B start immediately without needing anything about DocuTrust's detection posture re-explained.

## How This Connects Forward

Chain B, Prove, starts from the assumption that DocuTrust's own code and dependencies are now understood and defended; this project is what earns that assumption for the runtime layer specifically. The hand-built IAST tracer and RASP middleware built here also demonstrate a skill Chain B leans on directly: when the ideal free tool for something does not exist, understanding the real mechanism well enough to build a working version of it yourself.
