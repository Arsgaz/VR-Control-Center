import { ref } from 'vue'
import type {
  AdbDevice,
  UsbConnectionError,
  UsbConnectionResult
} from '../../../shared/contracts/headset.contracts'

type ConnectedUsb = Extract<UsbConnectionResult, { status: 'connected' }>
type SaveUsb = (result: ConnectedUsb) => Promise<boolean>

export const createUsbConnectionFlow = (
  request: (serial?: string) => Promise<UsbConnectionResult>,
  save: SaveUsb
) => {
  const busy = ref(false)
  const devices = ref<AdbDevice[]>([])
  const error = ref<UsbConnectionError | 'SAVE_FAILED' | null>(null)
  const connected = ref<ConnectedUsb | null>(null)
  // Retrying a failed save must not restart an already verified USB/Wi-Fi connection.
  let verified: ConnectedUsb | null = null
  const connect = async (serial?: string): Promise<void> => {
    if (busy.value) return
    busy.value = true
    error.value = null
    connected.value = null
    devices.value = []
    try {
      const result = verified ?? (await request(serial))
      if (result.status === 'select') {
        devices.value = result.devices
      } else if (result.status === 'error') {
        error.value = result.code
      } else {
        verified = result
        try {
          if (await save(result)) {
            connected.value = result
            verified = null
          } else error.value = 'SAVE_FAILED'
        } catch {
          error.value = 'SAVE_FAILED'
        }
      }
    } catch {
      error.value = 'COMMAND_FAILED'
    } finally {
      busy.value = false
    }
  }
  const closeSelection = (): void => {
    if (!busy.value) devices.value = []
  }
  return { busy, devices, error, connected, connect, closeSelection }
}

// Keep an in-flight request and its feedback when the operator switches sections.
let shared: ReturnType<typeof createUsbConnectionFlow> | null = null
export const useUsbConnection = (save: SaveUsb) => {
  shared ??= createUsbConnectionFlow((serial) => window.vrControl.headset.connectUsb(serial), save)
  return shared
}
