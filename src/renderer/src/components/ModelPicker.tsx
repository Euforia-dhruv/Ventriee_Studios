import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { guard, useStore } from '../store'
import { IconChevron, IconPlus, IconRefresh, IconSearch, IconStar } from '../icons'
import type { EngineKind, ModelOption, ProviderConfig } from '../../../shared/types'

export interface ResolvedModel {
  engine: EngineKind
  model: string
  endpoint: string
  providerId: string | null
}

/** A model option resolves to a real execution config, or to its configured provider. */
export function resolveModel(option: ModelOption, configs: ProviderConfig[]): ResolvedModel {
  const config = configs.find((c) => c.id === option.provider)
  if (config) {
    return { engine: config.engine, model: option.model, endpoint: config.baseUrl, providerId: config.id }
  }
  return { engine: option.provider as EngineKind, model: option.model, endpoint: '', providerId: null }
}

export const modelKey = (provider: string, model: string) => `${provider}::${model}`

export function shortName(option: { model: string }) {
  return option.model.split('/').pop() ?? option.model
}

export function ModelPicker({
  value,
  onPick,
  onAddProvider,
  disabled,
  compact
}: {
  value: ResolvedModel | null
  onPick: (option: ModelOption) => void
  onAddProvider: () => void
  disabled?: boolean
  compact?: boolean
}) {
  const snapshot = useStore((s) => s.snapshot)!
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [shift, setShift] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  const models = snapshot.models.filter((m) => m.configured || m.note)
  const prefs = snapshot.modelPrefs

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter(
      (m) =>
        m.model.toLowerCase().includes(q) ||
        m.providerLabel.toLowerCase().includes(q)
    )
  }, [models, query])

  const favourites = filtered.filter((m) => prefs.favorites.includes(modelKey(m.provider, m.model)))
  const recents = filtered
    .filter((m) => prefs.recents.includes(modelKey(m.provider, m.model)) && !prefs.favorites.includes(modelKey(m.provider, m.model)))
    .slice(0, 5)
  const rest = filtered.filter(
    (m) => !favourites.includes(m) && !recents.includes(m)
  )

  const groups = useMemo(() => {
    const map = new Map<string, ModelOption[]>()
    for (const m of rest) {
      const list = map.get(m.providerLabel) ?? []
      list.push(m)
      map.set(m.providerLabel, list)
    }
    return [...map.entries()]
  }, [rest])

  const star = async (m: ModelOption) => {
    const key = modelKey(m.provider, m.model)
    const favorites = prefs.favorites.includes(key)
      ? prefs.favorites.filter((k) => k !== key)
      : [key, ...prefs.favorites]
    await guard(() => window.ventriee.saveModelPrefs({ favorites }))
  }

  const current = value ? `${value.engine} ${shortName(value)}` : 'Choose model'
  // .mp-pop is right-aligned and 330px wide, so a narrow trigger near the left edge
  // pushes it off screen: the composer picker sat at x=192 and opened at x=-105.
  // Measure once after it mounts and shift it back inside the window.
  useLayoutEffect(() => {
    if (!open) return setShift(0)
    const el = pop.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    let delta = 0
    if (rect.left < pad) delta = pad - rect.left
    else if (rect.right > window.innerWidth - pad) delta = window.innerWidth - pad - rect.right
    setShift(delta)
  }, [open])

  const label = value && shortName(value) ? shortName(value) : 'Choose model'

  return (
    <div className="mp" ref={box}>
      <button
        className={`mp-trigger${compact ? ' compact' : ''}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={value ? `${value.engine} · ${value.model}` : 'Choose a model'}
      >
        <span className="mp-trigger-name">{label}</span>
        <IconChevron width={11} height={11} className="mp-caret" />
      </button>

      {open ? (
        <div className="mp-pop" ref={pop} style={shift ? { transform: `translateX(${shift}px)` } : undefined} role="listbox" aria-label="Model picker">
          <div className="mp-search">
            <IconSearch width={12} height={12} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models"
              aria-label="Search models"
            />
            <button className="mp-add" onClick={onAddProvider} title="Add provider or model" aria-label="Add provider">
              <IconPlus width={12} height={12} />
            </button>
          </div>

          {models.length === 0 ? (
            <div className="mp-empty">
              <span>No models discovered yet. Rescan, or add a provider.</span>
              <button
                className="btn tiny"
                style={{ marginTop: 8 }}
                onClick={() => void guard(() => window.ventriee.modelsDiscover(snapshot.activeProjectId))}
              >
                <IconRefresh width={10} height={10} /> Rescan models
              </button>
            </div>
          ) : null}

          {favourites.length ? (
            <Section label="Favourites">
              {favourites.map((m) => (
                <Row key={modelKey(m.provider, m.model)} option={m} selected={same(value, m)} starred onStar={() => void star(m)} onPick={() => { onPick(m); setOpen(false) }} />
              ))}
            </Section>
          ) : null}

          {recents.length ? (
            <Section label="Recent">
              {recents.map((m) => (
                <Row key={modelKey(m.provider, m.model)} option={m} selected={same(value, m)} starred={false} onStar={() => void star(m)} onPick={() => { onPick(m); setOpen(false) }} />
              ))}
            </Section>
          ) : null}

          {groups.map(([label, list]) => (
            <Section key={label} label={label}>
              {list.map((m) => (
                <Row key={modelKey(m.provider, m.model)} option={m} selected={same(value, m)} starred={false} onStar={() => void star(m)} onPick={() => { onPick(m); setOpen(false) }} />
              ))}
            </Section>
          ))}

          {!filtered.length && models.length ? <div className="mp-empty">Nothing matches “{query}”.</div> : null}

          <button className="mp-foot" onClick={onAddProvider}>
            <IconPlus width={11} height={11} /> Add provider or model
          </button>
        </div>
      ) : null}
      <span className="sr-only">{current}</span>
    </div>
  )
}

function same(value: ResolvedModel | null, m: ModelOption) {
  return Boolean(value && value.model === m.model && (value.providerId === m.provider || value.engine === m.provider))
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mp-section">
      <div className="mp-section-label">{label}</div>
      {children}
    </div>
  )
}

function Row({
  option,
  selected,
  starred,
  onStar,
  onPick
}: {
  option: ModelOption
  selected: boolean
  starred: boolean
  onStar: () => void
  onPick: () => void
}) {
  return (
    <div className={`mp-row${selected ? ' on' : ''}`}>
      <button className="mp-row-main" onClick={onPick} role="option" aria-selected={selected}>
        <span className="mp-model">{shortName(option)}</span>
        {option.providerLabel ? <span className="mp-prov">{option.providerLabel}</span> : null}
        {option.free === true ? <span className="badge ok">free</span> : null}
        {option.free === false ? <span className="badge">paid</span> : null}
        {option.note ? <span className="mp-note" title={option.note}>unverified</span> : null}
      </button>
      <button className={`mp-star${starred ? ' on' : ''}`} onClick={onStar} aria-label={starred ? 'Unfavourite' : 'Favourite'}>
        <IconStar width={11} height={11} />
      </button>
    </div>
  )
}
