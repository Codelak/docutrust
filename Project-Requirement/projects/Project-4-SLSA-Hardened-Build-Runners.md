# DevSecOps Project 4: SLSA Levels and Hardened Ephemeral Build Runners

**Product:** DocuTrust

First of three projects in **Chain B, Prove**. Chain A answered whether DocuTrust's own code, dependencies, and runtime behavior can be trusted. This chain answers a different question: can anyone actually prove where a specific DocuTrust artifact came from, and that nothing tampered with it between source and build. Right now the honest answer is no: DocuTrust's pipeline produces an image with no provenance at all. This project changes that for real, using the current, correct tooling, not the older approach most existing tutorials still teach.

## Project Metadata

- **Prerequisite 1:** this project continues in the same DocuTrust repo from Chain A (docutrust.zip), with Projects 1 through 3's findings already fixed and verified. Provenance about an untrustworthy build is worthless; this project assumes Chain A's work is genuinely done.
- **Difficulty:** Advanced, and worth a direct note on tooling currency: the widely-referenced `slsa-github-generator` project is no longer actively maintained; GitHub now recommends its native artifact attestations instead. This project uses the current, correct path.
- **Prerequisites:** Chain A completed on this repo, comfort with GitHub Actions workflow syntax, and a basic understanding of what a digital signature and a short-lived certificate actually are.
- **Estimated time:** 20 to 25 hours.
- **Tools used:** GitHub's native `actions/attest-build-provenance` action, the GitHub CLI's `gh attestation verify` command, `slsa-verifier` for cross-tool comparison.
- **Skills gained:** applying the real SLSA framework to an actual pipeline rather than reciting its levels, generating and verifying signed build provenance, understanding and proving the separation between build steps and provenance signing that SLSA Level 3 actually requires, and confirming ephemeral build isolation instead of assuming it.

## Scenario

DocuTrust's CI pipeline builds a real Docker image on every push, and that image carries no proof of anything: not what commit it came from, not what build steps ran, not whether anything tampered with it on the way out. A team that has never asked "where did this artifact actually come from" has no real defense against a compromised build step quietly injecting something malicious into an otherwise legitimate-looking release. You are asked to close that gap for real, generate and verify actual signed provenance, and prove, not assume, that DocuTrust's build platform is isolated enough to make that provenance trustworthy.

## Objectives

- Establish what SLSA level DocuTrust's pipeline currently meets, which is none.
- Generate real, signed build provenance for a real DocuTrust build using GitHub's current native tooling.
- Verify that provenance against the actual built artifact.
- Prove, not assume, that DocuTrust's build steps cannot access or forge the credentials used to sign that provenance.
- Confirm GitHub-hosted runners are genuinely ephemeral, with evidence.

## Deliverables

1. **Baseline SLSA audit.** An honest assessment of DocuTrust's current pipeline against the SLSA framework's actual levels, confirming it currently sits at Level 0 — no provenance generated at all.
2. **Working provenance generation.** `actions/attest-build-provenance` wired into DocuTrust's real CI workflow, producing a genuine, signed attestation for a real build, not a manually written document pretending to be one.
3. **Real attestation verified.** `gh attestation verify` run against the actual built DocuTrust image, with the real command output captured as evidence.
4. **Data plane and control plane separation, demonstrated.** SLSA Level 3 specifically requires that the build steps a developer controls never touch the logic that signs provenance. Show, concretely, how `attest-build-provenance`'s OIDC-based, short-lived Fulcio certificate model enforces this, not just cite that it does.
5. **Adversarial tampering attempt.** A real, deliberate attempt to have a compromised or malicious build step access the signing identity or forge the provenance before it is signed, with the actual result reported honestly, whichever way it goes.
6. **Ephemeral runner, proven.** A real test confirming GitHub-hosted runners do not persist state between jobs: deliberately leave a file or artifact in one run and confirm it is genuinely gone in the next, not assumed to be gone because the documentation says so.
7. **Cross-tool verification.** The same or an equivalent artifact verified using `slsa-verifier`, with the real difference between GitHub-native attestation verification and generic SLSA provenance verification documented from direct experience. This distinction is easy to gloss over and shouldn't be.
8. **A genuine SLSA level achieved, with evidence.** Not just "provenance exists" — a real, defensible claim about which SLSA Build Level DocuTrust's pipeline now meets, backed by every deliverable above.
9. **Honest self-assessment against the full SLSA framework.** A written scoring of DocuTrust's pipeline against the actual SLSA v1.0 criteria, stating plainly what is met, what is partially met, and what is not attempted in this project.
10. **Handoff report to Project 5.** A summary of DocuTrust's current provenance and build isolation posture, specific enough that Sigstore signing and in-toto attestation work can start immediately without re-establishing any of this project's findings.

## Evaluation Criteria

- The baseline audit is honest: DocuTrust genuinely had no provenance before this project, and says so plainly rather than softening it.
- The provenance generation step produces a real, verifiable attestation for a real build, with the actual output included.
- The verification step shows real, executed command output, not a description of what verification would show.
- The data plane and control plane explanation is concrete and specific to how `attest-build-provenance` actually works, not a generic restatement of the SLSA specification.
- The adversarial tampering attempt is genuinely attempted, and its result, success or failure, is reported honestly. An attempt that quietly isn't tried is worse than a documented failure.
- The ephemeral runner test shows a real, deliberate attempt to leave state behind and a real, confirmed result that it did not persist.
- The cross-tool verification correctly identifies and explains the real practical difference between the two verification paths.
- The claimed SLSA level is defensible against the actual evidence gathered in this project, not asserted beyond what was proven.
- The self-assessment is honest about partial or unmet criteria. A perfect self-score without any gaps deserves the same skepticism this entire track applies to a canary that never fails.
- The handoff report gives Project 5 everything it needs without requiring anything in this project to be re-explained.

## How This Connects Forward

Project 5 takes the provenance foundation this project establishes and extends it into full artifact signing with Sigstore and structured in-toto attestations covering SBOM and test results, not just build origin. Project 6's admission-time enforcement will specifically check for the kind of attestation this project proves DocuTrust can now produce; an artifact without it should be rejected at deploy time, and that policy only makes sense once this project's provenance is real.
