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
    ).toEqual(['--serial', '192.168.1.10:5555', '--no-audio', '--crop', '1600:900:0:0'])
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
})
