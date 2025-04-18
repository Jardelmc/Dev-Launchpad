const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");
const { spawn, exec } = require("child_process"); // exec para 'code .' e comandos de kill
const store = require("./src/store");
const os = require("os"); // Para comandos específicos da plataforma

let mainWindow;
// Mapeia systemId para o processo filho correspondente
const runningProcesses = new Map(); // Map<systemId, childProcess>

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Inicia oculto para maximizar antes de mostrar
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: "#2c3e50", // Cor de fundo inicial (dark)
    icon: path.join(__dirname, "icon.png"), // Define o ícone da janela (opcional, mas bom)
  });

  mainWindow.loadFile("index.html");
  mainWindow.maximize(); // Maximiza a janela
  mainWindow.show(); // Mostra após maximizar

  // mainWindow.webContents.openDevTools(); // Descomente para debug

  mainWindow.on("closed", () => {
    // Garante que todos os processos filhos sejam encerrados ao fechar a janela
    runningProcesses.forEach((child) => {
      if (child && !child.killed) {
        // Tenta um kill normal primeiro, mas SIGKILL se forçar parada
        try {
          child.kill(); // Tenta SIGTERM primeiro
        } catch (e) {
          console.warn(
            `Falha ao enviar SIGTERM para processo ${child.pid}, tentando SIGKILL...`
          );
          try {
            child.kill("SIGKILL"); // Força bruta como fallback
          } catch (e2) {
            console.error(
              `Falha ao enviar SIGKILL para processo ${child.pid}:`,
              e2
            );
          }
        }
      }
    });
    runningProcesses.clear();
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- Helper: Get System --- (Precisa do applicationId agora)
async function getSystemById(applicationId, systemId) {
  if (!applicationId || !systemId) return null; // Validação básica
  try {
    const applications = await store.loadData();
    const application = applications.find((app) => app.id === applicationId);
    if (!application || !Array.isArray(application.systems)) return null;
    return application.systems.find((sys) => sys.id === systemId);
  } catch (error) {
    console.error(
      `Erro ao buscar sistema ${systemId} na aplicação ${applicationId}:`,
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
  if (canceled || filePaths.length === 0) return null;
  const directoryPath = filePaths[0];
  const directoryName = path.basename(directoryPath);
  return { directoryPath, directoryName };
});

ipcMain.handle("open-in-vscode", (event, directoryPath) => {
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    console.error(
      "Tentativa de abrir diretório inválido no VS Code:",
      directoryPath
    );
    if (mainWindow) {
      // Mostra dialogo apenas se a janela existir
      dialog.showErrorBox(
        "Erro",
        `Diretório não encontrado: ${directoryPath || "Nenhum"}`
      );
    }
    return;
  }
  // Usa 'exec' pois 'code .' geralmente é um comando de shell
  exec(`code .`, { cwd: directoryPath }, (error, stdout, stderr) => {
    if (error) {
      console.error(
        `Erro ao abrir VS Code em ${directoryPath}: ${error.message}`
      );
      if (mainWindow) {
        dialog.showErrorBox(
          "Erro VS Code",
          `Não foi possível abrir o diretório no VS Code. Verifique se o comando 'code' está no PATH do sistema.\n\nErro: ${error.message}`
        );
      }
      return;
    }
    if (stderr) {
      // Stderr do VS Code pode conter informações não críticas
      console.warn(`VS Code stderr em ${directoryPath}: ${stderr}`);
    }
    console.log(`Comando 'code .' executado em: ${directoryPath}`);
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
    console.error("Erro ao adicionar aplicação:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("update-application", async (event, appData) => {
  try {
    let applications = await store.loadData();
    const appIndex = applications.findIndex((app) => app.id === appData.id);
    if (appIndex === -1)
      throw new Error("Aplicação não encontrada para atualização.");
    // Preserva os sistemas existentes, atualiza apenas nome e diretório
    applications[appIndex] = {
      ...applications[appIndex], // Mantém ID e sistemas existentes
      name: appData.name,
      directory: appData.directory, // Atualiza o diretório (pode ser null)
    };
    await store.saveData(applications);
    return { success: true, data: applications };
  } catch (error) {
    console.error("Erro ao atualizar aplicação:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("delete-application", async (event, applicationId) => {
  try {
    let applications = await store.loadData();
    const appToDelete = applications.find((app) => app.id === applicationId);

    // Mata todos os processos dos sistemas desta aplicação antes de deletar
    if (appToDelete && Array.isArray(appToDelete.systems)) {
      appToDelete.systems.forEach((system) => {
        if (runningProcesses.has(system.id)) {
          const child = runningProcesses.get(system.id);
          if (child && !child.killed) {
            try {
              child.kill();
            } catch (e) {
              /* Ignore */
            } // Tenta parar normalmente
          }
          runningProcesses.delete(system.id); // Remove do rastreamento
        }
      });
    }

    applications = applications.filter((app) => app.id !== applicationId);
    await store.saveData(applications);
    return { success: true, data: applications };
  } catch (error) {
    console.error("Erro ao deletar aplicação:", error);
    return { success: false, error: error.message };
  }
});

// --- System CRUD (dentro de Application) ---

ipcMain.handle("add-system", async (event, { applicationId, systemData }) => {
  try {
    const applications = await store.loadData();
    const appIndex = applications.findIndex((app) => app.id === applicationId);
    if (appIndex === -1) throw new Error("Aplicação pai não encontrada.");

    const newSystem = { ...systemData, id: uuidv4() };
    // Garante que systems seja um array
    if (!Array.isArray(applications[appIndex].systems)) {
      applications[appIndex].systems = [];
    }
    applications[appIndex].systems.push(newSystem);
    await store.saveData(applications);
    return { success: true, data: applications };
  } catch (error) {
    console.error("Erro ao adicionar sistema:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle(
  "update-system",
  async (event, { applicationId, systemData }) => {
    try {
      const applications = await store.loadData();
      const appIndex = applications.findIndex(
        (app) => app.id === applicationId
      );
      if (appIndex === -1) throw new Error("Aplicação pai não encontrada.");
      if (!Array.isArray(applications[appIndex].systems))
        throw new Error("Array de sistemas inválido na aplicação.");

      const sysIndex = applications[appIndex].systems.findIndex(
        (sys) => sys.id === systemData.id
      );
      if (sysIndex === -1)
        throw new Error("Sistema não encontrado para atualização.");

      // Atualiza o sistema preservando o ID
      applications[appIndex].systems[sysIndex] = {
        ...applications[appIndex].systems[sysIndex], // Mantém propriedades não enviadas (como ID)
        ...systemData, // Aplica as atualizações
      };
      await store.saveData(applications);
      return { success: true, data: applications };
    } catch (error) {
      console.error("Erro ao atualizar sistema:", error);
      return { success: false, error: error.message };
    }
  }
);

ipcMain.handle("delete-system", async (event, { applicationId, systemId }) => {
  try {
    const applications = await store.loadData();
    const appIndex = applications.findIndex((app) => app.id === applicationId);
    if (appIndex === -1) {
      console.warn(
        `Aplicação ${applicationId} não encontrada ao tentar deletar sistema ${systemId}`
      );
      // Retorna sucesso mesmo se app não existe, pois o sistema não existe nesse contexto
      return { success: true, data: applications };
    }

    // Mata o processo se estiver rodando
    if (runningProcesses.has(systemId)) {
      const child = runningProcesses.get(systemId);
      if (child && !child.killed) {
        try {
          child.kill();
        } catch (e) {
          /* Ignore */
        }
      }
      runningProcesses.delete(systemId); // Remove do rastreamento
    }

    // Remove o sistema do array da aplicação
    if (Array.isArray(applications[appIndex].systems)) {
      applications[appIndex].systems = applications[appIndex].systems.filter(
        (sys) => sys.id !== systemId
      );
    }
    await store.saveData(applications);
    return { success: true, data: applications };
  } catch (error) {
    console.error("Erro ao deletar sistema:", error);
    return { success: false, error: error.message };
  }
});

// --- Process Execution ---

// Função centralizada para enviar output para o renderer
function sendOutput(systemId, data, type) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("system-output", { systemId, data, type });
  }
}

function executeCommand(applicationId, systemId, commandType) {
  if (!mainWindow) {
    console.warn("executeCommand chamado mas mainWindow não existe.");
    return;
  }

  // Usa uma função async interna para poder usar await com getSystemById
  (async () => {
    const system = await getSystemById(applicationId, systemId);
    if (!system) {
      sendOutput(
        systemId,
        `--- Erro: Sistema ${systemId} não encontrado na aplicação ${applicationId} ---\n`,
        "error"
      );
      if (commandType === "start" && mainWindow)
        mainWindow.webContents.send("system-stopped", { systemId });
      if (commandType === "deploy" && mainWindow)
        mainWindow.webContents.send("system-deployed", {
          systemId,
          success: false,
        });
      return;
    }

    let commandToExecute =
      commandType === "start" ? system.startCommand : system.deployCommand;
    const cwd = system.directory;

    // Validações
    if (!commandToExecute) {
      sendOutput(
        systemId,
        `--- Erro: Comando de ${commandType} não definido para ${system.name} ---\n`,
        "error"
      );
      if (commandType === "start" && mainWindow)
        mainWindow.webContents.send("system-stopped", { systemId });
      return; // Não continua se não há comando
    }
    if (!cwd) {
      sendOutput(
        systemId,
        `--- Erro: Diretório não definido para ${system.name} ---\n`,
        "error"
      );
      if (commandType === "start" && mainWindow)
        mainWindow.webContents.send("system-stopped", { systemId });
      if (commandType === "deploy" && mainWindow)
        mainWindow.webContents.send("system-deployed", {
          systemId,
          success: false,
        });
      return;
    }
    if (!fs.existsSync(cwd)) {
      sendOutput(
        systemId,
        `--- Erro: Diretório não encontrado: ${cwd} ---\n`,
        "error"
      );
      if (commandType === "start" && mainWindow)
        mainWindow.webContents.send("system-stopped", { systemId });
      if (commandType === "deploy" && mainWindow)
        mainWindow.webContents.send("system-deployed", {
          systemId,
          success: false,
        });
      return;
    }

    // Mata processo 'start' anterior SE for iniciar um novo 'start'
    if (commandType === "start" && runningProcesses.has(systemId)) {
      const oldProcess = runningProcesses.get(systemId);
      if (oldProcess && !oldProcess.killed) {
        try {
          oldProcess.kill();
        } catch (e) {
          /* Ignore */
        }
        runningProcesses.delete(systemId); // Remove imediatamente ao tentar iniciar novo
        sendOutput(
          systemId,
          `--- Processo 'start' anterior parado ---\n`,
          "info"
        );
      }
    }

    // Adiciona PORT se definido (Start only)
    let finalCommand = commandToExecute;
    let env = { ...process.env }; // Copia env atual
    if (commandType === "start" && system.port && !isNaN(Number(system.port))) {
      const port = Number(system.port);
      // Define a variável de ambiente para o processo filho
      env["PORT"] = port.toString();
      // Não precisa mais prefixar o comando com 'set' ou 'PORT=' pois será passado via env
      // finalCommand = commandToExecute; // Já é o caso
    }

    sendOutput(
      systemId,
      `--- Executando [${commandType}]: ${commandToExecute} em ${cwd} ${
        system.port ? `(PORT=${env.PORT})` : ""
      } ---\n`,
      "info"
    );

    try {
      // Usa shell: true para conveniência com comandos complexos, mas passa env separado
      const child = spawn(finalCommand, [], {
        cwd,
        shell: true,
        env: env, // Passa as variáveis de ambiente (incluindo PORT se definido)
        stdio: ["pipe", "pipe", "pipe"], // Captura stdout, stderr
      });

      // Armazena APENAS processos 'start' para poder pará-los
      if (commandType === "start") {
        runningProcesses.set(systemId, child);
        console.log(
          `Processo ${commandType} (PID: ${child.pid}) iniciado para ${systemId}`
        );
      } else {
        console.log(
          `Processo ${commandType} (PID: ${child.pid}) iniciado para ${systemId}`
        );
      }

      child.stdout.on("data", (data) => {
        sendOutput(systemId, data.toString(), "stdout");
      });

      child.stderr.on("data", (data) => {
        sendOutput(systemId, data.toString(), "stderr");
      });

      child.on("close", (code, signal) => {
        const signalInfo = signal ? ` (sinal: ${signal})` : "";
        const message = `--- Processo [${commandType}] (PID: ${child.pid}) encerrado com código ${code}${signalInfo} ---\n`;
        console.log(
          `Processo ${systemId} (PID: ${child.pid}) encerrado. Código: ${code}, Sinal: ${signal}`
        );
        sendOutput(systemId, message, "info");

        // Limpa do map APENAS se for o processo que estava rastreado
        if (
          runningProcesses.has(systemId) &&
          runningProcesses.get(systemId) === child
        ) {
          runningProcesses.delete(systemId);
          // Envia evento 'stopped' apenas para processos 'start' que fecharam
          if (commandType === "start" && mainWindow) {
            mainWindow.webContents.send("system-stopped", { systemId });
          }
        }

        // Envia evento 'deployed' para processos 'deploy' que fecharam
        if (commandType === "deploy" && mainWindow) {
          mainWindow.webContents.send("system-deployed", {
            systemId,
            success: code === 0,
          });
        }
      });

      child.on("error", (err) => {
        const message = `--- Erro ao iniciar/executar processo [${commandType}] (PID: ${
          child.pid || "N/A"
        }): ${err.message} ---\n`;
        console.error(`Erro no processo ${systemId}:`, err);
        sendOutput(systemId, message, "error");

        // Limpa do map se o erro ocorreu no processo que estávamos rastreando
        if (
          runningProcesses.has(systemId) &&
          runningProcesses.get(systemId) === child
        ) {
          runningProcesses.delete(systemId);
          if (commandType === "start" && mainWindow)
            mainWindow.webContents.send("system-stopped", { systemId });
        }
        if (commandType === "deploy" && mainWindow)
          mainWindow.webContents.send("system-deployed", {
            systemId,
            success: false,
          });
      });
    } catch (spawnError) {
      // Erro ao tentar *iniciar* o spawn
      const message = `--- Falha crítica ao tentar executar comando [${commandType}]: ${spawnError.message} ---\n`;
      console.error(`Erro de spawn para ${systemId}:`, spawnError);
      sendOutput(systemId, message, "error");
      // Garante que a UI seja atualizada se era um 'start' ou 'deploy'
      if (commandType === "start" && mainWindow)
        mainWindow.webContents.send("system-stopped", { systemId });
      if (commandType === "deploy" && mainWindow)
        mainWindow.webContents.send("system-deployed", {
          systemId,
          success: false,
        });
      // Garante limpeza se por acaso foi adicionado ao map antes do erro
      if (runningProcesses.has(systemId)) {
        runningProcesses.delete(systemId);
      }
    }
  })().catch((err) => {
    // Catch para erros dentro da função async interna
    console.error(`Erro inesperado em executeCommand para ${systemId}:`, err);
    sendOutput(
      systemId,
      `--- Erro interno inesperado ao executar comando ---\n`,
      "error"
    );
    if (commandType === "start" && mainWindow)
      mainWindow.webContents.send("system-stopped", { systemId });
    if (commandType === "deploy" && mainWindow)
      mainWindow.webContents.send("system-deployed", {
        systemId,
        success: false,
      });
  });
}

// --- IPC Listeners para Ações ---

ipcMain.on("start-system", (event, { applicationId, systemId }) => {
  executeCommand(applicationId, systemId, "start");
});

// Modificado: Apenas envia sinal, a limpeza ocorre no 'close'
ipcMain.on("stop-system", (event, { systemId }) => {
  if (runningProcesses.has(systemId)) {
    const child = runningProcesses.get(systemId);
    if (child && !child.killed) {
      sendOutput(
        systemId,
        `--- Enviando sinal de parada (SIGTERM) para PID ${child.pid}... ---\n`,
        "info"
      );
      try {
        child.kill("SIGTERM"); // Envia SIGTERM (padrão)
      } catch (e) {
        console.error(
          `Erro ao enviar SIGTERM para ${systemId} (PID: ${child.pid}):`,
          e
        );
        sendOutput(
          systemId,
          `--- Erro ao enviar sinal de parada. Tente Forçar Parada. ---\n`,
          "error"
        );
        // Se kill falhou, talvez forçar parada seja necessário, mas não removemos do map aqui
      }
      // NÃO remove do map aqui - espera o evento 'close'
    } else {
      // Se não estava rodando ou já morto no map, força a UI para parado e limpa o map
      sendOutput(
        systemId,
        `--- Processo ${systemId} não encontrado ou já finalizado no rastreamento. ---\n`,
        "info"
      );
      if (mainWindow)
        mainWindow.webContents.send("system-stopped", { systemId });
      runningProcesses.delete(systemId); // Garante limpeza se estava no map mas killed=true
    }
  } else {
    // Se não está no map, garante que a UI vá para o estado parado
    sendOutput(
      systemId,
      `--- Processo ${systemId} não estava sendo rastreado. ---\n`,
      "info"
    );
    if (mainWindow) mainWindow.webContents.send("system-stopped", { systemId });
  }
});

ipcMain.on("deploy-system", (event, { applicationId, systemId }) => {
  executeCommand(applicationId, systemId, "deploy");
});

ipcMain.on("start-all-systems", async (event, { applicationId }) => {
  try {
    const applications = await store.loadData();
    const application = applications.find((app) => app.id === applicationId);
    if (application && Array.isArray(application.systems)) {
      console.log(`Iniciando todos os sistemas para ${application.name}...`);
      // Executa em sequência com delay
      for (const system of application.systems) {
        // Pequeno delay para não sobrecarregar e permitir que a UI/logs atualizem
        await new Promise((resolve) => setTimeout(resolve, 300));
        executeCommand(applicationId, system.id, "start");
      }
      console.log(
        `Comandos de start enviados para todos os sistemas de ${application.name}.`
      );
    } else {
      console.warn(
        `Aplicação ${applicationId} não encontrada ou sem sistemas para start-all.`
      );
    }
  } catch (error) {
    console.error(
      `Erro ao iniciar todos os sistemas para ${applicationId}:`,
      error
    );
  }
});

// NOVO: Handler para Forçar Parada
ipcMain.handle(
  "force-stop-system",
  async (event, { applicationId, systemId }) => {
    let killedByPort = false;
    let killedOriginal = false;
    let portFound = null;
    let originalPid = null;

    console.log(
      `Recebido pedido de forçar parada para ${systemId} (App: ${applicationId})`
    );

    // 1. Tenta matar o processo original rastreado (SIGKILL)
    if (runningProcesses.has(systemId)) {
      const child = runningProcesses.get(systemId);
      if (child && !child.killed) {
        originalPid = child.pid;
        sendOutput(
          systemId,
          `--- Forçando parada (SIGKILL) no processo original (PID: ${originalPid})... ---\n`,
          "info"
        );
        try {
          child.kill("SIGKILL"); // Força bruta
          killedOriginal = true;
          console.log(
            `SIGKILL enviado para PID ${originalPid} (Sistema: ${systemId})`
          );
        } catch (e) {
          console.error(
            `Erro ao forçar parada (SIGKILL) do processo original ${systemId} (PID: ${originalPid}):`,
            e
          );
          sendOutput(
            systemId,
            `--- Erro ao enviar SIGKILL para processo original (PID: ${originalPid}). ---\n`,
            "error"
          );
        }
      } else if (child && child.killed) {
        sendOutput(
          systemId,
          `--- Processo original (PID: ${child.pid}) já estava finalizado no rastreamento. ---\n`,
          "info"
        );
      }
      // Remove do map *imediatamente* ao tentar forçar parada, pois não esperamos 'close'
      runningProcesses.delete(systemId);
      console.log(`Sistema ${systemId} removido do rastreamento (force-stop).`);
    } else {
      sendOutput(
        systemId,
        `--- Nenhum processo original rastreado para ${systemId} para forçar parada. ---\n`,
        "info"
      );
    }

    // 2. Tenta matar pela porta (se definida)
    const system = await getSystemById(applicationId, systemId);
    if (system && system.port) {
      const port = system.port;
      portFound = port;
      const platform = os.platform();
      let command = "";

      sendOutput(
        systemId,
        `--- Tentando forçar parada de processo(s) na porta ${port}... ---\n`,
        "info"
      );

      if (platform === "win32") {
        // Windows: Encontra PIDs pela porta e mata com taskkill /F
        // Usamos '&&' para encadear, mas 'exec' pode ter problemas. Melhor fazer em duas etapas ou um script mais robusto.
        // Simplificado: executa netstat e depois taskkill separadamente se necessário, ou usa um comando mais direto.
        // Comando único mais robusto (requer PowerShell talvez):
        // Get-NetTCPConnection -LocalPort ${port} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
        // Usando netstat + taskkill (pode ser menos confiável com múltiplos processos):
        command = `FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr LISTENING ^| findstr :${port}') DO ( IF NOT %P == 0 taskkill /PID %P /F )`;
        // Nota: O comando FOR pode precisar ser ajustado dependendo do ambiente de execução do Electron.
      } else {
        // Linux e macOS
        // Tenta encontrar PID(s) usando lsof e matar com kill -9
        // A opção -r em xargs evita erro se lsof não retornar nada
        command = `lsof -ti tcp:${port} | xargs -r kill -9`;
        // Alternativa (pode precisar instalar fuser): `fuser -k -n tcp ${port}`;
      }

      if (command) {
        console.log(`Executando comando kill por porta (${port}): ${command}`);
        try {
          // Usamos Promise para esperar a conclusão do exec
          await new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
              // Analisa o resultado
              if (error) {
                // Ignora erros comuns como "process not found" ou permissão
                if (
                  stderr &&
                  (stderr.includes("No such process") ||
                    stderr.includes("Operation not permitted"))
                ) {
                  console.warn(
                    `Kill por porta ${port}: Processo não encontrado ou permissão negada.`
                  );
                  sendOutput(
                    systemId,
                    `--- Nenhum processo encontrado na porta ${port} ou permissão negada. ---\n`,
                    "info"
                  );
                } else if (
                  error.message.includes("not found") ||
                  (stdout && stdout.trim() === "")
                ) {
                  console.warn(
                    `Kill por porta ${port}: Comando falhou ou nenhum processo encontrado.`
                  );
                  sendOutput(
                    systemId,
                    `--- Nenhum processo encontrado na porta ${port} (comando falhou ou vazio). ---\n`,
                    "info"
                  );
                } else {
                  // Erro real
                  console.error(
                    `Erro ao executar kill por porta (${port}): ${
                      stderr || error.message
                    }`
                  );
                  sendOutput(
                    systemId,
                    `--- Erro ao tentar finalizar processo na porta ${port}: ${
                      stderr || error.message
                    } ---\n`,
                    "error"
                  );
                }
              } else {
                // Comando executou sem erro do sistema operacional
                killedByPort = true; // Assume sucesso se não houve erro crítico
                console.log(
                  `Comando kill por porta ${port} executado. Saída: ${stdout}`
                );
                sendOutput(
                  systemId,
                  `--- Comando para finalizar processo(s) na porta ${port} executado. ---\n`,
                  "info"
                );
              }
              resolve(); // Continua independentemente do resultado detalhado
            });
          });
        } catch (execError) {
          console.error(
            `Falha geral na execução do comando kill por porta ${port}:`,
            execError
          );
          sendOutput(
            systemId,
            `--- Falha na execução do comando para finalizar processo na porta ${port}. ---\n`,
            "error"
          );
        }
      } else {
        console.log(
          `Nenhum comando de kill por porta definido para a plataforma ${platform}.`
        );
      }
    } else if (system) {
      sendOutput(
        systemId,
        `--- Porta não definida para ${system.name}, não é possível forçar parada por porta. ---\n`,
        "info"
      );
    } else {
      sendOutput(
        systemId,
        `--- Sistema não encontrado, não é possível forçar parada por porta. ---\n`,
        "error"
      );
    }

    // 3. Garante que a UI seja atualizada para o estado parado (evento 'system-stopped')
    // Isso é importante para consistência visual, mesmo que os kills tenham falhado.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("system-stopped", { systemId });
    } else {
      console.warn(
        `mainWindow não disponível para enviar system-stopped para ${systemId} após force-stop.`
      );
    }

    // Retorna um resumo da operação
    return {
      success: killedOriginal || killedByPort,
      killedOriginal,
      killedByPort,
      portAttempted: portFound,
      originalPid,
    };
  }
);
