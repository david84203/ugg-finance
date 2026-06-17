const UGG = process.env.UGG_PROJECT_ID || 'ugg-store-system';
const UGG_KEY = process.env.UGG_API_KEY || 'AIzaSyBhKGhpyTpkLJ3TPBRtIkUGWaGtI4gWgy8';
const PCC = process.env.PCC_PROJECT_ID || 'project-hub-410cd';

function parseValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseValue);
  if ('mapValue' in v) return parseFields(v.mapValue.fields || {});
  return null;
}

function parseFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = parseValue(v);
  return out;
}

export function parseDoc(doc) {
  return { id: doc.name?.split('/').pop(), ...parseFields(doc.fields || {}) };
}

function strFilter(field, op, val) {
  return { fieldFilter: { field: { fieldPath: field }, op, value: { stringValue: val } } };
}

export function equalFilter(field, val) {
  return strFilter(field, 'EQUAL', val);
}

export function dateRangeFilters(start, end) {
  return [
    strFilter('date', 'GREATER_THAN_OR_EQUAL', start),
    strFilter('date', 'LESS_THAN_OR_EQUAL', end),
  ];
}

export async function runQuery(projectId, collectionId, filters, apiKey) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery${apiKey ? `?key=${apiKey}` : ''}`;
  const where = filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], where } }),
  });
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter(i => i.document).map(i => parseDoc(i.document));
}

export async function getDoc(projectId, collection, docId, apiKey) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}${apiKey ? `?key=${apiKey}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.error ? null : parseDoc(data);
}

export async function listDocs(projectId, collection) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}?pageSize=500`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.documents || []).map(parseDoc);
}

export async function createDoc(projectId, collection, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  const data = await res.json();
  return parseDoc(data);
}

export function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') {
      if (Number.isInteger(v)) fields[k] = { integerValue: String(v) };
      else fields[k] = { doubleValue: v };
    }
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
  }
  return fields;
}

export async function deleteDocById(projectId, collection, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;
  await fetch(url, { method: 'DELETE' });
}

export { UGG, UGG_KEY, PCC };
