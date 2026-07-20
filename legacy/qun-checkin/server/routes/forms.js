const express = require("express");

const {
  fetchActiveForms,
  loadFormDetails,
  mapQun100Error,
  requireUsableAuthToken,
  resolveFormId,
  verifyToken,
} = require("../services/qun100");

const router = express.Router();
const TOKEN_REFRESH_GUIDE = "会话已失效，请重新抓取新的 Authorization Token";

function requireAuthToken(body) {
  return requireUsableAuthToken(body?.authToken);
}

function respondQun100Error(res, error, fallbackMessage = "请求失败") {
  const message = mapQun100Error(error?.message || fallbackMessage);
  const statusCode = error?.statusCode
    || (message === TOKEN_REFRESH_GUIDE
      || message.includes("Authorization Token")
      || message.includes("重新抓取")
      ? 401
      : 500);

  return res.status(statusCode).json({
    ok: false,
    error: {
      code: statusCode,
      message,
      reason: error?.code || undefined,
    },
  });
}

router.post("/verify-token", async (req, res) => {
  try {
    const authToken = requireAuthToken(req.body);
    const result = await verifyToken(authToken);
    if (result.code !== 0) {
      throw new Error(result.message || "Token 无效");
    }

    return res.json({
      ok: true,
      data: result.data,
    });
  } catch (error) {
    return respondQun100Error(res, error, "Token 无效");
  }
});

router.post("/resolve", async (req, res) => {
  try {
    const authToken = requireAuthToken(req.body);
    const input = String(req.body?.input || "").trim();
    if (!input) {
      return res.status(400).json({
        ok: false,
        error: { code: 400, message: "请输入表单链接或 FormId" },
      });
    }

    const formId = await resolveFormId(input);
    if (!formId) {
      return res.status(404).json({
        ok: false,
        error: { code: 404, message: "无法解析表单 ID" },
      });
    }

    const details = await loadFormDetails(formId, authToken);
    return res.json({
      ok: true,
      data: {
        formId,
        title: details.profile.title,
        version: details.profile.version,
      },
    });
  } catch (error) {
    return respondQun100Error(res, error, "解析表单失败");
  }
});

router.post("/list", async (req, res) => {
  try {
    const authToken = requireAuthToken(req.body);
    const forms = await fetchActiveForms(authToken);
    return res.json({
      ok: true,
      data: {
        forms: forms.map((item) => ({
          formId: item.formId,
          title: item.title,
          status: item.status,
          createTime: item.createTime,
          modifyTime: item.modifyTime,
          version: item.version,
        })),
      },
    });
  } catch (error) {
    return respondQun100Error(res, error, "同步表单失败");
  }
});

router.post("/:formId/info", async (req, res) => {
  try {
    const authToken = requireAuthToken(req.body);
    const formId = String(req.params.formId || "").trim();
    if (!formId) {
      return res.status(400).json({
        ok: false,
        error: { code: 400, message: "缺少 formId" },
      });
    }

    const details = await loadFormDetails(formId, authToken);
    return res.json({
      ok: true,
      data: details,
    });
  } catch (error) {
    return respondQun100Error(res, error, "加载表单失败");
  }
});

module.exports = router;
