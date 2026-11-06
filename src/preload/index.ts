import { APPLICATIONS_IPC_CHANNELS } from '../shared/contracts/applications.contracts'
import { TEAM_GAMES_IPC_CHANNELS } from '../shared/contracts/team-games.contracts'
import { contextBridge, ipcRenderer } from 'electron'
import { APP_IPC_CHANNELS, type VrControlApi } from '../shared/contracts/app.contracts'
import {
  CONFIG_IPC_CHANNELS,
  type AppLanguage,
  type DeviceConfigUpdate,
  type NewDeviceConfig,
  type NewStreamProfileConfig,
  type StreamProfileConfigUpdate,
  type UserSettingsUpdate
} from '../shared/contracts/config.contracts'
import {
  type DeviceRuntimeEvent,
  HEADSET_IPC_CHANNELS,
  type ScrcpyProcessEvent
} from '../shared/contracts/headset.contracts'

const vrControlApi: VrControlApi = {
  getAppInfo: () => ipcRenderer.invoke(APP_IPC_CHANNELS.getAppInfo),
  getTechnicalLogInfo: () => ipcRenderer.invoke(APP_IPC_CHANNELS.getTechnicalLogInfo),
  selectToolBinary: (tool) => ipcRenderer.invoke(APP_IPC_CHANNELS.selectToolBinary, tool),
  openLogsDirectory: () => ipcRenderer.invoke(APP_IPC_CHANNELS.openLogsDirectory),
  clearOldLogs: () => ipcRenderer.invoke(APP_IPC_CHANNELS.clearOldLogs),
  teamGames: {
    selectShortcut: () => ipcRenderer.invoke(TEAM_GAMES_IPC_CHANNELS.select),
    save: (game) => ipcRenderer.invoke(TEAM_GAMES_IPC_CHANNELS.save, game),
    remove: (id) => ipcRenderer.invoke(TEAM_GAMES_IPC_CHANNELS.remove, id),
    launch: (id) => ipcRenderer.invoke(TEAM_GAMES_IPC_CHANNELS.launch, id)
  },
  applications: {
    list: (deviceId) => ipcRenderer.invoke(APPLICATIONS_IPC_CHANNELS.list, deviceId),
    launch: (deviceId, packageName) =>
      ipcRenderer.invoke(APPLICATIONS_IPC_CHANNELS.launch, deviceId, packageName),
    artwork: (deviceId, packageName) =>
      ipcRenderer.invoke(APPLICATIONS_IPC_CHANNELS.artwork, deviceId, packageName)
  },
  configuration: {
    getConfig: () => ipcRenderer.invoke(CONFIG_IPC_CHANNELS.getConfig),
    resetConfig: () => ipcRenderer.invoke(CONFIG_IPC_CHANNELS.resetConfig),
    addDevice: (device: NewDeviceConfig) =>
      ipcRenderer.invoke(CONFIG_IPC_CHANNELS.addDevice, device),
    updateDevice: (id: string, changes: DeviceConfigUpdate) =>
      ipcRenderer.invoke(CONFIG_IPC_CHANNELS.updateDevice, id, changes),
    deleteDevice: (id: string) => ipcRenderer.invoke(CONFIG_IPC_CHANNELS.deleteDevice, id),
    updateLanguage: (language: AppLanguage) =>
      ipcRenderer.invoke(CONFIG_IPC_CHANNELS.updateLanguage, language),
    updateSettings: (changes: UserSettingsUpdate) =>
      ipcRenderer.invoke(CONFIG_IPC_CHANNELS.updateSettings, changes),
    addStreamProfile: (profile: NewStreamProfileConfig) =>
      ipcRenderer.invoke(CONFIG_IPC_CHANNELS.addStreamProfile, profile),
    updateStreamProfile: (id: string, changes: StreamProfileConfigUpdate) =>
      ipcRenderer.invoke(CONFIG_IPC_CHANNELS.updateStreamProfile, id, changes),
    deleteStreamProfile: (id: string) =>
      ipcRenderer.invoke(CONFIG_IPC_CHANNELS.deleteStreamProfile, id)
  },
  headset: {
    connectUsb: (serial?: string) => ipcRenderer.invoke(HEADSET_IPC_CHANNELS.connectUsb, serial),
    checkEnvironment: () => ipcRenderer.invoke(HEADSET_IPC_CHANNELS.checkEnvironment),
    listAdbDevices: () => ipcRenderer.invoke(HEADSET_IPC_CHANNELS.listAdbDevices),
    connectDevice: (deviceId: string) =>
      ipcRenderer.invoke(HEADSET_IPC_CHANNELS.connectDevice, deviceId),
    disconnectDevice: (deviceId: string) =>
      ipcRenderer.invoke(HEADSET_IPC_CHANNELS.disconnectDevice, deviceId),
    refreshRuntime: (deviceId: string) =>
      ipcRenderer.invoke(HEADSET_IPC_CHANNELS.refreshRuntime, deviceId),
    syncTime: (deviceId: string) => ipcRenderer.invoke(HEADSET_IPC_CHANNELS.syncTime, deviceId),
    startScrcpy: (deviceId: string) =>
      ipcRenderer.invoke(HEADSET_IPC_CHANNELS.startScrcpy, deviceId),
    stopScrcpy: (deviceId: string) => ipcRenderer.invoke(HEADSET_IPC_CHANNELS.stopScrcpy, deviceId),
    getScrcpyStatus: (deviceId: string) =>
      ipcRenderer.invoke(HEADSET_IPC_CHANNELS.getScrcpyStatus, deviceId),
    onScrcpyEvent: (callback: (event: ScrcpyProcessEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: ScrcpyProcessEvent): void => {
        callback(event)
      }

      ipcRenderer.on(HEADSET_IPC_CHANNELS.scrcpyEvent, listener)

      return () => {
        ipcRenderer.removeListener(HEADSET_IPC_CHANNELS.scrcpyEvent, listener)
      }
    },
    onRuntimeEvent: (callback: (event: DeviceRuntimeEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: DeviceRuntimeEvent): void => {
        callback(event)
      }

      ipcRenderer.on(HEADSET_IPC_CHANNELS.runtimeEvent, listener)

      return () => {
        ipcRenderer.removeListener(HEADSET_IPC_CHANNELS.runtimeEvent, listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('vrControl', vrControlApi)
