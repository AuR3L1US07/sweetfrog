# Cloudflare 免费部署

本仓库可部署为 Cloudflare Pages + Pages Functions + D1。网站、账号和社区数据均在云端运行，无需个人电脑保持开机。Firebase 扩展接口仍保留在 firebase-adapter.js 中，但尚未实现。

## 已准备

- `npm run build:pages` 生成 dist，仅包含网站资源。
- functions/api/[[path]].js 提供现有社区 REST API。
- wrangler.jsonc 中的 DB 绑定对应用户创建的 sweetfrog-db。
- cloudflare/schema.sql 使用 CREATE IF NOT EXISTS 初始化表，不覆盖已有数据。
- 页面使用同源 /api 路径，无需修改 community-config.js。provider 的 node 值代表兼容的 HTTP API，Cloudflare 使用同样协议。

## 方案 A：GitHub 自动部署

1. Cloudflare → Workers & Pages → Create application → Pages → Connect to Git。
2. 授权 GitHub，选择 AuR3L1US07/sweetfrog。
3. 部署分支选择 main；此分支包含完整前端与后端。
4. Framework preset：None；Build command：npm run build:pages；Build output：dist；根目录保持默认。
5. 构建环境变量 NODE_VERSION 设置 24，PNPM_VERSION 设置 11.19.0。
6. 在 D1 → sweetfrog-db → Console 中执行 cloudflare/schema.sql 的完整 SQL。
7. 部署后检查 Pages 的 D1 binding：变量名 DB，数据库 sweetfrog-db。配置由 wrangler.jsonc 声明。
8. 打开生成的 *.pages.dev 地址，测试注册、登录、游客浏览、留言、点赞、回复和提交分数。

## 方案 B：命令行部署

先安装依赖，再登录：

```sh
pnpm install
pnpm exec wrangler login
pnpm exec wrangler d1 execute sweetfrog-db --remote --file cloudflare/schema.sql
npm run build:pages
pnpm exec wrangler pages project create sweetfrog --production-branch main
pnpm exec wrangler pages deploy dist --project-name sweetfrog --branch main
```

若项目已存在，省略 project create，并先确认其当前生产分支；如果仍是旧的 `codex/community-admin`，直接用 `--branch main` 可能只生成预览部署。需要在 Cloudflare 中调整生产分支，或在命令中沿用现有生产分支。命令行创建的 Direct Upload 项目不能直接切换为 Git 集成项目，需要持续使用命令行部署或单独创建 Git 集成项目。线上部署前须通过下面的测试。

## 设置管理员

1. 在正式网站注册自己的账号。
2. 进入 D1 的 Console，按真实昵称替换下列示例，再执行：

```sql
UPDATE users SET role='admin' WHERE username='你的昵称';
```

3. 刷新网站，打开 /admin.html。服务器会校验管理员权限。

请勿将 Cloudflare 密码、API Token 或 OAuth 凭据写进仓库。数据库 ID 是资源标识，不是访问密钥。

## 本地验证

```sh
npm test
npm run test:cloudflare
pnpm exec wrangler pages functions build --outdir .wrangler/build
```

Cloudflare 集成测试使用临时本地 D1，不连接正式数据库。覆盖注册登录、游客写入限制、单账号唯一点赞、话题回复、五榜最佳成绩、管理员权限、封禁撤销会话、注销及认证限流。

## 使用边界

- 免费额度以 Cloudflare 官方 Pages Functions / D1 价格页为准，不代表无限容量。
- 排行榜分数来自浏览器提交，目前是好友娱乐榜，尚无服务器游戏回放验证。
- 本地 Node 版使用 scrypt，Cloudflare 版使用带随机盐的 Web Crypto PBKDF2；本地测试账号不会自动迁移到云端。首次上线请注册新账号。
- 认证按 IP 每小时最多 8 次，社区发言按账号每小时最多 20 次；不能保证同一真人只注册一个账号。
- GitHub Pages 的旧地址不会自动切换，新站验收后再决定旧地址跳转。

## 已有数据库升级头像功能

首次部署头像功能时，先对现有 D1 数据库执行 cloudflare/avatar-migration.sql，再部署新版代码。新建数据库直接使用 cloudflare/schema.sql。玩家头像存入 users.avatar_data，旧账号为空值时使用默认青蛙头像。

## 已有数据库升级好友 PK

首次部署好友 PK 前，对现有 D1 数据库执行 `cloudflare/pk-migration.sql`，然后部署新版 Pages。新建数据库直接使用 `cloudflare/schema.sql`。首版为登录玩家的双人房间，挑战「逮住大青蛙」30 秒；房间码可通过链接分享。页面每 800 毫秒同步比分，点击由服务器校验目标列与局内时间。房间创建 24 小时后不可进入；下次建房时清理创建超过 30 天的记录。此模式面向朋友娱乐，不能完全阻止脚本自动点击。

## 好友 PK 的游戏选择升级

在已有 PK 房间表的数据库上，先执行 `cloudflare/pk-games-migration.sql`，再部署新版 Pages。房主创建房间时可从五款游戏中选择一款；加入者只能参加房主选定的游戏。所有 PK 对局统一在 30 秒后结算。逮住大青蛙逐次由服务器校验目标列；其余四款沿用单人玩法，限时提交分数，因此适合朋友娱乐，不作为严格防作弊赛事。

## 好友 PK 再来一局升级

在已上线游戏选择的数据库上，部署前执行 `cloudflare/pk-rematch-migration.sql`。已有房间保留原局数和成绩。对局结束后任一方可发起邀约，另一方同意后同一房间立即进入下一局的 3.5 秒倒计时，房间码和游戏不变，比分清零并生成新随机种子。每次点击或成绩上报附带局数，服务器拒绝旧局请求。

## 在线人数与快速匹配升级

部署前执行 `cloudflare/matchmaking-migration.sql`，为已有 D1 数据库创建在线状态和匹配队列表；全新数据库直接使用 `cloudflare/schema.sql`。大厅总人数统计最近 70 秒内有心跳的浏览器/账号；五个游戏模式的人数表示当前在匹配页选择该模式的活跃玩家，等待人数则统计最近 16 秒内仍在寻找对手的玩家。游客和登录玩家都能进入匹配。游客会自动取得临时会话及“游客＋五位数字”昵称，会话有效期为 24 小时；游客不能手动创建好友房间或提交排行榜成绩。匹配成功会自动创建 30 秒 PK 房间并进入对局。该升级不需要新的数据库迁移。心跳是近似在线状态，关闭页面后人数最多延迟约 70 秒消失。

在线玩家页面显示最近 70 秒内活跃的注册玩家和游客，最多列出 100 人。游客会自动获得临时会话，显示“游客＋五位数字”的昵称及专属游客头像；原始访客标识不公开。该页面复用现有在线状态表，无需新的数据库迁移。

逮住大青蛙 PK 的命中请求按短间隔合并提交，每批由服务器按确定性题序逐个校验。结束后等待最后一批提交及一次权威比分同步，再显示胜负，避免高频点击时即时分数和结算分数不一致。该项无需额外数据库迁移。

## 好友与私信升级

已有 D1 数据库在部署新版 Pages 前，执行 `cloudflare/friends-migration.sql`；全新数据库直接使用 `cloudflare/schema.sql`。登录玩家可按昵称或 ID 搜索、发送和处理好友申请。双方成为好友后才能收发私信；消息存于 D1，好友页面定时获取新消息和未读数。PK 房主可以直接邀请当前在线的好友，对方接受后自动加入该房间。好友申请、私信和邀请均通过服务器校验登录身份与对应关系。

## 五位玩家 ID 与北京时间

已有 D1 数据库在部署新版 Pages 前，执行 `cloudflare/player-id-migration.sql`。它为每个旧账号分配唯一的五位公开 ID，不修改数据库内部主键，因此现有帖子、好友、成绩和会话仍有效。新账号注册时随机分配未占用的五位 ID。全新数据库直接使用 `cloudflare/schema.sql`。数据库继续以 UTC 存储时间，页面统一转换为北京时间显示。
