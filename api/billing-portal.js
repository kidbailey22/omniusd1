const Stripe = require("stripe");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { user_id, return_url } = req.body;

  if (!user_id) return res.status(400).json({ error: "user_id required" });

  try {
    // Look up stripe_customer_id from Supabase
    const supaRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}&select=stripe_customer_id,email`,
      {
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Accept": "application/vnd.pgrst.object+json",
        }
      }
    );

    if (!supaRes.ok) return res.status(500).json({ error: "Failed to load profile" });
    const profile = await supaRes.json();

    let customerId = profile.stripe_customer_id;

    // If no customer ID yet, find or create one in Stripe by email
    if (!customerId) {
      const existing = await stripe.customers.list({ email: profile.email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({ email: profile.email });
        customerId = newCustomer.id;
      }

      // Save it back to Supabase
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}`, {
        method: "PATCH",
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stripe_customer_id: customerId }),
      });
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: return_url || "https://omniusd.pro",
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("Billing portal error:", e);
    res.status(500).json({ error: e.message });
  }
};
