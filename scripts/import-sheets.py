"""
一次性匯入腳本：把 Google Sheets 歷史資料（2025/7/1~2026/5/10）寫入
Firebase ugg-store-system 的 sheetHistory collection。

每筆 document ID = 日期字串（e.g. 2025-07-01），可安全重複執行。
"""

import json, re, urllib.request, urllib.error
from datetime import datetime

FIREBASE_PROJECT = 'ugg-store-system'
API_KEY = 'AIzaSyBhKGhpyTpkLJ3TPBRtIkUGWaGtI4gWgy8'
CUTOFF = '2026-05-10'
SHEET_CACHE = r'C:\Users\bboylu\.claude\projects\D--Claude-Project-project-hub\d5029360-e72c-4312-8120-0cc635292afd\tool-results\mcp-claude_ai_Google_Drive-read_file_content-1779344079715.txt'

def parse_int(s):
    s = s.strip().replace('\\', '')
    try:
        return int(s) if s else 0
    except ValueError:
        return 0

def normalize_date(d):
    # 2025/7/1 → 2025-07-01
    parts = d.split('/')
    return f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"

def write_to_firebase(date_id, fields_dict):
    url = (
        f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}"
        f"/databases/(default)/documents/sheetHistory/{date_id}?key={API_KEY}"
    )
    fields = {k: {"integerValue": str(v)} for k, v in fields_dict.items()}
    fields['date'] = {"stringValue": date_id}

    body = json.dumps({"fields": fields}).encode('utf-8')
    req = urllib.request.Request(url, data=body, method='PATCH',
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        print(f"  ERROR {e.code}: {e.read().decode()}")
        return e.code

# --- 解析 Sheet ---
with open(SHEET_CACHE, encoding='utf-8') as f:
    data = json.load(f)

content = data['fileContent']
rows = []
for line in content.split('\n'):
    m = re.match(
        r'\|\s*(20\d\d/\d+/\d+)\s*\|[^|]*'
        r'\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|',
        line
    )
    if m:
        raw_date = m.group(1)
        vals = [v.strip() for v in m.groups()[1:]]
        # cols: 入場費, 會員費, 遊戲租借, 遊戲販售, 密室逃脫, 餐點飲食, 額外收入, 總營收
        rows.append({
            'rawDate': raw_date,
            'date': normalize_date(raw_date),
            'entryFee':  parse_int(vals[0]),
            'memberFee': parse_int(vals[1]),
            'rental':    parse_int(vals[2]),
            'sale':      parse_int(vals[3]),
            'escape':    parse_int(vals[4]),
            'food':      parse_int(vals[5]),
            'extra':     parse_int(vals[6]),
            'total':     parse_int(vals[7]),
        })

# 過濾到 cutoff
rows_to_import = [r for r in rows if r['date'] <= CUTOFF]
print(f"共 {len(rows_to_import)} 筆要匯入（{rows_to_import[0]['date']} ～ {rows_to_import[-1]['date']}）")

# --- 寫入 Firebase ---
ok = 0
fail = 0
for i, row in enumerate(rows_to_import):
    date_id = row['date']
    fields = {k: v for k, v in row.items() if k not in ('rawDate', 'date')}
    status = write_to_firebase(date_id, fields)
    if status in (200, 201):
        ok += 1
        if (i+1) % 20 == 0:
            print(f"  進度 {i+1}/{len(rows_to_import)}...")
    else:
        fail += 1
        print(f"  FAIL {date_id}: status={status}")

print(f"\n完成！成功 {ok} 筆，失敗 {fail} 筆")
