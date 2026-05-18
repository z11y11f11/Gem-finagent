# FinAgent Change Handoff for Gemini

This document summarizes all important changes made so far, the reasons, and the concrete implementation approach. Use it as a checklist to reproduce or repair the project.

## Project

- Name: FinAgent
- Stack: React + TypeScript + Express + Vite
- Backend entry: `server.ts`
- Main AI service: `src/services/ai.ts`
- Dashboard UI: `src/components/AnalysisDashboard.tsx`

## Required Workflow

Before changing code:

1. Read `INSTRUCTION.md`.
2. Read every file before modifying it.
3. Make additive changes unless explicitly told otherwise.
4. After changes, run:
   - `npm run lint`
   - `npm run build`
   - `npm run dev` or `npm start`, depending on the fix
5. Append a changelog entry to `INSTRUCTION.md`.

## Production Server Fix

### Problem

Production logs showed:

```text
TypeError [ERR_INVALID_ARG_VALUE]: The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received undefined
at createRequire
```

and PM2 also showed:

```text
Cannot find module '/root/Gem-finagent/dist/server.cjs'
```

### Cause

`server.ts` already uses:

```ts
const require = createRequire(import.meta.url);
```

But the build script was bundling the server as CommonJS:

```json
"build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
"start": "node dist/server.cjs"
```

When esbuild emits CJS, `import.meta.url` can become unavailable/undefined, causing `createRequire(undefined)`.

### Fix

Build the server as ESM and start the `.mjs` file in production mode:

```json
"build": "vite build && esbuild server.ts --bundle --platform=node --format=esm --packages=external --sourcemap --outfile=dist/server.mjs",
"start": "NODE_ENV=production node dist/server.mjs"
```

### PM2 Deployment

On server:

```bash
npm install
npm run build
pm2 delete finagent
pm2 start npm --name finagent -- start
pm2 save
pm2 logs finagent --lines 30
```

Expected log:

```text
FinAgent server running at http://localhost:3000
```

If using `ecosystem.config.js`, do not point PM2 at `server.ts` or `dist/server.cjs`. Use either:

```js
script: "npm",
args: "start"
```

or:

```js
script: "dist/server.mjs"
```

## AI Provider Fallback

### Problem

The project originally required `GEMINI_API_KEY`. If the user only had an OpenAI key, AI analysis failed.

### Fix

In `src/services/ai.ts`:

- Keep Gemini as preferred provider.
- Add OpenAI fallback when Gemini key is missing or Gemini auth fails.
- Add `OPENAI_API_KEY` to Vite env injection in `vite.config.ts`.
- Install `openai` package.

Commands:

```bash
npm install openai
```

`.env` can contain:

```env
GEMINI_API_KEY="optional_gemini_key"
OPENAI_API_KEY="openai_key"
```

Logic:

1. If `GEMINI_API_KEY` exists, use Gemini.
2. If Gemini auth fails and `OPENAI_API_KEY` exists, fallback to OpenAI.
3. If only `OPENAI_API_KEY` exists, use OpenAI.
4. If neither exists, show API auth error.

OpenAI model was changed to faster fallback:

```ts
model: "gpt-5.4-mini"
```

## Financial Report Analysis Enhancements

### Report Date

In `analyzeFinancialText`:

- Ask AI to extract report period date.
- Return `reportDate` as ISO `YYYY-MM-DD`.
- Add `isHistorical: true` if older than 6 months.

Type added in `src/types.ts`:

```ts
reportDate?: string;
isHistorical?: boolean;
```

### Competitor Extraction

In `analyzeFinancialText`, competitor extraction should request:

- 3-5 direct publicly traded competitors
- Yahoo Finance-compatible ticker symbols
- Do not leave ticker empty for public companies

Schema should require:

```ts
required: ["name", "ticker", "rationale"]
```

## Cross Analysis

### Function

Add or preserve:

```ts
crossAnalyze(reportAnalysis, marketData)
```

It should return:

```ts
export interface CrossAnalysisResult {
  alignmentScore?: number;
  financialsAlignWithStockPerformance: boolean;
  alignmentSummary: string;
  divergenceSignals: string[];
  investmentVerdict: string;
}
```

It compares:

- report analysis fundamentals
- real-time market/stock data
- valuation summary
- latest technical trend

### Dashboard Section

In `src/components/AnalysisDashboard.tsx`, add a section after Executive Summary:

```text
Cross Analysis & Investment Signal
```

Display:

1. Alignment score
2. Divergence signals, colored red/green depending on content
3. One-sentence investment verdict

Call `crossAnalyze` once real-time stock and valuation summary are available.

## 30-Second Summary Card

Add a card above KPIs and below the top company header.

It should always be visible and show:

1. Company name and ticker
2. One-line business description from the report summary
3. Financial health signal: Green / Yellow / Red
4. Valuation verdict: Undervalued / Fair / Overvalued
5. Investment verdict from `crossAnalysis`

Health signal heuristic:

- Green if sentiment positive and growth/ROE/margin are healthy.
- Red if sentiment negative or growth/ROE/margin are negative.
- Yellow otherwise.

Valuation heuristic:

- If target price exists, compare mean target to current price.
- If upside > 15%, Undervalued.
- If downside > 15%, Overvalued.
- Otherwise Fair.
- If no target, fallback to PE/PEG.

## Peer Comparison Fix

### Problem

Peer Comparison section expanded but showed no useful data.

### Fix

In `src/components/PeerComparison.tsx`:

- Fetch real-time market metrics for competitors via existing Express Yahoo endpoints.
- Include the analyzed company as the first row.
- Include 3-5 competitors.
- Include an industry average row.
- Show columns:
  - Company
  - Role
  - P/E
  - P/B
  - EV/EBITDA
  - Revenue Growth
  - Dividend Yield

If competitor ticker fails:

1. Use LLM ticker resolver.
2. Try candidate Yahoo symbols.
3. Store successful data under both original key and resolved ticker key so display row does not remain empty.

## Yahoo Ticker Normalization

Add `src/utils/ticker.ts`.

Purpose:

- Convert messy or HK-style text to Yahoo symbols.

Examples:

```text
1810 -> 1810.HK
HKEX: 1810 (HKD counter), 81810 (RMB counter) -> 1810.HK
1810.HK -> 1810.HK
Hang Seng Index -> use LLM resolver, likely ^HSI
```

Functions:

```ts
normalizeYahooTicker(rawTicker: string): string
isLikelyResolvedYahooTicker(ticker: string): boolean
```

Also add `resolveYahooTickersWithAI(query)` in `src/services/ai.ts` returning candidate Yahoo symbols.

Use flow:

1. Local normalization
2. Yahoo search
3. LLM resolver fallback
4. Validate candidates via Yahoo endpoint before use

## Valuation Models Verdict

### DCF Confirmation

DCF is real math in `src/components/ValuationModels.tsx`, not AI text.

It uses user inputs:

- `growthRate`
- `discountRate`
- `terminalGrowthRate`

Formula:

1. Estimate base cash flow:

```ts
baseCashFlow = stock.regularMarketPrice / trailingPE
```

fallback:

```ts
10
```

2. Project 5 years of cash flow using growth rate.
3. Discount each year using discount rate.
4. Calculate terminal value using terminal growth.
5. Discount terminal value back to present.
6. Sum discounted cash flows plus discounted terminal value.

Invalid if:

```ts
discountRate <= terminalGrowthRate
```

### Valuation Verdict Box

After individual valuation metrics, add:

```text
Valuation Verdict
```

Use AI synthesis function:

```ts
synthesizeValuationVerdict(valuationData)
```

Return:

```ts
export interface ValuationVerdictResult {
  overallVerdict: 'Undervalued' | 'Fair Value' | 'Overvalued';
  confidenceLevel: 'High' | 'Medium' | 'Low';
  keyReason: string;
}
```

AI should cross-reference:

- PE
- PB
- PEG
- EV/EBITDA
- dividend yield
- analyst target price
- recommendation
- DCF calculated value

Confidence:

- High: most models agree.
- Medium: mixed but leaning.
- Low: sparse/conflicting data.

## PDF Export Fix

### Problem

PDF export produced half-page/cropped output and cut chart sections across page breaks.

### Fix

In `AnalysisDashboard.tsx`:

- Export dashboard as A4 landscape.
- Capture full section width.
- Export each top-level dashboard section separately.
- Place sections one by one in the PDF.
- If a section does not fit, move it to the next page.
- Only split if a single section is taller than one page.

This prevents the Historical Performance chart from being cut in half.

## Build and Test Commands

Local development:

```bash
npm run dev
curl -sS http://127.0.0.1:3000/api/health
```

Production build:

```bash
npm run build
npm start
curl -sS http://127.0.0.1:3000/api/health
```

Expected health response:

```json
{"status":"ok","version":"v1"}
```

## Known Notes

- Current backend uses `yahoo-finance2`, not Python `yfinance`.
- If the user explicitly asks for yfinance, either add a Python service or explain that the existing Express backend already retrieves Yahoo Finance data through `yahoo-finance2`.
- API keys are currently exposed to frontend bundle through Vite `define`, because prior app design moved AI calls to frontend. This conflicts with `INSTRUCTION.md` security note saying keys should be server-side. A future hardening task should move AI calls behind Express routes.
- Chinese reports can be analyzed if text extraction works. Scanned Chinese PDFs need OCR.
- If localhost shows `ERR_CONNECTION_REFUSED`, start the server with `npm run dev` and refresh the in-app browser.

