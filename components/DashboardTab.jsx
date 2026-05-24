'use client';

import { useState, useEffect } from 'react';

const EXTRA_CATEGORIES = ['補習班桌遊課', '社區桌遊課', '社團鐘點費', '社團社費', '其他'];

function fmt(n) { return `NT$${Math.round(n || 0).toLocaleString()}`; }

function toMinguo(year, month) { return `${year - 1911}年${month}月`; }

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── 小元件 ─────────────────────────────────────────────

function MonthPicker({ year, month, onChange }) {
  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
  const prev = () => month === 1 ? onChange(year - 1, 12) : onChange(year, month - 1);
  const next = () => { if (!isCurrent) month === 12 ? onChange(year + 1, 1) : onChange(year, month + 1); };
  return (
    <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3">
      <button type="button" onClick={prev} className="text-orange-400 text-lg px-2">‹</button>
      <span className="text-sm font-semibold text-gray-700">{toMinguo(year, month)}</span>
      <button type="button" onClick={next} className={`text-lg px-2 ${isCurrent ? 'text-gray-200' : 'text-orange-400'}`}>›</button>
    </div>
  );
}

function Card({ label, value, sub, accent }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? 'bg-orange-400' : 'bg-white border border-gray-100'}`}>
      <p className={`text-xs mb-1 ${accent ? 'text-orange-100' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-xl font-bold ${accent ? 'text-white' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-orange-100' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  );
}

function Section({ icon, title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3.5 text-sm font-medium text-gray-700">
        <span>{icon}</span>
        <span>{title}</span>
        <span className="ml-auto text-gray-300 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="border-t border-gray-50 px-4 py-3 space-y-1">{children}</div>}
    </div>
  );
}

function Row({ label, value, sub, highlight }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
      <div>
        <span className={`text-sm ${highlight ? 'font-semibold text-orange-500' : 'text-gray-700'}`}>{label}</span>
        {sub && <span className="text-xs text-gray-400 ml-1.5">{sub}</span>}
      </div>
      <span className={`text-sm font-medium ${highlight ? 'text-orange-500' : 'text-gray-700'}`}>{value}</span>
    </div>
  );
}

// 今日營收可展開卡
function TodayCard({ revenue, breakdown }) {
  const [open, setOpen] = useState(false);
  const items = breakdown ? [
    { label: '入場費',   v: breakdown.entryFee },
    { label: '會員費',   v: breakdown.memberFee },
    { label: '遊戲租借', v: breakdown.rental },
    { label: '遊戲販售', v: breakdown.sale + breakdown.inStoreSale },
    { label: '密室逃脫', v: breakdown.escape },
    { label: '餐點飲食', v: breakdown.food },
    { label: '額外收入', v: breakdown.extra },
  ].filter(i => i.v > 0) : [];

  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left">
        <div className="rounded-2xl p-4 bg-orange-400">
          <div className="flex items-center justify-between">
            <p className="text-xs text-orange-100">今日營收</p>
            <span className="text-orange-100 text-xs">{open ? '▲' : '▼'}</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{fmt(revenue)}</p>
        </div>
      </button>
      {open && (
        <div className="bg-white rounded-2xl border border-orange-100 mt-2 px-4 py-2">
          {items.length > 0
            ? items.map(i => <Row key={i.label} label={i.label} value={fmt(i.v)} />)
            : <p className="text-sm text-gray-400 py-2 text-center">今日尚無紀錄</p>}
        </div>
      )}
    </div>
  );
}

// 額外收入管理區塊
function ExtraIncomeSection({ items, monthKey, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: todayISO(), category: EXTRA_CATEGORIES[0], description: '', amount: '' });
  const [saving, setSaving] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/extra-income', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    setSaving(false);
    setAdding(false);
    setForm({ date: todayISO(), category: EXTRA_CATEGORIES[0], description: '', amount: '' });
    onRefresh();
  }

  async function handleDelete(id) {
    if (!confirm('確定刪除？')) return;
    await fetch('/api/extra-income', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    onRefresh();
  }

  const total = items.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3.5 text-sm font-medium text-gray-700">
        <span>💰</span>
        <span>額外收入</span>
        {total > 0 && <span className="ml-1 text-xs text-orange-400">{fmt(total)}</span>}
        <span className="ml-auto text-gray-300 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-50 px-4 py-3">
          {items.length === 0 && !adding && (
            <p className="text-sm text-gray-400 py-2 text-center">本月尚無額外收入</p>
          )}
          {items.map(e => (
            <div key={e.id} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
              <div>
                <span className="text-sm text-gray-700">{e.category}</span>
                {e.description && <span className="text-xs text-gray-400 ml-1">· {e.description}</span>}
                <span className="text-xs text-gray-300 ml-1">({e.date?.slice(5)})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">{fmt(e.amount)}</span>
                <button type="button" onClick={() => handleDelete(e.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
              </div>
            </div>
          ))}

          {adding ? (
            <form onSubmit={handleAdd} className="mt-3 space-y-2">
              <div className="flex gap-2">
                <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-300" />
                <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-300">
                  {EXTRA_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <input type="text" placeholder="說明（選填）" value={form.description}
                onChange={e => setForm(f => ({...f, description: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-300" />
              <div className="flex gap-2">
                <input type="number" placeholder="金額" required value={form.amount}
                  onChange={e => setForm(f => ({...f, amount: e.target.value}))}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-300" />
                <button type="submit" disabled={saving}
                  className="px-4 py-2 bg-orange-400 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                  {saving ? '儲存中' : '新增'}
                </button>
                <button type="button" onClick={() => setAdding(false)}
                  className="px-3 py-2 text-gray-400 text-sm">取消</button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setAdding(true)}
              className="mt-2 w-full py-2 border border-dashed border-orange-200 rounded-xl text-xs text-orange-400">
              + 新增額外收入
            </button>
          )}

          {items.length > 0 && <Row label="小計" value={fmt(total)} highlight />}
        </div>
      )}
    </div>
  );
}

// ── 主元件 ─────────────────────────────────────────────

export default function DashboardTab() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  async function load(y, m) {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/dashboard?year=${y}&month=${m}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(year, month); }, [year, month]);

  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="space-y-3 pt-2">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold text-gray-600">營運狀況</h2>
        <button onClick={() => load(year, month)} className="text-xs text-orange-400 underline">重新整理</button>
      </div>

      <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

      {loading && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-2xl mb-2">⏳</p>
          <p className="text-sm">載入中...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-12">
          <p className="text-2xl mb-2">😢</p>
          <p className="text-sm text-gray-500 mb-3">{error}</p>
          <button onClick={() => load(year, month)} className="text-orange-400 text-sm underline">重新載入</button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {isCurrent && (
            <TodayCard revenue={data.todayRevenue} breakdown={data.todayBreakdown} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Card label={`${toMinguo(year, month)} 營收`} value={fmt(data.monthRevenue)} />
            <Card label="本月支出" value={fmt(data.monthExpense)} />
            <Card
              label="本月盈餘"
              value={fmt(data.monthProfit)}
              sub={data.monthProfit >= 0 ? '😊 獲利' : '😢 虧損'}
            />
            <Card label="入場人次" value={`${data.sessionCount} 人`} />
          </div>

          {data.hasDetailedStats && (
            <Section icon="📊" title="本月營運統計">
              <Row label="平日入場" value={`${data.weekdayCount} 人`} />
              <Row label="假日入場" value={`${data.weekendCount} 人`} />
              <Row label="新增會員" value={`${data.newMemberCount} 人`} />
              <Row label="出租遊戲" value={`${data.rentalCount} 款`} />
              <Row label="販售遊戲" value={`${data.saleCount} 筆`} />
            </Section>
          )}

          <Section icon="📅" title="每日收款明細">
            {data.dailyRevenue.length === 0
              ? <p className="text-sm text-gray-400 py-2 text-center">本月尚無資料</p>
              : data.dailyRevenue.map(d => (
                <Row key={d.date} label={d.date.slice(5).replace('-', '/')} value={fmt(d.amount)} />
              ))
            }
            {data.dailyRevenue.length > 0 && <Row label="合計" value={fmt(data.monthRevenue)} highlight />}
          </Section>

          <Section icon="🏆" title="收入分類排行">
            {data.revenueBreakdown.length === 0
              ? <p className="text-sm text-gray-400 py-2 text-center">本月尚無資料</p>
              : data.revenueBreakdown.map((r, i) => (
                <Row
                  key={r.label}
                  label={`${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`} ${r.label}`}
                  value={fmt(r.amount)}
                  sub={data.monthRevenue > 0 ? `${Math.round(r.amount / data.monthRevenue * 100)}%` : ''}
                />
              ))
            }
          </Section>

          <ExtraIncomeSection
            items={data.extraIncomeItems || []}
            monthKey={`${year}-${String(month).padStart(2,'0')}`}
            onRefresh={() => load(year, month)}
          />

          <Section icon="🧾" title="支出明細（進貨）">
            {(data.purchaseRecords || []).length === 0
              ? <p className="text-sm text-gray-400 py-2 text-center">本月尚無進貨紀錄</p>
              : (data.purchaseRecords || []).map(r => (
                <div key={r.id} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="text-sm text-gray-700">{r.supplierName}</span>
                    <span className="text-xs text-gray-400 ml-1.5">{r.orderDate?.slice(5).replace('-', '/')}</span>
                    {r.openBoxCost > 0 && (
                      <span className="text-xs text-orange-400 ml-1.5">開盒 {fmt(r.openBoxCost)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">{fmt(r.totalAmount)}</span>
                    <button
                      type="button"
                      title="刪除（同步刪除進貨管理系統訂單）"
                      onClick={async () => {
                        if (!confirm(`確定刪除 ${r.supplierName}（${r.orderDate}）的進貨紀錄？\n⚠️ 同時會刪除進貨管理系統的訂單，但庫存數量不會回復。`)) return;
                        await fetch('/api/dashboard', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: r.id, orderId: r.orderId }),
                        });
                        load(year, month);
                      }}
                      className="text-gray-300 hover:text-red-400 text-xs transition-colors"
                    >✕</button>
                  </div>
                </div>
              ))
            }
            {(data.purchaseRecords || []).length > 0 && (
              <Row label="本月合計" value={fmt(data.monthExpense)} highlight />
            )}
          </Section>

        </>
      )}
    </div>
  );
}
