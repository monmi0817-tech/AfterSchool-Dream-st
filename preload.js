const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  loadData: () => ipcRenderer.invoke('load-data'), saveData: data => ipcRenderer.invoke('save-data', data),
  importExcel: kind => ipcRenderer.invoke('import-excel', kind), downloadTemplate: kind => ipcRenderer.invoke('download-template', kind),
  chooseDataDirectory: data => ipcRenderer.invoke('choose-data-directory', data), openDataDirectory: () => ipcRenderer.invoke('open-data-directory'),
  exportResult: rows => ipcRenderer.invoke('export-result', rows),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: callback => ipcRenderer.on('update-status', (_, status) => callback(status)),
  onAppVersion: callback => ipcRenderer.on('app-version', (_, version) => callback(version))
});
