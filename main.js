const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");
const { spawn, exec } = require("child_process"); // exec para code . e comandos de kill por plataforma
const store = require("./src/store"); // Usa o store modificado
const os = require("os"); // Para comandos específicos da plataforma
const AnsiToHtml = require("ansi-to-html"); // <-- ADICIONADO para cores
const convert = new AnsiToHtml({ newline: true }); // <-- Instancia conversor (newline: true para <br>)

let mainWindow;
// Mapeia systemId para o processo filho correspondente
const runningProcesses = new Map(); // Maps systemId -> { childProcess, applicationId }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Inicia oculto para maximizar antes de mostrar
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false, // Segurança: Mantenha false
      // nodeIntegrationInWorker: false, // Segurança
      // nodeIntegrationInSubFrames: false, // Segurança
    },
    backgroundColor: "#2c3e50", // Cor de fundo inicial dark
    icon: path.join(__dirname, "icon.png"), // Define o ícone da janela (opcional, mas bom)
  });

  mainWindow.loadFile("index.html");
  mainWindow.maximize(); // Maximiza a janela
  mainWindow.show(); // Mostra após maximizar

  // mainWindow.webContents.openDevTools(); // Descomente para debug

  mainWindow.on("closed", () => {
    // Garante que todos os processos filhos sejam encerrados ao fechar a janela
    console.log("[Main] Janela fechada, encerrando processos restantes...");
    runningProcesses.forEach((procInfo, systemId) => {
      const child = procInfo.childProcess;
      if (child && !child.killed) {
        console.log(
          `[Main] Encerrando processo órfão do sistema ${systemId} (PID: ${child.pid})`
        );
        killProcessTree(child, systemId); // Usa a função de tree kill
      }
    });
    runningProcesses.clear();
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- Helper Get System --- (Adicionado applicationId para contexto)
async function getSystemById(applicationId, systemId) {
  if (!applicationId || !systemId) return null; // Validação básica
  try {
    const applications = await store.loadData();
    const application = applications.find((app) => app.id === applicationId);
    if (!application || !Array.isArray(application.systems)) return null;
    return application.systems.find((sys) => sys.id === systemId);
  } catch (error) {
    console.error(
      `[Main] Erro ao buscar sistema ${systemId} na aplicação ${applicationId}:`,
      error
    );
    return null;
  }
}

// --- IPC Handlers ---

ipcMain.handle("load-data", async () => {
  return await store.loadData();
});

ipcMain.handle("select-directory", async () => {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (canceled || filePaths.length === 0) {
    return null;
  }
  const directoryPath = filePaths[0];
  const directoryName = path.basename(directoryPath);
  return { directoryPath, directoryName };
});

ipcMain.handle("open-in-vscode", async (event, directoryPath) => {
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    console.error(
      "[Main] Tentativa de abrir diretório inválido no VS Code:",
      directoryPath
    );
    if (mainWindow) {
      dialog.showErrorBox(
        "Erro: Diretório não encontrado",
        `O diretório especificado não foi encontrado:\n${directoryPath}`
      );
    }
    return;
  }
  // Usa `exec` pois `code .` geralmente é um comando de shell
  exec("code .", { cwd: directoryPath }, (error, stdout, stderr) => {
    if (error) {
      console.error(
        `[Main] Erro ao abrir VS Code em ${directoryPath}: ${error.message}`
      );
      if (mainWindow) {
        dialog.showErrorBox(
          "Erro ao Abrir VS Code",
          `Não foi possível abrir o diretório no VS Code. Verifique se o comando 'code' está no PATH do sistema.\n\nErro: ${error.message}`
        );
      }
      return;
    }
    if (stderr) {
      // Stderr do VS Code pode conter informações não críticas
      console.warn(`[Main] VS Code stderr em ${directoryPath}: ${stderr}`);
    }
    console.log(`[Main] Comando 'code .' executado em ${directoryPath}`);
  });
});

// --- Application CRUD ---

ipcMain.handle("add-application", async (event, appData) => {
  try {
    const applications = await store.loadData();
    const newApplication = {
      ...appData,
      id: uuidv4(),
      systems: [], // Aplicação sempre começa sem sistemas
    };
    applications.push(newApplication);
    await store.saveData(applications);
    return { success: true, data: applications };
  } catch (error) {
    console.error("[Main] Erro ao adicionar aplicação:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("update-application", async (event, appData) => {
  try {
    let applications = await store.loadData();
    const appIndex = applications.findIndex((app) => app.id === appData.id);
    if (appIndex === -1) {
      throw new Error("Aplicação não encontrada para atualização.");
    }
    // Preserva os sistemas existentes, atualiza apenas nome e diretório
    applications[appIndex] = {
      ...applications[appIndex], // Mantém ID e sistemas existentes
      name: appData.name,
      directory: appData.directory, // Atualiza o diretório (pode ser null)
    };
    await store.saveData(applications);
    return { success: true, data: applications };
  } catch (error) {
    console.error("[Main] Erro ao atualizar aplicação:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("delete-application", async (event, applicationId) => {
  try {
    let applications = await store.loadData();
    const appToDelete = applications.find((app) => app.id === applicationId);

    // Mata todos os processos dos sistemas desta aplicação antes de deletar
    if (appToDelete && Array.isArray(appToDelete.systems)) {
      console.log(
        `[Main] Deletando aplicação ${applicationId}, parando sistemas associados...`
      );
      appToDelete.systems.forEach((system) => {
        if (runningProcesses.has(system.id)) {
          const procInfo = runningProcesses.get(system.id);
          console.log(
            `[Main] Parando processo do sistema ${system.id} (PID: ${procInfo.childProcess.pid}) antes de deletar app.`
          );
          killProcessTree(procInfo.childProcess, system.id); // Usa tree kill
          // A remoção de runningProcesses ocorrerá no evento 'close' do processo
        }
      });
    }

    applications = applications.filter((app) => app.id !== applicationId);
    await store.saveData(applications);
    console.log(`[Main] Aplicação ${applicationId} deletada.`);
    return { success: true, data: applications };
  } catch (error) {
    console.error("[Main] Erro ao deletar aplicação:", error);
    return { success: false, error: error.message };
  }
});

// --- System CRUD (dentro de Application) ---

ipcMain.handle("add-system", async (event, applicationId, systemData) => {
  try {
    const applications = await store.loadData();
    const appIndex = applications.findIndex((app) => app.id === applicationId);
    if (appIndex === -1) {
      throw new Error("Aplicação pai não encontrada.");
    }
    const newSystem = {
      ...systemData,
      id: uuidv4(),
      // debugMode: systemData.debugMode || false // Garante valor default - JÁ VEM DO RENDERER
    };
    // Garante que 'systems' seja um array
    if (!Array.isArray(applications[appIndex].systems)) {
      applications[appIndex].systems = [];
    }
    applications[appIndex].systems.push(newSystem);
    await store.saveData(applications);
    console.log(
      `[Main] Sistema ${newSystem.id} adicionado à aplicação ${applicationId}`
    );
    return { success: true, data: applications };
  } catch (error) {
    console.error("[Main] Erro ao adicionar sistema:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("update-system", async (event, applicationId, systemData) => {
  try {
    const applications = await store.loadData();
    const appIndex = applications.findIndex((app) => app.id === applicationId);
    if (appIndex === -1) {
      throw new Error("Aplicação pai não encontrada.");
    }
    if (!Array.isArray(applications[appIndex].systems)) {
      throw new Error("Array de sistemas inválido na aplicação.");
    }
    const sysIndex = applications[appIndex].systems.findIndex(
      (sys) => sys.id === systemData.id
    );
    if (sysIndex === -1) {
      throw new Error("Sistema não encontrado para atualização.");
    }
    // Atualiza o sistema preservando o ID
    applications[appIndex].systems[sysIndex] = {
      ...applications[appIndex].systems[sysIndex], // Mantém propriedades não enviadas como ID
      ...systemData, // Aplica as atualizações (inclui debugMode)
    };
    await store.saveData(applications);
    console.log(
      `[Main] Sistema ${systemData.id} atualizado na aplicação ${applicationId}`
    );
    return { success: true, data: applications };
  } catch (error) {
    console.error("[Main] Erro ao atualizar sistema:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("delete-system", async (event, applicationId, systemId) => {
  try {
    const applications = await store.loadData();
    const appIndex = applications.findIndex((app) => app.id === applicationId);

    if (appIndex === -1) {
      console.warn(
        `[Main] Aplicação ${applicationId} não encontrada ao tentar deletar sistema ${systemId}.`
      );
      // Retorna sucesso mesmo se app não existe, pois o sistema não existe nesse contexto
      return { success: true, data: applications };
    }

    // Mata o processo se estiver rodando ANTES de remover do array
    if (runningProcesses.has(systemId)) {
      const procInfo = runningProcesses.get(systemId);
      console.log(
        `[Main] Parando processo do sistema ${systemId} (PID: ${procInfo.childProcess.pid}) antes de deletar.`
      );
      killProcessTree(procInfo.childProcess, systemId); // Usa tree kill
      // A remoção de runningProcesses ocorrerá no evento 'close'
    }

    // Remove o sistema do array da aplicação
    if (Array.isArray(applications[appIndex].systems)) {
      const initialLength = applications[appIndex].systems.length;
      applications[appIndex].systems = applications[appIndex].systems.filter(
        (sys) => sys.id !== systemId
      );
      if (applications[appIndex].systems.length < initialLength) {
        console.log(
          `[Main] Sistema ${systemId} removido da aplicação ${applicationId}.`
        );
      }
    }

    await store.saveData(applications);
    return { success: true, data: applications };
  } catch (error) {
    console.error("[Main] Erro ao deletar sistema:", error);
    return { success: false, error: error.message };
  }
});

// --- Process Execution ---

// Função centralizada para enviar output para o renderer
function sendOutput(systemId, data, type = "stdout") {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // --- INÍCIO: Conversão ANSI para HTML ---
    let formattedData = data;
    if (typeof data === "string" && type !== "html") {
      // Não reconverter se já for html
      try {
        // Escapa HTML básico ANTES de converter ANSI para evitar XSS simples
        const escapedData = data
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        formattedData = convert.toHtml(escapedData);
      } catch (e) {
        console.warn(
          `[Main] Falha ao converter ANSI para HTML para system ${systemId}:`,
          e
        );
        formattedData = data.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // Fallback: Escapa HTML simples
      }
    }
    // --- FIM: Conversão ANSI para HTML ---
    mainWindow.webContents.send("system-output", {
      systemId,
      data: formattedData,
      type,
    }); // Envia objeto
  }
}

// Função para matar processo e sua árvore
function killProcessTree(child, systemId) {
  if (!child || child.killed) {
    console.log(
      `[Main] Tentativa de kill em processo já morto ou inexistente para ${systemId}`
    );
    return;
  }
  const pid = child.pid;
  console.log(
    `[Main] Tentando encerrar árvore de processos para ${systemId} (PID: ${pid})`
  );
  sendOutput(
    systemId,
    `--- [INFO] Encerrando árvore de processos (PID: ${pid})... ---`,
    "info"
  );

  try {
    if (os.platform() === "win32") {
      // Windows: Mata o processo e todos os seus filhos
      exec(`taskkill /PID ${pid} /T /F`, (err, stdout, stderr) => {
        if (err) {
          // Ignora erro "não encontrado" que pode ocorrer se o processo já terminou
          if (
            !stderr.includes("não pôde ser encontrado") &&
            !stderr.includes("not found")
          ) {
            console.error(
              `[Main] Erro taskkill para ${systemId} (PID: ${pid}): ${
                stderr || err.message
              }`
            );
            sendOutput(
              systemId,
              `--- [ERRO] Falha ao encerrar árvore de processos com taskkill: ${
                stderr || err.message
              } ---`,
              "error"
            );
          } else {
            console.log(
              `[Main] Taskkill informa que processo ${pid} não foi encontrado (provavelmente já encerrou).`
            );
            sendOutput(
              systemId,
              `--- [INFO] Processo ${pid} não encontrado por taskkill (já encerrado?). ---`,
              "info"
            );
          }
        } else {
          console.log(
            `[Main] Árvore de processos ${pid} (Sistema ${systemId}) encerrada via taskkill.`
          );
          sendOutput(
            systemId,
            `--- [INFO] Árvore de processos ${pid} encerrada com sucesso. ---`,
            "info"
          );
        }
        // O evento 'close' do processo original ainda deve ser disparado eventualmente.
      });
    } else {
      // Linux/macOS: Mata o grupo de processos (requer detached: true no spawn)
      // Envia SIGTERM primeiro para o grupo
      try {
        process.kill(-pid, "SIGTERM"); // O '-' na frente do PID envia sinal para todo o grupo
        console.log(
          `[Main] SIGTERM enviado para grupo de processos ${pid} (Sistema ${systemId}).`
        );
        sendOutput(
          systemId,
          `--- [INFO] Sinal SIGTERM enviado para grupo de processos ${pid}. ---`,
          "info"
        );
        // Define um timeout para forçar SIGKILL se não encerrar
        setTimeout(() => {
          if (runningProcesses.has(systemId)) {
            // Verifica se ainda está rodando
            console.warn(
              `[Main] Processo ${pid} (Grupo) não encerrou após SIGTERM, enviando SIGKILL.`
            );
            sendOutput(
              systemId,
              `--- [WARN] Grupo de processos ${pid} não encerrou, forçando SIGKILL... ---`,
              "info"
            );
            try {
              process.kill(-pid, "SIGKILL");
            } catch (killErr) {
              console.error(
                `[Main] Erro ao enviar SIGKILL para grupo de processos ${pid}: ${killErr.message}`
              );
              sendOutput(
                systemId,
                `--- [ERRO] Falha ao enviar SIGKILL para grupo ${pid}: ${killErr.message} ---`,
                "error"
              );
            }
          }
        }, 3000); // Espera 3 segundos antes de forçar
      } catch (termErr) {
        console.error(
          `[Main] Erro ao enviar SIGTERM para grupo de processos ${pid}: ${termErr.message}`
        );
        sendOutput(
          systemId,
          `--- [ERRO] Falha ao enviar SIGTERM para grupo ${pid}: ${termErr.message} ---`,
          "error"
        );
        // Tenta SIGKILL imediatamente como fallback se SIGTERM falhou
        try {
          process.kill(-pid, "SIGKILL");
        } catch (killErr) {
          console.error(
            `[Main] Erro ao enviar SIGKILL (fallback) para grupo ${pid}: ${killErr.message}`
          );
          sendOutput(
            systemId,
            `--- [ERRO] Falha ao enviar SIGKILL (fallback) para grupo ${pid}: ${killErr.message} ---`,
            "error"
          );
        }
      }
    }
  } catch (e) {
    // Catch genérico para erros inesperados no processo de kill
    console.error(
      `[Main] Erro inesperado ao tentar encerrar processo ${pid} (Sistema ${systemId}):`,
      e
    );
    sendOutput(
      systemId,
      `--- [ERRO] Erro inesperado ao encerrar processo ${pid}: ${e.message} ---`,
      "error"
    );
    // Como fallback final, tenta matar apenas o processo principal com SIGKILL
    if (!child.killed) {
      try {
        child.kill("SIGKILL");
      } catch (finalErr) {
        /* ignore */
      }
    }
  }
}

// Principal função de execução
async function executeCommand(applicationId, systemId, commandType) {
  if (!mainWindow) {
    console.warn("[Main] executeCommand chamado mas mainWindow não existe.");
    return;
  }

  const system = await getSystemById(applicationId, systemId);

  if (!system) {
    sendOutput(
      systemId,
      `--- [ERRO] Sistema ${systemId} não encontrado na aplicação ${applicationId}. ---`,
      "error"
    );
    // Garante que a UI volte ao estado parado se foi uma tentativa de start
    if (commandType === "start" && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("system-stopped", { systemId });
    }
    if (commandType === "deploy" && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("system-deployed", {
        systemId,
        success: false,
      });
    }
    return;
  }

  let commandToExecute =
    commandType === "start" ? system.startCommand : system.deployCommand;
  const cwd = system.directory;
  const isDebugMode = commandType === "start" && system.debugMode === true; // <-- Verifica modo debug

  // Validações
  if (!commandToExecute) {
    sendOutput(
      systemId,
      `--- [ERRO] Comando de '${commandType}' não definido para ${system.name}. ---`,
      "error"
    );
    if (commandType === "start")
      mainWindow.webContents.send("system-stopped", { systemId });
    if (commandType === "deploy")
      mainWindow.webContents.send("system-deployed", {
        systemId,
        success: false,
      });
    return;
  }
  if (!cwd) {
    sendOutput(
      systemId,
      `--- [ERRO] Diretório não definido para ${system.name}. ---`,
      "error"
    );
    if (commandType === "start")
      mainWindow.webContents.send("system-stopped", { systemId });
    if (commandType === "deploy")
      mainWindow.webContents.send("system-deployed", {
        systemId,
        success: false,
      });
    return;
  }
  if (!fs.existsSync(cwd)) {
    sendOutput(
      systemId,
      `--- [ERRO] Diretório não encontrado: ${cwd} ---`,
      "error"
    );
    if (commandType === "start")
      mainWindow.webContents.send("system-stopped", { systemId });
    if (commandType === "deploy")
      mainWindow.webContents.send("system-deployed", {
        systemId,
        success: false,
      });
    return;
  }

  // Mata processo 'start' anterior SE for iniciar um novo 'start'
  if (commandType === "start" && runningProcesses.has(systemId)) {
    const oldProcInfo = runningProcesses.get(systemId);
    sendOutput(
      systemId,
      `--- [INFO] Parando processo start anterior (PID: ${oldProcInfo.childProcess.pid})... ---`,
      "info"
    );
    killProcessTree(oldProcInfo.childProcess, systemId); // Usa tree kill
    // Não remove de runningProcesses aqui, espera o 'close' do processo antigo
  }

  // Configura ambiente
  let env = { ...process.env }; // Copia env atual
  let finalCommand = commandToExecute; // Comando final a ser executado
  let spawnOptions = {
    cwd,
    env,
    shell: true, // Usar shell=true é conveniente, mas requer tree killing robusto.
    stdio: ["pipe", "pipe", "pipe"], // Captura stdin, stdout, stderr
    // --- INÍCIO: Opção Detached para POSIX ---
    detached: os.platform() !== "win32", // Necessário para matar grupo de processos em Linux/macOS
    // --- FIM: Opção Detached para POSIX ---
  };

  // Adiciona PORT se definido (Start only)
  if (commandType === "start" && system.port && !isNaN(Number(system.port))) {
    const port = Number(system.port);
    env.PORT = port.toString(); // Define a variável de ambiente para o processo filho
    sendOutput(systemId, `--- [INFO] Definindo PORT=${env.PORT} ---`, "info");
  }

  // --- INÍCIO: Lógica Debug Mode ---
  if (isDebugMode) {
    // Adiciona flag de inspeção Node.js via variável de ambiente
    env.NODE_OPTIONS = `${env.NODE_OPTIONS || ""} --inspect`;
    sendOutput(
      systemId,
      `--- [INFO] Modo Debug ativado (--inspect). Conecte um debugger na porta padrão (geralmente 9229). ---`,
      "info"
    );
    // Nota: Não modificamos 'finalCommand' diretamente, NODE_OPTIONS é mais flexível.
  }
  // --- FIM: Lógica Debug Mode ---

  sendOutput(
    systemId,
    `--- [INFO] Executando ${commandType}: ${finalCommand} em ${cwd}${
      isDebugMode ? " (DEBUG)" : ""
    } ---`,
    "info"
  );

  try {
    const child = spawn(finalCommand, [], spawnOptions); // Passa array vazio como args quando shell=true

    console.log(
      `[Main] Processo ${commandType} (PID: ${
        child.pid
      }) iniciado para ${systemId}${isDebugMode ? " [DEBUG]" : ""}`
    );

    // Armazena APENAS processos 'start' para poder par-los depois
    if (commandType === "start") {
      runningProcesses.set(systemId, { childProcess: child, applicationId });
      console.log(
        `[Main] Processo ${systemId} (PID: ${child.pid}) adicionado ao rastreamento.`
      );
    } else {
      // Processos 'deploy' não são rastreados para 'stop'
      console.log(
        `[Main] Processo ${commandType} (PID: ${child.pid}) para ${systemId} não será rastreado para parada.`
      );
    }

    child.stdout.on("data", (data) => {
      sendOutput(systemId, data.toString(), "stdout");
    });

    child.stderr.on("data", (data) => {
      // Considerar stderr como erro apenas se não for modo debug (debugger pode usar stderr)
      sendOutput(systemId, data.toString(), isDebugMode ? "stdout" : "stderr"); // Envia como stdout em debug
    });

    child.on("close", (code, signal) => {
      const signalInfo = signal ? ` (sinal ${signal})` : "";
      const message = `--- [INFO] Processo ${commandType} (PID: ${child.pid}) encerrado com código ${code}${signalInfo}. ---`;
      console.log(
        `[Main] Processo ${systemId} (PID: ${child.pid}) encerrado. Código: ${code}, Sinal: ${signal}`
      );
      sendOutput(systemId, message, "info");

      // Limpa do map APENAS se for o processo 'start' que estava rastreado E se é o mesmo PID
      if (
        commandType === "start" &&
        runningProcesses.has(systemId) &&
        runningProcesses.get(systemId).childProcess.pid === child.pid
      ) {
        runningProcesses.delete(systemId);
        console.log(`[Main] Processo ${systemId} removido do rastreamento.`);
        // Envia evento 'stopped' apenas para processos 'start' que fecharam
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("system-stopped", { systemId });
        }
      }

      // Envia evento 'deployed' para processos 'deploy' que fecharam
      if (commandType === "deploy" && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("system-deployed", {
          systemId,
          success: code === 0,
        });
      }
    });

    child.on("error", (err) => {
      const message = `--- [ERRO] Erro ao iniciar/executar processo ${commandType} (PID: ${child.pid}): ${err.message} ---`;
      console.error(
        `[Main] Erro no processo ${systemId} (PID: ${child.pid}):`,
        err
      );
      sendOutput(systemId, message, "error");

      // Limpa do map se o erro ocorreu no processo 'start' que estávamos rastreando E se é o mesmo PID
      if (
        commandType === "start" &&
        runningProcesses.has(systemId) &&
        runningProcesses.get(systemId).childProcess.pid === child.pid
      ) {
        runningProcesses.delete(systemId);
        console.log(
          `[Main] Processo ${systemId} removido do rastreamento devido a erro.`
        );
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("system-stopped", { systemId });
        }
      }
      if (commandType === "deploy" && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("system-deployed", {
          systemId,
          success: false,
        });
      }
    });
  } catch (spawnError) {
    // Erro ao tentar iniciar o spawn (ex: comando não encontrado)
    const message = `--- [ERRO] Falha crítica ao tentar executar comando ${commandType}: ${spawnError.message} ---`;
    console.error(`[Main] Erro de spawn para ${systemId}:`, spawnError);
    sendOutput(systemId, message, "error");
    // Garante que a UI seja atualizada se era um start ou deploy
    if (commandType === "start" && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("system-stopped", { systemId });
    }
    if (commandType === "deploy" && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("system-deployed", {
        systemId,
        success: false,
      });
    }
    // Garante limpeza se por acaso foi adicionado ao map antes do erro (improvável, mas seguro)
    if (commandType === "start" && runningProcesses.has(systemId)) {
      // Não temos o child.pid aqui, mas podemos assumir que se chegou aqui, não iniciou
      runningProcesses.delete(systemId);
      console.log(
        `[Main] Processo ${systemId} removido do rastreamento devido a erro de spawn.`
      );
    }
  }
}

// --- IPC Listeners para Ações ---

ipcMain.on("start-system", (event, { applicationId, systemId }) => {
  executeCommand(applicationId, systemId, "start");
});

// MODIFICADO: Usa killProcessTree
ipcMain.on("stop-system", (event, { systemId }) => {
  if (runningProcesses.has(systemId)) {
    const procInfo = runningProcesses.get(systemId);
    const child = procInfo.childProcess;
    if (child && !child.killed) {
      sendOutput(
        systemId,
        `--- [INFO] Enviando sinal de parada para processo ${systemId} (PID: ${child.pid})... ---`,
        "info"
      );
      killProcessTree(child, systemId); // <--- CHAMADA MODIFICADA
    } else {
      // Processo no map mas já morto? Limpa e notifica UI.
      sendOutput(
        systemId,
        `--- [INFO] Processo ${systemId} já estava finalizado no rastreamento. ---`,
        "info"
      );
      runningProcesses.delete(systemId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("system-stopped", { systemId });
      }
    }
  } else {
    // Se não está no map, força a UI para o estado parado
    sendOutput(
      systemId,
      `--- [INFO] Processo ${systemId} não estava sendo rastreado (ou já parado). ---`,
      "info"
    );
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("system-stopped", { systemId });
    }
  }
});

ipcMain.on("deploy-system", (event, { applicationId, systemId }) => {
  executeCommand(applicationId, systemId, "deploy");
});

ipcMain.on("start-all-systems", async (event, { applicationId }) => {
  try {
    const applications = await store.loadData();
    const application = applications.find((app) => app.id === applicationId);

    if (
      application &&
      Array.isArray(application.systems) &&
      application.systems.length > 0
    ) {
      console.log(
        `[Main] Iniciando todos os sistemas para ${application.name}...`
      );
      sendOutput(
        applicationId,
        `--- [INFO] Iniciando todos os ${application.systems.length} sistemas para ${application.name}... ---`,
        "info"
      ); // Envia para um log "global"? ou primeiro sistema? Melhor não enviar output aqui.

      // Executa em sequência com delay para não sobrecarregar e permitir que a UI/logs atualizem
      for (const system of application.systems) {
        // Pequeno delay entre os starts
        await new Promise((resolve) => setTimeout(resolve, 300));
        executeCommand(applicationId, system.id, "start");
      }
      console.log(
        `[Main] Comandos de start enviados para todos os sistemas de ${application.name}.`
      );
    } else {
      console.warn(
        `[Main] Aplicação ${applicationId} não encontrada ou sem sistemas para start-all.`
      );
      // Poderia enviar uma mensagem para a UI se relevante
    }
  } catch (error) {
    console.error(
      `[Main] Erro ao iniciar todos os sistemas para ${applicationId}:`,
      error
    );
  }
});

// Handler para Forçar Parada (SIGKILL + Porta) - SEM GRANDES MUDANÇAS NA LÓGICA INTERNA
// Apenas ajustado para usar getSystemById corretamente e garantir limpeza
ipcMain.handle(
  "force-stop-system",
  async (event, { applicationId, systemId }) => {
    let killedByPort = false;
    let killedOriginal = false;
    let portFound = null;
    let originalPid = null;
    const platform = os.platform();

    console.log(
      `[Main] Recebido pedido de FORÇAR PARADA para systemId: ${systemId} (App: ${applicationId})`
    );

    // 1. Tenta matar o processo original rastreado (SIGKILL)
    if (runningProcesses.has(systemId)) {
      const procInfo = runningProcesses.get(systemId);
      const child = procInfo.childProcess;
      originalPid = child.pid; // Guarda o PID original

      if (child && !child.killed) {
        sendOutput(
          systemId,
          `--- [INFO] Forçando parada (SIGKILL) no processo original PID ${originalPid}... ---`,
          "info"
        );
        try {
          if (platform === "win32") {
            // Usa taskkill /F para forçar no Windows
            exec(`taskkill /PID ${originalPid} /T /F`); // /T para árvore, /F para forçar
          } else {
            process.kill(-originalPid, "SIGKILL"); // Mata o grupo com SIGKILL
          }
          killedOriginal = true;
          console.log(
            `[Main] Sinal SIGKILL (ou taskkill /F) enviado para PID/Grupo ${originalPid} (Sistema ${systemId})`
          );
          sendOutput(
            systemId,
            `--- [INFO] Sinal SIGKILL (ou taskkill /F) enviado para PID/Grupo ${originalPid}. ---`,
            "info"
          );
        } catch (e) {
          console.error(
            `[Main] Erro ao forçar parada (SIGKILL/taskkill) do processo original ${systemId} (PID ${originalPid}):`,
            e
          );
          sendOutput(
            systemId,
            `--- [ERRO] Erro ao enviar SIGKILL/taskkill para processo original PID ${originalPid}: ${e.message} ---`,
            "error"
          );
        }
      } else if (child && child.killed) {
        sendOutput(
          systemId,
          `--- [INFO] Processo original PID ${originalPid} já estava finalizado no rastreamento. ---`,
          "info"
        );
      }
      // Remove do map imediatamente ao tentar forçar parada, pois não esperamos 'close'
      runningProcesses.delete(systemId);
      console.log(
        `[Main] Sistema ${systemId} removido do rastreamento (force-stop).`
      );
    } else {
      sendOutput(
        systemId,
        `--- [INFO] Nenhum processo original rastreado para ${systemId} para forçar parada. ---`,
        "info"
      );
    }

    // 2. Tenta matar pela porta se definida
    const system = await getSystemById(applicationId, systemId); // Busca dados do sistema
    if (system && system.port) {
      const port = system.port;
      portFound = port;
      let command;
      sendOutput(
        systemId,
        `--- [INFO] Tentando forçar parada de processos na porta ${port}... ---`,
        "info"
      );

      if (platform === "win32") {
        // Windows: Encontra PIDs pela porta e mata com taskkill /F
        // Usar PowerShell é mais robusto, mas requer que esteja disponível. Stick com netstat/taskkill por simplicidade.
        // Este comando pode precisar de ajustes dependendo da saída do netstat no idioma do sistema.
        // O comando FOR pode ser complexo de rodar diretamente do Node.js, usar exec pode ser problemático.
        // Abordagem mais segura: rodar netstat, parsear PIDs, rodar taskkill para cada PID.
        console.warn(
          "[Main] Kill por porta no Windows com 'FOR / netstat' pode ser instável. Implementação simplificada."
        );
        command = `FOR /F "tokens=5" %P IN ('netstat -a -n -o ^| findstr LISTENING ^| findstr :${port}') DO IF NOT %P==0 taskkill /PID %P /F`;
        // Nota: Este comando pode não funcionar como esperado via 'exec' simples devido ao caractere '%' e pipes.
        // Uma implementação mais robusta envolveria spawn('cmd.exe', ['/c', command...]) ou um script PowerShell.
        // Por ora, deixamos o comando como exemplo, mas a execução real pode falhar.
      } else {
        // Linux e macOS: Tenta encontrar PIDs usando lsof e matar com kill -9
        command = `lsof -ti tcp:${port} | xargs -r kill -9`;
        // Alternativa (pode precisar instalar): fuser -k -n tcp ${port}
      }

      if (command) {
        console.log(
          `[Main] Executando comando kill por porta ${port}: ${command}`
        );
        try {
          // Usamos Promise para esperar a conclusão do exec
          await new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
              // Analisa o resultado
              if (error) {
                // Ignora erros comuns como "process not found" ou permissão
                const errorMsg = stderr || error.message || "";
                if (
                  errorMsg.includes("No such process") ||
                  errorMsg.includes("Operation not permitted") ||
                  errorMsg.includes("não pôde ser encontrado") ||
                  errorMsg.includes("not found")
                ) {
                  console.warn(
                    `[Main] Kill por porta ${port}: Processo não encontrado ou permissão negada.`
                  );
                  sendOutput(
                    systemId,
                    `--- [INFO] Nenhum processo encontrado na porta ${port} ou permissão negada. ---`,
                    "info"
                  );
                } else if (stdout && stdout.trim() === "" && stderr === "") {
                  console.warn(
                    `[Main] Kill por porta ${port}: Comando executou, mas sem saída (provavelmente nenhum processo encontrado).`
                  );
                  sendOutput(
                    systemId,
                    `--- [INFO] Nenhum processo encontrado na porta ${port} (comando sem saída). ---`,
                    "info"
                  );
                } else {
                  console.error(
                    `[Main] Erro ao executar kill por porta ${port}: ${errorMsg}`
                  );
                  sendOutput(
                    systemId,
                    `--- [ERRO] Erro ao tentar finalizar processo na porta ${port}: ${errorMsg} ---`,
                    "error"
                  );
                }
                resolve(); // Resolve mesmo com erro esperado (processo não encontrado)
              } else {
                // Comando executou sem erro do sistema operacional
                killedByPort = true; // Assume sucesso se não houve erro crítico
                console.log(
                  `[Main] Comando kill por porta ${port} executado. Saída: ${stdout}`
                );
                sendOutput(
                  systemId,
                  `--- [INFO] Comando para finalizar processos na porta ${port} executado. ---`,
                  "info"
                );
                resolve(); // Continua
              }
            });
          });
        } catch (execError) {
          console.error(
            `[Main] Falha geral na execução do comando kill por porta ${port}:`,
            execError
          );
          sendOutput(
            systemId,
            `--- [ERRO] Falha na execuo do comando para finalizar processo na porta ${port}. ---`,
            "error"
          );
        }
      } else {
        console.log(
          `[Main] Nenhum comando de kill por porta definido para a plataforma ${platform}.`
        );
      }
    } else if (system) {
      sendOutput(
        systemId,
        `--- [INFO] Porta não definida para ${system.name}, não é possível forçar parada por porta. ---`,
        "info"
      );
    } else {
      // Se o sistema não foi encontrado, já emitimos erro antes, mas podemos logar aqui também.
      console.warn(
        `[Main] Sistema ${systemId} não encontrado durante force-stop, não foi possível tentar kill por porta.`
      );
      sendOutput(
        systemId,
        `--- [ERRO] Sistema ${systemId} não encontrado, impossível tentar forçar parada por porta. ---`,
        "error"
      );
    }

    // 3. Garante que a UI seja atualizada para o estado parado (evento system-stopped)
    // Isso é importante para consistência visual, mesmo que os kills tenham falhado.
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log(
        `[Main] Enviando system-stopped para ${systemId} após tentativa de force-stop.`
      );
      mainWindow.webContents.send("system-stopped", { systemId });
    } else {
      console.warn(
        `[Main] mainWindow não disponível para enviar system-stopped para ${systemId} após force-stop.`
      );
    }

    // Retorna um resumo da operação
    return {
      success: killedOriginal || killedByPort, // Considera sucesso se qualquer um funcionou
      killedOriginal,
      killedByPort,
      portAttempted: portFound,
      originalPid,
    };
  }
);
