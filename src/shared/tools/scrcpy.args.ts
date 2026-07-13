import type { ScrcpyStartOptions } from '../contracts/headset.contracts'

export const buildScrcpyArgs = (options: ScrcpyStartOptions): string[] => {
  const args = ['--serial', options.address]

  const crop = options.crop?.trim()
  if (crop) {
    args.push('--crop', crop)
  }

  if (options.maxSize !== null && options.maxSize !== undefined) {
    args.push('--max-size', String(options.maxSize))
  }

  if (options.maxFps !== null && options.maxFps !== undefined) {
    args.push('--max-fps', String(options.maxFps))
  }

  const videoBitRate = options.videoBitRate?.trim()
  if (videoBitRate) {
    args.push('--video-bit-rate', videoBitRate)
  }

  if (options.videoCodec) {
    args.push('--video-codec', options.videoCodec)
  }

  if (options.noAudio) {
    args.push('--no-audio')
  }

  return args
}
