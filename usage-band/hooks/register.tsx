import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit, Reading } from '../types'

const reading = atom({ plugin: 'usage-band', key: 'reading' } as const, null)

const LABELS: Record<string, string> = {
  five_hour: '5시간',
  seven_day: '주간',
}

const BAR = 12

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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const { rateLimits } = await $.session.usage()
    const first: Reading = { limits: copy(rateLimits), at: await $.clock.now() }
    await update($, reading, () => first)

    // Refresh every minute so the reset countdown stays current.
    $.clock.every(60_000, async () => {
      const usage = await $.session.usage()
      const fresh: Reading = { limits: copy(usage.rateLimits), at: await $.clock.now() }
      await update($, reading, () => fresh)
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0) {
      const fresh: Reading = { limits: copy(e.rateLimits), at: await $.clock.now() }
      await update($, reading, () => fresh)
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
