# Sweetfrog · 朋友游戏厅

四款原创实现的浏览器小游戏：逮住大兄弟、合成大兄弟、朋友起飞、照片 2048。

## 使用

使用静态服务器打开项目，例如 `python -m http.server 4173`，访问 `http://localhost:4173`。GitHub Pages 从 `main` 分支根目录自动发布。

- 点击挑战：点击最底行头像，或按 D / F / J / K，限时 30 秒；误点扣 2 秒。
- 合成大兄弟：移动选择落点并点击 / 松手投放；键盘左右移动、空格投放。相同等级合并，等级以色框和数字区分。超过警戒线持续 2 秒结束。
- 朋友起飞：点击或空格上升，穿过水管得分。
- 照片 2048：滑动、方向键或屏幕按钮移动；相同数字合并，2048 后可继续。

最高分保存在当前浏览器的 localStorage。音效默认关闭。切到后台或窗口失焦会暂停，返回后手动继续。

## 验证

`node --test tests/core.test.js` 检查 2048 合并与合成物理。`tests/browser-check.mjs` 为 Playwright 浏览器流程检查，需安装 Playwright 并提供浏览器。设置 `PLAYWRIGHT_MODULE_PATH` 可使用非默认安装路径，`BROWSER_CHANNEL` 默认为 `msedge`。

## 素材

`assets/photo-1.jpg` 至 `photo-5.jpg` 是用户提供的原始照片。照片只在 CSS / Canvas 显示时取景，源文件未修改。`assets/frog-mascot.png` 为本项目生成的吉祥物。生成工具和完整提示词见 `ASSETS.md`。

游戏逻辑独立编写，玩法参考点击音游、合成类游戏、Flappy Bird 和 2048；未打包此前推荐仓库中的第三方源码、音效或美术素材。
