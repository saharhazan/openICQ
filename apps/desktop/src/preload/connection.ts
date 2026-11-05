/** Exposes the connection settings calls to the bundled Connection Settings page only. */
import { contextBridge, ipcRenderer } from 'electron';
import { CONNECTION_GLOBAL, CONNECTION_IPC, type ConnectionApi } from '../connection/api.ts';

const api: ConnectionApi = {
  load: () => ipcRenderer.invoke(CONNECTION_IPC.load),
  save: (config) => ipcRenderer.invoke(CONNECTION_IPC.save, config),
  cancel: () => ipcRenderer.send(CONNECTION_IPC.cancel),
};

contextBridge.exposeInMainWorld(CONNECTION_GLOBAL, api);
