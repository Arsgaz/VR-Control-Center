import { CONFIG_SCHEMA_VERSION, type AppConfig } from '../contracts/config.contracts'

export const createDefaultConfig = (): AppConfig => ({
  version: CONFIG_SCHEMA_VERSION,
  application: {
    displayName: 'VR Control Center'
  },
  devices: [
    {
      id: 'test-headset',
      name: 'Test headset',
      address: '192.168.1.100:5555'
    }
  ],
  streamProfiles: [
    {
      id: 'default',
      name: 'Default stream profile',
      noAudio: true,
      crop: ''
    }
  ],
  settings: {
    activeDeviceId: 'test-headset',
    activeStreamProfileId: 'default'
  },
  logger: {
    level: 'info',
    maxFileSizeBytes: 1024 * 1024 * 5
  }
})
