export const config = {
  api: {
    bodyParser: false, // Raw body needed for Stripe signature verification
  },
  maxDuration: 30,
};

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bwvbsomzldouymsldpsu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Service role key — bypasses RLS

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Verify Stripe webhook signature
async function verifyStripeSignature(rawBody, signature, secret) {
  const encoder = new TextEncoder();
  const parts = signature.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).slice(2);
  const sig = parts.find(p => p.startsWith('v1=')).slice(3);
  
  const payload = `${timestamp}.${rawBody.toString()}`;
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expected = Array.from(new Uint8Array(signed)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  if (expected !== sig) throw new Error('Invalid signature');
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) throw new Error('Timestamp too old');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signature = req.headers['stripe-signature'];

  try {
    await verifyStripeSignature(rawBody, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody.toString());

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;
    const tier = session.metadata?.tier || 'starter';

    if (!email) {
      console.error('No email in checkout session');
      return res.status(200).json({ received: true });
    }

    try {
      // Create user in Supabase using service role key (bypasses RLS)
      const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          email,
          password: crypto.randomUUID(), // Temp password — user will set via magic link
          email_confirm: true, // Auto-confirm email
          user_metadata: { tier },
        }),
      });

      const userData = await signupRes.json();
      
      if (userData.id) {
        // Save profile with paid tier
        await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            id: userData.id,
            email,
            tier,
            tier_label: tier.charAt(0).toUpperCase() + tier.slice(1),
            tier_color: tier === 'starter' ? '#ffd166' : tier === 'pro' ? '#00e5ff' : '#ff6bff',
            default_instrument: 'XAUUSD',
            is_paid: true,
            updated_at: new Date().toISOString(),
          }),
        });

        // Send password setup email
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify({ email_confirm: true }),
        });
      } else if (signupRes.status === 422) {
        // User already exists — just update their profile to paid
        console.log('User already exists, updating to paid');
      }
    } catch (err) {
      console.error('Error creating user:', err);
    }
  }

  return res.status(200).json({ received: true });
}
