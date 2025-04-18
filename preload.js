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
    ipcRenderer.invoke("add-system", applicationId, systemData),
  updateSystem: (applicationId, systemData) =>
    ipcRenderer.invoke("update-system", applicationId, systemData),
  deleteSystem: (applicationId, systemId) =>
    ipcRenderer.invoke("delete-system", applicationId, systemId),

  // Process Control (needs applicationId for context, systemId for target)
  // Passando como objeto para clareza
  startSystem: (applicationId, systemId) =>
    ipcRenderer.send("start-system", { applicationId, systemId }),
  stopSystem: (systemId) => ipcRenderer.send("stop-system", { systemId }), // Só precisa do systemId
  deploySystem: (applicationId, systemId) =>
    ipcRenderer.send("deploy-system", { applicationId, systemId }),
  startAllSystems: (applicationId) =>
    ipcRenderer.send("start-all-systems", { applicationId }),
  forceStopSystem: (applicationId, systemId) =>
    ipcRenderer.invoke("force-stop-system", { applicationId, systemId }), // NOVO

  // Listeners for data from Main (all identify target by systemId passed in event data)
  // Os callbacks recebem (event, { systemId, data, type }) ou similar
  onSystemOutput: (callback) =>
    ipcRenderer.on("system-output", (event, value) => callback(value)),
  onSystemStopped: (callback) =>
    ipcRenderer.on("system-stopped", (event, value) => callback(value)),
  onSystemDeployed: (callback) =>
    ipcRenderer.on("system-deployed", (event, value) => callback(value)),

  // Cleanup listeners
  removeListener: (channel) => ipcRenderer.removeAllListeners(channel),
});
