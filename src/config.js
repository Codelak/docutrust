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

module.exports = { LEGACY_INTEGRATION_KEY };
