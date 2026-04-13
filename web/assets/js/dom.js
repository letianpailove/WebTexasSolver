export const elements = {
  statusEl: document.getElementById("status"),
  logEl: document.getElementById("log"),
  resultEl: document.getElementById("result"),
  filebox: document.getElementById("filebox"),
  startBtn: document.getElementById("startBtn"),
  rangeIpEl: document.getElementById("range_ip"),
  rangeOopEl: document.getElementById("range_oop"),
  boardEl: document.getElementById("board"),
  resultDlg: document.getElementById("resultDialog"),
};

export const state = {
  timer: null,
  resultRoot: null,
  resultSelected: null,
  resultMode: "strategy",
  resultNodeMap: new Map(),
  expandedResultNodes: new Set(),
  lastHoveredStat: null,
  resultEvData: null,
};

export function resetResultState() {
  state.resultRoot = null;
  state.resultSelected = null;
  state.resultNodeMap = new Map();
  state.expandedResultNodes = new Set();
  state.lastHoveredStat = null;
  state.resultEvData = null;
}
