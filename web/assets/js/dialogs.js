import { elements } from "./dom.js";
import {
  fmtWeight,
  formatCardListDisplay,
  getDeckCards,
  getRanks,
  handLabel,
  parseCardListInput,
  parseRangeText,
  renderPreviewGrid,
  serializeRange,
} from "./core.js";

const dlg = document.getElementById("rangeDialog");
const dlgTitle = document.getElementById("dlgTitle");
const dlgGrid = document.getElementById("dlgGrid");
const dlgWeight = document.getElementById("dlgWeight");
const dlgWeightText = document.getElementById("dlgWeightText");
const dlgText = document.getElementById("dlgText");
const dlgFileInput = document.getElementById("dlgFileInput");

const boardDlg = document.getElementById("boardDialog");
const boardCardGrid = document.getElementById("boardCardGrid");
const boardDlgText = document.getElementById("boardDlgText");

let dlgTarget = null;
let dlgRanks = [];
let dlgMap = new Map();
let dlgOriginalText = "";
let mouseDown = false;
let boardSel = new Set();

function setCellWeight(label, value) {
  const key = label.toUpperCase();
  if (value <= 0) dlgMap.delete(key);
  else dlgMap.set(key, value);
}

function syncDialogTextFromMap() {
  dlgText.value = serializeRange(dlgMap, dlgRanks);
}

function refreshDialogCells() {
  for (const el of dlgGrid.querySelectorAll(".dlg-cell")) {
    const label = el.dataset.label;
    const v = dlgMap.get(label) || 0;
    el.classList.toggle("on", v > 0);
    el.title = `${label} = ${fmtWeight(v)}`;
  }
}

function applyCell(label) {
  const now = Number(dlgWeight.value);
  const old = dlgMap.get(label) || 0;
  setCellWeight(label, Math.abs(old - now) < 1e-6 ? 0 : now);
  syncDialogTextFromMap();
  refreshDialogCells();
}

function renderDialogGrid() {
  const dim = dlgRanks.length;
  dlgGrid.innerHTML = "";
  dlgGrid.style.gridTemplateColumns = `repeat(${dim},1fr)`;
  dlgGrid.style.gridTemplateRows = `repeat(${dim},1fr)`;
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      const label = handLabel(dlgRanks, i, j).toUpperCase();
      const cell = document.createElement("div");
      cell.className = "dlg-cell";
      cell.dataset.label = label;
      cell.textContent = label;
      cell.onmousedown = (e) => { e.preventDefault(); mouseDown = true; applyCell(label); };
      cell.onmouseenter = () => { if (mouseDown) applyCell(label); };
      dlgGrid.appendChild(cell);
    }
  }
  refreshDialogCells();
}

function openRangeDialog(targetEl, title) {
  dlgTarget = targetEl;
  dlgOriginalText = targetEl.value;
  dlgTitle.textContent = title;
  dlgRanks = getRanks();
  dlgMap = parseRangeText(dlgOriginalText, dlgRanks);
  renderDialogGrid();
  syncDialogTextFromMap();
  dlg.style.display = "flex";
}

function closeDialog() {
  dlg.style.display = "none";
}

function cancelRangeDialog() {
  dlgMap = parseRangeText(dlgOriginalText, dlgRanks);
  dlgText.value = dlgOriginalText;
  refreshDialogCells();
  closeDialog();
}

function renderBoardDialog() {
  boardCardGrid.innerHTML = "";
  boardCardGrid.classList.toggle("shortdeck", document.getElementById("mode").value === "shortdeck");
  for (const c of getDeckCards()) {
    const b = document.createElement("button");
    b.className = "card-btn" + (boardSel.has(c) ? " sel" : "");
    b.textContent = formatCardListDisplay([c]);
    b.onclick = () => {
      if (boardSel.has(c)) boardSel.delete(c);
      else if (boardSel.size < 5) boardSel.add(c);
      boardDlgText.value = formatCardListDisplay(Array.from(boardSel));
      renderBoardDialog();
    };
    boardCardGrid.appendChild(b);
  }
}

function openBoardDialog() {
  boardSel = new Set(parseCardListInput(elements.boardEl.value || ""));
  boardDlgText.value = formatCardListDisplay(Array.from(boardSel));
  renderBoardDialog();
  boardDlg.style.display = "flex";
}

export function syncBoardSelectionByMode() {
  const allowed = new Set(getDeckCards());
  boardSel = new Set(Array.from(boardSel).filter((c) => allowed.has(c)));
  if (boardDlg.style.display === "flex") {
    boardDlgText.value = formatCardListDisplay(Array.from(boardSel));
    renderBoardDialog();
  }
}

export function setupDialogs() {
  window.addEventListener("mouseup", () => { mouseDown = false; });
  dlgWeight.oninput = () => { dlgWeightText.value = fmtWeight(Number(dlgWeight.value)); };
  dlgWeightText.onchange = () => {
    let v = Number(dlgWeightText.value);
    if (Number.isNaN(v)) v = 1;
    v = Math.max(0, Math.min(1, v));
    dlgWeight.value = String(v);
    dlgWeightText.value = fmtWeight(v);
  };
  dlgText.onchange = () => {
    dlgMap = parseRangeText(dlgText.value, dlgRanks);
    syncDialogTextFromMap();
    refreshDialogCells();
  };
  document.getElementById("dlgClear").onclick = () => {
    dlgMap = new Map();
    syncDialogTextFromMap();
    refreshDialogCells();
  };
  document.getElementById("dlgImport").onclick = () => dlgFileInput.click();
  dlgFileInput.onchange = async () => {
    const file = dlgFileInput.files?.[0];
    if (!file) return;
    dlgText.value = await file.text();
    dlgMap = parseRangeText(dlgText.value, dlgRanks);
    syncDialogTextFromMap();
    refreshDialogCells();
    dlgFileInput.value = "";
  };
  document.getElementById("dlgExport").onclick = () => {
    const blob = new Blob([dlgText.value], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "output_range.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById("dlgConfirm").onclick = () => {
    if (dlgTarget) {
      dlgTarget.value = dlgText.value;
      renderPreviewGrid("grid1", elements.rangeIpEl.value);
      renderPreviewGrid("grid2", elements.rangeOopEl.value);
    }
    dlgOriginalText = dlgTarget ? dlgTarget.value : dlgOriginalText;
    closeDialog();
  };
  document.getElementById("dlgCancel").onclick = cancelRangeDialog;
  dlg.onclick = (e) => { if (e.target === dlg) cancelRangeDialog(); };
  document.getElementById("btnSelectIp").onclick = () => openRangeDialog(elements.rangeIpEl, "范围选择器 - IP");
  document.getElementById("btnSelectOop").onclick = () => openRangeDialog(elements.rangeOopEl, "范围选择器 - OOP");
  document.getElementById("btnSelectBoard").onclick = openBoardDialog;
  document.getElementById("boardDlgCancel").onclick = () => { boardDlg.style.display = "none"; };
  document.getElementById("boardDlgConfirm").onclick = () => {
    if (boardSel.size >= 3 && boardSel.size <= 5) elements.boardEl.value = formatCardListDisplay(Array.from(boardSel));
    boardDlg.style.display = "none";
  };
  boardDlg.onclick = (e) => { if (e.target === boardDlg) boardDlg.style.display = "none"; };
  dlgWeightText.value = "1";
}
