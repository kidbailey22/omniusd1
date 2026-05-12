// /api/cot-debug.js — temporary debug endpoint
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const instrument = req.query.instrument || "EURUSD";

  const TFF_MARKETS = {
    NAS100: "NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE",
    US500:  "E-MINI S&P 500 STOCK INDEX - CHICAGO MERCANTILE EXCHANGE",
    US30:   "DJIA x $5 - CHICAGO BOARD OF TRADE",
    EURUSD: "EURO FX - CHICAGO MERCANTILE EXCHANGE",
  };

  const HEADERS = {
    "Accept": "application/json",
    "Referer": "https://publicreporting.cftc.gov/",
    "Origin": "https://publicreporting.cftc.gov",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  };

  const marketName = TFF_MARKETS[instrument];
  const results = {};

  // Test 1: TFF with primary name
  try {
    const url = "https://publicreporting.cftc.gov/resource/gpe5-46if.json"
      + "?market_and_exchange_names=" + encodeURIComponent(marketName)
      + "&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=1";
    const r = await fetch(url, { headers: HEADERS });
    const d = await r.json();
    results.tff_primary = {
      name: marketName,
      status: r.status,
      rows: d.length,
      sample: d[0] ? {
        market: d[0].market_and_exchange_names,
        date: d[0].report_date_as_yyyy_mm_dd,
        am_long: d[0].asset_mgr_positions_long_all,
        am_short: d[0].asset_mgr_positions_short_all,
      } : null
    };
  } catch(e) { results.tff_primary = { error: e.message }; }

  // Test 2: Legacy with same name
  try {
    const url = "https://publicreporting.cftc.gov/resource/jun7-fc8e.json"
      + "?market_and_exchange_names=" + encodeURIComponent(marketName)
      + "&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=1";
    const r = await fetch(url, { headers: HEADERS });
    const d = await r.json();
    results.legacy = {
      name: marketName,
      status: r.status,
      rows: d.length,
      sample: d[0] ? {
        market: d[0].market_and_exchange_names,
        date: d[0].report_date_as_yyyy_mm_dd,
        comm_long: d[0].comm_positions_long_all,
        comm_short: d[0].comm_positions_short_all,
      } : null
    };
  } catch(e) { results.legacy = { error: e.message }; }

  // Test 3: Search TFF for any EURO entry
  try {
    const url = "https://publicreporting.cftc.gov/resource/gpe5-46if.json"
      + "?%24where=market_and_exchange_names+like+'%25EURO%25'"
      + "&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=3";
    const r = await fetch(url, { headers: HEADERS });
    const d = await r.json();
    results.tff_euro_search = {
      status: r.status,
      rows: d.length,
      names: d.map(x => x.market_and_exchange_names + " | " + x.report_date_as_yyyy_mm_dd)
    };
  } catch(e) { results.tff_euro_search = { error: e.message }; }

  return res.status(200).json(results);
};
