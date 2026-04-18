export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { webhookUrl, payload } = req.body;

  if (!webhookUrl || !payload) {
    return res.status(400).json({ error: "Missing webhookUrl or payload" });
  }

  // Only allow TradersPost webhook URLs for security
  if (!webhookUrl.startsWith("https://webhooks.traderspost.io/")) {
    return res.status(403).json({ error: "Invalid webhook URL" });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    return res.status(response.status).json({ ok: response.ok, status: response.status, body: text });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
