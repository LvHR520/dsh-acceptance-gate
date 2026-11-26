/**
 * dsh-acceptance-gate
 *
 * 在 `present` 派发之前跑一次工作区验收脚本（tools/test.ps1）。
 * 退出码非 0 => deny，理由里带上失败的断言，模型必须修好才能交付。
 *
 * 只拦「要交付的文件落在本工作区内」的 present，别的工作区不受影响。
 * 判定用 `tools/pre-execute` waterfall（需要 await 一个子进程，同步 guard 做不到）。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const WORKSPACE = 'D:\\AI工作区\\AI任务'
const TARGET = (process.env.DSH_GATE_TARGET || path.join(WORKSPACE, 'tools', 'test.ps1')).trim()
const PRESENT_TOOL = 'present'
const TIMEOUT_MS = 180_000
const PASS_TTL_MS = 30_000

let lastPassAt = 0

function normalizePath(p) {
  return String(p).replace(/\//g, '\\').toLowerCase()
}

function absolutePath(p) {
  const s = String(p)
  if (/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\')) return s
  return path.join(WORKSPACE, s)
}

function targetsWorkspace(args) {
  const files = args && Array.isArray(args.files) ? args.files : []
  const base = normalizePath(WORKSPACE) + '\\'
  for (const f of files) {
    const raw = f && (f.path || f.file || f.filePath)
    if (!raw) continue
    if (normalizePath(absolutePath(raw)).startsWith(base)) return true
  }
  return false
}

/** Windows PowerShell 管道输出可能是 UTF-8，也可能是本地代码页（GBK）；按探测结果解码。 */
function decodeOutput(buffer) {
  const utf8 = buffer.toString('utf8')
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('gbk').decode(buffer)
  } catch {
    return utf8
  }
}

function runAcceptance() {
  return new Promise((resolve) => {
    if (!existsSync(TARGET)) {
      resolve({ code: -1, out: `[gate] 验收脚本不存在: ${TARGET}` })
      return
    }
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', TARGET],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const chunks = []
    const cap = (d) => {
      chunks.push(d)
      let size = chunks.reduce((n, c) => n + c.length, 0)
      while (size > 64_000 && chunks.length > 1) {
        size -= chunks.shift().length
      }
    }
    child.stdout.on('data', cap)
    child.stderr.on('data', cap)

    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      resolve({ code: null, out: decodeOutput(Buffer.concat(chunks)) + '\n[gate] 验收超时' })
    }, TIMEOUT_MS)

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, out: `[gate] 无法执行验收脚本: ${err.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, out: decodeOutput(Buffer.concat(chunks)) })
    })
  })
}

/** 优先用纯 ASCII 的 GATE-FAIL 行（不受编码影响），否则退回 [FAIL] 行。 */
function failuresOf(out) {
  const gate = []
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^GATE-FAIL\s+(\S+)\s*(.*)$/)
    if (m) gate.push(m[2] ? `${m[1]} (${m[2].trim()})` : m[1])
  }
  if (gate.length) return gate.slice(0, 6)
  return out
    .split(/\r?\n/)
    .filter((l) => l.includes('[FAIL]'))
    .map((l) => l.replace(/^\s+/, '').replace(/\s+\(\d+ms\)\s*$/, '').trim())
    .slice(0, 6)
}

export const inject = ['tools']

export function apply(ctx) {
  ctx.effect(() =>
    ctx.on('tools/pre-execute', async (exec, next) => {
      if (!exec || exec.name !== PRESENT_TOOL) return next()
      if (!targetsWorkspace(exec.arguments)) return next()
      if (Date.now() - lastPassAt < PASS_TTL_MS) return next()

      const { code, out } = await runAcceptance()

      if (code === 0) {
        lastPassAt = Date.now()
        return next()
      }
      if (code === -1) {
        // 验收基础设施坏了：不能把整个交付卡死，放行但留下痕迹
        console.warn(`[dsh-acceptance-gate] ${out.trim()}`)
        return next()
      }

      const fails = failuresOf(out)
      const detail = fails.length ? fails.join('；') : '未见失败行，检查脚本输出'
      return {
        kind: 'deny',
        reason: `验收未通过（tools/test.ps1 退出码 ${code}）：${detail}。先修好再交付，不要用文字解释绕过。`,
        info: { name: 'dsh-acceptance-gate', code: 'ACCEPTANCE_FAILED', reason: detail },
      }
    }),
  )
}