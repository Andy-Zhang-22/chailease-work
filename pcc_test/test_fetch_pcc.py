"""tools/fetch-pcc.py 的純函式測試（假資料）：python3 pcc_test/test_fetch_pcc.py"""
import importlib.util, os, sys, unittest
spec = importlib.util.spec_from_file_location("fp", os.path.join(os.path.dirname(__file__), "..", "tools", "fetch-pcc.py"))
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)

DETAIL = {
    "機關資料:機關名稱": "新北市政府教育局", "已公告資料:標案名稱": "某國小校舍整修工程", "已公告資料:標案案號": "1150923-1",
    "決標資料:決標日期": "115/10/23", "決標資料:總決標金額": "新臺幣12,500,000元",
    "投標廠商:投標廠商1:廠商代碼": "12345678", "投標廠商:投標廠商1:廠商名稱": "甲營造有限公司", "投標廠商:投標廠商1:是否得標": "是", "投標廠商:投標廠商1:組織型態": "公司登記",
    "投標廠商:投標廠商1:廠商地址": "新北市新莊區中正路1號", "投標廠商:投標廠商1:廠商電話": "02-2222-3333", "投標廠商:投標廠商1:決標金額": "12,500,000元",
    "投標廠商:投標廠商2:廠商代碼": "23456789", "投標廠商:投標廠商2:廠商名稱": "乙工程有限公司", "投標廠商:投標廠商2:是否得標": "否", "投標廠商:投標廠商2:組織型態": "公司登記", "投標廠商:投標廠商2:廠商地址": "新北市板橋區",
    "投標廠商:投標廠商3:廠商代碼": "34567890", "投標廠商:投標廠商3:廠商名稱": "丙學校", "投標廠商:投標廠商3:是否得標": "是", "投標廠商:投標廠商3:組織型態": "其他", "投標廠商:投標廠商3:廠商地址": "台北市中正區",
    "投標廠商:投標廠商4:廠商代碼": "45678901", "投標廠商:投標廠商4:廠商名稱": "丁企業社", "投標廠商:投標廠商4:是否得標": "是", "投標廠商:投標廠商4:組織型態": "商業登記", "投標廠商:投標廠商4:廠商地址": "桃園市中壢區",
    "投標廠商:投標廠商5:廠商代碼": "", "投標廠商:投標廠商5:廠商名稱": "戊外商", "投標廠商:投標廠商5:是否得標": "是", "投標廠商:投標廠商5:組織型態": "公司登記", "投標廠商:投標廠商5:廠商地址": "台北市信義區",
}

class T(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(fp.parse_amount("新臺幣1,234,567元"), 1234567); self.assertEqual(fp.parse_amount(None), 0)
        self.assertEqual(fp.parse_date("115/10/23"), "2026-10-23"); self.assertEqual(fp.parse_date("2026-10-23"), "2026-10-23")
        self.assertEqual(fp.parse_date("20261023"), "2026-10-23"); self.assertEqual(fp.parse_date("1151023"), "2026-10-23"); self.assertEqual(fp.parse_date("x"), "")
        self.assertTrue(fp.in_city("台北市信義區", fp.CONFIG["cities"])); self.assertFalse(fp.in_city("桃園市", fp.CONFIG["cities"]))
        self.assertTrue(fp.in_city("114 臺北市內湖區", fp.CONFIG["cities"])); self.assertTrue(fp.in_city("23553新北市中和區", fp.CONFIG["cities"])); self.assertFalse(fp.in_city("330 桃園市", fp.CONFIG["cities"]))
    def test_vendors_and_judge(self):
        vs = fp.vendors_of(DETAIL)
        self.assertEqual(len(vs), 5)
        self.assertEqual([fp.judge(v)[0] for v in vs], [True, False, False, False, False])
        self.assertEqual([fp.judge(v)[1] for v in vs], ["", "沒得標", "組織型態 其他", "不在縣市內", "沒統編"])
        a = fp.award_of({"detail": DETAIL, "unit_id": "3.79", "job_number": "1150923-1"})
        self.assertEqual(a["date"], "2026-10-23"); self.assertEqual(a["total"], 12500000); self.assertEqual(a["agency"], "新北市政府教育局"); self.assertEqual(a["key"], "3.79|1150923-1")
    def test_merge(self):
        a = {"date": "2026-10-23", "tender": "工程A", "agency": "機關A", "case_no": "C1", "total": 100, "key": "u|j1"}
        w1 = {"tax": "12345678", "name": "甲", "org": "公司登記", "address": "新北市", "tel": "02-2222-3333", "amount": 100, "award": a}
        by, cases, m = fp.merge_rows([], [], [], [w1], "2026-10-24")
        self.assertEqual(m["added"], 1); self.assertEqual(by["12345678"]["得標件數"], "1"); self.assertEqual(by["12345678"]["首次決標日"], "2026-10-23")
        head = fp.HEAD; rows = [[by["12345678"].get(h, "") for h in head]]
        rows[0][head.index("成立日期")] = "107/05/01"; rows[0][head.index("資本額")] = "30000000"   # fill-founded 補的要留著
        a2 = dict(a, date="2026-10-24", tender="工程B", key="u|j2", case_no="C2")
        w2 = dict(w1, amount=200, award=a2)
        by2, cases2, m2 = fp.merge_rows(head, rows, list(cases), [w2, w1], "2026-10-24")   # w1 是同一案再出現（更正公告）→ 不重複
        self.assertEqual((m2["added"], m2["updated"], m2["dup"]), (0, 1, 1))
        o = by2["12345678"]
        self.assertEqual(o["得標件數"], "2"); self.assertEqual(o["標案名稱"], "工程B"); self.assertEqual(o["首次決標日"], "2026-10-23"); self.assertEqual(o["成立日期"], "107/05/01"); self.assertEqual(o["資本額"], "30000000")
        old = dict(a, date="2026-01-01", key="u|j0")
        by3, _, m3 = fp.merge_rows([], [], [], [dict(w1, tax="99999999", award=old)], "2026-10-24")
        self.assertEqual(m3["dropped"], 1); self.assertNotIn("99999999", by3)

    def test_outcome(self):
        # 版本 398：補好幾天時一天掛，成功的天要留（以前外層看到「API 連不上」就整批還原）
        ok = {"date": "20261027", "api_down": False}; bad = {"date": "20261026", "api_down": True}
        self.assertEqual(fp.outcome([ok]), (fp.EXIT_OK, []))
        self.assertEqual(fp.outcome([bad]), (fp.EXIT_ALL_DOWN, ["20261026"]))
        self.assertEqual(fp.outcome([ok, bad]), (fp.EXIT_PARTIAL, ["20261026"]))
        self.assertEqual(fp.outcome([bad, dict(bad, date="20261025")]), (fp.EXIT_ALL_DOWN, ["20261026", "20261025"]))
        self.assertEqual((fp.EXIT_OK, fp.EXIT_ALL_DOWN, fp.EXIT_PARTIAL), (0, 3, 4))   # pcc-daily.sh／.ps1 寫死這三個數字

if __name__ == "__main__":
    unittest.main(verbosity=1)
