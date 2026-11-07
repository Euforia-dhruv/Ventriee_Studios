import { describe, expect, it } from 'vitest'
import { promotable } from '../src/main/queue'
import type { Task } from '../src/shared/types'

const task = (id: string, status: Task['status'], dependsOn: string[] = []): Task =>
  ({ id, status, dependsOn }) as Task

describe('promotable', () => {
  it('promotes a blocked task once every dependency is done', () => {
    const tasks = [task('a', 'done'), task('b', 'blocked', ['a'])]
    expect(promotable(tasks).map((t) => t.id)).toEqual(['b'])
  })

  it('keeps a task blocked while any dependency is unfinished', () => {
    const tasks = [task('a', 'done'), task('b', 'running'), task('c', 'blocked', ['a', 'b'])]
    expect(promotable(tasks)).toEqual([])
  })

  it('treats a missing dependency as satisfied rather than blocking forever', () => {
    expect(promotable([task('a', 'blocked', ['gone'])]).map((t) => t.id)).toEqual(['a'])
  })

  it('never promotes a task that is not blocked', () => {
    const tasks = [task('a', 'done'), task('b', 'ready'), task('c', 'failed')]
    expect(promotable(tasks)).toEqual([])
  })

  // The queue used to compute its pending list before promoting, so a chain
  // ended after its first task. Promotion must be visible to the same pass.
  it('promotes a whole chain in the order it becomes ready', () => {
    const tasks = [task('a', 'done'), task('b', 'blocked', ['a']), task('c', 'blocked', ['b'])]
    const first = promotable(tasks)
    expect(first.map((t) => t.id)).toEqual(['b'])
    first[0]!.status = 'done'
    expect(promotable(tasks).map((t) => t.id)).toEqual(['c'])
  })
})
