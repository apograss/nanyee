const express = require("express");
const multer = require("multer");

const { uploadImage } = require("../services/uploader");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    const authToken = String(req.body?.authToken || "").trim();
    if (!authToken) {
      return res.status(400).json({
        ok: false,
        error: { code: 400, message: "缺少 Authorization Token" },
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: { code: 400, message: "请选择要上传的图片" },
      });
    }

    const url = await uploadImage(
      req.file.buffer,
      req.file.originalname,
      authToken,
      req.file.mimetype,
    );

    return res.json({
      ok: true,
      data: {
        url,
        filename: req.file.originalname,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
