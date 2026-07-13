import { contextBridge, ipcRenderer } from 'electron'
import { APP_IPC_CHANNELS, type VrControlApi } from '../shared/contracts/app.contracts'
import { CONFIG_IPC_CHANNELS, type AppConfig } from '../shared/contracts/config.contracts'
import {
  HEADSET_IPC_CHANNELS,
  type ScrcpyProcessEvent,
  type ScrcpyStartOptions
} from '../shared/contracts/headset.contracts'

const vrControlApi: VrControlApi = {
  getAppInfo: () => ipcRenderer.invoke(APP_IPC_CHANNELS.getAppInfo),
  getTechnicalLogInfo: () => ipcRenderer.invoke(APP_IPC_CHANNELS.getTechnicalLogInfo),
  configuration: {
    getConfig: () => ipcRenderer.invoke(CONFIG_IPC_CHANNELS.getConfig),
    updateConfig: (config: AppConfig) => ipcRenderer.invoke(CONFIG_IPC_CHANNELS.updateConfig, config),
    resetConfig: () => ipcRenderer.invoke(CONFIG_IPC_CHANNELS.resetConfig)
  },
  headset: {
    checkEnvironment: () => ipcRenderer.invoke(HEADSET_IPC_CHANNELS.checkEnvironment),
    listAdbDevices: () => ipcRenderer.invoke(HEADSET_IPC_CHANNELS.listAdbDevices),
    connectDevice: (address: string) =>
      ipcRenderer.invoke(HEADSET_IPC_CHANNELS.connectDevice, address),
    disconnectDevice: (address: string) =>
      ipcRenderer.invoke(HEADSET_IPC_CHANNELS.disconnectDevice, address),
    startScrcpy: (options: ScrcpyStartOptions) =>
      ipcRenderer.invoke(HEADSET_IPC_CHANNELS.startScrcpy, options),
    stopScrcpy: () => ipcRenderer.invoke(HEADSET_IPC_CHANNELS.stopScrcpy),
    getScrcpyStatus: () => ipcRenderer.invoke(HEADSET_IPC_CHANNELS.getScrcpyStatus),
    onScrcpyEvent: (callback: (event: ScrcpyProcessEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: ScrcpyProcessEvent): void => {
        callback(event)
      }

      ipcRenderer.on(HEADSET_IPC_CHANNELS.scrcpyEvent, listener)

      return () => {
        ipcRenderer.removeListener(HEADSET_IPC_CHANNELS.scrcpyEvent, listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('vrControl', vrControlApi)
