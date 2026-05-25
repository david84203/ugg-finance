import { NextResponse } from 'next/server';
import { createDoc, listDocs, toFirestoreFields, PCC } from '@/lib/firebase';

const SECRET = process.env.WEBHOOK_SECRET;

function parseLinePay(text) {
  const amountMatch = text.match(/NT\$\s*(\d+)/);
  const merchantMatch = text.match(/商店名稱[：:]\s*(.+)/);
  return {
    amount: amountMatch ? parseInt(amountMatch[1]) : null,
    merchant: merchantMatch ? merchantMatch[1].trim() : null,
  };
}

function parseEsun(text) {
  const amountMatch = text.match(/信用卡消費(\d+)元通知/);
  return {
    amount: amountMatch ? parseInt(amountMatch[1]) : null,
    merchant: null,
  };
}

// POST：接收 MacroDroid webhook，寫入個人支出
export async function POST(request) {
  try {
    const body = await request.json();

    if (!SECRET || body.secret !== SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { source, text } = body;
    if (!source || !text) {
      return NextResponse.json({ error: 'missing source or text' }, { status: 400 });
    }

    let parsed = { amount: null, merchant: null };
    if (source === 'line_pay') parsed = parseLinePay(text);
    else if (source === 'esun') parsed = parseEsun(text);

    if (!parsed.amount) {
      return NextResponse.json({ error: 'could not parse amount', raw: text }, { status: 422 });
    }

    // 台北時間
    const taiwanNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const date = taiwanNow.toISOString().slice(0, 10);
    const timestamp = taiwanNow.toISOString().slice(0, 19).replace('T', ' ');

    const doc = await createDoc(PCC, 'personal_expenses', toFirestoreFields({
      source,
      amount: parsed.amount,
      merchant: parsed.merchant || '',
      date,
      timestamp,
      raw_text: text,
      created_at: timestamp,
    }));

    return NextResponse.json({ ok: true, id: doc.id, amount: parsed.amount, merchant: parsed.merchant });
  } catch (err) {
    console.error('personal-expense POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET：查詢所有個人支出
export async function GET() {
  try {
    const docs = await listDocs(PCC, 'personal_expenses');
    const sorted = docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return NextResponse.json({ expenses: sorted });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
