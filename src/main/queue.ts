import type { Task } from '../shared/types'

/**
 * Blocked tasks whose dependencies have all completed.
 *
 * Kept pure and separate from the orchestrator so it can be tested without
 * booting Electron. The queue must call this BEFORE it decides it has nothing
 * left to do: deciding on the stale list ends a dependency chain after its
 * first task, which is exactly the bug this guards.
 */
export function promotable(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) =>
      t.status === 'blocked' &&
      t.dependsOn.every((id) => {
        const dep = tasks.find((x) => x.id === id)
        return !dep || dep.status === 'done'
      })
  )
}
