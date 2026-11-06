import type { InstalledApplication } from '../contracts/applications.contracts'

// Arguments reach Android's shell as well as the local process: accept identifiers only.
export const isAndroidPackageName = (value: unknown): value is string => {
  return (
    typeof value === 'string' &&
    value.length <= 240 &&
    /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(value)
  )
}

export const parseLaunchableApplications = (
  output: string,
  category: string
): InstalledApplication[] => {
  const byPackage = new Map<string, InstalledApplication>()
  for (const line of output.split(/\r?\n/)) {
    const component = line.trim()
    const match = component.match(/^([^/]+)\/(\.?[A-Za-z_][A-Za-z0-9_.$]*)$/)
    if (!match || !isAndroidPackageName(match[1])) continue
    const packageName = match[1]
    if (!byPackage.has(packageName))
      byPackage.set(packageName, {
        packageName,
        component,
        category,
        name: packageName,
        imageDataUrl: null
      })
  }
  return [...byPackage.values()]
}

export const didApplicationLaunch = (
  exitCode: number | null,
  stdout: string,
  stderr: string
): boolean => {
  const output = `${stdout}\n${stderr}`
  return (
    exitCode === 0 &&
    !/(?:Error:|Exception|Permission Denial|unable to resolve|does not exist|Status:\s*(?!ok\b)\S+)/i.test(
      output
    ) &&
    /^\s*Status:\s*ok\s*$/im.test(output)
  )
}
