import { describe, expect, it } from 'vitest'
import { detectInteractivePrompt } from '../src/main/prompt'

describe('detectInteractivePrompt', () => {
  it('catches a y/n confirmation', () => {
    expect(detectInteractivePrompt('Overwrite existing file? [y/N]')).toBe('Overwrite existing file? [y/N]')
  })

  it('catches a press-any-key pause', () => {
    expect(detectInteractivePrompt('Installation complete.\nPress any key to continue.')).not.toBeNull()
  })

  it('catches a yes/no question in prose', () => {
    expect(detectInteractivePrompt('Do you want to proceed with the deploy?')).not.toBeNull()
  })

  it('catches a credential prompt', () => {
    expect(detectInteractivePrompt('Enter your API key:')).not.toBeNull()
  })

  it('ignores a log line that merely mentions confirming', () => {
    expect(detectInteractivePrompt('Confirming 12 files written to disk.\nAll good.')).toBeNull()
  })

  it('ignores ordinary build output ending in a colon', () => {
    expect(detectInteractivePrompt('Compiling...\nOutput directory: dist')).toBeNull()
  })

  it('only looks at the tail, so an old question does not poison a finished run', () => {
    const text = 'Do you want to proceed? [y/N]\nyes\n\nBuild complete. 42 modules transformed.'
    expect(detectInteractivePrompt(text)).toBeNull()
  })
})
