import { NextResponse } from 'next/server';
import { runQuery, listDocs, dateRangeFilters, UGG, UGG_KEY, PCC } from '@/lib/firebase';
import { syncMonthToSheet } from '@/lib/sheets';

const SHEET_CUTOFF = '2026-05-10';

export async function POST(request) {
  try {
    const { year, month } = await request.json();
    if (!year || !month) return NextResponse.json({ error: '需要 year 和 month' }, { status: 400 });

    const pad = n => String(n).padStart(2, '0');
    const monthKey  = `${year}-${pad(month)}`;
    const dateStart = monthKey > '2026-05' ? `${monthKey}-01` : '2026-05-11';
    const dateEnd   = `${monthKey}-${pad(new Date(year, month, 0).getDate())}`;

    // 只同步 2026/5/11 以後的資料（之前的是 Sheet 本來就有的）
    if (dateEnd <= SHEET_CUTOFF) {
      return NextResponse.json({ ok: false, reason: '此月份資料來源是 Sheet，不需要同步' });
    }

    const filters = dateRangeFilters(dateStart, dateEnd);
    const [rawSessions, transactions, rentals, allExtraIncome] = await Promise.all([
      runQuery(UGG, 'sessions', filters, UGG_KEY),
      runQuery(UGG, 'transactions', filters, UGG_KEY),
      runQuery(UGG, 'rentals', filters, UGG_KEY),
      listDocs(PCC, 'extra_income'),
    ]);

    const sessions = rawSessions.filter(s => s.status === 'out');
    const extraIncomeItems = allExtraIncome.filter(e => e.date?.startsWith(monthKey) && e.date > SHEET_CUTOFF);

    // 依日期彙總
    const dayMap = {};
    const add = (date, field, amount) => {
      if (!date || date <= SHEET_CUTOFF) return;
      if (!dayMap[date]) dayMap[date] = { date, entryFee:0, memberFee:0, rental:0, sale:0, escape:0, food:0, extra:0, total:0 };
      dayMap[date][field] += amount || 0;
      dayMap[date].total  += amount || 0;
    };

    for (const s of sessions) {
      add(s.date, 'entryFee', s.finalFee);
      add(s.date, 'food', s.foodTotal);
      add(s.date, 'sale', s.purchaseTotal);
    }
    for (const t of transactions) {
      if (t.type === 'membershipFee') add(t.date, 'memberFee', t.amount);
      else if (t.type === 'sale')     add(t.date, 'sale', t.amount);
      else if (t.type === 'escape')   add(t.date, 'escape', t.amount);
    }
    for (const r of rentals) add(r.date, 'rental', r.amount);
    for (const e of extraIncomeItems) add(e.date, 'extra', e.amount);

    const dailyData = Object.values(dayMap).filter(d => d.total > 0).sort((a, b) => a.date.localeCompare(b.date));

    if (dailyData.length === 0) return NextResponse.json({ ok: true, synced: 0 });

    const results = await syncMonthToSheet(year, month, dailyData);
    const success = results.filter(r => r.ok).length;

    return NextResponse.json({ ok: true, synced: success, total: dailyData.length, results });
  } catch (err) {
    console.error('Sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
