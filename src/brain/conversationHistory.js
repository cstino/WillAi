// Tiene lo storico della sessione corrente in memoria (non su DB)
let sessionHistory = [];

export function addToHistory(role, content) {
  sessionHistory.push({ role, content });
  // Tieni massimo le ultime 10 coppie (20 messaggi) per non esplodere il contesto
  if (sessionHistory.length > 20) {
    sessionHistory = sessionHistory.slice(-20);
  }
}

export function getHistory() {
  return [...sessionHistory];
}

export function clearHistory() {
  sessionHistory = [];
}
