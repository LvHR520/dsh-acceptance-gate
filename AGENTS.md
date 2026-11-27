# AGENTS.md

给编码助手读的项目说明书。人读的版本在 [README.md](README.md)。

## 这个项目是什么

一个 DeepSeek Harness（DSH）插件：监听 Host 的 `tools/pre-execute` 瀑布事件，只认 `present` 工具。
交付文件落在工作区内时，同步跑一次工作区的验收脚本；退出码非 0 就 `deny` 这次交付。

单入口 `index.js`（ESM），无构建步骤。`cordis.patch.yml` 声明补丁位置，`locale/` 放文案。

## 怎么跑起来

需要 DSH 环境，仓库本身不提供独立运行入口：

1. 把本目录作为插件引入 DSH profile
2. `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`
3. 在工作区放 `tools\test.ps1`（验收脚本，退出码 0 = 通过）

## 验证改动的命令

```powershell
node --check index.js     # 语法
# 行为验证必须在 DSH 会话里做：present 一个工作区内的文件，看是否被脚本驳回
```

插件的行为**不能只靠单元测试确认**——它挂在 Host 的生命周期事件上，只有在真实会话里才能看到
`deny` 是否生效。改完至少手动走一次「脚本返回 1 → 交付被拦」的链路。

## 不要动的地方

| 位置 | 原因 |
|---|---|
| `tools/pre-execute` 事件名 | 换成别的名字插件就静默失效，且不报错 |
| `deny` 的返回结构 | Host 按固定字段读理由，字段名错了会变成空理由 |
| 30 秒通过缓存 | 去掉后每次 `present` 都阻塞一秒以上，体验明显变差 |

## 已知限制

- 只处理 `present` 一个工具，其他交付方式不拦。
- 验收脚本本身坏掉时放行（宁可漏拦，不能卡死）。
- 未在 macOS / Linux 上验证。

## 提交前

- 不要提交 `node_modules/`、`*.log`
- 改行为要更新 `CHANGELOG.md`
- 推送前跑 `pwsh _factory\gate.ps1 -RepoPath dsh-acceptance-gate`