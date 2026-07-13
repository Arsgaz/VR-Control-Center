import type { ArenaApi } from '../shared/contracts/app.contracts'

declare global {
  interface Window {
    arena: ArenaApi
  }
}

export {}
