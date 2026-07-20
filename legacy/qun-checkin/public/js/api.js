const JSON_HEADERS = {
  "Content-Type": "application/json",
};

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({
    ok: false,
    error: {
      code: response.status,
      message: "服务器返回了无法解析的响应",
    },
  }));

  if (!response.ok || payload?.ok === false) {
    const message = payload?.error?.message || payload?.message || `请求失败 (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload.data;
}

function postJSON(url, body) {
  return request(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

async function fetchHealth() {
  return request("/api/health");
}

async function verifyToken(authToken) {
  return postJSON("/api/forms/verify-token", { authToken });
}

async function resolveForm(input, authToken) {
  return postJSON("/api/forms/resolve", { input, authToken });
}

async function listForms(authToken) {
  return postJSON("/api/forms/list", { authToken });
}

async function getFormInfo(formId, authToken) {
  return postJSON(`/api/forms/${encodeURIComponent(formId)}/info`, { authToken });
}

async function previewCheckin(formId, payload) {
  return postJSON(`/api/checkin/${encodeURIComponent(formId)}/preview`, payload);
}

async function submitCheckin(formId, payload) {
  return postJSON(`/api/checkin/${encodeURIComponent(formId)}/submit`, payload);
}

async function uploadImage(file, authToken) {
  const formData = new FormData();
  formData.set("authToken", authToken);
  formData.set("file", file);

  return request("/api/upload", {
    method: "POST",
    body: formData,
  });
}
