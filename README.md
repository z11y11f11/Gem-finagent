# FinAgent — AI-Powered Investment Analysis Agent

> Autonomous financial analysis powered by Gemini multimodal AI, OpenAI fallback routing, real-time market data, and Lobster Trap monitoring.

## Live Demo

**Application:** http://45.76.31.199:3030  
**Security Dashboard:** http://45.76.31.199:8080/_lobstertrap/

---

## What It Does

FinAgent is an autonomous AI agent for investment professionals. Upload a financial report (PDF) and enter a stock ticker. The app analyzes the document, fetches real-time market data, runs valuation models, compares peers, and generates a structured investment report.

**Built for:** VC/PE firms, fund managers, and investment analysts who need to evaluate companies quickly without a dedicated research team.

---

## Key Features

- **Multimodal PDF Analysis** — Upload annual reports or ESG documents; Gemini reads text, tables, and charts natively.
- **Real-Time Market Data** — Live stock price, moving averages (MA20/50/200), 52-week range, and valuation metrics via Yahoo Finance.
- **Valuation Models** — PE/PB/PEG, EV/EBITDA, DCF calculator with user-inputted assumptions, and dividend model.
- **Wall Street Consensus** — Analyst ratings, target price range, and number of opinions.
- **Peer Comparison** — Auto-identifies 3-5 competitors and fetches market data for side-by-side comparison.
- **Cross Analysis** — Synthesizes divergence signals between reported fundamentals and current stock performance.
- **30-Second Summary** — Shows financial health, valuation verdict, and one-line investment call at the top of the dashboard.
- **ESG Analysis** — Extracts ESG ratings and sustainability commitments from reports.
- **Lobster Trap Monitoring** — OpenAI fallback calls can route through Lobster Trap for prompt inspection and audit visibility.
- **PDF Export** — Export selected expanded sections as a PDF report.

---

## Agent Architecture

```text
User Input (PDF + Ticker)
        |
        v
FinAgent UI (React + TypeScript)
        |
        v
Express Backend (PDF parsing, market data, AI gateway)
        |
        +--> Gemini API (multimodal document understanding)
        |
        +--> Yahoo Finance (real-time market data)
        |
        +--> Optional Lobster Trap -> OpenAI fallback
        |
        v
Structured Output (30-sec summary / Core analysis / Full report)
```

---

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React + TypeScript + Tailwind |
| Backend | Express + Node.js |
| AI Core | Gemini API, OpenAI fallback |
| Market Data | yahoo-finance2 |
| Security Layer | Lobster Trap proxy for OpenAI-compatible calls |
| Deployment | Vultr Cloud Compute |
| PDF Export | jsPDF + html2canvas |

---

## Lobster Trap Monitoring

When `LOBSTER_TRAP_URL` is configured, FinAgent routes OpenAI fallback calls through a local OpenAI-compatible Lobster Trap proxy:

```text
Browser -> /api/ai/structured -> Express backend -> LOBSTER_TRAP_URL -> OpenAI-compatible chat completions
```

Lobster Trap can then inspect prompts, show live request logs, and provide audit visibility.

Dashboard path:

```text
http://localhost:8080/_lobstertrap/
```

Cloud dashboard example:

```text
http://45.76.31.199:8080/_lobstertrap/
```

---

## Setup & Run

```bash
# Clone the repo
git clone https://github.com/z11y11f11/Gem-finagent.git
cd Gem-finagent

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Add GEMINI_API_KEY and/or OPENAI_API_KEY

# Optional: enable Lobster Trap for OpenAI-compatible calls
# Start Lobster Trap separately, then add:
# LOBSTER_TRAP_URL=http://localhost:8080/v1

# Run development server
npm run dev

# Local app:
# http://localhost:3030

# Build and run production
npm run build
npm start
```

---

## Production Notes

The server build must stay ESM because `server.ts` uses `import.meta.url`.

Use:

```bash
npm run build
npm start
```

For PM2, start through `npm start`:

```bash
pm2 start npm --name finagent -- start
```

Do not point PM2 at `server.ts` or `dist/server.cjs`.

---

## Hackathon

Built for **TechEx North America AI Hackathon 2026**  
Track: AI Agents with Google AI Studio  
Powered by: Gemini API + Vultr + Lobster Trap
