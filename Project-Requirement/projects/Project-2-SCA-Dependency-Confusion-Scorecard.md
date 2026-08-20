# DevSecOps Project 2: SCA, Dependency Confusion Defense, and OpenSSF Scorecard

**Product:** DocuTrust

Second of three projects in **Chain A, Detect**. Project 1 answered "is our own code safe." This project answers a different, harder question: can we trust the code we did not write, every dependency DocuTrust pulls in, and every dependency those dependencies pull in after that. Most SCA tutorials stop at "does this package have a known CVE." This project goes further: is the package itself, and the way it's fetched, something an attacker could hijack before it ever reaches a CVE database.

## Project Metadata

- **Prerequisite 1:** this project continues in the same DocuTrust repo from Project 1 (docutrust). The SAST and secrets pipeline from Project 1 should already be running before starting here.
- **Difficulty:** Advanced. Goes well past "run npm audit," into registry-level attack classes almost no SCA tutorial ever mentions.
- **Prerequisite 2:** Project 1 completed on this repo, and basic familiarity with how npm resolves and fetches packages from a registry.
- **Estimated time:** 20 to 25 hours.
- **Tools used:** npm audit, the OpenSSF Scorecard CLI, `.npmrc` registry scoping configuration.
- **Skills gained:** full dependency tree risk analysis including transitive dependencies, remediation and reverification discipline for vulnerable packages, configuring real defense against dependency confusion attacks, assessing typosquatting risk, running and interpreting OpenSSF Scorecard's automated upstream health scoring, and turning all of it into an enforced policy rather than a one-time report.

## Scenario

DocuTrust depends on an intentionally outdated version of lodash, confirmed vulnerable by Project 1's own tooling but never addressed; Project 1's job was finding code-level issues, not fixing dependencies. Beyond that one seeded finding, nobody has ever asked deeper questions a real DevSecOps engineer should: are any of DocuTrust's other dependencies, direct or transitive, risky in ways a CVE lookup would never catch. Is this project set up in a way that a malicious public package with an internal-sounding name could get pulled in by mistake. You are asked to answer all of it, fix what needs fixing, and build a real policy that keeps the next risky dependency from getting in quietly.

## Objectives

- Run a full SCA scan covering DocuTrust's entire dependency tree, direct and transitive.
- Remediate the seeded lodash vulnerability for real, confirmed by a clean rescan.
- Configure real defense against dependency confusion attacks.
- Run OpenSSF Scorecard against DocuTrust and understand what it actually measures beyond known CVEs.
- Turn all of the above into an enforced policy, not just a report.

## Deliverables

1. **Full SCA scan.** npm audit (or an equivalent SCA tool) run for real against DocuTrust's complete dependency tree, with the actual output captured, confirming the seeded lodash finding and surfacing anything else present.
2. **Transitive dependency review.** A specific look at what lodash and DocuTrust's other dependencies themselves depend on, since a dangerous package three levels deep is exactly what a direct-dependencies-only review misses.
3. **Lodash remediated, for real.** The dependency upgraded to a patched version, with a rescan showing the finding actually gone. This is the project where Project 1's discovered-but-untouched finding finally gets fixed.
4. **A written SCA policy.** A real severity threshold document: what blocks a build, what's allowed with a documented justification, and who signs off on an exception. Not "fix everything" with no actual threshold defined.
5. **Dependency confusion defense, configured.** A real `.npmrc` setup scoping DocuTrust's package resolution so an internal-sounding package name cannot be silently shadowed by a malicious public package of the same name, demonstrated working, not just described.
6. **Typosquatting risk check.** A real audit of DocuTrust's actual dependency names against known typosquatting patterns for popular packages, either a manual review or a small script, with genuine findings reported, even if the finding is "none found this time."
7. **OpenSSF Scorecard run.** Executed for real against the DocuTrust repository, with the actual scores captured across its checks (maintained, code review, branch protection, and the rest), not summarized from Scorecard's documentation.
8. **Scorecard-driven policy.** A minimum acceptable score defined for any new dependency added to DocuTrust going forward, wired as a real CI check, not just a number written in a document nobody enforces.
9. **Seeded new risky dependency, caught.** A new dependency deliberately added that would fail either the confusion defense from deliverable 5 or the Scorecard threshold from deliverable 8, with evidence the new gate actually catches it before merge.
10. **Final dependency risk report.** A summary of DocuTrust's full supply chain posture: what was found, what was fixed, what policy is now enforced, and what Project 3 inherits — a clean, current dependency baseline to test runtime behavior against.

## Evaluation Criteria

- The SCA scan output is real and complete, covering the actual dependency tree, not a summary written from assumption.
- The transitive review names at least one specific package beyond DocuTrust's direct dependencies and states whether it's a concern.
- The lodash fix is real and verified by a rescan showing a clean result.
- The SCA policy names a specific, checkable severity threshold, not "use good judgment."
- The dependency confusion defense is demonstrated actually working against a real attempt to resolve a shadow package, not just configured and assumed correct.
- The typosquatting check produces a real, specific finding, positive or negative, with the reasoning shown.
- The Scorecard run shows real, current scores for DocuTrust's actual repository, not example scores from Scorecard's own documentation.
- The Scorecard policy has a real, stated minimum threshold enforced in CI, not just written down.
- The seeded risky dependency in deliverable 9 is shown genuinely blocked, with evidence, before it could reach main.
- The final report gives Project 3 a dependency baseline specific and current enough to start from immediately.

## How This Connects Forward

Project 3's DAST, IAST, and RASP work tests DocuTrust's runtime behavior, and a dependency-level compromise — exactly what this project's confusion defense and Scorecard policy guard against — would undermine any conclusion Project 3 draws about the application's own code being safe. A clean, current, enforced dependency baseline is what makes Project 3's runtime findings trustworthy in the first place.
