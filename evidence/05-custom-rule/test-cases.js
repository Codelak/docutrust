// Throwaway generalization test for semgrep/rules/docutrust-unsafe-sql-interpolation.yml
// Positive cases: every variant of the pattern the rule must catch.

const { pool } = require("../../src/db");

// POSITIVE 1: direct interpolated template literal (same class as the seeded line)
async function directInterpolated(userId) {
  const rows = await pool.query(`SELECT * FROM users WHERE id = ${userId}`);
  return rows;
}

// POSITIVE 2: direct string concatenation
async function directConcat(name) {
  return pool.query("SELECT * FROM users WHERE name = '" + name + "'");
}

// POSITIVE 3: SQL string assembled in a variable, then passed later
// (exactly the DocuTrust seeded shape at src/routes/documents.js:76)
async function indirectVariable(term) {
  const query = `SELECT id, title FROM documents WHERE title ILIKE '%${term}%'`;
  const result = await pool.query(query);
  return result.rows;
}

// POSITIVE 4: UPDATE via concatenation, a different statement kind
async function updateConcat(id, body) {
  return pool.query("UPDATE documents SET body = '" + body + "' WHERE id = " + id);
}

// POSITIVE 5: SQL string assembled by concatenation in a variable first
async function concatVariable(id) {
  const q = "SELECT * FROM documents WHERE id = " + id;
  return pool.query(q);
}

// NEGATIVE 1: parameterized query — must NOT be flagged
async function parameterized(term) {
  const result = await pool.query(
    "SELECT id, title FROM documents WHERE title ILIKE $1",
    [`%${term}%`]
  );
  return result.rows;
}

// NEGATIVE 2: non-SQL interpolation (log message, template) — must NOT be flagged
const greeting = `hello ${process.env.USER || "world"}`;

// NEGATIVE 3: static SQL string with no interpolation — must NOT be flagged
async function staticQuery() {
  return pool.query("SELECT id, title FROM documents ORDER BY created_at DESC");
}

module.exports = { directInterpolated, directConcat, indirectVariable, updateConcat, parameterized, staticQuery, greeting };
