export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Try multiple ways to get the key
  const apiKey = process.env.ANTHROPIC_API_KEY 
    || process.env['ANTHROPIC_API_KEY']
    || '';

  if (!apiKey || apiKey.trim() === '') {
    // Return all env var names (not values) for debugging
    const envKeys = Object.keys(process.env).filter(k => !k.includes('PATH') && !k.includes('HOME'));
    return res.status(500).json({
      error: { 
        message: 'API key not found. Available env vars: ' + envKeys.join(', ')
      }
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
}
