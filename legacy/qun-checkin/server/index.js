const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const formsRouter = require("./routes/forms");
const checkinRouter = require("./routes/checkin");
const uploadRouter = require("./routes/upload");
const { sendTokenToolZip } = require("./download");

const PORT = Number(process.env.PORT || 3002);
const publicDir = path.join(__dirname, "..", "public");

function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Invite-Code", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "checkin-web" });
  });

  app.get("/assets/tools/token_tool.zip", sendTokenToolZip);

  app.use("/api/forms", formsRouter);
  app.use("/api/checkin", checkinRouter);
  app.use("/api/upload", uploadRouter);

  app.use(express.static(publicDir, { extensions: ["html"] }));

  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({
        ok: false,
        error: { code: 404, message: "API not found" },
      });
    }
    return res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use((error, req, res, next) => {
    console.error("[checkin-web] error:", error);
    if (res.headersSent) {
      return next(error);
    }
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: {
        code: error.statusCode || 500,
        message: error.message || "Internal Server Error",
      },
    });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[checkin-web] listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = {
  createApp,
};
