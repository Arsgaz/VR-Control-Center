import {
  isStreamProfileCrop,
  isStreamProfileMaxFps,
  isStreamProfileMaxSize,
  isStreamProfileVideoBitRate,
  isStreamProfileVideoCodec
} from '../../../../shared/config/config.validation'
import type {
  NewStreamProfileConfig,
  StreamProfileConfig
} from '../../../../shared/contracts/config.contracts'
import { buildScrcpyArgs } from '../../../../shared/tools/scrcpy.args'

export interface StreamProfileDraft {
  id: string | null
  name: string
  description: string
  crop: string
  maxSize: string
  maxFps: string
  videoBitRate: string
  videoCodec: StreamProfileConfig['videoCodec']
  noAudio: boolean
}

export type StreamProfileValidationKey =
  | 'nameRequired'
  | 'nameUnique'
  | 'cropFormat'
  | 'maxSize'
  | 'maxFps'
  | 'videoBitRate'
  | 'videoCodec'

export const createProfileId = (): string => {
  return `profile-${globalThis.crypto.randomUUID()}`
}

export const createNewProfileDraft = (): StreamProfileDraft => ({
  id: null,
  name: '',
  description: '',
  crop: '',
  maxSize: '1280',
  maxFps: '30',
  videoBitRate: '6M',
  videoCodec: 'h264',
  noAudio: true
})

export const createDraftFromProfile = (profile: StreamProfileConfig): StreamProfileDraft => ({
  id: profile.id,
  name: profile.name,
  description: profile.description,
  crop: profile.crop,
  maxSize: profile.maxSize === null ? '' : String(profile.maxSize),
  maxFps: profile.maxFps === null ? '' : String(profile.maxFps),
  videoBitRate: profile.videoBitRate,
  videoCodec: profile.videoCodec,
  noAudio: profile.noAudio
})

const parseOptionalPositiveInteger = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return Number(trimmed)
}

export const validateStreamProfileDraft = (
  draft: StreamProfileDraft,
  profiles: StreamProfileConfig[]
): StreamProfileValidationKey | null => {
  const name = draft.name.trim()
  if (!name) {
    return 'nameRequired'
  }

  const duplicateName = profiles.some((profile) => {
    return profile.id !== draft.id && profile.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
  })
  if (duplicateName) {
    return 'nameUnique'
  }

  if (!isStreamProfileCrop(draft.crop)) {
    return 'cropFormat'
  }

  const maxSize = parseOptionalPositiveInteger(draft.maxSize)
  if (
    (draft.maxSize.trim() && !/^\d+$/.test(draft.maxSize.trim())) ||
    !isStreamProfileMaxSize(maxSize)
  ) {
    return 'maxSize'
  }

  const maxFps = parseOptionalPositiveInteger(draft.maxFps)
  if ((draft.maxFps.trim() && !/^\d+$/.test(draft.maxFps.trim())) || !isStreamProfileMaxFps(maxFps)) {
    return 'maxFps'
  }

  if (!isStreamProfileVideoBitRate(draft.videoBitRate)) {
    return 'videoBitRate'
  }

  if (!isStreamProfileVideoCodec(draft.videoCodec)) {
    return 'videoCodec'
  }

  return null
}

export const createProfilePayloadFromDraft = (
  draft: StreamProfileDraft,
  id = draft.id ?? createProfileId()
): NewStreamProfileConfig => ({
  id,
  name: draft.name.trim(),
  description: draft.description.trim(),
  crop: draft.crop.trim(),
  maxSize: parseOptionalPositiveInteger(draft.maxSize),
  maxFps: parseOptionalPositiveInteger(draft.maxFps),
  videoBitRate: draft.videoBitRate.trim(),
  videoCodec: draft.videoCodec,
  noAudio: draft.noAudio
})

export const createDuplicateProfilePayload = (
  profile: StreamProfileConfig,
  suffix: string,
  profiles: StreamProfileConfig[],
  id = createProfileId()
): NewStreamProfileConfig => {
  const baseName = `${profile.name} ${suffix}`.trim()
  let name = baseName
  let index = 2

  while (
    profiles.some((existingProfile) => {
      return existingProfile.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
    })
  ) {
    name = `${baseName} ${index}`
    index += 1
  }

  return {
    ...profile,
    id,
    name
  }
}

export const buildProfilePreviewArgs = (draft: StreamProfileDraft, address: string): string[] => {
  const payload = createProfilePayloadFromDraft(draft, draft.id ?? 'preview')
  return buildScrcpyArgs({
    address,
    crop: payload.crop,
    maxSize: payload.maxSize,
    maxFps: payload.maxFps,
    videoBitRate: payload.videoBitRate,
    videoCodec: payload.videoCodec,
    noAudio: payload.noAudio
  })
}
