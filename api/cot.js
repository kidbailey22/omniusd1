// /api/cot.js — Fetches COT data from CFTC public API

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

const COT_CODES = {
  XAUUSD: "088691",
  XAGUSD: "084691",
  NAS100: "209742",
  US500:  "13874A",
  US30:   "124603",
  EURUSD: "099741",
  BTCUSD: "133741",
  ETHUSD: "146021",
};

async function fetchCOT(instrument) {
  const code = COT_CODES[instrument];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    // Primary: query by commodity code
    const url = `https://publicreporting.cftc.gov/resource/jun7-fc8e.json?cftc_commodity_code=${code}&%24order=report_date_as_yyyy_mm_dd+DESC&%24limit=2`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "X-App-Token": "omniusd" },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.length > 0) return data;

    // Fallback: query by market name
    const name = encodeURIComponent(COT_MARKET_NAMES[instrument] || "");
    const url2 = `https://publicreporting.cftc.gov/resource/jun7-fc8e.json?market_and_exchange_names=${name}&%24order=report_date_as_yyyy_mm_dd+DESC&%24limit=2`;
    const res2 = await fetch(url2, { headers: { "Accept": "application/json" } });
    if (!res2.ok) throw new Error(`Fallback HTTP ${res2.status}`);
    const data2 = await res2.json();
    return data2;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { instrument } = req.query;
  if (!instrument || !COT_CODES[instrument]) {
    return res.status(400).json({ error: `No COT data for ${instrument}` });
  }

  try {
    const data = await fetchCOT(instrument);
    if (!data || data.length === 0) throw new Error(`No data returned for ${instrument}`);

    const latest = data[0];
    const prev   = data[1] || null;

    const commLong     = parseInt(latest.comm_positions_long_all      || latest.Comm_Positions_Long_All      || "0");
    const commShort    = parseInt(latest.comm_positions_short_all     || latest.Comm_Positions_Short_All     || "0");
    const specLong     = parseInt(latest.noncomm_positions_long_all   || latest.NonComm_Positions_Long_All   || "0");
    const specShort    = parseInt(latest.noncomm_positions_short_all  || latest.NonComm_Positions_Short_All  || "0");
    const smallLong    = parseInt(latest.nonrept_positions_long_all   || latest.NonRept_Positions_Long_All   || "0");
    const smallShort   = parseInt(latest.nonrept_positions_short_all  || latest.NonRept_Positions_Short_All  || "0");
    const openInterest = parseInt(latest.open_interest_all            || latest.Open_Interest_All            || "1");
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
      report_date: latest.report_date_as_yyyy_mm_dd || latest.Report_Date_as_YYYY_MM_DD || "N/A",
      market_name: latest.market_and_exchange_names || latest.Market_and_Exchange_Names || "",
      comm_long: commLong, comm_short: commShort, comm_net: commNet, comm_change: commChange,
      spec_long: specLong, spec_short: specShort, spec_net: specNet,
      small_long: smallLong, small_short: smallShort,
      open_interest: openInterest,
      signal, advice, spec_warning,
    });

  } catch (err) {
    console.error(`COT [${instrument}]: ${err.name === "AbortError" ? "TIMEOUT" : err.message}`);
    return res.status(500).json({ error: err.name === "AbortError" ? "CFTC API timeout" : err.message });
  }
}
