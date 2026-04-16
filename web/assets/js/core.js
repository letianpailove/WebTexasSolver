import { elements, state } from "./dom.js";

export function getRanks() {
  return document.getElementById("mode").value === "shortdeck"
    ? ["A", "K", "Q", "J", "T", "9", "8", "7", "6"]
    : ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
}

export function handLabel(ranks, i, j) {
  if (i === j) return ranks[i] + ranks[j];
  if (i < j) return ranks[i] + ranks[j] + "s";
  return ranks[j] + ranks[i] + "o";
}

export function getDeckCards() {
  const suits = ["c", "d", "h", "s"];
  const out = [];
  for (const r of getRanks()) for (const s of suits) out.push(r + s);
  return out;
}

export function suitSymbol(s) {
  const m = { c: "♣", h: "♥", s: "♠", d: "♦", C: "♣", H: "♥", S: "♠", D: "♦" };
  return m[s] || s;
}

export function symbolSuit(s) {
  const m = { "♣": "c", "♥": "h", "♠": "s", "♦": "d", C: "c", H: "h", S: "s", D: "d", c: "c", h: "h", s: "s", d: "d" };
  return m[s] || s;
}

export function formatCardDisplay(card) {
  const t = String(card || "").trim();
  if (t.length < 2) return t;
  return `${t[0].toUpperCase()}${suitSymbol(t[1])}`;
}

export function formatCardListDisplay(cardsLike) {
  const arr = Array.isArray(cardsLike)
    ? cardsLike
    : String(cardsLike || "").split(",").map((v) => v.trim()).filter(Boolean);
  return arr.map(formatCardDisplay).join(",");
}

export function formatComboDisplay(hand4) {
  const t = String(hand4 || "").trim();
  if (t.length < 4) return t;
  return `${formatCardDisplay(t.slice(0, 2))}${formatCardDisplay(t.slice(2, 4))}`;
}

export function parseCardCode(token) {
  const t = String(token || "").trim();
  if (!t) return "";
  if (t.length < 2) return t;
  return `${t[0].toUpperCase()}${symbolSuit(t[1])}`;
}

export function parseCardListInput(cardsLike) {
  const arr = Array.isArray(cardsLike)
    ? cardsLike
    : String(cardsLike || "").split(",").map((v) => v.trim()).filter(Boolean);
  return arr.map(parseCardCode).filter(Boolean);
}

function parseToken(token) {
  const t = token.trim();
  if (!t) return null;
  const parts = t.split(":");
  const hand = parts[0].trim();
  const weight = parts.length > 1 ? Number(parts[1]) : 1;
  if (!hand || Number.isNaN(weight)) return null;
  return { hand: hand.toUpperCase(), weight: Math.max(0, Math.min(1, weight)) };
}

export function parseRangeText(text, ranks = getRanks()) {
  const map = new Map();
  for (const token of String(text || "").split(",")) {
    const item = parseToken(token);
    if (!item) continue;
    const h = item.hand;
    if (h.length === 2 && h[0] === h[1]) map.set(h, item.weight);
    else if (h.length === 2) {
      map.set(h + "S", item.weight);
      map.set(h + "O", item.weight);
    } else if (h.length === 3) {
      map.set(h, item.weight);
    }
  }

  const out = new Map();
  for (let i = 0; i < ranks.length; i++) {
    for (let j = 0; j < ranks.length; j++) {
      const key = handLabel(ranks, i, j).toUpperCase();
      if (map.has(key)) out.set(key, map.get(key));
    }
  }
  return out;
}

export function fmtWeight(v) {
  if (Math.abs(v - 1) < 1e-9) return "1";
  let s = (Math.round(v * 1000) / 1000).toFixed(3);
  s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s || "0";
}

export function serializeRange(map, ranks = getRanks()) {
  const out = [];
  for (let i = 0; i < ranks.length; i++) {
    for (let j = 0; j < ranks.length; j++) {
      const label = handLabel(ranks, i, j).toUpperCase();
      const v = map.get(label) || 0;
      if (v <= 0) continue;
      out.push(Math.abs(v - 1) < 1e-9 ? label : `${label}:${fmtWeight(v)}`);
    }
  }
  return out.join(",");
}

export function renderPreviewGrid(id, text) {
  const ranks = getRanks();
  const map = parseRangeText(text, ranks);
  const root = document.getElementById(id);
  root.innerHTML = "";
  root.style.gridTemplateColumns = `repeat(${ranks.length},1fr)`;
  root.style.gridTemplateRows = `repeat(${ranks.length},1fr)`;
  for (let i = 0; i < ranks.length; i++) {
    for (let j = 0; j < ranks.length; j++) {
      const label = handLabel(ranks, i, j).toUpperCase();
      const d = document.createElement("div");
      d.className = "cell" + ((map.get(label) || 0) > 0 ? " on" : "");
      root.appendChild(d);
    }
  }
}

export function payload() {
  return {
    pot: Number(document.getElementById("pot").value),
    effective_stack: Number(document.getElementById("stack").value),
    board: parseCardListInput(elements.boardEl.value.trim()).join(","),
    range_ip: elements.rangeIpEl.value.trim(),
    range_oop: elements.rangeOopEl.value.trim(),
    threads: Number(document.getElementById("threads").value),
    accuracy: Number(document.getElementById("accuracy").value),
    max_iteration: Number(document.getElementById("iter").value),
    print_interval: Number(document.getElementById("print_interval").value),
    mode: document.getElementById("mode").value,
    allin_threshold: Number(document.getElementById("allin_threshold").value),
    raise_limit: Number(document.getElementById("raise_limit").value),
    use_isomorphism: document.getElementById("use_iso").checked ? 1 : 0,
    flop_ip_bet: document.getElementById("flop_ip_bet").value.trim(),
    flop_ip_raise: document.getElementById("flop_ip_raise").value.trim(),
    flop_ip_allin: document.getElementById("flop_ip_allin").checked,
    turn_ip_bet: document.getElementById("turn_ip_bet").value.trim(),
    turn_ip_raise: document.getElementById("turn_ip_raise").value.trim(),
    turn_ip_allin: document.getElementById("turn_ip_allin").checked,
    river_ip_bet: document.getElementById("river_ip_bet").value.trim(),
    river_ip_raise: document.getElementById("river_ip_raise").value.trim(),
    river_ip_allin: document.getElementById("river_ip_allin").checked,
    flop_oop_bet: document.getElementById("flop_oop_bet").value.trim(),
    flop_oop_raise: document.getElementById("flop_oop_raise").value.trim(),
    flop_oop_allin: document.getElementById("flop_oop_allin").checked,
    turn_oop_bet: document.getElementById("turn_oop_bet").value.trim(),
    turn_oop_raise: document.getElementById("turn_oop_raise").value.trim(),
    turn_oop_donk: document.getElementById("turn_oop_donk").value.trim(),
    turn_oop_allin: document.getElementById("turn_oop_allin").checked,
    river_oop_bet: document.getElementById("river_oop_bet").value.trim(),
    river_oop_raise: document.getElementById("river_oop_raise").value.trim(),
    river_oop_donk: document.getElementById("river_oop_donk").value.trim(),
    river_oop_allin: document.getElementById("river_oop_allin").checked,
  };
}

export function setStatus(text, ok) {
  elements.statusEl.innerHTML = `后端状态：<span class="${ok ? "ok" : "bad"}">${text}</span>`;
}

export async function refreshStatus() {
  try {
    const r = await fetch("/api/status");
    const s = await r.json();
    setStatus(s.running ? "求解中..." : "空闲", true);

    if (elements.filebox) {
      elements.filebox.textContent = [s.output_file || "output_result.json", s.command_file || "commands.txt", "tmp_log.txt"].join("\n");
    }
    elements.startBtn.disabled = !!s.running;
    document.getElementById("stopBtn").disabled = !s.running;
    document.getElementById("buildTreeBtn").disabled = !!s.running;
    document.getElementById("estimateBtn").disabled = !!s.running;
    if (!s.running && state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  } catch {
    setStatus("离线", false);
  }
}

export async function refreshLog() {
  try {
    const r = await fetch("/api/log");
    const d = await r.json();
    elements.logEl.textContent = d.log || "";
    elements.logEl.scrollTop = elements.logEl.scrollHeight;
  } catch {}
}

export function startPolling() {
  if (state.timer) return;
  state.timer = setInterval(async () => {
    await refreshStatus();
    await refreshLog();
  }, 1200);
}

export function readRoundFromBoard() {
  const n = String(elements.boardEl.value || "").split(",").map((v) => v.trim()).filter(Boolean).length;
  if (n === 3) return "FLOP";
  if (n === 4) return "TURN";
  if (n === 5) return "RIVER";
  return "FLOP";
}

export function fmtActionLabel(rawAction) {
  const s = String(rawAction || "");
  const m = s.match(/^(BET|RAISE)\s+([+-]?\d+(?:\.\d+)?)$/i);
  if (!m) return s.toUpperCase();
  const n = Number(m[2]);
  return Number.isFinite(n) ? `${m[1].toUpperCase()} ${n.toFixed(1)}` : s.toUpperCase();
}

export function firstObjectValue(obj) {
  if (!obj || typeof obj !== "object") return null;
  const ks = Object.keys(obj);
  return ks.length ? obj[ks[0]] : null;
}

export function copyIpToOop() {
  document.getElementById("flop_oop_bet").value = document.getElementById("flop_ip_bet").value;
  document.getElementById("flop_oop_raise").value = document.getElementById("flop_ip_raise").value;
  document.getElementById("flop_oop_allin").checked = document.getElementById("flop_ip_allin").checked;
  document.getElementById("turn_oop_bet").value = document.getElementById("turn_ip_bet").value;
  document.getElementById("turn_oop_raise").value = document.getElementById("turn_ip_raise").value;
  document.getElementById("turn_oop_allin").checked = document.getElementById("turn_ip_allin").checked;
  document.getElementById("river_oop_bet").value = document.getElementById("river_ip_bet").value;
  document.getElementById("river_oop_raise").value = document.getElementById("river_ip_raise").value;
  document.getElementById("river_oop_allin").checked = document.getElementById("river_ip_allin").checked;
}
