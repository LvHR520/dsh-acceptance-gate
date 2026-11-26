# dsh-acceptance-gate

把「做完了」从一句自述，换成一次可执行的断言。

一个 DeepSeek Harness（DSH）插件：在工作区里的文件被 `present` 交付之前，自动跑一遍验收脚本；退出码非 0 就直接驳回这次交付，并把失败的断言原样丢回给模型。

## 它解决什么问题

模型说「已经做完了」成本是零，验证一次要花时间。于是交付质量全靠模型的自觉。

这个插件把判断权交给一段能跑的脚本：脚本说行才放行，脚本说不行就必须修好再来。模型的措辞、解释、道歉都绕不过退出码。

## 工作流程

1. 监听 Host 的 `tools/pre-execute` 瀑布事件，只认 `present` 这一个工具。
2. 检查 `present` 的 `files[].path` 是否落在工作区内（相对路径按工作区解析）。
3. 命中就同步跑一次 `powershell -NoProfile -ExecutionPolicy Bypass -File tools\test.ps1`。
4. 退出码 `0` → 放行；非 `0` → 返回 `deny`，理由里列出前 6 条 `[FAIL]` 断言。

验收通过后 30 秒内重复 `present` 不再重跑，避免一次交付重复等一秒以上。

## 它不做什么

- **不判断内容质量**。验收脚本只保证环境健康、脚本可解析、CLI 能起、登录态可用；PPT 版式、报告观点、数据正确性它一概不管。
- **不管别的工作区**。交付路径不在本工作区下的 `present` 直接放行。
- **不阻塞故障**。`test.ps1` 本身缺失或无法启动时放行并写警告，避免验收设施故障把交付全卡死。

## 安装

需要 DSH 环境。把本目录作为一个插件引入，`package.json` 里的 `dsh.bundle.patch` 会指向 `cordis.patch.yml`：

```jsonc
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

## 配置

默认跑工作区根目录下的 `tools/test.ps1`。要换位置，设置环境变量 `DSH_GATE_TARGET`（宿主进程启动时读取）：

```powershell
$env:DSH_GATE_TARGET = 'D:\somewhere\my-acceptance.ps1'
```

## 已知限制

- 依赖 `powershell.exe`（Windows PowerShell 5.1）；PATH 上没有它时按「验收设施故障」放行。
- 每次判定最多等 180 秒，超时按失败处理。
- 驳回理由是给模型看的，不会中断已排队的工作：修好后重试 `present` 即可。
- 验收脚本的输出在 Windows 上可能是 UTF-8，也可能是 GBK，解码时两种都试。

## 目录结构

```
index.js             插件主体：拦截 present、跑脚本、决定放行还是驳回
cordis.patch.yml     包补丁，声明插件在 Host 中的挂载
package.json         包元数据与 exports
icon.svg             插件图标
locale/              多语言文案（en / zh）
docs/DETAIL.md       设计细节与取舍
```

## 许可

未声明。作者保留所有权利。