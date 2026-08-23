/**
 * RASP-style request-blocking middleware for DocuTrust (DevSecOps
 * Project 3, deliverable 6).
 *
 * What it does: inspects every incoming request (query parameters, path
 * parameters, JSON body) for the two seeded attack families — SQL
 * injection and cross-site scripting — and answers 403 before the
 * request can reach the vulnerable route code. It is mounted before the
 * document router in src/index.js, so a blocked payload never executes
 * against the database or the renderer.
 *
 * ENABLE:  DOCUTRUST_RASP=1
 * DISABLE: unset or DOCUTRUST_RASP=0  (the documented kill switch)
 *
 * HOW HONEST ABOUT ITS SCOPE IT MUST BE: this is illustrative
 * infrastructure, not a production-grade product. Detection is
 * pattern-based — it recognizes the *shape* of the seeded attacks, so it
 * is trivially bypassable by encoding, obfuscation, or any variant not
 * in the pattern set. A real RASP product operates inside the runtime
 * (JVMTI/V8 hooks, taint engines, behavior heuristics) and blocks by
 * *behavior*, not by string matching. The point of this module is the
 * mechanism and the placement (boundary inspection before the route),
 * demonstrated against the exact payloads DocuTrust is seeded with.
 * It is deliberately small: every pattern is visible, and the block
 * decision is a single logged, auditable line.
 *
 * Pattern sets mirror the seeded shapes (single-quote SQLi probes and
 * script-tag / event-handler XSS payloads). Benign inputs — ordinary
 * search terms, normal document titles — must pass untouched; the
 * evidence run includes those as control requests.
 */

const ENABLED = process.env.DOCUTRUST_RASP === "1";

const SQLI_PATTERNS = [
  /['"]\s*OR\s+['"]?\d*['"]?\s*=\s*['"]?\d*['"]?/i, // ' OR '1'='1, " OR 1=1
  /['"]\s*AND\s+['"]?\d*['"]?\s*=\s*['"]?\d*['"]?/i, // ' AND '1'='1
  /--/, // SQL comment
  /\/\*.*\*\//, // block comment
  /UNION\s+(ALL\s+)?SELECT/i,
  /;\s*(DROP|DELETE|INSERT|UPDATE|SELECT)\b/i, // stacked statements
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /\bon(error|load|click|mouseover|focus)\s*=/i,
  /javascript\s*:/i,
  /<\s*[a-z]+\s+[^>]*\bon[a-z]+\s*=/i,
];

function collectStrings(value, out) {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
  } else if (value && typeof value === "object") {
    for (const key of Object.keys(value)) collectStrings(value[key], out);
  }
}

function inspect(values) {
  for (const value of values) {
    for (const pattern of SQLI_PATTERNS) {
      if (pattern.test(value)) return { family: "SQL injection", pattern: pattern.source };
    }
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(value)) return { family: "cross-site scripting", pattern: pattern.source };
    }
  }
  return null;
}

function middleware() {
  return (req, res, next) => {
    if (!ENABLED) return next();

    const candidates = [];
    if (req.query) collectStrings(req.query, candidates);
    if (req.params) collectStrings(req.params, candidates);
    if (req.body) collectStrings(req.body, candidates);

    const hit = inspect(candidates);
    if (hit) {
      const line = `[RASP] BLOCKED ${req.method} ${req.originalUrl} — ${hit.family} (pattern: /${hit.pattern}/)`;
      console.log(line);
      return res.status(403).json({
        error: `blocked by DocuTrust RASP: ${hit.family}`,
        pattern: hit.pattern,
      });
    }
    next();
  };
}

module.exports = { ENABLED, middleware };
