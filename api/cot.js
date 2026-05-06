// /api/cot.js — Fetches COT data from CFTC's free public API

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

export default async function handler(req, res) {
  // Allow CORS from omniusd.pro
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { instrument } = req.query;
  if (!instrument || !COT_CODES[instrument]) {
    return res.status(400).json({ error: `No COT data for ${instrument}` });
  }

  const code = COT_CODES[instrument];

  try {
    const params = new URLSearchParams({
      "cftc_commodity_code": code,
      "$order": "report_date_as_yyyy_mm_dd DESC",
      "$limit": "2",
    });

    const url = `https://publicreporting.cftc.gov/resource/jun7-fc8e.json?${params.toString()}`;

    // 8 second timeout — CFTC API can be slow
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`CFTC API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    if (!data || data.length === 0) throw new Error(`No data for ${code}`);

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
      const prevNet = parseInt(prev.comm_positions_long_all || "0") - parseInt(prev.comm_positions_short_all || "0");
      commChange = commNet - prevNet;
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
    if (specNet > 0 && specNetPct > 25 && commNet < 0) {
      spec_warning = "Large Speculators at extreme long while Commercials are short — classic reversal setup. High caution on longs.";
    } else if (specNet < 0 && specNetPct > 25 && commNet > 0) {
      spec_warning = "Large Speculators at extreme short while Commercials are long — potential bottom. Shorts may be crowded.";
    }

    return res.status(200).json({
      instrument,
      report_date: latest.report_date_as_yyyy_mm_dd,
      market_name: latest.market_and_exchange_names,
      comm_long, comm_short, comm_net: commNet, comm_change: commChange,
      spec_long, spec_short, spec_net: specNet,
      small_long: smallLong, small_short: smallShort,
      open_interest: openInterest,
      signal, advice, spec_warning,
    });

  } catch (err) {
    const isTimeout = err.name === "AbortError";
    console.error(`COT fetch error [${instrument}]:`, isTimeout ? "TIMEOUT" : err.message);
    return res.status(500).json({ 
      error: isTimeout ? "CFTC API timeout — try again" : err.message 
    });
  }
}
