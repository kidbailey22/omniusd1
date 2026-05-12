// /api/cot-debug.js — temporary debug endpoint
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const HEADERS = {
    "Accept": "application/json",
    "Referer": "https://publicreporting.cftc.gov/",
    "Origin": "https://publicreporting.cftc.gov",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  };

  const results = {};

  // EURUSD TFF — show ALL raw fields
  try {
    const url = "https://publicreporting.cftc.gov/resource/gpe5-46if.json"
      + "?market_and_exchange_names=" + encodeURIComponent("EURO FX - CHICAGO MERCANTILE EXCHANGE")
      + "&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=1";
    const r = await fetch(url, { headers: HEADERS });
    const d = await r.json();
    results.eurusd_tff_raw = d[0] || null;
    results.eurusd_field_names = d[0] ? Object.keys(d[0]) : [];
  } catch(e) { results.eurusd_error = e.message; }

  // NAS100 TFF — show ALL raw fields
  try {
    const url = "https://publicreporting.cftc.gov/resource/gpe5-46if.json"
      + "?market_and_exchange_names=" + encodeURIComponent("NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE")
      + "&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=1";
    const r = await fetch(url, { headers: HEADERS });
    const d = await r.json();
    results.nas100_tff_raw = d[0] || null;
    results.nas100_field_names = d[0] ? Object.keys(d[0]) : [];
  } catch(e) { results.nas100_error = e.message; }

  return res.status(200).json(results);
};
