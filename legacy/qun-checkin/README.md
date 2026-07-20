# 打卡项目部署说明

这是一个静态前端 + 无状态 Express 代理项目。前端页面由 Web 服务器提供，运行时配置只保存在浏览器本地，不写回服务端。

## 部署

1. 安装依赖：

```bash
npm install
```

2. 使用 PM2 启动服务：

```bash
pm2 start ecosystem.config.js
```

默认监听 `3002`，进程名为 `checkin-web`。

3. Nginx 反向代理到本机 `3002`，例如：

```nginx
server {
    listen 80;
    server_name your.domain.example;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 说明

- 浏览器里填写的前端配置只保存在本地存储中。
- 服务端保持无状态，重启后不依赖本地运行时配置。
