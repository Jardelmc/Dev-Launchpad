const { app } = require("electron"); // <-- Importar app
const fs = require("fs-extra");
const path = require("path");

// --- INÍCIO: Isolar App Data ---
const isDev = !app.isPackaged;
const dataFileName = isDev
  ? "dev-launchpad-data-dev.json"
  : "dev-launchpad-data.json";
const userDataPath = app.getPath("userData");
// Garante que o diretório userData exista antes de tentar criar o arquivo
fs.ensureDirSync(userDataPath);
const dataPath = path.join(userDataPath, dataFileName);
console.log(`[Store] Usando data path: ${dataPath}`); // Log para verificação
// --- FIM: Isolar App Data ---

async function loadData() {
  try {
    const fileExists = await fs.pathExists(dataPath);
    if (!fileExists) {
      await fs.writeJson(dataPath, []); // Cria arquivo vazio se não existir
      return []; // Retorna array vazio
    }
    // Leitura com tratamento para JSON inválido
    const data = await fs.readJson(dataPath, { throws: false }); // Não lança erro em JSON inválido
    // Garante que é um array, mesmo que o arquivo esteja corrompido ou vazio
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(
      `[Store] Erro crítico ao carregar dados de ${dataPath}:`,
      error
    );
    // Tenta retornar vazio para permitir que o app continue, mas registra o erro
    return [];
  }
}

async function saveData(data) {
  try {
    if (!Array.isArray(data)) {
      throw new Error("Tentativa de salvar dados que não são um array.");
    }
    // Salva com formatação para facilitar leitura humana do JSON
    await fs.writeJson(dataPath, data, { spaces: 2 });
  } catch (error) {
    console.error(`[Store] Erro ao salvar dados em ${dataPath}:`, error);
    throw error; // Propaga o erro para o chamador lidar
  }
}

module.exports = { loadData, saveData };
