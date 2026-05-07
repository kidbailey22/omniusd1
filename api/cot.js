// /api/cot.js — CFTC COT data proxy

const COT_MARKET_NAMES = {
  XAUUSD: "GOLD - COMMODITY EXCHANGE INC.",
  XAGUSD: "SILVER - COMMODITY EXCHANGE INC.",
  NAS100: "NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE",
  US500:  "E-MINI S&P 500 STOCK INDEX - CHICAGO MERCANTILE EXCHANGE",
  US30:   "E-MINI DOW ($5) FUTURES - CHICAGO BOARD OF TRADE",
  EURUSD: "EURO FX - CHICAGO MERCANTILE EXCHANGE",
  BTCUSD: "BITCOIN - CHICAGO MERCANTILE EXCHANGE",
  ETHUSD: "ETHER CASH SETTLED - CHICAGO MERCANTILE EXCHANGE",
};

const BROWSER_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://publicreporting.cftc.gov/",
  "Origin": "https://publicreporting.cftc.gov",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

async function tryFetch(url, signal) {
  const res = await fetch(url, { signal, headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { instrument } = req.query;
  const marketName = COT_MARKET_NAMES[instrument];
  if (!instrument || !marketName) {
    return res.status(400).json({ error: `No COT data for ${instrument}` });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    // Query by market name — most reliable filter
    const encodedName = encodeURIComponent(marketName);
    const url = `https://publicreporting.cftc.gov/resource/jun7-fc8e.json?market_and_exchange_names=${encodedName}&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=2`;

    let data = await tryFetch(url, controller.signal);

    // Fallback: try fuzzy search if exact match fails
    if (!data || data.length === 0) {
      const shortName = marketName.split(" - ")[0]; // e.g. "GOLD"
      const url2 = `https://publicreporting.cftc.gov/resource/jun7-fc8e.json?%24where=market_and_exchange_names%20like%20%27${encodeURIComponent(shortName)}%25%27&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=2`;
      data = await tryFetch(url2, controller.signal);
    }

    clearTimeout(timeout);
    if (!data || data.length === 0) throw new Error(`No COT data found for ${instrument}`);

    const latest = data[0];
    const prev   = data[1] || null;

    const commLong     = parseInt(latest.comm_positions_long_all      || "0");
    const commShort    = parseInt(latest.comm_positions_short_all     || "0");
    const specLong     = parseInt(latest.noncomm_positions_long_all   || "0");
    const specShort    = parseInt(latest.noncomm_positions_short_all  || "0");
    const smallLong    = parseInt(latest.nonrept_positions_long_all   || "0");
    const smallShort   = parseInt(latest.nonrept_positions_short_all  || "0");
    const openInterest = parseInt(latest.open_interest_all            || "1");
    const commNet      = commLong - commShort;
    const specNet      = specLong - specShort;

    let commChange = null;
    if (prev) {
      const pl = parseInt(prev.comm_positions_long_all  || "0");
      const ps = parseInt(prev.comm_positions_short_all || "0");
      commChange = commNet - (pl - ps);
    }

    const netPct = (Math.abs(commNet) / openInterest) * 100;
    let signal, advice;
    if (commNet > 0) {
      signal = netPct > 20 ? "STRONG LONG" : "NET LONG";
      advice = netPct > 20
        ? "Commercials heavily net long — institutional accumulation. Longs have strong tailwind."
        : "Commercials net long — moderate institutional support for longs.";
    } else {
      signal = netPct > 20 ? "STRONG SHORT" : "NET SHORT";
      advice = netPct > 20
        ? "Commercials heavily net short — smart money is hedging upside. Size down on longs, shorts have tailwind."
        : "Commercials net short — institutional hedging in place. Be cautious on longs.";
    }

    const specNetPct = (Math.abs(specNet) / openInterest) * 100;
    let spec_warning = null;
    if (specNet > 0 && specNetPct > 25 && commNet < 0)
      spec_warning = "Large Speculators at extreme long while Commercials are short — classic reversal setup. High caution on longs.";
    else if (specNet < 0 && specNetPct > 25 && commNet > 0)
      spec_warning = "Large Speculators at extreme short while Commercials are long — potential bottom. Shorts may be crowded.";

    return res.status(200).json({
      instrument,
      report_date: latest.report_date_as_yyyy_mm_dd || "N/A",
      market_name: latest.market_and_exchange_names || marketName,
      comm_long, comm_short, comm_net: commNet, comm_change: commChange,
      spec_long, spec_short, spec_net: specNet,
      small_long: smallLong, small_short: smallShort,
      open_interest: openInterest,
      signal, advice, spec_warning,
    });

  } catch (err) {
    clearTimeout(timeout);
    const msg = err.name === "AbortError" ? "CFTC API timeout" : err.message;
    console.error(`COT [${instrument}]: ${msg}`);
    return res.status(500).json({ error: msg });
  }
}
