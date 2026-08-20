# DevSecOps Project 8: Continuous Breach and Attack Simulation and Cryptographic Code Review Enforcement

**Product:** DocuTrust

Second of three projects in **Chain C, Validate and Mature**. Project 7 proved DocuTrust's own code keeps getting tested against generated input, forever. This project asks two different, harder questions: would anyone actually notice a real attacker technique executing against the environment DocuTrust runs in, and can a human actually be forced to review a change before it ships, or is that requirement just a checkbox an admin can quietly turn off.

## Project Metadata

- **Prerequisite 1:** this project continues in the same DocuTrust repo from Project 7 (docutrust), deployed to a local k3d cluster with the continuous fuzzing pipeline already running.
- **Difficulty:** Advanced. Combines two genuinely different disciplines, detection validation and access control enforcement, that most engineers only ever encounter separately.
- **Prerequisite 2:** Project 7 completed on this repo, comfort with GitHub branch protection settings, and basic familiarity with Git commit signing. No prior MITRE ATT&CK experience required.
- **Estimated time:** 20 to 25 hours.
- **Tools used:** Atomic Red Team, run through its PowerShell Core execution framework (PowerShell Core is fully cross-platform and runs on Linux; this is not a Windows-only exercise), GitHub branch protection with required signed commits.
- **Skills gained:** running real, safe adversary emulation techniques mapped to MITRE ATT&CK, honestly assessing a detection gap and closing it, scheduling breach simulation as a recurring practice instead of an annual exercise, mapping real test coverage against the ATT&CK framework, and proving cryptographic code review enforcement actually holds against an attempt to bypass it.

## Scenario

DocuTrust runs in a container on a local cluster, and nobody has ever asked whether an actual attacker technique executing inside that environment would be noticed by anything. Separately, DocuTrust's branch protection may say reviews are required, but "required" in a GitHub setting is not the same as "cannot be bypassed"; an admin with the right permissions can often merge anyway. You are asked to run a real, safe attack technique against DocuTrust's environment and prove whether current logging would catch it, close that gap, and separately prove whether review enforcement can actually be bypassed, honestly, whichever way the answer goes.

## Objectives

- Establish an honest baseline of what DocuTrust's environment currently logs and monitors.
- Run a real, safe MITRE ATT&CK-mapped technique against that environment using Atomic Red Team.
- Prove whether the baseline logging catches it, then close the gap and prove the fix works.
- Turn breach simulation into a scheduled, recurring practice.
- Prove whether cryptographic code review enforcement can actually be bypassed, and close that gap if it can.

## Deliverables

1. **Detection baseline, honestly assessed.** A direct audit of what DocuTrust's runtime environment currently logs or monitors, likely close to nothing, stated plainly rather than assumed adequate.
2. **A real atomic test, executed.** At least one safe, appropriate MITRE ATT&CK technique run for real against DocuTrust's container or cluster environment using Atomic Red Team, with the actual execution output captured.
3. **Detection gap, confirmed.** A direct check of whether the baseline from deliverable 1 actually caught the technique from deliverable 2, reported honestly. A gap found here is the expected and valuable outcome, not a failure of the exercise.
4. **A real detection capability was added.** A genuine, working addition (basic audit logging or file integrity monitoring is enough) that specifically closes the gap found in deliverable 3.
5. **Same test, rerun, gap closed.** The exact atomic test from deliverable 2 run again, with evidence the new detection capability from deliverable 4 actually catches it this time. The same before-and-after discipline this entire track has used throughout.
6. **A real, scheduled simulation job.** Breach simulation wired into a recurring schedule rather than run once, so detection coverage keeps getting checked instead of being validated once and assumed to hold.
7. **ATT&CK coverage map.** An honest report of exactly which techniques are covered by the tests run in this project versus the much larger set that is not. A coverage map that claims broad protection from one or two tests deserves the same skepticism this track applies everywhere else.
8. **Signed commit enforcement, configured.** GitHub branch protection set to require signed commits and required review, demonstrated with a real signed commit accepted and a real unsigned commit attempt rejected.
9. **A genuine bypass attempt.** A real, deliberate attempt to merge an unreviewed or unsigned change, whether through an admin override or another available path, with the actual result reported honestly. If a bypass succeeds, that is this project's most important finding, not something to quietly close and leave out of the report.
10. **Final report, closing Chain C's first two projects.** A summary tying continuous fuzzing, breach simulation, and review enforcement together, handed off directly into Project 9's maturity assessment.

## Evaluation Criteria

- The detection baseline is a real, honest account of current logging, not assumed to already be adequate.
- The atomic test is real, safe, and actually executed, with real output, not a description of what running it would show.
- The detection gap check is genuinely performed against real logs, not assumed based on the baseline alone.
- The added detection capability is real and working, confirmed by the rerun in deliverable 5 actually showing the gap closed.
- The scheduled simulation job genuinely runs on a defined recurring basis, not manually triggered and described as continuous.
- The coverage map is honest about what is not tested, not just what is.
- The signed commit enforcement is demonstrated with both a real accepted signed commit and a real rejected unsigned one.
- The bypass attempt in deliverable 9 is genuinely tried, not asserted safe without trying, and its result is reported honestly regardless of outcome.
- The final report accurately represents all of Chain C's work so far and gives Project 9 everything it needs without re-explaining anything.

## How This Connects Forward

Project 9's DSOMM maturity assessment scores DocuTrust against real criteria for detection, logging, and process enforcement, and this project is what gives that assessment real evidence to score against instead of an assumption. Whatever this project finds, including if the bypass attempt in deliverable 9 succeeds, becomes a direct, named input to Project 9's honest final scoring, not something to resolve quietly before the track closes.
