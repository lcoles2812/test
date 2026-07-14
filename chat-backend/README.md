# Common Table Chat Backend

Production-ready backend for the site chat widget using Google AI Studio (Gemini).

## Public URL Details (Live)

- Website: https://commontablekitchen.com.au
- Chat API endpoint: https://ais-pre-uanud6caph7jycyiiesi43-413938524988.asia-southeast1.run.app/api/chat
- Chat API health check: https://ais-pre-uanud6caph7jycyiiesi43-413938524988.asia-southeast1.run.app/health

## 1. Setup

```bash
cd chat-backend
npm install
cp .env.example .env
```

Set `.env` values:

- `GEMINI_API_KEY`: your AI Studio API key
- `PORT`: optional, default `8080`
- `GEMINI_MODEL`: optional, default `gemini-1.5-flash`
- `CORS_ALLOWED_ORIGINS`: comma-separated domains allowed to call the API

Example:

```env
GEMINI_API_KEY=AIza...
CORS_ALLOWED_ORIGINS=https://commontablekitchen.com.au,https://www.commontablekitchen.com.au
```

## 2. Run Locally

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:8080/health
```

Chat test:

```bash
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Give me a quick high protein dinner idea","settings":{"persona":"michelin","temperature":0.7}}'
```

## 3. Deploy To Cloud Run

From `chat-backend` directory:

```bash
gcloud run deploy common-table-chat \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_KEY,CORS_ALLOWED_ORIGINS=https://commontablekitchen.com.au
```

After deployment, copy the service URL and append `/api/chat`.

## 4. Wire Frontend

Update [scripts/chat-config.js](../scripts/chat-config.js):

```js
window.COMMON_TABLE_CHAT_MODE = "gemini";
window.COMMON_TABLE_CHAT_ENDPOINT = "https://ais-pre-uanud6caph7jycyiiesi43-413938524988.asia-southeast1.run.app/api/chat";
```

The frontend already sends:

- `message`
- `settings`

And expects response JSON:

```json
{ "reply": "..." }
```
