const STORAGE_KEYS = {
  authToken: "qun100-checkin.authToken",
  profile: "qun100-checkin.profile",
  defaults: "qun100-checkin.defaults",
  savedForms: "qun100-checkin.savedForms",
  customFields: "qun100-checkin.customFields",
  recentLogs: "qun100-checkin.recentLogs",
  activeFormId: "qun100-checkin.activeFormId",
  schedules: "qun100-checkin.schedules",
};

const ROUTES = new Set(["/dashboard", "/settings", "/tutorial"]);
const DEFAULT_ROUTE = "/dashboard";
const MAX_LOGS = 20;
const MIN_AUTH_TOKEN_LENGTH = 60;
const TOKEN_REFRESH_ACTION =
  "请重新运行 tools/get_token.bat，重新抓取新的 Authorization Token，并粘贴完整 token。";
const DEFAULT_MAP_CENTER = {
  lat: 22.805618,
  lng: 113.28735,
};
const MAP_DEFAULT_ZOOM = 16;
const MAP_SEARCH_LIMIT = 5;
const SCHEDULE_TIMER_MS = 15 * 1000;
const SCHEDULE_EXPIRE_MS = 2 * 60 * 60 * 1000;
const SCHEDULE_TIME_ZONE = "Asia/Shanghai";
const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

const appRoot = document.querySelector("#app");
const toastRoot = document.querySelector("#toast-root");
const mapRuntime = {
  map: null,
  marker: null,
  geocoder: null,
  activeRequestId: 0,
  syncHandler: null,
};
const scheduleRuntime = {
  timer: null,
  scanning: false,
  runningFormIds: new Set(),
};

const state = {
  route: getRoute(),
  authToken: readStorage(STORAGE_KEYS.authToken, ""),
  profile: readJSON(STORAGE_KEYS.profile, { displayName: "" }),
  defaults: readJSON(STORAGE_KEYS.defaults, {
    defaultLat: "",
    defaultLng: "",
    defaultAddress: "",
  }),
  savedForms: sortForms(readJSON(STORAGE_KEYS.savedForms, [])),
  customFieldsByForm: readJSON(STORAGE_KEYS.customFields, {}),
  recentLogs: readJSON(STORAGE_KEYS.recentLogs, []),
  activeFormId: readStorage(STORAGE_KEYS.activeFormId, ""),
  schedulesByForm: readJSON(STORAGE_KEYS.schedules, {}),
  activeFormDetails: null,
  previewData: null,
  formInput: "",
  pending: {},
  health: null,
  openSections: {},
  mapPicker: {
    open: true,
    mapAvailable: typeof window !== "undefined" && typeof window.AMap !== "undefined",
    lat: "",
    lng: "",
    address: "",
    status: "点击地图落点，或使用浏览器定位。",
    query: "",
    results: [],
    selectedResultIndex: -1,
  },
};

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  localStorage.setItem(key, value);
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getRoute() {
  const route = location.hash.replace(/^#/, "") || DEFAULT_ROUTE;
  return ROUTES.has(route) ? route : DEFAULT_ROUTE;
}

function sortForms(forms) {
  return [...forms].sort((a, b) => {
    const aTime = new Date(a.syncedAt || a.modifyTime || a.createTime || 0).getTime();
    const bTime = new Date(b.syncedAt || b.modifyTime || b.createTime || 0).getTime();
    return bTime - aTime;
  });
}

function persistCoreState() {
  saveStorage(STORAGE_KEYS.authToken, normalizeAuthToken(state.authToken));
  saveJSON(STORAGE_KEYS.profile, state.profile);
  saveJSON(STORAGE_KEYS.defaults, state.defaults);
  saveJSON(STORAGE_KEYS.savedForms, state.savedForms);
  saveJSON(STORAGE_KEYS.customFields, state.customFieldsByForm);
  saveJSON(STORAGE_KEYS.recentLogs, state.recentLogs);
  saveStorage(STORAGE_KEYS.activeFormId, state.activeFormId || "");
  saveJSON(STORAGE_KEYS.schedules, state.schedulesByForm);
}

function setPending(key, value) {
  state.pending[key] = value;
  render();
}

function normalizeNumber(value) {
  if (value === "" || value == null) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : "";
}

function normalizeAuthToken(value) {
  return String(value ?? "").trim();
}

function looksLikeTruncatedToken(value) {
  const token = normalizeAuthToken(value);
  return Boolean(token) && (token.includes("...") || token.includes("…"));
}

function getAuthTokenIssue(value) {
  const token = normalizeAuthToken(value);
  if (!token) return null;

  if (looksLikeTruncatedToken(token)) {
    return {
      kind: "truncated",
      title: "Token 看起来被截断",
      message: `Authorization Token 看起来被截断了，${TOKEN_REFRESH_ACTION}`,
    };
  }

  if (/\s/.test(token)) {
    return {
      kind: "invalid-format",
      title: "Token 格式不正确",
      message: `Authorization Token 含有空格或换行，${TOKEN_REFRESH_ACTION}`,
    };
  }

  if (token.length < MIN_AUTH_TOKEN_LENGTH) {
    return {
      kind: "too-short",
      title: "Token 太短",
      message:
        `Authorization Token 太短（当前 ${token.length} 字符），通常是复制不完整。${TOKEN_REFRESH_ACTION}`,
    };
  }

  return null;
}

function syncAuthTokenHint() {
  const node = appRoot.querySelector("[data-token-hint]");
  if (!node) return;
  const issue = getAuthTokenIssue(state.authToken);
  node.textContent = issue
    ? issue.message
    : "Token 失效后，可重新运行 tools/get_token.bat 重新抓取新的 Authorization Token。";
  node.dataset.level = issue ? "warn" : "info";
}

function ensureUsableAuthToken(actionTitle) {
  const issue = getAuthTokenIssue(state.authToken);
  if (!issue) return true;
  appendLog("error", `${actionTitle}前 Token 需要处理`, issue.message);
  pushToast(issue.title, issue.message);
  if (state.route !== "/settings") {
    location.hash = "#/settings";
  }
  return false;
}

function hasValidCoordinates(lat, lng) {
  if (lat === "" || lat == null || lng === "" || lng == null) return false;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function roundCoordinate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(6)) : "";
}

function formatCoordinateDisplay(value) {
  if (value === "" || value == null) return "--";
  return Number.isFinite(Number(value)) ? Number(value).toFixed(6) : "--";
}

function getMapPickerCenter() {
  if (hasValidCoordinates(state.mapPicker.lat, state.mapPicker.lng)) {
    return [Number(state.mapPicker.lng), Number(state.mapPicker.lat)];
  }
  return [DEFAULT_MAP_CENTER.lng, DEFAULT_MAP_CENTER.lat];
}

function syncMapPickerSummary() {
  const latNode = appRoot.querySelector('[data-map-draft="lat"]');
  const lngNode = appRoot.querySelector('[data-map-draft="lng"]');
  const addressNode = appRoot.querySelector('[data-map-draft="address"]');
  const statusNode = appRoot.querySelector('[data-map-draft="status"]');
  const applyButton = appRoot.querySelector('[data-action="apply-map-picker"]');

  if (latNode) latNode.textContent = formatCoordinateDisplay(state.mapPicker.lat);
  if (lngNode) lngNode.textContent = formatCoordinateDisplay(state.mapPicker.lng);
  if (addressNode) {
    addressNode.textContent =
      state.mapPicker.address || "选择后会尽量自动反查地址；失败时可回设置页手填";
  }
  if (statusNode) {
    statusNode.textContent = state.mapPicker.status || "点击地图落点，或使用浏览器定位。";
  }
  if (applyButton) {
    applyButton.disabled = !hasValidCoordinates(state.mapPicker.lat, state.mapPicker.lng);
  }
}

function clearMapMarker() {
  if (!mapRuntime.marker || !mapRuntime.map) return;
  mapRuntime.marker.setMap(null);
  mapRuntime.marker = null;
}

function syncMapCanvasPosition() {
  const canvas = document.getElementById("map-picker-canvas");
  const slot = appRoot.querySelector("#map-picker-slot");
  if (!canvas || !slot || state.route !== "/settings") {
    if (canvas) canvas.style.display = "none";
    return;
  }
  const rect = slot.getBoundingClientRect();
  canvas.style.left = rect.left + "px";
  canvas.style.top = rect.top + "px";
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
}

function teardownMapPicker() {
  mapRuntime.activeRequestId += 1;
  clearMapMarker();
  if (mapRuntime.map) {
    mapRuntime.map.destroy();
    mapRuntime.map = null;
  }
  mapRuntime.geocoder = null;
  if (mapRuntime.syncHandler) {
    window.removeEventListener("scroll", mapRuntime.syncHandler);
    window.removeEventListener("resize", mapRuntime.syncHandler);
    mapRuntime.syncHandler = null;
  }
  const canvas = document.getElementById("map-picker-canvas");
  if (canvas) canvas.style.display = "none";
}

function setMapPickerDraft(next) {
  state.mapPicker = {
    ...state.mapPicker,
    ...next,
    mapAvailable: typeof window !== "undefined" && typeof window.AMap !== "undefined",
    open: true,
  };
  syncMapPickerSummary();
}

function ensureMapMarker(lat, lng) {
  if (!mapRuntime.map || typeof window === "undefined" || !window.AMap) return;
  const position = new window.AMap.LngLat(lng, lat);

  if (!mapRuntime.marker) {
    mapRuntime.marker = new window.AMap.Marker({
      position,
      offset: new window.AMap.Pixel(-13, -30),
    });
    mapRuntime.marker.setMap(mapRuntime.map);
    return;
  }

  mapRuntime.marker.setPosition(position);
}

async function reverseGeocodeLocation(lat, lng) {
  if (!mapRuntime.geocoder) {
    setMapPickerDraft({
      status: "高德地理编码暂时不可用，请手动填写地址。",
    });
    return;
  }

  const requestToken = mapRuntime.activeRequestId + 1;
  mapRuntime.activeRequestId = requestToken;
  setMapPickerDraft({ status: "正在反查地址…" });

  await new Promise((resolve) => {
    mapRuntime.geocoder.getAddress([lng, lat], (status, result) => {
      if (requestToken !== mapRuntime.activeRequestId) {
        resolve();
        return;
      }

      const address = status === "complete" ? result?.regeocode?.formattedAddress : "";
      setMapPickerDraft({
        address: address || state.mapPicker.address,
        status: address
          ? "地址已更新，可回填到默认地点。"
          : "坐标已更新，但地址反查失败；可回设置页继续手填地址。",
      });
      resolve();
    });
  });
}

async function runMapSearch() {
  if (!mapRuntime.geocoder) {
    pushToast("地图搜索不可用", "高德地理编码未初始化，请稍后重试。");
    return;
  }

  const keyword = String(state.mapPicker.query || "").trim();
  if (!keyword) {
    pushToast("请输入地址关键词", "例如教学楼、宿舍楼或具体道路。");
    return;
  }

  const requestId = mapRuntime.activeRequestId + 1;
  mapRuntime.activeRequestId = requestId;
  setMapPickerDraft({
    status: "正在搜索地址…",
    results: [],
    selectedResultIndex: -1,
  });

  await new Promise((resolve) => {
    mapRuntime.geocoder.getLocation(keyword, (status, result) => {
      if (requestId !== mapRuntime.activeRequestId) {
        resolve();
        return;
      }

      if (status !== "complete" || !Array.isArray(result?.geocodes) || result.geocodes.length === 0) {
        setMapPickerDraft({
          status: "没有搜到匹配地址，请换个关键词或直接点地图。",
          results: [],
          selectedResultIndex: -1,
        });
        resolve();
        return;
      }

      const results = result.geocodes.slice(0, MAP_SEARCH_LIMIT).map((item) => ({
        name: item.formattedAddress || keyword,
        address: item.district ? `${item.province || ""}${item.city || ""}${item.district}` : item.formattedAddress || "",
        lat: Number(item.location?.lat),
        lng: Number(item.location?.lng),
      }));

      setMapPickerDraft({
        status: `找到 ${results.length} 个候选地址，请选一个结果。`,
        results,
        selectedResultIndex: -1,
      });
      resolve();
    });
  });
}

async function pickMapSearchResult(index) {
  const result = state.mapPicker.results[index];
  if (!result) return;

  setMapPickerDraft({
    selectedResultIndex: index,
    address: result.name || result.address || state.mapPicker.address,
    status: "已选中搜索结果，正在更新地图位置…",
  });
  await updateMapSelection(result.lat, result.lng, "已选中搜索结果，正在反查地址…");
}

async function updateMapSelection(lat, lng, status = "已更新坐标，正在反查地址…") {
  const nextLat = roundCoordinate(lat);
  const nextLng = roundCoordinate(lng);

  if (!hasValidCoordinates(nextLat, nextLng)) return;

  ensureMapMarker(nextLat, nextLng);
  if (mapRuntime.map) {
    mapRuntime.map.setZoomAndCenter(Math.max(mapRuntime.map.getZoom(), MAP_DEFAULT_ZOOM), [nextLng, nextLat]);
  }

  setMapPickerDraft({
    lat: nextLat,
    lng: nextLng,
    status,
  });

  await reverseGeocodeLocation(nextLat, nextLng);
}

function resetMapPickerToDefaults() {
  const lat = roundCoordinate(state.defaults.defaultLat);
  const lng = roundCoordinate(state.defaults.defaultLng);

  if (hasValidCoordinates(lat, lng)) {
    ensureMapMarker(lat, lng);
    if (mapRuntime.map) {
      mapRuntime.map.setZoomAndCenter(MAP_DEFAULT_ZOOM, [lng, lat]);
    }
    setMapPickerDraft({
      lat,
      lng,
      address: state.defaults.defaultAddress || "",
      status: "已回到当前默认地点，可继续微调。",
      results: [],
      selectedResultIndex: -1,
    });
    return;
  }

  clearMapMarker();
  if (mapRuntime.map) {
    mapRuntime.map.setZoomAndCenter(13, [DEFAULT_MAP_CENTER.lng, DEFAULT_MAP_CENTER.lat]);
  }
  setMapPickerDraft({
    lat: "",
    lng: "",
    address: "",
    status: "当前还没有默认地点，请点击地图重新选择。",
    results: [],
    selectedResultIndex: -1,
  });
}

function openMapPicker() {
  state.mapPicker = {
    open: true,
    mapAvailable: typeof window !== "undefined" && typeof window.AMap !== "undefined",
    lat: state.defaults.defaultLat === "" ? "" : roundCoordinate(state.defaults.defaultLat),
    lng: state.defaults.defaultLng === "" ? "" : roundCoordinate(state.defaults.defaultLng),
    address: state.defaults.defaultAddress || "",
    status:
      state.defaults.defaultLat === "" || state.defaults.defaultLng === ""
        ? "点击地图落点，或使用浏览器定位。"
        : "已载入当前默认地点，可点击地图重新选择。",
    query: "",
    results: [],
    selectedResultIndex: -1,
  };
  render();
}

function closeMapPicker() {
  if (state.route !== "/settings") {
    teardownMapPicker();
    state.mapPicker = {
      ...state.mapPicker,
      open: false,
    };
    render();
  }
}

function applyMapPickerSelection() {
  if (!hasValidCoordinates(state.mapPicker.lat, state.mapPicker.lng)) {
    pushToast("还没有选点", "请先在地图上选择一个位置");
    return;
  }

  state.defaults = {
    ...state.defaults,
    defaultLat: roundCoordinate(state.mapPicker.lat),
    defaultLng: roundCoordinate(state.mapPicker.lng),
    defaultAddress: state.mapPicker.address || state.defaults.defaultAddress || "",
  };
  persistCoreState();
  pushToast("地点已保存", "默认打卡地点已更新");
  render();
}

async function useBrowserLocation() {
  if (!navigator.geolocation) {
    pushToast("浏览器不支持定位", "当前环境无法读取浏览器定位，请手动点地图或填写经纬度");
    setMapPickerDraft({
      status: "浏览器不支持定位，请手动点地图或填写经纬度。",
    });
    return;
  }

  setMapPickerDraft({
    status: "正在读取浏览器定位…",
  });

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      });
    });

    await updateMapSelection(
      position.coords.latitude,
      position.coords.longitude,
      "已读取浏览器定位，正在反查地址…",
    );
  } catch (error) {
    const message = error?.message || "浏览器定位失败";
    setMapPickerDraft({
      status: message,
    });
    pushToast("定位失败", message);
  }
}

function ensureMapPickerReady() {
  const canvas = document.getElementById("map-picker-canvas");

  if (state.route !== "/settings") {
    if (canvas) canvas.style.display = "none";
    return;
  }

  const slot = appRoot.querySelector("#map-picker-slot");
  const hasAMap = typeof window !== "undefined" && typeof window.AMap !== "undefined";

  if (!hasAMap || !slot || !canvas) {
    state.mapPicker.mapAvailable = hasAMap;
    if (canvas) canvas.style.display = "none";
    syncMapPickerSummary();
    return;
  }

  state.mapPicker.mapAvailable = true;

  // Position the persistent canvas over the slot using absolute positioning.
  // This avoids moving it into #app where innerHTML would destroy it.
  const rect = slot.getBoundingClientRect();
  canvas.style.display = "block";
  canvas.style.position = "fixed";
  canvas.style.left = rect.left + "px";
  canvas.style.top = rect.top + "px";
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  canvas.style.zIndex = "10";

  if (!mapRuntime.map) {
    mapRuntime.map = new window.AMap.Map(canvas, {
      viewMode: "2D",
      zoom: hasValidCoordinates(state.mapPicker.lat, state.mapPicker.lng) ? MAP_DEFAULT_ZOOM : 13,
      center: getMapPickerCenter(),
      mapStyle: "amap://styles/normal",
    });
    mapRuntime.geocoder = new window.AMap.Geocoder();

    mapRuntime.map.on("click", async (event) => {
      await updateMapSelection(event.lnglat.getLat(), event.lnglat.getLng());
    });
  }

  // Resize after layout settles
  window.setTimeout(() => {
    if (mapRuntime.map) mapRuntime.map.resize();
  }, 150);

  // Keep canvas aligned with slot on scroll/resize
  if (!mapRuntime.syncHandler) {
    mapRuntime.syncHandler = () => syncMapCanvasPosition();
    window.addEventListener("scroll", mapRuntime.syncHandler, { passive: true });
    window.addEventListener("resize", mapRuntime.syncHandler, { passive: true });
  }

  if (hasValidCoordinates(state.mapPicker.lat, state.mapPicker.lng)) {
    ensureMapMarker(Number(state.mapPicker.lat), Number(state.mapPicker.lng));
  } else {
    clearMapMarker();
  }

  syncMapPickerSummary();
}

function mergeSavedForm(item) {
  const next = {
    ...item,
    syncedAt: new Date().toISOString(),
  };
  const index = state.savedForms.findIndex((form) => form.formId === next.formId);
  if (index >= 0) {
    state.savedForms[index] = { ...state.savedForms[index], ...next };
  } else {
    state.savedForms.push(next);
  }
  state.savedForms = sortForms(state.savedForms);
  persistCoreState();
}

function appendLog(kind, title, message) {
  state.recentLogs = [
    {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      kind,
      title,
      message,
      time: new Date().toISOString(),
    },
    ...state.recentLogs,
  ].slice(0, MAX_LOGS);
  persistCoreState();
}

function getActiveSchedule() {
  if (!state.activeFormId) return null;
  return state.schedulesByForm[state.activeFormId] || null;
}

function toDatetimeLocalValue(value) {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const date = new Date(time + CHINA_UTC_OFFSET_MS);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function parseChinaDatetimeLocalValue(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return NaN;
  const [, year, month, day, hour, minute] = match.map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - CHINA_UTC_OFFSET_MS;
  const normalized = toDatetimeLocalValue(new Date(utcMs).toISOString());
  return normalized === value ? utcMs : NaN;
}

function formatChinaDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleString("zh-CN", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour12: false,
  });
}

function getScheduleBadge() {
  const schedule = getActiveSchedule();
  if (!schedule?.enabled) return "未设置";
  const runAt = Date.parse(schedule.runAt);
  if (!Number.isFinite(runAt)) return "时间异常";
  const diff = runAt - Date.now();
  if (diff <= 0) return "等待执行";
  const minutes = Math.ceil(diff / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60}分后` : `${minutes}分钟后`;
}

function saveActiveScheduleFromInput() {
  if (!state.activeFormId) {
    pushToast("还没有选择表单", "请先添加并选择一个要预约的表单");
    return;
  }

  if (!state.authToken) {
    pushToast("缺少 Token", "请先在设置页保存 Authorization Token");
    location.hash = "#/settings";
    return;
  }

  if (!ensureUsableAuthToken("预约打卡")) return;

  const input = appRoot.querySelector("[data-schedule-input]");
  const runAtMs = parseChinaDatetimeLocalValue(input?.value || "");
  if (!Number.isFinite(runAtMs)) {
    pushToast("预约时间无效", "请选择一个有效的北京时间");
    return;
  }
  if (runAtMs <= Date.now()) {
    pushToast("预约时间已过", "请选择一个未来时间");
    return;
  }

  const form = state.activeFormDetails?.profile || state.savedForms.find((item) => item.formId === state.activeFormId);
  state.schedulesByForm = {
    ...state.schedulesByForm,
    [state.activeFormId]: {
      formId: state.activeFormId,
      title: form?.title || "未命名表单",
      runAt: new Date(runAtMs).toISOString(),
      enabled: true,
      createdAt: new Date().toISOString(),
      lastResult: null,
      completedAt: null,
    },
  };
  persistCoreState();
  appendLog("success", "预约已保存", `${form?.title || state.activeFormId} 将在北京时间 ${formatChinaDateTime(runAtMs)} 自动提交`);
  pushToast("预约已保存", "按北京时间执行；页面保持打开，到点后会自动提交一次");
  startScheduleTimer();
  render();
}

function clearActiveSchedule() {
  if (!state.activeFormId) return;
  const schedule = state.schedulesByForm[state.activeFormId];
  if (!schedule) return;
  const next = { ...state.schedulesByForm };
  delete next[state.activeFormId];
  state.schedulesByForm = next;
  persistCoreState();
  appendLog("info", "预约已取消", schedule.title || state.activeFormId);
  pushToast("预约已取消", schedule.title || "当前表单");
  render();
}

function markScheduleFinished(formId, updates) {
  const current = state.schedulesByForm[formId];
  if (!current) return;
  state.schedulesByForm = {
    ...state.schedulesByForm,
    [formId]: {
      ...current,
      ...updates,
      enabled: false,
      completedAt: new Date().toISOString(),
    },
  };
  persistCoreState();
}

async function runScheduledSubmit(formId) {
  const schedule = state.schedulesByForm[formId];
  if (!schedule?.enabled || scheduleRuntime.runningFormIds.has(formId)) return;
  if (!state.authToken || !ensureUsableAuthToken("预约打卡")) return;

  scheduleRuntime.runningFormIds.add(formId);
  const previousFormId = state.activeFormId;
  const previousDetails = state.activeFormDetails;
  const previousPreview = state.previewData;
  state.pending[`schedule-${formId}`] = true;
  render();

  try {
    state.activeFormId = formId;
    state.activeFormDetails = null;
    state.previewData = null;
    persistCoreState();
    await loadActiveFormDetails(true);
    const result = await submitCheckin(formId, buildPayloadBody());
    markScheduleFinished(formId, {
      lastResult: "success",
      lastMessage: `${result.profile?.title || schedule.title || formId} 已提交`,
    });
    appendLog("success", "预约打卡成功", `${result.profile?.title || schedule.title || formId} 已提交，耗时 ${result.durationMs}ms`);
    pushToast("预约打卡成功", result.profile?.title || schedule.title || "提交成功");
  } catch (error) {
    markScheduleFinished(formId, {
      lastResult: "error",
      lastMessage: error.message,
    });
    appendLog("error", "预约打卡失败", error.message);
    pushToast("预约打卡失败", error.message);
  } finally {
    scheduleRuntime.runningFormIds.delete(formId);
    delete state.pending[`schedule-${formId}`];
    if (previousFormId && previousFormId !== formId) {
      state.activeFormId = previousFormId;
      state.activeFormDetails = previousDetails;
      state.previewData = previousPreview;
      persistCoreState();
    }
    render();
  }
}

async function runDueSchedules() {
  if (scheduleRuntime.scanning) return;
  scheduleRuntime.scanning = true;
  try {
    const now = Date.now();
    for (const [formId, schedule] of Object.entries(state.schedulesByForm || {})) {
      if (!schedule?.enabled) continue;
      const runAt = Date.parse(schedule.runAt);
      if (!Number.isFinite(runAt)) {
        markScheduleFinished(formId, {
          lastResult: "error",
          lastMessage: "预约时间无效，请重新设置。",
        });
        appendLog("error", "预约时间无效", schedule.title || formId);
        continue;
      }
      if (now < runAt) continue;
      if (now - runAt > SCHEDULE_EXPIRE_MS) {
        markScheduleFinished(formId, {
          lastResult: "expired",
          lastMessage: "预约时间已超过 2 小时，已停止自动提交。",
        });
        appendLog("error", "预约已过期", `${schedule.title || formId} 已超过可执行时间，请重新预约`);
        continue;
      }
      await runScheduledSubmit(formId);
    }
  } finally {
    scheduleRuntime.scanning = false;
  }
}

function startScheduleTimer() {
  if (scheduleRuntime.timer) return;
  scheduleRuntime.timer = window.setInterval(() => {
    runDueSchedules();
  }, SCHEDULE_TIMER_MS);
}

function pushToast(title, message) {
  const id = `${Date.now()}-${Math.random()}`;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderToast({ title, message });
  const toast = wrapper.firstElementChild;
  toast.dataset.toastId = id;
  toastRoot.prepend(toast);
  window.setTimeout(() => {
    const node = [...toastRoot.children].find((item) => item.dataset.toastId === id);
    if (node) node.remove();
  }, 3200);
}

function ensureRoute() {
  const current = getRoute();
  if (current !== state.route) {
    state.route = current;
    render();
  }
}

function getActiveCustomFields() {
  if (!state.activeFormId) return {};
  return state.customFieldsByForm[state.activeFormId] || {};
}

function setActiveCustomField(cid, value) {
  if (!state.activeFormId) return;
  const current = { ...getActiveCustomFields() };
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    delete current[cid];
  } else {
    current[cid] = value;
  }
  state.customFieldsByForm = {
    ...state.customFieldsByForm,
    [state.activeFormId]: current,
  };
  persistCoreState();
  render();
}

function removeSavedForm(formId) {
  state.savedForms = state.savedForms.filter((form) => form.formId !== formId);
  const nextCustom = { ...state.customFieldsByForm };
  delete nextCustom[formId];
  state.customFieldsByForm = nextCustom;
  const nextSchedules = { ...state.schedulesByForm };
  delete nextSchedules[formId];
  state.schedulesByForm = nextSchedules;
  if (state.activeFormId === formId) {
    state.activeFormId = "";
    state.activeFormDetails = null;
    state.previewData = null;
  }
  appendLog("info", "移除表单", `已从本地删除 ${formId}`);
  persistCoreState();
  render();
}

async function loadActiveFormDetails(force = false) {
  if (!state.activeFormId || !state.authToken) return;
  if (!ensureUsableAuthToken("加载表单")) return;
  if (state.activeFormDetails && !force && state.activeFormDetails.profile?.formId === state.activeFormId) {
    return;
  }
  setPending("loadForm", true);
  try {
    const details = await getFormInfo(state.activeFormId, normalizeAuthToken(state.authToken));
    state.activeFormDetails = {
      ...details,
      profile: {
        ...details.profile,
        formId: state.activeFormId,
      },
    };
    mergeSavedForm({
      formId: state.activeFormId,
      title: details.profile?.title || "未命名表单",
      version: details.profile?.version || "",
      status: 2,
      modifyTime: new Date().toISOString(),
    });
  } catch (error) {
    appendLog("error", "加载表单失败", error.message);
    pushToast("加载表单失败", error.message);
  } finally {
    setPending("loadForm", false);
  }
}

function buildPayloadBody() {
  return {
    authToken: normalizeAuthToken(state.authToken),
    displayName: state.profile.displayName || "",
    defaultLat: state.defaults.defaultLat === "" ? "" : Number(state.defaults.defaultLat),
    defaultLng: state.defaults.defaultLng === "" ? "" : Number(state.defaults.defaultLng),
    defaultAddress: state.defaults.defaultAddress || "",
    customFields: getActiveCustomFields(),
  };
}

async function runPreview() {
  if (!state.activeFormId || !state.authToken) {
    pushToast("无法预览", "请先填写 Token 并选择表单");
    return;
  }
  if (!ensureUsableAuthToken("生成预览")) return;
  setPending("preview", true);
  try {
    state.previewData = await previewCheckin(state.activeFormId, buildPayloadBody());
    appendLog("success", "预览已生成", `表单 ${state.activeFormId} 预览完成`);
    pushToast("预览完成", "已生成本次提交载荷");
  } catch (error) {
    appendLog("error", "预览失败", error.message);
    pushToast("预览失败", error.message);
  } finally {
    setPending("preview", false);
    render();
  }
}

async function runSubmit() {
  if (!state.activeFormId || !state.authToken) {
    pushToast("无法提交", "请先填写 Token 并选择表单");
    return;
  }
  if (!ensureUsableAuthToken("提交打卡")) return;
  setPending("submit", true);
  try {
    const result = await submitCheckin(state.activeFormId, buildPayloadBody());
    state.previewData = {
      profile: result.profile,
      payload: result.payload,
      preview: result.payload.map((item) => ({
        cid: item.cid,
        type: item.type,
        value: item.value,
      })),
    };
    appendLog("success", "打卡成功", `${result.profile.title} 已提交，耗时 ${result.durationMs}ms`);
    pushToast("打卡成功", result.profile.title || "提交成功");
    await loadActiveFormDetails(true);
  } catch (error) {
    appendLog("error", "打卡失败", error.message);
    pushToast("打卡失败", error.message);
  } finally {
    setPending("submit", false);
    render();
  }
}

async function handleResolveForm() {
  if (!state.authToken) {
    pushToast("缺少 Token", "请先在设置页保存 Authorization Token");
    location.hash = "#/settings";
    return;
  }
  if (!ensureUsableAuthToken("解析表单")) return;
  const input = state.formInput.trim();
  if (!input) {
    pushToast("请输入链接", "支持群报数链接或纯 FormId");
    return;
  }
  setPending("resolve", true);
  try {
    const data = await resolveForm(input, normalizeAuthToken(state.authToken));
    mergeSavedForm({
      formId: data.formId,
      title: data.title,
      version: data.version,
      status: 2,
    });
    state.activeFormId = data.formId;
    state.formInput = "";
    appendLog("success", "解析成功", `已保存 ${data.title}`);
    pushToast("解析成功", data.title);
    await loadActiveFormDetails(true);
  } catch (error) {
    appendLog("error", "解析失败", error.message);
    pushToast("解析失败", error.message);
  } finally {
    setPending("resolve", false);
    render();
  }
}

async function handleSyncForms() {
  if (!state.authToken) {
    pushToast("缺少 Token", "请先在设置页保存 Authorization Token");
    return;
  }
  if (!ensureUsableAuthToken("同步表单")) return;
  setPending("syncForms", true);
  try {
    const data = await listForms(normalizeAuthToken(state.authToken));
    for (const form of data.forms || []) {
      mergeSavedForm({ ...form, syncedAt: new Date().toISOString() });
    }
    appendLog("success", "同步完成", `已同步 ${(data.forms || []).length} 个表单`);
    pushToast("同步完成", `本次拿到 ${(data.forms || []).length} 个表单`);
  } catch (error) {
    appendLog("error", "同步失败", error.message);
    pushToast("同步失败", error.message);
  } finally {
    setPending("syncForms", false);
    render();
  }
}

async function handleVerifyToken() {
  if (!normalizeAuthToken(state.authToken)) {
    pushToast("Token 为空", "请先填写 Authorization Token");
    return;
  }
  if (!ensureUsableAuthToken("校验 Token")) return;
  setPending("verifyToken", true);
  try {
    await verifyToken(normalizeAuthToken(state.authToken));
    state.authToken = normalizeAuthToken(state.authToken);
    persistCoreState();
    appendLog("success", "Token 有效", "Authorization Token 校验通过");
    pushToast("Token 有效", "本地已保存最新值");
  } catch (error) {
    appendLog("error", "Token 无效", error.message);
    pushToast("Token 无效", error.message);
  } finally {
    setPending("verifyToken", false);
    render();
  }
}

function handleSaveSettings() {
  state.authToken = normalizeAuthToken(state.authToken);
  persistCoreState();
  const issue = getAuthTokenIssue(state.authToken);
  if (issue) {
    appendLog("error", "设置已保存，但 Token 需要处理", issue.message);
    pushToast(issue.title, issue.message);
    render();
    return;
  }
  appendLog("success", "设置已保存", "身份信息和默认位置已写入 localStorage");
  pushToast("设置已保存", "本地配置已更新");
  render();
}

function exportStorage() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          authToken: state.authToken,
          profile: state.profile,
          defaults: state.defaults,
          savedForms: state.savedForms,
          customFieldsByForm: state.customFieldsByForm,
          schedulesByForm: state.schedulesByForm,
          recentLogs: state.recentLogs,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `qun100-checkin-local-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  appendLog("info", "导出本地数据", "已生成本地配置 JSON 导出文件");
}

function clearAllStorage() {
  teardownMapPicker();
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  state.authToken = "";
  state.profile = { displayName: "" };
  state.defaults = { defaultLat: "", defaultLng: "", defaultAddress: "" };
  state.savedForms = [];
  state.customFieldsByForm = {};
  state.schedulesByForm = {};
  state.recentLogs = [];
  state.activeFormId = "";
  state.activeFormDetails = null;
  state.previewData = null;
  state.formInput = "";
  state.openSections = {};
  state.mapPicker = {
    ...state.mapPicker,
    open: true,
    mapAvailable: typeof window !== "undefined" && typeof window.AMap !== "undefined",
    lat: "",
    lng: "",
    address: "",
    status: "点击地图落点，或使用浏览器定位。",
    query: "",
    results: [],
    selectedResultIndex: -1,
  };
  pushToast("已清空", "所有本地数据已删除");
  render();
}

function clearLogs() {
  state.recentLogs = [];
  persistCoreState();
  render();
}

function bindInputs() {
  appRoot.querySelectorAll("[data-bind]").forEach((element) => {
    element.addEventListener("input", (event) => {
      const bind = event.currentTarget.dataset.bind;
      const value = event.currentTarget.value;
      switch (bind) {
        case "form-input":
          state.formInput = value;
          break;
        case "auth-token":
          state.authToken = value;
          syncAuthTokenHint();
          break;
        case "display-name":
          state.profile = { ...state.profile, displayName: value };
          break;
        case "default-lat":
          state.defaults = { ...state.defaults, defaultLat: normalizeNumber(value) };
          break;
        case "default-lng":
          state.defaults = { ...state.defaults, defaultLng: normalizeNumber(value) };
          break;
        case "default-address":
          state.defaults = { ...state.defaults, defaultAddress: value };
          break;
        case "map-search":
          state.mapPicker = {
            ...state.mapPicker,
            query: value,
          };
          break;
        default:
          break;
      }
    });
  });

  appRoot.querySelectorAll("[data-field-input]").forEach((element) => {
    element.addEventListener("input", (event) => {
      setActiveCustomField(event.currentTarget.dataset.fieldInput, event.currentTarget.value);
    });
  });

  appRoot.querySelectorAll("[data-field-radio]").forEach((element) => {
    element.addEventListener("change", (event) => {
      if (event.currentTarget.checked) {
        setActiveCustomField(event.currentTarget.dataset.fieldRadio, event.currentTarget.value);
      }
    });
  });

  appRoot.querySelectorAll("[data-field-checkbox]").forEach((element) => {
    element.addEventListener("change", (event) => {
      const cid = event.currentTarget.dataset.fieldCheckbox;
      const selected = [...appRoot.querySelectorAll(`[data-field-checkbox="${cid}"]:checked`)].map((item) => item.value);
      setActiveCustomField(cid, selected);
    });
  });

  appRoot.querySelectorAll("[data-field-upload]").forEach((element) => {
    element.addEventListener("change", async (event) => {
      const cid = event.currentTarget.dataset.fieldUpload;
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      if (!state.authToken) {
        pushToast("缺少 Token", "上传图片前需要先保存 Authorization Token");
        event.currentTarget.value = "";
        return;
      }
      if (!ensureUsableAuthToken("上传图片")) {
        event.currentTarget.value = "";
        return;
      }
      setPending(`upload-${cid}`, true);
      try {
        const result = await uploadImage(file, normalizeAuthToken(state.authToken));
        const current = getActiveCustomFields()[cid];
        const next = Array.isArray(current) ? [...current, result.url] : [result.url];
        setActiveCustomField(cid, next);
        appendLog("success", "图片上传成功", file.name);
        pushToast("图片已上传", file.name);
      } catch (error) {
        appendLog("error", "图片上传失败", error.message);
        pushToast("图片上传失败", error.message);
      } finally {
        setPending(`upload-${cid}`, false);
        event.currentTarget.value = "";
      }
    });
  });
}

function bindActions() {
  appRoot.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", async (event) => {
      const action = event.currentTarget.dataset.action;
      switch (action) {
        case "resolve-form":
          await handleResolveForm();
          break;
        case "sync-forms":
          await handleSyncForms();
          break;
        case "refresh-active":
          await loadActiveFormDetails(true);
          render();
          break;
        case "preview":
          await runPreview();
          break;
        case "submit":
          await runSubmit();
          break;
        case "save-schedule":
          saveActiveScheduleFromInput();
          break;
        case "clear-schedule":
          clearActiveSchedule();
          break;
        case "save-settings":
          handleSaveSettings();
          break;
        case "verify-token":
          await handleVerifyToken();
          break;
        case "apply-map-picker":
          applyMapPickerSelection();
          break;
        case "map-use-device":
          await useBrowserLocation();
          break;
        case "map-search":
          await runMapSearch();
          break;
        case "map-pick-result":
          await pickMapSearchResult(Number(event.currentTarget.dataset.mapResultIndex));
          break;
        case "map-reset-defaults":
          resetMapPickerToDefaults();
          break;
        case "export-storage":
          exportStorage();
          break;
        case "clear-storage":
          clearAllStorage();
          break;
        case "clear-logs":
          clearLogs();
          break;
        case "open-tutorial":
          location.hash = "#/tutorial";
          break;
        case "clear-active-custom":
          if (state.activeFormId) {
            delete state.customFieldsByForm[state.activeFormId];
            persistCoreState();
            render();
          }
          break;
        case "toggle-section": {
          const sectionId = event.currentTarget.dataset.sectionId;
          if (sectionId) {
            state.openSections = {
              ...state.openSections,
              [sectionId]: !state.openSections[sectionId],
            };
            render();
          }
          break;
        }
        default:
          break;
      }
    });
  });

  appRoot.querySelectorAll("[data-form-select]").forEach((element) => {
    element.addEventListener("click", async () => {
      const formId = element.dataset.formSelect;
      if (!formId) return;
      state.activeFormId = formId;
      state.previewData = null;
      persistCoreState();
      await loadActiveFormDetails(true);
      render();
    });
  });

  appRoot.querySelectorAll("[data-form-remove]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      const formId = element.dataset.formRemove;
      if (formId) removeSavedForm(formId);
    });
  });

  appRoot.querySelectorAll("[data-field-clear]").forEach((element) => {
    element.addEventListener("click", () => {
      const cid = element.dataset.fieldClear;
      if (cid) setActiveCustomField(cid, "");
    });
  });

  appRoot.querySelectorAll("[data-field-image-remove]").forEach((element) => {
    element.addEventListener("click", () => {
      const cid = element.dataset.fieldImageRemove;
      const index = Number(element.dataset.imageIndex);
      const current = getActiveCustomFields()[cid];
      if (!Array.isArray(current)) return;
      setActiveCustomField(cid, current.filter((_, currentIndex) => currentIndex !== index));
    });
  });
}

function render() {
  appRoot.innerHTML = renderApp(state);
  bindInputs();
  bindActions();
  syncAuthTokenHint();
  ensureMapPickerReady();
}

async function bootstrap() {
  render();
  window.addEventListener("hashchange", ensureRoute);
  window.addEventListener("focus", () => {
    runDueSchedules();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) runDueSchedules();
  });
  startScheduleTimer();
  try {
    state.health = await fetchHealth();
  } catch {
    appendLog("error", "健康检查失败", "无法访问 /api/health");
  }
  if (state.activeFormId && state.authToken) {
    await loadActiveFormDetails();
  }
  render();
}

bootstrap();
