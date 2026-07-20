const https = require("https");
const path = require("path");

const { apiRequest } = require("./qun100");

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

async function getUploadCredentials(auth, fileNum = 1) {
  const response = await apiRequest("GET", `/v2/image/pre_upload?fileNum=${fileNum}`, null, auth);
  if (response.code !== 0 && !response.data) {
    throw new Error(response.message || "获取上传凭证失败");
  }
  return response.data;
}

function uploadToOSS(fileBuffer, originalName, credentials, contentType) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(originalName).toLowerCase() || ".jpg";
    const filename = credentials.filenames[0];
    const key = `${credentials.aliSign.prefix}${filename}${ext}`;
    const mimeType = contentType || MIME_TYPES[ext] || "application/octet-stream";
    const boundary = `----CheckinBoundary${Date.now()}`;

    const formFields = {
      key,
      policy: credentials.aliSign.policy,
      OSSAccessKeyId: credentials.aliSign.accessid,
      signature: credentials.aliSign.signature,
      success_action_status: "200",
    };

    const parts = [];
    for (const [name, value] of Object.entries(formFields)) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8",
      ));
    }

    const fileHeader = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(originalName)}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      "utf8",
    );
    const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const body = Buffer.concat([...parts, fileHeader, fileBuffer, fileFooter]);

    const hostUrl = new URL(credentials.aliSign.host);
    const request = https.request(
      {
        hostname: hostUrl.hostname,
        port: 443,
        path: "/",
        method: "POST",
        timeout: 30000,
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (response) => {
        let raw = "";
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          if (response.statusCode === 200 || response.statusCode === 204) {
            resolve(`${credentials.aliSign.cdn}/${key}`);
            return;
          }
          reject(new Error(`OSS 上传失败 (${response.statusCode || 500}): ${raw.slice(0, 200)}`));
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("OSS 上传超时"));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function uploadImage(fileBuffer, originalName, auth, contentType) {
  const credentials = await getUploadCredentials(auth, 1);
  return uploadToOSS(fileBuffer, originalName, credentials, contentType);
}

module.exports = {
  getUploadCredentials,
  uploadImage,
};
