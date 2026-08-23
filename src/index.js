const express = require("express");
const { pool } = require("./db");
const documentsRouter = require("./routes/documents");
const iast = require("./lib/iast");

const app = express();
const PORT = process.env.PORT || 3000;
const APP_VERSION = process.env.APP_VERSION || "dev";

app.use(express.json());

// IAST instrumentation (DevSecOps Project 3, deliverable 4): active only
// when DOCUTRUST_IAST=1. Sources middleware marks query/body values as
// tainted fragments; the sink wrapper checks SQL and HTML sinks. See
// src/lib/iast.js for the mechanism and its documented scope.
if (iast.ENABLED) {
  iast.installSources(app);
  app.use(iast.installSinks());
}

app.use("/documents", documentsRouter);

app.get("/healthz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", version: APP_VERSION });
  } catch (err) {
    res.status(503).json({ status: "unhealthy", error: err.message });
  }
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal error" });
});

app.listen(PORT, () => {
  console.log(`DocuTrust ${APP_VERSION} listening on ${PORT}`);
});

module.exports = app;
