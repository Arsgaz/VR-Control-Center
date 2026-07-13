import { describe, expect, it } from 'vitest'
import type { StreamProfileConfig } from '../../../../shared/contracts/config.contracts'
import {
  buildProfilePreviewArgs,
  createDraftFromProfile,
  createDuplicateProfilePayload,
  createNewProfileDraft,
  createProfilePayloadFromDraft,
  validateStreamProfileDraft
} from './stream-profile-editor.model'

const profile: StreamProfileConfig = {
  id: 'balanced',
  name: 'Balanced',
  description: '',
  crop: '',
  maxSize: 1280,
  maxFps: 30,
  videoBitRate: '6M',
  videoCodec: 'h264',
  noAudio: true
}

describe('stream profile editor model', () => {
  it('validates profile name uniqueness case-insensitively', () => {
    const draft = createNewProfileDraft()
    draft.name = 'balanced'

    expect(validateStreamProfileDraft(draft, [profile])).toBe('nameUnique')
  })

  it('validates crop, max size, max fps and bitrate', () => {
    const draft = createNewProfileDraft()
    draft.name = 'Fast'
    draft.crop = '1600:0:0:0'
    expect(validateStreamProfileDraft(draft, [])).toBe('cropFormat')

    draft.crop = ''
    draft.maxSize = '0'
    expect(validateStreamProfileDraft(draft, [])).toBe('maxSize')

    draft.maxSize = '1280'
    draft.maxFps = 'abc'
    expect(validateStreamProfileDraft(draft, [])).toBe('maxFps')

    draft.maxFps = '60'
    draft.videoBitRate = 'fast'
    expect(validateStreamProfileDraft(draft, [])).toBe('videoBitRate')
  })

  it('creates a structured payload from a draft', () => {
    const draft = createNewProfileDraft()
    draft.name = 'Fast'
    draft.description = '  note  '
    draft.maxSize = ''
    draft.maxFps = '72'
    draft.noAudio = false

    expect(createProfilePayloadFromDraft(draft, 'fast')).toEqual({
      id: 'fast',
      name: 'Fast',
      description: 'note',
      crop: '',
      maxSize: null,
      maxFps: 72,
      videoBitRate: '6M',
      videoCodec: 'h264',
      noAudio: false
    })
  })

  it('duplicates a profile with a localized suffix and unique name', () => {
    const duplicate = createDuplicateProfilePayload(profile, 'Copy', [
      profile,
      { ...profile, id: 'balanced-copy', name: 'Balanced Copy' }
    ], 'copy-2')

    expect(duplicate.id).toBe('copy-2')
    expect(duplicate.name).toBe('Balanced Copy 2')
    expect(duplicate.crop).toBe(profile.crop)
  })

  it('builds preview args through the shared scrcpy builder', () => {
    const draft = createDraftFromProfile({
      ...profile,
      crop: '1600:900:0:0',
      videoCodec: 'h265'
    })

    expect(buildProfilePreviewArgs(draft, '<device-address>')).toEqual([
      '--serial',
      '<device-address>',
      '--crop',
      '1600:900:0:0',
      '--max-size',
      '1280',
      '--max-fps',
      '30',
      '--video-bit-rate',
      '6M',
      '--video-codec',
      'h265',
      '--no-audio'
    ])
  })
})
