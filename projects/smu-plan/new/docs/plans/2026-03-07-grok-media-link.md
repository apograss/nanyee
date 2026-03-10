# Grok Media Link Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `api.nanyee.de` 下新增一个统一媒体基地址，把现有 `grok2api` 的图片和视频接口直接暴露出来，供外部客户端按单一 base URL 调用。

**Architecture:** 保持现有 `/grok/` 聊天链路不变，新增一个单独前缀（推荐 `/grok-media/`）反代到 `grok2api :8000`。入口只负责转发，不改业务逻辑；鉴权沿用 `grok2api` 自己的 `API_KEY`。完成后用真实请求验证图片与视频接口可访问。

**Tech Stack:** Nginx, grok2api, curl, SSH

---

### Task 1: 确认媒体路由

**Files:**
- Inspect: `grok2api` 容器内 `app/api/v1/image.py`
- Inspect: `grok2api` 容器内 `app/api/v1/video.py`

**Step 1: 读取路由定义**

确认图片和视频接口的实际路径。

**Step 2: 验证现有服务可达**

从服务器本机访问 `127.0.0.1:8000` 对应媒体路由。

### Task 2: 新增 Nginx 入口

**Files:**
- Modify: `/etc/nginx/sites-enabled/api.nanyee.de`

**Step 1: 添加新 location**

新增 `location /grok-media/`，反代到 `http://127.0.0.1:8000/`。

**Step 2: 重新加载 Nginx**

Run: `sudo nginx -t && sudo systemctl reload nginx`

### Task 3: 验证外部接口

**Files:**
- No repo files

**Step 1: 验证图片接口**

Run example `POST /grok-media/v1/images/generations`

**Step 2: 验证视频接口**

Run example `POST /grok-media/v1/videos`

**Step 3: 输出最终 base URL**

给出统一地址和最小调用示例。
