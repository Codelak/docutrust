# DevSecOps Project 7: Continuous Fuzzing

**Product:** DocuTrust

First of three projects in **Chain C, Validate and Mature**. Chain A found DocuTrust's vulnerabilities. Chain B proved its supply chain is trustworthy. This chain asks whether all of that keeps holding up over time, starting with the one testing technique almost no engineer has actually run for real: fuzzing, and specifically, fuzzing that never stops, not a scan someone remembers to run once before a release.

## Project Metadata

- **Prerequisite 1:** this project continues in the same DocuTrust repo from Chain B (docutrust.zip), with real provenance, signing, and admission enforcement already in place. The fuzz harness itself has been sitting in the repo since the beginning — `fuzz/searchQuery.fuzz.js` and `src/lib/searchQuery.js` — unused until now.
- **Difficulty:** Advanced. The core idea is simple, keep attacking the code with generated input forever; the discipline of doing it continuously rather than once is where the real difficulty lives.
- **Prerequisites 2:** comfort reading the existing fuzz harness already in the repo, and enough JavaScript to fix a bug once the fuzzer finds one.
- **Estimated time:** 20 to 25 hours.
- **Tools used:** Jazzer.js (already a dependency in the repo), GitHub Actions scheduled workflows, GitHub Actions cache for corpus persistence.
- **Skills gained:** running coverage-guided fuzzing for real, fixing a fuzzer-discovered bug and proving it stays fixed, managing a fuzzing corpus so progress persists across runs instead of restarting from nothing, wiring fuzzing into CI as a recurring job rather than a one-time scan, and building a real triage path for what happens when a scheduled run finds something new.

## Scenario

DocuTrust has shipped with a real, working Jazzer.js fuzz target since day one, and as far as the repository's history shows, nobody has ever actually run it. The parser it targets has a genuine, serious bug: an unclosed quote sends its cursor back to the start instead of advancing, causing unbounded memory growth. Finding that once, by hand, running the fuzzer for thirty seconds, proves the tool works. It does not prove DocuTrust is safe from the next bug like it. You are asked to find and fix the existing bug, then build something that keeps looking, forever, and prove it actually catches a new problem introduced after the old one is gone.

## Objectives

- Confirm the existing seeded bug is genuinely found by running the fuzzer for real.
- Fix it, and prove the fix holds under sustained, continued fuzzing, not just a quick rerun.
- Turn fuzzing into a real, recurring CI job with a persistent corpus, not a manual, one-time command.
- Build a real triage path for what happens when a scheduled run finds something new.
- Prove the ongoing pipeline actually catches a fresh, deliberately introduced bug, not just the one that was already known.

## Deliverables

1. **Baseline fuzz run, confirmed.** `npx jazzer fuzz/searchQuery.fuzz.js` run for real, with the known crash captured as real output, not assumed present because it was described in a code comment.
2. **The bug, fixed for real.** The unclosed-quote infinite loop in `src/lib/searchQuery.js` corrected, with a specific, targeted regression test added proving the exact crashing input from deliverable 1 no longer crashes.
3. **Sustained rerun, clean.** The fuzzer run again against the fixed code for a meaningfully longer duration than the first pass, showing no new crash surfaces. This is what separates "we fixed the one bug we knew about" from genuine confidence.
4. **Working corpus persistence.** Jazzer.js's corpus directory actually preserved across runs using GitHub Actions cache, so each scheduled run builds on the last instead of restarting from an empty corpus every time.
5. **A real, scheduled CI fuzzing job.** A GitHub Actions workflow running the fuzzer on a real recurring schedule, not just triggered once on a pull request, replacing the manual command from deliverables 1 and 3.
6. **A real crash triage mechanism.** A defined, working process for what happens when a scheduled run finds a new crash. At minimum, the build fails and the crashing input is captured as a downloadable artifact, not silently logged and easy to miss.
7. **A fresh, deliberately seeded bug.** A new, genuine bug introduced into the codebase after the original one is fixed, specific enough that fuzzing, not a quick manual test, is what would actually find it.
8. **The new bug, caught by the ongoing pipeline.** Evidence that the scheduled fuzzing job from deliverable 5, not a manual one-off run, actually surfaces the bug from deliverable 7. This is the deliverable that proves continuous fuzzing rather than a single successful fuzzing session.
9. **Time-budget decision, justified.** A specific, reasoned choice for how long each scheduled fuzzing run should execute, weighing thoroughness against real CI cost and time, not an arbitrary number.
10. **Final report.** A summary covering both bugs found, the fix and reverify discipline used for each, the corpus and scheduling setup, and a direct explanation of why this is meaningfully different from a one-time fuzzing session or a traditional pentest.

## Evaluation Criteria

- The baseline crash and its fix are both shown with real, captured command output, not described from the code comments alone.
- The regression test in deliverable 2 targets the exact crashing input found, not a generic new test unrelated to the actual bug.
- The sustained rerun in deliverable 3 genuinely runs longer than the first pass and reports a real result, clean or not.
- The corpus persistence is demonstrated actually working across at least two separate runs, not configured and assumed to work.
- The scheduled CI job is real and runs on an actual defined schedule, not manually triggered and called continuous.
- The triage mechanism is demonstrated with a real captured crash artifact from an actual failed run, not described in the abstract.
- The new seeded bug in deliverable 7 is a genuine, fuzzing-appropriate bug, not something a basic unit test would have already caught trivially.
- Deliverable 8 shows the bug caught by the actual scheduled pipeline, not by manually rerunning the fuzzer against it after the fact.
- The time-budget justification weighs a real tradeoff, not an arbitrary round number with no reasoning.
- The final report correctly explains why continuous fuzzing differs from a one-time scan, using DocuTrust's own two real findings as evidence, not a generic definition.

## How This Connects Forward

Project 8's breach and attack simulation work assumes the codebase being tested has already had its obvious, fuzzer-findable bugs closed; this project is what earns that assumption. The scheduled-job pattern built here — corpus persistence, a defined time budget, a real triage path — is also the direct template Project 9's DSOMM maturity assessment will score DocuTrust against when it asks whether continuous testing is genuinely embedded in the pipeline or only exists as a one-time exercise.
