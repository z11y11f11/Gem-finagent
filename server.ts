import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfExtract = require("pdf-extraction");

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import YahooFinance from "yahoo-finance2";
import dotenv from "dotenv";
import OpenAI from "openai";

const yahooFinance = new YahooFinance();

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3030;
let openAIProxyInstance: OpenAI | null = null;

function getOpenAIProxy() {
  if (!openAIProxyInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }
    openAIProxyInstance = new OpenAI({
      apiKey,
      baseURL: process.env.LOBSTER_TRAP_URL || undefined,
    });
  }
  return openAIProxyInstance;
}

// Setup Multer for PDF uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  app.use(cors());
  app.use(express.json());

  // API Route: Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: "v1" });
  });

  // API Route: Server-side OpenAI-compatible structured generation.
  // This avoids browser CORS issues when routing through Lobster Trap.
  app.post("/api/ai/structured", async (req, res) => {
    try {
      const { prompt, schemaName, schema } = req.body || {};
      if (!prompt || !schemaName || !schema) {
        return res.status(400).json({ error: "Missing prompt, schemaName, or schema" });
      }

      console.log(process.env.LOBSTER_TRAP_URL ? "Server routing OpenAI via Lobster Trap" : "Server routing OpenAI directly");
      const openai = getOpenAIProxy();
      const response = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            schema,
            strict: false
          }
        }
      });

      const outputText = response.choices[0]?.message?.content;
      if (!outputText) {
        return res.status(502).json({ error: "Empty response from OpenAI-compatible provider" });
      }
      res.json({ outputText });
    } catch (error: any) {
      console.error("AI structured generation failed:", error);
      res.status(500).json({ error: "AI structured generation failed", message: error.message });
    }
  });

  // API Route: Stock Price
  app.get("/api/stock/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const quote = await yahooFinance.quote(symbol);
      if (!quote) {
        return res.status(404).json({ error: "Quote not found" });
      }
      res.json(quote);
    } catch (error) {
      console.error("Stock fetch error:", error);
      res.status(500).json({ error: "Failed to fetch stock data" });
    }
  });

  // API Route: Stock History (1 year)
  app.get("/api/stock/:symbol/history", async (req, res) => {
    try {
      const { symbol } = req.params;
      const to = new Date();
      const from = new Date();
      from.setFullYear(from.getFullYear() - 1); // Fetch 1 year for MA200 calculation

      const result = await yahooFinance.chart(symbol, {
        period1: from,
        period2: to,
        interval: '1d' as any,
      });
      res.json(result.quotes);
    } catch (error: any) {
      console.error("Historical fetch error:", error);
      if (error.message?.includes('No data found') || error.message?.includes('delisted')) {
        return res.status(404).json({ error: "No historical data found, symbol may be delisted" });
      }
      res.status(500).json({ error: "Failed to fetch historical data" });
    }
  });

  // API Route: Stock Summary (Financials, Statistics, & Analyst Recommendations)
  app.get("/api/stock/:symbol/summary", async (req, res) => {
    try {
      const { symbol } = req.params;
      const result = await yahooFinance.quoteSummary(symbol, {
        modules: [
          "defaultKeyStatistics",
          "financialData",
          "summaryDetail",
          "price",
          "recommendationTrend",
          "calendarEvents"
        ]
      });
      res.json(result);
    } catch (error: any) {
      if (error.message?.includes('Quote not found')) {
        return res.status(404).json({ error: "Quote summary not found" });
      }
      console.error("Summary fetch error:", error);
      res.status(500).json({ error: "Failed to fetch stock summary" });
    }
  });

  // API Route: Search Symbol
  app.get("/api/search/:query", async (req, res) => {
    try {
      const { query } = req.params;
      const searchRes = await yahooFinance.search(query, {
        quotesCount: 5,
        newsCount: 0,
      });
      res.json(searchRes);
    } catch (error: any) {
      if (error.name === 'BadRequestError' || error.message?.includes('Invalid Search Query')) {
        return res.json({ quotes: [] });
      }
      console.error("Search fetch error:", error);
      res.status(500).json({ error: "Failed to search symbol", details: error.message });
    }
  });

  // API Route: Extract Text from PDF
  app.post("/api/extract", (req, res, next) => {
    console.log("POST /api/extract hit");
    next();
  }, upload.single("report"), async (req, res) => {
    console.log("Multer finished parsing for /api/extract");
    try {
      if (!req.file) {
        console.error("No file in request to /api/extract");
        return res.status(400).json({ error: "No report file uploaded" });
      }

      console.log("Extracting text from PDF, size:", req.file.size, "mimetype:", req.file.mimetype);
      
      const pdfData = await pdfExtract(req.file.buffer);
      const text = pdfData.text;

      if (!text || text.trim().length === 0) {
        console.warn("Extraction yielded empty text");
        return res.status(422).json({ error: "Could not extract text from PDF. It might be empty or an image-based PDF." });
      }

      console.log("Extraction successful, text length:", text.length);
      res.json({ text });
    } catch (error: any) {
      console.error("Extraction error details:", error);
      res.status(500).json({ error: "Failed to extract text: " + error.message });
    }
  });

  // Ensure all undefined /api/* routes return JSON 404 instead of falling through to Vite/Index
  app.all("/api/*", (req, res) => {
    console.warn(`404 for API route: ${req.method} ${req.url}`);
    res.status(404).json({ 
      error: `API route not found: ${req.method} ${req.url}`,
      suggestion: "If this route should exist, please check the backend routing table." 
    });
  });

  // Global error handler for API routes to always return JSON
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api/')) {
      console.error("Global API Error:", err);
      return res.status(500).json({ 
        error: "Internal Server Error", 
        message: err.message || "An unexpected error occurred." 
      });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`fintech server running at http://localhost:${PORT}`);
  });
}

startServer();
