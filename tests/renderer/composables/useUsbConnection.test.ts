import { describe, expect, it, vi } from 'vitest'
import { createUsbConnectionFlow } from '@renderer/composables/useUsbConnection'
import type { UsbConnectionResult } from '../../../src/shared/contracts/headset.contracts'
const connected = { status: 'connected', address: '192.168.0.10:5555', name: 'Quest 3' } as const
const devices = ['USB_A', 'USB_B'].map((serial) => ({
  serial,
  state: 'device' as const,
  rawState: 'device'
}))

describe('direct USB connection flow', () => {
  it('connects and saves a single headset without opening a selection', async () => {
    const request = vi.fn().mockResolvedValue(connected)
    const save = vi.fn().mockResolvedValue(true)
    const flow = createUsbConnectionFlow(request, save)
    await flow.connect()
    expect(request).toHaveBeenCalledWith(undefined)
    expect(save).toHaveBeenCalledWith(connected)
    expect(flow.devices.value).toEqual([])
    expect(flow.connected.value).toEqual(connected)
    expect(flow.busy.value).toBe(false)
  })
  it('waits for an explicit choice with multiple headsets and does not save on cancel', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'select', devices })
    const save = vi.fn()
    const flow = createUsbConnectionFlow(request, save)
    await flow.connect()
    expect(flow.devices.value).toEqual(devices)
    expect(save).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledOnce()
    flow.closeSelection()
    expect(flow.devices.value).toEqual([])
    expect(request).toHaveBeenCalledOnce()
  })
  it('passes the selected serial and closes selection while connecting', async () => {
    let finish!: (result: UsbConnectionResult) => void
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 'select', devices })
      .mockImplementationOnce(
        () =>
          new Promise<UsbConnectionResult>((resolve) => {
            finish = resolve
          })
      )
    const flow = createUsbConnectionFlow(request, vi.fn().mockResolvedValue(true))
    await flow.connect()
    const pending = flow.connect('USB_B')
    expect(request).toHaveBeenLastCalledWith('USB_B')
    expect(flow.busy.value).toBe(true)
    expect(flow.devices.value).toEqual([])
    await flow.connect('USB_A')
    expect(request).toHaveBeenCalledTimes(2)
    finish(connected)
    await pending
    expect(flow.connected.value).toEqual(connected)
  })
  it.each(['NO_USB', 'UNAUTHORIZED', 'TCPIP_FAILED', 'CONNECT_FAILED'] as const)(
    'reports %s inline without opening selection',
    async (code) => {
      const save = vi.fn()
      const flow = createUsbConnectionFlow(
        vi.fn().mockResolvedValue({ status: 'error', code }),
        save
      )
      await flow.connect()
      expect(flow.error.value).toBe(code)
      expect(flow.devices.value).toEqual([])
      expect(flow.connected.value).toBeNull()
      expect(flow.busy.value).toBe(false)
      expect(save).not.toHaveBeenCalled()
    }
  )
  it('unlocks after IPC failure and allows retry', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('IPC failed'))
      .mockResolvedValueOnce(connected)
    const flow = createUsbConnectionFlow(request, vi.fn().mockResolvedValue(true))
    await flow.connect()
    expect(flow.error.value).toBe('COMMAND_FAILED')
    expect(flow.busy.value).toBe(false)
    await flow.connect()
    expect(flow.error.value).toBeNull()
    expect(flow.connected.value).toEqual(connected)
  })
  it.each([false, new Error('write failed')])(
    'retries failed persistence without running tcpip again (%s)',
    async (failure) => {
      const request = vi.fn().mockResolvedValue(connected)
      const save = vi.fn()
      if (failure === false) save.mockResolvedValueOnce(false)
      else save.mockRejectedValueOnce(failure)
      save.mockResolvedValueOnce(true)
      const flow = createUsbConnectionFlow(request, save)
      await flow.connect()
      expect(flow.error.value).toBe('SAVE_FAILED')
      expect(flow.connected.value).toBeNull()
      await flow.connect()
      expect(request).toHaveBeenCalledOnce()
      expect(save).toHaveBeenCalledTimes(2)
      expect(flow.connected.value).toEqual(connected)
    }
  )
})
