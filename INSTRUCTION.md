# FinAgent - AI Investment Assistant

FinAgent is a specialized AI agent designed for investment professionals to streamline the analysis of financial reports and ESG (Environmental, Social, and Governance) documents. It leverages Gemini's long-context capabilities to extract insights and combines them with real-time market data.

## Project Vision

### V1: Core Analysis Engine (Active)
- **PDF Processing**: Upload and parse financial report PDFs.
- **AI Intelligence**: Gemini-powered extraction of key metrics, risks, and highlights.
- **Market Integration**: Real-time stock price retrieval.
- **UI/UX**: Clean, professional dashboard with interactive charts and structured analysis.

### V2: Security & Monitoring
- **Lobster Trap Integration**: Interceptor layer between the agent and Gemini.
- **Sensitive Data Detection**: Protection against PII leaks and prompt injections.
- **Audit Dashboard**: Monitoring flagged interactions and security metrics.

### V3: Institutional Knowledge Base
- **Vector Storage**: Persist reports in a vector database.
- **Cross-Report Querying**: Ask questions across historical data (e.g., "Compare ESG trends across the tech sector").

## Tech Stack
- **Frontend**: React 18+ (Vite), Tailwind CSS, Recharts, Lucide Icons, Framer Motion.
- **Backend**: Express (Node.js), `yahoo-finance2` (Market Data), `pdf-extraction` (PDF Processing).
- **AI**: Google Gemini API (`@google/genai`).

## Project Principles
- **Modular Design**: One file, one job.
- **Error Handling**: No silent failures; always provide user feedback.
- **Security**: API keys are strictly server-side.
- **Auditability**: Maintain a detailed changelog in this file.

## Permanent Build Rule: Server Must Stay ESM

`server.ts` uses ESM-only metadata through `import.meta.url`:

```ts
const require = createRequire(import.meta.url);
```

Do **not** bundle the Express server as CommonJS. CJS output makes `import.meta` unavailable/empty, which can turn `createRequire(import.meta.url)` into `createRequire(undefined)` and cause this production error:

```text
TypeError [ERR_INVALID_ARG_VALUE]: The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received undefined
```

The production server build must remain:

```json
"build": "vite build && esbuild server.ts --bundle --platform=node --format=esm --packages=external --sourcemap --outfile=dist/server.mjs",
"start": "NODE_ENV=production node dist/server.mjs"
```

If PM2 is used, start the app through `npm start` or `dist/server.mjs`; never point PM2 at `server.ts` or `dist/server.cjs`.

## Lobster Trap Integration Notes

Final working architecture:

```text
Browser -> /api/ai/structured -> Express backend -> LOBSTER_TRAP_URL -> OpenAI-compatible chat completions
```

The first attempt routed browser-side OpenAI SDK requests directly to `http://localhost:8080/v1`. That did not show in Lobster Trap reliably because browser CORS/preflight can block or hide the request path, and the app could silently fall back to Gemini.

The second attempt used the backend gateway but called the OpenAI Responses API (`/v1/responses`). The request returned successfully, but Lobster Trap statistics still did not update because its dashboard/prompt inspection path tracks chat-completions-style traffic more reliably.

The final successful fix is:

- Frontend AI code calls local `/api/ai/structured` when `LOBSTER_TRAP_URL` is set.
- Express handles that route server-side, so there is no browser CORS issue.
- Express sends the prompt to `openai.chat.completions.create(...)`.
- The OpenAI client uses `baseURL: process.env.LOBSTER_TRAP_URL`.
- This sends traffic to `/v1/chat/completions`, which Lobster Trap records in Live Feed and Statistics.

To verify:

1. Set `.env`:

```env
OPENAI_API_KEY="..."
LOBSTER_TRAP_URL="http://localhost:8080/v1"
```

2. Start Lobster Trap and open:

```text
http://localhost:8080/_lobstertrap/
```

3. Start this app and trigger any AI analysis.
4. The server log should show:

```text
Server routing OpenAI via Lobster Trap
```

5. Lobster Trap Live Feed / Statistics should update in real time.

## File Structure (Planned)
- `/src/components`: UI components (Charts, Analysis Views, Uploaders).
- `/src/services`: Client-side service implementations.
- `/src/types`: TypeScript interfaces and enums.
- `server.ts`: Express backend entry point.
- `lib/`: Shared utilities.

## Changelog

| Date | Change | Why |
| :--- | :--- | :--- |
| 2026-05-14 | Initial Project Initialization | Establishing `INSTRUCTION.md`, project vision, and metadata. |
| 2026-05-14 | Full-stack Infrastructure & Backend | Implemented `server.ts` with PDF parsing, Gemini analysis, and Market Data APIs. |
| 2026-05-14 | V1 Frontend Completion | Developed Dashboard, Uploader, and integrated state management for a complete V1 UX. |
| 2026-05-14 | Bug Fix: PDF Parsing | Fixed `TypeError: pdf is not a function` by handling default exports in `server.ts`. |
| 2026-05-14 | AI Migration to Frontend | Moved Gemini logic to frontend per system guidelines; backend now solely handles data extraction and market APIs. |
| 2026-05-14 | Stability & Error Parsing | Fixed Gemini SDK integration (responseSchema) and improved frontend error handling for non-JSON responses. |
| 2026-05-14 | Bug Fix: PDF Parser | Replaced `pdf-parse` with `pdf-extraction` and resolved 'new' keyword constructor errors. |
| 2026-05-14 | Resilience: Platform Auth | Implemented detection for "Cookie check" intercepts with corrective guidance for users. |
| 2026-05-14 | Stability Improvements | Added backend API catch-alls and improved overall error resilience. |
| 2026-05-15 | Peer Comparison & Cross Analysis | Added competitor market comparison with industry averages and a cross-source investment signal section to combine report fundamentals with real-time market data. |
| 2026-05-15 | Valuation Verdict Synthesis | Added an AI-synthesized valuation verdict box that cross-references valuation multiples, analyst targets, dividends, and the mathematically calculated DCF model. |
| 2026-05-16 | Production Server Build Fix | Switched the server build output to ESM and made `npm start` run in production mode so `import.meta.url` remains valid and the built server does not start Vite middleware. |
| 2026-05-18 | Permanent ESM Server Build Rule | Documented that the Express server must always build as ESM to preserve `import.meta.url` and avoid recurring `createRequire(undefined)` production failures. |
| 2026-05-18 | Lobster Trap Proxy Support | Added optional `LOBSTER_TRAP_URL` support and a server-side OpenAI-compatible gateway so Lobster Trap can inspect LLM calls without browser CORS blocking. |
