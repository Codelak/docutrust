/**
 * SEEDED FINDING for Project 1 (SAST + Secrets Scanning + Live Secret
 * Verification), do not remove without documenting why in that
 * project's writeup.
 *
 * The constant below is AWS's own publicly documented EXAMPLE access
 * key ID (used throughout AWS's official docs as a placeholder), not a
 * real, functioning credential. It is shaped exactly like a real AWS
 * key so Gitleaks/TruffleHog-style pattern matching finds it, which is
 * the point: Project 1 should find it, then go a step further and
 * demonstrate that a LIVE secret-verification check correctly reports
 * it as inactive/non-functional, the exact distinction between "found
 * a pattern match" and "found a real, exploitable credential."
 */
const LEGACY_INTEGRATION_KEY = "AKIAIOSFODNN7EXAMPLE";

/**
 * Project 3 (DAST / IAST / RASP) test-build switch. When true, the two
 * seeded vulnerabilities fixed in Project 1 (SQLi in GET /documents/search,
 * stored XSS in GET /documents/:id/render) are restored verbatim — the
 * original pre-fix shapes — so the DAST scan, the IAST tracer, and the
 * RASP middleware all have a genuine, findable target, the same way the
 * bugs existed when Project 1 seeded them.
 *
 * Production default is OFF: the fixed paths remain the default. Enable
 * this only for a deliberately vulnerable test instance (the Project 3
 * brief's scan target), never in production — see
 * docs/project-3/walkthrough.md for the run recipe.
 */
const VULN_MODE = process.env.DOCUTRUST_VULN_MODE === "1";

module.exports = { LEGACY_INTEGRATION_KEY, VULN_MODE };
