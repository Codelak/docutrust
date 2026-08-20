# DevSecOps Project 9: DSOMM Maturity Assessment and Auto-Remediation

**Product:** DocuTrust

Third and final project in **Chain C**, and the final project of the entire DevSecOps track. Eight projects have found DocuTrust's vulnerabilities, proven its supply chain, and validated that all of it keeps holding up over time. This project asks the question a real organization would ask before trusting any of that: taken together, how mature is this pipeline actually, scored honestly against a real framework, not a self-congratulatory summary. It also closes one real, remaining gap: every project so far has found and reported findings by hand. This one builds the automation that closes a finding without waiting for a human to get to it.

## Project Metadata

- **Prerequisite 1:** this project continues in the same DocuTrust repo from Project 8 (docutrust), and uniquely in this track, genuinely requires all eight prior projects completed, not just the most recent one. This project scores real evidence gathered across the whole engagement; it cannot be done first or out of order.
- **Difficulty:** Advanced. Less new tooling than most projects in this track, and more demanding for it: real synthesis and honest self-scoring across eight prior projects' worth of evidence is its own difficult skill.
- **Prerequisites:** Projects 1 through 8 completed on this repo.
- **Estimated time:** 20 to 25 hours.
- **Tools used:** the OWASP DevSecOps Maturity Model (DSOMM) framework, a real PR-automation mechanism such as the widely used `peter-evans/create-pull-request` GitHub Action.
- **Skills gained:** applying a formal maturity framework with honest, evidence-based self-scoring rather than guessed numbers, designing auto-remediation with real guardrails instead of blind auto-merge, tracing one real artifact's complete story across an entire pipeline, and closing a nine-project engagement with a synthesis that actually holds together.

## Scenario

DocuTrust has been scanned, signed, fuzzed, attacked, and reviewed across eight separate projects, but nobody has ever stepped back and asked how mature this pipeline actually is as a whole, scored against a real, recognized framework rather than a feeling that "we did a lot of security work." Separately, every finding in every prior project got fixed by a human, eventually. A more mature pipeline closes some classes of finding automatically. You are asked to do both: score DocuTrust honestly against DSOMM using real evidence from Projects 1 through 8, and build real, guardrailed automation that opens an actual fix for a new finding without a human needing to notice it first.

## Deliverables

1. **DSOMM framework mapping.** DocuTrust's actual pipeline mapped against DSOMM's real dimensions (build and deployment, culture and organization, application design, application hardening, and test and verification), stating clearly which prior project's evidence feeds each dimension.
2. **Evidence-based scoring, not guessed.** A real score for each dimension, backed by specific evidence from Projects 1 through 8. A claim that DocuTrust has strong application hardening needs to cite the actual RASP and admission-enforcement work that earned it, not assert it.
3. **Honest gap identification.** A direct, self-critical account of where DocuTrust is genuinely weak or entirely unassessed. This track's heavy tooling focus almost certainly left real gaps in the culture and organization dimension specifically, and that should be named plainly, not glossed over.
4. **A maturity roadmap.** Concrete, specific next steps that would move DocuTrust up at least one real level in its weakest dimension, not a vague aspiration to "improve further."
5. **Real auto-remediation, built.** Working automation that takes a genuine finding and opens an actual pull request with a real fix applied, not a description of how auto-remediation would work.
6. **Auto-remediation, proven end to end.** A fresh, real finding seeded into the codebase, with evidence the automation from deliverable 5 actually catches it and opens a real, correct fix PR, unprompted.
7. **Guardrails, deliberately defined.** A clear, written boundary for what this automation is not allowed to do. Specifically, it should never auto-merge without human approval, since blind automatic merging of a security fix is its own real risk, not a boundary to skip past in the excitement of automating something.
8. **Full artifact traceability.** One real, specific DocuTrust build traced completely through every prior project's evidence: scanned clean, dependencies verified, runtime tested three ways, provenance generated and signed, SBOM attached, admission-verified, fuzzed, breach-tested, and reviewed under enforced signing, all for the same one artifact. Proving the eight prior projects genuinely compose into one coherent story rather than eight disconnected exercises.
9. **Track closure sign-off.** A formal, honest decision record on DocuTrust's actual readiness as a representative example of a mature DevSecOps pipeline, based on the real DSOMM score and the real gaps found, not a celebratory summary.
10. **Final report, closing the entire DevSecOps track.** Not just this project, and not just Chain C. A genuine synthesis of all nine projects across all three chains, Detect, Prove, and Validate and Mature, written as the document a buyer or hiring manager could read on its own and understand exactly what the full track built, found, and proved.

## Evaluation Criteria

- The DSOMM mapping correctly ties each dimension to specific, real evidence from named prior projects, not a generic restatement of the framework's own documentation.
- Every dimension score is backed by cited evidence. A score with no supporting evidence is not a real assessment.
- The gap identification is genuinely self-critical. A maturity assessment that finds no real weaknesses anywhere deserves the same skepticism this track has applied to every other suspiciously clean result.
- The roadmap names specific, achievable next steps, not aspirational language.
- The auto-remediation automation is real, working code, demonstrated actually opening a real pull request.
- The end-to-end proof in deliverable 6 shows the automation catching a genuinely new, seeded finding, not replaying an old one it was built to already recognize.
- The guardrails are specific and enforced, not just written down and never actually tested.
- The artifact traceability in deliverable 8 follows one real, specific build through real evidence from every one of the eight prior projects, with nothing skipped or assumed.
- The closure sign-off is honest, including if the honest answer is that DocuTrust is not fully mature by DSOMM's own standard. That is a more valuable, more credible finding than a clean bill of health.
- The final report accurately represents all nine projects across all three chains, is honest about anything left deferred anywhere in the track, and would genuinely help someone unfamiliar with the engagement understand its full value.

## How This Closes the Track

This is the last of nine projects across Chain A, Detect, Chain B, Prove, and Chain C, Validate and Mature, all built against one real, continuously maturing artifact rather than three disconnected products. Together they cover the full range of serious DevSecOps work: finding what's actually wrong with the code and its dependencies, proving where an artifact came from and that nothing tampered with it, and validating, continuously and honestly, that all of it keeps holding up, closed out here with a real maturity score and real automation instead of a victory lap. The final report from this project is what should sit at the top of the published DevSecOps track, the single document that tells a company or a hiring manager what the other eighty deliverables across the track actually add up to.
