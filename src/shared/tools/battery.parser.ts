export type BatteryStatus = 'unknown' | 'charging' | 'discharging' | 'not-charging' | 'full' | null

export interface BatteryInfo {
  level: number | null
  status: BatteryStatus
  acPowered: boolean | null
  usbPowered: boolean | null
  wirelessPowered: boolean | null
  isCharging: boolean | null
  voltageMillivolts: number | null
  temperatureCelsius: number | null
}

const emptyBatteryInfo = (): BatteryInfo => ({
  level: null,
  status: null,
  acPowered: null,
  usbPowered: null,
  wirelessPowered: null,
  isCharging: null,
  voltageMillivolts: null,
  temperatureCelsius: null
})

export const parseBatteryStatus = (value: number | null): BatteryStatus => {
  if (value === 1) return 'unknown'
  if (value === 2) return 'charging'
  if (value === 3) return 'discharging'
  if (value === 4) return 'not-charging'
  if (value === 5) return 'full'
  return null
}

const parseBoolean = (value: string | undefined): boolean | null => {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

const parseNumber = (value: string | undefined): number | null => {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const parseBatteryDumpsys = (stdout: string): BatteryInfo => {
  const info = emptyBatteryInfo()

  for (const line of stdout.split(/\r?\n/)) {
    const match = line.trim().match(/^([^:]+):\s*(.+)$/)
    if (!match) {
      continue
    }

    const key = match[1].trim().toLowerCase()
    const value = match[2].trim()

    if (key === 'level') info.level = parseNumber(value)
    if (key === 'status') info.status = parseBatteryStatus(parseNumber(value))
    if (key === 'ac powered') info.acPowered = parseBoolean(value)
    if (key === 'usb powered') info.usbPowered = parseBoolean(value)
    if (key === 'wireless powered') info.wirelessPowered = parseBoolean(value)
    if (key === 'voltage') info.voltageMillivolts = parseNumber(value)
    if (key === 'temperature') {
      const temperature = parseNumber(value)
      info.temperatureCelsius = temperature === null ? null : temperature / 10
    }
  }

  const hasChargingSignals =
    info.status !== null ||
    info.acPowered !== null ||
    info.usbPowered !== null ||
    info.wirelessPowered !== null

  info.isCharging = hasChargingSignals
    ? info.status === 'charging' ||
      info.status === 'full' ||
      info.acPowered === true ||
      info.usbPowered === true ||
      info.wirelessPowered === true
    : null

  return info
}
