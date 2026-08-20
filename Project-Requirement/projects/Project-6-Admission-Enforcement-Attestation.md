# DevSecOps Project 6: Admission-Time Enforcement and Attestation Graph Correlation

**Product:** DocuTrust

Third and final project in **Chain B, Prove**. Project 4 proved where DocuTrust came from. Project 5 proved the artifact and its SBOM are genuinely signed and unaltered. Neither of those facts matters at all if the cluster will happily run an unsigned image anyway. This project closes that gap for real, and then answers a second, different question: once an org has more than one signed artifact, how does anyone actually query "what do we depend on, and where."

## Project Metadata

- **Prerequisite 1:** this project continues in the same DocuTrust repo from Project 5 (docutrust), with a real signed image and real attestations already in place.
- **Difficulty:** Advanced. Combines Kubernetes-native policy enforcement with a genuinely different kind of tool, a supply chain knowledge graph, most engineers have never touched either.
- **Prerequisite 1:** Project 5 completed on this repo, comfort with Kubernetes admission controllers, and no prior graph-query experience required.
- **Estimated time:** 20 to 25 hours.
- **Tools used:** Kyverno, GUAC, a local k3d cluster.
- **Skills gained:** writing and testing real admission-control policy, running both positive and negative deploy tests against it, ingesting real attestations into a queryable supply chain graph, and honestly evaluating a tool's actual value at the scale a single project can realistically demonstrate.

## Scenario

DocuTrust's image is signed, and it carries a real, verifiable SBOM attestation, but the cluster it deploys to has no idea any of that exists. An unsigned image would be admitted exactly as happily as a signed one. Separately, DocuTrust now has two real, independent attestations, provenance and SBOM, and if this were a real organization with dozens of services instead of one, nobody could answer a simple question like "which of our services depend on the vulnerable package we just found" without a tool built to correlate that information across everything. You are asked to close the first gap for real, and demonstrate the mechanism behind the second, honestly scoped to what one project can actually prove.

## Deliverables

1. **Kyverno installed for real.** Deployed to a local k3d cluster as a genuine admission controller, not just described.
2. **A real signature-verification policy.** A Kyverno policy requiring any DocuTrust image to carry a valid Cosign signature matching the exact `--certificate-identity` and `--certificate-oidc-issuer` values from Project 5's verification policy, not a generic "must be signed" rule.
3. **Positive test, passed.** The real, signed DocuTrust image deployed against this policy, admitted successfully, with evidence.
4. **Negative test, unsigned image rejected.** A genuine attempt to deploy an unsigned build of DocuTrust, with evidence the policy actually rejects it.
5. **Negative test, tampered image rejected.** The tampered image from Project 5's deliverable 7 deployed against this policy, with evidence it is rejected for the same reason a real attacker's modified artifact would be.
6. **SBOM-attestation-specific policy.** A second policy requirement extending past "is it signed" into "does it carry the specific SBOM attestation type from Project 5," proving admission control can enforce more than a bare signature check.
7. **GUAC installed and real data ingested.** GUAC run for real, ingesting DocuTrust's actual SBOM and provenance attestations from Projects 4 and 5, not sample or documentation data.
8. **A real, answered graph query.** At least one genuine question answered using GUAC's graph, for example correlating the vulnerable lodash version Project 2 found against the current SBOM, with the real query and real result shown, not a description of what GUAC could theoretically answer.
9. **Honest scope assessment.** A direct, written acknowledgment that GUAC's real value is correlating many artifacts across an organization, and a clear statement of what this project actually proved at DocuTrust's single-app scale versus what would be needed to realize GUAC's full value across a real org's full portfolio.
10. **Chain B closing report.** A summary tying Projects 4 through 6 together: real provenance, real signing and attestation, and real admission enforcement and correlation, handed off as the foundation Chain C's continuous validation work builds on.

## Evaluation Criteria

- Kyverno is genuinely running on a real cluster, not just installed and never exercised.
- The signature-verification policy uses DocuTrust's actual, specific identity values from Project 5, not a generic example policy.
- Both the positive and negative deploy tests are real, executed attempts with real, captured results. An admission policy that was never actually tested against a rejection case has not been proven to work.
- The tampered-image rejection specifically reuses Project 5's real tampered artifact, tying the two projects together with one consistent example.
- The SBOM-specific policy is demonstrated enforcing something beyond a bare signature check, with real evidence.
- GUAC ingestion is shown working against DocuTrust's actual generated attestations, not placeholder or example data.
- The graph query deliverable shows a real question, a real query, and a real answer, not a hypothetical example of what GUAC supports.
- The scope assessment is genuinely honest about the limits of what one app can demonstrate, not inflated into a claim this project proved more than it did.
- The closing report accurately represents all three Chain B projects and would let Chain C start immediately without re-explaining DocuTrust's provenance, signing, or enforcement posture.

## How This Connects Forward

Chain C, Validate and Mature, assumes DocuTrust's supply chain is now provably trustworthy — provenance, signatures, and enforcement all real and tested — and shifts to a different question: does that trustworthy state keep holding up over time, under continuous fuzzing, under simulated attack, and under an honest, ongoing maturity assessment. None of that would mean anything without this chain's work being real first.
