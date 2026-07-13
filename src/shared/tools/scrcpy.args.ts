import type { ScrcpyStartOptions } from '../contracts/headset.contracts'

export const buildScrcpyArgs = (options: ScrcpyStartOptions): string[] => {
  const args = ['--serial', options.address]

  if (options.noAudio) {
    args.push('--no-audio')
  }

  const crop = options.crop?.trim()
  if (crop) {
    args.push('--crop', crop)
  }

  return args
}
