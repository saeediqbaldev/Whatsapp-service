const express = require('express');
const QRCode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());

const ALERT_SECRET   = process.env.ALERT_SECRET;
const DEFAULT_NUMBER = process.env.WHATSAPP_NUMBER;

let sock;
let isReady   = false;
let latestQR  = null; // stores the raw QR string until scanned

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('/app/auth');
  const { version } = await fetchLatestBaileysVersion();
  console.log('Using WA version:', version);

  sock = makeWASocket({ auth: state, version });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQR = qr; // save for /qr endpoint
      console.log('=== NEW QR CODE GENERATED — scan via /qr endpoint or logs ===');
    }

    if (connection === 'open') {
      isReady  = true;
      latestQR = null; // clear QR once connected
      console.log('✅ WhatsApp connected successfully');
    }

    if (connection === 'close') {
      isReady = false;
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) connectWhatsApp();
    }
  });
}

connectWhatsApp();

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', whatsappConnected: isReady, qrPending: !!latestQR });
});

// ─── QR CODE PAGE ─────────────────────────────────────────────────────────────
// Returns a simple HTML page with the QR code rendered as an image.
// Protected by the same ALERT_SECRET header OR a query param ?secret=xxx
// so Loveable can embed it in an iframe or open it directly.
app.get('/qr', async (req, res) => {
  const secret = req.headers['x-alert-secret'] || req.query.secret;
  if (secret !== ALERT_SECRET) return res.status(401).send('Unauthorized');

  if (isReady) {
    return res.send(`
      <!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          body { font-family: sans-serif; display: flex; flex-direction: column;
                 align-items: center; justify-content: center; height: 100vh;
                 margin: 0; background: #f0fdf4; }
          .badge { background: #16a34a; color: white; padding: 12px 24px;
                   border-radius: 999px; font-size: 18px; font-weight: bold; }
          p { color: #555; margin-top: 16px; }
        </style>
      </head><body>
        <div class="badge">✅ WhatsApp Connected</div>
        <p>No action needed. Your session is active.</p>
      </body></html>
    `);
  }

  if (!latestQR) {
    return res.send(`
      <!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta http-equiv="refresh" content="3">
        <style>
          body { font-family: sans-serif; display: flex; flex-direction: column;
                 align-items: center; justify-content: center; height: 100vh;
                 margin: 0; background: #fffbeb; }
          .spinner { width: 48px; height: 48px; border: 5px solid #fde68a;
                     border-top-color: #f59e0b; border-radius: 50%;
                     animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
          p { color: #555; margin-top: 16px; }
        </style>
      </head><body>
        <div class="spinner"></div>
        <p>Waiting for QR code… (auto-refreshes)</p>
      </body></html>
    `);
  }

  try {
    const qrImage = await QRCode.toDataURL(latestQR, { width: 300, margin: 2 });
    res.send(`
      <!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta http-equiv="refresh" content="20">
        <style>
          body { font-family: sans-serif; display: flex; flex-direction: column;
                 align-items: center; justify-content: center; min-height: 100vh;
                 margin: 0; background: #f8fafc; }
          h2  { color: #1e293b; margin-bottom: 4px; }
          p   { color: #64748b; margin-top: 0; font-size: 14px; }
          img { border: 2px solid #e2e8f0; border-radius: 12px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
          .note { font-size: 12px; color: #94a3b8; margin-top: 12px; }
        </style>
      </head><body>
        <h2>📱 Scan to Connect WhatsApp</h2>
        <p>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
        <img src="${qrImage}" width="280" height="280" alt="WhatsApp QR Code" />
        <div class="note">QR refreshes automatically every 20 seconds if not scanned</div>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send('Failed to generate QR image');
  }
});

// ─── SEND ALERT ───────────────────────────────────────────────────────────────
app.post('/alert', async (req, res) => {
  const secret = req.headers['x-alert-secret'];
  if (secret !== ALERT_SECRET) return res.status(401).json({ error: 'unauthorized' });
  if (!isReady) return res.status(503).json({ error: 'whatsapp not connected yet' });

  const { message, number } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const target = (number || DEFAULT_NUMBER) + '@s.whatsapp.net';

  try {
    await sock.sendMessage(target, { text: message });
    res.json({ status: 'sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to send' });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
