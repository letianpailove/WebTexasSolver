from __future__ import annotations

import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


DEFAULTS = {
    "pot": 50,
    "effective_stack": 200,
    "board": "Qd,Jh,2h",
    "range_ip": "AA,KK,QQ,JJ",
    "range_oop": "QQ,JJ,TT,99",
    "threads": 4,
    "accuracy": 0.5,
    "max_iteration": 100,
    "print_interval": 10,
    "mode": "holdem",
    "allin_threshold": 0.67,
    "raise_limit": 4,
    "use_isomorphism": 1,
    "use_halffloats": 0,
    "dump_rounds": 2,
    "flop_ip_bet": "50",
    "flop_ip_raise": "60",
    "flop_ip_allin": True,
    "turn_ip_bet": "50",
    "turn_ip_raise": "60",
    "turn_ip_allin": True,
    "river_ip_bet": "50",
    "river_ip_raise": "60 100",
    "river_ip_allin": True,
    "flop_oop_bet": "50",
    "flop_oop_raise": "60",
    "flop_oop_allin": True,
    "turn_oop_bet": "50",
    "turn_oop_raise": "60",
    "turn_oop_donk": "50",
    "turn_oop_allin": True,
    "river_oop_bet": "50",
    "river_oop_raise": "60 100",
    "river_oop_donk": "50",
    "river_oop_allin": True,
}


@dataclass
class JobState:
    running: bool = False
    started_at: float | None = None
    finished_at: float | None = None
    last_error: str = ""
    last_exit_code: int | None = None
    command_file: str = ""
    output_file: str = ""
    memory_file: str = ""
    worker_log_file: str = ""
    pid: int | None = None
    tmp_log: str = ""
    action: str = "solve"


class SolverService:
    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        self.release_dir = self.base_dir / "release"
        self.resources_dir = self.base_dir / "resources"
        self.runtime_dir = self.base_dir / "web" / "runtime"
        self.runtime_dir.mkdir(parents=True, exist_ok=True)

        self.api_dll = self.release_dir / "api.dll"
        self.worker_py = self.base_dir / "web" / "worker.py"
        self.job = JobState(tmp_log=str(self.base_dir / "tmp_log.txt"))
        self._lock = threading.Lock()
        self._proc: subprocess.Popen[str] | None = None

    def _sizes(self, v: Any) -> str:
        s = str(v or "").strip().replace(",", " ")
        return ",".join([x for x in s.split() if x])

    def _add_sizes(self, lines: list[str], player: str, street: str, kind: str, val: Any) -> None:
        s = self._sizes(val)
        if not s:
            return
        lines.append(f"set_bet_sizes {player},{street},{kind},{s}")

    def build_command_file(self, payload: dict[str, Any], action: str = "solve") -> str:
        p = dict(DEFAULTS)
        p.update(payload or {})

        ts = int(time.time() * 1000)
        output_path = self.runtime_dir / f"output_result_{ts}.json"
        memory_path = self.runtime_dir / f"estimated_memory_{ts}.txt"
        command_path = self.runtime_dir / f"commands_{ts}.txt"

        lines = [
            f"set_pot {p['pot']}",
            f"set_effective_stack {p['effective_stack']}",
            f"set_board {p['board']}",
            f"set_range_ip {p['range_ip']}",
            f"set_range_oop {p['range_oop']}",
        ]

        self._add_sizes(lines, "oop", "flop", "bet", p["flop_oop_bet"])
        self._add_sizes(lines, "oop", "flop", "raise", p["flop_oop_raise"])
        if p.get("flop_oop_allin"):
            lines.append("set_bet_sizes oop,flop,allin")
        self._add_sizes(lines, "ip", "flop", "bet", p["flop_ip_bet"])
        self._add_sizes(lines, "ip", "flop", "raise", p["flop_ip_raise"])
        if p.get("flop_ip_allin"):
            lines.append("set_bet_sizes ip,flop,allin")

        self._add_sizes(lines, "oop", "turn", "bet", p["turn_oop_bet"])
        self._add_sizes(lines, "oop", "turn", "raise", p["turn_oop_raise"])
        self._add_sizes(lines, "oop", "turn", "donk", p["turn_oop_donk"])
        if p.get("turn_oop_allin"):
            lines.append("set_bet_sizes oop,turn,allin")
        self._add_sizes(lines, "ip", "turn", "bet", p["turn_ip_bet"])
        self._add_sizes(lines, "ip", "turn", "raise", p["turn_ip_raise"])
        if p.get("turn_ip_allin"):
            lines.append("set_bet_sizes ip,turn,allin")

        self._add_sizes(lines, "oop", "river", "bet", p["river_oop_bet"])
        self._add_sizes(lines, "oop", "river", "raise", p["river_oop_raise"])
        self._add_sizes(lines, "oop", "river", "donk", p["river_oop_donk"])
        if p.get("river_oop_allin"):
            lines.append("set_bet_sizes oop,river,allin")
        self._add_sizes(lines, "ip", "river", "bet", p["river_ip_bet"])
        self._add_sizes(lines, "ip", "river", "raise", p["river_ip_raise"])
        if p.get("river_ip_allin"):
            lines.append("set_bet_sizes ip,river,allin")

        lines.append(f"set_allin_threshold {p['allin_threshold']}")
        lines.append(f"set_raise_limit {p['raise_limit']}")
        lines.append("build_tree")

        if action == "solve":
            lines.extend(
                [
                    f"set_thread_num {p['threads']}",
                    f"set_accuracy {p['accuracy']}",
                    f"set_max_iteration {p['max_iteration']}",
                    f"set_print_interval {p['print_interval']}",
                    f"set_use_isomorphism {p['use_isomorphism']}",
                    f"set_use_halffloats {p['use_halffloats']}",
                    "start_solve",
                    f"set_dump_rounds {p['dump_rounds']}",
                    f"dump_result {output_path.as_posix()}",
                ]
            )
        elif action == "estimate_memory":
            lines.append(f"estimate_memory {memory_path.as_posix()}")
        elif action == "build_tree":
            pass
        else:
            raise ValueError(f"unknown action: {action}")

        command_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        with self._lock:
            self.job.command_file = str(command_path)
            self.job.output_file = str(output_path if action == "solve" else "")
            self.job.memory_file = str(memory_path if action == "estimate_memory" else "")
        return str(command_path)

    def _refresh_job_state_locked(self) -> None:
        if self._proc is None:
            return
        rc = self._proc.poll()
        if rc is None:
            return
        if self.job.running:
            self.job.running = False
            self.job.finished_at = time.time()
            self.job.last_exit_code = int(rc)
            self.job.pid = None
        self._proc = None

    def start_job(self, payload: dict[str, Any], action: str = "solve") -> dict[str, Any]:
        if not self.api_dll.exists():
            return {"ok": False, "error": f"api.dll not found at {self.api_dll}"}
        if not self.worker_py.exists():
            return {"ok": False, "error": f"worker not found at {self.worker_py}"}

        with self._lock:
            self._refresh_job_state_locked()
            if self.job.running:
                return {"ok": False, "error": "job already running"}

        command_file = self.build_command_file(payload, action=action)
        mode = str((payload or {}).get("mode", "holdem"))
        ts = int(time.time() * 1000)
        worker_log = self.runtime_dir / f"worker_{ts}.log"
        log_fp = open(worker_log, "w", encoding="utf-8")
        env = os.environ.copy()
        extra_paths = [str(self.release_dir)]
        for p in (r"C:\msys64\ucrt64\bin", r"C:\msys64\mingw64\bin", r"C:\msys64\clang64\bin"):
            if Path(p).exists():
                extra_paths.append(p)
        env["PATH"] = os.pathsep.join(extra_paths + [env.get("PATH", "")])

        try:
            proc = subprocess.Popen(
                [
                    sys.executable,
                    str(self.worker_py),
                    str(self.base_dir),
                    str(command_file),
                    str(self.resources_dir),
                    mode,
                ],
                cwd=str(self.base_dir),
                stdout=log_fp,
                stderr=subprocess.STDOUT,
                text=True,
                env=env,
            )
        finally:
            log_fp.close()

        with self._lock:
            self._proc = proc
            self.job.running = True
            self.job.started_at = time.time()
            self.job.finished_at = None
            self.job.last_error = ""
            self.job.last_exit_code = None
            self.job.worker_log_file = str(worker_log)
            self.job.pid = proc.pid
            self.job.action = action

        return {"ok": True, "command_file": command_file, "action": action, "pid": proc.pid}

    def stop_job(self) -> dict[str, Any]:
        with self._lock:
            self._refresh_job_state_locked()
            if not self.job.running or self._proc is None:
                return {"ok": False, "error": "no running job"}
            proc = self._proc

        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=3)

        with self._lock:
            self.job.running = False
            self.job.finished_at = time.time()
            self.job.last_exit_code = proc.returncode
            self.job.last_error = "stopped by user"
            self.job.pid = None
            self._proc = None

        return {"ok": True, "stopped": True}

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            self._refresh_job_state_locked()
            job = dict(
                running=self.job.running,
                started_at=self.job.started_at,
                finished_at=self.job.finished_at,
                last_error=self.job.last_error,
                last_exit_code=self.job.last_exit_code,
                command_file=self.job.command_file,
                output_file=self.job.output_file,
                memory_file=self.job.memory_file,
                worker_log_file=self.job.worker_log_file,
                pid=self.job.pid,
                action=self.job.action,
            )
        output_file = Path(job["output_file"]) if job.get("output_file") else None
        job["result_exists"] = bool(output_file and output_file.exists())
        return job

    def read_log(self) -> str:
        status = self.get_status()
        log_path = Path(status.get("worker_log_file") or "")
        if not log_path.exists():
            log_path = Path(self.job.tmp_log)
        if not log_path.exists():
            return ""

        raw = log_path.read_text(encoding="utf-8", errors="ignore")
        action = str(status.get("action") or self.job.action or "solve")
        if action == "build_tree":
            if status.get("running"):
                return "构建游戏树中..\n"
            if status.get("last_exit_code") == 0:
                return "构建游戏树中..\n构建游戏树完成\n"
            if status.get("last_exit_code") is not None:
                return "构建游戏树中..\n构建游戏树失败\n"
            return "构建游戏树中..\n"

        text = self._format_log_for_web(raw)
        if not text.strip():
            text = raw
        if (not status.get("running")) and status.get("last_exit_code") == 0 and "求解结束." not in text:
            text = text.rstrip() + ("\n" if text.strip() else "") + "求解结束.\n"
        return text[-20000:]

    def _format_log_for_web(self, raw: str) -> str:
        content = str(raw or "")
        if ("Iter:" not in content) and ("Using " not in content) and ("exploitability" not in content):
            return content

        out: list[str] = [
            "加载德州扑克手牌对比器文件。",
            "加载短牌手牌对比器文件。",
            "",
            "加载完毕。可以开始建树求解。",
            "",
            "构建游戏树中..",
            "构建游戏树完成",
        ]
        started = False

        for raw_line in content.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line in ("EXEC FROM FILE", "<<<START SOLVING>>>"):
                continue

            m = re.match(r"^Using\s+(\d+)\s+threads$", line, flags=re.IGNORECASE)
            if m:
                if not started:
                    out.append("开始求解..")
                    started = True
                out.append(f"使用 {m.group(1)} 个进程")
                continue

            m = re.match(r"^Iter:\s*(\d+)$", line, flags=re.IGNORECASE)
            if m:
                out.append(f"迭代轮数: {m.group(1)}")
                continue

            m = re.match(r"^player\s+0\s+exploitability\s+(.+)$", line, flags=re.IGNORECASE)
            if m:
                out.append(f"玩家 0 剥削度 {m.group(1).strip()}")
                continue

            m = re.match(r"^player\s+1\s+exploitability\s+(.+)$", line, flags=re.IGNORECASE)
            if m:
                out.append(f"玩家 1 剥削度 {m.group(1).strip()}")
                continue

            m = re.match(r"^Total\s+exploitability\s+(.+)\s+precent$", line, flags=re.IGNORECASE)
            if m:
                out.append(f"总体剥削度:百分之 {m.group(1).strip()}  (底池)")
                continue

            m = re.match(r"^time\s+used:\s*(.+?)\s+second\.?$", line, flags=re.IGNORECASE)
            if m:
                out.append(f"耗时:  {m.group(1).strip()}  秒.")
                continue

            if line == "collecting statics":
                out.append("收集数据中")
                continue
            if line == "statics collected":
                out.append("收集数据完毕")
                continue
            if line == "save success":
                out.append("求解结束.")
                continue
            if line == "-------------------":
                out.append(line)
                continue

            out.append(line)

        return "\n".join(out) + "\n"

    def read_result(self) -> dict[str, Any]:
        status = self.get_status()
        output_file = status.get("output_file")
        if not output_file:
            return {"ok": False, "error": "no output file yet"}
        p = Path(output_file)
        if not p.exists():
            return {"ok": False, "error": "result not generated yet"}
        try:
            raw = p.read_text(encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}
        preview = raw[:4000]
        return {"ok": True, "path": str(p), "size": len(raw), "preview": preview}

    def read_memory(self) -> dict[str, Any]:
        status = self.get_status()
        memory_file = status.get("memory_file")
        if not memory_file:
            return {"ok": False, "error": "no memory file yet"}
        p = Path(memory_file)
        if not p.exists():
            return {"ok": False, "error": "memory estimate not generated yet"}
        raw = p.read_text(encoding="utf-8", errors="ignore").strip()
        try:
            memory_float = int(raw)
        except Exception:  # noqa: BLE001
            return {"ok": False, "error": f"invalid memory content: {raw}"}

        memory_mb = memory_float / 1024 / 1024 * 4
        memory_gb = memory_float / 1024 / 1024 / 1024 * 4
        return {
            "ok": True,
            "path": str(p),
            "memory_float": memory_float,
            "memory_mb": memory_mb,
            "memory_gb": memory_gb,
        }

    def _read_result_json(self) -> dict[str, Any]:
        status = self.get_status()
        output_file = status.get("output_file")
        if not output_file:
            raise FileNotFoundError("no output file yet")
        p = Path(output_file)
        if not p.exists():
            raise FileNotFoundError("result not generated yet")
        return json.loads(p.read_text(encoding="utf-8"))

    def _get_ranks(self, mode: str) -> list[str]:
        return ["A", "K", "Q", "J", "T", "9", "8", "7", "6"] if mode == "shortdeck" else ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]

    def _get_deck_cards(self, mode: str) -> list[str]:
        suits = ["c", "d", "h", "s"]
        return [rank + suit for rank in self._get_ranks(mode) for suit in suits]

    def _parse_card_code(self, token: Any) -> str:
        t = str(token or "").strip()
        if len(t) < 2:
            return t
        suit_map = {"C": "c", "D": "d", "H": "h", "S": "s", "c": "c", "d": "d", "h": "h", "s": "s"}
        return f"{t[0].upper()}{suit_map.get(t[1], t[1].lower())}"

    def _parse_card_list(self, cards_like: Any) -> list[str]:
        if isinstance(cards_like, list):
            return [self._parse_card_code(x) for x in cards_like if str(x).strip()]
        return [self._parse_card_code(x) for x in str(cards_like or "").split(",") if x.strip()]

    def _hand_label(self, ranks: list[str], i: int, j: int) -> str:
        if i == j:
            return ranks[i] + ranks[j]
        if i < j:
            return ranks[i] + ranks[j] + "S"
        return ranks[j] + ranks[i] + "O"

    def _parse_range_text(self, text: str, ranks: list[str]) -> dict[str, float]:
        raw_map: dict[str, float] = {}
        for token in str(text or "").split(","):
            token = token.strip()
            if not token:
                continue
            hand, _, weight_text = token.partition(":")
            hand = hand.strip().upper()
            try:
                weight = float(weight_text) if weight_text else 1.0
            except ValueError:
                continue
            weight = max(0.0, min(1.0, weight))
            if len(hand) == 2 and hand[0] == hand[1]:
                raw_map[hand] = weight
            elif len(hand) == 2:
                raw_map[hand + "S"] = weight
                raw_map[hand + "O"] = weight
            elif len(hand) == 3:
                raw_map[hand] = weight

        out: dict[str, float] = {}
        dim = len(ranks)
        for i in range(dim):
            for j in range(dim):
                label = self._hand_label(ranks, i, j)
                if label in raw_map:
                    out[label] = raw_map[label]
        return out

    def _combo_class_label(self, c1: str, c2: str, ranks: list[str]) -> str | None:
        r1, r2 = c1[0].upper(), c2[0].upper()
        s1, s2 = c1[1].lower(), c2[1].lower()
        if r1 == r2:
            return f"{r1}{r2}"
        i1 = ranks.index(r1) if r1 in ranks else -1
        i2 = ranks.index(r2) if r2 in ranks else -1
        if i1 < 0 or i2 < 0:
            return None
        hi, lo = (r1, r2) if i1 < i2 else (r2, r1)
        return f"{hi}{lo}{'S' if s1 == s2 else 'O'}"

    def _expand_range_to_combos(self, range_text: str, mode: str) -> dict[str, float]:
        ranks = self._get_ranks(mode)
        class_weights = self._parse_range_text(range_text, ranks)
        deck = self._get_deck_cards(mode)
        out: dict[str, float] = {}
        for i in range(len(deck)):
            for j in range(i + 1, len(deck)):
                c1, c2 = deck[i], deck[j]
                combo_class = self._combo_class_label(c1, c2, ranks)
                if not combo_class:
                    continue
                weight = float(class_weights.get(combo_class.upper(), 0.0))
                if weight > 0:
                    out[f"{c1}{c2}"] = weight
        return out

    def _zero_blocked_cards(self, combo_map: dict[str, float], cards: list[str]) -> None:
        blocked = set(self._parse_card_code(card) for card in cards)
        for combo in list(combo_map.keys()):
            if combo[:2] in blocked or combo[2:4] in blocked:
                combo_map[combo] = 0.0

    def _swap_combo_key(self, combo: str) -> str:
        return combo[2:4] + combo[0:2] if len(combo) >= 4 else combo

    def _first_object_value(self, raw: Any) -> Any:
        if not isinstance(raw, dict):
            return None
        for value in raw.values():
            return value
        return None

    def _get_deal_card_by_chance_index(self, board_cards: list[str], turn_card: str, river_card: str, idx: int) -> str:
        if len(board_cards) == 3:
            return turn_card if idx == 0 else river_card
        if len(board_cards) == 4:
            return river_card
        return ""

    def _resolve_raw_node(self, raw_root: dict[str, Any], trace: list[dict[str, Any]], board_cards: list[str], turn_card: str, river_card: str) -> dict[str, Any] | None:
        raw: Any = raw_root
        for step in trace or []:
            if not isinstance(raw, dict):
                return None
            if step.get("kind") == "action":
                raw = raw.get("childrens", {}).get(step.get("action"))
            elif step.get("kind") == "chance":
                deals = raw.get("dealcards") if isinstance(raw.get("dealcards"), dict) else None
                if not deals:
                    raw = self._first_object_value(raw.get("childrens"))
                    continue
                chosen = self._get_deal_card_by_chance_index(board_cards, turn_card, river_card, int(step.get("idx", 0)))
                raw = deals.get(chosen) or self._first_object_value(deals)
            else:
                return None
        return raw if isinstance(raw, dict) else None

    def _compute_reach_for_node(
        self,
        raw_root: dict[str, Any],
        trace: list[dict[str, Any]],
        mode: str,
        range_ip: str,
        range_oop: str,
        board_cards: list[str],
        turn_card: str,
        river_card: str,
    ) -> tuple[dict[str, float], dict[str, float]]:
        ip = self._expand_range_to_combos(range_ip, mode)
        oop = self._expand_range_to_combos(range_oop, mode)
        self._zero_blocked_cards(ip, board_cards)
        self._zero_blocked_cards(oop, board_cards)

        raw: Any = raw_root
        for step in trace or []:
            if not isinstance(raw, dict):
                break
            if step.get("kind") == "action":
                actions = raw.get("strategy", {}).get("actions") or raw.get("actions") or []
                action_name = step.get("action")
                try:
                    idx = actions.index(action_name)
                except ValueError:
                    idx = -1
                actor = raw.get("player")
                strategy = raw.get("strategy", {}).get("strategy") or {}
                target = ip if actor == 0 else oop
                for combo, weight in list(target.items()):
                    if weight <= 0:
                        continue
                    probs = strategy.get(combo) or strategy.get(self._swap_combo_key(combo))
                    prob = float(probs[idx]) if idx >= 0 and isinstance(probs, list) and idx < len(probs) else 0.0
                    target[combo] = weight * prob
                raw = raw.get("childrens", {}).get(action_name)
                continue
            if step.get("kind") == "chance":
                chosen = self._get_deal_card_by_chance_index(board_cards, turn_card, river_card, int(step.get("idx", 0)))
                if chosen:
                    self._zero_blocked_cards(ip, [chosen])
                    self._zero_blocked_cards(oop, [chosen])
                deals = raw.get("dealcards") if isinstance(raw.get("dealcards"), dict) else None
                raw = (deals.get(chosen) if deals and chosen else None) or self._first_object_value(deals) or self._first_object_value(raw.get("childrens"))
        return ip, oop

    def get_node_ev(self, payload: dict[str, Any]) -> dict[str, Any]:
        trace = payload.get("trace") or []
        mode = str(payload.get("mode") or DEFAULTS["mode"])
        board_cards = self._parse_card_list(payload.get("board") or DEFAULTS["board"])
        turn_card = self._parse_card_code(payload.get("turn_card") or "")
        river_card = self._parse_card_code(payload.get("river_card") or "")
        range_ip = str(payload.get("range_ip") or DEFAULTS["range_ip"])
        range_oop = str(payload.get("range_oop") or DEFAULTS["range_oop"])

        raw_root = self._read_result_json()
        raw_node = self._resolve_raw_node(raw_root, trace, board_cards, turn_card, river_card)
        if not raw_node:
            return {"ok": False, "error": "node not found"}

        if raw_node.get("node_type") == "chance_node":
            deals = raw_node.get("dealcards") if isinstance(raw_node.get("dealcards"), dict) else None
            chosen = self._get_deal_card_by_chance_index(board_cards, turn_card, river_card, 0)
            raw_node = (deals.get(chosen) if deals and chosen else None) or self._first_object_value(deals)
            if not isinstance(raw_node, dict):
                return {"ok": False, "error": "chance node has no resolved child"}

        if raw_node.get("node_type") != "action_node":
            return {"ok": False, "error": "selected node is not an action node"}

        evs_map = raw_node.get("evs")
        strategy_block = raw_node.get("strategy") if isinstance(raw_node.get("strategy"), dict) else {}
        strategy_map = strategy_block.get("strategy") if isinstance(strategy_block.get("strategy"), dict) else {}
        actions = strategy_block.get("actions") if isinstance(strategy_block.get("actions"), list) else raw_node.get("actions") or []
        if not isinstance(evs_map, dict):
            return {"ok": False, "error": "result file does not contain evs; rebuild solver output and solve again"}

        ip_reach, oop_reach = self._compute_reach_for_node(raw_root, trace, mode, range_ip, range_oop, board_cards, turn_card, river_card)
        current_player = int(raw_node.get("player", 0))
        current_reach = ip_reach if current_player == 0 else oop_reach

        ranks = self._get_ranks(mode)
        matrix: dict[str, Any] = {}
        for i in range(len(ranks)):
            for j in range(len(ranks)):
                label = self._hand_label(ranks, i, j).upper()
                matrix[label] = {
                    "avg_strategy": [0.0 for _ in actions],
                    "action_evs": [0.0 for _ in actions],
                    "combo_evs": [],
                    "combos": [],
                }

        for hand, probs_any in strategy_map.items():
            evs_any = evs_map.get(hand)
            if not isinstance(probs_any, list) or not isinstance(evs_any, list) or len(probs_any) != len(actions) or len(evs_any) != len(actions):
                continue
            combo_class = self._combo_class_label(hand[:2], hand[2:4], ranks)
            if not combo_class:
                continue
            combo_key = hand[:2] + hand[2:4]
            reach = float(current_reach.get(combo_key, current_reach.get(self._swap_combo_key(combo_key), 0.0)))
            probs = [float(x) for x in probs_any]
            evs = [float(x) for x in evs_any]
            combo_ev = sum(probs[i] * evs[i] for i in range(len(actions)))
            entry = matrix[combo_class.upper()]
            entry["combos"].append(
                {
                    "hand": hand,
                    "range": reach,
                    "probs": probs,
                    "evs": evs,
                    "combo_ev": combo_ev,
                }
            )
            entry["combo_evs"].append(combo_ev)
            if reach > 0:
                for idx in range(len(actions)):
                    entry["avg_strategy"][idx] += probs[idx] * reach
                    entry["action_evs"][idx] += probs[idx] * evs[idx] * reach

        rough_strategy: list[dict[str, Any]] = []
        for idx, action in enumerate(actions):
            combo_sum = 0.0
            avg_strategy_sum = 0.0
            weighted_action_ev = 0.0
            for entry in matrix.values():
                combo_sum += sum((combo["range"] or 0.0) * (combo["probs"][idx] if idx < len(combo["probs"]) else 0.0) for combo in entry["combos"])
                avg_strategy_sum += entry["avg_strategy"][idx]
                weighted_action_ev += entry["action_evs"][idx]
            rough_strategy.append(
                {
                    "action": action,
                    "combo": combo_sum,
                    "avg_strategy": avg_strategy_sum,
                    "action_ev": (weighted_action_ev / combo_sum) if combo_sum > 0 else 0.0,
                }
            )

        for entry in matrix.values():
            combos = entry["combos"]
            combos.sort(key=lambda x: x["combo_ev"], reverse=True)
            range_sum = sum(max(0.0, float(combo["range"])) for combo in combos)
            for idx in range(len(actions)):
                strategy_mass = sum((combo["range"] or 0.0) * combo["probs"][idx] for combo in combos)
                if range_sum > 0:
                    entry["avg_strategy"][idx] /= range_sum
                if strategy_mass > 0:
                    entry["action_evs"][idx] /= strategy_mass

        return {
            "ok": True,
            "actions": actions,
            "player": current_player,
            "matrix": matrix,
            "rough_strategy": rough_strategy,
        }


def make_handler(service: SolverService):
    class Handler(BaseHTTPRequestHandler):
        def _send_json(self, code: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_file(self, path: Path, content_type: str) -> None:
            body = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_bytes(self, code: int, body: bytes, content_type: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_static(self, rel_path: str) -> None:
            assets_root = (service.base_dir / "web" / "assets").resolve()
            file_path = (assets_root / rel_path).resolve()
            try:
                file_path.relative_to(assets_root)
            except ValueError:
                return self._send_json(403, {"ok": False, "error": "forbidden"})
            if not file_path.exists() or not file_path.is_file():
                return self._send_json(404, {"ok": False, "error": "not found"})
            content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type in ("application/javascript", "text/javascript"):
                content_type = f"{content_type}; charset=utf-8"
            return self._send_file(file_path, content_type)

        def do_GET(self):  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path in ("/", "/index.html"):
                return self._send_file(service.base_dir / "web" / "index.html", "text/html; charset=utf-8")
            if parsed.path.startswith("/assets/"):
                return self._send_static(parsed.path[len("/assets/"):])
            if parsed.path == "/api/status":
                return self._send_json(200, service.get_status())
            if parsed.path == "/api/log":
                return self._send_json(200, {"ok": True, "log": service.read_log()})
            if parsed.path == "/api/result":
                return self._send_json(200, service.read_result())
            if parsed.path == "/api/result-full":
                status = service.get_status()
                output_file = status.get("output_file")
                if not output_file:
                    return self._send_json(404, {"ok": False, "error": "no output file yet"})
                p = Path(output_file)
                if not p.exists():
                    return self._send_json(404, {"ok": False, "error": "result not generated yet"})
                return self._send_bytes(200, p.read_bytes(), "application/json; charset=utf-8")
            if parsed.path == "/api/memory":
                return self._send_json(200, service.read_memory())
            if parsed.path == "/api/defaults":
                return self._send_json(200, {"ok": True, "defaults": DEFAULTS})
            return self._send_json(404, {"ok": False, "error": "not found"})

        def do_POST(self):  # noqa: N802
            if self.path not in ("/api/solve", "/api/build-tree", "/api/estimate-memory", "/api/stop", "/api/node-ev"):
                return self._send_json(404, {"ok": False, "error": "not found"})

            if self.path == "/api/stop":
                result = service.stop_job()
                return self._send_json(200 if result.get("ok") else 400, result)

            size = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(size) if size > 0 else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8"))
            except Exception:  # noqa: BLE001
                return self._send_json(400, {"ok": False, "error": "invalid json"})

            if self.path == "/api/node-ev":
                result = service.get_node_ev(payload)
                return self._send_json(200 if result.get("ok") else 400, result)

            action = "solve"
            if self.path == "/api/build-tree":
                action = "build_tree"
            elif self.path == "/api/estimate-memory":
                action = "estimate_memory"

            result = service.start_job(payload, action=action)
            return self._send_json(200 if result.get("ok") else 400, result)

    return Handler


def run_server(host: str = "127.0.0.1", port: int = 8080) -> None:
    base = Path(__file__).resolve().parents[1]
    os.chdir(base)
    service = SolverService(base_dir=base)
    httpd = ThreadingHTTPServer((host, port), make_handler(service))
    print(f"TexasSolver web server running at http://{host}:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    run_server(host=host, port=port)




