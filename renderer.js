document.addEventListener("DOMContentLoaded", () => {
  // --- Views & Containers ---
  const applicationsView = document.getElementById("applications-view");
  const systemsView = document.getElementById("systems-view");
  const applicationsList = document.getElementById("applications-list");
  const systemsList = document.getElementById("systems-list");
  const systemsViewTitle = document.getElementById("systems-view-title");

  // --- Buttons ---
  const addApplicationBtn = document.getElementById("add-application-btn");
  const backToAppsBtn = document.getElementById("back-to-apps-btn");
  const addSystemBtn = document.getElementById("add-system-btn");
  const startAllBtn = document.getElementById("start-all-btn");

  // --- Application Modal ---
  const appModal = document.getElementById("application-modal");
  const appForm = document.getElementById("application-form");
  const appModalTitle = document.getElementById("application-modal-title");
  const appCloseBtn = appModal.querySelector(".close-btn");
  const appCancelBtn = appModal.querySelector(".cancel-modal-btn");
  const appIdInput = document.getElementById("application-id");
  const appNameInput = document.getElementById("application-name");
  const appDirInput = document.getElementById("application-directory");
  const selectAppDirBtn = document.getElementById("select-app-directory-btn");

  // --- System Modal ---
  const sysModal = document.getElementById("system-modal");
  const sysForm = document.getElementById("system-form");
  const sysModalTitle = document.getElementById("system-modal-title");
  const sysCloseBtn = sysModal.querySelector(".close-btn");
  const sysCancelBtn = sysModal.querySelector(".cancel-modal-btn");
  const sysAppIdInput = document.getElementById("system-app-id"); // To know which app this system belongs to
  const sysIdInput = document.getElementById("system-id");
  const sysNameInput = document.getElementById("system-name");
  const sysDirInput = document.getElementById("system-directory");
  const selectSysDirBtn = document.getElementById("select-sys-directory-btn");
  const sysDirFeedback = document.getElementById("sys-directory-feedback");
  const sysPortInput = document.getElementById("system-port");
  const sysStartCmdInput = document.getElementById("start-command");
  const sysDeployCmdInput = document.getElementById("deploy-command");

  // --- State ---
  let currentData = []; // Holds the array of applications
  let selectedApplicationId = null;
  let selectedApplicationName = "";
  // NOVO: Estados para persistência
  const terminalOutputs = new Map(); // Map<systemId, string> - Armazena histórico do terminal
  const systemIsRunning = new Map(); // Map<systemId, boolean> - Estado de execução percebido pelo renderer

  // --- Utility ---
  function escapeHtml(unsafe) {
    if (typeof unsafe !== "string") return "";
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- View Management ---
  function showApplicationsView() {
    // Não limpa mais selectedApplicationId aqui para persistir a última view de sistema visitada
    applicationsView.classList.add("active-view");
    systemsView.classList.remove("active-view");
    renderApplications(); // Re-render para refletir qualquer mudança nos dados
  }

  function showSystemsView(applicationId) {
    const app = currentData.find((a) => a.id === applicationId);
    if (!app) {
      console.error(
        "Aplicação não encontrada para exibir sistemas:",
        applicationId
      );
      showApplicationsView(); // Volta se app não existe
      return;
    }
    // Define o estado da view atual
    selectedApplicationId = applicationId;
    selectedApplicationName = app.name;
    systemsViewTitle.textContent = `Sistemas de ${escapeHtml(app.name)}`;
    // Troca as views visíveis
    applicationsView.classList.remove("active-view");
    systemsView.classList.add("active-view");
    // Renderiza os sistemas usando o estado persistente
    renderSystems(app.systems || [], app.name);
    // Atualiza o handler do botão "Iniciar Todos" para a aplicação atual
    startAllBtn.onclick = () => {
      console.log(
        `Botão 'Iniciar Todos' clicado para App ID: ${selectedApplicationId}`
      );
      window.electronAPI.startAllSystems(selectedApplicationId);
    };
  }

  // --- Rendering ---
  function renderApplications() {
    applicationsList.innerHTML = ""; // Limpa lista anterior
    if (currentData.length === 0) {
      applicationsList.innerHTML =
        '<p class="empty-state">Nenhuma aplicação cadastrada. Clique em "Nova Aplicação".</p>';
      return;
    }

    currentData.forEach((app) => {
      const appElement = document.createElement("div");
      appElement.className = "application-item";
      appElement.dataset.appId = app.id;

      const hasDir = app.directory && app.directory.trim() !== "";
      const dirDisplay = hasDir
        ? escapeHtml(app.directory)
        : "Diretório não definido";
      const systemCount = (app.systems || []).length;

      appElement.innerHTML = `
                  <div class="app-item-info">
                      <h3>${escapeHtml(app.name)}</h3>
                      <small class="directory-path ${
                        !hasDir ? "dimmed" : ""
                      }">${dirDisplay}</small>
                  </div>
                  <div class="app-item-actions">
                      <button class="action-btn view-systems-btn" title="Ver os ${systemCount} sistemas desta aplicação">Ver Sistemas (${systemCount})</button>
                      ${
                        hasDir
                          ? `<button class="action-btn open-app-vscode-btn" title="Abrir diretório da aplicação no VS Code">Abrir VS Code</button>`
                          : ""
                      }
                      <button class="action-btn start-all-app-btn" title="Iniciar todos os sistemas desta aplicação">Iniciar Todos</button>
                      <button class="action-btn edit-app-btn" title="Editar nome e diretório da aplicação">Editar</button>
                      <button class="action-btn danger delete-app-btn" title="Excluir aplicação e todos os seus sistemas">Excluir</button>
                  </div>
              `;
      applicationsList.appendChild(appElement);

      // Attach listeners para os botões deste item
      appElement
        .querySelector(".view-systems-btn")
        .addEventListener("click", () => showSystemsView(app.id));
      if (hasDir) {
        appElement
          .querySelector(".open-app-vscode-btn")
          .addEventListener("click", () =>
            window.electronAPI.openInVsCode(app.directory)
          );
      }
      // Listener para "Iniciar Todos" da Aplicação
      appElement
        .querySelector(".start-all-app-btn")
        .addEventListener("click", (e) => {
          e.stopPropagation(); // Previne evento do item principal
          console.log(
            `Botão 'Iniciar Todos' (no card) clicado para App ID: ${app.id}`
          );
          // Navega para a view de sistemas e então inicia todos
          showSystemsView(app.id);
          // Delay para permitir renderização da view antes de iniciar
          setTimeout(() => {
            console.log(
              `Enviando comando startAllSystems para App ID: ${app.id}`
            );
            window.electronAPI.startAllSystems(app.id);
          }, 200); // Pequeno delay
        });
      appElement
        .querySelector(".edit-app-btn")
        .addEventListener("click", () => openApplicationModal(app));
      appElement
        .querySelector(".delete-app-btn")
        .addEventListener("click", () =>
          deleteApplicationHandler(app.id, app.name)
        );
    });
  }

  // MODIFICADO: renderSystems para usar estado persistente
  function renderSystems(systems, parentAppName) {
    systemsList.innerHTML = ""; // Limpa view anterior
    if (!systems || systems.length === 0) {
      systemsList.innerHTML = `<p class="empty-state">Nenhum sistema cadastrado para ${escapeHtml(
        parentAppName
      )}. Clique em "Novo Sistema".</p>`;
      return;
    }

    systems.forEach((sys) => {
      const card = document.createElement("div");
      card.className = "system-card";
      card.dataset.systemId = sys.id; // ID para referenciar o card

      const hasDeploy = sys.deployCommand && sys.deployCommand.trim() !== "";
      const portDisplay = sys.port ? ` (Porta: ${sys.port})` : "";

      // Recupera o estado atual do sistema
      const isRunning = systemIsRunning.get(sys.id) === true;
      const outputHistory = terminalOutputs.get(sys.id) || ""; // Histórico do terminal

      // Monta o HTML do card com estados iniciais corretos
      card.innerHTML = `
                  <div class="system-card-header">
                      <div class="system-info">
                          <h4>${escapeHtml(sys.name)}${portDisplay}</h4>
                          <small class="directory-path">${escapeHtml(
                            sys.directory
                          )}</small>
                      </div>
                      <div class="system-actions">
                           <button class="start-btn action-btn ${
                             isRunning ? "hidden" : ""
                           }" ${
        isRunning ? "disabled" : ""
      } title="Iniciar este sistema">Start</button>
                           <button class="stop-btn action-btn ${
                             !isRunning ? "hidden" : ""
                           }" ${
        !isRunning ? "disabled" : ""
      } title="Parar este sistema (SIGTERM)">Stop</button>
                           <button class="force-stop-btn action-btn danger ${
                             !isRunning ? "hidden" : ""
                           }" ${
        !isRunning ? "disabled" : ""
      } title="Forçar parada deste sistema (SIGKILL / por porta)">Forçar Parada</button>
                           ${
                             hasDeploy
                               ? `<button class="deploy-btn action-btn" ${
                                   isRunning ? "disabled" : ""
                                 } title="Executar comando de deploy">Deploy</button>`
                               : ""
                           }
                           <button class="open-sys-vscode-btn action-btn" title="Abrir diretório do sistema no VS Code">VS Code</button>
                           <button class="edit-sys-btn action-btn" ${
                             isRunning ? "disabled" : ""
                           } title="${
        isRunning
          ? "Pare o sistema para editar"
          : "Editar configurações do sistema"
      }">Editar</button>
                           <button class="delete-sys-btn action-btn danger" ${
                             isRunning ? "disabled" : ""
                           } title="${
        isRunning ? "Pare o sistema para excluir" : "Excluir este sistema"
      }">Excluir</button>
                      </div>
                       <div class="status-indicator ${
                         isRunning ? "running" : "stopped"
                       }" title="${isRunning ? "Rodando" : "Parado"}"></div>
                  </div>
                  <div class="system-card-body">
                      <pre class="terminal-output"></pre> <!-- Conteúdo será preenchido abaixo -->
                  </div>
              `;
      systemsList.appendChild(card);

      // Preenche o terminal com o histórico armazenado
      const terminalOutput = card.querySelector(".terminal-output");
      terminalOutput.textContent = outputHistory; // Define o texto acumulado
      terminalOutput.scrollTop = terminalOutput.scrollHeight; // Rola para o final

      // Adiciona listeners aos botões do card
      const startBtn = card.querySelector(".start-btn");
      const stopBtn = card.querySelector(".stop-btn");
      const forceStopBtn = card.querySelector(".force-stop-btn"); // Botão novo
      const deployBtn = card.querySelector(".deploy-btn"); // Pode ser null
      const openVsCodeBtn = card.querySelector(".open-sys-vscode-btn");
      const editBtn = card.querySelector(".edit-sys-btn");
      const deleteBtn = card.querySelector(".delete-sys-btn");

      startBtn.addEventListener("click", () =>
        startSystemHandler(sys.id, card)
      );
      stopBtn.addEventListener("click", () => stopSystemHandler(sys.id, card));
      forceStopBtn.addEventListener("click", () =>
        forceStopSystemHandler(sys.id, card, sys.name)
      ); // Handler novo
      if (deployBtn)
        deployBtn.addEventListener("click", () =>
          deploySystemHandler(sys.id, card)
        );
      openVsCodeBtn.addEventListener("click", () =>
        window.electronAPI.openInVsCode(sys.directory)
      );
      // Adiciona verificação de estado nos handlers de edit/delete
      editBtn.addEventListener("click", () => {
        if (!systemIsRunning.get(sys.id)) {
          // Só permite editar se não estiver rodando
          openSystemModal(sys, selectedApplicationId);
        } else {
          alert("Pare o sistema antes de editar.");
        }
      });
      deleteBtn.addEventListener("click", () => {
        if (!systemIsRunning.get(sys.id)) {
          // Só permite excluir se não estiver rodando
          deleteSystemHandler(selectedApplicationId, sys.id, sys.name);
        } else {
          alert("Pare o sistema antes de excluir.");
        }
      });
    });
  }

  // --- Modal Handling ---
  function closeModal(modalElement) {
    modalElement.classList.add("hidden");
  }

  // Application Modal Logic (sem mudanças significativas)
  function openApplicationModal(app = null) {
    appForm.reset();
    if (app) {
      appModalTitle.textContent = "Editar Aplicação";
      appIdInput.value = app.id;
      appNameInput.value = app.name;
      appDirInput.value = app.directory || "";
    } else {
      appModalTitle.textContent = "Nova Aplicação";
      appIdInput.value = "";
    }
    appModal.classList.remove("hidden");
  }
  addApplicationBtn.addEventListener("click", () => openApplicationModal());
  appCloseBtn.addEventListener("click", () => closeModal(appModal));
  appCancelBtn.addEventListener("click", () => closeModal(appModal));
  appModal.addEventListener("click", (e) => {
    if (e.target === appModal) closeModal(appModal);
  });
  selectAppDirBtn.addEventListener("click", async () => {
    const result = await window.electronAPI.selectDirectory();
    if (result) appDirInput.value = result.directoryPath;
  });

  // System Modal Logic (sem mudanças significativas)
  function openSystemModal(system = null, applicationId) {
    sysForm.reset();
    sysDirFeedback.textContent = "";
    sysAppIdInput.value = applicationId; // Garante que sabemos a qual app pertence

    if (system) {
      sysModalTitle.textContent = "Editar Sistema";
      sysIdInput.value = system.id;
      sysNameInput.value = system.name;
      sysDirInput.value = system.directory;
      sysPortInput.value = system.port || "";
      sysStartCmdInput.value = system.startCommand;
      sysDeployCmdInput.value = system.deployCommand || "";
    } else {
      sysModalTitle.textContent = "Novo Sistema";
      sysIdInput.value = ""; // Limpa ID para novo sistema
      const parentApp = currentData.find((app) => app.id === applicationId);
      if (parentApp) sysNameInput.value = `${parentApp.name}-`; // Sugere nome
    }
    sysModal.classList.remove("hidden");
  }
  addSystemBtn.addEventListener("click", () => {
    if (selectedApplicationId) openSystemModal(null, selectedApplicationId);
    else alert("Erro: Nenhuma aplicação selecionada para adicionar sistema.");
  });
  sysCloseBtn.addEventListener("click", () => closeModal(sysModal));
  sysCancelBtn.addEventListener("click", () => closeModal(sysModal));
  sysModal.addEventListener("click", (e) => {
    if (e.target === sysModal) closeModal(sysModal);
  });
  selectSysDirBtn.addEventListener("click", async () => {
    const result = await window.electronAPI.selectDirectory();
    if (result) {
      sysDirInput.value = result.directoryPath;
      // Sugere completar nome se ainda não foi editado e é novo
      if (!sysIdInput.value && sysNameInput.value.endsWith("-")) {
        sysNameInput.value += result.directoryName;
      }
    }
  });

  // --- Form Submissions ---
  // Application Form Submit (sem mudanças)
  appForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const appData = {
      id: appIdInput.value || null,
      name: appNameInput.value.trim(),
      directory: appDirInput.value.trim() || null, // Envia null se vazio
    };
    if (!appData.name) return alert("Nome da aplicação é obrigatório.");

    const result = appData.id
      ? await window.electronAPI.updateApplication(appData)
      : await window.electronAPI.addApplication(appData);

    if (result.success) {
      currentData = result.data;
      renderApplications(); // Atualiza a lista de aplicações
      closeModal(appModal);
    } else {
      alert(`Erro ao salvar aplicação: ${result.error}`);
    }
  });

  // System Form Submit (sem mudanças significativas)
  sysForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const systemData = {
      id: sysIdInput.value || null,
      name: sysNameInput.value.trim(),
      directory: sysDirInput.value.trim(),
      port: sysPortInput.value ? parseInt(sysPortInput.value, 10) : null,
      startCommand: sysStartCmdInput.value.trim(),
      deployCommand: sysDeployCmdInput.value.trim() || null,
    };
    const applicationId = sysAppIdInput.value; // ID da aplicação pai

    if (
      !applicationId ||
      !systemData.name ||
      !systemData.directory ||
      !systemData.startCommand
    ) {
      return alert(
        "Aplicação pai, Nome, Diretório e Comando de Start são obrigatórios."
      );
    }
    if (systemData.port !== null && isNaN(systemData.port)) {
      // Verifica se port não é null antes de isNaN
      return alert("Porta deve ser um número válido.");
    }
    // Limpa campos opcionais se vazios para não salvar null explicitamente (opcional)
    if (systemData.port === null) delete systemData.port;
    if (systemData.deployCommand === null) delete systemData.deployCommand;

    const result = systemData.id
      ? await window.electronAPI.updateSystem(applicationId, systemData)
      : await window.electronAPI.addSystem(applicationId, systemData);

    if (result.success) {
      currentData = result.data; // Atualiza os dados completos
      // Re-renderiza a view de sistemas se ainda estiver nela
      if (
        systemsView.classList.contains("active-view") &&
        selectedApplicationId === applicationId
      ) {
        const updatedApp = currentData.find((app) => app.id === applicationId);
        if (updatedApp) {
          renderSystems(updatedApp.systems || [], updatedApp.name);
        } else {
          // Se app foi deletado enquanto modal estava aberto? Volta pra lista.
          showApplicationsView();
        }
      } else if (!systemsView.classList.contains("active-view")) {
        // Se estava na view de aplicações, apenas atualiza os dados (já feito)
        // e talvez re-renderiza a lista de aplicações para atualizar contagem
        renderApplications();
      }
      closeModal(sysModal);
    } else {
      alert(`Erro ao salvar sistema: ${result.error}`);
    }
  });

  // --- Action Handlers ---
  // Delete Application (sem mudanças significativas)
  async function deleteApplicationHandler(appId, appName) {
    if (
      confirm(
        `Tem certeza que deseja excluir a aplicação "${escapeHtml(
          appName
        )}" e todos os seus sistemas?\nOS PROCESSOS EM EXECUÇÃO SERÃO PARADOS.`
      )
    ) {
      const result = await window.electronAPI.deleteApplication(appId);
      if (result.success) {
        currentData = result.data;
        // Limpa estados dos sistemas deletados
        const appToDelete = currentData.find((a) => a.id === appId); // App não existe mais nos dados recebidos
        // Se precisamos dos sistemas deletados, teríamos que pegar ANTES do delete
        // Por simplicidade, apenas removemos todos os estados que possam ter ficado órfãos
        // (Alternativa: main.js poderia retornar os IDs deletados)
        terminalOutputs.forEach((_, key) => {
          const exists = currentData.some(
            (app) => app.systems && app.systems.some((sys) => sys.id === key)
          );
          if (!exists) terminalOutputs.delete(key);
        });
        systemIsRunning.forEach((_, key) => {
          const exists = currentData.some(
            (app) => app.systems && app.systems.some((sys) => sys.id === key)
          );
          if (!exists) systemIsRunning.delete(key);
        });

        renderApplications(); // Atualiza a lista
      } else {
        alert(`Erro ao excluir aplicação: ${result.error}`);
      }
    }
  }

  // Delete System (Modificado para limpar estado)
  async function deleteSystemHandler(applicationId, systemId, systemName) {
    // Verifica novamente se está rodando antes de confirmar
    if (systemIsRunning.get(systemId)) {
      alert("Pare o sistema antes de excluir.");
      return;
    }
    if (
      confirm(
        `Tem certeza que deseja excluir o sistema "${escapeHtml(systemName)}"?`
      )
    ) {
      // Já verificamos que não está rodando
      const result = await window.electronAPI.deleteSystem(
        applicationId,
        systemId
      );
      if (result.success) {
        currentData = result.data;
        // Limpa estado do sistema deletado
        terminalOutputs.delete(systemId);
        systemIsRunning.delete(systemId);

        // Re-renderiza a view de sistemas se ainda estiver nela
        if (
          systemsView.classList.contains("active-view") &&
          selectedApplicationId === applicationId
        ) {
          const updatedApp = currentData.find(
            (app) => app.id === applicationId
          );
          if (updatedApp) {
            renderSystems(updatedApp.systems || [], updatedApp.name);
          } else {
            showApplicationsView(); // Volta se app não existe mais
          }
        } else {
          renderApplications(); // Atualiza contagem na view de aplicações
        }
      } else {
        alert(`Erro ao excluir sistema: ${result.error}`);
      }
    }
  }

  // Start System (Modificado para gerenciar estado e UI)
  function startSystemHandler(systemId, card) {
    // Limpa visualmente e armazena estado inicial no histórico
    const terminal = card.querySelector(".terminal-output");
    const initialMsg = `--- Iniciando ${
      card.querySelector(".system-info h4").textContent
    }... ---\n`;
    terminal.textContent = initialMsg; // Limpa visualização
    terminalOutputs.set(systemId, initialMsg); // Define histórico inicial

    // Atualiza estado interno
    systemIsRunning.set(systemId, true);

    // Atualiza UI (botões e status)
    const startBtn = card.querySelector(".start-btn");
    const stopBtn = card.querySelector(".stop-btn");
    const forceStopBtn = card.querySelector(".force-stop-btn");
    const statusIndicator = card.querySelector(".status-indicator");
    card
      .querySelectorAll(".deploy-btn, .edit-sys-btn, .delete-sys-btn")
      .forEach((btn) => (btn.disabled = true)); // Desabilita outras ações

    startBtn.disabled = true;
    startBtn.classList.add("hidden");
    stopBtn.classList.remove("hidden");
    stopBtn.disabled = false;
    forceStopBtn.classList.remove("hidden"); // Mostra "Forçar Parada"
    forceStopBtn.disabled = false;
    statusIndicator.className = "status-indicator starting";
    statusIndicator.title = "Iniciando...";

    // Envia comando para main process
    window.electronAPI.startSystem(selectedApplicationId, systemId);
  }

  // Stop System (Modificado para gerenciar UI)
  function stopSystemHandler(systemId, card) {
    const stopBtn = card.querySelector(".stop-btn");
    const forceStopBtn = card.querySelector(".force-stop-btn");
    const statusIndicator = card.querySelector(".status-indicator");

    // Desabilita botões de parada e atualiza status visualmente
    stopBtn.disabled = true;
    forceStopBtn.disabled = true; // Desabilita também o forçar parada durante parada normal
    statusIndicator.className = "status-indicator stopping";
    statusIndicator.title = "Parando...";

    // Envia comando para main process
    window.electronAPI.stopSystem(systemId);
    // A atualização final da UI (botões, status) ocorrerá no evento 'onSystemStopped'
  }

  // NOVO: Handler para Forçar Parada
  async function forceStopSystemHandler(systemId, card, systemName) {
    if (
      confirm(
        `Tem certeza que deseja FORÇAR A PARADA do sistema "${escapeHtml(
          systemName
        )}"?\nIsso tentará matar o processo imediatamente (SIGKILL) e também buscar pela porta definida, se houver.`
      )
    ) {
      const stopBtn = card.querySelector(".stop-btn");
      const forceStopBtn = card.querySelector(".force-stop-btn");
      const statusIndicator = card.querySelector(".status-indicator");

      // Desabilita botões e atualiza status
      if (stopBtn) stopBtn.disabled = true;
      forceStopBtn.disabled = true;
      statusIndicator.className = "status-indicator stopping"; // Mesmo status visual de parada
      statusIndicator.title = "Forçando parada...";

      // Adiciona mensagem ao terminal localmente *antes* de chamar
      const terminal = card.querySelector(".terminal-output");
      const msg = "\n--- Enviando comando para forçar parada... ---\n";
      const currentHistory = terminalOutputs.get(systemId) || "";
      terminalOutputs.set(systemId, currentHistory + msg);
      if (terminal) {
        // Verifica se terminal ainda existe
        terminal.textContent += msg;
        terminal.scrollTop = terminal.scrollHeight;
      }

      try {
        // Chama o IPC para forçar parada
        const result = await window.electronAPI.forceStopSystem(
          selectedApplicationId,
          systemId
        );
        console.log(`Resultado Force Stop para ${systemId}:`, result);
        // Mensagem de resultado (opcional, main.js já envia output)
        // const resultMsg = `--- Tentativa de forçar parada concluída (Original: ${result.killedOriginal}, Porta ${result.portAttempted ? result.portAttempted : 'N/A'}: ${result.killedByPort}). ---\n`;
        // terminalOutputs.set(systemId, (terminalOutputs.get(systemId) || '') + resultMsg);
        // if (terminal) terminal.textContent += resultMsg;

        // Espera o evento 'onSystemStopped' que será disparado pelo main.js para atualizar a UI final.
      } catch (error) {
        console.error("Erro no renderer ao chamar forceStopSystem:", error);
        alert(`Erro ao tentar forçar parada: ${error.message}`);
        // Tenta reverter UI para estado parado se falhar aqui? Ou confiar no stopped?
        const finalMsg = `\n--- Erro no cliente ao forçar parada: ${error.message} ---\n`;
        terminalOutputs.set(
          systemId,
          (terminalOutputs.get(systemId) || "") + finalMsg
        );
        if (terminal) terminal.textContent += finalMsg;
        // Força UI para estado parado como fallback
        updateUIStopped(systemId);
      }
    }
  }

  // Deploy System (Modificado para desabilitar botões de parada)
  function deploySystemHandler(systemId, card) {
    const terminal = card.querySelector(".terminal-output");
    const deployBtn = card.querySelector(".deploy-btn");
    const statusIndicator = card.querySelector(".status-indicator");

    // Desabilita botões de controle durante deploy
    card
      .querySelectorAll(
        ".start-btn, .stop-btn, .force-stop-btn, .edit-sys-btn, .delete-sys-btn"
      )
      .forEach((btn) => (btn.disabled = true));

    terminal.textContent = "--- Iniciando deploy... ---\n"; // Limpa visual
    // Não limpa o histórico principal aqui, apenas adiciona
    const deployStartMsg = "--- Iniciando deploy... ---\n";
    terminalOutputs.set(
      systemId,
      (terminalOutputs.get(systemId) || "") + deployStartMsg
    );

    if (deployBtn) {
      deployBtn.disabled = true;
      deployBtn.textContent = "Deploying...";
    }
    statusIndicator.className = "status-indicator deploying";
    statusIndicator.title = "Deploying...";

    window.electronAPI.deploySystem(selectedApplicationId, systemId);
    // A reabilitação dos botões corretos ocorre em 'onSystemDeployed'
  }

  // --- IPC Listeners ---

  // MODIFICADO: onSystemOutput para usar e limitar histórico
  window.electronAPI.onSystemOutput(({ systemId, data, type }) => {
    // Atualiza o histórico armazenado
    let currentHistory = terminalOutputs.get(systemId) || "";
    currentHistory += data;

    // Limita o histórico para evitar consumo excessivo de memória
    const MAX_OUTPUT_LENGTH = 20000; // Limite de caracteres (ajuste conforme necessário)
    if (currentHistory.length > MAX_OUTPUT_LENGTH) {
      currentHistory = currentHistory.substring(
        currentHistory.length - MAX_OUTPUT_LENGTH
      );
      // Adiciona um aviso de que o log foi truncado (apenas uma vez)
      const truncationWarning = "\n--- (Log anterior truncado) ---\n";
      if (!currentHistory.startsWith(truncationWarning.trim())) {
        currentHistory = truncationWarning + currentHistory;
      }
    }
    terminalOutputs.set(systemId, currentHistory);

    // Atualiza a UI somente se a view de sistemas estiver ativa e o card existir
    if (systemsView.classList.contains("active-view")) {
      const card = systemsList.querySelector(
        `.system-card[data-system-id="${systemId}"]`
      );
      if (card) {
        const terminalOutput = card.querySelector(".terminal-output");
        const statusIndicator = card.querySelector(".status-indicator");

        // Se estava "Iniciando", muda para "Rodando" no primeiro output
        if (statusIndicator.classList.contains("starting")) {
          statusIndicator.className = "status-indicator running";
          statusIndicator.title = "Rodando";
          // Garante que botões de parada estão habilitados
          card.querySelector(".stop-btn").disabled = false;
          card.querySelector(".force-stop-btn").disabled = false;
        }

        // Atualiza o conteúdo do terminal visível com o histórico (limitado)
        terminalOutput.textContent = currentHistory;
        // Rola para o final
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
      }
    }
  });

  // Função auxiliar para atualizar UI para estado parado
  function updateUIStopped(systemId) {
    // Atualiza estado interno
    systemIsRunning.set(systemId, false);

    // Tenta atualizar a UI se o card estiver visível
    if (systemsView.classList.contains("active-view")) {
      const card = systemsList.querySelector(
        `.system-card[data-system-id="${systemId}"]`
      );
      if (card) {
        const startBtn = card.querySelector(".start-btn");
        const stopBtn = card.querySelector(".stop-btn");
        const forceStopBtn = card.querySelector(".force-stop-btn");
        const statusIndicator = card.querySelector(".status-indicator");
        // Reabilita outras ações
        card
          .querySelectorAll(".deploy-btn, .edit-sys-btn, .delete-sys-btn")
          .forEach((btn) => {
            if (btn) btn.disabled = false; // Verifica se botão existe (deploy é opcional)
          });

        startBtn.disabled = false;
        startBtn.classList.remove("hidden");
        stopBtn.classList.add("hidden");
        stopBtn.disabled = false; // Re-habilita para futura ação
        forceStopBtn.classList.add("hidden");
        forceStopBtn.disabled = false; // Re-habilita para futura ação
        statusIndicator.className = "status-indicator stopped";
        statusIndicator.title = "Parado";

        // Adiciona mensagem final ao terminal (opcional)
        const terminal = card.querySelector(".terminal-output");
        const msg = "\n--- Processo Parado ---\n";
        const currentHistory = terminalOutputs.get(systemId) || "";
        // Evita adicionar múltiplas mensagens de parada
        if (!currentHistory.endsWith(msg)) {
          terminalOutputs.set(systemId, currentHistory + msg);
          if (terminal) {
            // Verifica se terminal ainda existe
            terminal.textContent += msg;
            terminal.scrollTop = terminal.scrollHeight;
          }
        }
      }
    }
  }

  // MODIFICADO: onSystemStopped usa a função auxiliar
  window.electronAPI.onSystemStopped(({ systemId }) => {
    console.log(`Evento onSystemStopped recebido para ${systemId}`);
    updateUIStopped(systemId);
  });

  // MODIFICADO: onSystemDeployed para reabilitar botões corretamente
  window.electronAPI.onSystemDeployed(({ systemId, success }) => {
    // Atualiza a UI somente se a view de sistemas estiver ativa e o card existir
    if (systemsView.classList.contains("active-view")) {
      const card = systemsList.querySelector(
        `.system-card[data-system-id="${systemId}"]`
      );
      if (card) {
        const deployBtn = card.querySelector(".deploy-btn");
        const statusIndicator = card.querySelector(".status-indicator");
        const terminalOutput = card.querySelector(".terminal-output");

        // Reabilita botão de deploy
        if (deployBtn) {
          deployBtn.disabled = false;
          deployBtn.textContent = "Deploy";
        }

        // Verifica o estado 'isRunning' para reabilitar outros botões corretamente
        const isRunning = systemIsRunning.get(systemId) === true;
        card.querySelector(".start-btn").disabled = isRunning;
        card.querySelector(".stop-btn").disabled = !isRunning;
        card.querySelector(".force-stop-btn").disabled = !isRunning;
        card
          .querySelectorAll(".edit-sys-btn, .delete-sys-btn")
          .forEach((btn) => (btn.disabled = isRunning));

        // Define o status pós-deploy
        // Se o sistema ainda estiver rodando (o deploy não o parou), mantém 'running'
        if (isRunning) {
          statusIndicator.className = "status-indicator running";
          statusIndicator.title = success
            ? "Rodando (Deploy Concluído)"
            : "Rodando (Falha no Deploy)";
        } else {
          statusIndicator.className = "status-indicator stopped";
          statusIndicator.title = success
            ? "Deploy Concluído"
            : "Falha no Deploy";
        }

        // Adiciona mensagem final ao terminal
        const span = document.createElement("span");
        span.className = success ? "output-success" : "output-error";
        span.textContent = success
          ? "\n--- Deploy concluído com sucesso ---\n"
          : "\n--- Falha no Deploy ---\n";
        const currentHistory =
          (terminalOutputs.get(systemId) || "") + span.textContent; // Salva texto simples
        terminalOutputs.set(systemId, currentHistory);
        if (terminalOutput) {
          // Verifica se terminal ainda existe
          terminalOutput.textContent = currentHistory; // Atualiza com histórico + mensagem
          terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
      }
    }
  });

  // --- Initial Load & Setup ---
  async function loadInitialData() {
    try {
      currentData = await window.electronAPI.loadData();
      // Limpa estados persistentes ao iniciar (ou poderia tentar recuperá-los de alguma forma)
      terminalOutputs.clear();
      systemIsRunning.clear();
      console.log("Dados carregados, mostrando view de aplicações.");
      showApplicationsView(); // Começa na view de aplicações
    } catch (error) {
      console.error("Erro fatal ao carregar dados:", error);
      applicationsList.innerHTML =
        '<p class="error-state">Erro crítico ao carregar dados. Verifique os logs ou tente reiniciar.</p>';
    }
  }

  // Navigation Listeners
  backToAppsBtn.addEventListener("click", showApplicationsView);

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    console.log("Limpando listeners IPC antes de descarregar.");
    window.electronAPI.removeListener("system-output");
    window.electronAPI.removeListener("system-stopped");
    window.electronAPI.removeListener("system-deployed");
  });

  // Carrega os dados iniciais ao carregar a página
  loadInitialData();
}); // Fim do DOMContentLoaded
