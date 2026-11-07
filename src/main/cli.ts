import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { which } from './exec'
import { detectInteractivePrompt } from './prompt'

export interface RunCliOptions {
  executable: string
  args: string[]
  cwd: string
  env?: Record<string, string>
  timeoutMs: number
  /** Kill the process tree when it produces no output for this long. */
  stallMs?: number
  onChunk?: (chunk: string) => void
  signal?: AbortSignal
  input?: string
}

export interface CliResult {
  ok: boolean
  code: number | null
  output: string
  timedOut: boolean
  stalled?: boolean
  /** The process exited without consuming the prompt we piped in. */
  ignoredInput?: boolean
  /** The line of output that asked a question we cannot answer without a PTY. */
  interactivePrompt?: string | null
  error?: string
}

/** Windows cannot spawn .ps1/.cmd directly; wrap them in their host interpreter. */
async function resolveLaunch(executable: string): Promise<{ file: string; prefix: string[] }> {
  const direct = await which(executable)
  const path = direct ?? executable
  const lower = path.toLowerCase()
  if (lower.endsWith('.ps1')) {
    return { file: 'powershell.exe', prefix: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path] }
  }
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    return { file: 'cmd.exe', prefix: ['/c', path] }
  }
  return { file: path, prefix: [] }
}

export async function runCli(opts: RunCliOptions): Promise<CliResult> {
  const { file, prefix } = await resolveLaunch(opts.executable)
  return new Promise<CliResult>((resolve) => {
    let child: ChildProcessWithoutNullStreams
    let settled = false
    try {
      child = spawn(file, [...prefix, ...opts.args], {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env, NO_COLOR: '1', CI: '1', FORCE_COLOR: '0' },
        windowsHide: true,
        shell: false
      })
    } catch (error) {
      resolve({ ok: false, code: null, output: '', timedOut: false, error: (error as Error).message })
      return
    }

    let output = ''
    let timedOut = false
    let stalled = false
    let prompt: string | null = null
    const kill = () => {
      if (settled || !child.pid) return
      // Windows: killing the .cmd host leaves the node grandchild running, so take the tree.
      if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => undefined)
      } else {
        child.kill('SIGKILL')
      }
    }
    const timeout = setTimeout(() => {
      timedOut = true
      kill()
    }, opts.timeoutMs)

    // A CLI that streams nothing for minutes is wedged, not busy.
    let stall: ReturnType<typeof setTimeout> | null = null
    const armStall = () => {
      if (!opts.stallMs) return
      if (stall) clearTimeout(stall)
      stall = setTimeout(() => {
        stalled = true
        kill()
      }, opts.stallMs)
    }
    armStall()

    const onAbort = () => kill()
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    const push = (buf: Buffer | string) => {
      const text = buf.toString()
      output += text
      armStall()
      opts.onChunk?.(text)
      // No PTY: a question here can never be answered. Fail now, with the text
      // that asked it, instead of burning the whole session timeout.
      if (!prompt) {
        prompt = detectInteractivePrompt(output)
        if (prompt) kill()
      }
    }

    child.stdout.on('data', push)
    child.stderr.on('data', push)
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (stall) clearTimeout(stall)
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({ ok: false, code: null, output, timedOut, stalled, error: error.message })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (stall) clearTimeout(stall)
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({
        ok: code === 0 && !timedOut && !stalled && !prompt,
        code,
        output,
        timedOut,
        stalled,
        interactivePrompt: prompt,
        error: prompt
          ? `Session asked "${prompt}" and stopped. Sessions have no terminal, so a question cannot be answered; use a non-interactive invocation.`
          : timedOut
            ? `Session exceeded its ${Math.round(opts.timeoutMs / 60000)} minute limit`
            : stalled
              ? `Session stalled: no output for ${Math.round((opts.stallMs ?? 0) / 60000)} minutes`
              : undefined
      })
    })

    // A child that exits before reading its prompt raises EPIPE on stdin.
    // Without a listener that is an uncaught exception and it takes the main process down.
    child.stdin.on('error', () => undefined)

    if (opts.input) child.stdin.end(opts.input)
    else child.stdin.end()
  })
}

export function readFileSafe(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  } catch {
    return null
  }
}
