const { app } = require("electron");
const fs = require("fs-extra");
const path = require("path");

const dataPath = path.join(app.getPath("userData"), "dev-launchpad-data.json");

async function loadData() {
  try {
    const fileExists = await fs.pathExists(dataPath);
    if (!fileExists) {
      await fs.writeJson(dataPath, []); // Cria arquivo vazio se não existir
      return [];
    }
    // Leitura com tratamento para JSON inválido
    const data = await fs.readJson(dataPath, { throws: false });
    // Garante que é um array, mesmo que o arquivo esteja corrompido ou vazio
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Erro crítico ao carregar dados:", error);
    // Tenta retornar vazio para permitir que o app continue, mas registra o erro
    return [];
  }
}

async function saveData(data) {
  try {
    if (!Array.isArray(data)) {
      throw new Error("Tentativa de salvar dados que não são um array.");
    }
    await fs.writeJson(dataPath, data, { spaces: 2 }); // Salva com formatação
  } catch (error) {
    console.error("Erro ao salvar dados:", error);
    throw error; // Propaga o erro para o chamador lidar
  }
}

module.exports = {
  loadData,
  saveData,
};
