import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// 西元年月 → tab 名稱，例如 2026/5 → "2026年5月營收表"
export function getTabName(year, month) {
  return `${year}年${month}月營收表`;
}

// 讀取指定 tab 的所有資料列
async function getSheetRows(sheetName) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!A:K`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return res.data.values || [];
}

// 把 "2026/5/15" 或 "2026-05-15" 都能對應到同一個格式做比對
function normalizeDate(d) {
  if (!d) return '';
  // 轉成 2026/5/15 格式（Sheet 的格式）
  if (typeof d === 'number') {
    // Google Sheets 的日期序號轉換
    const date = new Date((d - 25569) * 86400 * 1000);
    return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  }
  // "2026-05-15" → "2026/5/15"
  return String(d).replace(/-/g, '/').replace(/\/0?(\d)(?=\/|$)/g, '/$1');
}

// 將 Firebase 彙總的一日資料寫回 Sheet 對應列
// dayData: { entryFee, memberFee, rental, sale, escape, food, extra, total }
// dateStr: "2026-05-15" 格式
export async function syncDayToSheet(dateStr, dayData) {
  const [year, month] = dateStr.split('-').map(Number);
  const sheetName = getTabName(year, month);

  // 把 dateStr 轉成 Sheet 格式 "2026/5/15"
  const day = parseInt(dateStr.split('-')[2]);
  const targetDate = `${year}/${month}/${day}`;

  const rows = await getSheetRows(sheetName);

  // 找到日期對應的列（從第2列開始，跳過標題）
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (normalizeDate(rows[i][0]) === targetDate) {
      rowIndex = i + 1; // Sheets 列號從 1 開始
      break;
    }
  }

  if (rowIndex === -1) return { ok: false, reason: `找不到日期 ${targetDate}` };

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // 欄位對應：C=入場費, D=會員費, E=遊戲租借, F=遊戲販售, G=密室逃脫, H=餐點飲食, I=額外收入, J=當日總營收
  const values = [[
    dayData.entryFee  || 0,
    dayData.memberFee || 0,
    dayData.rental    || 0,
    dayData.sale      || 0,
    dayData.escape    || 0,
    dayData.food      || 0,
    dayData.extra     || 0,
    dayData.total     || 0,
  ]];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!C${rowIndex}:J${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  return { ok: true, row: rowIndex, date: targetDate };
}

// 同步整個月的 Firebase 資料到 Sheet（批次）
export async function syncMonthToSheet(year, month, dailyData) {
  // dailyData: [{ date: "2026-05-15", entryFee, memberFee, ... }]
  const results = [];
  for (const day of dailyData) {
    const r = await syncDayToSheet(day.date, day);
    results.push(r);
  }
  return results;
}
