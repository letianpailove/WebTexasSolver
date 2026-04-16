import { elements, state, resetResultState } from "./dom.js";
import {
  firstObjectValue,
  fmtActionLabel,
  formatCardDisplay,
  formatCardListDisplay,
  formatComboDisplay,
  getDeckCards,
  getRanks,
  handLabel,
  parseCardCode,
  parseCardListInput,
  parseRangeText,
  readRoundFromBoard,
} from "./core.js";

function chanceTitle(chanceDepth) {
  const base = readRoundFromBoard();
  if (base === "FLOP") return chanceDepth === 0 ? "DEAL TURN CARD" : "DEAL RIVER CARD";
  return "DEAL RIVER CARD";
}

function toDisplayNode(templateRaw, title, id, chanceDepth, trace) {
  const node = { id, title, templateRaw: templateRaw || {}, chanceDepth, trace: Array.isArray(trace) ? trace : [], children: null };
  state.resultNodeMap.set(id, node);
  return node;
}

function ensureNodeChildren(node) {
  if (!node || node.children !== null) return;
  node.children = [];
  const raw = node.templateRaw || {};
  if (String(raw.node_type || "") === "action_node" && Array.isArray(raw.actions) && raw.childrens) {
    let idx = 0;
    for (const act of raw.actions) {
      if (!(act in raw.childrens)) continue;
      node.children.push(toDisplayNode(raw.childrens[act], `${raw.player === 0 ? "IP" : "OOP"} ${fmtActionLabel(act)}`, `${node.id}/${idx}`, node.chanceDepth, node.trace.concat([{ kind: "action", action: act }])));
      idx += 1;
    }
    return;
  }
  if (String(raw.node_type || "") === "chance_node") {
    const childRaw = firstObjectValue(raw.dealcards) || firstObjectValue(raw.childrens);
    if (childRaw && typeof childRaw === "object") {
      node.children.push(toDisplayNode(childRaw, chanceTitle(node.chanceDepth), `${node.id}/0`, node.chanceDepth + 1, node.trace.concat([{ kind: "chance", idx: node.chanceDepth }])));
    }
  }
}

function findNode(id) {
  return state.resultNodeMap.get(id) || null;
}

function getDealCardByChanceIndex(idx) {
  const base = readRoundFromBoard();
  const turn = document.getElementById("turnCardBox").value;
  const river = document.getElementById("riverCardBox").value;
  if (base === "FLOP") return idx === 0 ? turn : river;
  if (base === "TURN") return river;
  return "";
}

function resolveRawNodeByTrace(trace) {
  let raw = state.resultRoot ? state.resultRoot.templateRaw : null;
  for (const step of trace || []) {
    if (!raw || typeof raw !== "object") return null;
    if (step.kind === "action") raw = raw.childrens?.[step.action];
    else {
      const deals = raw.dealcards && typeof raw.dealcards === "object" ? raw.dealcards : null;
      const chosen = getDealCardByChanceIndex(step.idx);
      raw = deals ? (chosen && deals[chosen] ? deals[chosen] : firstObjectValue(deals)) : firstObjectValue(raw.childrens);
    }
  }
  return raw;
}

function snapshotFromRaw(raw) {
  const strategyObj = raw?.strategy?.strategy || {};
  const strategyActions = Array.isArray(raw?.strategy?.actions) ? raw.strategy.actions : (Array.isArray(raw?.actions) ? raw.actions : []);
  return {
    node_type: String(raw?.node_type || ""),
    player: raw && (raw.player === 0 || raw.player === 1) ? raw.player : null,
    actions: Array.isArray(raw?.actions) ? raw.actions : [],
    strategy_actions: strategyActions,
    strategy: strategyObj,
    raw: raw || {},
  };
}

function snapshotForNode(node) {
  return snapshotFromRaw(resolveRawNodeByTrace(node.trace || []));
}

function tableSnapshotForNode(node, snapshot) {
  if (!snapshot || snapshot.node_type !== "chance_node") return snapshot;
  const deals = snapshot.raw?.dealcards;
  if (!deals || typeof deals !== "object") return snapshot;
  const chosen = getDealCardByChanceIndex(node.chanceDepth);
  return snapshotFromRaw(chosen && deals[chosen] ? deals[chosen] : firstObjectValue(deals));
}

function handToGridLabel(hand) {
  if (!hand || hand.length < 4) return null;
  const ranks = getRanks();
  const [r1, s1, r2, s2] = [hand[0].toUpperCase(), hand[1].toLowerCase(), hand[2].toUpperCase(), hand[3].toLowerCase()];
  const i1 = ranks.indexOf(r1);
  const i2 = ranks.indexOf(r2);
  if (i1 < 0 || i2 < 0) return null;
  if (r1 === r2) return r1 + r2;
  return `${i1 < i2 ? r1 : r2}${i1 < i2 ? r2 : r1}${s1 === s2 ? "S" : "O"}`;
}

function foldIndex(actions) {
  return actions?.findIndex((x) => String(x).toUpperCase() === "FOLD") ?? -1;
}

function buildGridFromNode(snapshot) {
  const out = new Map();
  for (let i = 0; i < getRanks().length; i++) {
    for (let j = 0; j < getRanks().length; j++) out.set(handLabel(getRanks(), i, j).toUpperCase(), 0);
  }
  if (!snapshot || snapshot.node_type !== "action_node") return out;
  const foldIdx = foldIndex(snapshot.strategy_actions);
  for (const [hand, probs] of Object.entries(snapshot.strategy || {})) {
    const key = handToGridLabel(hand);
    if (!key || !Array.isArray(probs)) continue;
    const pFold = foldIdx >= 0 && foldIdx < probs.length ? Number(probs[foldIdx]) : 0;
    out.set(key, state.resultMode === "ev" || state.resultMode === "ev_only" ? 0 : Math.max(0, Math.min(1, 1 - pFold)));
  }
  return out;
}

function heatColor(v) {
  const clamped = Math.max(0, Math.min(1, Number(v) || 0));
  const c1 = [159, 163, 168];
  const c2 = [236, 233, 58];
  return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * clamped)},${Math.round(c1[1] + (c2[1] - c1[1]) * clamped)},${Math.round(c1[2] + (c2[2] - c1[2]) * clamped)})`;
}

function actionColor(action, idx) {
  const up = String(action || "").toUpperCase();
  if (up.startsWith("FOLD")) return "#00bfff";
  if (up.startsWith("CHECK") || up.startsWith("CALL")) return "#3dc15b";
  if (up.startsWith("BET") || up.startsWith("RAISE")) return `rgb(255,${Math.max(32, 180 - idx * 28)},${Math.max(32, 180 - idx * 28)})`;
  return "#808080";
}

function normalizeEv(ev, stackRef) {
  const stack = Math.max(1, Number(stackRef) || Number(document.getElementById("stack").value) || 1);
  return (Math.tanh(Math.max(-4, Math.min(4, (Number(ev) || 0) / stack * 3))) + 1) / 2;
}

function evColor(ev, idx, action) {
  const up = String(action || "").toUpperCase();
  const n = normalizeEv(ev);
  if (up.startsWith("CHECK") || up.startsWith("CALL")) return `rgb(55,255,${Math.max(Math.round(225 - n * 175), 55)})`;
  if (up.startsWith("BET") || up.startsWith("RAISE")) {
    const base = Math.max(0, 128 - idx * 32 - 1);
    const blue = Math.max(Math.round(255 - n * (255 - base)), base);
    const red = base + Math.min(Math.round(n * (255 - base)), 255 - base);
    return `rgb(${red},${base},${blue})`;
  }
  if (up.startsWith("FOLD")) return "#00bfff";
  return `rgb(${Math.max(0, Math.round(255 - n * 255))},${Math.min(255, Math.round(n * 255))},${Math.min(Math.max(0, Math.round(255 - n * 255)), Math.min(255, Math.round(n * 255)))})`;
}

function buildHandStats(snapshot) {
  const out = new Map();
  const ranks = getRanks();
  for (let i = 0; i < ranks.length; i++) for (let j = 0; j < ranks.length; j++) out.set(handLabel(ranks, i, j).toUpperCase(), null);
  const acts = snapshot?.strategy_actions || [];
  if (!acts.length) return out;
  const acc = new Map();
  const cnt = new Map();
  const combos = new Map();
  for (const [hand, probs] of Object.entries(snapshot.strategy || {})) {
    const key = handToGridLabel(hand);
    if (!key || !Array.isArray(probs) || probs.length !== acts.length) continue;
    if (!acc.has(key)) acc.set(key, new Array(acts.length).fill(0));
    for (let i = 0; i < acts.length; i++) acc.get(key)[i] += Number(probs[i]) || 0;
    cnt.set(key, (cnt.get(key) || 0) + 1);
    if (!combos.has(key)) combos.set(key, []);
    combos.get(key).push({ hand, probs: probs.map((v) => Number(v) || 0) });
  }
  for (const [k, arr] of acc.entries()) out.set(k, { probs: arr.map((v) => v / (cnt.get(k) || 1)), actions: acts, combos: combos.get(k) || [] });
  return out;
}

function swapComboKey(k) {
  return !k || k.length < 4 ? k : `${k.slice(2, 4)}${k.slice(0, 2)}`;
}

function comboClassLabel(c1, c2) {
  const ranks = getRanks();
  const r1 = c1[0].toUpperCase();
  const r2 = c2[0].toUpperCase();
  const s1 = c1[1].toLowerCase();
  const s2 = c2[1].toLowerCase();
  if (r1 === r2) return `${r1}${r2}`;
  const i1 = ranks.indexOf(r1);
  const i2 = ranks.indexOf(r2);
  if (i1 < 0 || i2 < 0) return null;
  return `${i1 < i2 ? r1 : r2}${i1 < i2 ? r2 : r1}${s1 === s2 ? "S" : "O"}`;
}

function expandRangeToCombos(rangeText) {
  const classWeights = parseRangeText(rangeText, getRanks());
  const out = new Map();
  const deck = getDeckCards();
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const key = comboClassLabel(deck[i], deck[j]);
      const w = Number(classWeights.get(String(key || "").toUpperCase()) || 0);
      if (key && w > 0) out.set(`${deck[i]}${deck[j]}`, w);
    }
  }
  return out;
}

function zeroBlockedCards(comboMap, cardArr) {
  const blocks = new Set((cardArr || []).map((c) => parseCardCode(c)));
  for (const k of comboMap.keys()) {
    if (blocks.has(k.slice(0, 2)) || blocks.has(k.slice(2, 4))) comboMap.set(k, 0);
  }
}

function computeReachForNode(node) {
  const ip = expandRangeToCombos(elements.rangeIpEl.value);
  const oop = expandRangeToCombos(elements.rangeOopEl.value);
  zeroBlockedCards(ip, parseCardListInput(elements.boardEl.value));
  zeroBlockedCards(oop, parseCardListInput(elements.boardEl.value));
  let raw = state.resultRoot?.templateRaw || null;
  for (const step of node.trace || []) {
    if (!raw || typeof raw !== "object") break;
    if (step.kind === "action") {
      const actions = raw?.strategy?.actions || raw.actions || [];
      const idx = actions.indexOf(step.action);
      const target = raw.player === 0 ? ip : oop;
      const strategy = raw?.strategy?.strategy || {};
      for (const [k, w] of target.entries()) {
        const pArr = strategy[k] || strategy[swapComboKey(k)];
        const p = idx >= 0 && Array.isArray(pArr) && idx < pArr.length ? Number(pArr[idx]) || 0 : 0;
        target.set(k, w * p);
      }
      raw = raw.childrens?.[step.action] || null;
    } else {
      const chosen = getDealCardByChanceIndex(step.idx);
      if (chosen) {
        zeroBlockedCards(ip, [chosen]);
        zeroBlockedCards(oop, [chosen]);
      }
      const deals = raw.dealcards && typeof raw.dealcards === "object" ? raw.dealcards : null;
      raw = deals ? (deals[chosen] || firstObjectValue(deals)) : firstObjectValue(raw.childrens);
    }
  }
  return { ip, oop };
}

function buildRangeHandStats(comboReach) {
  const out = new Map();
  const ranks = getRanks();
  for (let i = 0; i < ranks.length; i++) for (let j = 0; j < ranks.length; j++) out.set(handLabel(ranks, i, j).toUpperCase(), { range: 0, combos: [] });
  const acc = new Map();
  const cnt = new Map();
  const combos = new Map();
  for (const [k, w] of comboReach.entries()) {
    const key = comboClassLabel(k.slice(0, 2), k.slice(2, 4));
    if (!key) continue;
    const upper = key.toUpperCase();
    acc.set(upper, (acc.get(upper) || 0) + (Number(w) || 0));
    cnt.set(upper, (cnt.get(upper) || 0) + 1);
    if (!combos.has(upper)) combos.set(upper, []);
    combos.get(upper).push({ hand: k, range: Number(w) || 0 });
  }
  for (const [k, sum] of acc.entries()) out.set(k, { range: sum / (cnt.get(k) || 1), combos: combos.get(k) || [] });
  return out;
}

function buildGridFromRangeStats(rangeStats) {
  const out = new Map();
  const ranks = getRanks();
  for (let i = 0; i < ranks.length; i++) {
    for (let j = 0; j < ranks.length; j++) {
      const k = handLabel(ranks, i, j).toUpperCase();
      out.set(k, Math.max(0, Math.min(1, Number(rangeStats.get(k)?.range) || 0)));
    }
  }
  return out;
}

function renderComboGrid(hoverStat) {
  const root = document.getElementById("comboGrid");
  root.innerHTML = "";
  if (!hoverStat?.stat) {
    const p = document.createElement("div");
    p.className = "combo-placeholder";
    p.textContent = "将鼠标移置Strategy Table 任意组合上以查看 3x4 细节卡片视图";
    root.appendChild(p);
    return;
  }
  const hs = hoverStat.stat;
  const combos = Array.isArray(hs.combos) ? hs.combos : [];
  if (!combos.length) {
    const p = document.createElement("div");
    p.className = "combo-placeholder";
    p.textContent = "该组合暂无具体花色明细";
    root.appendChild(p);
    return;
  }
  const maxCards = 12;
  for (let i = 0; i < Math.min(maxCards, combos.length); i++) {
    const c = combos[i];
    const card = document.createElement("div");
    card.className = "combo-card";
    const head = document.createElement("div");
    head.className = "h";
    head.textContent = formatComboDisplay(c.hand);
    card.appendChild(head);
    if (state.resultMode === "ip" || state.resultMode === "oop") {
      const line = document.createElement("div");
      line.textContent = `RANGE: ${(Number(c.range || 0) * 100).toFixed(1)}%`;
      card.appendChild(line);
    } else if (state.resultMode === "ev" || state.resultMode === "ev_only") {
      ["EV: " + (Number(c.combo_ev || 0)).toFixed(3), `RANGE: ${(Number(c.range || 0) * 100).toFixed(1)}%`].forEach((text) => {
        const line = document.createElement("div");
        line.textContent = text;
        card.appendChild(line);
      });
      for (let k = 0; k < hs.actions.length; k++) {
        const line = document.createElement("div");
        line.textContent = `${fmtActionLabel(hs.actions[k])}: ${(Number(c.evs[k] || 0)).toFixed(3)}`;
        card.appendChild(line);
      }
    } else {
      for (let k = 0; k < hs.actions.length; k++) {
        const line = document.createElement("div");
        line.textContent = `${fmtActionLabel(hs.actions[k])}: ${((c.probs[k] || 0) * 100).toFixed(1)}%`;
        card.appendChild(line);
      }
    }
    root.appendChild(card);
  }
  for (let i = combos.length; i < maxCards; i++) {
    const blank = document.createElement("div");
    blank.className = "combo-card";
    blank.textContent = "-";
    root.appendChild(blank);
  }
}

function renderMatrixByMap(containerId, map, handStats) {
  const root = document.getElementById(containerId);
  const ranks = getRanks();
  root.innerHTML = "";
  root.style.gridTemplateColumns = `repeat(${ranks.length},1fr)`;
  for (let i = 0; i < ranks.length; i++) {
    for (let j = 0; j < ranks.length; j++) {
      const h = handLabel(ranks, i, j).toUpperCase();
      const hs = handStats?.get(h);
      const d = document.createElement("div");
      d.className = "res-cell";
      d.style.position = "relative";
      d.style.overflow = "hidden";
      d.style.background = state.resultMode === "ip" || state.resultMode === "oop" ? "#9fa3a8" : heatColor(map.get(h) || 0);
      d.title = `${h}: ${((map.get(h) || 0) * 100).toFixed(1)}%`;
      if ((state.resultMode === "ip" || state.resultMode === "oop") && hs) {
        const p = Math.max(0, Math.min(1, Number(hs.range) || 0));
        if (p > 0.001) {
          const rg = document.createElement("div");
          Object.assign(rg.style, { position: "absolute", left: "0", bottom: "0", width: "100%", height: `${(p * 100).toFixed(2)}%`, background: "#ece93a" });
          d.appendChild(rg);
        }
        d.onmouseenter = () => {
          const lines = [`${h}`, `RANGE: ${(p * 100).toFixed(1)}%`];
          for (const c of (hs.combos || []).slice(0, 10)) lines.push(lines.length === 2 ? "" : "", `${formatComboDisplay(c.hand)} | RANGE ${(Number(c.range || 0) * 100).toFixed(1)}%`);
          document.getElementById("resultDetail").value = lines.filter((x, idx, arr) => !(x === "" && arr[idx - 1] === "")).join("\n");
          state.lastHoveredStat = { hand: h, stat: hs };
          renderComboGrid(state.lastHoveredStat);
        };
      } else if ((state.resultMode === "ev" || state.resultMode === "ev_only") && hs?.actions?.length) {
        d.style.background = "#9fa3a8";
        if (state.resultMode === "ev_only") {
          const comboEvs = Array.isArray(hs.combo_evs) ? hs.combo_evs.slice().sort((a, b) => b - a) : [];
          comboEvs.forEach((ev, idx) => {
            const seg = document.createElement("div");
            Object.assign(seg.style, { position: "absolute", left: `${(idx / comboEvs.length) * 100}%`, top: "0", width: `${100 / comboEvs.length}%`, height: "100%", background: evColor(ev, idx, "") });
            d.appendChild(seg);
          });
        } else {
          const foldIdx = foldIndex(hs.actions);
          const fold = foldIdx >= 0 ? Math.max(0, Math.min(1, hs.avg_strategy[foldIdx] || 0)) : 0;
          if (fold > 0.001) {
            const fd = document.createElement("div");
            Object.assign(fd.style, { position: "absolute", left: "0", top: "0", width: "100%", height: `${(fold * 100).toFixed(2)}%`, background: actionColor("FOLD", 0) });
            d.appendChild(fd);
          }
          const remain = Math.max(0, 1 - fold);
          if (remain > 0.001) {
            const bar = document.createElement("div");
            Object.assign(bar.style, { position: "absolute", left: "0", bottom: "0", width: "100%", height: `${(remain * 100).toFixed(2)}%`, display: "flex" });
            let betRaiseId = 0;
            for (let k = 0; k < hs.actions.length; k++) {
              if (k === foldIdx) continue;
              const p = (hs.avg_strategy[k] || 0) / remain;
              if (p <= 0.001) continue;
              const seg = document.createElement("div");
              Object.assign(seg.style, { width: `${(p * 100).toFixed(2)}%`, height: "100%", background: evColor(hs.action_evs[k] || 0, betRaiseId, hs.actions[k]) });
              if (/^(BET|RAISE)/i.test(String(hs.actions[k]))) betRaiseId += 1;
              bar.appendChild(seg);
            }
            d.appendChild(bar);
          }
        }
        d.onmouseenter = () => {
          const lines = [`${h}`, "Average EV:"];
          for (let k = 0; k < hs.actions.length; k++) lines.push(`${fmtActionLabel(hs.actions[k])}: ${(Number(hs.action_evs[k]) || 0).toFixed(3)}`);
          document.getElementById("resultDetail").value = lines.join("\n");
          state.lastHoveredStat = { hand: h, stat: hs };
          renderComboGrid(state.lastHoveredStat);
        };
      } else if (hs?.probs?.length) {
        const foldIdx = foldIndex(hs.actions);
        const fold = foldIdx >= 0 ? Math.max(0, Math.min(1, hs.probs[foldIdx])) : 0;
        if (fold > 0.001) {
          const fd = document.createElement("div");
          Object.assign(fd.style, { position: "absolute", left: "0", top: "0", width: "100%", height: `${(fold * 100).toFixed(2)}%`, background: actionColor("FOLD", 0) });
          d.appendChild(fd);
        }
        const remain = Math.max(0, 1 - fold);
        if (remain > 0.001) {
          const bar = document.createElement("div");
          Object.assign(bar.style, { position: "absolute", left: "0", bottom: "0", width: "100%", height: `${(remain * 100).toFixed(2)}%`, display: "flex" });
          let betRaiseId = 0;
          for (let k = 0; k < hs.actions.length; k++) {
            if (k === foldIdx) continue;
            const p = hs.probs[k] / remain;
            if (p <= 0.001) continue;
            const seg = document.createElement("div");
            Object.assign(seg.style, { width: `${(p * 100).toFixed(2)}%`, height: "100%", background: actionColor(hs.actions[k], betRaiseId) });
            if (/^(BET|RAISE)/i.test(String(hs.actions[k]))) betRaiseId += 1;
            bar.appendChild(seg);
          }
          d.appendChild(bar);
        }
        d.onmouseenter = () => {
          const lines = [`${h}`, "Average:"];
          for (let k = 0; k < hs.actions.length; k++) lines.push(`${fmtActionLabel(hs.actions[k])}: ${(hs.probs[k] * 100).toFixed(1)}%`);
          document.getElementById("resultDetail").value = lines.join("\n");
          state.lastHoveredStat = { hand: h, stat: hs };
          renderComboGrid(state.lastHoveredStat);
        };
      }
      const lbl = document.createElement("div");
      Object.assign(lbl.style, { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "2" });
      lbl.textContent = h;
      d.appendChild(lbl);
      root.appendChild(d);
    }
  }
}

function calcRoughStrategy(snapshot) {
  if (!snapshot?.strategy_actions?.length) return [];
  const sums = new Array(snapshot.strategy_actions.length).fill(0);
  let count = 0;
  for (const probs of Object.values(snapshot.strategy || {})) {
    if (!Array.isArray(probs) || probs.length !== sums.length) continue;
    probs.forEach((v, i) => { sums[i] += Number(v) || 0; });
    count += 1;
  }
  return count ? snapshot.strategy_actions.map((a, i) => ({ action: a, p: sums[i] / count })) : [];
}

function renderRoughStrategy(snapshot) {
  const root = document.getElementById("roughStrategyMatrix");
  root.innerHTML = "";
  const rows = (state.resultMode === "ev" || state.resultMode === "ev_only") && Array.isArray(state.resultEvData?.rough_strategy)
    ? state.resultEvData.rough_strategy.map((r) => ({ action: r.action, p: r.avg_strategy, ev: r.action_ev }))
    : calcRoughStrategy(snapshot);
  if (!rows.length) return;
  root.style.gridTemplateColumns = `repeat(${rows.length},1fr)`;
  for (const r of rows) {
    const cell = document.createElement("div");
    cell.className = "res-cell";
    let bg = (state.resultMode === "ev" || state.resultMode === "ev_only") ? evColor(r.ev || 0, 0, r.action) : "#0fb5ff";
    if (!(state.resultMode === "ev" || state.resultMode === "ev_only")) {
      const up = String(r.action || "").toUpperCase();
      if (up.startsWith("CHECK") || up.startsWith("CALL")) bg = "#45c046";
      if (up.startsWith("BET") || up.startsWith("RAISE")) bg = "#ff7b7b";
    }
    cell.style.background = bg;
    cell.innerHTML = (state.resultMode === "ev" || state.resultMode === "ev_only")
      ? `${fmtActionLabel(r.action)}<br>${((r.p || 0) * 100).toFixed(1)}%<br>EV ${(Number(r.ev || 0)).toFixed(3)}`
      : `${fmtActionLabel(r.action)}<br>${((r.p || 0) * 100).toFixed(1)}%`;
    root.appendChild(cell);
  }
}

function modeHint() {
  if (state.resultMode === "strategy") return "strategy：显示非FOLD频率";
  if (state.resultMode === "ip") return "IP：显示当前路径条件下 IP 范围热图";
  if (state.resultMode === "oop") return "OOP：显示当前路径条件下 OOP 范围热图";
  if (state.resultMode === "ev") return "Ev + strategy：按后端混合后的 action EV 颜色";
  return "Ev：按后端混合后的组合 EV 颜色";
}

function nodeDisplayLabel(node) {
  if (!node) return "NoNodeChosen";
  if (node.node_type === "action_node") return `${node.player === 0 ? "IP" : "OOP"} decision node`;
  if (node.node_type === "chance_node") return "Chance node";
  if (node.node_type === "terminal_node") return "Terminal node";
  if (node.node_type === "showdown_node") return "Showdown node";
  return "NoNodeChosen";
}

async function loadNodeEv(node) {
  const r = await fetch("/api/node-ev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trace: node.trace || [],
      mode: document.getElementById("mode").value,
      board: parseCardListInput(elements.boardEl.value.trim()),
      turn_card: document.getElementById("turnCardBox").value,
      river_card: document.getElementById("riverCardBox").value,
      range_ip: elements.rangeIpEl.value.trim(),
      range_oop: elements.rangeOopEl.value.trim(),
    }),
  });
  return await r.json();
}

export function renderResultTree(root) {
  const container = document.getElementById("resultTree");
  const makeTree = (node) => {
    const li = document.createElement("li");
    const snap = snapshotForNode(node);
    const hasChildren = snap.node_type === "action_node" || snap.node_type === "chance_node";
    if (hasChildren) {
      const tg = document.createElement("button");
      tg.className = "tree-btn";
      tg.textContent = state.expandedResultNodes.has(node.id) ? "▼" : "▶";
      tg.style.width = "20px";
      tg.onclick = () => {
        if (state.expandedResultNodes.has(node.id)) state.expandedResultNodes.delete(node.id);
        else state.expandedResultNodes.add(node.id);
        renderResultTree(state.resultRoot);
      };
      li.appendChild(tg);
    } else {
      const pad = document.createElement("span");
      pad.textContent = "  ";
      li.appendChild(pad);
    }
    const btn = document.createElement("button");
    btn.className = "tree-btn" + (state.resultSelected?.id === node.id ? " active" : "");
    btn.textContent = node.title;
    btn.onclick = () => selectResultNode(node.id);
    li.appendChild(btn);
    if (state.expandedResultNodes.has(node.id)) {
      ensureNodeChildren(node);
      if (node.children?.length) {
        const ul = document.createElement("ul");
        for (const c of node.children) ul.appendChild(makeTree(c));
        li.appendChild(ul);
      }
    }
    return li;
  };
  const ul = document.createElement("ul");
  ul.appendChild(makeTree(root));
  container.innerHTML = "";
  container.appendChild(ul);
}

export function fillTurnRiverCards() {
  const cards = getDeckCards();
  const used = new Set(String(elements.boardEl.value || "").split(",").map((v) => v.trim()).filter(Boolean));
  const avail = cards.filter((c) => !used.has(c));
  const turn = document.getElementById("turnCardBox");
  const river = document.getElementById("riverCardBox");
  const prevTurn = turn.value;
  const prevRiver = river.value;
  turn.innerHTML = "";
  river.innerHTML = "";
  for (const c of avail) {
    const o1 = document.createElement("option");
    o1.value = c;
    o1.textContent = formatCardDisplay(c);
    turn.appendChild(o1);
  }
  if (prevTurn && avail.includes(prevTurn)) turn.value = prevTurn;
  for (const c of avail.filter((c) => c !== turn.value)) {
    const o2 = document.createElement("option");
    o2.value = c;
    o2.textContent = formatCardDisplay(c);
    river.appendChild(o2);
  }
  if (prevRiver && Array.from(river.options).some((o) => o.value === prevRiver)) river.value = prevRiver;
}

export async function selectResultNode(id) {
  const node = findNode(id);
  if (!node) return;
  const snapshot = snapshotForNode(node);
  const displaySnapshot = tableSnapshotForNode(node, snapshot);
  state.resultSelected = node;
  renderResultTree(state.resultRoot);
  document.getElementById("resultNodeLabel").textContent = nodeDisplayLabel(snapshot);
  document.getElementById("resultBoardLabel").textContent = formatCardListDisplay(elements.boardEl.value.trim());
  let map;
  let hs;
  let rangeSummary = null;
  if (state.resultMode === "ip" || state.resultMode === "oop") {
    state.resultEvData = null;
    const reach = computeReachForNode(node);
    const comboReach = state.resultMode === "ip" ? reach.ip : reach.oop;
    hs = buildRangeHandStats(comboReach);
    map = buildGridFromRangeStats(hs);
    const tops = [];
    let nonzero = 0;
    for (const [k, v] of map.entries()) {
      if ((Number(v) || 0) > 0.001) {
        nonzero += 1;
        tops.push([k, v]);
      }
    }
    tops.sort((a, b) => b[1] - a[1]);
    rangeSummary = { nonzero_hands: nonzero, top: tops.slice(0, 12).map(([h, w]) => `${h}:${(w * 100).toFixed(1)}%`) };
  } else if (state.resultMode === "ev" || state.resultMode === "ev_only") {
    const evResp = await loadNodeEv(node);
    if (!evResp.ok) {
      state.resultEvData = null;
      document.getElementById("resultDetail").value = evResp.error || "读取 EV 失败";
      document.getElementById("resultModeNote").textContent = evResp.error || "读取 EV 失败";
      map = buildGridFromNode(displaySnapshot);
      hs = buildHandStats(displaySnapshot);
    } else {
      state.resultEvData = evResp;
      hs = new Map();
      map = new Map();
      const ranks = getRanks();
      for (let i = 0; i < ranks.length; i++) {
        for (let j = 0; j < ranks.length; j++) {
          const label = handLabel(ranks, i, j).toUpperCase();
          const stat = evResp.matrix[label] || { actions: evResp.actions, avg_strategy: [], action_evs: [], combos: [], combo_evs: [] };
          stat.actions = evResp.actions || [];
          hs.set(label, stat);
          const comboEvs = Array.isArray(stat.combo_evs) ? stat.combo_evs : [];
          const meanEv = comboEvs.length ? comboEvs.reduce((a, b) => a + b, 0) / comboEvs.length : 0;
          map.set(label, normalizeEv(meanEv));
        }
      }
    }
  } else {
    state.resultEvData = null;
    map = buildGridFromNode(displaySnapshot);
    hs = buildHandStats(displaySnapshot);
  }
  renderMatrixByMap("strategyMatrix", map, hs);
  renderRoughStrategy(displaySnapshot);
  state.lastHoveredStat = null;
  renderComboGrid(null);
  const detail = state.resultMode === "ip" || state.resultMode === "oop"
    ? { mode: state.resultMode, title: node.title, id: node.id, node_type: snapshot.node_type, player: snapshot.player, range_nonzero_hands: rangeSummary?.nonzero_hands || 0, range_top: rangeSummary?.top || [] }
    : (state.resultMode === "ev" || state.resultMode === "ev_only") && state.resultEvData
    ? { mode: state.resultMode, title: node.title, id: node.id, node_type: snapshot.node_type, player: snapshot.player, ev_player: state.resultEvData.player, actions: state.resultEvData.actions }
    : { mode: state.resultMode, title: node.title, id: node.id, node_type: snapshot.node_type, player: snapshot.player, actions: snapshot.actions, strategy_actions: snapshot.strategy_actions };
  document.getElementById("resultDetail").value = JSON.stringify(detail, null, 2);
  document.getElementById("resultModeNote").textContent = modeHint();
}

export async function loadResult() {
  const r = await fetch("/api/result-full");
  if (!r.ok) {
    let msg = "";
    try {
      const body = await r.json();
      msg = body?.error || JSON.stringify(body);
    } catch {
      msg = await r.text();
    }
    elements.logEl.textContent = `读取结果失败: ${msg}`;
    return;
  }
  const raw = await r.json();
  resetResultState();
  state.resultRoot = toDisplayNode(raw, `${readRoundFromBoard()} begin`, "root", 0, []);
  state.resultSelected = state.resultRoot;
  state.expandedResultNodes.add("root");
  fillTurnRiverCards();
  renderResultTree(state.resultRoot);
  await selectResultNode("root");
  renderComboGrid(null);
  elements.resultDlg.style.display = "flex";
}
