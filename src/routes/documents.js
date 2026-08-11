const express = require("express");
const _ = require("lodash");
const { pool } = require("../db");
const { createDocumentSchema, createCommentSchema } = require("../validation");
const { parseSearchQuery } = require("../lib/searchQuery");

const router = express.Router();

router.post("/", async (req, res) => {
  const parsed = createDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid document data" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO documents (title, body) VALUES ($1, $2) RETURNING id, title, body, created_at",
      [parsed.data.title, parsed.data.body]
    );
    // lodash used here for a real, if minor, purpose: a deep clone
    // before returning, so callers can't accidentally mutate a cached
    // reference. This is the app's one real use of the intentionally
    // outdated lodash@4.17.15 pin, see package.json and Project 2's
    // brief. `npm audit` confirms multiple real, disclosed advisories
    // against this exact pinned version (prototype pollution, command
    // injection, ReDoS), a genuine, live SCA finding, not a dependency
    // added purely for show.
    const doc = _.cloneDeep(result.rows[0]);
    res.status(201).json(doc);
  } catch (err) {
    res.status(503).json({ error: "Database unavailable" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM documents WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(503).json({ error: "Database unavailable" });
  }
});

/**
 * SEEDED FINDING for Project 1 (SAST) and Project 3 (DAST): the query
 * below is built with raw string concatenation instead of a
 * parameterized query, a textbook SQL injection, deliberately left
 * exactly this way so a SAST rule and a real DAST payload both have a
 * genuine, findable target here, not a synthetic example bolted on
 * separately. Compare against the parameterized queries above and in
 * comments.js below, that contrast is the point.
 *
 * This same endpoint also calls the intentionally naive
 * parseSearchQuery() from lib/searchQuery.js, Project 7's fuzz target,
 * documented there. One endpoint, three different testing
 * methodologies (SAST, DAST, fuzzing), three different real findings.
 */
router.get("/search", async (req, res) => {
  const q = req.query.q || "";

  let tokens;
  try {
    tokens = parseSearchQuery(String(q));
  } catch (err) {
    return res.status(400).json({ error: "Invalid query" });
  }

  const searchTerm = tokens.map((t) => t.value).join(" ");

  try {
    // VULNERABLE ON PURPOSE, see comment above. Do not "fix" this
    // without it being Project 1 or Project 3's documented deliverable.
    const query = `SELECT id, title FROM documents WHERE title ILIKE '%${searchTerm}%'`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(503).json({ error: "Database unavailable" });
  }
});

/**
 * SEEDED FINDING for Project 1 (SAST) and Project 3 (DAST/IAST): the
 * document title is written into the HTML response without escaping.
 * A title containing a script tag round-trips straight into the
 * response, a textbook reflected/stored XSS, deliberately left this
 * way for the same reason as the search endpoint above.
 */
router.get("/:id/render", async (req, res) => {
  try {
    const result = await pool.query("SELECT title, body FROM documents WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }
    const { title, body } = result.rows[0];

    // VULNERABLE ON PURPOSE: no escaping applied to `title` or `body`
    // before interpolating into HTML.
    res.set("Content-Type", "text/html");
    res.send(`<html><body><h1>${title}</h1><p>${body}</p></body></html>`);
  } catch (err) {
    res.status(503).json({ error: "Database unavailable" });
  }
});

router.post("/:id/comments", async (req, res) => {
  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid comment data" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO comments (document_id, body) VALUES ($1, $2) RETURNING id, body, created_at",
      [req.params.id, parsed.data.body]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(503).json({ error: "Database unavailable" });
  }
});

module.exports = router;
