import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A static security scanner for skill folders, modelled on NVIDIA SkillSpector's
 * published pattern families and risk scoring. It reads every text file in a
 * skill (SKILL.md, scripts, assets) and reports suspicious patterns. It is not
 * a substitute for the full SkillSpector pipeline (no LLM pass, no OSV lookup,
 * no YARA), but it covers the same high-value families with the same severity
 * weights so a dangerous skill is caught before it is installed.
 */

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type Recommendation = 'SAFE' | 'CAUTION' | 'DO NOT INSTALL'

export interface SkillFinding {
  id: string
  severity: Severity
  title: string
  location: string
  detail: string
}

export interface SkillScanReport {
  score: number
  severity: Severity
  recommendation: Recommendation
  executable: boolean
  findings: SkillFinding[]
}

const WEIGHT: Record<Severity, number> = { LOW: 5, MEDIUM: 10, HIGH: 25, CRITICAL: 50 }
const EXEC_MULTIPLIER = 1.3

export function severityOf(score: number): { severity: Severity; recommendation: Recommendation } {
  if (score >= 81) return { severity: 'CRITICAL', recommendation: 'DO NOT INSTALL' }
  if (score >= 51) return { severity: 'HIGH', recommendation: 'DO NOT INSTALL' }
  if (score >= 21) return { severity: 'MEDIUM', recommendation: 'CAUTION' }
  return { severity: 'LOW', recommendation: 'SAFE' }
}

interface Pattern {
  id: string
  severity: Severity
  title: string
  detail: string
  /** Regex tested against file content. */
  re: RegExp
  /** Only run on script-like files. */
  scriptOnly?: boolean
}

/** Negation preceding a matched pattern means the text is warning about it, not using it. */
const NEGATION = /\b(never|not|don't|do not|avoid|prevent|forbid|must not|should not|without|except|example|deny|denied|blocked|forbidden|warning|harmful|malicious|dangerous)\b/i

/**
 * Families that are suspicious on their own, regardless of score: an instruction
 * override, exfiltration, refusal suppression, remote execution, credential
 * theft, self-modification, or destructive content is a hard "do not install".
 * A pile of MEDIUM findings (subprocess + env in ordinary build tooling) is not.
 */
const BLOCKING_IDS = new Set([
  'P1', 'P1b', 'P3', 'AR1', 'AR2', 'AR3', 'SC2', 'SC2b', 'SC3',
  'PE3', 'TT3', 'RA1', 'RA1b', 'P5', 'AST1', 'AST2'
])

const PATTERNS: Pattern[] = [
  // P1 instruction override
  { id: 'P1', severity: 'HIGH', title: 'Instruction override', detail: 'Commands the agent to ignore or override its safety constraints.', re: /(ignore|bypass|override|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules|guidelines|constraints)/i },
  { id: 'P1b', severity: 'HIGH', title: 'Instruction override', detail: 'Commands the agent to disable its safety or review behavior.', re: /(disable|turn off|deactivate|bypass)\s+(your|the)\s+(safety|review|guardrail|moderation|constraints)/i },
  // P2b hidden text via zero-width / Unicode control characters only (P2 requires
  // real instruction content; a broad comment regex flags benign metadata like
  // "<!-- generated at build time -->" and would need an LLM to disambiguate).
  { id: 'P2b', severity: 'MEDIUM', title: 'Hidden instructions', detail: 'Zero-width or unusual whitespace characters that can hide text.', re: /[\u200B\u200C\u200D\uFEFF\u2060]/ },
  // P3 exfiltration commands
  { id: 'P3', severity: 'HIGH', title: 'Exfiltration command', detail: 'Instructs transmission of conversation or file contents to an external host.', re: /(send|post|upload|forward|exfiltrate|transmit|leak)\s+(all|the|this|current|entire|collected|gathered)\s+(conversation|context|chat|output|transcript|data|logs)/i },
  // AR1-3 anti-refusal
  { id: 'AR1', severity: 'HIGH', title: 'Refusal suppression', detail: 'Instructs the agent to never refuse a request.', re: /never\s+(refuse|say no|reject)|do not\s+refuse|always\s+comply/i },
  { id: 'AR2', severity: 'HIGH', title: 'Disclaimer suppression', detail: 'Instructs omission of warnings or disclaimers.', re: /(no|omit|skip|remove)\s+(disclaimers|warnings|ethics|moralizing|commentary)/i },
  { id: 'AR3', severity: 'HIGH', title: 'Safety policy nullification', detail: 'Jailbreak framing that nullifies guardrails.', re: /you have no (restrictions|limits|constraints|guidelines)|ignore your (guidelines|rules|instructions|ethics)|do anything (now|you want)/i },
  // E2 env variable harvesting. Reading well-known secret variables in an API
  // client is normal, so this alone is MEDIUM; it becomes CRITICAL when combined
  // with a network sink (TT3).
  { id: 'E2', severity: 'MEDIUM', title: 'Environment variable access', detail: 'Reads environment variables; combined with a network sink this becomes exfiltration.', re: /(os\.environ|process\.env|getenv\(|%USERPROFILE%|%APPDATA%|%PATH%)/i, scriptOnly: true },
  // PE2 privileged execution
  { id: 'PE2', severity: 'MEDIUM', title: 'Elevated execution', detail: 'Runs commands with elevated privileges.', re: /\b(sudo|runas|gksudo|pkexec)\b/i, scriptOnly: true },
  // PE3 credential access (narrow: actual credential files)
  { id: 'PE3', severity: 'HIGH', title: 'Credential access', detail: 'Reads SSH keys, cloud credentials or password stores.', re: /(cat|type|open|read|load|scp)\s+['"]?[^\n]{0,60}?(\.ssh\/id_rsa|\.aws\/credentials|\.kube\/config|credentials\.json|id_rsa|\.pem)/i, scriptOnly: true },
  // SC2 external script fetching
  { id: 'SC2', severity: 'HIGH', title: 'External script fetching', detail: 'Downloads and executes a remote script (curl | sh pattern).', re: /(curl|wget|Invoke-WebRequest)[^\n]*\|[^\n]*(sh|bash|pwsh|powershell|zsh)/i, scriptOnly: true },
  { id: 'SC2b', severity: 'HIGH', title: 'External script fetching', detail: 'Downloads a remote executable or installer.', re: /(curl|wget|Invoke-WebRequest)[^\n]*(-o |\.exe|\.msi|\.ps1|\.sh)/i, scriptOnly: true },
  // SC3 obfuscated code: decoded data flowing into an execution sink. A lone
  // atob() for a data URI (image loaders) is not execution.
  { id: 'SC3', severity: 'HIGH', title: 'Obfuscated code', detail: 'Encoded data is decoded and executed.', re: /(?:base64\s*-d[^\n]*(?:\|sh|\|bash)|\b(?:eval|exec|Function)\([^)]{0,160}(?:atob|b64decode|base64\.decode|Buffer\.from))/i, scriptOnly: true },
  // AST1/2: standalone exec/eval only; `obj.exec(` or `.eval(` method calls are routine.
  { id: 'AST1', severity: 'CRITICAL', title: 'exec() call', detail: 'Standalone exec() enabling arbitrary code execution.', re: /(?<![\w.])exec\(/i, scriptOnly: true },
  { id: 'AST2', severity: 'HIGH', title: 'eval() call', detail: 'Standalone eval() evaluating arbitrary expressions.', re: /(?<![\w.])eval\(/i, scriptOnly: true },
  // AST4 subprocess / shell execution (common in build tooling, so MEDIUM).
  { id: 'AST4', severity: 'MEDIUM', title: 'subprocess / shell execution', detail: 'External command execution via subprocess or shell.', re: /\b(os\.system\(|os\.popen\(|subprocess\.(call|run|Popen)|child_process\.(exec|execSync|spawnSync)|spawn\(['"]|execFile\(['"])/i, scriptOnly: true },
  // RA1 self-modification: only real write operations targeting agent files,
  // not prose like "write the SKILL.md" describing a skill's purpose.
  { id: 'RA1', severity: 'CRITICAL', title: 'Self-modification', detail: 'Modifies its own skill, agent or configuration files at runtime.', re: /(open\([^)]{0,120}['"]w['"]|writeFileSync\(|fs\.write|\.write\(|f\.write\(|tee\s+-a)[^\n]{0,80}(SKILL\.md|AGENTS\.md|CLAUDE\.md)/i, scriptOnly: true },
  { id: 'RA1b', severity: 'HIGH', title: 'Self-modification', detail: 'Commands the agent to rewrite its own instructions or skill file.', re: /(update|rewrite|overwrite|replace)\s+(your|its)\s+own\s+(instructions|rules|skill|SKILL\.md|AGENTS|CLAUDE)|(update|rewrite|overwrite|replace)\s+[^\n]{0,30}(SKILL\.md|AGENTS\.md|CLAUDE\.md)/i },
  // TT3 credential exfiltration chain: a secret-named env var flowing into a
  // network sink in the same file. Reading a base-url variable is not a secret.
  { id: 'TT3', severity: 'CRITICAL', title: 'Credential exfiltration chain', detail: 'Reads a secret variable and sends it to a network destination.', re: /(os\.environ\[['"]\w*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PASS)[\w'"]*\]|process\.env\.\w*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PASS)|getenv\(['"]\w*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PASS)['"]\))[\s\S]{0,400}(fetch\(|axios|requests\.(post|put|get)|curl|wget|https?:\/\/)/i, scriptOnly: true },
  // P5 harmful content (narrow to actual destructive instructions, skipping "never rm -rf" advice)
  { id: 'P5', severity: 'CRITICAL', title: 'Harmful content', detail: 'Instructions that could cause severe or destructive harm.', re: /(rm -rf \/|mkfs\s|format\s+c:|\bdel\s+\/f\s+\/s\s+\/q|:\(\)\{|weaponiz|bio.?weapon|make a bomb|shut down.*(hospital|life.?support|reactor))/i },
  // TM1 tool parameter abuse
  { id: 'TM1', severity: 'MEDIUM', title: 'Tool parameter abuse', detail: 'Requests shell or privileged tool modes.', re: /\bshell\s*=\s*['"]true['"]|\b--force\b|\b--yes\b|\b--no-input\b/i, scriptOnly: true }
]

const SCRIPT_EXT = new Set(['.py', '.js', '.mjs', '.cjs', '.ts', '.sh', '.bash', '.ps1', '.cmd', '.bat', '.rb', '.go', '.php', '.pl'])
const TEXT_EXT = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml', '.html', '.css', '.env', '.ts', '.js', '.py', '.sh', '.ps1', '.yml'])

function walkFiles(root: string, maxDepth = 4): string[] {
  const out: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      try {
        const st = statSync(full)
        if (st.isDirectory()) walk(full, depth + 1)
        else if (st.size <= 1_000_000) out.push(full)
      } catch {
        /* skip unreadable */
      }
    }
  }
  walk(root, 0)
  return out
}

export function scanSkill(dir: string): SkillScanReport {
  const files = walkFiles(dir)
  const findings: SkillFinding[] = []
  let executable = false

  for (const file of files) {
    const ext = file.slice(file.lastIndexOf('.'))
    if (!TEXT_EXT.has(ext)) continue
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (SCRIPT_EXT.has(ext)) executable = true
    const rel = file.slice(dir.length).replace(/^[\\/]/, '')
    for (const p of PATTERNS) {
      if (p.scriptOnly && !SCRIPT_EXT.has(ext)) continue
      const m = p.re.exec(content)
      if (!m) continue
      // A destructive or sensitive pattern that is only named to warn about it
      // ("never rm -rf /", "do not send the conversation") is advice, not intent.
      // Look across the last 300 chars (multi-line sentences) for negation.
      const window = content.slice(Math.max(0, m.index - 300), m.index)
      if (NEGATION.test(window)) continue
      const line = content.slice(0, m.index).split(/\r?\n/).length
      findings.push({
        id: p.id,
        severity: p.severity,
        title: p.title,
        location: `${rel}:${line}`,
        detail: `${p.detail} Matched: ${m[0].slice(0, 80)}`
      })
    }
  }

  // A pattern can match more than once in a file; keep one finding per pattern per file.
  const seen = new Set<string>()
  const unique = findings.filter((f) => {
    const key = `${f.id}|${f.location.split(':')[0]}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  let score = unique.reduce((acc, f) => acc + WEIGHT[f.severity], 0)
  if (executable) score = Math.round(score * EXEC_MULTIPLIER)
  const { severity, recommendation } = severityOf(score)
  const blocked = unique.some((f) => BLOCKING_IDS.has(f.id))
  // A high score from non-blocking MEDIUM findings (subprocess + env in ordinary
  // build tooling) warrants caution, never removal: only blocking families force
  // DO NOT INSTALL.
  const finalRec = blocked ? 'DO NOT INSTALL' : recommendation === 'DO NOT INSTALL' ? 'CAUTION' : recommendation
  return {
    score,
    severity: blocked ? (severity === 'LOW' ? 'MEDIUM' : severity) : severity,
    recommendation: finalRec,
    executable,
    findings: unique
  }
}
