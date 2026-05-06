// /api/cot.js — Fetches COT data from CFTC's free public API
// Called by OmniUSD plan page to show Commercial sentiment

// CFTC commodity codes (Legacy Futures Only report)
const COT_CODES = {
  XAUUSD: "088691", // Gold - COMMODITY EXCHANGE INC.
  XAGUSD: "084691", // Silver - COMMODITY EXCHANGE INC.
  NAS100: "209742", // NASDAQ-100 Mini - CME
  US500:  "13874A", // S&P 500 Mini - CME
  US30:   "124603", // Dow Jones Mini - CBOT
  EURUSD: "099741", // Euro FX - CME
  BTCUSD: "133741", // Bitcoin - CME
  ETHUSD: "146021", // Ether Cash Settled - CME
};

export default async function handler(req, res) {
  // Allow GET only
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { instrument } = req.query;
  if (!instrument || !COT_CODES[instrument]) {
    return res.status(400).json({ error: `No COT data available for ${instrument}` });
  }

  const code = COT_CODES[instrument];

  try {
    // CFTC Public Reporting Environment API — free, no token required
    const url = `https://publicreporting.cftc.gov/resource/jun7-fc8e.json?cftc_commodity_code=${code}&$order=report_date_as_yyyy_mm_dd DESC&$limit=2`;
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) throw new Error(`CFTC API error: ${response.status}`);

    const data = await response.json();
    if (!data || data.length === 0) throw new Error("No COT data returned");

    const latest = data[0];
    const prev   = data[1] || null;

    // Parse Commercial positions
    const commLong  = parseInt(latest.comm_positions_long_all  || 0);
    const commShort = parseInt(latest.comm_positions_short_all || 0);
    const commNet   = commLong - commShort;

    // Parse Large Speculator positions
    const specLong  = parseInt(latest.noncomm_positions_long_all  || 0);
    const specShort = parseInt(latest.noncomm_positions_short_all || 0);
    const specNet   = specLong - specShort;

    // Week-over-week change
    let commNetPrev = null;
    let commChange  = null;
    if (prev) {
      commNetPrev = parseInt(prev.comm_positions_long_all || 0) - parseInt(prev.comm_positions_short_all || 0);
      commChange  = commNet - commNetPrev;
    }

    // Determine sentiment signal
    // Commercials net long = bullish signal (they're accumulating)
    // Commercials net short = bearish signal (they're hedging against upside)
    let signal, color, advice;

    const absNet = Math.abs(commNet);
    const openInterest = parseInt(latest.open_interest_all || 1);
    const netPct = (absNet / openInterest) * 100;

    if (commNet > 0) {
      if (netPct > 20) {
        signal = "STRONG LONG";
        color  = "bullish_strong";
        advice = "Commercials heavily net long — institutional accumulation. Longs have strong tailwind.";
      } else {
        signal = "NET LONG";
        color  = "bullish";
        advice = "Commercials net long — moderate institutional support for longs.";
      }
    } else {
      if (netPct > 20) {
        signal = "STRONG SHORT";
        color  = "bearish_strong";
        advice = "Commercials heavily net short — smart money is hedging upside. Size down on longs, shorts have tailwind.";
      } else {
        signal = "NET SHORT";
        color  = "bearish";
        advice = "Commercials net short — institutional hedging in place. Be cautious on longs.";
      }
    }

    // Spec extreme warning
    let specWarning = null;
    const specNetPct = (Math.abs(specNet) / openInterest) * 100;
    if (specNet > 0 && specNetPct > 25 && commNet < 0) {
      specWarning = "Large Speculators at extreme long while Commercials are short — classic reversal setup. High caution on longs.";
    } else if (specNet < 0 && specNetPct > 25 && commNet > 0) {
      specWarning = "Large Speculators at extreme short while Commercials are long — potential bottom. Shorts may be crowded.";
    }

    return res.status(200).json({
      instrument,
      report_date: latest.report_date_as_yyyy_mm_dd,
      comm_long:  commLong,
      comm_short: commShort,
      comm_net:   commNet,
      spec_long:  specLong,
      spec_short: specShort,
      spec_net:   specNet,
      comm_change: commChange,
      open_interest: openInterest,
      signal,
      color,
      advice,
      spec_warning: specWarning,
    });

  } catch (err) {
    console.error("COT fetch error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
