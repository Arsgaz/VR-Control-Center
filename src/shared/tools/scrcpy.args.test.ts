import { describe, expect, it } from 'vitest'
import { buildScrcpyArgs } from './scrcpy.args'

describe('buildScrcpyArgs', () => {
  it('builds args for a device with audio disabled', () => {
    expect(
      buildScrcpyArgs({
        address: '192.168.1.10:5555',
        noAudio: true
      })
    ).toEqual(['--serial', '192.168.1.10:5555', '--no-audio'])
  })

  it('adds crop when it is not empty', () => {
    expect(
      buildScrcpyArgs({
        address: '192.168.1.10:5555',
        crop: '1600:900:0:0',
        noAudio: true
      })
    ).toEqual(['--serial', '192.168.1.10:5555', '--crop', '1600:900:0:0', '--no-audio'])
  })

  it('adds structured video profile arguments', () => {
    expect(
      buildScrcpyArgs({
        address: '192.168.1.10:5555',
        crop: '1600:900:0:0',
        maxSize: 1280,
        maxFps: 30,
        videoBitRate: '6M',
        videoCodec: 'h264',
        noAudio: true
      })
    ).toEqual([
      '--serial',
      '192.168.1.10:5555',
      '--crop',
      '1600:900:0:0',
      '--max-size',
      '1280',
      '--max-fps',
      '30',
      '--video-bit-rate',
      '6M',
      '--video-codec',
      'h264',
      '--no-audio'
    ])
  })

  it('does not pass crop when it is empty', () => {
    expect(
      buildScrcpyArgs({
        address: '192.168.1.10:5555',
        crop: '   ',
        noAudio: false
      })
    ).toEqual(['--serial', '192.168.1.10:5555'])
  })

  it('does not add no-audio when headset audio retention is disabled', () => {
    expect(
      buildScrcpyArgs({
        address: '192.168.1.10:5555',
        videoCodec: 'h265',
        noAudio: false
      })
    ).toEqual(['--serial', '192.168.1.10:5555', '--video-codec', 'h265'])
  })
})
