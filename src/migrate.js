const fs = require("fs");
const path = require("path");
const { pool } = require("./db");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`Applying ${file}`);
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error(`Migration ${file} failed:`, err.message);
      process.exit(1);
    }
  }

  console.log("Migrations up to date");
  await pool.end();
}

run();
