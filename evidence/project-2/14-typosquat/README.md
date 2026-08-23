# S6 — Typosquatting risk check: manual review, real probes

Method: for each direct dependency, probe the near-variant names a
squatter would most plausibly publish (typo, doubled letter, suffix,
prefix), with `npm view <name> version time.created maintainers`.
Raw probes: `manual-review.txt`. Screenshot:
`docs/project-2/images/12-typosquat-probes.png`.

## How to judge a find (the skill)

| Signal | Squat | Legit |
|---|---|---|
| Published after the original | yes | possible (fork) |
| Version count | 0–1, placeholder `0.0.0` | many, real releases |
| Maintainer | unknown / disposable email | known project maintainers |
| Version `0.0.1-security` | **npm security takedown** | never |
| "Unpublished on <date>" | removed squat (or takedown) | retired project |

## Verdicts, per probe

**express** (original 2010)
- `expresss` (2016, v0.0.0, personal email) — **squat-shaped**: placeholder version, 6 years after the original, unknown maintainer.
- `express1` (2019, v1.0.0, QQ-mail maintainer) — **squat-shaped**: single version, disposable-account pattern.
- `js-express` — **published, then unpublished 2026-04-03**: the registry is live churn; names appear and disappear. Fresh (2026) and gone — exactly what a takedown looks like.
- `xpress` (2016, v2.4.6, 52 versions) — **legit alternative framework**; the judgment case for near-variants that are real projects.

**lodash** (original 2012)
- `lodashs` — **unpublished 2020**: a squat that existed and was removed.
- `lodash-package` (2024-02-01, v1.0.0, single personal maintainer) — **squat-shaped and fresh**.
- `loodash` (2021, v2.0.0, mylesborins) — published by a real Node.js core maintainer as a **deliberate typosquatting demonstration**; proves even "obviously fake" names get taken.
- `loadsh` (2018, v0.0.4) — **the classic documented lodash squat**, cited in typosquatting research. Still live on the registry.

**zod** (original 2020)
- `zod-js` (2026-01-19, **v0.0.1-security**) — **the headline find**: `0.0.1-security` is the version npm assigns when it takes down a malicious package. A real squat on a name adjacent to one of our dependencies, published **three months ago** and removed by npm. The attack class is active, right now, against names this project actually uses.
- `zods` — never existed.

**pg** (original 2010)
- `pg1` — **unpublished 2023** (existed, removed).
- `js-pg` (2017, v1.0.0) — **squat-shaped**.
- `pgs` (2016, v0.0.7) — **squat-shaped**: placeholder version, bot-like maintainer.

**Our own namespace** — `@docutrust/shared|utils|config|core|auth` on the public registry: **nothing published**. Negative finding, and the S5 scoping is what keeps it that way: npm never even consults the public registry for that scope.

## Conclusion

- 8 of 14 probed near-variants exist or existed; **zero is in
  DocuTrust's tree**, and the mechanisms that keep it that way are
  already in place: exact pins (`4.18.1`), the lockfile (`npm ci`),
  the `npm audit` gate (S8), and the `.npmrc` scope pinning (S5).
- Risk today: **low, by configuration, not by luck** — and `zod-js`
  is the standing reminder that the attack is live.
- Action recorded in the SCA policy: every new dependency gets this
  same review before acceptance (policy §5).
