const express = require('express');
const qrcode = require('qrcode-terminal');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());

const ALERT_SECRET = process.env.ALERT_SECRET;
const DEFAULT_NUMBER = process.env.WHATSAPP_NUMBER; // e.g. 923001234567

let sock;
let isReady = false;

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('/app/auth');
  const { version } = await fetchLatestBaileysVersion();
  console.log('Using WA version:', version);

  sock = makeWASocket({ auth: state, version });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('=== SCAN THIS QR CODE WITH WHATSAPP ===');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      isReady = true;
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', whatsappConnected: isReady });
});

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
