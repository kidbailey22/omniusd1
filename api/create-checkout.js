// api/create-checkout.js
// Handles both regular checkout and 3-day free trial (Pro only)

const Stripe = require("stripe");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { priceId, tier, trial, trialDays, successUrl, cancelUrl } = req.body;

  if (!priceId || !successUrl || !cancelUrl) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const sessionParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { tier: tier || "starter" },
    };

    // Add trial period if this is a trial checkout
    if (trial && trialDays && trialDays > 0) {
      sessionParams.subscription_data = {
        trial_period_days: trialDays,
        metadata: { tier: "pro_trial", trial: "true" },
      };
      // Trial requires payment method upfront
      sessionParams.payment_method_collection = "always";
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("Stripe checkout error:", e);
    res.status(500).json({ error: e.message || "Checkout failed." });
  }
};
