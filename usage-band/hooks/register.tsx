import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Reading } from '../types'

const reading = atom({ plugin: 'usage-band', key: 'reading' } as const, null)

const LABELS: Record<string, string> = {
  five_hour: '5시간',
  seven_day: '주간',
}

const BAR = 12
const POLL_MS = 30_000

function bar(percent: number): string {
  const filled = Math.max(0, Math.min(BAR, Math.round((percent / 100) * BAR)))
  return '█'.repeat(filled) + '░'.repeat(BAR - filled)
}

function color(percent: number): 'success' | 'warning' | 'error' {
  if (percent >= 90) return 'error'
  if (percent >= 70) return 'warning'
  return 'success'
}

function untilReset(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const text = days > 0 ? `${days}일 ${hours}시간` : hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`
  return `${text} 후 초기화`
}

function copy(limits: readonly Limit[]): Limit[] {
  return limits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
}

// --- Shared file: every session of this plugin reads and writes the same one.

let sharedPath: string | undefined

async function shared($: EngineInterface): Promise<string> {
  if (!sharedPath) {
    const env = await $.process.hookEnv()
    sharedPath = `${env.CLAUDE_PLUGIN_DATA}/latest.json`
  }
  return sharedPath
}

function parse(text: string): Reading | null {
  try {
    const v = JSON.parse(text) as { limits?: unknown; at?: unknown }
    if (!Array.isArray(v.limits) || typeof v.at !== 'number') return null
    const limits = v.limits
      .filter(
        (l): l is Limit =>
          typeof l === 'object' && l !== null && typeof l.kind === 'string' && typeof l.percentUsed === 'number',
      )
      .map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: typeof l.resetsAt === 'string' ? l.resetsAt : undefined }))
    return { limits, at: v.at }
  } catch {
    return null
  }
}

async function readShared($: EngineInterface): Promise<Reading | null> {
  try {
    return parse(await $.fs.read(await shared($)))
  } catch {
    return null // no file yet, or unreadable
  }
}

// A fresh reading from this session's own API response: keep it and share it
// unless the file already holds a newer one.
async function publish($: EngineInterface, fresh: Reading): Promise<void> {
  await update($, reading, cur => (cur && cur.at > fresh.at ? cur : fresh))
  try {
    const onDisk = await readShared($)
    if (!onDisk || onDisk.at < fresh.at) {
      await $.fs.write(await shared($), JSON.stringify({ limits: fresh.limits, at: fresh.at }))
    }
  } catch {
    // Sharing is best effort; this session still shows its own reading.
  }
}

// Take the file's reading when it is newer than ours; touch `checkedAt` either
// way so the reset countdown redraws.
async function pull($: EngineInterface): Promise<void> {
  const onDisk = await readShared($)
  const now = await $.clock.now()
  await update($, reading, cur => {
    const best = onDisk && (!cur || onDisk.at > cur.at) ? onDisk : cur
    return best ? { ...best, checkedAt: now } : null
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Start from whatever another session last shared.
    await pull($)

    const { rateLimits } = await $.session.usage()
    const cur = await read($, reading)
    if (rateLimits.length > 0 && !cur) {
      await update($, reading, () => ({ limits: copy(rateLimits), at: 0 }))
    }

    $.clock.every(POLL_MS, () => pull($))

    return next(e)
  })

  // Fires after each turn with the limits the last response reported: fresh.
  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0) {
      await publish($, { limits: copy(e.rateLimits), at: await $.clock.now() })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, reading)
    const shown = (r?.limits ?? []).filter(l => l.kind in LABELS)

    if (shown.length === 0) {
      return (
        <Box>
          <Text dimColor>사용량: 첫 응답 후 표시됩니다</Text>
        </Box>
      )
    }

    const now = await $.clock.now()

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
        {shown.map(l => (
          <Box key={l.kind} flexDirection="row" gap={1}>
            <Text bold>{LABELS[l.kind]}</Text>
            <Text color={color(l.percentUsed)}>{bar(l.percentUsed)}</Text>
            <Text>{`${Math.round(l.percentUsed)}%`}</Text>
            <Text dimColor>{untilReset(l.resetsAt, now)}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
