const { contextBridge, ipcRenderer } = require("electron")

// A narrow, explicit bridge — the renderer never gets raw ipcRenderer/node
// access (contextIsolation is on in main.js), only these specific calls.
contextBridge.exposeInMainWorld("devLoop", {
  pickProjectFolder: () => ipcRenderer.invoke("pick-project-folder"),
  getRecentProjects: () => ipcRenderer.invoke("get-recent-projects"),
  selectRecentProject: (folderPath) => ipcRenderer.invoke("select-recent-project", folderPath),
  start: (projectPath) => ipcRenderer.invoke("start-dev-loop", projectPath),
  stop: () => ipcRenderer.invoke("stop-dev-loop"),
  sendDevLoopInput: (text) => ipcRenderer.invoke("send-dev-loop-input", text),
  onLog: (callback) => ipcRenderer.on("dev-loop-log", (_event, text) => callback(text)),
  onDashboardUrl: (callback) => ipcRenderer.on("dev-loop-dashboard-url", (_event, url) => callback(url)),
  onExit: (callback) => ipcRenderer.on("dev-loop-exit", (_event, code) => callback(code)),
  getMongodStatus: () => ipcRenderer.invoke("get-mongod-status"),
  startSetupChat: (workspacePath) => ipcRenderer.invoke("setup-chat-start", workspacePath),
  sendSetupChatMessage: (workspacePath, message) => ipcRenderer.invoke("setup-chat-send", { workspacePath, message }),
  resumeSetupChat: (workspacePath) => ipcRenderer.invoke("setup-chat-resume", workspacePath),
  onSetupChatProgress: (callback) => ipcRenderer.on("setup-chat-progress", (_event, text) => callback(text)),
  startLocalMongo: (workspacePath) => ipcRenderer.invoke("start-local-mongo", workspacePath),
  uploadAiStudioExport: (workspacePath) => ipcRenderer.invoke("upload-ai-studio-export", workspacePath),
  uploadExternalApiSpec: (workspacePath, slug) => ipcRenderer.invoke("upload-external-api-spec", { workspacePath, slug }),
  checkGitStatus: (workspacePath) => ipcRenderer.invoke("check-git-status", workspacePath),
  detectLlmAccounts: () => ipcRenderer.invoke("detect-llm-accounts"),
  writeSetupConfig: (workspacePath, config) => ipcRenderer.invoke("write-setup-config", { workspacePath, config }),
  saveConfigDraft: (workspacePath, config) => ipcRenderer.invoke("save-config-draft", { workspacePath, config }),
  readSetupConfig: (workspacePath) => ipcRenderer.invoke("read-setup-config", workspacePath),
  readPart1Summary: (workspacePath) => ipcRenderer.invoke("read-part1-summary", workspacePath),
  listProjectFiles: (workspacePath) => ipcRenderer.invoke("list-project-files", workspacePath),
  readProjectFile: (workspacePath, relPath) => ipcRenderer.invoke("read-project-file", { workspacePath, relPath }),
  readLiveGates: (workspacePath) => ipcRenderer.invoke("read-live-gates", workspacePath),
  writeLiveGates: (workspacePath, gates) => ipcRenderer.invoke("write-live-gates", { workspacePath, gates }),
})
