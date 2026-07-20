function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const DISPLAY_TIME_ZONE = "Asia/Shanghai";
const DISPLAY_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatTime(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    timeZone: DISPLAY_TIME_ZONE,
    hour12: false,
  });
}

function truncate(value, max = 56) {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function statusMeta(status) {
  const mapping = {
    2: { label: "进行中", className: "badge-success" },
    3: { label: "未开始", className: "badge-warning" },
    "-1": { label: "已结束", className: "badge-danger" },
    "-2": { label: "已停止", className: "badge-danger" },
  };
  return mapping[String(status)] || { label: `状态 ${status ?? "--"}`, className: "badge-default" };
}

function formatCoordinate(value) {
  if (value === "" || value == null) return "--";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(6) : String(value);
}

function formatDatetimeLocalInput(value) {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const date = new Date(time + DISPLAY_UTC_OFFSET_MS);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function renderScheduleStatus(schedule) {
  if (!schedule) {
    return "按北京时间执行。页面保持打开，到点后会自动提交一次；关闭页面或电脑休眠会影响执行。";
  }
  if (schedule.enabled) {
    return `已预约北京时间 ${formatTime(schedule.runAt)}，成功或失败后都会自动停止。`;
  }
  if (schedule.lastResult === "success") {
    return `上次预约已完成：${escapeHTML(schedule.lastMessage || "提交成功")}`;
  }
  if (schedule.lastResult === "expired") {
    return "上次预约已过期，没有自动提交。请重新设置时间。";
  }
  if (schedule.lastResult === "error") {
    return `上次预约失败：${escapeHTML(schedule.lastMessage || "未知错误")}`;
  }
  return "当前没有有效预约。";
}

function hasDefaultLocation(state) {
  return state.defaults.defaultLat !== "" && state.defaults.defaultLng !== "";
}

/* =========================================
   Nav
   ========================================= */

function renderNav(route) {
  const items = [
    { path: "/dashboard", icon: "\u2302", label: "打卡" },
    { path: "/settings", icon: "\u2699", label: "设置" },
    { path: "/tutorial", icon: "?", label: "帮助" },
  ];
  return `
    <nav class="nav-bar">
      <div class="nav-bar-inner">
        ${items.map(item => `
          <a class="nav-item ${route === item.path ? "is-active" : ""}" href="#${item.path}">
            <span class="nav-icon">${item.icon}</span>
            <span>${item.label}</span>
          </a>
        `).join("")}
      </div>
    </nav>
  `;
}

/* =========================================
   Top bar
   ========================================= */

function renderTopbar(state) {
  const tokenOk = Boolean(state.authToken);
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="topbar-brand">
          <div class="topbar-brand-icon">Q</div>
          <span>打卡助手</span>
        </div>
        <div class="topbar-status">
          <span class="status-dot ${tokenOk ? "is-ok" : "is-warn"}"></span>
          <span class="status-text">${tokenOk ? "已登录" : "未登录"}</span>
        </div>
      </div>
    </header>
  `;
}

/* =========================================
   Dashboard — Hero Card
   ========================================= */

function renderHeroCard(state) {
  const form = state.activeFormDetails?.profile;
  const hasForm = Boolean(state.activeFormId && form);

  if (!hasForm) {
    return `
      <div class="card hero-card">
        <div class="card-body" style="text-align:center; padding:40px 20px;">
          <h2 style="font-size:1.3rem; margin-bottom:8px;">选一个表单开始打卡</h2>
          <p class="hero-meta">在左边添加或选择你要打卡的表单</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="card hero-card">
      <div class="card-body" style="padding:28px 24px;">
        <p class="hero-meta" style="margin-bottom:4px;">当前打卡</p>
        <h2 style="font-size:1.4rem; margin-bottom:8px;">${escapeHTML(form.title || "未命名表单")}</h2>
        <p class="hero-meta" style="margin-bottom:20px;">
          ${escapeHTML(state.activeFormDetails?.catalogs?.length || 0)} 个字段
          &middot; 上次提交: ${escapeHTML(formatTime(state.activeFormDetails?.lastRecord?.createTime))}
        </p>
        <div class="btn-row">
          <button class="btn-hero" type="button" data-action="submit" ${state.activeFormId ? "" : "disabled"}>
            一键打卡
          </button>
          <button class="btn btn-secondary" type="button" data-action="preview" ${state.activeFormId ? "" : "disabled"} style="background:rgba(255,255,255,0.2); border-color:rgba(255,255,255,0.4); color:white;">
            先看看会提交什么
          </button>
        </div>
        <div style="margin-top:12px;">
          <button class="btn btn-ghost btn-sm" type="button" data-action="refresh-active" ${state.activeFormId ? "" : "disabled"} style="color:rgba(255,255,255,0.7);">
            刷新表单信息
          </button>
        </div>
      </div>
    </div>
  `;
}

/* =========================================
   Dashboard — Form sidebar
   ========================================= */

function renderFormSidebar(state) {
  const formListHtml = state.savedForms.length
    ? `<div class="form-list">
        ${state.savedForms.map(form => {
          const meta = statusMeta(form.status);
          const selected = state.activeFormId === form.formId;
          return `
            <div class="form-list-item ${selected ? "is-active" : ""}" data-form-select="${escapeHTML(form.formId)}">
              <div class="form-list-item-body">
                <div class="form-list-item-title">${escapeHTML(form.title || "未命名表单")}</div>
                <div class="form-list-item-meta">${escapeHTML(formatTime(form.syncedAt || form.modifyTime))}</div>
              </div>
              <span class="badge ${meta.className}">${escapeHTML(meta.label)}</span>
              <div class="form-list-item-actions">
                <button class="btn-icon" type="button" data-form-remove="${escapeHTML(form.formId)}" title="移除">&times;</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>`
    : `<div class="empty-state">
        <div class="empty-state-title">还没有表单</div>
        <div class="empty-state-desc">把群报数的链接粘贴到上面</div>
      </div>`;

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-header-text">
          <div class="card-title">我的表单</div>
          <div class="card-subtitle">共 ${state.savedForms.length} 个</div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" data-action="sync-forms">同步全部</button>
      </div>
      <div class="card-body">
        <div class="form-stack">
          <div class="form-row">
            <div class="form-group">
              <input class="form-input" type="text" data-bind="form-input" value="${escapeHTML(state.formInput)}" placeholder="粘贴群报数链接或活动 ID">
            </div>
            <button class="btn btn-primary" type="button" data-action="resolve-form">添加</button>
          </div>
          ${formListHtml}
        </div>
      </div>
    </div>
  `;
}

/* =========================================
   Dashboard — Field cards
   ========================================= */

function renderFieldCards(state) {
  if (!state.activeFormDetails?.catalogs?.length) {
    return `
      <div class="empty-state">
        <div class="empty-state-desc">选择表单后，这里会显示可以修改的字段</div>
      </div>
    `;
  }

  const customFields = state.customFieldsByForm[state.activeFormId] || {};
  return `
    <div class="field-grid">
      ${state.activeFormDetails.catalogs.map(field => {
        const value = customFields[field.cid];
        const isLocation = field.type === "LOCATION";
        const autoHint = isLocation
          ? "不用填，会自动用你设置的默认地点"
          : field.type === "DATE"
            ? "不用填，打卡时会自动填入当前时间"
            : "不填就用上次打卡的值";
        return `
          <div class="field-card">
            <div class="field-header">
              <div>
                <div class="field-title">${escapeHTML(field.title || field.type)}</div>
                <div class="field-meta">${field.must ? "必填" : "选填"}</div>
              </div>
              <button class="btn btn-ghost btn-sm" type="button" data-field-clear="${escapeHTML(field.cid)}">清空</button>
            </div>
            ${isLocation ? renderLocationFieldSummary(state, field, value) : renderFieldInput(field, value)}
            <div class="form-hint">${escapeHTML(autoHint)}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderLocationFieldSummary(state, field, value) {
  const hasLoc = hasDefaultLocation(state);
  if (hasLoc) {
    return `
      <div class="location-grid" style="margin-bottom:4px;">
        <div class="location-item">
          <span>纬度</span>
          <strong>${escapeHTML(formatCoordinate(state.defaults.defaultLat))}</strong>
        </div>
        <div class="location-item">
          <span>经度</span>
          <strong>${escapeHTML(formatCoordinate(state.defaults.defaultLng))}</strong>
        </div>
        ${state.defaults.defaultAddress ? `
          <div class="location-item location-item-wide">
            <span>地址</span>
            <strong>${escapeHTML(state.defaults.defaultAddress)}</strong>
          </div>
        ` : ""}
      </div>
      <a class="btn btn-ghost btn-sm" href="#/settings" style="align-self:flex-start;">修改默认地点</a>
    `;
  }
  return `
    <div class="tip-box tip-warning" style="font-size:var(--text-xs);">
      <span class="tip-icon">!</span>
      <span>还没设置默认地点，<a href="#/settings" style="font-weight:600;">去设置</a></span>
    </div>
  `;
}

function renderFieldInput(field, value) {
  const safeCid = escapeHTML(field.cid);
  const safeTitle = escapeHTML(field.title || field.type || field.cid);
  const options = field.config?.OPTIONS?.content || [];

  if (field.type === "RADIO" || field.type === "RADIO_V2") {
    return `
      <div class="option-list">
        ${options.map((option, index) => {
          const optionValue = option.value || option.label || option;
          const checked = String(value ?? "") === String(optionValue);
          return `
            <label class="option-chip">
              <input type="radio" name="field-${safeCid}" value="${escapeHTML(optionValue)}" data-field-radio="${safeCid}" ${checked ? "checked" : ""}>
              <span>${escapeHTML(option.label || optionValue || `选项 ${index + 1}`)}</span>
            </label>
          `;
        }).join("")}
      </div>
    `;
  }

  if (field.type === "CHECKBOX" || field.type === "CHECKBOX_V2") {
    const set = new Set(Array.isArray(value) ? value.map(String) : []);
    return `
      <div class="option-list">
        ${options.map((option, index) => {
          const optionValue = option.value || option.label || option;
          return `
            <label class="option-chip">
              <input type="checkbox" value="${escapeHTML(optionValue)}" data-field-checkbox="${safeCid}" ${set.has(String(optionValue)) ? "checked" : ""}>
              <span>${escapeHTML(option.label || optionValue || `选项 ${index + 1}`)}</span>
            </label>
          `;
        }).join("")}
      </div>
    `;
  }

  if (field.type === "IMAGE") {
    const images = Array.isArray(value) ? value : value ? [value] : [];
    return `
      <div class="upload-row">
        <input class="file-input" type="file" accept="image/*" data-field-upload="${safeCid}">
        ${images.length
          ? `<div style="display:flex;flex-direction:column;gap:6px;">
              ${images.map((url, index) => `
                <div class="image-item">
                  <a class="image-link" href="${escapeHTML(url)}" target="_blank" rel="noreferrer">${escapeHTML(truncate(url, 40))}</a>
                  <button class="btn-icon" type="button" data-field-image-remove="${safeCid}" data-image-index="${index}">&times;</button>
                </div>
              `).join("")}
            </div>`
          : `<div class="form-hint">不上传的话会用上次的图片</div>`
        }
      </div>
    `;
  }

  if (field.type === "TEXTAREA") {
    return `<textarea class="form-textarea" data-field-input="${safeCid}" rows="3" placeholder="输入${safeTitle}">${escapeHTML(value ?? "")}</textarea>`;
  }

  const inputType =
    field.type === "NUMBER" || field.type === "NUMBER_FLOAT" ? "number"
    : field.type === "TELEPHONE" ? "tel"
    : "text";

  return `<input class="form-input" type="${inputType}" data-field-input="${safeCid}" value="${escapeHTML(value ?? "")}" placeholder="输入${safeTitle}">`;
}

/* =========================================
   Dashboard — Preview & Logs
   ========================================= */

function renderPreview(state) {
  if (!state.previewData?.preview?.length) {
    return `<div class="empty-state"><div class="empty-state-desc">点"先看看会提交什么"生成预览</div></div>`;
  }

  return `
    <div class="preview-list">
      ${state.previewData.preview.map(item => `
        <dl class="preview-item">
          <dt>${escapeHTML(item.type)} &middot; ${escapeHTML(item.cid)}</dt>
          <dd>${escapeHTML(typeof item.value === "string" ? item.value || "(空)" : JSON.stringify(item.value))}</dd>
        </dl>
      `).join("")}
    </div>
  `;
}

function renderSchedulePanel(state) {
  const schedule = state.activeFormId ? state.schedulesByForm?.[state.activeFormId] : null;
  const disabled = state.activeFormId ? "" : "disabled";
  const value = schedule?.enabled ? formatDatetimeLocalInput(schedule.runAt) : "";

  return `
    <div class="schedule-card">
      <div class="schedule-header">
        <div>
          <div class="schedule-title">预约打卡</div>
          <div class="schedule-desc">${renderScheduleStatus(schedule)}</div>
        </div>
        <span class="badge ${schedule?.enabled ? "badge-success" : "badge-default"}">
          ${schedule?.enabled ? "已启用" : "未启用"}
        </span>
      </div>
      <div class="schedule-grid">
        <div class="form-group">
          <label class="form-label" for="schedule-run-at">执行时间（北京时间 UTC+8）</label>
          <input id="schedule-run-at" class="form-input" type="datetime-local" data-schedule-input value="${escapeHTML(value)}" ${disabled}>
          <div class="form-hint">适合限时签到。时间固定按东八区解析，页面需要保持打开，浏览器被系统休眠时无法保证执行。</div>
        </div>
        <div class="schedule-actions">
          <button class="btn btn-primary" type="button" data-action="save-schedule" ${disabled}>保存预约</button>
          <button class="btn btn-secondary" type="button" data-action="clear-schedule" ${schedule ? "" : "disabled"}>取消预约</button>
        </div>
      </div>
    </div>
  `;
}

function renderLogs(state) {
  if (!state.recentLogs.length) {
    return `<div class="empty-state"><div class="empty-state-desc">还没有操作记录</div></div>`;
  }

  return `
    <div class="log-list">
      ${state.recentLogs.map(log => `
        <div class="log-item" data-kind="${escapeHTML(log.kind || "info")}">
          <div class="log-item-head">
            <span class="log-item-title">${escapeHTML(log.title || "日志")}</span>
            <span class="log-item-time">${escapeHTML(formatTime(log.time))}</span>
          </div>
          <div class="log-item-message">${escapeHTML(log.message || "")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

/* =========================================
   Collapsible helper
   ========================================= */

function renderCollapsible(id, title, count, content, state) {
  const isOpen = state.openSections?.[id];
  return `
    <div>
      <button class="collapse-trigger" type="button" data-action="toggle-section" data-section-id="${id}">
        <span class="collapse-trigger-text">
          ${title}
          <span class="collapse-trigger-count">${count}</span>
        </span>
        <span class="collapse-icon">${isOpen ? "\u25B2" : "\u25BC"}</span>
      </button>
      <div class="collapse-content ${isOpen ? "is-open" : ""}" ${isOpen ? 'style="margin-top:12px;"' : ""}>
        ${content}
      </div>
    </div>
  `;
}

/* =========================================
   Dashboard page
   ========================================= */

function renderDashboard(state) {
  const fieldCount = state.activeFormDetails?.catalogs?.length || 0;
  const customCount = Object.keys(state.customFieldsByForm[state.activeFormId] || {}).length;

  return `
    <div class="page-container">
      <div class="dashboard-layout">
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${renderFormSidebar(state)}
        </div>

        <div style="display:flex;flex-direction:column;gap:16px;">
          ${renderHeroCard(state)}

          ${renderSchedulePanel(state)}

          ${renderCollapsible(
            "fields",
            "修改字段",
            fieldCount ? `${customCount}/${fieldCount} 已修改` : "无",
            renderFieldCards(state),
            state
          )}

          ${renderCollapsible(
            "preview",
            "提交预览",
            state.previewData?.preview?.length ? `${state.previewData.preview.length} 项` : "未生成",
            renderPreview(state),
            state
          )}

          ${renderCollapsible(
            "logs",
            "操作记录",
            `${state.recentLogs.length} 条`,
            renderLogs(state),
            state
          )}
        </div>
      </div>
    </div>
  `;
}

/* =========================================
   Settings page
   ========================================= */

function renderSettings(state) {
  const locationReady = hasDefaultLocation(state);
  const mapPicker = state.mapPicker || {};
  const canApplyLocation = mapPicker.lat !== "" && mapPicker.lng !== "";

  return `
    <div class="page-container">
      <div class="settings-stack">

        <!-- Tip for beginners -->
        <div class="tip-box tip-info">
          <span class="tip-icon">i</span>
          <span>第一次用？先在下面粘贴 Token，再设置打卡地点就行了。不知道怎么获取 Token？<a href="#/tutorial">看帮助</a></span>
        </div>

        <!-- Token -->
        <div class="card">
          <div class="card-header">
            <div class="card-header-text">
              <div class="card-title">登录凭证 (Token)</div>
              <div class="card-subtitle">从群报数小程序抓取的 Authorization Token</div>
            </div>
          </div>
          <div class="card-body">
            <div class="form-stack">
              <div class="form-group">
                <label class="form-label" for="auth-token">Token</label>
                <textarea id="auth-token" class="form-textarea" data-bind="auth-token" rows="4" placeholder="把抓到的 Token 粘贴到这里">${escapeHTML(state.authToken)}</textarea>
                <div class="form-hint" data-token-hint>Token 大约 7 天过期，过期后重新抓取即可。</div>
              </div>
              <div class="form-group">
                <label class="form-label" for="display-name">你的名字</label>
                <input id="display-name" class="form-input" type="text" data-bind="display-name" value="${escapeHTML(state.profile.displayName || "")}" placeholder="打卡时显示的名字">
              </div>
              <div class="btn-row">
                <button class="btn btn-primary" type="button" data-action="save-settings">保存</button>
                <button class="btn btn-secondary" type="button" data-action="verify-token">测试 Token 是否有效</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Location -->
        <div class="card">
          <div class="card-header">
            <div class="card-header-text">
              <div class="card-title">默认打卡地点</div>
              <div class="card-subtitle">${locationReady ? "已设置，打卡时会自动使用这个位置" : "还没设置，建议设一个"}</div>
            </div>
          </div>
          <div class="card-body">
            <div class="form-stack">

              <!-- Current location display -->
              <div class="location-grid">
                <div class="location-item">
                  <span>纬度</span>
                  <strong>${escapeHTML(formatCoordinate(state.defaults.defaultLat))}</strong>
                </div>
                <div class="location-item">
                  <span>经度</span>
                  <strong>${escapeHTML(formatCoordinate(state.defaults.defaultLng))}</strong>
                </div>
                <div class="location-item location-item-wide">
                  <span>地址</span>
                  <strong>${escapeHTML(state.defaults.defaultAddress || "未设置")}</strong>
                </div>
              </div>

              <!-- Map picker -->
              <div class="map-section-label">在地图上选择位置</div>
              <div class="map-grid">
                <div>
                  <div class="map-container ${mapPicker.mapAvailable ? "" : "is-unavailable"}">
                    ${mapPicker.mapAvailable
                      ? '<div id="map-picker-slot" class="map-canvas"></div>'
                      : '<div class="map-fallback"><strong>地图加载失败</strong><p>你可以在下面手动输入经纬度</p></div>'
                    }
                  </div>
                </div>

                <div style="display:flex;flex-direction:column;gap:14px;">
                  <!-- Search -->
                  <div class="form-row">
                    <div class="form-group">
                      <input class="form-input" type="text" data-bind="map-search" value="${escapeHTML(mapPicker.query || "")}" placeholder="搜索地址，如 南方医科大学">
                    </div>
                    <button class="btn btn-secondary" type="button" data-action="map-search">搜索</button>
                  </div>

                  ${mapPicker.results?.length ? `
                    <div class="map-results">
                      ${mapPicker.results.map((result, index) => `
                        <button class="map-result-btn ${index === mapPicker.selectedResultIndex ? "is-active" : ""}" type="button" data-action="map-pick-result" data-map-result-index="${index}">
                          <strong>${escapeHTML(result.name || "搜索结果")}</strong>
                          <span>${escapeHTML(result.address || `${formatCoordinate(result.lat)}, ${formatCoordinate(result.lng)}`)}</span>
                        </button>
                      `).join("")}
                    </div>
                  ` : ""}

                  <!-- Draft -->
                  <div class="location-grid">
                    <div class="location-item">
                      <span>纬度</span>
                      <strong data-map-draft="lat">${escapeHTML(formatCoordinate(mapPicker.lat))}</strong>
                    </div>
                    <div class="location-item">
                      <span>经度</span>
                      <strong data-map-draft="lng">${escapeHTML(formatCoordinate(mapPicker.lng))}</strong>
                    </div>
                    <div class="location-item location-item-wide">
                      <span>地址</span>
                      <strong data-map-draft="address">${escapeHTML(mapPicker.address || "点地图或搜索来选位置")}</strong>
                    </div>
                  </div>
                  <div class="form-hint" data-map-draft="status">${escapeHTML(mapPicker.status || "点击地图上的位置，或搜索地址")}</div>

                  <div class="btn-row">
                    <button class="btn btn-primary" type="button" data-action="apply-map-picker" ${canApplyLocation ? "" : "disabled"}>
                      用这个位置作为默认地点
                    </button>
                    <button class="btn btn-secondary" type="button" data-action="map-use-device">用手机/电脑定位</button>
                    <button class="btn btn-ghost" type="button" data-action="map-reset-defaults">重置</button>
                  </div>
                </div>
              </div>

              <!-- Manual input -->
              <div class="map-section-label">手动输入经纬度</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="form-group">
                  <label class="form-label" for="default-lat">纬度</label>
                  <input id="default-lat" class="form-input" type="number" step="any" data-bind="default-lat" value="${escapeHTML(state.defaults.defaultLat ?? "")}" placeholder="22.787544">
                </div>
                <div class="form-group">
                  <label class="form-label" for="default-lng">经度</label>
                  <input id="default-lng" class="form-input" type="number" step="any" data-bind="default-lng" value="${escapeHTML(state.defaults.defaultLng ?? "")}" placeholder="113.228584">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="default-address">地址</label>
                <textarea id="default-address" class="form-textarea" data-bind="default-address" rows="2" placeholder="例如 广东省佛山市顺德区…">${escapeHTML(state.defaults.defaultAddress || "")}</textarea>
              </div>
              <button class="btn btn-primary" type="button" data-action="save-settings">保存设置</button>
            </div>
          </div>
        </div>

        <!-- Data management -->
        <div class="card">
          <div class="card-header">
            <div class="card-header-text">
              <div class="card-title">数据管理</div>
              <div class="card-subtitle">所有数据只存在你的浏览器里，不会上传</div>
            </div>
          </div>
          <div class="card-body">
            <div class="btn-row">
              <button class="btn btn-secondary" type="button" data-action="export-storage">导出备份</button>
              <button class="btn btn-ghost" type="button" data-action="clear-logs">清空操作记录</button>
              <button class="btn btn-danger" type="button" data-action="clear-storage">清空所有数据</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================
   Tutorial page
   ========================================= */

function renderTutorial() {
  return `
    <div class="page-container">
      <div style="margin-bottom:8px;">
        <h1 style="font-size:1.5rem; font-weight:700; margin-bottom:4px;">怎么用？</h1>
        <p style="color:var(--text-secondary); font-size:var(--text-sm);">三步搞定自动打卡</p>
      </div>

      <div class="tip-box tip-info">
        <span class="tip-icon">i</span>
        <span>所有数据都只存在你自己的浏览器里，我们不会收集任何信息。</span>
      </div>

      <div class="tutorial-grid">
        <div class="tutorial-step">
          <div class="tutorial-step-number">1</div>
          <h3>获取 Token</h3>
          <p>在电脑上运行工具包里的 get_token.bat，它会自动抓取你的群报数登录凭证。Token 大约 7 天过期，过期了再跑一次就行。</p>
        </div>
        <div class="tutorial-step">
          <div class="tutorial-step-number">2</div>
          <h3>设置 Token 和地点</h3>
          <p>去「设置」页面，把 Token 粘贴进去，再设置你的默认打卡地点（可以在地图上点选）。</p>
        </div>
        <div class="tutorial-step">
          <div class="tutorial-step-number">3</div>
          <h3>添加表单并打卡</h3>
          <p>回到「打卡」页面，粘贴群报数的活动链接，添加表单后点"一键打卡"就搞定了。</p>
        </div>
        <div class="tutorial-step">
          <div class="tutorial-step-number">!</div>
          <h3>注意</h3>
          <p>Token 过期后打卡会失败，重新获取就好。地点、时间等字段会自动填入，一般不需要手动改。</p>
        </div>
      </div>

      <div class="tip-box tip-warning" style="margin-top:4px;">
        <span class="tip-icon">!</span>
        <span>不知道怎么获取 Token？<a href="./tutorial.html" style="font-weight:600;">查看详细图文教程</a></span>
      </div>

      <div class="btn-row" style="margin-top:8px;">
        <a class="btn btn-primary" href="#/dashboard">开始打卡</a>
        <a class="btn btn-secondary" href="./tutorial.html">详细图文教程</a>
      </div>
    </div>
  `;
}

/* =========================================
   App shell
   ========================================= */

function renderApp(state) {
  const view = state.route === "/settings"
    ? renderSettings(state)
    : state.route === "/tutorial"
      ? renderTutorial()
      : renderDashboard(state);

  return `
    ${renderTopbar(state)}
    ${view}
    ${renderNav(state.route)}
  `;
}

function renderToast(item) {
  return `
    <div class="toast">
      <div class="toast-title">${escapeHTML(item.title || "提示")}</div>
      <div class="toast-message">${escapeHTML(item.message || "")}</div>
    </div>
  `;
}
