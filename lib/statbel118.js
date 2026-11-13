const XLSX = require('xlsx');
const snapshot = require('./statbel-health118.json');
const SOURCE = snapshot.source;
const JSON_SOURCE = 'https://bestat.statbel.fgov.be/bestat/api/views/e8fad1c0-5270-4d62-9118-0999ee8cb323/result/JSON';
const BASE = '2013 = 100';
function text(v) { return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
function number(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim();
  if (!/^[0-9]+(?:[.,][0-9]+)?$/.test(s)) return null;
  return Number(s.replace(',', '.'));
}
function indexValue(v) { const n = number(v); return n !== null && n > 0 && n < 1000 ? Math.round(n * 100) / 100 : null; }
function put(values, key, value) {
  if (Object.prototype.hasOwnProperty.call(values, key) && values[key] !== value) throw Error('Conflicting official health-index rows for ' + key);
  values[key] = value;
}
function extractWorkbook(wb) {
  const values = Object.create(null);
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    // Statbel open data uses separate year/month columns and explicit series/base-year fields.
    const header = rows.findIndex(row => ['nm_yr', 'nm_mth', 'ms_hlth_idx', 'nm_base_yr'].every(key => row.some(v => text(v) === key)));
    if (header < 0) continue;
    const names = rows[header].map(text), yearCol = names.indexOf('nm_yr'), monthCol = names.indexOf('nm_mth'), healthCol = names.indexOf('ms_hlth_idx'), baseCol = names.indexOf('nm_base_yr');
    for (const row of rows.slice(header + 1)) {
      if (number(row[baseCol]) !== 2013) continue;
      const year = number(row[yearCol]), month = number(row[monthCol]), value = indexValue(row[healthCol]);
      if (!Number.isInteger(year) || year < 1994 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || value === null) continue;
      put(values, `${year}-${String(month).padStart(2, '0')}`, value);
    }
  }
  if (!Object.keys(values).length) throw Error('The official workbook does not contain the expected health-index columns');
  return values;
}
const months = [['january','januari','janvier','januar'],['february','februari','fevrier','februar'],['march','maart','mars','marz'],['april','avril'],['may','mei','mai'],['june','juni','juin'],['july','juli','juillet'],['august','augustus','aout'],['september','septembre'],['october','oktober','octobre'],['november','novembre'],['december','decembre','dezember']];
function monthKey(v) {
  const s = text(v), iso = s.match(/^((?:19|20)\d{2})-(0[1-9]|1[0-2])(?:$|[ T])/);
  if (iso) return iso[1] + '-' + iso[2];
  const year = (s.match(/(?:19|20)\d{2}/) || [])[0];
  if (!year) return '';
  const i = months.findIndex(names => names.some(name => new RegExp('(?:^|[^a-z])' + name + '(?:$|[^a-z])').test(s)));
  return i < 0 ? '' : year + '-' + String(i + 1).padStart(2, '0');
}
function officialFact(data, target) {
  const values = Object.create(null);
  for (const row of data?.facts || []) {
    if (text(row['Level 1']) !== 'health index' || text(row['Base year']) !== BASE || monthKey(row.Month) !== target) continue;
    const value = indexValue(row['Consumer price index']);
    if (value !== null) put(values, target, value);
  }
  return values[target] ?? null;
}
let cached = null, pending = null, retryAfter = 0;
async function workbookValues() {
  const now = Date.now();
  if (cached && cached.expires > now) return cached.values;
  if (pending) return pending;
  if (retryAfter > now) throw Error('Official source temporarily unavailable');
  pending = (async () => {
    const r = await fetch(SOURCE, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'ManageRent4U/1.0' } });
    if (!r.ok) throw Error('Official workbook download failed');
    const bytes = Buffer.from(await r.arrayBuffer());
    if (!bytes.subarray(0, 2).equals(Buffer.from('PK'))) throw Error('Official source did not return an Excel workbook');
    const values = extractWorkbook(XLSX.read(bytes, { cellDates: true }));
    cached = { values, expires: Date.now() + 6 * 60 * 60 * 1000 };
    return values;
  })();
  try { return await pending; }
  catch (e) { retryAfter = Date.now() + 60000; throw e; }
  finally { pending = null; }
}
async function lookup(month) {
  try {
    const values = await workbookValues();
    if (values[month] !== undefined) return { month, value: values[month], base: BASE, source: SOURCE };
  } catch (_) { /* An exact official snapshot remains available during source outages. */ }
  if (Object.prototype.hasOwnProperty.call(snapshot.values, month)) return { month, value: snapshot.values[month], base: BASE, source: SOURCE, verifiedFallback: true, sourceRetrievedOn: snapshot.retrieved_on };
  // The secondary view covers recent months only; it cannot supply older missing months.
  const r = await fetch(JSON_SOURCE, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (r.ok) {
    const value = officialFact(await r.json(), month);
    if (value !== null) return { month, value, base: BASE, source: JSON_SOURCE };
  }
  return null;
}
module.exports = { lookup, extractWorkbook, officialFact, monthKey, number, SOURCE, BASE };
