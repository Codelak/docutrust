# S8+S9 — The gates: green on main, red on the seeded dependency

Screenshot: `docs/project-2/images/14-ci-main-green.png` (green run),
`docs/project-2/images/15-seeded-pr-blocked.png` (blocked PR).

## S8 — green run on main (run 32432382368)

The new `sca` job ships with everything else; the run view shows all
four jobs passing:

```
✓ sast in 21s   ✓ sca in 19s   ✓ build-and-test in 26s   ✓ secrets-scan in 5s
```

The sca job's own log (`sca-job-gates.txt`) shows the two gates
executing for real:

```
npm audit gate (policy §1)          -> found 0 vulnerabilities
Scorecard gate (policy §5)          -> no new dependencies vs main — pass
```

Per-dependency scores proving the current tree clears the 5/10 bar:
`scorecard-npm-deps.txt` — express 8.2, lodash 6.8, @jazzer.js/core
6.0, pg 5.7, zod 5.3.

## S9 — the seeded dependency is blocked (run 32432495761, PR #1)

The seeded dep: `left-pad@1.3.0` — real package, famous name (the
2016 left-pad incident), scores **4.2/10** (archived repo, no
maintenance). The PR's run view:

```
X sca in 30s
  ✓ npm audit gate (policy §1)          <- left-pad has NO CVEs: audit passes
  X Scorecard gate — new deps >= 5/10   <- and this is exactly why it exists
```

The failing step's log:

```
scorecard gate: scoring new dependencies:
  - left-pad
  FAIL  left-pad — score 4.2 below threshold 5 (policy §5)
scorecard gate FAILED — docs/project-2/sca-policy.md §5
```

npm also warned at install time: `npm warn deprecated left-pad@1.3.0:
use String.prototype.padStart()` — the registry itself flagging an
abandoned package.

**The lesson in one line:** the npm audit gate passed — left-pad has no
known CVEs — yet the Scorecard gate blocked it, because "no known
vulnerability" is not "safe dependency". An abandoned repository is a
supply-chain risk a CVE lookup cannot see. The two gates are
complementary layers, and this is the difference the brief means when
it says Scorecard measures "beyond known CVEs".

The PR was closed and the branch deleted; `left-pad` never touched
`main` (main remained at the pre-seed commit). The gate proved it
blocks before merge — the only proof that matters.
