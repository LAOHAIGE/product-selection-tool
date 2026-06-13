# Web deployment guide

This project can run as a hosted web app so users only need a browser.

## Recommended first version

Use per-user DeepSeek keys:

- Each browser stores its own DeepSeek key in `localStorage`.
- The key is sent to the server only for the current AI request.
- The server does not save per-user DeepSeek keys.
- Each browser gets a generated session id, sent as `x-selection-session-id`, so candidate data does not mix across users.

## Render deployment

1. Push this project to a Git repository.
2. Create a Render Web Service.
3. Select the repository.
4. Runtime: Node.
5. Build command: leave empty or use `npm install`.
6. Start command:

```bash
node src/server/http-server.mjs
```

7. Environment variables:

```bash
NODE_ENV=production
```

Do not set `DEEPSEEK_API_KEY` for the first public version if every user should enter their own key.

## User workflow

1. Open the deployed URL.
2. Import the product workbook.
3. In AI config, paste their own DeepSeek key.
4. Save and test the key.
5. Import keyword and competitor workbooks.
6. Run ASIN and competitor AI analysis.

## Privacy notes

- The current hosted version uploads Excel files to the server for parsing.
- The server stores analysis runs under a browser session id.
- DeepSeek keys are not stored by the server in per-user mode.
- For stricter privacy later, move Excel parsing into the browser and keep only DeepSeek proxy calls on the server.
