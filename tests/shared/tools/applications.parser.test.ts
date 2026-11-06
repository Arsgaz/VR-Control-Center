import { describe, expect, it } from 'vitest'
import {
  didApplicationLaunch,
  isAndroidPackageName,
  parseLaunchableApplications
} from '@shared/tools/applications.parser'

describe('application discovery and launch parsing', () => {
  it('parses short and full component names and deduplicates packages', () => {
    expect(
      parseLaunchableApplications(
        '2 activities found:\n com.beatgames.beatsaber/com.unity3d.player.UnityPlayerActivity\ncom.example.game/.MainActivity\ncom.example.game/.OtherActivity\n',
        'launcher'
      ).map((app) => app.component)
    ).toEqual([
      'com.beatgames.beatsaber/com.unity3d.player.UnityPlayerActivity',
      'com.example.game/.MainActivity'
    ])
  })
  it('does not turn shell errors or malicious output into launch targets', () => {
    expect(
      parseLaunchableApplications(
        'No activities found\nError: package manager failed\ncom.example;reboot/.Main\ncom.example/$(reboot)\n',
        'launcher'
      )
    ).toEqual([])
    for (const value of ['../test', 'com.example;reboot', 'com.example\nreboot', '-n', null])
      expect(isAndroidPackageName(value)).toBe(false)
  })
  it('accepts Android package variants and nested activity classes', () => {
    expect(isAndroidPackageName('com.company.mrf.game_2')).toBe(true)
    expect(
      parseLaunchableApplications('com.company.game/com.company.Main$Nested', 'launcher')
    ).toHaveLength(1)
  })
  it('requires am to confirm a successful launch, including Android zero-exit errors', () => {
    expect(
      didApplicationLaunch(0, 'Starting: Intent\nStatus: ok\nActivity: com.example/.Main', '')
    ).toBe(true)
    expect(
      didApplicationLaunch(0, 'Error: Activity not started, unable to resolve Intent', '')
    ).toBe(false)
    expect(didApplicationLaunch(0, 'Status: timeout', '')).toBe(false)
    expect(didApplicationLaunch(0, 'Status: ok', 'SecurityException: Permission Denial')).toBe(
      false
    )
    expect(didApplicationLaunch(1, 'Status: ok', '')).toBe(false)
    expect(didApplicationLaunch(0, 'Starting: Intent', '')).toBe(false)
  })
})
