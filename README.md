# Sweetfrog · 朋友游戏厅

一个以青蛙和朋友照片为主题的浏览器小游戏网站。可以单人游玩，也可以创建好友房间，或按游戏模式在线匹配对手。

**在线体验：** [sweetfrog.pages.dev](https://sweetfrog.pages.dev/) · [源码仓库](https://github.com/AuR3L1US07/sweetfrog)

## 玩什么

| 游戏 | 玩法 |
| --- | --- |
| 逮住大青蛙 | 点击最底排的照片，或使用 D / F / J / K，限时比手速 |
| 合成大青蛙 | 投放照片，合并相同等级，尽量别让它们堆过警戒线 |
| 青蛙起飞 | 点击或按空格控制飞行，穿过水管得分 |
| 青蛙2048 | 滑动、方向键或屏幕按钮移动方块，合成更大的数字 |
| 青蛙定位练习 | 点击照片靶，避开青蛙干扰物；可选静态／移动靶和靶子大小 |

游戏大厅之外还有这些功能：

- **好友 PK：** 登录后创建或加入房间，选择五款游戏之一进行 30 秒对战；双方同意后可以再来一局。
- **好友与私信：** 通过昵称或玩家 ID 搜索并申请好友；对方同意后可以双向聊天，查看未读消息，并直接邀请在线好友加入 PK 房间。
- **快速匹配与在线玩家：** 查看各模式在线和等待人数，选定游戏后自动寻找对手；在线名单显示近期活跃的登录玩家昵称与头像，游客只计入总人数。
- **玩家账号：** 注册时获得唯一的五位随机玩家 ID，可用昵称或 ID 添加好友；可修改昵称、密码和头像，未设置头像时显示默认卡通青蛙。
- **意见留言与玩家社区：** 游客可浏览；登录后可以提交建议、给建议点赞、发帖和回复。
- **排行榜：** 游客可查看各游戏榜单；登录后完成游戏可提交成绩。个人页面可查看自己的资料。
- **管理后台：** 管理员可管理建议、帖子、回复、成绩和玩家账号。

## 项目如何运行

正式站点使用 **Cloudflare Pages + Pages Functions + D1**。网页、账号和社区数据都在云端运行，访问网站不需要开发者的电脑保持开机。前端通过同源的 `/api` 与后端通信；玩家密码和会话令牌不会以明文存入数据库。

GitHub `main` 分支保存源码。GitHub Pages 只能托管静态文件，不能单独运行本站的账号、社区和在线对战后端。仓库还保留了用于本地开发的 Node/SQLite 服务，以及尚未启用的 Firebase 接口；当前线上站点使用 Cloudflare。

网页中的注册时间、社区日期和私信时间统一按北京时间显示；数据库时间戳仍以 UTC 保存，便于准确比较和排序。

## 本地运行

需要 **Node.js 24 或更高版本**和 **pnpm**。若要体验包含账号与在线对战的完整网站，使用本地 Cloudflare Pages 与 D1：

```sh
pnpm install
pnpm run build:pages
pnpm exec wrangler d1 execute sweetfrog-db --local --persist-to .wrangler/state --file cloudflare/schema.sql
pnpm exec wrangler pages dev dist --persist-to .wrangler/state --port 8788
```

打开 `http://127.0.0.1:8788/`。本地 D1 数据保存在被 Git 忽略的 `.wrangler/` 中，不会写入线上数据库。修改网页文件后重新运行 `pnpm run build:pages`，再启动本地预览。

也可以运行 `node server/server.mjs`，在 `http://127.0.0.1:4175/` 使用本地 Node/SQLite 版账号和社区功能。该服务主要用于独立开发，不提供 Cloudflare 版的好友 PK 与快速匹配。本地数据库默认位于 `data/sweetfrog.sqlite`。

## 部署与管理

部署、D1 初始化、已有数据库升级和管理员设置，请看 [Cloudflare 部署指南](cloudflare/DEPLOY.md)。网站后台入口为 [`/admin.html`](https://sweetfrog.pages.dev/admin.html)；需要先将自己的玩家账号设为管理员。

不要将账号密码、API Token、私钥或本地数据库提交到 GitHub。仓库的 `.gitignore` 已排除常见的本地凭据文件与构建产物。排行榜和部分 PK 模式依赖浏览器提交分数，适合朋友间娱乐，不适合用于有奖竞赛。

## 验证

```sh
pnpm test
pnpm run test:cloudflare
```

Cloudflare 集成测试使用临时本地 D1，不连接正式数据库。浏览器流程测试位于 `tests/*-browser.mjs`，需要 Playwright 和可用的浏览器。

## 主要目录

| 路径 | 用途 |
| --- | --- |
| `index.html`、`app.js`、`aim.js` | 游戏大厅与单人玩法 |
| `pk.js`、`match.js`、`friends.js` | 好友房间、快速匹配、好友与私信页面 |
| `community.js`、`admin.js` | 账号、社区、排行榜与后台界面 |
| `cloudflare/api.js`、`cloudflare/schema.sql` | 云端 API 与 D1 数据库结构 |
| `functions/api/` | Pages Functions 入口 |
| `server/` | 可选的本地 Node/SQLite 服务 |
| `assets/` | 青蛙形象、照片与字体 |
| `tests/` | 逻辑、API 与浏览器测试 |

照片素材由项目所有者提供，会作为公开网页资源发布。吉祥物素材说明见 [ASSETS.md](ASSETS.md)；字体许可文件位于 `assets/fonts/`。游戏代码为本项目实现，未打包参考项目的第三方源码或素材。
