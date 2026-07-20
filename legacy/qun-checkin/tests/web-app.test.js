const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const projectRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function createApiServer() {
  const { createApp } = require(path.join(projectRoot, "server/index.js"));
  const app = createApp();
  return app.listen(0);
}

function requestJSON(server, method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const request = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path: requestPath,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode,
            body: raw ? JSON.parse(raw) : null,
          });
        });
      },
    );

    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

test("package exposes scripts for a lightweight static frontend plus proxy", () => {
  const pkg = JSON.parse(read("package.json"));

  assert.equal(pkg.main, "server/index.js");
  assert.ok(pkg.scripts.start);
  assert.ok(pkg.scripts.dev);
  assert.ok(pkg.dependencies.express);
  assert.ok(pkg.dependencies.helmet);
  assert.ok(pkg.dependencies.cors);
  assert.ok(pkg.dependencies.multer);
  assert.equal(Boolean(pkg.dependencies["better-sqlite3"]), false);
});

test("single-user local-storage architecture files exist", () => {
  const requiredFiles = [
    "server/index.js",
    "server/routes/forms.js",
    "server/routes/checkin.js",
    "server/routes/upload.js",
    "server/services/qun100.js",
    "server/services/payload-builder.js",
    "server/services/uploader.js",
    "public/index.html",
    "public/tutorial.html",
    "public/css/style.css",
    "public/js/app.js",
    "public/js/api.js",
    "public/js/ui.js",
    "ecosystem.config.js",
  ];

  for (const file of requiredFiles) {
    assert.ok(fs.existsSync(path.join(projectRoot, file)), `${file} should exist`);
  }
});

test("payload builder prefers user defaults and custom fields over stale values", () => {
  const { buildPayload } = require(path.join(projectRoot, "server/services/payload-builder.js"));

  const catalogs = [
    { cid: "loc", type: "LOCATION", config: {} },
    { cid: "name", type: "WORD", config: { NAME_LIST: { active: true } } },
    { cid: "radio", type: "RADIO", config: { OPTIONS: { content: [{ value: "A" }, { value: "B" }] } } },
    { cid: "checkbox", type: "CHECKBOX", config: {} },
    { cid: "date", type: "DATE", config: {} },
  ];

  const lastRecord = {
    catalogs: [
      { cid: "loc", value: { title: "旧定位" } },
      { cid: "radio", value: "A" },
      { cid: "checkbox", value: ["old"] },
    ],
  };

  const payload = buildPayload(
    catalogs,
    lastRecord,
    {
      displayName: "刘恺",
      defaultLat: 22.7,
      defaultLng: 113.2,
      defaultAddress: "南医顺德校区",
    },
    {
      radio: "B",
      checkbox: ["new1", "new2"],
    },
  );

  assert.equal(payload.find((item) => item.cid === "name").value, "刘恺");
  assert.equal(payload.find((item) => item.cid === "radio").value, "B");
  assert.deepEqual(payload.find((item) => item.cid === "checkbox").value, ["new1", "new2"]);
  assert.equal(payload.find((item) => item.cid === "loc").value.title, "南医顺德校区");
  assert.match(payload.find((item) => item.cid === "date").value, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test("payload builder serializes grouped name-list values in Qun100 format", () => {
  const { buildPayload } = require(path.join(projectRoot, "server/services/payload-builder.js"));

  const catalogs = [
    {
      cid: "name",
      type: "WORD",
      config: {
        NAME_LIST: {
          active: true,
          content: {
            groups: [
              {
                groupId: "12",
                groupName: "2025精神医学",
                status: 0,
                value: [
                  { name: "刘恺", status: 0 },
                  { name: "李佳", status: 0 },
                ],
              },
            ],
          },
        },
        NAME_LIST_ACTIVE_TYPE: { active: true, content: "GROUP" },
        NAME_LIST_FILL_TYPE: { active: true, content: "INPUT_FILL" },
      },
    },
  ];

  const payload = buildPayload(
    catalogs,
    null,
    { displayName: "2025精神医学刘恺" },
    {},
  );

  assert.equal(payload[0].value, "刘恺 12");
});

test("frontend app stores token and form config locally instead of expecting server-side accounts", () => {
  const appJs = read("public/js/app.js");

  assert.match(appJs, /localStorage/);
  assert.match(appJs, /qun100-checkin\.authToken/);
  assert.match(appJs, /qun100-checkin\.savedForms/);
  assert.match(appJs, /qun100-checkin\.customFields/);
  assert.doesNotMatch(appJs, /inviteCode/);
});

test("token verification and sync use real auth-sensitive endpoints", () => {
  const service = read("server/services/qun100.js");

  assert.match(service, /\/v1\/storage_space\/status/);
  assert.match(service, /\/v2\/creation_forms\?pageNo=1&pageSize=20&folderId=&forDraft=false/);
  assert.doesNotMatch(service, /verifyToken\(auth\)\s*\{\s*return apiRequest\("GET", "\/v1\/operation_forms\?tabId=NO_TAB"/);
});

test("forms routes translate expired sessions into clear token refresh guidance", () => {
  const service = read("server/services/qun100.js");
  const checkinRoute = read("server/routes/checkin.js");

  assert.match(service, /会话已失效，请重新抓取新的 Authorization Token/);
  assert.match(checkinRoute, /会话已失效，请重新抓取新的 Authorization Token/);
});

test("frontend warns when the pasted token looks truncated and points users back to get_token.bat", () => {
  const appJs = read("public/js/app.js");

  assert.match(appJs, /tools\/get_token\.bat/);
  assert.match(appJs, /重新抓取新的 Authorization Token/);
  assert.match(appJs, /looksLikeTruncatedToken|tokenLooksTruncated|isProbablyTruncatedToken/);
});

test("forms and checkin routes reject obviously short tokens before calling upstream", async () => {
  const server = createApiServer();

  try {
    const verifyResponse = await requestJSON(server, "POST", "/api/forms/verify-token", {
      authToken: "short-token",
    });
    assert.equal(verifyResponse.status, 400);
    assert.match(verifyResponse.body?.error?.message || "", /太短|不完整/);

    const previewResponse = await requestJSON(server, "POST", "/api/checkin/123456789012345/preview", {
      authToken: "short-token",
    });
    assert.equal(previewResponse.status, 400);
    assert.match(previewResponse.body?.error?.message || "", /太短|不完整/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("qun100 service exposes explicit token inspection and refresh guidance", () => {
  const { inspectAuthToken, mapQun100Error } = require(path.join(projectRoot, "server/services/qun100.js"));

  assert.equal(typeof inspectAuthToken, "function");
  assert.match(
    inspectAuthToken("2XEMO6kICDthQHYxo5mMXjCHkyU_QdrqEE1...")?.message || "",
    /get_token\.bat/,
  );
  assert.match(mapQun100Error("会话超时"), /get_token\.bat/);
});

test("settings view includes a map picker entry point for selecting coordinates", () => {
  const uiJs = read("public/js/ui.js");
  const indexHtml = read("public/index.html");
  const appJs = read("public/js/app.js");

  assert.match(uiJs, /地图选点|在地图上选择位置/);
  assert.match(uiJs, /搜索地址|输入地址、楼栋或地标后搜索/);
  assert.match(indexHtml, /AMap|webapi\.amap\.com/i);
  assert.match(appJs, /runMapSearch|pickMapSearchResult/);
});

test("frontend supports one-shot local scheduled check-ins while the page stays open", () => {
  const appJs = read("public/js/app.js");
  const uiJs = read("public/js/ui.js");
  const css = read("public/css/style.css");

  assert.match(appJs, /qun100-checkin\.schedules/);
  assert.match(appJs, /SCHEDULE_EXPIRE_MS/);
  assert.match(appJs, /SCHEDULE_TIME_ZONE = "Asia\/Shanghai"/);
  assert.match(appJs, /parseChinaDatetimeLocalValue/);
  assert.match(appJs, /function runDueSchedules/);
  assert.match(appJs, /function runScheduledSubmit/);
  assert.match(appJs, /startScheduleTimer/);
  assert.match(uiJs, /预约打卡/);
  assert.match(uiJs, /北京时间 UTC\+8/);
  assert.match(uiJs, /datetime-local/);
  assert.match(uiJs, /data-action="save-schedule"/);
  assert.match(css, /schedule-card/);
});

test("token tool download route returns a real zip attachment instead of the SPA HTML shell", async () => {
  const server = createApiServer();

  try {
    const response = await new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: "127.0.0.1",
          port: server.address().port,
          path: "/assets/tools/token_tool.zip",
          method: "GET",
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            });
          });
        },
      );

      request.on("error", reject);
      request.end();
    });

    assert.equal(response.status, 200);
    assert.match(String(response.headers["content-type"] || ""), /application\/zip/);
    assert.match(String(response.headers["content-disposition"] || ""), /attachment;.*token_tool\.zip/);
    assert.equal(response.body[0], 0x50); // PK
    assert.equal(response.body[1], 0x4b);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
