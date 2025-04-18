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
  const startAllBtn = document.getElementById("start-all-btn"); // Botão geral na header

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
  const sysDebugModeCheckbox = document.getElementById("system-debug-mode"); // <-- Checkbox Debug

  // --- State ---
  let currentData = []; // Holds the array of applications [{id, name, directory, systems: [{id, name,...}]}]
  let selectedApplicationId = null;
  let selectedApplicationName = ""; // Guarda nome para exibição e feedback

  // Estados persistentes enquanto o app está aberto
  const terminalOutputs = new Map(); // Maps systemId -> string (HTML content)
  const systemIsRunning = new Map(); // Maps systemId -> boolean

  // --- Utility ---
  // Basic HTML escape function (important when using innerHTML)
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
    // Não limpa selectedApplicationId aqui para persistir a última view de sistema visitada
    applicationsView.classList.add("active-view");
    systemsView.classList.remove("active-view");
    renderApplications(); // Re-render para refletir qualquer mudança nos dados (ex: contagem de sistemas)
    selectedApplicationId = null; // Limpa seleção ao voltar para lista principal
    selectedApplicationName = "";
  }

  function showSystemsView(applicationId) {
    const app = currentData.find((a) => a.id === applicationId);
    if (!app) {
      console.error(
        "[Renderer] Aplicação não encontrada para exibir sistemas:",
        applicationId
      );
      showApplicationsView(); // Volta se app não existe
      return;
    }
    // Define o estado da view atual
    selectedApplicationId = applicationId;
    selectedApplicationName = app.name; // Guarda o nome
    systemsViewTitle.textContent = `Sistemas de: ${escapeHtml(app.name)}`;

    // Troca as views visíveis
    applicationsView.classList.remove("active-view");
    systemsView.classList.add("active-view");

    // Renderiza os sistemas usando o estado persistente
    renderSystems(app.systems || [], app.name); // Passa array vazio se não houver sistemas

    // Atualiza o handler do botão "Iniciar Todos" para a aplicação atual
    startAllBtn.onclick = () => {
      console.log(
        `[Renderer] Botão Iniciar Todos (Header) clicado para App ID ${selectedApplicationId}`
      );
      if (selectedApplicationId) {
        // Adiciona confirmação opcional
        if (
          confirm(`Iniciar todos os sistemas para "${escapeHtml(app.name)}"?`)
        ) {
          window.electronAPI.startAllSystems(selectedApplicationId);
        }
      }
    };
    // Habilita/desabilita o botão Iniciar Todos se há sistemas
    startAllBtn.disabled = !app.systems || app.systems.length === 0;
  }

  // --- Rendering ---

  function renderApplications() {
    applicationsList.innerHTML = ""; // Limpa lista anterior
    if (!currentData || currentData.length === 0) {
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
      const systemCount = Array.isArray(app.systems) ? app.systems.length : 0;
      const systemsText =
        systemCount === 1 ? "1 sistema" : `${systemCount} sistemas`;

      appElement.innerHTML = `
              <div class="app-item-info">
                  <h3>${escapeHtml(app.name)}</h3>
                  <small class="directory-path ${
                    !hasDir ? "dimmed" : ""
                  }">${dirDisplay}</small>
                  <small class="system-count">${systemsText}</small> <!-- Mostra contagem -->
              </div>
              <div class="app-item-actions">
                  <button class="action-btn view-systems-btn" title="Ver os sistemas desta aplicação">Ver Sistemas (${systemCount})</button>
                  ${
                    hasDir
                      ? `<button class="action-btn open-app-vscode-btn" title="Abrir diretório da aplicação no VS Code">Abrir VS Code</button>`
                      : ""
                  }
                  <button class="action-btn start-all-app-btn" title="Iniciar todos os sistemas desta aplicação" ${
                    systemCount === 0 ? "disabled" : ""
                  }>Iniciar Todos</button>
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
          .addEventListener("click", () => {
            window.electronAPI.openInVsCode(app.directory);
          });
      }

      // Listener para Iniciar Todos da Aplicação (no card)
      const startAllCardBtn = appElement.querySelector(".start-all-app-btn");
      if (startAllCardBtn) {
        // Verifica se o botão existe
        startAllCardBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // Previne evento do item principal
          console.log(
            `[Renderer] Botão Iniciar Todos (Card) clicado para App ID ${app.id}`
          );
          if (
            confirm(`Iniciar todos os sistemas para "${escapeHtml(app.name)}"?`)
          ) {
            // Navega para a view de sistemas E ENTÃO inicia todos
            showSystemsView(app.id);
            // Pequeno delay para permitir renderização da view antes de iniciar
            setTimeout(() => {
              console.log(
                `[Renderer] Enviando comando startAllSystems para App ID ${app.id}`
              );
              window.electronAPI.startAllSystems(app.id);
            }, 200); // Pequeno delay
          }
        });
      }

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

  // MODIFICADO: renderSystems para usar estado persistente e innerHTML
  function renderSystems(systems, parentAppName) {
    systemsList.innerHTML = ""; // Limpa view anterior
    if (!systems || systems.length === 0) {
      systemsList.innerHTML = `<p class="empty-state">Nenhum sistema cadastrado para "${escapeHtml(
        parentAppName
      )}". Clique em "Novo Sistema".</p>`;
      // Desabilita botão geral Iniciar Todos se não há sistemas
      startAllBtn.disabled = true;
      return;
    }
    // Habilita botão geral Iniciar Todos se há sistemas
    startAllBtn.disabled = false;

    systems.forEach((sys) => {
      const card = document.createElement("div");
      card.className = "system-card";
      card.dataset.systemId = sys.id; // ID para referenciar o card

      const hasDeploy = sys.deployCommand && sys.deployCommand.trim() !== "";
      const portDisplay = sys.port ? ` (Porta: ${sys.port})` : "";
      const isDebug =
        sys.debugMode === true
          ? ' <span class="debug-indicator">(Debug)</span>'
          : ""; // Indicador Debug

      // Recupera o estado atual do sistema
      const isRunning = systemIsRunning.get(sys.id) || false; // Default para false se não existir
      const outputHistory = terminalOutputs.get(sys.id) || ""; // Histórico do terminal (HTML)

      // Monta o HTML do card com estados iniciais corretos
      card.innerHTML = `
              <div class="system-card-header">
                  <div class="system-info">
                      <h4>${escapeHtml(sys.name)}${isDebug}${portDisplay}</h4>
                      <small class="directory-path">${escapeHtml(
                        sys.directory
                      )}</small>
                  </div>
                  <div class="system-actions">
                      <button class="start-btn action-btn" ${
                        isRunning ? "hidden disabled" : ""
                      } title="Iniciar este sistema">Start</button>
                      <button class="stop-btn action-btn" ${
                        !isRunning ? "hidden disabled" : ""
                      } title="Parar este sistema (SIGTERM/Tree Kill)">Stop</button>
                      <button class="force-stop-btn action-btn danger" ${
                        !isRunning ? "hidden disabled" : ""
                      } title="Forçar parada deste sistema (SIGKILL + Porta)">Forçar Parada</button>
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
                  <pre class="terminal-output">${outputHistory}</pre> <!-- Usa innerHTML -->
              </div>
          `;
      systemsList.appendChild(card);

      // Preenche o terminal com o histórico armazenado (já feito via innerHTML)
      const terminalOutput = card.querySelector(".terminal-output");
      // Rola para o final APÓS renderizar
      terminalOutput.scrollTop = terminalOutput.scrollHeight;

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

      if (deployBtn) {
        deployBtn.addEventListener("click", () =>
          deploySystemHandler(sys.id, card, sys.name)
        ); // Passa nome para confirmação
      }
      openVsCodeBtn.addEventListener("click", () => {
        if (sys.directory) window.electronAPI.openInVsCode(sys.directory);
      });

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
    appForm.reset(); // Limpa o formulário
    if (app) {
      // Editando existente
      appModalTitle.textContent = "Editar Aplicação";
      appIdInput.value = app.id;
      appNameInput.value = app.name;
      appDirInput.value = app.directory || ""; // Garante que não seja null
    } else {
      // Nova aplicação
      appModalTitle.textContent = "Nova Aplicação";
      appIdInput.value = ""; // Limpa ID
    }
    appModal.classList.remove("hidden");
    appNameInput.focus(); // Foco no nome
  }

  // System Modal Logic (MODIFICADO para incluir debugMode)
  function openSystemModal(system = null, applicationId) {
    sysForm.reset(); // Limpa o formulário
    sysDirFeedback.textContent = ""; // Limpa feedback
    sysAppIdInput.value = applicationId; // Garante que sabemos a qual app pertence

    if (system) {
      // Editando
      sysModalTitle.textContent = "Editar Sistema";
      sysIdInput.value = system.id;
      sysNameInput.value = system.name;
      sysDirInput.value = system.directory;
      sysPortInput.value = system.port || "";
      sysStartCmdInput.value = system.startCommand;
      sysDeployCmdInput.value = system.deployCommand || "";
      sysDebugModeCheckbox.checked = system.debugMode === true; // <-- Define checkbox
    } else {
      // Novo
      sysModalTitle.textContent = "Novo Sistema";
      sysIdInput.value = ""; // Limpa ID para novo sistema
      sysDebugModeCheckbox.checked = false; // <-- Default checkbox
      // Tenta sugerir nome baseado na aplicação pai (se houver)
      const parentApp = currentData.find((app) => app.id === applicationId);
      if (parentApp) {
        // sysNameInput.value = `${parentApp.name}-`; // Sugestão simples
      }
    }
    sysModal.classList.remove("hidden");
    sysNameInput.focus(); // Foco no nome
  }

  // --- Event Listeners for Modals ---

  // Application Modal Listeners
  addApplicationBtn.addEventListener("click", () => openApplicationModal());
  appCloseBtn.addEventListener("click", () => closeModal(appModal));
  appCancelBtn.addEventListener("click", () => closeModal(appModal));
  appModal.addEventListener("click", (e) => {
    // Fecha ao clicar fora
    if (e.target === appModal) {
      closeModal(appModal);
    }
  });
  selectAppDirBtn.addEventListener("click", async () => {
    const result = await window.electronAPI.selectDirectory();
    if (result) {
      appDirInput.value = result.directoryPath;
    }
  });

  // System Modal Listeners
  addSystemBtn.addEventListener("click", () => {
    if (selectedApplicationId) {
      openSystemModal(null, selectedApplicationId);
    } else {
      alert("Erro: Nenhuma aplicação selecionada para adicionar sistema.");
    }
  });
  sysCloseBtn.addEventListener("click", () => closeModal(sysModal));
  sysCancelBtn.addEventListener("click", () => closeModal(sysModal));
  sysModal.addEventListener("click", (e) => {
    // Fecha ao clicar fora
    if (e.target === sysModal) {
      closeModal(sysModal);
    }
  });
  selectSysDirBtn.addEventListener("click", async () => {
    const result = await window.electronAPI.selectDirectory();
    if (result) {
      sysDirInput.value = result.directoryPath;
      sysDirFeedback.textContent = `Selecionado: ${result.directoryName}`;
      // Sugere completar nome se ainda não foi editado e é novo sistema
      if (
        (!sysIdInput.value && sysNameInput.value === "") ||
        sysNameInput.value.endsWith("-")
      ) {
        // Tenta usar o nome do diretório como sugestão
        // sysNameInput.value = sysNameInput.value.replace(/-$/, '') + result.directoryName; // Completa ou adiciona
      }
    }
  });

  // --- Form Submissions ---

  // Application Form Submit (sem mudanças significativas)
  appForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const appData = {
      id: appIdInput.value || null, // Envia null se for novo
      name: appNameInput.value.trim(),
      directory: appDirInput.value.trim() || null, // Envia null se vazio
    };

    if (!appData.name) {
      return alert("Nome da aplicação é obrigatório.");
    }

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

  // System Form Submit (MODIFICADO para incluir debugMode)
  sysForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const systemData = {
      id: sysIdInput.value || null,
      name: sysNameInput.value.trim(),
      directory: sysDirInput.value.trim(),
      port: sysPortInput.value ? parseInt(sysPortInput.value, 10) : null,
      startCommand: sysStartCmdInput.value.trim(),
      deployCommand: sysDeployCmdInput.value.trim() || null, // Envia null se vazio
      debugMode: sysDebugModeCheckbox.checked, // <-- Inclui estado do checkbox
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
    // Valida porta se preenchida
    if (
      sysPortInput.value &&
      (isNaN(systemData.port) || systemData.port === null)
    ) {
      return alert("Porta deve ser um número válido se preenchida.");
    }
    // Limpa campos opcionais se vazios para não salvar null explicitamente (opcional, depende do backend)
    // Já estamos tratando null/undefined no backend, então não é estritamente necessário aqui.

    const result = systemData.id
      ? await window.electronAPI.updateSystem(applicationId, systemData)
      : await window.electronAPI.addSystem(applicationId, systemData);

    if (result.success) {
      currentData = result.data; // Atualiza os dados completos
      // Re-renderiza a view de sistemas se ainda estiver nela E for a aplicação correta
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
      } else if (applicationsView.classList.contains("active-view")) {
        // Se estava na view de aplicações, apenas atualiza os dados (já feito)
        // e re-renderiza a lista de apps para atualizar contagem de sistemas
        renderApplications();
      }
      closeModal(sysModal);
    } else {
      alert(`Erro ao salvar sistema: ${result.error}`);
    }
  });

  // --- Action Handlers ---

  // Delete Application (Modificado para limpar estados órfãos de forma mais simples)
  async function deleteApplicationHandler(appId, appName) {
    if (
      confirm(
        `Tem certeza que deseja excluir a aplicação "${escapeHtml(
          appName
        )}" e todos os seus sistemas?\n\nPROCESSOS EM EXECUÇÃO SERÃO PARADOS.`
      )
    ) {
      const result = await window.electronAPI.deleteApplication(appId);
      if (result.success) {
        // Pega os sistemas que *seriam* deletados para limpar o estado local
        const appBeingDeleted = currentData.find((a) => a.id === appId);
        if (appBeingDeleted && Array.isArray(appBeingDeleted.systems)) {
          appBeingDeleted.systems.forEach((sys) => {
            terminalOutputs.delete(sys.id);
            systemIsRunning.delete(sys.id);
          });
        }

        currentData = result.data; // Atualiza dados locais com a resposta do main
        console.log(`[Renderer] Aplicação ${appId} deletada localmente.`);

        // Se a view de sistemas deletada estava ativa, volta para aplicações
        if (
          systemsView.classList.contains("active-view") &&
          selectedApplicationId === appId
        ) {
          showApplicationsView();
        } else {
          renderApplications(); // Atualiza a lista de aplicações
        }
      } else {
        alert(`Erro ao excluir aplicação: ${result.error}`);
      }
    }
  }

  // Delete System (Modificado para limpar estado)
  async function deleteSystemHandler(applicationId, systemId, systemName) {
    // Verifica novamente se está rodando antes de confirmar (UI pode ter mudado)
    if (systemIsRunning.get(systemId)) {
      alert(`Pare o sistema "${escapeHtml(systemName)}" antes de excluir.`);
      return;
    }

    if (
      confirm(
        `Tem certeza que deseja excluir o sistema "${escapeHtml(systemName)}"?`
      )
    ) {
      const result = await window.electronAPI.deleteSystem(
        applicationId,
        systemId
      );
      if (result.success) {
        currentData = result.data; // Atualiza os dados locais

        // Limpa estado do sistema deletado
        terminalOutputs.delete(systemId);
        systemIsRunning.delete(systemId);
        console.log(`[Renderer] Estado local para sistema ${systemId} limpo.`);

        // Re-renderiza a view de sistemas se ainda estiver nela E for a aplicação correta
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
        } else if (applicationsView.classList.contains("active-view")) {
          renderApplications(); // Atualiza contagem na view de aplicações
        }
      } else {
        alert(`Erro ao excluir sistema: ${result.error}`);
      }
    }
  }

  // Start System (Modificado para gerenciar estado e UI)
  function startSystemHandler(systemId, card) {
    const terminal = card.querySelector(".terminal-output");
    const systemName = card
      .querySelector(".system-info h4")
      .textContent.split("(")[0]
      .trim(); // Pega nome
    const initialMsgHtml = `<span class="output-info">--- [INFO] Iniciando ${escapeHtml(
      systemName
    )}... ---</span><br>`;

    terminalOutputs.set(systemId, initialMsgHtml);
    terminal.innerHTML = initialMsgHtml; // Atualiza a UI com HTML

    // Garante scroll inicial
    setTimeout(() => {
      if (terminal) {
        // Verifica se ainda existe
        terminal.scrollTop = terminal.scrollHeight;
      }
    }, 0);

    systemIsRunning.set(systemId, true);
    updateCardUIState(card, systemId, "starting");
    window.electronAPI.startSystem(selectedApplicationId, systemId);
  }
  // Stop System (Modificado para gerenciar UI e usar stopSystem)
  function stopSystemHandler(systemId, card) {
    // Desabilita botes de parada e atualiza status visualmente
    updateCardUIState(card, systemId, "stopping");

    // Adiciona mensagem ao terminal localmente
    const terminal = card.querySelector(".terminal-output");
    const stopMsgHtml = `<br><span class="output-info">--- [INFO] Enviando comando de parada... ---</span>`;
    let currentHistory = terminalOutputs.get(systemId) || "";
    currentHistory += stopMsgHtml;
    terminalOutputs.set(systemId, currentHistory);
    if (terminal) {
      terminal.innerHTML = currentHistory; // Atualiza UI
      terminal.scrollTop = terminal.scrollHeight; // Rola
    }

    // Envia comando para main process
    window.electronAPI.stopSystem(systemId); // Passa apenas systemId

    // A atualização FINAL da UI (botes, status) ocorrerá no evento onSystemStopped
  }

  // NOVO Handler para Forar Parada
  async function forceStopSystemHandler(systemId, card, systemName) {
    if (
      confirm(
        `Tem certeza que deseja FORÇAR A PARADA do sistema "${escapeHtml(
          systemName
        )}"?\n\nIsso tentará matar o processo imediatamente (SIGKILL) e também buscar pela porta definida, se houver.`
      )
    ) {
      // Desabilita botes e atualiza status
      updateCardUIState(card, systemId, "stopping"); // Mesmo status visual de 'stopping'

      // Adiciona mensagem ao terminal localmente antes de chamar
      const terminal = card.querySelector(".terminal-output");
      const forceMsgHtml = `<br><span class="output-info">--- [INFO] Enviando comando para FORÇAR parada... ---</span>`;
      let currentHistory = terminalOutputs.get(systemId) || "";
      currentHistory += forceMsgHtml;
      terminalOutputs.set(systemId, currentHistory);
      if (terminal) {
        // Verifica se terminal ainda existe
        terminal.innerHTML = currentHistory;
        terminal.scrollTop = terminal.scrollHeight;
      }

      try {
        // Chama o IPC para forçar parada
        const result = await window.electronAPI.forceStopSystem(
          selectedApplicationId,
          systemId
        );
        console.log(
          `[Renderer] Resultado Force Stop para ${systemId}:`,
          result
        );

        // Adiciona mensagem de resultado (opcional, main.js já envia output detalhado)
        const resultMsgHtml = `<br><span class="output-${
          result.success ? "info" : "error"
        }">--- [INFO] Tentativa de forçar parada concluída. Original Kill: ${
          result.killedOriginal
        }, Porta ${
          result.portAttempted ? `(${result.portAttempted})` : "N/A"
        } Kill: ${result.killedByPort}. ---</span>`;
        currentHistory = terminalOutputs.get(systemId) || ""; // Pega histórico atualizado pelo main
        currentHistory += resultMsgHtml;
        terminalOutputs.set(systemId, currentHistory);
        if (terminal) {
          // Verifica se terminal ainda existe
          terminal.innerHTML = currentHistory; // Atualiza UI
          terminal.scrollTop = terminal.scrollHeight; // Rola
        }
        // Espera o evento onSystemStopped que SERÁ disparado pelo main.js (na finalização do handle) para atualizar a UI final.
      } catch (error) {
        console.error(
          "[Renderer] Erro no renderer ao chamar forceStopSystem:",
          error
        );
        alert(`Erro ao tentar forçar parada: ${error.message}`);
        // Tenta reverter UI para estado parado como fallback se a chamada falhar aqui
        const errorMsgHtml = `<br><span class="output-error">--- [ERRO] Erro no cliente ao tentar forçar parada: ${error.message} ---</span>`;
        currentHistory = terminalOutputs.get(systemId) || ""; // Pega histórico
        currentHistory += errorMsgHtml;
        terminalOutputs.set(systemId, currentHistory);
        if (terminal) {
          // Verifica se terminal ainda existe
          terminal.innerHTML = currentHistory; // Atualiza UI
          terminal.scrollTop = terminal.scrollHeight; // Rola
        }
        // Força UI para estado parado como fallback
        updateUIStopped(systemId);
      }
    }
  }

  // Deploy System (MODIFICADO para confirmação e UI)
  function deploySystemHandler(systemId, card, systemName) {
    // --- INÍCIO: Confirmação de Deploy ---
    if (
      !confirm(
        `Tem certeza que deseja executar o DEPLOY para o sistema "${escapeHtml(
          systemName
        )}"?`
      )
    ) {
      return; // Cancela se o usuário não confirmar
    }
    // --- FIM: Confirmação de Deploy ---

    // Atualiza UI para estado de deploying
    updateCardUIState(card, systemId, "deploying");

    // Adiciona mensagem inicial ao terminal
    const terminal = card.querySelector(".terminal-output");
    const deployStartMsgHtml = `<br><span class="output-info">--- [INFO] Iniciando deploy... ---</span>`;
    let currentHistory = terminalOutputs.get(systemId) || ""; // Pega histórico existente
    currentHistory += deployStartMsgHtml;
    terminalOutputs.set(systemId, currentHistory); // Salva histórico atualizado
    if (terminal) {
      // Verifica se terminal ainda existe
      terminal.innerHTML = currentHistory; // Atualiza UI
      terminal.scrollTop = terminal.scrollHeight; // Rola
    }

    // Envia comando para main
    window.electronAPI.deploySystem(selectedApplicationId, systemId);

    // A reabilitação dos botões corretos ocorre em onSystemDeployed
  }

  // --- Função Auxiliar para Atualizar UI do Card ---
  function updateCardUIState(card, systemId, state) {
    if (!card) {
      // Tenta encontrar o card se não foi passado
      card = systemsList.querySelector(
        `.system-card[data-system-id="${systemId}"]`
      );
      if (!card) return; // Sai se o card não existe mais
    }

    const startBtn = card.querySelector(".start-btn");
    const stopBtn = card.querySelector(".stop-btn");
    const forceStopBtn = card.querySelector(".force-stop-btn");
    const deployBtn = card.querySelector(".deploy-btn");
    const editBtn = card.querySelector(".edit-sys-btn");
    const deleteBtn = card.querySelector(".delete-sys-btn");
    const statusIndicator = card.querySelector(".status-indicator");
    const deployIndicatorText = "Deploying..."; // Texto para botão de deploy

    // Reset Geral
    startBtn.hidden = true;
    startBtn.disabled = true;
    stopBtn.hidden = true;
    stopBtn.disabled = true;
    forceStopBtn.hidden = true;
    forceStopBtn.disabled = true;
    if (deployBtn) {
      deployBtn.disabled = true;
      deployBtn.textContent = "Deploy";
    } // Reset texto deploy
    if (editBtn) editBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = true;

    switch (state) {
      case "stopped":
        systemIsRunning.set(systemId, false);
        startBtn.hidden = false;
        startBtn.disabled = false;
        stopBtn.hidden = true; // Stop fica escondido quando parado
        forceStopBtn.hidden = true; // Force Stop fica escondido quando parado
        if (deployBtn) deployBtn.disabled = false;
        if (editBtn) editBtn.disabled = false;
        if (deleteBtn) deleteBtn.disabled = false;
        statusIndicator.className = "status-indicator stopped";
        statusIndicator.title = "Parado";
        break;
      case "starting":
        systemIsRunning.set(systemId, true); // Assume que vai iniciar
        startBtn.hidden = true; // Start some durante start/run
        stopBtn.hidden = false;
        stopBtn.disabled = true; // Mostra Stop, mas desabilitado inicialmente
        forceStopBtn.hidden = false;
        forceStopBtn.disabled = true; // Mostra Force Stop, desabilitado inicialmente
        if (deployBtn) deployBtn.disabled = true;
        if (editBtn) editBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;
        statusIndicator.className = "status-indicator starting";
        statusIndicator.title = "Iniciando...";
        break;
      case "running": // Chamado pelo primeiro output ou se deploy termina e continua rodando
        systemIsRunning.set(systemId, true);
        startBtn.hidden = true; // Start some
        stopBtn.hidden = false;
        stopBtn.disabled = false; // Habilita Stop
        forceStopBtn.hidden = false;
        forceStopBtn.disabled = false; // Habilita Force Stop
        if (deployBtn) deployBtn.disabled = false; // Deploy pode ser possível enquanto roda
        if (editBtn) editBtn.disabled = true; // Não pode editar rodando
        if (deleteBtn) deleteBtn.disabled = true; // Não pode deletar rodando
        statusIndicator.className = "status-indicator running";
        statusIndicator.title = "Rodando";
        break;
      case "stopping":
        // Estado intermediário, geralmente isRunning ainda é true
        startBtn.hidden = true; // Start some
        stopBtn.hidden = false;
        stopBtn.disabled = true; // Desabilita Stop durante parada
        forceStopBtn.hidden = false;
        forceStopBtn.disabled = true; // Desabilita Force Stop durante parada normal
        if (deployBtn) deployBtn.disabled = true;
        if (editBtn) editBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;
        statusIndicator.className = "status-indicator stopping";
        statusIndicator.title = "Parando...";
        break;
      case "deploying":
        // Geralmente isRunning é false, mas pode ser true se deploy acontece com app rodando
        const isCurrentlyRunning = systemIsRunning.get(systemId) || false;
        startBtn.hidden = true; // Start some
        stopBtn.hidden = !isCurrentlyRunning; // Mostra stop apenas se estava rodando
        stopBtn.disabled = true; // Desabilita durante deploy
        forceStopBtn.hidden = !isCurrentlyRunning; // Mostra force stop apenas se estava rodando
        forceStopBtn.disabled = true; // Desabilita durante deploy
        if (deployBtn) {
          deployBtn.disabled = true;
          deployBtn.textContent = deployIndicatorText;
        }
        if (editBtn) editBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;
        statusIndicator.className = "status-indicator deploying";
        statusIndicator.title = "Deploying...";
        break;
    }
  }

  // --- IPC Listeners ---

  // MODIFICADO: onSystemOutput para usar innerHTML, limitar histórico e gerenciar estado 'running'
  window.electronAPI.onSystemOutput(({ systemId, data, type }) => {
    // Recebe objeto desestruturado
    // Atualiza o histórico armazenado (que agora é HTML)
    let currentHistory = terminalOutputs.get(systemId) || "";
    // Adiciona o chunk de HTML recebido (já formatado pelo main.js)
    currentHistory += data; // Não adiciona <br> aqui, main.js controla isso com AnsiToHtml({newline:true})

    // Limita o histórico para evitar consumo excessivo de memória
    const MAX_OUTPUT_LENGTH = 30000; // Limite de caracteres (ajuste conforme necessário)
    const truncationWarningHtml =
      '<span class="output-info">[...] Log anterior truncado [...]</span><br>';
    if (currentHistory.length > MAX_OUTPUT_LENGTH) {
      // Adiciona aviso de truncamento se ainda não estiver lá
      const warningPresent = currentHistory.startsWith(truncationWarningHtml);
      currentHistory = currentHistory.substring(
        currentHistory.length - MAX_OUTPUT_LENGTH
      );
      if (!warningPresent) {
        currentHistory = truncationWarningHtml + currentHistory;
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

        // Se estava 'starting', muda para 'running' no primeiro output real
        // (Mas não se for uma mensagem do debugger antes do app rodar)
        // Melhoramos a lógica de 'running' um pouco
        if (statusIndicator && statusIndicator.classList.contains("starting")) {
          // Verifica se a mensagem não é apenas do debugger antes do start real
          const isLikelyDebugMsg =
            data.includes("Debugger listening on") ||
            data.includes("For help, see:");
          if (!isLikelyDebugMsg) {
            updateCardUIState(card, systemId, "running");
          }
        } else if (
          statusIndicator &&
          !statusIndicator.classList.contains("running") &&
          !statusIndicator.classList.contains("stopping")
        ) {
          // Se não estava starting nem stopping, e recebeu output, provavelmente está rodando
          // (Isso ajuda se o estado inicial foi perdido ou se o deploy terminou)
          // Cuidado para não marcar como running se for só mensagem de erro/info final.
          // Talvez a melhor abordagem seja o main process emitir um evento 'system-started' explícito.
          // Por ora, mantemos a lógica baseada no output, mas cientes da limitação.
        }

        // Atualiza o conteúdo do terminal visível com o histórico (limitado)
        if (terminalOutput) {
          terminalOutput.innerHTML = currentHistory; // Usa innerHTML

          // --- INÍCIO: Correção Auto-Scroll ---
          // Adia a rolagem para garantir que o scrollHeight foi atualizado após renderização
          setTimeout(() => {
            // Re-seleciona o elemento ou verifica se ainda existe
            const currentTerminalElement =
              card.querySelector(".terminal-output");
            if (currentTerminalElement) {
              // Verifica se o usuário não rolou manualmente para cima
              // (Scroll somente se estiver perto do fim ou no fim)
              const isScrolledToBottom =
                currentTerminalElement.scrollHeight -
                  currentTerminalElement.clientHeight <=
                currentTerminalElement.scrollTop + 1; // Tolerância de 1px

              // Rola incondicionalmente conforme solicitado ("últimos outputs fiquem sempre visíveis")
              // if (isScrolledToBottom) { // Comentado para rolar sempre
              currentTerminalElement.scrollTop =
                currentTerminalElement.scrollHeight;
              // }
            }
          }, 0); // Timeout de 0ms é suficiente para adiar para o próximo ciclo de eventos
          // --- FIM: Correção Auto-Scroll ---
        }
      }
    }
  });

  // Funo auxiliar para atualizar UI para estado parado (usada por onSystemStopped e fallback de erro)
  function updateUIStopped(systemId) {
    const card = systemsList.querySelector(
      `.system-card[data-system-id="${systemId}"]`
    );

    // Atualiza estado interno
    systemIsRunning.set(systemId, false);

    // Tenta atualizar a UI se o card estiver visível
    if (systemsView.classList.contains("active-view") && card) {
      updateCardUIState(card, systemId, "stopped"); // Usa a função centralizada

      // Adiciona mensagem final ao terminal (opcional)
      const terminal = card.querySelector(".terminal-output");
      const stopMsgHtml = `<br><span class="output-info">--- [INFO] Processo Parado ---</span>`;
      let currentHistory = terminalOutputs.get(systemId) || "";
      // Evita adicionar múltiplas mensagens de parada
      if (!currentHistory.endsWith(stopMsgHtml)) {
        currentHistory += stopMsgHtml;
        terminalOutputs.set(systemId, currentHistory);
        if (terminal) {
          // Verifica se terminal ainda existe
          terminal.innerHTML = currentHistory; // Atualiza UI
          terminal.scrollTop = terminal.scrollHeight; // Rola
        }
      }
    } else {
      // Se a view não está ativa ou card não existe, só atualizamos o estado (já feito acima)
      console.log(
        `[Renderer] Estado parado atualizado para ${systemId}, mas UI não visível.`
      );
    }
  }

  // MODIFICADO: onSystemStopped usa a função auxiliar
  window.electronAPI.onSystemStopped(({ systemId }) => {
    // Recebe objeto
    console.log(`[Renderer] Evento onSystemStopped recebido para ${systemId}`);
    updateUIStopped(systemId); // Chama a função auxiliar
  });

  // MODIFICADO: onSystemDeployed para reabilitar botões corretamente e adicionar mensagem HTML
  window.electronAPI.onSystemDeployed(({ systemId, success }) => {
    // Recebe objeto
    console.log(
      `[Renderer] Evento onSystemDeployed recebido para ${systemId}, Sucesso: ${success}`
    );
    // Atualiza a UI somente se a view de sistemas estiver ativa e o card existir
    if (systemsView.classList.contains("active-view")) {
      const card = systemsList.querySelector(
        `.system-card[data-system-id="${systemId}"]`
      );
      if (card) {
        const terminalOutput = card.querySelector(".terminal-output");

        // Adiciona mensagem final ao terminal com classe de sucesso/erro
        const deployEndMsgHtml = `<br><span class="output-${
          success ? "success" : "error"
        }">--- [${success ? "SUCESSO" : "FALHA"}] Deploy ${
          success ? "concluído" : "falhou"
        }. ---</span>`;
        let currentHistory = terminalOutputs.get(systemId) || "";
        currentHistory += deployEndMsgHtml;
        terminalOutputs.set(systemId, currentHistory); // Salva histórico atualizado

        if (terminalOutput) {
          // Verifica se terminal ainda existe
          terminalOutput.innerHTML = currentHistory; // Atualiza UI
          // Scroll após adicionar mensagem de fim de deploy
          setTimeout(() => {
            const currentTerminalElement =
              card?.querySelector(".terminal-output");
            if (currentTerminalElement) {
              currentTerminalElement.scrollTop =
                currentTerminalElement.scrollHeight;
            }
          }, 0);
        }

        // Reabilita botões com base no estado 'isRunning' PÓS-DEPLOY
        // O estado 'isRunning' não deve ser alterado pelo deploy em si, a menos que o processo start tenha sido parado.
        // Assumimos que o estado 'isRunning' reflete o processo de 'start'.
        const wasRunning = systemIsRunning.get(systemId) || false;
        if (wasRunning) {
          updateCardUIState(card, systemId, "running"); // Volta para running se estava rodando
        } else {
          updateCardUIState(card, systemId, "stopped"); // Volta para stopped se estava parado
        }
      }
    }
  });

  // --- Initial Load & Setup ---
  async function loadInitialData() {
    try {
      currentData = await window.electronAPI.loadData();
      // Limpa estados persistentes ao iniciar (poderia tentar recuperá-los se necessário)
      terminalOutputs.clear();
      systemIsRunning.clear();
      console.log("[Renderer] Dados carregados, mostrando view de aplicações.");
      showApplicationsView(); // Começa na view de aplicações
    } catch (error) {
      console.error("[Renderer] Erro fatal ao carregar dados:", error);
      applicationsList.innerHTML =
        '<p class="error-state">Erro crítico ao carregar dados. Verifique os logs ou tente reiniciar.</p>';
    }
  }

  // Navigation Listeners
  backToAppsBtn.addEventListener("click", showApplicationsView);

  // Cleanup on unload (remove IPC listeners to avoid leaks)
  window.addEventListener("beforeunload", () => {
    console.log("[Renderer] Limpando listeners IPC antes de descarregar.");
    window.electronAPI.removeListener("system-output");
    window.electronAPI.removeListener("system-stopped");
    window.electronAPI.removeListener("system-deployed");
  });

  // Carrega os dados iniciais ao carregar a página
  loadInitialData();
}); // Fim do DOMContentLoaded
