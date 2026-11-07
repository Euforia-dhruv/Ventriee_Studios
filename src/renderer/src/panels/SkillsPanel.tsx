import { useState } from 'react'
import { guard, useStore } from '../store'
import { Modal, Switch } from '../shell'
import { IconExternal, IconPlus, IconRefresh, IconTrash } from '../icons'
import type { SkillScanReport } from '../../../shared/types'

function ScanBadge({ scan }: { scan?: SkillScanReport | null }) {
  if (!scan) return <span className="badge">scanning…</span>
  const cls =
    scan.recommendation === 'SAFE' ? ' ok' : scan.recommendation === 'CAUTION' ? ' warn' : ' danger'
  return <span className={`badge${cls}`} title={scan.findings.length ? scan.findings.map((f) => `${f.id} ${f.title} at ${f.location}`).join('\n') : 'No problems found'}>{scan.recommendation} · {scan.score}</span>
}

export function SkillsPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [creating, setCreating] = useState(false)
  const [report, setReport] = useState<SkillScanReport | null>(null)
  const [reportSkill, setReportSkill] = useState('')

  const importSkill = async () => {
    const result = await guard(() => window.ventriee.importSkill())
    if (!result) return
    if (result.removed) {
      setReport(result.report)
      setReportSkill('Imported skill')
    } else if (result.report?.findings.length) {
      setReport(result.report)
      setReportSkill(result.skill?.name ?? 'Imported skill')
    }
  }

  return (
    <Modal
      title="Skills"
      subtitle={`${snapshot.skills.filter((s) => s.enabled).length} enabled of ${snapshot.skills.length}`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={() => void guard(() => window.ventriee.refreshSkills(), 'Registry rescanned')}>
            <IconRefresh /> Rescan
          </button>
          <button className="btn" onClick={importSkill} title="Pick a skill folder to scan and install">
            <IconPlus /> Import skill
          </button>
          <button className="btn" onClick={() => setCreating((v) => !v)}>
            <IconPlus /> New skill
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginBottom: 12, lineHeight: 1.6 }}>
        Skills are folders with a <span className="mono">SKILL.md</span>. Drop a folder into the skills
        directory, or import one, and the registry picks it up. Enabled skills are offered to workers in
        their task brief. Every skill is scanned on import and on rescan for malicious patterns (NVIDIA
        SkillSpector-style); a skill that fails badly is removed and never registered.
      </p>

      {report ? (
        <Modal
          title={
            report.recommendation === 'SAFE'
              ? `${reportSkill} · no problems`
              : report.recommendation === 'CAUTION'
                ? `${reportSkill} · caution`
                : `${reportSkill} · removed (do not install)`
          }
          onClose={() => setReport(null)}
          narrow
        >
          {report.recommendation === 'DO NOT INSTALL' ? (
            <p className="err-text" style={{ marginBottom: 10, fontSize: 12 }}>
              This skill was removed and not registered. Fix the problems below, then import it again.
            </p>
          ) : null}
          <p className="dim" style={{ fontSize: 12, marginBottom: 10 }}>
            Score {report.score}/100 · {report.severity} · {report.recommendation}.{' '}
            {report.executable ? 'Contains executable scripts (risk weighted ×1.3).' : 'No executable scripts.'}
          </p>
          {report.findings.length ? (
            report.findings.map((f, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', marginBottom: 6, background: 'var(--panel)' }}>
                <div className="mem-head">
                  <span className="mem-title" style={{ fontSize: 12 }}>{f.id} · {f.title}</span>
                  <span className="badge danger">{f.severity}</span>
                </div>
                <div className="faint mono" style={{ fontSize: 10.5 }}>{f.location}</div>
                <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>{f.detail}</div>
              </div>
            ))
          ) : (
            <p className="ok-text" style={{ fontSize: 12 }}>No suspicious patterns found.</p>
          )}
        </Modal>
      ) : null}

      {creating ? (
        <div style={{ border: '1px solid var(--line)', borderRadius: 9, padding: 12, marginBottom: 14, background: 'var(--panel)' }}>
          <div className="field">
            <label className="field-label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="playwright-smoke-test" />
          </div>
          <div className="field">
            <label className="field-label">Description</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line on when to use this skill." />
          </div>
          <div className="field">
            <label className="field-label">Instructions</label>
            <textarea className="textarea mono" style={{ minHeight: 110 }} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
          <button
            className="btn primary"
            disabled={!name.trim() || !description.trim()}
            onClick={async () => {
              const created = await guard(
                () =>
                  window.ventriee.saveMemory({
                    path: `skills/${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}/SKILL.md`,
                    title: name.trim(),
                    body: `---\nname: ${name.trim()}\ndescription: ${description.trim()}\nversion: 1.0.0\n---\n\n${instructions}`,
                    scope: 'skill',
                    projectId: snapshot.activeProjectId
                  }),
                'Skill written'
              )
              if (created) {
                await guard(() => window.ventriee.refreshSkills(), 'Skill registered')
                setCreating(false)
                setName('')
                setDescription('')
                setInstructions('')
              }
            }}
          >
            Create skill
          </button>
        </div>
      ) : null}

      {snapshot.skills.map((skill) => (
        <div key={skill.id} className="mem-row">
          <div className="mem-head">
            <span className="mem-title">{skill.name}</span>
            <span className={`badge ${skill.enabled ? 'ok' : ''}`}>{skill.enabled ? 'enabled' : 'off'}</span>
            <span className="badge">{skill.version}</span>
            <ScanBadge scan={skill.scan} />
            <span className="mem-path">{skill.source}</span>
          </div>
          <div className="mem-body" style={{ maskImage: 'none', maxHeight: 44 }}>{skill.description}</div>
          <div className="mem-actions">
            <button className="btn tiny" onClick={() => void guard(() => window.ventriee.toggleSkill(skill.id))}>
              {skill.enabled ? 'Disable' : 'Enable'}
            </button>
            {skill.scan?.findings.length ? (
              <button className="btn tiny" onClick={() => { setReport(skill.scan!); setReportSkill(skill.name) }}>
                View {skill.scan.findings.length} issue{skill.scan.findings.length === 1 ? '' : 's'}
              </button>
            ) : null}
            <button
              className="btn tiny"
              onClick={() => void guard(() => window.ventriee.revealFile(skill.path))}
            >
              <IconExternal width={10} height={10} /> Folder
            </button>
            <span className="faint" style={{ fontSize: 9.5, marginLeft: 'auto', alignSelf: 'center' }}>
              used {skill.uses}x - {skill.uses ? Math.round((skill.successes / skill.uses) * 100) : 0}% pass
            </span>
          </div>
        </div>
      ))}
      {!snapshot.skills.length ? (
        <p className="faint" style={{ fontSize: 12 }}>
          No skills yet. Verified workflows are added automatically after a run, or create one above.
        </p>
      ) : null}
    </Modal>
  )
}

export function AutomationsPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [name, setName] = useState('')
  const [instruction, setInstruction] = useState('')
  const [interval, setInterval] = useState(60)

  return (
    <Modal
      title="Automations"
      subtitle="A local scheduler. Nothing runs unless you create and enable it here."
      onClose={onClose}
      narrow
    >
      <div style={{ border: '1px solid var(--line)', borderRadius: 9, padding: 12, marginBottom: 14, background: 'var(--panel)' }}>
        <div className="field">
          <label className="field-label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekly SEO check" />
        </div>
        <div className="field">
          <label className="field-label">Instruction sent to the orchestrator</label>
          <textarea className="textarea" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Re-run the SEO audit and report anything that regressed." />
        </div>
        <div className="field">
          <label className="field-label">Every N minutes</label>
          <input className="input" type="number" min={5} value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
        </div>
        <button
          className="btn primary"
          disabled={!name.trim() || !instruction.trim() || !snapshot.activeProjectId}
          onClick={async () => {
            const created = await guard(
              () =>
                window.ventriee.addAutomation({
                  projectId: snapshot.activeProjectId!,
                  name: name.trim(),
                  instruction: instruction.trim(),
                  intervalMinutes: interval
                }),
              'Automation scheduled'
            )
            if (created) {
              setName('')
              setInstruction('')
            }
          }}
        >
          <IconPlus /> Add automation
        </button>
      </div>

      {snapshot.automations.map((auto) => (
        <div key={auto.id} className="kv-row">
          <div className="kv-row-main">
            <div className="kv-row-title">
              {auto.name}
              <span className="badge">{auto.intervalMinutes}m</span>
            </div>
            <div className="kv-row-sub">{auto.instruction}</div>
            <div className="kv-row-sub faint">
              {auto.enabled
                ? `next ${auto.nextRunAt ? new Date(auto.nextRunAt).toLocaleString() : '—'}`
                : 'disabled'}
              {auto.lastRunAt ? ` · last ${new Date(auto.lastRunAt).toLocaleString()}` : ''}
            </div>
          </div>
          <Switch on={auto.enabled} onClick={() => void guard(() => window.ventriee.toggleAutomation(auto.id))} label={`Toggle ${auto.name}`} />
          <button
            className="btn tiny danger"
            onClick={() => void guard(() => window.ventriee.deleteAutomation(auto.id), 'Automation removed')}
          >
            <IconTrash width={10} height={10} />
          </button>
        </div>
      ))}
      {!snapshot.automations.length ? (
        <p className="faint" style={{ fontSize: 12 }}>No automations configured.</p>
      ) : null}
    </Modal>
  )
}
