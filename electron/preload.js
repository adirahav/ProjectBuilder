const { contextBridge, ipcRenderer } = require("electron")

// A narrow, explicit bridge — the renderer never gets raw ipcRenderer/node
// access (contextIsolation is on in main.js), only these specific calls.
contextBridge.exposeInMainWorld("devLoop", {
  pickProjectFolder: () => ipcRenderer.invoke("pick-project-folder"),
  getRecentProjects: () => ipcRenderer.invoke("get-recent-projects"),
  selectRecentProject: (folderPath) => ipcRenderer.invoke("select-recent-project", folderPath),
  start: (projectPath) => ipcRenderer.invoke("start-dev-loop", projectPath),
  stop: () => ipcRenderer.invoke("stop-dev-loop"),
  onLog: (callback) => ipcRenderer.on("dev-loop-log", (_event, text) => callback(text)),
  onDashboardUrl: (callback) => ipcRenderer.on("dev-loop-dashboard-url", (_event, url) => callback(url)),
  onExit: (callback) => ipcRenderer.on("dev-loop-exit", (_event, code) => callback(code)),
  getMongodStatus: () => ipcRenderer.invoke("get-mongod-status"),
  startSetupChat: (workspacePath) => ipcRenderer.invoke("setup-chat-start", workspacePath),
  sendSetupChatMessage: (workspacePath, message) => ipcRenderer.invoke("setup-chat-send", { workspacePath, message }),
  resumeSetupChat: (workspacePath) => ipcRenderer.invoke("setup-chat-resume", workspacePath),
  startLocalMongo: (workspacePath) => ipcRenderer.invoke("start-local-mongo", workspacePath),
  uploadAiStudioExport: (workspacePath) => ipcRenderer.invoke("upload-ai-studio-export", workspacePath),
})
