import { describe, expect, it } from 'vitest'
import {
  parseForegroundFromActivityDumpsys,
  parseForegroundFromWindowDumpsys
} from './foreground.parser'

describe('foreground parser', () => {
  it('parses topResumedActivity', () => {
    expect(
      parseForegroundFromActivityDumpsys(
        'topResumedActivity=ActivityRecord{abc u0 com.beatgames.beatsaber/.MainActivity t42}'
      )
    ).toEqual({
      packageName: 'com.beatgames.beatsaber',
      activityName: 'com.beatgames.beatsaber.MainActivity'
    })
  })

  it('parses mResumedActivity', () => {
    expect(
      parseForegroundFromActivityDumpsys(
        'mResumedActivity: ActivityRecord{abc u0 com.meta.shell/com.meta.shell.HomeActivity t1}'
      )
    ).toEqual({
      packageName: 'com.meta.shell',
      activityName: 'com.meta.shell.HomeActivity'
    })
  })

  it('parses fallback window focus', () => {
    expect(
      parseForegroundFromWindowDumpsys(
        'mCurrentFocus=Window{abc u0 com.example.game/com.example.game.GameActivity}'
      )
    ).toEqual({
      packageName: 'com.example.game',
      activityName: 'com.example.game.GameActivity'
    })
  })

  it('returns null fields for unknown format', () => {
    expect(parseForegroundFromActivityDumpsys('no foreground here')).toEqual({
      packageName: null,
      activityName: null
    })
  })
})
