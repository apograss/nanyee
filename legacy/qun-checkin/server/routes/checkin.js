const express = require("express");

const { buildPayload } = require("../services/payload-builder");
const {
  loadFormDetails,
  mapQun100Error,
  requireUsableAuthToken,
  submitFormData,
} = require("../services/qun100");

const router = express.Router();
const TOKEN_REFRESH_GUIDE = "会话已失效，请重新抓取新的 Authorization Token";

function requireAuthToken(body) {
  return requireUsableAuthToken(body?.authToken);
}

function normalizeUserDefaults(body) {
  return {
    displayName: String(body?.displayName || "").trim(),
    defaultLat:
      body?.defaultLat === "" || body?.defaultLat == null
        ? null
        : Number(body.defaultLat),
    defaultLng:
      body?.defaultLng === "" || body?.defaultLng == null
        ? null
        : Number(body.defaultLng),
    defaultAddress: String(body?.defaultAddress || "").trim(),
  };
}

function buildPreviewItems(payload) {
  return payload.map((item) => ({
    cid: item.cid,
    type: item.type,
    value: item.value,
  }));
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

router.post("/:formId/preview", async (req, res) => {
  try {
    const authToken = requireAuthToken(req.body);
    const formId = String(req.params.formId || "").trim();
    const details = await loadFormDetails(formId, authToken);
    const payload = buildPayload(
      details.catalogs,
      details.lastRecord,
      normalizeUserDefaults(req.body),
      req.body?.customFields || {},
    );

    return res.json({
      ok: true,
      data: {
        profile: {
          formId,
          title: details.profile.title,
          version: details.profile.version,
        },
        payload,
        preview: buildPreviewItems(payload),
      },
    });
  } catch (error) {
    return respondQun100Error(res, error, "生成预览失败");
  }
});

router.post("/:formId/submit", async (req, res) => {
  try {
    const authToken = requireAuthToken(req.body);
    const formId = String(req.params.formId || "").trim();
    const details = await loadFormDetails(formId, authToken);
    const payload = buildPayload(
      details.catalogs,
      details.lastRecord,
      normalizeUserDefaults(req.body),
      req.body?.customFields || {},
    );

    const startedAt = Date.now();
    const submitResponse = await submitFormData(
      formId,
      {
        fid: "",
        subscribe: {},
        catalogs: payload,
        showQuestions: payload.map((item) => item.cid),
        formVersion: details.profile.version,
      },
      authToken,
    );

    return res.json({
      ok: submitResponse.code === 0,
      data: {
        payload,
        profile: {
          formId,
          title: details.profile.title,
          version: details.profile.version,
        },
        result: submitResponse,
        durationMs: Date.now() - startedAt,
      },
      error: submitResponse.code === 0
        ? undefined
        : {
            code: submitResponse.code || 500,
            message: mapQun100Error(submitResponse.message || "提交失败"),
          },
    });
  } catch (error) {
    return respondQun100Error(res, error, "提交失败");
  }
});

module.exports = router;
