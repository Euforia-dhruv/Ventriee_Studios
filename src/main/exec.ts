import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const RANK = ['.exe', '.cmd', '.bat', '.ps1', '.com']

/**
 * Resolve an executable through the OS. Returns null when it is not on PATH.
 * On Windows `where` also lists extensionless shell shims (npm's bash launchers),
 * which cannot be spawned directly, so real executables are preferred.
 */
export async function which(cmd: string): Promise<string | null> {
  if (cmd.includes('/') || cmd.includes('\\')) return cmd
  const probe = process.platform === 'win32' ? 'where' : 'which'
  try {
    const { stdout } = await execFileAsync(probe, [cmd], { timeout: 8000, windowsHide: true })
    const candidates = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    if (!candidates.length) return null
    if (process.platform !== 'win32') return candidates[0]
    return candidates.sort((a, b) => rank(a) - rank(b))[0]
  } catch {
    return null
  }
}

function rank(file: string) {
  const lower = file.toLowerCase()
  const index = RANK.findIndex((ext) => lower.endsWith(ext))
  return index === -1 ? RANK.length : index
}

export async function execCapture(cmd: string, args: string[], cwd?: string, timeout = 15000) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd, timeout, windowsHide: true })
    return { ok: true, out: `${stdout}${stderr}`.trim() }
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message: string }
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}${e.message}`.trim() }
  }
}
