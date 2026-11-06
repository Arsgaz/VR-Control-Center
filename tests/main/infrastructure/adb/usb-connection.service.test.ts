import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UsbConnectionService,
  parseWifiAddress
} from '@main/infrastructure/adb/usb-connection.service'
import { runCommand } from '@main/infrastructure/process/process-runner'
import { listAdbDevices, connectAdbDevice } from '@main/infrastructure/adb/adb.service'

vi.mock('@main/infrastructure/process/process-runner', () => ({ runCommand: vi.fn() }))
vi.mock('@main/infrastructure/adb/adb.service', () => ({
  listAdbDevices: vi.fn(),
  connectAdbDevice: vi.fn()
}))
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }))
const resolver = { adb: () => 'adb', scrcpy: () => 'scrcpy' }
const usb = { serial: 'USB_A', state: 'device' as const, rawState: 'device' }
const listed = (devices = [usb]) => ({ devices, stdout: '', stderr: '' })
const output = (stdout: string) => ({ stdout, stderr: '', exitCode: 0, signal: null })
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listAdbDevices).mockResolvedValue(listed())
  vi.mocked(connectAdbDevice).mockResolvedValue({ ok: true, message: '', stdout: '', stderr: '' })
  vi.mocked(runCommand).mockImplementation(async (_, args) => {
    const command = args.slice(2).join(' ')
    if (command === 'get-devpath') return output('usb:1-2')
    if (command === 'shell getprop ro.serialno') return output('hardware-A')
    if (command === 'shell getprop ro.product.model') return output('Quest 3')
    if (command.startsWith('shell ip '))
      return output('4: wlan0 inet 192.168.1.7/24 brd 192.168.1.255')
    if (command === 'tcpip 5555') return output('restarting in TCP mode port: 5555')
    throw new Error('Unexpected command')
  })
})
describe('USB Wi-Fi setup', () => {
  it('targets USB explicitly and verifies the same headset over Wi-Fi', async () => {
    expect(await new UsbConnectionService().connect(resolver)).toEqual({
      status: 'connected',
      address: '192.168.1.7:5555',
      name: 'Quest 3'
    })
    expect(runCommand).toHaveBeenCalledWith(
      'adb',
      ['-s', 'USB_A', 'tcpip', '5555'],
      expect.anything()
    )
    expect(runCommand).toHaveBeenCalledWith(
      'adb',
      ['-s', '192.168.1.7:5555', 'shell', 'getprop', 'ro.serialno'],
      expect.anything()
    )
  })
  it.each(['unknown', '/dev/bus/usb/001/002'])(
    'supports Windows and libusb device paths: %s',
    async (path) => {
      const original = vi.mocked(runCommand).getMockImplementation()!
      vi.mocked(runCommand).mockImplementation((exe, args, options) =>
        args[2] === 'get-devpath' ? Promise.resolve(output(path)) : original(exe, args, options)
      )
      expect((await new UsbConnectionService().connect(resolver)).status).toBe('connected')
    }
  )
  it('rejects a non-USB device path before enabling TCP/IP', async () => {
    vi.mocked(runCommand).mockResolvedValue(output('local:socket'))
    expect(await new UsbConnectionService().connect(resolver)).toEqual({
      status: 'error',
      code: 'DEVICE_CHANGED'
    })
    expect(runCommand).toHaveBeenCalledTimes(1)
  })
  it('does not enable TCP/IP when Wi-Fi is missing', async () => {
    const original = vi.mocked(runCommand).getMockImplementation()!
    vi.mocked(runCommand).mockImplementation((exe, args, options) =>
      args.includes('ip') ? Promise.resolve(output('')) : original(exe, args, options)
    )
    expect(await new UsbConnectionService().connect(resolver)).toEqual({
      status: 'error',
      code: 'NO_WIFI'
    })
    expect(runCommand).not.toHaveBeenCalledWith(
      'adb',
      expect.arrayContaining(['tcpip']),
      expect.anything()
    )
  })
  it('releases its lock after an ADB process failure', async () => {
    const service = new UsbConnectionService()
    vi.mocked(listAdbDevices).mockRejectedValueOnce(new Error('ADB unavailable'))
    expect(await service.connect(resolver)).toEqual({ status: 'error', code: 'COMMAND_FAILED' })
    expect((await service.connect(resolver)).status).toBe('connected')
  })
  it('asks for selection without mutating any device', async () => {
    vi.mocked(listAdbDevices).mockResolvedValue(listed([usb, { ...usb, serial: 'USB_B' }]))
    expect((await new UsbConnectionService().connect(resolver)).status).toBe('select')
    expect(runCommand).not.toHaveBeenCalled()
    await new UsbConnectionService().connect(resolver, 'USB_B')
    expect(runCommand).toHaveBeenCalledWith(
      'adb',
      ['-s', 'USB_B', 'tcpip', '5555'],
      expect.anything()
    )
  })
  it('does not treat network or emulator transports as USB', async () => {
    vi.mocked(listAdbDevices).mockResolvedValue(
      listed(
        ['10.0.0.1:5555', 'emulator-5554', 'adb-test._adb-tls-connect._tcp'].map((serial) => ({
          ...usb,
          serial
        }))
      )
    )
    expect(await new UsbConnectionService().connect(resolver)).toEqual({
      status: 'error',
      code: 'NO_USB'
    })
    expect(runCommand).not.toHaveBeenCalled()
  })
  it('rejects a selection that disappeared instead of using another headset', async () => {
    expect(await new UsbConnectionService().connect(resolver, 'USB_B')).toEqual({
      status: 'error',
      code: 'DEVICE_CHANGED'
    })
    expect(runCommand).not.toHaveBeenCalled()
  })
  it('requires USB authorization', async () => {
    vi.mocked(listAdbDevices).mockResolvedValue({
      ...listed(),
      devices: [{ ...usb, state: 'unauthorized', rawState: 'unauthorized' }]
    })
    expect(await new UsbConnectionService().connect(resolver)).toEqual({
      status: 'error',
      code: 'UNAUTHORIZED'
    })
    expect(runCommand).not.toHaveBeenCalled()
  })
  it('rejects a network endpoint with another hardware identity', async () => {
    const original = vi.mocked(runCommand).getMockImplementation()!
    vi.mocked(runCommand).mockImplementation((exe, args, options) =>
      args[1].includes(':') ? Promise.resolve(output('hardware-B')) : original(exe, args, options)
    )
    expect(await new UsbConnectionService().connect(resolver)).toEqual({
      status: 'error',
      code: 'DEVICE_CHANGED'
    })
  })
  it('retries a restarting daemon but gives up after five attempts', async () => {
    vi.mocked(connectAdbDevice).mockResolvedValue({
      ok: false,
      message: '',
      stdout: '',
      stderr: ''
    })
    expect(await new UsbConnectionService().connect(resolver)).toEqual({
      status: 'error',
      code: 'CONNECT_FAILED'
    })
    expect(connectAdbDevice).toHaveBeenCalledTimes(5)
  })
  it('blocks overlapping requests and releases the lock after failure', async () => {
    const service = new UsbConnectionService()
    const first = service.connect(resolver)
    expect(await service.connect(resolver)).toEqual({ status: 'error', code: 'BUSY' })
    await first
    expect((await service.connect(resolver)).status).toBe('connected')
  })
  it('refuses ambiguous or missing Wi-Fi addresses', () => {
    expect(parseWifiAddress('inet 192.168.1.7/24')).toBe('192.168.1.7')
    expect(parseWifiAddress('inet 127.0.0.1/8')).toBeNull()
    expect(parseWifiAddress('inet 192.168.1.7/24\ninet 10.0.0.2/24')).toBeNull()
  })
})
