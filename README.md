# Sweetfrog · 朋友游戏厅

五款原创实现的浏览器小游戏：逮住大青蛙、合成大青蛙、青蛙起飞、青蛙2048、青蛙定位练习。

## 玩家账号与社区

网站有独立的意见留言、玩家社区、排行榜三个页面。注册使用玩家昵称和密码；游客可浏览提议、话题和排行榜，登录后才能发布提议、为每条提议点赞一次、发帖回复以及在每款游戏完成后上榜。服务端用 SQLite 保存数据，密码以随机盐和 scrypt 哈希保存，登录令牌在数据库中只存哈希。

本地开发需要 Node.js 24：运行 `node server/server.mjs`，访问 `http://127.0.0.1:4175/`。数据默认在 `data/sweetfrog.sqlite`，已被 Git 忽略；可用 `SWEETFROG_DB` 和 `PORT` 环境变量调整。不要把数据库或账号信息提交到 GitHub。

GitHub Pages 只能托管静态前端。正式启用账号和跨设备社区前，建议把整个网站与 `server/server.mjs` 一起部署到支持持久磁盘、Node.js 24 和 HTTPS 的服务，保持 `community-config.js` 的 `apiBaseUrl` 为空以使用同源 API。当前 GitHub Pages 的 `main` 分支仍是旧版纯游戏站，新的账号页面暂不发布。浏览器端提交的游戏成绩无法完全防伪，排行榜适合朋友间娱乐，不适合有奖竞赛。

管理后台位于 `admin.html`。首次启动服务时设置 `SWEETFROG_ADMIN_USER` 和 `SWEETFROG_ADMIN_PASSWORD`（至少 12 位），服务会创建管理员账号；之后使用该账号在网站登录。管理员可以查看总览、提议、话题与回复、排行榜及账号列表，删除不当内容和异常成绩，并停用或恢复普通玩家账号。不要把管理员密码提交到仓库，也不要把 SQLite 数据库提交或上传到 GitHub Pages。后台 API 会独立校验管理员身份，普通玩家无法通过直接请求调用。

未来接入 Firebase 时，保留了 `firebase-config.js` 与 `firebase-adapter.js` 接口。前端统一通过 `community-transport.js` 读取数据；完成适配器实现与 Firebase 安全规则后，可将 `community-config.js` 的 `provider` 改为 `firebase`。当前 Firebase 适配器尚未启用，切换前必须实现注册登录、唯一点赞和管理员授权，不能仅靠网页界面判断权限。

## 使用

纯游戏可以用静态服务器打开，例如 `python -m http.server 4173`；需测试账号与社区时请使用上面的 Node 服务。GitHub Pages 从 `main` 分支根目录自动发布。

- 点击挑战：点击最底行头像，或按 D / F / J / K，限时 30 秒；误点扣 2 秒。
- 合成大青蛙：移动选择落点并点击 / 松手投放；键盘左右移动、空格投放。相同等级合并，等级以色框和数字区分。超过警戒线持续 2 秒结束。
- 青蛙起飞：点击或空格上升，穿过水管得分。
- 青蛙2048：滑动、方向键或屏幕按钮移动；相同数字合并，2048 后可继续。

最高分保存在当前浏览器的 localStorage。音效默认关闭。切到后台或窗口失焦会暂停，返回后手动继续。

## 验证

`node --test tests/core.test.js` 检查 2048 合并与合成物理。`tests/browser-check.mjs` 为 Playwright 浏览器流程检查，需安装 Playwright 并提供浏览器。设置 `PLAYWRIGHT_MODULE_PATH` 可使用非默认安装路径，`BROWSER_CHANNEL` 默认为 `msedge`。

## 素材

`assets/photo-1.jpg` 至 `photo-5.jpg` 是用户提供的原始照片。照片只在 CSS / Canvas 显示时取景，源文件未修改。`assets/frog-mascot.png` 为本项目生成的吉祥物。生成工具和完整提示词见 `ASSETS.md`。

游戏逻辑独立编写，玩法参考点击音游、合成类游戏、Flappy Bird 和 2048；未打包此前推荐仓库中的第三方源码、音效或美术素材。

## 青蛙定位练习

从大厅进入第五款游戏，或访问 `#aim`。静态定位在每次命中后刷新位置；移动追点让靶子持续移动、碰到边缘反弹。五张原始照片在圆形靶子中轮换。

- 三档直径：68 / 50 / 34 像素；训练时长 30 / 60 秒。
- 3 秒准备倒计时后开始；训练过程中锁定设置，结束或重开后可调整。
- 每次命中得 100 分，按本次靶子出现至命中的用时再奖励 0–100 分；未命中会打断连击。
- 显示命中率、平均命中用时、连续命中和总点击数；平均用时不含暂停时间。综合最佳记录不同设置下的最高得分。
- Esc 或切换窗口暂停，点击继续后恢复。支持鼠标与触屏。这是网页中的二维定位训练，不模拟 FPS 的三维视角或灵敏度。
- `node --test tests/aim.test.js` 验证命中与计分；`node tests/aim-browser.mjs` 检查完整训练流程（Playwright，默认 Chrome）。

### 青蛙干扰与随机大小

靶子大小默认是随机模式，每个新照片靶的直径在 34–68 像素之间变化；大、中、小固定尺寸继续保留。每轮最多出现两只带红色禁打标记的青蛙，定时换位，且不会遮挡照片圆靶。只打照片，不打青蛙：误击青蛙扣 100 分（最低为 0）、中断连击并计入总点击数，结算显示误击次数。

## 玻璃主题与字体

`theme.css` 保留原有布局和玩法，叠加薄荷、冰蓝、淡紫与蜜桃渐变、半透明玻璃表面和渐变标题。游戏场地继续使用清晰底色。

自带的 `assets/fonts/ZCOOLKuaiLe-Regular.ttf` 用于中文标题，`assets/fonts/Nunito-Variable.ttf` 用于英文和数字；两款字体均来自 Google Fonts，分别附带 `OFL-ZCOOL-KuaiLe.txt` 和 `OFL-Nunito.txt` 许可文件。
