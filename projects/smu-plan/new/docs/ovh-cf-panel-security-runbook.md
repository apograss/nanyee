# OVH VPS + Cloudflare 安全执行顺序手册（含面板预留）

更新时间：2026-03-02  
适用：OVH VPS（Ubuntu 24.04）+ Cloudflare；管理面板尚未安装

## 先回答你的问题

不建议先裸装面板再加固。  
正确顺序是：

1. 先完成基础加固（SSH 密钥、禁密码、UFW、Fail2ban、备份）
2. 再安装面板
3. 安装后立即做面板专项加固（仅本地监听/反代/Tunnel/访问控制）

---

## 执行总览（按顺序）

1. Phase 0：变更前准备与回滚点
2. Phase 1：SSH 安全基线
3. Phase 2：网络入口基线（UFW）
4. Phase 3：暴力破解防护（Fail2ban）
5. Phase 4：Cloudflare 基线对齐
6. Phase 5：安装管理面板
7. Phase 6：面板安装后立即加固
8. Phase 7：巡检与维护

---

## Phase 0：变更前准备与回滚点

### 你必须自己做（OVH 面板）

1. 创建一份 Snapshot（必须）
2. 确认你知道 Rescue Mode 入口（应急）
3. 暂时不要启用 Edge Firewall 复杂规则（先把系统内规则跑通）

### 你必须自己做（SSH）

1. 保持一个现有 SSH 会话在线，不要关闭
2. 后续每次改动都用“第二个新会话”测试

### 我可以帮你做

1. 逐条检查你回传的命令输出，判断是否可继续下一步
2. 给你应急回滚命令

---

## Phase 1：SSH 安全基线（先做，防锁机）

### 你必须自己做（SSH）

1. 更新系统并安装基础工具

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ufw fail2ban curl ca-certificates
```

2. 本地生成密钥（若已有可跳过）

```powershell
ssh-keygen -t ed25519 -C "ovh-vps"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

3. 将公钥写入服务器 `~/.ssh/authorized_keys`

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

4. 新开终端测试密钥登录成功

```powershell
ssh ubuntu@你的VPS_IP
```

5. 仅在第 4 步成功后，禁用 SSH 密码登录

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
EOF

sudo sshd -t
sudo systemctl restart ssh || sudo systemctl restart sshd
```

### 我可以帮你做

1. 审核你当前 `sshd` 配置，避免把自己锁在外面
2. 如果你要改 SSH 端口，给你安全切换步骤

---

## Phase 2：网络入口基线（UFW）

### 你必须自己做（SSH）

先只放行必须端口：

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status numbered
```

说明：

1. 若你改了 SSH 端口，改为对应端口并先放行再重启 SSH
2. 此时不要放行面板端口到公网

### 我可以帮你做

1. 根据你的端口需求给最小放行规则
2. 帮你检查规则顺序是否会误封

---

## Phase 3：暴力破解防护（Fail2ban）

### 你必须自己做（SSH）

```bash
sudo systemctl enable --now fail2ban

sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'EOF'
[sshd]
enabled = true
port = 22
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF

sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

如果 SSH 不是 `22`，同步修改 `port`。

### 我可以帮你做

1. 帮你把封禁策略调成适合你使用习惯的阈值
2. 校验是否真的启用了 `sshd` jail

---

## Phase 4：Cloudflare 基线对齐（面板安装前先定策略）

### 你必须自己做（Cloudflare/SSH）

1. 确认业务域名都走 Cloudflare 代理（橙云）
2. 明确你要走哪条面板访问方案：
3. 方案 A（推荐）：`Cloudflare Tunnel + Access`
4. 方案 B：`Nginx/Caddy 反代 + 80/443 + 访问控制`

### 我可以帮你做

1. 按你选择的方案给你完整配置模板
2. 给你“仅 Cloudflare 回源”规则与自动更新脚本（若你需要）

---

## Phase 5：安装管理面板（此时再安装）

### 你必须自己做（SSH）

1. 安装你选定的面板
2. 安装时不要把面板端口直接暴露给公网（能关就关）
3. 安装完成后立刻进入 Phase 6

### 我可以帮你做

1. 根据你面板类型（x-ui/3x-ui/其它）给你最小暴露安装方式

---

## Phase 6：面板安装后立即加固（必须）

### 你必须自己做（SSH/Cloudflare）

1. 面板仅监听 `127.0.0.1`（或仅内网），不要 `0.0.0.0`
2. 外部只保留 `80/443`（或仅 Tunnel，不开外网入口）
3. 若走反代，配置真实 IP 传递并验证日志
4. 若走 Tunnel，配置 Access 策略（邮箱/一次性验证码/身份提供商）

### 我可以帮你做

1. 帮你生成反代配置（Nginx/Caddy）
2. 帮你审查面板监听地址和端口暴露状态
3. 帮你做“从公网不可直连面板”的验证步骤

---

## Phase 7：巡检与维护（长期）

### 你必须自己做（SSH/OVH）

每周：

1. `sudo apt update && sudo apt upgrade -y`
2. 检查 `sudo fail2ban-client status`
3. 检查 `sudo ss -tulpen` 是否出现意外端口

每月：

1. 做一次 Snapshot
2. 抽查一遍 SSH 与防火墙规则

### 我可以帮你做

1. 帮你做巡检结果解读
2. 帮你出“异常时排障清单”

---

## 每个阶段的通过标准（必须满足才进入下一阶段）

1. Phase 1 通过：密钥登录成功，密码登录失败，`sshd -t` 通过
2. Phase 2 通过：`ufw status numbered` 仅有预期端口
3. Phase 3 通过：`fail2ban-client status sshd` 显示 enabled
4. Phase 6 通过：面板不在公网直连，访问必须经你设计的入口

---

## 应急回滚（连不上时）

优先顺序：

1. 用你保留的旧 SSH 会话回滚
2. 不行就进 OVH Rescue Mode 修复

可登录时的紧急回滚：

```bash
sudo rm -f /etc/ssh/sshd_config.d/99-hardening.conf
sudo systemctl restart ssh || sudo systemctl restart sshd
sudo ufw disable
```

---

## 你现在该做的第一步

1. 先去 OVH 面板做 Snapshot
2. 做完告诉我“快照已完成”
3. 我按 Phase 1 给你一条条执行并即时验收

