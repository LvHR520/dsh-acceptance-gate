# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-11-26

### 新增

- 首个版本：监听 `tools/pre-execute`，在 `present` 交付工作区内文件前同步跑验收脚本。
- 退出码非 0 时返回 `deny`，理由里列出前 6 条 `[FAIL]` 断言。
- 验收通过后 30 秒内重复 `present` 不重跑，避免一次交付重复等待。
- `test.ps1` 缺失或无法启动时放行并写警告，避免验收设施故障卡死交付。

### 说明

- 只对落在工作区内的交付生效；工作区外的 `present` 直接放行。
- 验收脚本路径与超时可通过插件配置项覆盖，不写死本机路径。