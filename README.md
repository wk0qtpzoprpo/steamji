# Steam姬 · ASF IPC 控制台

> 面向多台 **ArchiSteamFarm (ASF)** 服务器的云端统一挂卡控制台。部署于 Cloudflare Pages 全栈（Functions + D1 + KV），自带 JWT 账号体系、多服务器管理、Steam 挂卡 / 挂时长双模式、卡密槽位时长与故障转移。

Steam姬让你**在浏览器里管理全部 ASF 服务器与 Steam 账号**：添加账号后自动分配到负载最低的服务器，7×24 自动挂卡 / 挂指定游戏时长，账号随时可控（开始 / 停止 / 改名 / 详情 / 删除），到期仅禁登录、bot 保留运行。

---

## 功能特性

### 账号体系
- **自建 JWT 认证**：Access Token 15 分钟 + Refresh Token 30 天（KV 存储、轮换、登出即作废），密码 PBKDF2-SHA256 哈希
- **登录保护**：同一用户名 15 分钟内失败 5 次自动锁定（KV 计数，自动过期）
- **注册即用**：注册默认 Steam 账号配额 **2**，初始「无可用时间」仍可添加账号，点击开始挂卡时引导兑换卡密
- **卡密（月卡）制**：管理员后台生成卡密；兑换后**为已有 Steam 账号槽位续期**（按槽位而非账号——删除账号后新建账号自动继承该槽位剩余时长）
- **修改密码**：需原密码验证，新密码两次确认
- **到期策略**：到期仅禁止登录，**bot 继续运行**（挂机不中断）

### 挂卡 / 挂时长双模式
- **挂卡模式**（默认）：ASF 原生自动挂卡，掉落新卡自动入库
- **挂时长模式**：填写 Steam 游戏 **APPID**（≤32 个，可从 [steamui.com](https://steamui.com) 查询），点击应用后持续挂指定游戏时长，**直到手动切回挂卡模式**
- **在线状态**：添加账号时可设 ASF 在线状态（离线 / 在线 / 忙碌 / 隐身，默认离线）；挂时长模式下可切换「离线 / 正在游戏中」
- **状态切换限制**：切换会重启 bot（需等待几十秒），**1 小时内限 3 次**（界面已注明）
- **自定义「正在玩」名称**：挂卡 / 挂时长模式均支持，好友列表中显示自定义名称（同样受 1 小时 3 次限制）

### 账号详情
- 账号卡片：状态灯（绿=已登录 / 红=离线 / 灰=准备中）、过期时间（年月日）、开始挂卡、重命名、编辑、删除、详情
- 详情页数据：**库内游戏 / 有卡片游戏 / 剩余未掉落卡牌 / 库存**等，挂卡控制中心实时反馈（登录成功、邮箱令牌 / Steam 令牌输入）

### 多服务器管理
- 管理员后台**卡片式**展示全部 ASF 服务器，点击查看账号数、账号详情与实时状态
- 新账号自动分配到**在线且账号数最少**的服务器
- **故障转移**：服务器离线 ≥24h → 账号自动迁移到最少账号的在线服务器；原服务器恢复上线 → 原侧副本 bot 自动禁用（`Enabled=false`），防止同一 Steam 账号双端在线
- **迁移记录仅管理员可见**（后端字段白名单，普通用户不可见）

### 运营与内容
- **教程页**：卡片式排版 + FAQ 折叠（移动端自适应）
- **公告系统**：管理员发布 / 删除纯文字公告，用户端顶部横幅展示（无公告显示空态）
- **购买渠道**：兑换页显示「如无卡密请前往 xxx 购买」，渠道由管理员后台设置
- **日志**：轮询 ASF `/Api/NLog/File` 增量渲染（3 秒轮询、日志轮转防护、错误退避）

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vite + React 18 + TypeScript（纯静态，构建产物部署 Pages） |
| 后端 | Cloudflare Pages Functions（REST API + Cron 端点） |
| 数据 | D1（SQLite）+ KV（refresh token / 登录限流 / 缓存） |
| 定时 | 独立 Cron Worker（Pages 不支持 Cron Triggers）→ 调用 `/api/cron` |
| 桥接 | 每台 ASF 服务器 `cloudflared` Tunnel → 本机 `localhost:1242`（ASF IPC） |
| 加密 | WebCrypto：PBKDF2-SHA256（密码哈希）、AES-GCM（Steam 密码 / ASF 密码） |

## 架构

```
用户浏览器
   │  HTTPS
   ▼
Cloudflare Pages（静态前端 + Functions API）
   ├─ D1  users / servers / steam_accounts / account_slots / invite_codes /
   │        play_sessions / status_switches / migration_logs / announcements / settings
   ├─ KV  refresh:* 令牌 · login_fail:* 限流 · 其他缓存
   └─ /api/proxy/:serverId/*  ──►  cloudflared Tunnel  ──►  ASF IPC (localhost:1242)
                                                          （每台 ASF 服务器各一个 Tunnel）

独立 Cron Worker（worker-cron/，每 5 分钟 / 每小时 / 每日 3 点）
   └─ 调用 Pages /api/cron（X-Cron-Token 鉴权）→ 健康检查 / 故障转移 / 校准 / 到期标记
```

## 目录结构

```
├── src/                        # React 前端
│   ├── pages/                  # 登录/注册/控制台(添加账号+卡片)/账号详情/挂时长/
│   │                           # 兑换卡密/教程/公告/管理员后台(用户/服务器/卡密/公告/设置)
│   └── components/             # Layout(Steam姬导航)/AnnouncementBar/账号卡片等
├── functions/                  # Pages Functions 后端
│   ├── lib/                    # db / jwt / crypto / asf 代理 / 鉴权中间件
│   ├── api/                    # auth/accounts/servers/play/redeem/slots/announcements/
│   │                           # admin(users/settings/announcements)/proxy/cron
│   └── scheduled.ts            # Cron 任务：健康检查/状态同步/故障转移/bot_count校准/
│                               # 到期标记/pending 挂时长兜底
├── migrations/                 # 0001_init → 0008_announcements（含槽位化、在线状态等）
├── worker-cron/                # 独立 Cron Worker（wrangler.toml + src）
├── .github/workflows/deploy.yml # 手动触发的 Pages 部署工作流
├── wrangler.toml               # Pages + D1 + KV 绑定
└── public/                     # favicon.png（Steam姬图标）等静态资源
```

---

## 部署步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1 数据库与 KV

```bash
# D1
npm run db:create        # 输出 database_id，填入 wrangler.toml
npm run db:migrate       # 应用 migrations/*.sql

# KV
npm run kv:create        # 输出 id，填入 wrangler.toml 的 [[kv_namespaces]]
```

### 3. 配置 Secrets（部署到 Pages 后执行）

```bash
npx wrangler pages secret put JWT_SECRET         # 任意随机长字符串
npx wrangler pages secret put ENCRYPT_KEY        # 64 位十六进制：openssl rand -hex 32
npx wrangler pages secret put INIT_ADMIN_USERNAME  # 初始管理员用户名
npx wrangler pages secret put INIT_ADMIN_PASSWORD  # 初始管理员密码
npx wrangler pages secret put CRON_TOKEN         # Cron Worker 调用 /api/cron 的鉴权令牌
```

> 初始管理员：用 `INIT_ADMIN_USERNAME` / `INIT_ADMIN_PASSWORD` 调用注册接口即自动成为 admin（无需卡密）。部署后可登录管理后台修改密码。

### 4. 构建并部署

```bash
npm run build            # tsc --noEmit + vite build
npm run deploy           # wrangler pages deploy
```

### 5. 配置 Cron（独立 Cron Worker）

> Pages 项目**不支持** Cron Triggers（仅 Workers 支持），故采用「Cron Worker → 调用 Pages `/api/cron`」方案：

```bash
# 与 Pages 使用同一 CRON_TOKEN（Worker secret）
npx wrangler secret put CRON_TOKEN --config worker-cron/wrangler.toml

# 部署 Cron Worker（自动注册定时任务）
npx wrangler deploy --config worker-cron/wrangler.toml
```

| 表达式 | 任务 |
|---|---|
| `*/5 * * * *` | 健康检查（探测全部服务器，恢复上线触发回迁禁用）+ 账号状态同步 |
| `0 * * * *` | 故障转移（迁移离线 ≥24h 服务器的账号）+ bot_count 校准 |
| `0 3 * * *` | 订阅到期标记（仅禁登录，bot 保留） |

### 6. GitHub Actions 一键全自动部署（推荐）

仓库 `.github/workflows/deploy.yml` 为**一键全自动部署工作流**，自动完成：创建/复用 D1 → 创建/复用 KV → 执行全部数据库迁移 → 写入 Pages secrets → 构建并部署前端 → 部署 Cron Worker（定时任务）→ 创建初始管理员。

**fork 即用（适合公开分享）**：

1. Fork 本仓库（工作流文件不含任何私密信息，所有资源 ID 均由占位符在运行时自动注入）
2. Fork 仓库 → Settings → Secrets and variables → Actions，配置：

| Secret | 说明 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | **必填**。Cloudflare 账户 ID |
| `CLOUDFLARE_API_TOKEN` | **推荐**。API Token（需 Pages:Edit、D1、KV、Workers Scripts 编辑权限） |
| `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL` | 二选一。Global API Key 方式 |
| `INIT_ADMIN_USERNAME` | 可选。初始管理员用户名（默认 `admin`） |
| `INIT_ADMIN_PASSWORD` | 可选。初始管理员密码（**不填则自动生成**，部署后在运行摘要查看，请立即登录修改） |
| `JWT_SECRET` / `ENCRYPT_KEY` / `CRON_TOKEN` | 可选。不填自动随机生成 |

3. Actions 页面点击 **「Run workflow」** → 等待约 5 分钟 → 运行摘要显示部署域名与管理员账号
4. 登录后台 → 服务器管理 → 添加你的 ASF 服务器（Tunnel 地址 + IPCPassword）→ 生成卡密 → 开箱使用

> 推送代码不会自动部署，仅手动触发；重复运行幂等（复用已有 D1/KV，不会破坏数据）。

---

## 接入 ASF 服务器（cloudflared Tunnel）

每台 ASF 服务器执行一次：

```bash
# 1. 安装 cloudflared 并登录创建 Tunnel
cloudflared tunnel login
cloudflared tunnel create asf-a

# 2. 配置隧道（~/.cloudflared/config.yml）
tunnel: <asf-a 的 tunnel id>
credentials-file: /root/.cloudflared/<asf-a 的 tunnel id>.json
ingress:
  - hostname: asf-a.example.com
    service: http://localhost:1242
  - service: http_status:404

# 3. 分配 DNS 并启动（开机自启）
cloudflared tunnel route dns asf-a asf-a.example.com
cloudflared service install
```

然后在管理后台「服务器管理 → 添加服务器」填写：服务器名称、Tunnel 地址（`https://asf-a.example.com`）、ASF `IPCPassword`（强烈建议设置）。

> **重要**：请务必为每台 ASF 设置 `IPCPassword`（ASF.json 的 `IPCPassword`），未设置时 ASF 只允许本机访问、远程代理会被 403 拒绝。本系统全程通过后端代理访问 Tunnel，不直接暴露公网管理页。

---

## 使用流程

1. **管理员**：用初始管理员登录 → 后台添加服务器、生成卡密、发布公告、设置购买渠道
2. **用户**：注册（默认配额 2、无可用时间）→ 控制台添加 Steam 账号（命名 bot、设置在线状态）→ 自动分配到最少账号的在线服务器 → 兑换卡密为账号槽位续期 → 开始挂卡
3. **挂时长**：账号详情 → 切换「挂时长模式」→ 填写 APPID（≤32 个）→ 应用后持续挂指定游戏，直到切回挂卡模式
4. **到期**：仅禁止登录，bot 保留；兑换卡密即可继续

---

## API 速查

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册（默认配额 2，无邀请码） |
| POST | `/api/auth/login` | 登录（失败限流） |
| POST | `/api/auth/refresh` / `logout` | 令牌刷新 / 登出 |
| POST | `/api/auth/renew` | 凭据续期 |
| POST | `/api/auth/change-password` | 修改密码（需原密码） |
| GET | `/api/me` | 当前用户 + 配额 + 订阅 |
| GET/POST | `/api/accounts` | 账号列表 / 添加（自动分配） |
| GET/PUT/DELETE/POST | `/api/accounts/[id]` | 详情 / 改名 / 删除 / 操作（挂卡、状态切换等） |
| POST | `/api/play` | 开始挂卡 / 挂时长 |
| POST | `/api/play/cancel` | 停止挂卡 / 挂时长 |
| GET | `/api/slots` | 我的槽位（含到期时间） |
| POST | `/api/redeem` | 兑换卡密 → 为选定槽位续期 |
| GET | `/api/purchase-channel` | 购买渠道文案 |
| GET/POST | `/api/servers` | 服务器列表 / 添加（admin） |
| GET | `/api/servers/mine` | 我所在的服务器 |
| GET/PUT/DELETE/POST | `/api/servers/[id]` | 详情（含账号）/ 更新 / 删除 / 测试连接 |
| GET | `/api/servers/status` | 服务器状态卡片（admin） |
| GET | `/api/announcements` | 公告（用户端，最新 5 条） |
| GET/POST/DELETE | `/api/admin/users`、`/api/admin/announcements`、`/api/admin/settings`、`/api/admin/migrations`、`/api/invites` | 管理接口（admin） |
| POST | `/api/cron` | Cron 端点（X-Cron-Token 鉴权） |
| 任意 | `/api/proxy/[serverId]/*` | 转发 ASF IPC（如 `Api/Bot`、`Api/Command`、`NLog/File`） |

---

## 安全说明

- Steam 密码与 ASF 密码 **AES-GCM 加密存 D1**（密钥 `ENCRYPT_KEY`），仅服务端解密用于迁移 / 挂卡，前端永不接触明文
- JWT 短时效 + refresh 轮换（KV 存储，登出即作废）
- 登录失败 15 分钟内 5 次锁定（KV 计数自动过期）
- 迁移记录、服务器密码、用户 / 卡密 / 公告管理接口全部仅限 admin
- 普通用户只能通过代理操作「自己账号所在服务器」（后端校验）
- 建议为 Pages 项目启用 Cloudflare Access，或至少保持 `IPCPassword` 设置

## 故障转移机制

- 健康检查每 5 分钟探测全部服务器，首次掉线记录 `offline_since`
- 每小时扫描：离线 ≥24h → 迁移其全部 active 账号（解密密码 → 选最少账号的在线服务器 → 重建 bot → 更新归属与 bot_count）
- 原服务器恢复上线 → 立即禁用原侧已迁移副本（`Enabled=false`），迁移副本继续在新服务器挂机
- 迁移全程写 `migration_logs`（仅管理员可见）
- `bot_count` 每小时按库内真实归属校准（管理员后台卡片账号数长期准确）

---

## 版本历史

| 版本 | 内容 |
|---|---|
| v1.0.0 | 初始完整版（扫码登录原型） |
| v1.1.0 | 存档版 |
| v1.1.5 | 回退扫码登录（Steam 二维码仅对启用手机令牌账号有效），新增自定义「正在玩」名称 |
| v1.1.6 | 存档版 |
| v1.2.0 | **槽位化**：卡密按槽位续费（删账号后新账号继承时长） |
| v1.3.0 | 教程页 + 公告系统 + GitHub Actions 仅手动部署 + **品牌改名 Steam姬**（图标 / favicon / 仓库 steamji） |

每个版本均打 Git Tag + GitHub Release，并提供本地 `tar.gz` 备份（含 `.secrets.env`），可随时回退。

## 相关链接

- GitHub 仓库：`steamji`（fork 后为你的 `你的用户名/steamji`）
- 线上控制台：`https://asf-ipc-console.pages.dev`（一键部署后即为你的部署地址）
- 教程页：`https://asf-ipc-console.pages.dev/tutorial`
- APPID 查询：[steamui.com](https://steamui.com)
