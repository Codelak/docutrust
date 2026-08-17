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

/**
 * FIXED (DevSecOps Project 1, deliverable 7): the query below now uses a
 * bound parameter ($1) instead of raw string concatenation — the SQL
 * injection is gone. The route is also registered before GET /:id: without
 * that ordering, Express matched "/documents/search" against "/:id" (id =
 * "search") and the endpoint was unreachable, returning 503 — discovered
 * during Project 1's reachability check.
 *
 * The endpoint still calls the intentionally naive parseSearchQuery() from
 * lib/searchQuery.js, Project 7's fuzz target, documented there.
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
    const result = await pool.query(
      "SELECT id, title FROM documents WHERE title ILIKE $1",
      [`%${searchTerm}%`]
    );
    res.json(result.rows);
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

// HTML-escapes text before it is interpolated into a response body.
// Covers the five characters that matter in text nodes and attribute
// values: & < > " '. Fix for the seeded reflected/stored XSS (Project 1,
// deliverable 7) — applied to both title and body.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}

/**
 * FIXED (DevSecOps Project 1, deliverable 7): `title` and `body` are now
 * HTML-escaped before interpolation, so a document containing a script tag
 * renders as inert text instead of executing in the victim's browser.
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

    res.set("Content-Type", "text/html");
    res.send(
      `<html><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`
    );
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
