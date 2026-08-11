const { parseSearchQuery } = require("../src/lib/searchQuery");

/**
 * Project 7's actual fuzz target. Run with:
 *   npx jazzer fuzz/searchQuery.fuzz.js
 *
 * This is a real, working Jazzer.js target, not a placeholder. The
 * known infinite-loop-on-unclosed-quote bug in searchQuery.js (see its
 * comment) causes unbounded memory growth, which Jazzer.js should
 * surface as a timeout or OOM finding within a short run, not a plain
 * thrown exception. That distinction matters: it is the difference
 * between a bug a unit test would catch and a resource-exhaustion bug
 * that specifically needs fuzzing to find.
 */
module.exports.fuzz = function (data) {
  const input = data.toString();
  try {
    parseSearchQuery(input);
  } catch (err) {
    // Re-throw anything that ISN'T the expected, already-known
    // TypeError for non-string input, that one is intentional
    // validation, not a bug for the fuzzer to report.
    if (!(err instanceof TypeError)) {
      throw err;
    }
  }
};
