const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const toolsDir = path.join(__dirname, "..", "tools");
const tokenToolFiles = [
  "setup.bat",
  "get_token.bat",
  "capture_token.py",
  "README.md",
];

function appendIfExists(archive, fileName) {
  const fullPath = path.join(toolsDir, fileName);
  if (!fs.existsSync(fullPath)) {
    return;
  }
  archive.file(fullPath, { name: fileName });
}

function sendTokenToolZip(req, res, next) {
  try {
    res.status(200);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="token_tool.zip"');
    res.setHeader("Cache-Control", "public, max-age=3600");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", next);
    archive.pipe(res);

    for (const fileName of tokenToolFiles) {
      appendIfExists(archive, fileName);
    }

    archive.finalize();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  sendTokenToolZip,
};
