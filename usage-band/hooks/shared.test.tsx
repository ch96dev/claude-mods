import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 3,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 3 },
    view: {},
  },
} as const

const FILE = '/data/usage-band/latest.json'

// The engine hands paths on resolved (C:\data\... on Windows): compare them
// without the drive and with forward slashes.
const norm = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')

function engine(on: any, files: Map<string, string>, rateLimits: unknown[], now: number) {
  on('process.hookEnv', () => ({ value: { CLAUDE_PLUGIN_DATA: '/data/usage-band' } }))
  on('fs.read', (_: unknown, e: { path: string }) => {
    const text = files.get(norm(e.path))
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.write', (_: unknown, e: { path: string; text: string }) => {
    files.set(norm(e.path), e.text)
    return { value: undefined }
  })
  on('clock.now', () => ({ value: now }))
  on('clock.every', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.measure', (_: unknown, e: { changed: unknown }) => ({ changed: e.changed }))
}

test('대기 중인 세션은 다른 세션이 공유한 최신 값을 보여준다', async ($, on) => {
  const files = new Map([[FILE, JSON.stringify({ limits: [{ kind: 'five_hour', percentUsed: 64 }], at: 5_000 })]])
  // This session's own (stale) reading says 20%.
  engine(on, files, [{ kind: 'five_hour', percentUsed: 20 }], 10_000)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /%$/ }))?.text).toBe('64%')
  await ui.unmount()
})

test('응답으로 받은 새 값은 공유 파일에 기록된다', async ($, on) => {
  const files = new Map<string, string>([[FILE, JSON.stringify({ limits: [{ kind: 'five_hour', percentUsed: 10 }], at: 1_000 })]])
  engine(on, files, [], 9_000)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 33 }],
    changed: ['rateLimits'],
  })

  const saved = JSON.parse(files.get(FILE) ?? '{}')
  expect(saved.limits[0].percentUsed).toBe(33)
  expect(saved.at).toBe(9_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /%$/ }))?.text).toBe('33%')
  await ui.unmount()
})

test('공유 파일이 더 최신이면 덮어쓰지 않는다', async ($, on) => {
  const newer = JSON.stringify({ limits: [{ kind: 'five_hour', percentUsed: 80 }], at: 50_000 })
  const files = new Map<string, string>([[FILE, newer]])
  engine(on, files, [], 9_000)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 33 }],
    changed: ['rateLimits'],
  })

  expect(files.get(FILE)).toBe(newer)
})
