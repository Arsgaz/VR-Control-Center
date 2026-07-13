import { contextBridge, ipcRenderer } from 'electron'
import { APP_IPC_CHANNELS, type ArenaApi } from '../shared/contracts/app.contracts'
import {
  HEADSET_IPC_CHANNELS,
  type ScrcpyProcessEvent,
  type ScrcpyStartOptions
} from '../shared/contracts/headset.contracts'

const arenaApi: ArenaApi = {
  getAppInfo: () => ipcRenderer.invoke(APP_IPC_CHANNELS.getAppInfo),
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

contextBridge.exposeInMainWorld('arena', arenaApi)
