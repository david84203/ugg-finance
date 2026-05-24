import { NextResponse } from 'next/server';
import { runQuery, getDoc, listDocs, dateRangeFilters, equalFilter, deleteDocById, UGG, UGG_KEY, PCC } from '@/lib/firebase';
import { syncMonthToSheet } from '@/lib/sheets';

// 背景同步 Firebase 資料回 Sheet（不阻塞回應）
function triggerSheetSync(year, month, dayMap) {
  const dailyData = Object.values(dayMap)
    .filter(d => d.total > 0)
    .map(({ date, entryFee=0, memberFee=0, rental=0, sale=0, escape=0, food=0, extra=0, total=0 }) =>
      ({ date, entryFee, memberFee, rental, sale, escape, food, extra, total })
    );
  if (dailyData.length > 0) {
    syncMonthToSheet(year, month, dailyData).catch(e => console.warn('Sheet sync failed:', e.message));
  }
}

// 2026/5/10（含）以前的資料來自 Google Sheets 匯入的 sheetHistory
const SHEET_CUTOFF = '2026-05-10';

// 從 sheetHistory 撈指定日期區間的資料
async function querySheetHistory(dateStart, dateEnd) {
  const filters = dateRangeFilters(dateStart, dateEnd);
  return runQuery(UGG, 'sheetHistory', filters, UGG_KEY);
}

// 把 sheetHistory docs 加總成月彙總格式
function aggregateSheet(docs) {
  let entryFee = 0, memberFee = 0, rental = 0, sale = 0, escape = 0, food = 0, extra = 0;
  const dailyMap = {};
  for (const d of docs) {
    entryFee  += d.entryFee  || 0;
    memberFee += d.memberFee || 0;
    rental    += d.rental    || 0;
    sale      += d.sale      || 0;
    escape    += d.escape    || 0;
    food      += d.food      || 0;
    extra     += d.extra     || 0;
    const t = d.total || 0;
    if (t > 0) dailyMap[d.date] = t;
  }
  return { entryFee, memberFee, rental, sale, escape, food, extra, dailyMap };
}

// 從 Firebase sessions/transactions/rentals 計算彙總
function aggregateFirebase(sessions, transactions, rentals, extraIncomeItems) {
  let entryFee = 0, food = 0, inStoreSale = 0;
  for (const s of sessions) {
    entryFee    += s.finalFee      || 0;
    food        += s.foodTotal     || 0;
    inStoreSale += s.purchaseTotal || 0;
  }
  let memberFee = 0, sale = 0, escape = 0;
  for (const t of transactions) {
    if (t.type === 'membershipFee') memberFee += t.amount || 0;
    else if (t.type === 'sale')     sale      += t.amount || 0;
    else if (t.type === 'escape')   escape    += t.amount || 0;
  }
  let rental = 0;
  for (const r of rentals) rental += r.amount || 0;
  let extra = 0;
  for (const e of extraIncomeItems) extra += e.amount || 0;

  const dailyMap = {};
  const addToDay = (date, amount) => {
    if (!date) return;
    dailyMap[date] = (dailyMap[date] || 0) + amount;
  };
  for (const s of sessions) addToDay(s.date, (s.finalFee||0) + (s.foodTotal||0) + (s.purchaseTotal||0));
  for (const t of transactions) addToDay(t.date, t.amount || 0);
  for (const r of rentals) addToDay(r.date, r.amount || 0);
  for (const e of extraIncomeItems) addToDay(e.date, e.amount || 0);

  // 人次統計
  const weekdayCount  = sessions.filter(s => !s.isWeekend).length;
  const weekendCount  = sessions.filter(s =>  s.isWeekend).length;
  // 遊戲統計
  const newMemberCount = transactions.filter(t => t.type === 'membershipFee').length;
  const saleCount      = transactions.filter(t => t.type === 'sale').length;
  const rentalCount    = rentals.reduce((sum, r) => {
    const gamesArr = r.games?.values;
    return sum + (Array.isArray(gamesArr) ? gamesArr.length : 1);
  }, 0);

  return {
    entryFee, memberFee, rental, sale: sale + inStoreSale, escape, food, extra,
    dailyMap, sessionCount: sessions.length,
    weekdayCount, weekendCount, newMemberCount, saleCount, rentalCount,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year  = parseInt(searchParams.get('year'))  || now.getFullYear();
    const month = parseInt(searchParams.get('month')) || now.getMonth() + 1;

    const pad = n => String(n).padStart(2, '0');
    const monthKey  = `${year}-${pad(month)}`;
    const dateStart = `${monthKey}-01`;
    const dateEnd   = `${monthKey}-${pad(new Date(year, month, 0).getDate())}`;
    const todayStr  = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

    const allFromSheet    = dateEnd   <= SHEET_CUTOFF;
    const allFromFirebase = dateStart >  SHEET_CUTOFF;
    // mixed = 2026/5 月份（1-10 來自 Sheet，11+ 來自 Firebase）

    // 進貨支出：從 purchaseOrders 查詢當月所有明細
    const purchaseRecordsRaw = await runQuery(UGG, 'purchaseOrders', [equalFilter('monthKey', monthKey)], UGG_KEY);
    const purchaseRecords = purchaseRecordsRaw
      .sort((a, b) => (a.orderDate || '').localeCompare(b.orderDate || ''));
    const monthExpense = purchaseRecords.reduce((s, r) => s + (r.totalAmount || 0), 0);

    let entryFee = 0, memberFee = 0, rental = 0, sale = 0, escape = 0, food = 0, extra = 0;
    let dailyMap = {};
    let sessionCount = 0, weekdayCount = 0, weekendCount = 0;
    let newMemberCount = 0, saleCount = 0, rentalCount = 0;
    let hasDetailedStats = false;
    let extraIncomeItems = [];
    let todayRevenue = 0;
    let todayBreakdown = null;

    if (allFromSheet) {
      // ── 全部來自 sheetHistory ──
      const sheetDocs = await querySheetHistory(dateStart, dateEnd);
      const agg = aggregateSheet(sheetDocs);
      ({ entryFee, memberFee, rental, sale, escape, food, extra, dailyMap } = agg);

    } else if (allFromFirebase) {
      // ── 全部來自 Firebase ──
      const filters = dateRangeFilters(dateStart, dateEnd);
      const [rawSessions, transactions, rentals, allExtraIncome] = await Promise.all([
        runQuery(UGG, 'sessions', filters, UGG_KEY),
        runQuery(UGG, 'transactions', filters, UGG_KEY),
        runQuery(UGG, 'rentals', filters, UGG_KEY),
        listDocs(PCC, 'extra_income'),
      ]);
      const sessions = rawSessions.filter(s => s.status === 'out');
      extraIncomeItems = allExtraIncome
        .filter(e => e.date?.startsWith(monthKey))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const agg = aggregateFirebase(sessions, transactions, rentals, extraIncomeItems);
      ({ entryFee, memberFee, rental, sale, escape, food, extra, dailyMap, sessionCount,
         weekdayCount, weekendCount, newMemberCount, saleCount, rentalCount } = agg);
      hasDetailedStats = true;

      // 背景同步回 Sheet
      triggerSheetSync(year, month, agg.dailyMap);

      // 今日明細
      if (isCurrentMonth) {
        const ts = sessions.filter(s => s.date === todayStr);
        const tt = transactions.filter(t => t.date === todayStr);
        const tr = rentals.filter(r => r.date === todayStr);
        const te = extraIncomeItems.filter(e => e.date === todayStr);
        let te2=0, tf=0, tis=0, tm=0, tsl=0, tesc=0, trent=0, textra=0;
        for (const s of ts) { te2+=s.finalFee||0; tf+=s.foodTotal||0; tis+=s.purchaseTotal||0; }
        for (const t of tt) {
          if (t.type==='membershipFee') tm+=t.amount||0;
          else if (t.type==='sale')     tsl+=t.amount||0;
          else if (t.type==='escape')   tesc+=t.amount||0;
        }
        for (const r of tr) trent+=r.amount||0;
        for (const e of te) textra+=e.amount||0;
        todayRevenue = te2+tf+tis+tm+tsl+tesc+trent+textra;
        todayBreakdown = { entryFee:te2, food:tf, inStoreSale:tis, memberFee:tm, sale:tsl, escape:tesc, rental:trent, extra:textra };
      }

    } else {
      // ── 混合：2026/5，1-10 來自 Sheet，11+ 來自 Firebase ──
      const firebaseStart = '2026-05-11';
      const fbFilters = dateRangeFilters(firebaseStart, dateEnd);

      const [sheetDocs, rawSessions, transactions, rentals, allExtraIncome] = await Promise.all([
        querySheetHistory(dateStart, SHEET_CUTOFF),
        runQuery(UGG, 'sessions', fbFilters, UGG_KEY),
        runQuery(UGG, 'transactions', fbFilters, UGG_KEY),
        runQuery(UGG, 'rentals', fbFilters, UGG_KEY),
        listDocs(PCC, 'extra_income'),
      ]);

      const sessions = rawSessions.filter(s => s.status === 'out');
      extraIncomeItems = allExtraIncome
        .filter(e => e.date?.startsWith(monthKey) && e.date > SHEET_CUTOFF)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const sheetAgg = aggregateSheet(sheetDocs);
      const fbAgg    = aggregateFirebase(sessions, transactions, rentals, extraIncomeItems);

      entryFee  = sheetAgg.entryFee  + fbAgg.entryFee;
      memberFee = sheetAgg.memberFee + fbAgg.memberFee;
      rental    = sheetAgg.rental    + fbAgg.rental;
      sale      = sheetAgg.sale      + fbAgg.sale;
      escape    = sheetAgg.escape    + fbAgg.escape;
      food      = sheetAgg.food      + fbAgg.food;
      extra     = sheetAgg.extra     + fbAgg.extra;
      dailyMap  = { ...sheetAgg.dailyMap, ...fbAgg.dailyMap };
      sessionCount   = fbAgg.sessionCount;
      weekdayCount   = fbAgg.weekdayCount;
      weekendCount   = fbAgg.weekendCount;
      newMemberCount = fbAgg.newMemberCount;
      saleCount      = fbAgg.saleCount;
      rentalCount    = fbAgg.rentalCount;
      hasDetailedStats = true;

      // 背景同步 Firebase 部分（5/11 後）回 Sheet
      triggerSheetSync(year, month, fbAgg.dailyMap);

      if (isCurrentMonth) {
        const ts = sessions.filter(s => s.date === todayStr);
        const tt = transactions.filter(t => t.date === todayStr);
        const tr = rentals.filter(r => r.date === todayStr);
        const te = extraIncomeItems.filter(e => e.date === todayStr);
        let te2=0, tf=0, tis=0, tm=0, tsl=0, tesc=0, trent=0, textra=0;
        for (const s of ts) { te2+=s.finalFee||0; tf+=s.foodTotal||0; tis+=s.purchaseTotal||0; }
        for (const t of tt) {
          if (t.type==='membershipFee') tm+=t.amount||0;
          else if (t.type==='sale')     tsl+=t.amount||0;
          else if (t.type==='escape')   tesc+=t.amount||0;
        }
        for (const r of tr) trent+=r.amount||0;
        for (const e of te) textra+=e.amount||0;
        todayRevenue = te2+tf+tis+tm+tsl+tesc+trent+textra;
        todayBreakdown = { entryFee:te2, food:tf, inStoreSale:tis, memberFee:tm, sale:tsl, escape:tesc, rental:trent, extra:textra };
      }
    }

    const monthRevenue = entryFee + memberFee + rental + sale + escape + food + extra;

    const dailyRevenue = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount: Math.round(amount) }));

    const revenueBreakdown = [
      { label: '入場費',   amount: Math.round(entryFee) },
      { label: '會員費',   amount: Math.round(memberFee) },
      { label: '遊戲租借', amount: Math.round(rental) },
      { label: '遊戲販售', amount: Math.round(sale) },
      { label: '密室逃脫', amount: Math.round(escape) },
      { label: '餐點飲食', amount: Math.round(food) },
      { label: '額外收入', amount: Math.round(extra) },
    ].filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      year, month,
      todayRevenue:    Math.round(todayRevenue),
      todayBreakdown,
      monthRevenue:    Math.round(monthRevenue),
      monthExpense:    Math.round(monthExpense),
      monthProfit:     Math.round(monthRevenue - monthExpense),
      sessionCount,
      weekdayCount, weekendCount,
      newMemberCount, saleCount, rentalCount,
      hasDetailedStats,
      dailyRevenue,
      revenueBreakdown,
      extraIncomeItems: extraIncomeItems.map(e => ({
        id: e.id, date: e.date, category: e.category,
        description: e.description, amount: e.amount,
      })),
      purchaseRecords: purchaseRecords.map(r => ({
        id:            r.id,
        orderId:       r.orderId || '',
        orderDate:     r.orderDate || '',
        supplierName:  r.supplierName || '未指定',
        totalAmount:   r.totalAmount || 0,
        inventoryCost: r.inventoryCost || 0,
        openBoxCost:   r.openBoxCost || 0,
      })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE：刪除進貨明細（同步刪除 purchaseOrders + orders）──
export async function DELETE(request) {
  try {
    const { id, orderId } = await request.json();
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

    // 刪除記帳系統的進貨明細
    await deleteDocById(UGG, 'purchaseOrders', id);

    // 同步刪除進貨管理系統的訂單紀錄
    if (orderId) {
      await deleteDocById(UGG, 'orders', orderId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete purchase record error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
