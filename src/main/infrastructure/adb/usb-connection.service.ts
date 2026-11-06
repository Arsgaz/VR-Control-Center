import { setTimeout as delay } from 'node:timers/promises'
import { isIP } from 'node:net'
import type { UsbConnectionResult } from '@shared/contracts/headset.contracts'
import type { BinaryResolver } from '@main/infrastructure/binaries/binary-resolver'
import { runCommand } from '@main/infrastructure/process/process-runner'
import { listAdbDevices, connectAdbDevice } from './adb.service'
import { logger } from '@main/infrastructure/logging/logger'

export const parseWifiAddress = (output: string): string | null => {
  const addresses = [...output.matchAll(/\binet\s+(\d+\.\d+\.\d+\.\d+)\//g)]
    .map((match) => match[1])
    .filter((ip) => isIP(ip) === 4 && !/^(0|127|169\.254)\./.test(ip))
  return addresses.length === 1 ? addresses[0] : null
}

export class UsbConnectionService {
  private busy = false

  public async connect(resolver: BinaryResolver, serial?: unknown): Promise<UsbConnectionResult> {
    if (this.busy) return { status: 'error', code: 'BUSY' }
    this.busy = true
    try {
      const { devices } = await listAdbDevices(resolver)
      // TCP/IP, mDNS and emulator transports must never receive tcpip here.
      const usb = devices.filter(
        (device) => /^[A-Za-z0-9_-]+$/.test(device.serial) && !device.serial.startsWith('emulator-')
      )
      if (!usb.length) return { status: 'error', code: 'NO_USB' }
      if (serial === undefined && usb.length > 1) return { status: 'select', devices: usb }
      const selected =
        serial === undefined ? usb[0] : usb.find((device) => device.serial === serial)
      if (!selected) return { status: 'error', code: 'DEVICE_CHANGED' }
      if (selected.state === 'unauthorized') return { status: 'error', code: 'UNAUTHORIZED' }
      if (selected.state !== 'device') return { status: 'error', code: 'OFFLINE' }
      const command = async (target: string, args: string[]): Promise<string> => {
        const result = await runCommand(resolver.adb(), ['-s', target, ...args], {
          timeoutMs: 10_000
        })
        if (result.exitCode !== 0)
          throw new Error(result.stderr || result.stdout || 'ADB command failed')
        return result.stdout.trim()
      }
      const target = selected.serial
      const devpath = await command(target, ['get-devpath'])
      // Native Windows ADB can return 'unknown'; libusb uses /dev/bus/usb/.
      // Network/mDNS/emulator serials were excluded above, including on Windows.
      if (
        devpath !== 'unknown' &&
        !devpath.startsWith('usb:') &&
        !devpath.startsWith('/dev/bus/usb/')
      ) {
        return { status: 'error', code: 'DEVICE_CHANGED' }
      }
      const identity = await command(target, ['shell', 'getprop', 'ro.serialno'])
      if (!identity) return { status: 'error', code: 'DEVICE_CHANGED' }
      const model = await command(target, ['shell', 'getprop', 'ro.product.model'])
      const ip = parseWifiAddress(
        await command(target, ['shell', 'ip', '-o', '-4', 'addr', 'show', 'dev', 'wlan0'])
      )
      if (!ip) return { status: 'error', code: 'NO_WIFI' }
      const result = await command(target, ['tcpip', '5555'])
      if (!/restarting in TCP mode port:\s*5555/i.test(result))
        return { status: 'error', code: 'TCPIP_FAILED' }
      const address = `${ip}:5555`
      // adbd restarts asynchronously; verify the network endpoint belongs to this USB headset.
      for (let attempt = 0; attempt < 5; attempt++) {
        await delay(1000)
        try {
          if (!(await connectAdbDevice(address, resolver)).ok) continue
          if ((await command(address, ['shell', 'getprop', 'ro.serialno'])) !== identity) {
            return { status: 'error', code: 'DEVICE_CHANGED' }
          }
          return { status: 'connected', address, name: model || 'Quest' }
        } catch (error) {
          logger.debug('USB Wi-Fi connection not ready', { attempt, error: String(error) })
        }
      }
      return { status: 'error', code: 'CONNECT_FAILED' }
    } catch (error) {
      logger.errorWithCause('USB Wi-Fi setup failed', error)
      return { status: 'error', code: 'COMMAND_FAILED' }
    } finally {
      this.busy = false
    }
  }
}
