export const APPLICATIONS_IPC_CHANNELS = {
  list: 'applications:list',
  launch: 'applications:launch',
  artwork: 'applications:artwork'
} as const

export interface InstalledApplication {
  packageName: string
  component: string
  category: string
  name: string
  imageDataUrl: string | null
}

export interface ApplicationMetadata {
  name: string | null
  imageDataUrl: string | null
}

export type ApplicationErrorCode =
  | 'INVALID_REQUEST'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_NOT_CONNECTED'
  | 'LIST_FAILED'
  | 'APP_NOT_FOUND'
  | 'LAUNCH_FAILED'
  | 'ARTWORK_FAILED'
export type ApplicationResult<T> =
  { ok: true; value: T } | { ok: false; error: { code: ApplicationErrorCode } }

export interface ApplicationsApi {
  list: (deviceId: string) => Promise<ApplicationResult<InstalledApplication[]>>
  launch: (
    deviceId: string,
    packageName: string
  ) => Promise<ApplicationResult<{ packageName: string }>>
  artwork: (
    deviceId: string,
    packageName: string
  ) => Promise<ApplicationResult<ApplicationMetadata>>
}
