export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

// `at`: when an API response reported these limits (in any session).
// `checkedAt`: when this session last looked, so the countdown redraws.
export type Reading = { limits: Limit[]; at: number; checkedAt?: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { reading: Reading | null }
  }
}
