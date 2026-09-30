# AI Loan Eligibility Checker

A static, responsive BFSI decision-support workspace for loan eligibility, credit health, EMI planning, financial tips, and optional saved records. It is designed to work as a plain HTML/CSS/JavaScript site with no build step, while exposing secure serverless adapters for Claude and Google Sheets.

## Feature list

- **Loan Eligibility Checker:** captures profile, income, employment, obligations, credit score, loan type, requested amount, and tenure; returns Eligible / Partially Eligible / Not Eligible, an educational 0–100 score, estimated maximum amount, rate range, FOIR, reasons, and improvement steps.
- **Credit Score Analyzer:** estimates a 300–900 range from payment history, utilization, credit age, active loans, hard inquiries, and credit mix; shows risk and factor bars.
- **EMI Calculator:** synchronized number fields and sliders, years/months toggle, zero-interest handling, monthly EMI, total interest/payment, donut chart, and amortization table.
- **AI Financial Tips:** topic shortcuts, income/expense context, optional follow-up questions, Claude explanations, and rule-based fallbacks.
- **Saved Records:** optional Google Sheets storage with a localStorage backup when the URL is absent or unreachable.
- **Privacy-minded by design:** no passwords or government IDs are requested; client rendering uses safe text nodes for user-provided values.
- **Responsive glassmorphism UI:** keyboard focus states, mobile navigation, reduced-motion support, live status regions, loading states, and inline validation.

> **Disclaimer:** AI-generated guidance is for educational purposes and is not professional financial advice. This tool is not a lender, broker, or underwriting decision engine and never guarantees loan approval.

## Run locally

This is a static site. From the project folder, run any simple static server, for example:

```bash
python3 -m http.server 3000 --bind 0.0.0.0
```

Then open `http://localhost:3000`. The site also runs by opening `index.html` directly, but a local HTTP server is recommended for reliable browser fetch behavior.

## Configure Claude safely

The browser calls the relative endpoint `/api/claude`. Never place the Anthropic key in `js/app.js` or any browser-visible file.

### Netlify

1. Deploy the repository/site with `netlify.toml` at the root.
2. In the Netlify site settings, add the environment variable `ANTHROPIC_API_KEY`.
3. Optionally add `CLAUDE_MODEL` to override the default model (`claude-sonnet-4-5-20250929`).
4. The rewrite in `netlify.toml` sends `/api/claude` to `netlify/functions/claude.js`.
5. Redeploy after changing environment variables.

### Vercel

1. Import the project with `vercel.json` at the root.
2. Add `ANTHROPIC_API_KEY` in Project Settings → Environment Variables.
3. Optionally add `CLAUDE_MODEL`.
4. `api/claude.js` is exposed through the `/api/claude` rewrite.

The proxy uses the Anthropic Messages API with `x-api-key`, `anthropic-version: 2023-06-01`, and `content-type: application/json`. It bounds prompt/context size, times out, validates the response shape, returns private/no-store responses, and maps upstream failures to friendly errors. The browser always falls back to deterministic tips when the AI is missing or unavailable.

## Configure Google Sheets

1. Create a Google Sheet.
2. Open **Extensions → Apps Script**.
3. Copy `google-apps-script/Code.gs` into `Code.gs`.
4. Optional: in Apps Script **Project Settings → Script Properties**, set `SHEET_ID` and `SHEET_NAME` (default tab name: `Eligibility Records`). If `SHEET_ID` is omitted, the script uses the active spreadsheet.
5. Deploy → **New deployment** → type **Web app**.
6. Choose **Execute as: Me** and **Who has access: Anyone**.
7. Copy the Web app URL.
8. Open `js/app.js` and set the single config value:

```js
SHEETS_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
```

The frontend posts JSON as `text/plain` to reduce preflight/CORS friction. `doPost` creates the header row if needed and appends exactly: Timestamp, Name, Email, Phone, Age, Income, Employment, Credit Score, Loan Type, Loan Amount, Result, Eligibility Score. `doGet` returns recent records as JSON. If the URL is blank or a request fails, the site writes a local backup and keeps the Saved Records view usable.

## Netlify deployment

- **Repository deployment:** connect the folder/repository and keep `netlify.toml` at the root. The site is static, functions live in `netlify/functions`, and the API rewrite is already declared.
- **Drag-and-drop static deployment:** drag the project folder into Netlify Drop for the frontend. To use Claude serverlessly, use a repository-based deploy or upload the function through Netlify's supported functions workflow, then add `ANTHROPIC_API_KEY` in site settings.
- Use HTTPS in production. Do not commit `.env` files, API keys, or private sheet credentials.

## Vercel deployment

Import the folder into Vercel with `vercel.json` at the root. Add `ANTHROPIC_API_KEY` and optionally `CLAUDE_MODEL`, then deploy. The site uses relative API calls so the same frontend works on both hosts.

## Configuration points

`js/app.js` keeps the integration knobs in one `CONFIG` object:

- `SHEETS_URL`: blank by default; set to the deployed Apps Script Web App URL.
- `AI_ENDPOINT`: `/api/claude`; keep relative so Netlify and Vercel both work.
- `RECORDS_KEY`: localStorage namespace for browser backup.
- `REQUEST_TIMEOUT`: client-side AI timeout in milliseconds.

## Project structure

```text
index.html                         Accessible single-page application shell
css/style.css                      Theme, responsive layout, components, motion
js/app.js                          Validation, calculations, integrations, UI behavior
assets/loancheck-mark.svg/.png     Project identity and favicon/icon
netlify/functions/claude.js        Netlify Claude proxy
api/claude.js                      Vercel Claude proxy
netlify.toml                       Netlify publish, rewrite, function, and headers config
vercel.json                        Vercel function/rewrite config
google-apps-script/Code.gs         Sheets Web App backend
docs/workflow.mmd/.png              Data-flow diagram
manus-routes.json                  Webdev route manifest
robots.txt / sitemap.xml            Basic crawler files
ideas.md                            Approved design brief
app.config.ts                      Webdev project logo metadata
```

## Privacy and safety notes

- Use HTTPS-only deployment for live use.
- Do not enter passwords, government IDs, bank account credentials, or full card numbers.
- The local backup is browser-local storage and should be cleared on shared devices.
- Google Sheets access is controlled by the Apps Script deployment you configure; protect the sheet and use the smallest sharing scope appropriate for your use.
- Results are estimates built from user-provided inputs and do not replace lender underwriting or professional advice.

## Verification completed in this build

- JavaScript syntax checked with `node --check` for `js/app.js`, `netlify/functions/claude.js`, and `api/claude.js`.
- JSON checked for `manus-routes.json` and `vercel.json`.
- XML checked for `sitemap.xml`.
- Static routes, assets, and route manifest verified with HTTP checks after the preview server starts.
- Eligibility, credit, EMI, tips, records, AI-failure, and Sheets-failure paths are covered by deterministic code paths and the browser-facing fallback states.
- Responsive desktop/mobile layout rules are included at 1030px, 780px, and 480px breakpoints; the live preview is the recommended final visual check.

## Future enhancements

- User authentication and private multi-device records.
- ML-based prediction models trained and monitored with lender-approved data.
- PDF report generation for sharing an educational snapshot.
- Multi-language support with localized financial terminology and accessible translations.


## Current visual direction

The current frontend uses the **Clearline Editorial Fintech** direction: a light cloud background, paper-white cards, deep navy typography, teal trust cues, cobalt interaction states, thin editorial rules, and quieter motion. The underlying modules, calculations, integrations, and fallbacks are unchanged.

The Claude proxy is same-origin by default and does not emit wildcard CORS headers. This avoids allowing arbitrary third-party origins to call the key-backed endpoint. If you intentionally split frontend and API origins, add an explicit allowlist at your hosting layer rather than using `*`.
