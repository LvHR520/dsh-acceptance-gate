# 交付闸门（dsh-acceptance-gate）

把「做完了」从模型自述换成一次可执行断言：只要 `present` 要交付的文件落在
`D:\AI工作区\AI任务` 里，分发之前先跑一遍 `tools\test.ps1`；退出码非 0 就直接驳回这次交付。

## 它做什么

1. 监听 Host 的 `tools/pre-execute` 瀑布事件，只认 `present` 这一个工具。
2. 检查 `present` 的 `files[].path` 是否落在工作区内（含相对路径按工作区解析）。
3. 命中就同步跑一次 `powershell -NoProfile -ExecutionPolicy Bypass -File tools\test.ps1`。
4. 退出码 0 → 放行；非 0 → 返回 `deny`，理由里列出前 6 条 `[FAIL]` 断言。

验收通过后 30 秒内重复 `present` 不再重跑，避免一次交付重复等 1 秒以上。

## 它不做什么

- **不判断内容质量**：验收脚本只保证环境健康、脚本可解析、CLI 能起、登录态可用；
  PPT 版式、报告观点、数据正确性它一概不管。
- **不管别的工作区**：交付路径不在 `AI任务` 下的 `present` 直接放行。
- **不阻塞故障**：`test.ps1` 本身缺失或无法启动时放行并写警告，避免验收设施故障把交付全卡死。

## 配置

默认工作区取宿主进程的当前目录，验收脚本取 `<工作区>\tools\test.ps1`。两处都能用环境变量覆盖：

- `DSH_GATE_WORKSPACE`：判定「哪些 `present` 归本闸门管」的工作区根目录。
- `DSH_GATE_TARGET`：验收脚本的完整路径。

环境变量在宿主进程启动时读取。

## 已知限制

- 依赖 `powershell.exe`（Windows PowerShell 5.1）；PATH 上没有它时按「验收设施故障」放行。
- 每次判定最多等 180 秒，超时按失败处理。
- 驳回理由是给模型看的，不会中断已排队的工作：修好后重试 `present` 即可。