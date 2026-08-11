const express = require("express");
const { pool } = require("./db");
const documentsRouter = require("./routes/documents");

const app = express();
const PORT = process.env.PORT || 3000;
const APP_VERSION = process.env.APP_VERSION || "dev";

app.use(express.json());
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
