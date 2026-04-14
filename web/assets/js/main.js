import { elements, state } from "./dom.js";
import {
  copyIpToOop,
  formatCardDisplay,
  getDeckCards,
  payload,
  refreshLog,
  refreshStatus,
  renderPreviewGrid,
  setStatus,
  startPolling,
} from "./core.js";
import { fillTurnRiverCards, loadResult, renderResultTree, selectResultNode } from "./result-viewer.js";
import { setupDialogs, syncBoardSelectionByMode } from "./dialogs.js";

async function startSolve() {
  elements.startBtn.disabled = true;
  const r = await fetch("/api/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload()),
  });
  const d = await r.json();
  if (!d.ok) {
    setStatus(d.error || "启动失败", false);
    elements.startBtn.disabled = false;
    return;
  }
  setStatus("求解中...", true);
  startPolling();
}

async function buildTree() {
  const btn = document.getElementById("buildTreeBtn");
  btn.disabled = true;
  try {
    const r = await fetch("/api/build-tree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    const d = await r.json();
    if (!d.ok) {
      setStatus(d.error || "构建失败", false);
      return;
    }
    setStatus("构建中...", true);
    startPolling();
  } finally {
    setTimeout(() => { btn.disabled = false; }, 1000);
  }
}

async function estimateMemory() {
  const btn = document.getElementById("estimateBtn");
  btn.disabled = true;
  try {
    const r = await fetch("/api/estimate-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    const d = await r.json();
    if (!d.ok) {
      elements.logEl.textContent = d.error || "估算启动失败";
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const mem = await fetch("/api/memory").then((x) => x.json());
    if (!mem.ok) {
      elements.logEl.textContent = mem.error || "未读取到估算结果";
      return;
    }
    elements.logEl.textContent = `估算结果文件: ${mem.path}\n内存浮点单元: ${mem.memory_float}\n约 ${mem.memory_mb.toFixed(1)} MB\n约 ${mem.memory_gb.toFixed(3)} GB`;
  } finally {
    btn.disabled = false;
  }
}
async function stopSolve() {
  const r = await fetch("/api/stop", { method: "POST" });
  const d = await r.json();
  if (!d.ok) {
    setStatus(d.error || "停止失败", false);
    return;
  }
  setStatus("已停止", false);
  await refreshStatus();
}

function bindResultModeButtons() {
  document.getElementById("modeIpBtn").onclick = async () => { state.resultMode = "ip"; if (state.resultSelected) await selectResultNode(state.resultSelected.id); };
  document.getElementById("modeOopBtn").onclick = async () => { state.resultMode = "oop"; if (state.resultSelected) await selectResultNode(state.resultSelected.id); };
  document.getElementById("modeStrategyBtn").onclick = async () => { state.resultMode = "strategy"; if (state.resultSelected) await selectResultNode(state.resultSelected.id); };
  document.getElementById("modeEvBtn").onclick = async () => { state.resultMode = "ev"; if (state.resultSelected) await selectResultNode(state.resultSelected.id); };
  document.getElementById("modeEvOnlyBtn").onclick = async () => { state.resultMode = "ev_only"; if (state.resultSelected) await selectResultNode(state.resultSelected.id); };
}

function bindTurnRiverSelectors() {
  document.getElementById("turnCardBox").onchange = async () => {
    const turn = document.getElementById("turnCardBox");
    const river = document.getElementById("riverCardBox");
    const used = new Set(String(elements.boardEl.value || "").split(",").map((v) => v.trim()).filter(Boolean));
    const avail = getDeckCards().filter((c) => !used.has(c) && c !== turn.value);
    const prev = river.value;
    river.innerHTML = "";
    for (const c of avail) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = formatCardDisplay(c);
      river.appendChild(o);
    }
    if (prev && avail.includes(prev)) river.value = prev;
    if (state.resultSelected) {
      renderResultTree(state.resultRoot);
      await selectResultNode(state.resultSelected.id);
    }
  };
  document.getElementById("riverCardBox").onchange = async () => {
    if (state.resultSelected) {
      renderResultTree(state.resultRoot);
      await selectResultNode(state.resultSelected.id);
    }
  };
}

function bindMainEvents() {
  elements.startBtn.onclick = startSolve;
  document.getElementById("stopBtn").onclick = stopSolve;
  document.getElementById("copyIpToOopBtn").onclick = copyIpToOop;
  document.getElementById("buildTreeBtn").onclick = buildTree;
  document.getElementById("estimateBtn").onclick = estimateMemory;
  document.getElementById("refreshBtn").onclick = async () => { await refreshStatus(); await refreshLog(); };
  document.getElementById("loadResultBtn").onclick = loadResult;
  document.getElementById("clearLogBtn").onclick = () => { elements.logEl.textContent = ""; };
  // document.getElementById("exportCmdBtn").onclick = () => {
  //   elements.resultEl.textContent = "点击“开始求解”后，系统会在web/runtime 目录生成命令文件和结果文件";
  // };
  document.getElementById("resultDlgOk").onclick = () => { elements.resultDlg.style.display = "none"; };
  elements.resultDlg.onclick = (e) => { if (e.target === elements.resultDlg) elements.resultDlg.style.display = "none"; };

  document.getElementById("mode").onchange = () => {
    renderPreviewGrid("grid1", elements.rangeIpEl.value);
    renderPreviewGrid("grid2", elements.rangeOopEl.value);
    syncBoardSelectionByMode();
    fillTurnRiverCards();
  };
  elements.rangeIpEl.addEventListener("change", () => renderPreviewGrid("grid1", elements.rangeIpEl.value));
  elements.rangeOopEl.addEventListener("change", () => renderPreviewGrid("grid2", elements.rangeOopEl.value));
}

async function init() {
  setupDialogs();
  bindMainEvents();
  bindResultModeButtons();
  bindTurnRiverSelectors();
  renderPreviewGrid("grid1", elements.rangeIpEl.value);
  renderPreviewGrid("grid2", elements.rangeOopEl.value);
  fillTurnRiverCards();
  await refreshStatus();
  await refreshLog();
}

init();

