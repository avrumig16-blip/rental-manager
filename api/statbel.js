const { lookup, SOURCE } = require('../lib/statbel118');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); return res.status(405).json({ error: 'Use GET to read the official health index.' }); }
  const month = String(req.query?.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const currentMonth = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels' }).format(new Date()).slice(0, 7);
  if (month > currentMonth) return res.status(422).json({ error: 'The health index for ' + month + ' has not been published yet.' });
  if (Number(month.slice(0, 4)) < 1994) return res.status(422).json({ error: 'The Belgian health index exists from January 1994 onward.' });
  try {
    const result = await lookup(month);
    if (result) { res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400'); return res.status(200).json(result); }
  } catch (_) { /* Return a clear source-availability error; never estimate an index. */ }
  return res.status(502).json({ error: 'The official health index for ' + month + ' is not available automatically right now. Try again later or enter the value from Statbel manually.', source: SOURCE });
};
