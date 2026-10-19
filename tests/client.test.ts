import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/client/index.js'
import type { MedicalClientContext, PanelProps } from '../src/client/types.js'

test('preparing a draft lets native asynchronous navigation finish without superseding it', async () => {
  let face: PanelProps | undefined
  let pending: Promise<void> | undefined
  let prepared: { prompt: string; clearPreviousDraft: false } | undefined
  let navigation = new AbortController()
  const ctx: MedicalClientContext = {
    slots: {
      inject(_name, setup) { return setup() },
      register(options: { readonly name: string; readonly inject?: () => unknown }, _component: unknown) {
        if (options.name === 'main' && options.inject) face = options.inject() as PanelProps
        return () => {}
      },
    },
    workspaces: { list: {
      getSnapshot: () => ({ items: [{ workspaceId: 'paper-workspace', title: '论文', path: 'F:/papers', sessionIds: [] }] }),
      subscribe: () => () => {},
    } },
    layout: { selectPanel() { navigation.abort() } },
    uiWorkspace: {
      startSession(workspaceId, options) {
        assert.equal(workspaceId, 'paper-workspace')
        navigation.abort()
        navigation = new AbortController()
        const request = navigation.signal
        pending = Promise.resolve().then(() => {
          if (!request.aborted) prepared = options
        })
      },
    },
    effect: () => () => {},
  }
  apply(ctx)
  assert.ok(face)
  face.prepare('paper-workspace', '待用户检查的医学汇报任务')
  await pending
  assert.deepEqual(prepared, { prompt: '待用户检查的医学汇报任务', clearPreviousDraft: false })
})
