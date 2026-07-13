# Git Playground

面向 Git 初学者的交互式前端模拟器。你可以在模拟终端里创建文件、提交和分支，并实时观察 Working Directory、Staging Area、提交图与远程仓库的变化。所有命令均在浏览器内模拟，不会调用本机 Git 或 Shell。

## 功能

- 12 个渐进式关卡，提示分为“思路”和“具体命令”两级
- 模拟 `add`、`commit`、`branch`、`switch`、`merge`、`rebase`、`cherry-pick`、`reset` 等核心行为
- 支持 fast-forward、双亲 merge commit、简化冲突检测和解决流程
- 模拟文件命令：`touch`、`write`、`append`、`echo`、`cat`、`rm`、`ls`、`resolve`
- 可视化工作区、暂存区、本地提交图与远程分支
- 命令历史、Tab 补全、拼写建议和新手解释
- Sandbox 自由练习、JSON 导入/导出、localStorage 自动保存
- 桌面三栏布局和移动端任务/终端/可视化标签页

## 本地启动

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开终端输出的本地地址。

## 测试与构建

```bash
npm test
npm run build
```

生产文件会生成在 `dist/`。

## 部署到 GitHub Pages

`vite.config.ts` 已将 `base` 设置为 `./`，因此无需知道仓库名即可部署。

1. 执行 `npm run build`。
2. 将 `dist/` 内容发布到 `gh-pages` 分支，或在 GitHub Actions 中上传 `dist` 目录。
3. 在仓库 Settings → Pages 中选择对应的部署来源。

也可使用任意静态托管平台，项目不需要后端与环境变量。

仓库已包含 `.github/workflows/deploy-pages.yml`。推送到 `main` 后，GitHub Actions 会自动运行测试、构建并发布页面。

## 模拟范围

这是教学用的简化 Git 模型。它保留了分支指针、HEAD、提交快照、父提交、暂存区和三种 reset 模式等关键语义，但不会覆盖 Git 的所有参数、索引细节、网络协议或复杂三方合并策略。
