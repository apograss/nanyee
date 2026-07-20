const https = require("https");

const API_HOST = "form.qun100.com";
const APP_ID = "wxfc4ef6d539d03373";
const MIN_AUTH_TOKEN_LENGTH = 60;

function normalizeAuthToken(authToken) {
  return String(authToken || "").trim();
}

function looksLikeTruncatedToken(authToken) {
  const token = normalizeAuthToken(authToken);
  return Boolean(token) && (token.includes("...") || token.includes("…"));
}

function inspectAuthToken(authToken) {
  const token = normalizeAuthToken(authToken);

  if (!token) {
    return {
      kind: "missing",
      message: "缺少 Authorization Token",
    };
  }

  if (looksLikeTruncatedToken(token)) {
    return {
      kind: "truncated",
      message:
        "Authorization Token 看起来被截断了，请重新运行 tools/get_token.bat，重新抓取新的 Authorization Token，并粘贴完整 token。",
    };
  }

  if (/\s/.test(token)) {
    return {
      kind: "invalid-format",
      message:
        "Authorization Token 含有空格或换行，请重新运行 tools/get_token.bat，重新抓取新的 Authorization Token，并粘贴完整 token。",
    };
  }

  if (token.length < MIN_AUTH_TOKEN_LENGTH) {
    return {
      kind: "too-short",
      message:
        `Authorization Token 太短（当前 ${token.length} 字符），通常是复制不完整。请重新运行 tools/get_token.bat，重新抓取新的 Authorization Token，并粘贴完整 token。`,
    };
  }

  return null;
}

function requireUsableAuthToken(authToken) {
  const token = normalizeAuthToken(authToken);
  const issue = inspectAuthToken(token);
  if (issue) {
    const error = new Error(issue.message);
    error.statusCode = 400;
    error.code = issue.kind;
    throw error;
  }
  return token;
}

function mapQun100Error(message) {
  if (!message) return "请求失败";
  if (String(message).includes("会话超时")) {
    return "会话已失效，请重新抓取新的 Authorization Token。可以重新运行 tools/get_token.bat 获取并粘贴完整 token。";
  }
  return message;
}

function apiRequest(method, apiPath, body, auth, hostname = API_HOST) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const request = https.request(
      {
        hostname,
        port: 443,
        path: apiPath,
        method,
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
          "Client-App-Id": APP_ID,
          xweb_xhr: "1",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF",
          Referer: `https://servicewechat.com/${APP_ID}/305/page-frame.html`,
          Accept: "*/*",
        },
      },
      (response) => {
        let raw = "";
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            resolve({
              status: response.statusCode || 200,
              ...parsed,
            });
          } catch {
            reject(
              new Error(
                `群报数接口返回非 JSON 响应 (${response.statusCode || 500}): ${raw.slice(0, 180)}`,
              ),
            );
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("请求超时"));
    });
    request.on("error", reject);

    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

async function verifyToken(auth) {
  try {
    return await apiRequest("GET", "/v1/storage_space/status", null, auth);
  } catch (error) {
    if (String(error?.message || "").includes("请求超时")) {
      return apiRequest("GET", "/v1/storage_space/status", null, auth);
    }
    throw error;
  }
}

async function getFormProfile(formId, auth) {
  return apiRequest("GET", `/v1/form/${formId}/profile`, null, auth);
}

async function getFormCatalog(formId, auth) {
  return apiRequest("GET", `/v1/form/${formId}/catalog`, null, auth);
}

async function getLastRecord(formId, auth) {
  return apiRequest("GET", `/v1/${formId}/form_data/last`, null, auth);
}

async function submitFormData(formId, payload, auth) {
  return apiRequest("POST", `/v1/${formId}/form_data`, payload, auth);
}

async function fetchActiveForms(auth) {
  const response = await apiRequest(
    "GET",
    "/v2/creation_forms?pageNo=1&pageSize=20&folderId=&forDraft=false",
    null,
    auth,
  );

  if (response.code !== 0) {
    throw new Error(mapQun100Error(response.message || "同步表单失败"));
  }

  const groups = response.data?.creations || {};
  const forms = [];
  const seen = new Set();

  for (const groupItems of Object.values(groups)) {
    if (!Array.isArray(groupItems)) continue;
    for (const item of groupItems) {
      if (!item.formId || seen.has(item.formId)) continue;
      seen.add(item.formId);
      forms.push(item);
    }
  }

  return forms;
}

async function resolveFormId(input) {
  const text = String(input || "").trim();
  if (!text) return null;
  if (/^\d{15,}$/.test(text)) return text;

  const directMatch =
    text.match(/formId[=:]\s*(\d{15,})/i) ||
    text.match(/fid[=:]\s*(\d{15,})/i);
  if (directMatch) {
    return directMatch[1];
  }

  if (!/qun100\.com/.test(text)) {
    return null;
  }

  const url = new URL(text.startsWith("http") ? text : `https://${text}`);
  const location = await new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (response) => {
        resolve(response.headers.location || "");
      })
      .on("error", reject);
  });

  const locationText = String(location);
  const match =
    locationText.match(/formId[=%]3D(\d{15,})/i) ||
    locationText.match(/formId=(\d{15,})/i);
  return match ? match[1] : null;
}

async function loadFormDetails(formId, auth) {
  const [profileResponse, catalogResponse, lastRecordResponse] = await Promise.all([
    getFormProfile(formId, auth),
    getFormCatalog(formId, auth),
    getLastRecord(formId, auth).catch(() => null),
  ]);

  if (profileResponse.code !== 0) {
    throw new Error(mapQun100Error(profileResponse.message || "获取表单信息失败"));
  }
  if (catalogResponse.code !== 0) {
    throw new Error(mapQun100Error(catalogResponse.message || "获取表单字段失败"));
  }

  return {
    profile: profileResponse.data,
    catalogs: catalogResponse.data.catalogs || [],
    lastRecord: lastRecordResponse?.code === 0
      ? lastRecordResponse.data?.formDataDto || null
      : null,
  };
}

module.exports = {
  API_HOST,
  APP_ID,
  MIN_AUTH_TOKEN_LENGTH,
  apiRequest,
  verifyToken,
  getFormProfile,
  getFormCatalog,
  getLastRecord,
  submitFormData,
  fetchActiveForms,
  resolveFormId,
  loadFormDetails,
  mapQun100Error,
  normalizeAuthToken,
  looksLikeTruncatedToken,
  inspectAuthToken,
  requireUsableAuthToken,
};
