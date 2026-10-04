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
3. 当前部署分支选择 codex/community-admin；此分支包含完整后端。以后合并 main 后可再切换。
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
pnpm exec wrangler pages project create sweetfrog --production-branch codex/community-admin
pnpm exec wrangler pages deploy dist --project-name sweetfrog --branch codex/community-admin
```

若项目已存在，省略 project create。命令行创建的 Direct Upload 项目不能直接切换为 Git 集成项目，需要持续使用命令行部署或单独创建 Git 集成项目。线上部署前须通过下面的测试。

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
