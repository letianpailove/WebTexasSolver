import unittest
from pathlib import Path


class UiChineseAndDialogTest(unittest.TestCase):
    def test_ui_is_chinese_and_has_range_dialog(self):
        html = Path(r"D:\project\pokersolver\TexasSolver\web\index.html").read_text(encoding="utf-8")
        self.assertIn("选择IP", html)
        self.assertIn("选择OOP", html)
        self.assertIn("id=\"rangeDialog\"", html)
        self.assertIn("确认", html)
        self.assertIn("取消", html)

    def test_has_oop_street_inputs_and_board_dialog(self):
        html = Path(r"D:\project\pokersolver\TexasSolver\web\index.html").read_text(encoding="utf-8")
        self.assertIn("翻牌圈 OOP", html)
        self.assertIn("转牌圈 OOP", html)
        self.assertIn("河牌圈 OOP", html)
        self.assertIn("id=\"flop_oop_bet\"", html)
        self.assertIn("id=\"turn_oop_bet\"", html)
        self.assertIn("id=\"river_oop_bet\"", html)
        self.assertIn("选择公共牌", html)
        self.assertIn("id=\"boardDialog\"", html)
        self.assertIn("id=\"buildTreeBtn\"", html)
        self.assertIn("id=\"estimateBtn\"", html)
        self.assertIn("id=\"stopBtn\"", html)
        self.assertIn("id=\"copyIpToOopBtn\"", html)
        self.assertIn("id=\"raise_limit\"", html)
        self.assertIn("id=\"dump_rounds\"", html)
        self.assertIn("id=\"use_halffloats\"", html)
        self.assertIn("id=\"resultDialog\"", html)
        self.assertIn("策略浏览器", html)
        self.assertIn("id=\"resultTree\"", html)
        self.assertIn("id=\"strategyMatrix\"", html)
        self.assertIn("id=\"roughStrategyMatrix\"", html)
        self.assertIn("id=\"comboGrid\"", html)


if __name__ == "__main__":
    unittest.main()
