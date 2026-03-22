const Stripe = require("stripe");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const rawBody = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", chunk => data += chunk);
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error("Webhook signature failed:", e.message);
    return res.status(400).json({ error: e.message });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;
    const customerId = session.customer;
    const priceId = session.line_items?.data?.[0]?.price?.id || "";

    // Map price ID to tier
    const PRICE_TO_TIER = {
      "price_1TCPQoEIHuTqoOi9n3oejBYy": { tier: "starter", label: "Starter", color: "#ffd166" },
      "price_1TCPRLEIHuTqoOi9uVChc1LE": { tier: "pro",     label: "Pro",     color: "#00e5ff" },
      "price_1TCPRpEIHuTqoOi9xA9MIiH7": { tier: "elite",   label: "Elite",   color: "#ff6bff" },
    };

    // Try to get line items if not embedded
    let tier = "starter", tierLabel = "Starter", tierColor = "#ffd166";
    if (PRICE_TO_TIER[priceId]) {
      ({ tier, label: tierLabel, color: tierColor } = PRICE_TO_TIER[priceId]);
    } else {
      // Fetch line items from Stripe
      try {
        const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        const pid = items.data[0]?.price?.id;
        if (PRICE_TO_TIER[pid]) {
          ({ tier, label: tierLabel, color: tierColor } = PRICE_TO_TIER[pid]);
        }
      } catch(e) {}
    }

    if (email) {
      // Upsert profile with tier + stripe_customer_id
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
        method: "PATCH",
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tier,
          tier_label: tierLabel,
          tier_color: tierColor,
          stripe_customer_id: customerId,
          is_paid: true,
          updated_at: new Date().toISOString(),
        }),
      });
    }
  }

  // Handle subscription upgrades/downgrades from billing portal
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    const customerId = sub.customer;
    const priceId = sub.items?.data?.[0]?.price?.id;

    const PRICE_TO_TIER = {
      "price_1TCPQoEIHuTqoOi9n3oejBYy": { tier: "starter", tier_label: "Starter", tier_color: "#ffd166" },
      "price_1TCPRLEIHuTqoOi9uVChc1LE": { tier: "pro",     tier_label: "Pro",     tier_color: "#00e5ff" },
      "price_1TCPRpEIHuTqoOi9xA9MIiH7": { tier: "elite",   tier_label: "Elite",   tier_color: "#ff6bff" },
    };

    if (PRICE_TO_TIER[priceId]) {
      const tierData = PRICE_TO_TIER[priceId];
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.${customerId}`, {
        method: "PATCH",
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...tierData, updated_at: new Date().toISOString() }),
      });
    }
  }

  // Handle cancellations
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const customerId = sub.customer;
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.${customerId}`, {
      method: "PATCH",
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ is_paid: false, updated_at: new Date().toISOString() }),
    });
  }

  res.status(200).json({ received: true });
};
