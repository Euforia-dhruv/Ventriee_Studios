import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = (props: P) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props
})

export const IconSend = (p: P) => (
  <svg {...base(p)}><path d="M4.5 12h13M12.5 6l6 6-6 6" /></svg>
)
export const IconStop = (p: P) => (
  <svg {...base(p)}><rect x="6.5" y="6.5" width="11" height="11" rx="2" /></svg>
)
export const IconSettings = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7L5.3 5.3" /></svg>
)
export const IconMemory = (p: P) => (
  <svg {...base(p)}><path d="M5 4.5h11l3 3v12H5z" /><path d="M8.5 9h7M8.5 13h7M8.5 17h4" /></svg>
)
export const IconSkill = (p: P) => (
  <svg {...base(p)}><path d="M12 3l2.4 5.2 5.6.7-4.1 3.9 1 5.6L12 15.8 7.1 18.4l1-5.6L4 8.9l5.6-.7z" /></svg>
)
export const IconClock = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></svg>
)
export const IconClose = (p: P) => (
  <svg {...base(p)}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
)
export const IconChevron = (p: P) => (
  <svg {...base(p)}><path d="M6 9.5l6 6 6-6" /></svg>
)
export const IconFolder = (p: P) => (
  <svg {...base(p)}><path d="M3.5 7.5h5l1.8 2.2h10.2v9.3H3.5z" /><path d="M3.5 7.5V5h5l1.8 2.5" /></svg>
)
export const IconPlus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconPause = (p: P) => (
  <svg {...base(p)}><path d="M9.5 6v12M14.5 6v12" /></svg>
)
export const IconPlay = (p: P) => (
  <svg {...base(p)}><path d="M8 5.5l10 6.5-10 6.5z" /></svg>
)
export const IconCheck = (p: P) => (
  <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
export const IconGrip = (p: P) => (
  <svg {...base(p)}><circle cx="8" cy="7" r="1.2" /><circle cx="8" cy="12" r="1.2" /><circle cx="8" cy="17" r="1.2" /><circle cx="16" cy="7" r="1.2" /><circle cx="16" cy="12" r="1.2" /><circle cx="16" cy="17" r="1.2" /></svg>
)
export const IconTerminal = (p: P) => (
  <svg {...base(p)}><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="M7 9.5l3 2.5-3 2.5M12.5 14.5h4" /></svg>
)
export const IconSpark = (p: P) => (
  <svg {...base(p)}><path d="M12 3.5l1.8 4.9 4.7 1.8-4.7 1.8L12 16.9l-1.8-4.9-4.7-1.8 4.7-1.8z" /><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
)
export const IconGrid = (p: P) => (
  <svg {...base(p)}><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></svg>
)
export const IconList = (p: P) => (
  <svg {...base(p)}><path d="M8 7h12M8 12h12M8 17h12M4.5 7h.01M4.5 12h.01M4.5 17h.01" /></svg>
)
export const IconExternal = (p: P) => (
  <svg {...base(p)}><path d="M14 4.5h5.5V10M19 5l-7.5 7.5" /><path d="M18 14v5.5H4.5V6H10" /></svg>
)
export const IconRefresh = (p: P) => (
  <svg {...base(p)}><path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7" /><path d="M19.5 4.5V9H15" /></svg>
)
export const IconTrash = (p: P) => (
  <svg {...base(p)}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7" /></svg>
)
export const IconPin = (p: P) => (
  <svg {...base(p)}><path d="M9 3.5h6M12 3.5v7M8 10.5h8l1.5 4H6.5z M12 14.5V20" /></svg>
)
export const IconEdit = (p: P) => (
  <svg {...base(p)}><path d="M15.5 4.5l4 4L8 20H4v-4z" /></svg>
)
export const IconInbox = (p: P) => (
  <svg {...base(p)}><path d="M3.5 12.5L6 5h12l2.5 7.5v6.5h-17z" /><path d="M3.5 12.5h4l1.5 2.5h6l1.5-2.5h4" /></svg>
)
export const IconPulse = (p: P) => (
  <svg {...base(p)}><path d="M3 12.5h4L9.5 6l4 12 2.5-5.5h5" /></svg>
)
export const IconWindow = (p: P) => (
  <svg {...base(p)}><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="M3 9h18" /></svg>
)
export const IconCopy = (p: P) => (
  <svg {...base(p)}><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></svg>
)
export const IconSearch = (p: P) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
)
export const IconStar = (p: P) => (
  <svg {...base(p)}><path d="M12 4l2.3 4.9 5.2.7-3.8 3.6.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 9.6l5.2-.7z" /></svg>
)
