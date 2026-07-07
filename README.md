# WhatsApp Alert Service

Small Node.js + Baileys service that sends WhatsApp messages via a simple webhook.
Deploy this on Coolify as a Dockerfile-based app.

## Required environment variables
- `ALERT_SECRET` — any long random string, used to authenticate calls to /alert
- `WHATSAPP_NUMBER` — your WhatsApp number with country code, no + or spaces (e.g. 923001234567)

## Required volume
Mount a persistent volume at `/app/auth` (destination path) so your WhatsApp
login session survives redeploys. Without this you'll need to rescan the QR
code every time you redeploy.

## Endpoints
- `GET /health` — returns connection status
- `POST /alert` — send a WhatsApp message
  - Header: `x-alert-secret: <your ALERT_SECRET>`
  - Body: `{ "message": "your text here" }`
  - Optional: `{ "message": "...", "number": "923001234567" }` to override the default recipient

## First-time setup
1. Deploy the app in Coolify.
2. Open the Logs tab and wait for the QR code to appear.
3. On your phone: WhatsApp → Settings → Linked Devices → Link a Device → scan the QR code.
4. Confirm the logs show "✅ WhatsApp connected successfully".
5. Test with:
```
curl -X POST https://your-domain/alert \
  -H "Content-Type: application/json" \
  -H "x-alert-secret: YOUR_SECRET" \
  -d '{"message":"Test alert"}'
```
# Whatsapp-service
