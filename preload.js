const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Data Loading
  loadData: () => ipcRenderer.invoke("load-data"),

  // Directory Selection
  selectDirectory: () => ipcRenderer.invoke("select-directory"),

  // VS Code Integration
  openInVsCode: (directoryPath) =>
    ipcRenderer.invoke("open-in-vscode", directoryPath),

  // Application CRUD
  addApplication: (appData) => ipcRenderer.invoke("add-application", appData),
  updateApplication: (appData) =>
    ipcRenderer.invoke("update-application", appData),
  deleteApplication: (applicationId) =>
    ipcRenderer.invoke("delete-application", applicationId),

  // System CRUD (needs applicationId)
  addSystem: (applicationId, systemData) =>
    ipcRenderer.invoke("add-system", { applicationId, systemData }),
  updateSystem: (applicationId, systemData) =>
    ipcRenderer.invoke("update-system", { applicationId, systemData }),
  deleteSystem: (applicationId, systemId) =>
    ipcRenderer.invoke("delete-system", { applicationId, systemId }),

  // Process Control (needs applicationId for context, systemId for target)
  startSystem: (applicationId, systemId) =>
    ipcRenderer.send("start-system", { applicationId, systemId }),
  stopSystem: (systemId) => ipcRenderer.send("stop-system", { systemId }), // Stop only needs systemId
  deploySystem: (applicationId, systemId) =>
    ipcRenderer.send("deploy-system", { applicationId, systemId }),
  startAllSystems: (applicationId) =>
    ipcRenderer.send("start-all-systems", { applicationId }),
  forceStopSystem: (
    applicationId,
    systemId // NOVO
  ) => ipcRenderer.invoke("force-stop-system", { applicationId, systemId }),

  // Listeners for data from Main (all identify target by systemId)
  onSystemOutput: (callback) =>
    ipcRenderer.on("system-output", (_event, value) => callback(value)),
  onSystemStopped: (callback) =>
    ipcRenderer.on("system-stopped", (_event, value) => callback(value)),
  onSystemDeployed: (callback) =>
    ipcRenderer.on("system-deployed", (_event, value) => callback(value)),

  // Cleanup listeners
  removeListener: (channel) => ipcRenderer.removeAllListeners(channel),
});
