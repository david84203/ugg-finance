import { NextResponse } from 'next/server';
import { listDocs, createDoc, deleteDocById, PCC } from '@/lib/firebase';

const COLLECTION = 'extra_income';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get('month'); // YYYY-MM
    const all = await listDocs(PCC, COLLECTION);
    const filtered = monthKey ? all.filter(e => e.date?.startsWith(monthKey)) : all;
    return NextResponse.json({ items: filtered });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { date, category, description, amount } = await request.json();
    if (!date || !amount) return NextResponse.json({ error: '日期和金額為必填' }, { status: 400 });

    const fields = {
      date:        { stringValue: date },
      category:    { stringValue: category || '其他' },
      description: { stringValue: description || '' },
      amount:      { integerValue: String(Math.round(amount)) },
      createdAt:   { stringValue: new Date().toISOString() },
    };

    const doc = await createDoc(PCC, COLLECTION, fields);
    return NextResponse.json({ success: true, id: doc.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    await deleteDocById(PCC, COLLECTION, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
