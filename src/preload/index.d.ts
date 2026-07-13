import type { VrControlApi } from '../shared/contracts/app.contracts'

declare global {
  interface Window {
    vrControl: VrControlApi
  }
}

export {}
