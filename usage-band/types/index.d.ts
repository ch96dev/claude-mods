export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Reading = { limits: Limit[]; at: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { reading: Reading | null }
  }
}
