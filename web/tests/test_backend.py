import unittest
import tempfile
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend import SolverService


class BackendCommandFileTest(unittest.TestCase):
    def test_build_command_file_contains_core_commands(self):
        base = Path(__file__).resolve().parents[1]
        svc = SolverService(base_dir=base)
        payload = {
            "pot": 50,
            "effective_stack": 200,
            "board": "Qd,Jh,2h",
            "range_ip": "AA,KK",
            "range_oop": "QQ,JJ",
            "threads": 2,
            "accuracy": 0.5,
            "max_iteration": 10,
            "print_interval": 1,
            "mode": "holdem",
        }
        cmd_path = svc.build_command_file(payload)
        text = Path(cmd_path).read_text(encoding="utf-8")
        self.assertIn("set_pot 50", text)
        self.assertIn("set_effective_stack 200", text)
        self.assertIn("set_board Qd,Jh,2h", text)
        self.assertIn("set_range_ip AA,KK", text)
        self.assertIn("set_range_oop QQ,JJ", text)
        self.assertIn("set_raise_limit", text)
        self.assertIn("set_use_halffloats", text)
        self.assertIn("set_dump_rounds", text)
        self.assertIn("start_solve", text)
        self.assertIn("dump_result", text)

    def test_build_tree_action_only_contains_build_tree(self):
        base = Path(__file__).resolve().parents[1]
        svc = SolverService(base_dir=base)
        cmd_path = svc.build_command_file({"board": "Qd,Jh,2h"}, action="build_tree")
        text = Path(cmd_path).read_text(encoding="utf-8")
        self.assertIn("build_tree", text)
        self.assertNotIn("start_solve", text)
        self.assertNotIn("dump_result", text)

    def test_estimate_action_contains_estimate_command(self):
        base = Path(__file__).resolve().parents[1]
        svc = SolverService(base_dir=base)
        cmd_path = svc.build_command_file({"board": "Qd,Jh,2h"}, action="estimate_memory")
        text = Path(cmd_path).read_text(encoding="utf-8")
        self.assertIn("build_tree", text)
        self.assertIn("estimate_memory", text)

    def test_get_node_ev_aggregates_combo_and_action_evs(self):
        base = Path(__file__).resolve().parents[1]
        svc = SolverService(base_dir=base)
        sample = {
            "node_type": "action_node",
            "player": 0,
            "actions": ["CHECK", "BET 50", "FOLD"],
            "strategy": {
                "actions": ["CHECK", "BET 50", "FOLD"],
                "strategy": {
                    "AsKs": [0.5, 0.5, 0.0],
                    "AhKh": [0.25, 0.75, 0.0],
                },
            },
            "evs": {
                "AsKs": [1.0, 3.0, -2.0],
                "AhKh": [0.0, 4.0, -2.0],
            },
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "result.json"
            out.write_text(__import__("json").dumps(sample), encoding="utf-8")
            svc.job.output_file = str(out)
            result = svc.get_node_ev(
                {
                    "mode": "holdem",
                    "board": ["Qd", "Jh", "2h"],
                    "range_ip": "AKs",
                    "range_oop": "QQ",
                    "range_trace": [],
                }
            )

        self.assertTrue(result["ok"])
        aks = result["matrix"]["AKS"]
        self.assertEqual(result["actions"], ["CHECK", "BET 50", "FOLD"])
        self.assertEqual(len(aks["combos"]), 2)
        self.assertAlmostEqual(aks["combos"][0]["combo_ev"], 3.0)
        self.assertAlmostEqual(aks["combos"][1]["combo_ev"], 2.0)
        self.assertAlmostEqual(aks["action_evs"][0], 0.5)
        self.assertAlmostEqual(aks["action_evs"][1], 3.5)

    def test_read_log_matches_original_chinese_style_and_finish_hint(self):
        base = Path(__file__).resolve().parents[1]
        svc = SolverService(base_dir=base)
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            worker_log = tmpdir_path / "worker.log"
            tmp_log = tmpdir_path / "tmp_log.txt"
            worker_log.write_text(
                "EXEC FROM FILE\n"
                "<<<START SOLVING>>>\n"
                "Using 8 threads\n"
                "Iter: 11\n"
                "player 0 exploitability 15.528\n"
                "player 1 exploitability 2.73487\n"
                "Total exploitability 18.2628 precent\n"
                "time used:  3.014  second.\n"
                "-------------------\n"
                "collecting statics\n"
                "statics collected\n"
                "save success\n",
                encoding="utf-8",
            )
            tmp_log.write_text('{"iteration":9}\n', encoding="utf-8")

            svc.job.worker_log_file = str(worker_log)
            svc.job.tmp_log = str(tmp_log)
            svc.job.running = False
            svc.job.last_exit_code = 0

            text = svc.read_log()

        self.assertIn("加载德州扑克手牌对比器文件。", text)
        self.assertIn("加载短牌手牌对比器文件。", text)
        self.assertIn("加载完毕。可以开始建树求解。", text)
        self.assertIn("构建游戏树中..", text)
        self.assertIn("构建游戏树完成", text)
        self.assertIn("开始求解..", text)
        self.assertIn("使用 8 个进程", text)
        self.assertIn("迭代轮数: 11", text)
        self.assertIn("玩家 0 剥削度 15.528", text)
        self.assertIn("玩家 1 剥削度 2.73487", text)
        self.assertIn("总体剥削度:百分之 18.2628  (底池)", text)
        self.assertIn("耗时:  3.014  秒.", text)
        self.assertIn("-------------------", text)
        self.assertIn("收集数据中", text)
        self.assertIn("收集数据完毕", text)
        self.assertNotIn('{"iteration":9}', text)
        self.assertIn("求解结束.", text)

    def test_build_tree_log_should_only_show_tree_build_messages(self):
        base = Path(__file__).resolve().parents[1]
        svc = SolverService(base_dir=base)
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            worker_log = tmpdir_path / "worker.log"
            worker_log.write_text("EXEC FROM FILE\n", encoding="utf-8")
            svc.job.worker_log_file = str(worker_log)
            svc.job.running = False
            svc.job.last_exit_code = 0
            svc.job.action = "build_tree"

            text = svc.read_log()

        self.assertEqual(text, "构建游戏树中..\n构建游戏树完成\n")
        self.assertNotIn("EXEC FROM FILE", text)
        self.assertNotIn("求解结束.", text)

    def test_get_node_ev_missing_evs_shows_actionable_hint(self):
        base = Path(__file__).resolve().parents[1]
        svc = SolverService(base_dir=base)
        sample = {
            "node_type": "action_node",
            "player": 0,
            "actions": ["CHECK", "BET 50"],
            "strategy": {
                "actions": ["CHECK", "BET 50"],
                "strategy": {
                    "AsKs": [0.5, 0.5],
                },
            },
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "result.json"
            out.write_text(__import__("json").dumps(sample), encoding="utf-8")
            svc.job.output_file = str(out)
            result = svc.get_node_ev({"trace": []})

        self.assertFalse(result["ok"])
        self.assertIn("does not contain evs", result["error"])
        self.assertIn("api.dll", result["error"])

    def test_get_node_ev_chance_node_without_dumped_action_shows_hint(self):
        base = Path(__file__).resolve().parents[1]
        svc = SolverService(base_dir=base)
        sample = {
            "node_type": "chance_node",
            "dealcards": {
                "2c": {
                    "node_type": "chance_node",
                    "deal_number": 0,
                }
            },
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "result.json"
            out.write_text(__import__("json").dumps(sample), encoding="utf-8")
            svc.job.output_file = str(out)
            result = svc.get_node_ev({"trace": [], "board": ["Qd", "Jh", "2h"], "turn_card": "2c"})

        self.assertFalse(result["ok"])
        self.assertIn("dump_rounds", result["error"])


if __name__ == "__main__":
    unittest.main()
