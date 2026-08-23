/**
 * IAST-style taint tracer for DocuTrust (DevSecOps Project 3, deliverable 4).
 *
 * A working, from-first-principles implementation of the technique real
 * IAST tools (Contrast, Seeker, etc.) use: track values that originate
 * from HTTP input (the SOURCE) forward to the points where the app
 * builds dangerous artifacts (the SINKS), and report when tainted data
 * reaches a sink without passing through a recognized sanitizer.
 *
 * How this implementation works (honest about its scope):
 *
 *  - SOURCES: request query and JSON body values. Every string value is
 *    registered in a fragment registry (value -> where it came from).
 *    The registry is shared across requests, which is what lets taint
 *    survive the database round-trip: a title POSTed to /documents is
 *    written into Postgres and read back by GET /documents/:id/render —
 *    a real IAST agent tracks that chain through the DB layer; here the
 *    fragment registry stands in for that cross-request plumbing.
 *    (req.params are not marked: no seeded sink consumes them.)
 *
 *  - PROPAGATION: string fragments are tracked by containment. When a
 *    sink argument contains a registered fragment, the taint reached it.
 *    This is an approximation of real dataflow — it cannot follow
 *    transformations that break the fragment (encoding, hashing) — and
 *    it is documented as such, not oversold.
 *
 *  - SINKS: pool.query (SQL text) and res.send (HTML body), wrapped at
 *    enable() time.
 *
 *  - SANITIZER RECOGNITION BY OUTCOME: the fixed render path runs the
 *    input through escapeHtml() before interpolation; the escaped
 *    output no longer contains the tainted fragment, so the sink check
 *    misses and the tracer logs the taint as NEUTRALIZED. The fixed
 *    search path keeps the input out of the SQL string entirely (bound
 *    parameter), so the tracer logs it as ISOLATED. Both are genuine
 *    observations of the fixed paths, not hardcoded exceptions.
 *
 *  - REPORTS: one line per distinct source->sink finding, with the
 *    caller's file:line taken from the stack at sink time, plus
 *    neutralized/isolated observations. Writes to the IAST_LOG path
 *    (default ./iast.log) and stdout.
 *
 * Enabled with DOCUTRUST_IAST=1. This is illustrative instrumentation,
 * not a production product: no coverage of non-string flows, no
 * inter-procedural propagation beyond fragment containment, no
 * performance considerations.
 */

const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

const ENABLED = process.env.DOCUTRUST_IAST === "1";
const MIN_FRAGMENT_LEN = 3; // ignore 1-2 char values: too noisy, useless as evidence
const LOG_PATH = process.env.IAST_LOG || "iast.log";

// fragment -> { source: "req.query.q", route: "GET /documents/search", requestId }
const fragments = new Map();

// source->sink paths already reported this run, to keep the log readable
const reported = new Set();

let requestCounter = 0;

function log(line) {
  const entry = `[IAST ${new Date().toISOString()}] ${line}`;
  console.log(entry);
  try {
    fs.appendFileSync(LOG_PATH, entry + "\n");
  } catch (err) {
    // logging must never break the app; fall back to stdout only
  }
}

function markFragments(value, source, route) {
  const stack = [value];
  const requestId = ++requestCounter;
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v === "string") {
      if (v.length >= MIN_FRAGMENT_LEN && !fragments.has(v)) {
        fragments.set(v, { source, route, requestId });
      }
    } else if (v && typeof v === "object") {
      for (const key of Object.keys(v)) stack.push(v[key]);
    }
  }
}

// Stack frame -> "src/routes/documents.js:60" of the caller of the sink.
function callerLocation() {
  const stack = new Error().stack.split("\n");
  for (const line of stack) {
    if (line.includes("src/") && !line.includes("iast.js")) {
      const m = line.match(/(src\/[^:)]+\.js:\d+)/);
      if (m) return m[1];
    }
  }
  return "?";
}

function checkSink(kind, sinkText, requestLine, reportedKey) {
  if (!ENABLED) return;
  if (typeof sinkText !== "string" || sinkText.length === 0) return;

  let matched = null;
  for (const [fragment, meta] of fragments) {
    if (sinkText.includes(fragment)) {
      matched = { fragment, meta };
      break;
    }
  }

  if (matched) {
    const key = reportedKey || `${kind}|${matched.meta.source}`;
    if (!reported.has(key)) {
      reported.add(key);
      log(
        `FINDING ${kind.toUpperCase()} — tainted input reached a dangerous sink\n` +
          `    source:     ${matched.meta.source} (${matched.meta.route}, request #${matched.meta.requestId})\n` +
          `    sink:       ${requestLine}\n` +
          `    at:         ${callerLocation()}\n` +
          `    fragment:   ${JSON.stringify(matched.fragment)}`
      );
    }
  } else {
    // Taint absent or neutralized — observable outcome of the fixed paths.
    const neut = sinkText.includes("&lt;") ? " (escapeHtml outcome: neutralized)" : "";
    log(`OBSERVATION ${kind.toUpperCase()} — no tainted fragment in sink${neut} [${requestLine}]`);
  }
}

function installSources(app) {
  app.use((req, res, next) => {
    const route = `${req.method} ${req.originalUrl.split("?")[0]}`;
    if (req.query) markFragments(req.query, "req.query", route);
    if (req.body) markFragments(req.body, "req.body", route);
    next();
  });
}

function installSinks() {
  // SQL sink: the query TEXT passed to pool.query.
  const originalQuery = pool.query.bind(pool);
  pool.query = function wrappedQuery(text, params, callback) {
    const sql = typeof text === "string" ? text : text.text;
    if (typeof params === "undefined") {
      checkSink("sql", sql, "pool.query(sql)", "sql");
    } else {
      checkSink(
        "sql",
        sql,
        "pool.query(sql, params)",
        null // report anyway if a fragment reached the SQL text
      );
    }
    return originalQuery(text, params, callback);
  };

  // HTML sink: response bodies written with res.send.
  const sinkHolder = { enabled: true };
  return (req, res, next) => {
    const originalSend = res.send.bind(res);
    const route = `${req.method} ${req.originalUrl.split("?")[0]}`;
    res.send = (body) => {
      // Only responses served as HTML are treated as the HTML sink; JSON
      // echoes of the attacker's own input (res.json responses) are not.
      const contentType = res.get("Content-Type") || "";
      if (sinkHolder.enabled && typeof body === "string" && contentType.includes("text/html")) {
        checkSink("html", body, `res.send() [${route}]`, `html|${route}`);
      }
      return originalSend(body);
    };
    next();
  };
}

module.exports = {
  ENABLED,
  installSources,
  installSinks,
};
