# 源码导览

`index.html` 只保留页面骨架和资源引用。样式与 JavaScript 都集中在本目录，按职责拆分；无需安装依赖或执行构建。

## 文件职责

| 文件 | 内容 |
| :--- | :--- |
| `config.js` | 类别、导航、30 项活动预设，以及共享状态的初始结构 |
| `utils.js` | 日期处理、日期校验、文本转义、ID 生成和 DOM 查询 |
| `storage.js` | 本地记录的读取与原子保存、活动更新、心情草稿 |
| `components.js` | 导航、提示、活动列表、评分按钮和心情卡片 |
| `library.js` | 活动灵感库、分类与时长筛选、预设加入和调整 |
| `pages.js` | 今天、安排、回顾、指南页面，以及日期切换和页面定位 |
| `dialogs.js` | 编辑、开始、缩小、反馈和暂缓弹窗，以及焦点恢复 |
| `activities.js` | 活动查询、完成、撤销和修改后的界面更新 |
| `backup.js` | JSON 备份导出、导入校验与恢复 |
| `sync.js` | GitHub / Google 登录、可选自动同步、三方合并、冲突处理和同步备份 |
| `vendor/` | 固定版本 Supabase SDK 与许可证，异步加载 |
| `events.js` | 按钮、表单、输入和键盘事件的分发 |
| `app.js` | 唯一启动入口：读取记录、绑定事件、首次渲染 |
| `styles.css` | 基础样式、组件布局、活动库与响应式适配 |

## 加载与依赖

所有脚本由 `index.html` 使用普通的 `defer` 脚本按顺序加载，`config.js` 最先执行，`app.js` 最后执行。保持这个加载顺序，直接打开本地 `index.html` 和部署到 GitHub Pages 都不需要额外配置。

模块各自放在独立函数作用域中，通过唯一的全局命名空间 `window.Weiguang` 互相调用：

- `Weiguang.config` 保存配置，`Weiguang.state` 保存当前记录和界面状态。
- 其余对象与文件同名，例如 `Weiguang.storage`、`Weiguang.pages`。
- 每个模块顶部列出依赖，底部通过 `Object.assign` 列出可供其他模块调用的函数。
- 定义模块时不绑定事件或渲染页面；这些操作统一在 `app.js` 中执行。

需要修改预设活动时，从 `config.js` 开始；修改页面内容时查看 `pages.js`；修改操作行为时查看 `events.js` 和对应功能模块；调整外观时查看 `styles.css`。

## 回归检查

在仓库根目录执行：

```sh
node tests/workflows.test.js
node tests/sync.test.js
```

测试按 `index.html` 中的实际顺序加载源码，检查启动、活动操作、灵感库、心情草稿和备份兼容。
