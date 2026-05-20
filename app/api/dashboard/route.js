import { NextResponse } from 'next/server';
import { runQuery, getDoc, listDocs, dateRangeFilters, UGG, UGG_KEY, PCC } from '@/lib/firebase';

function strFilter(field, op, val) {
  return { fieldFilter: { field: { fieldPath: field }, op, value: { stringValue: val } } };
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

    const filters = dateRangeFilters(dateStart, dateEnd);

    const [rawSessions, transactions, rentals, purchaseCostsDoc, allExtraIncome] = await Promise.all([
      runQuery(UGG, 'sessions', filters, UGG_KEY),
      runQuery(UGG, 'transactions', filters, UGG_KEY),
      runQuery(UGG, 'rentals', filters, UGG_KEY),
      getDoc(UGG, 'purchaseCosts', monthKey, UGG_KEY),
      listDocs(PCC, 'extra_income'),
    ]);

    const sessions = rawSessions.filter(s => s.status === 'out');

    const extraIncomeItems = allExtraIncome
      .filter(e => e.date?.startsWith(monthKey))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // 月彙總
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

    const monthRevenue = entryFee + food + inStoreSale + memberFee + sale + escape + rental + extra;
    const monthExpense = purchaseCostsDoc?.amount || 0;

    // 今日資料
    let todayRevenue = 0;
    let todayBreakdown = null;
    if (isCurrentMonth) {
      const ts = sessions.filter(s => s.date === todayStr);
      const tt = transactions.filter(t => t.date === todayStr);
      const tr = rentals.filter(r => r.date === todayStr);
      const te = extraIncomeItems.filter(e => e.date === todayStr);

      let te2 = 0, tf = 0, tis = 0, tm = 0, tsl = 0, tesc = 0, trent = 0, textra = 0;
      for (const s of ts) { te2 += s.finalFee||0; tf += s.foodTotal||0; tis += s.purchaseTotal||0; }
      for (const t of tt) {
        if (t.type === 'membershipFee') tm   += t.amount||0;
        else if (t.type === 'sale')     tsl  += t.amount||0;
        else if (t.type === 'escape')   tesc += t.amount||0;
      }
      for (const r of tr) trent  += r.amount||0;
      for (const e of te) textra += e.amount||0;

      todayRevenue = te2 + tf + tis + tm + tsl + tesc + trent + textra;
      todayBreakdown = { entryFee: te2, food: tf, inStoreSale: tis, memberFee: tm, sale: tsl, escape: tesc, rental: trent, extra: textra };
    }

    // 每日彙總
    const dailyMap = {};
    const addToDay = (date, amount) => {
      if (!date) return;
      dailyMap[date] = (dailyMap[date] || 0) + amount;
    };
    for (const s of sessions) addToDay(s.date, (s.finalFee||0) + (s.foodTotal||0) + (s.purchaseTotal||0));
    for (const t of transactions) addToDay(t.date, t.amount||0);
    for (const r of rentals) addToDay(r.date, r.amount||0);
    for (const e of extraIncomeItems) addToDay(e.date, e.amount||0);

    const dailyRevenue = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount: Math.round(amount) }));

    // 收入分類排行
    const revenueBreakdown = [
      { label: '入場費',   amount: Math.round(entryFee) },
      { label: '會員費',   amount: Math.round(memberFee) },
      { label: '遊戲租借', amount: Math.round(rental) },
      { label: '遊戲販售', amount: Math.round(sale + inStoreSale) },
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
      sessionCount:    sessions.length,
      dailyRevenue,
      revenueBreakdown,
      extraIncomeItems: extraIncomeItems.map(e => ({
        id: e.id, date: e.date, category: e.category,
        description: e.description, amount: e.amount,
      })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
