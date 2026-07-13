export interface ForegroundApplicationInfo {
  packageName: string | null
  activityName: string | null
}

const emptyForeground = (): ForegroundApplicationInfo => ({
  packageName: null,
  activityName: null
})

const parseComponent = (component: string): ForegroundApplicationInfo | null => {
  const cleaned = component
    .replace(/[{}]/g, '')
    .split(/\s+/)
    .find((part) => part.includes('/'))

  if (!cleaned) {
    return null
  }

  const [packageName, activityPart] = cleaned.split('/')
  if (!packageName || !activityPart) {
    return null
  }

  const activityName = activityPart.startsWith('.') ? `${packageName}${activityPart}` : activityPart
  return {
    packageName,
    activityName
  }
}

export const parseForegroundFromActivityDumpsys = (
  stdout: string
): ForegroundApplicationInfo => {
  const patterns = [
    /topResumedActivity[^\n]*?([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)/i,
    /mResumedActivity[^\n]*?([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)/i,
    /resumed activity[^\n]*?([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)/i,
    /ActivityRecord\{[^\n]*?\s([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)\s/i
  ]

  for (const pattern of patterns) {
    const match = stdout.match(pattern)
    const parsed = match?.[1] ? parseComponent(match[1]) : null
    if (parsed) {
      return parsed
    }
  }

  return emptyForeground()
}

export const parseForegroundFromWindowDumpsys = (stdout: string): ForegroundApplicationInfo => {
  const patterns = [
    /mCurrentFocus[^\n]*?([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)/i,
    /mFocusedApp[^\n]*?([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)/i,
    /Window\{[^\n]*?\s([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)\}/i
  ]

  for (const pattern of patterns) {
    const match = stdout.match(pattern)
    const parsed = match?.[1] ? parseComponent(match[1]) : null
    if (parsed) {
      return parsed
    }
  }

  return emptyForeground()
}
