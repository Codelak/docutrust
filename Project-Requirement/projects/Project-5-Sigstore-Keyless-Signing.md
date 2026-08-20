# DevSecOps Project 5: Sigstore Keyless Signing and in-toto Attestations

**Product:** DocuTrust

Second of three projects in **Chain B, Prove**. Project 4 proved where a DocuTrust artifact came from. This project proves something broader: that the artifact itself is genuinely, verifiably the one that was built, and attaches real, signed claims about what's inside it, not just how it was built. This is the actual mechanic behind "artifact signing" that most engineers have heard of but never done end to end with real, current tooling.

## Project Metadata

- **Prerequisite 1:** this project continues in the same DocuTrust repo from Project 4 (docutrust.zip), with real build provenance already in place. Signing an artifact whose origin isn't already proven would skip the point of Project 4.
- **Difficulty:** Advanced. Conceptually different from traditional code signing: there is no private key to generate, store, or rotate. Understanding why that's actually safer, not just more convenient, is part of the work.
- **Prerequisite 2:** Project 4 completed on this repo, and comfort with container images and OCI registries.
- **Estimated time:** 20 to 25 hours.
- **Tools used:** Cosign (v2.4.1 or later, for current Rekor v1.2 support), Fulcio and Rekor (used automatically through GitHub Actions OIDC, no separate setup required), Syft for SBOM generation.
- **Skills gained:** real keyless artifact signing end to end, verifying a signature and a transparency log entry, generating and attaching a real SBOM as a signed in-toto attestation, proving tampering detection actually works, and designing a real, identity-based verification policy.

## Scenario

DocuTrust's build now produces real, signed provenance thanks to Project 4, but the image itself still isn't signed, and nobody has attached a real SBOM as a verifiable claim tied to that exact artifact. Traditional code signing would mean generating a private key, storing it somewhere safe, rotating it periodically, and hoping it never leaks. The modern approach skips all of that: an ephemeral certificate issued for minutes, tied to a verified CI identity, with every signature publicly and permanently logged. You are asked to implement this for real, attach a real SBOM as a second, independent signed claim, and prove both the signature and the tampering detection actually hold under a real test.

## Deliverables

1. **Real keyless image signing.** Cosign wired into DocuTrust's CI, signing the actual built image using GitHub Actions' OIDC identity, with no key generated or stored anywhere.
2. **Signature verified.** `cosign verify` run for real against the actual signed image, with the real command output captured.
3. **Rekor entry, located and confirmed.** The actual transparency log entry for this real signing event found and verified, proving the public record genuinely exists, not just trusting that it does.
4. **Real SBOM generated and attested.** Syft run against the actual built image to produce a real SBOM, attached as a signed in-toto attestation via `cosign attest`, not a manually written document pretending to be one.
5. **SBOM attestation verified.** `cosign verify-attestation` run against the real image, with the actual decoded SBOM content confirmed as output, not assumed present.
6. **Multiple attestations, verified together.** Both Project 4's provenance attestation and this project's SBOM attestation confirmed against the same image digest, proving the "one artifact, several independent signed claims" model genuinely works, not just in theory.
7. **Tampering test.** The image rebuilt with one small, deliberate change after signing, with `cosign verify` shown correctly rejecting the modified artifact. This is the test that proves the signature actually protects integrity rather than just existing.
8. **Identity forgery attempt.** A real, deliberate attempt to verify as if the image came from an untrusted source, for example checking whether a forked repository's workflow could produce a signature that passes DocuTrust's verification, and reporting the actual result. This tests the real security boundary the certificate identity provides.
9. **A written verification policy.** The exact trusted `--certificate-identity` and `--certificate-oidc-issuer` values for DocuTrust, documented with the reasoning behind them. This becomes the direct input to Project 6's admission control policy.
10. **Handoff report to Project 6.** A summary of DocuTrust's complete signing and attestation posture, specific enough that admission-time enforcement can be built directly against it without re-deriving anything from this project.

## Evaluation Criteria

- The image is genuinely signed through a real CI run, with no key ever generated, stored, or committed anywhere in the process.
- The signature verification shows real, executed command output, not a description of what verification would show.
- The Rekor entry is a real, located log entry for this specific signing event, not a generic explanation of what Rekor does.
- The SBOM is genuinely generated from the actual built image, not a hand-written stand-in, and genuinely attached as a verifiable attestation.
- The SBOM attestation verification shows real, decoded content matching the actual image.
- Both attestations are shown verified together against one real image digest, not demonstrated separately with no connection shown.
- The tampering test uses a real, rebuilt image and shows a real verification failure, not an assumption that tampering would be caught.
- The identity forgery attempt is genuinely tried, and its result is reported honestly, whichever way it goes.
- The verification policy states specific, real values, not a placeholder or a generic template.
- The handoff report gives Project 6 everything it needs to build admission enforcement without requiring anything here to be re-explained.

## How This Connects Forward

Project 6's admission-time enforcement is a direct consumer of this project's work: the exact verification policy from deliverable 9 becomes the policy a real admission controller checks before allowing DocuTrust to run, and an unsigned or incorrectly-signed image should be rejected using precisely the mechanism this project just proved works. The attestation-correlation work in Project 6 also depends on there being more than one real attestation to correlate, which this project is what makes true.
