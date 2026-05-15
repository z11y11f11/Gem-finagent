/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { AnalysisResult, CrossAnalysisResult, TickerResolution, ValuationVerdictResult } from "../types";

let geminiInstance: GoogleGenAI | null = null;
let openAIInstance: OpenAI | null = null;

function getGeminiAI() {
  if (!geminiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API key not configured");
    }
    geminiInstance = new GoogleGenAI({ apiKey });
  }
  return geminiInstance;
}

function getOpenAI() {
  if (!openAIInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }
    openAIInstance = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }
  return openAIInstance;
}

function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function isAuthError(error: any) {
  return error.message?.includes('API key') || error.message?.includes('auth') || error.message?.includes('401') || error.message?.includes('403');
}

function toJsonSchema(schema: any): any {
  const typeMap: Record<string, string> = {
    [Type.OBJECT]: "object",
    [Type.ARRAY]: "array",
    [Type.STRING]: "string",
    [Type.BOOLEAN]: "boolean",
    [Type.NUMBER]: "number"
  };

  const jsonSchema: any = {
    type: typeMap[schema.type] || schema.type
  };

  if (schema.description) {
    jsonSchema.description = schema.description;
  }
  if (schema.enum) {
    jsonSchema.enum = schema.enum;
  }
  if (schema.required) {
    jsonSchema.required = schema.required;
  }
  if (schema.properties) {
    jsonSchema.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, toJsonSchema(value)])
    );
  }
  if (schema.items) {
    jsonSchema.items = toJsonSchema(schema.items);
  }

  return jsonSchema;
}

async function generateStructuredJSON(prompt: string, responseSchema: any, schemaName: string): Promise<string> {
  if (hasGeminiKey()) {
    try {
      console.log("Using Gemini for structured analysis");
      const ai = getGeminiAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema
        }
      });

      const analysisText = response.text;
      if (!analysisText) {
        throw new Error("Empty response from Gemini");
      }
      return analysisText;
    } catch (error: any) {
      if (!hasOpenAIKey() || !isAuthError(error)) {
        throw error;
      }
      console.warn("Gemini authentication failed; falling back to OpenAI.");
    }
  }

  if (hasOpenAIKey()) {
    console.log("Using OpenAI for structured analysis");
    const openai = getOpenAI();
    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          schema: toJsonSchema(responseSchema),
          strict: false
        }
      }
    });

    const analysisText = response.output_text;
    if (!analysisText) {
      throw new Error("Empty response from OpenAI");
    }
    return analysisText;
  }

  throw new Error("API认证失败，请配置 GEMINI_API_KEY 或 OPENAI_API_KEY");
}

function isOlderThanSixMonths(reportDate?: string): boolean {
  if (!reportDate) {
    return false;
  }

  const parsedDate = new Date(reportDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return parsedDate < sixMonthsAgo;
}

export async function resolveYahooTickersWithAI(query: string): Promise<TickerResolution[]> {
  const prompt = `
    You convert investor search queries into Yahoo Finance symbols.
    The query may be a company name, index name, exchange description, or messy text.

    Return up to 5 likely Yahoo Finance symbols. Prefer primary/common listings and common indexes.
    Examples:
    - Xiaomi HKEX 1810 -> 1810.HK
    - Hang Seng Index -> ^HSI
    - S&P 500 -> ^GSPC
    - Nasdaq 100 -> ^NDX
    - FTSE 100 -> ^FTSE
    - Nikkei 225 -> ^N225
    - CSI 300 -> 000300.SS

    Query:
    ${query}
  `;

  try {
    const analysisText = await generateStructuredJSON(prompt, {
      type: Type.OBJECT,
      required: ["candidates"],
      properties: {
        candidates: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["symbol", "name", "exchange", "reason"],
            properties: {
              symbol: { type: Type.STRING },
              name: { type: Type.STRING },
              exchange: { type: Type.STRING },
              reason: { type: Type.STRING }
            }
          }
        }
      }
    }, "ticker_resolution");

    const parsed = JSON.parse(analysisText) as { candidates: TickerResolution[] };
    return (parsed.candidates || [])
      .filter(candidate => candidate.symbol)
      .map(candidate => ({
        ...candidate,
        symbol: candidate.symbol.trim().toUpperCase()
      }));
  } catch (error) {
    console.error("AI ticker resolution failed:", error);
    return [];
  }
}

export async function synthesizeValuationVerdict(valuationData: any): Promise<ValuationVerdictResult> {
  const prompt = `
    You are a valuation analyst. Synthesize the following valuation inputs into one final valuation verdict.

    Cross-reference all available models and indicators, including PE, PB, PEG, EV/EBITDA, dividend yield, analyst target price, analyst recommendation, and the calculated DCF value.
    Use the DCF value as a real mathematical output already calculated by the app from user-inputted assumptions; do not recompute it unless explaining agreement/disagreement.

    Confidence level should be:
    - High when most available models agree.
    - Medium when signals are mixed but lean one way.
    - Low when data is sparse or models conflict.

    Valuation Data:
    ${JSON.stringify(valuationData, null, 2).substring(0, 12000)}
  `;

  try {
    const analysisText = await generateStructuredJSON(prompt, {
      type: Type.OBJECT,
      required: ["overallVerdict", "confidenceLevel", "keyReason"],
      properties: {
        overallVerdict: {
          type: Type.STRING,
          enum: ["Undervalued", "Fair Value", "Overvalued"]
        },
        confidenceLevel: {
          type: Type.STRING,
          enum: ["High", "Medium", "Low"]
        },
        keyReason: { type: Type.STRING }
      }
    }, "valuation_verdict");

    return JSON.parse(analysisText) as ValuationVerdictResult;
  } catch (error) {
    console.error("AI valuation verdict failed:", error);
    return {
      overallVerdict: "Fair Value",
      confidenceLevel: "Low",
      keyReason: "Valuation verdict could not be synthesized because AI valuation analysis was unavailable."
    };
  }
}

export async function analyzeMarketData(ticker: string, marketData: any, options: string[] = ['highlights', 'risks', 'esg', 'competitors']): Promise<AnalysisResult> {
  console.log("Starting AI analysis for market data:", ticker, "Options:", options);

  let requestedSections = "Extract the company name, ticker, and a general summary.";
  const schemaProperties: any = {
    company: {
      type: Type.OBJECT,
      required: ["name", "ticker"],
      properties: {
        name: { type: Type.STRING },
        ticker: { type: Type.STRING }
      }
    },
    summary: { type: Type.STRING },
    sentiment: { 
      type: Type.STRING,
      enum: ["Positive", "Neutral", "Negative"]
    },
    metrics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["label", "value", "trend"],
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.STRING },
          trend: { type: Type.STRING, enum: ["up", "down", "flat"] }
        }
      }
    }
  };
  
  const requiredFields = ["company", "summary", "sentiment", "metrics"];

  if (options.includes('highlights')) {
    requestedSections += " Include investment highlights.";
    schemaProperties.highlights = { type: Type.ARRAY, items: { type: Type.STRING } };
    requiredFields.push("highlights");
  }
  if (options.includes('risks')) {
    requestedSections += " Include strategic risks.";
    schemaProperties.risks = { type: Type.ARRAY, items: { type: Type.STRING } };
    requiredFields.push("risks");
  }
  if (options.includes('esg')) {
    requestedSections += " Include an ESG (Environmental, Social, Governance) summary.";
    schemaProperties.esgSummary = { type: Type.STRING };
    requiredFields.push("esgSummary");
  }
  if (options.includes('competitors')) {
    requestedSections += " Identify 3-5 direct publicly traded competitor companies from the report text. Extract Yahoo Finance-compatible ticker symbols whenever available; do not leave ticker empty for public companies.";
    schemaProperties.competitors = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["name", "ticker", "rationale"],
        properties: {
          name: { type: Type.STRING },
          ticker: { type: Type.STRING, description: "Yahoo Finance-compatible ticker symbol, e.g. AAPL, 1810.HK, 005930.KS" },
          rationale: { type: Type.STRING, description: "Why they are a competitor" }
        }
      }
    };
    requiredFields.push("competitors");
  }

  const prompt = `
    You are an expert financial analyst. Analyze the following market data and provide a structured analysis.
    ${requestedSections}
    
    Market Data for ${ticker}:
    ${JSON.stringify(marketData, null, 2).substring(0, 40000)}

    IMPORTANT: Add the following disclaimer to the end of the 'summary' field (as a separate paragraph, keep the structure identical to the PDF response): "Analysis based on market data only — upload annual report for deeper insights."
  `;

  try {
    const analysisText = await generateStructuredJSON(prompt, {
      type: Type.OBJECT,
      required: requiredFields,
      properties: schemaProperties
    }, "market_analysis");

    try {
      const parsed = JSON.parse(analysisText) as AnalysisResult;
      // Guarantee the disclaimer is there
      if (!parsed.summary.includes("Analysis based on market data only")) {
        parsed.summary += "\n\nAnalysis based on market data only — upload annual report for deeper insights.";
      }
      return parsed;
    } catch (err) {
      console.error("Failed to parse Gemini response as JSON:", analysisText);
      throw new Error("Invalid response format from AI");
    }
  } catch (error: any) {
    console.error("AI analysis failed:", error);
    if (isAuthError(error)) {
      throw new Error("API认证失败，请检查 Gemini 或 OpenAI API key 是否正确配置");
    }
    throw error;
  }
}

export async function analyzeFinancialText(text: string, options: string[] = ['highlights', 'risks', 'esg', 'competitors']): Promise<AnalysisResult> {
  console.log("Starting AI analysis for text length:", text.length, "Options:", options);

  let requestedSections = "Extract the company name, ticker, the report period date, and a general summary. Return reportDate as an ISO date string (YYYY-MM-DD) using the report period end date when available, or an empty string if no report period date is identifiable.";
  const schemaProperties: any = {
    company: {
      type: Type.OBJECT,
      required: ["name", "ticker"],
      properties: {
        name: { type: Type.STRING },
        ticker: { type: Type.STRING }
      }
    },
    summary: { type: Type.STRING },
    reportDate: { type: Type.STRING },
    sentiment: { 
      type: Type.STRING,
      enum: ["Positive", "Neutral", "Negative"]
    },
    metrics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["label", "value", "trend"],
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.STRING },
          trend: { type: Type.STRING, enum: ["up", "down", "flat"] }
        }
      }
    }
  };
  
  const requiredFields = ["company", "summary", "reportDate", "sentiment", "metrics"];

  if (options.includes('highlights')) {
    requestedSections += " Include investment highlights.";
    schemaProperties.highlights = { type: Type.ARRAY, items: { type: Type.STRING } };
    requiredFields.push("highlights");
  }
  if (options.includes('risks')) {
    requestedSections += " Include strategic risks.";
    schemaProperties.risks = { type: Type.ARRAY, items: { type: Type.STRING } };
    requiredFields.push("risks");
  }
  if (options.includes('esg')) {
    requestedSections += " Include an ESG (Environmental, Social, Governance) summary.";
    schemaProperties.esgSummary = { type: Type.STRING };
    requiredFields.push("esgSummary");
  }
  if (options.includes('competitors')) {
    requestedSections += " Identify main competitors (extract their names and if possible, tickers).";
    schemaProperties.competitors = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["name", "rationale"],
        properties: {
          name: { type: Type.STRING },
          ticker: { type: Type.STRING, description: "Ticker symbol if available, otherwise empty string" },
          rationale: { type: Type.STRING, description: "Why they are a competitor" }
        }
      }
    };
    requiredFields.push("competitors");
  }

  const prompt = `
    You are an expert financial analyst. Analyze the following financial report text and provide a structured analysis.
    ${requestedSections}
    
    Report Text:
    ${text.substring(0, 40000)}
  `;

  try {
    const analysisText = await generateStructuredJSON(prompt, {
      type: Type.OBJECT,
      required: requiredFields,
      properties: schemaProperties
    }, "financial_report_analysis");

    try {
      const parsed = JSON.parse(analysisText) as AnalysisResult;
      parsed.isHistorical = isOlderThanSixMonths(parsed.reportDate);
      return parsed;
    } catch (err) {
      console.error("Failed to parse Gemini response as JSON:", analysisText);
      throw new Error("Invalid response format from AI");
    }
  } catch (error: any) {
    console.error("AI analysis failed:", error);
    if (isAuthError(error)) {
      throw new Error("API认证失败，请检查 Gemini 或 OpenAI API key 是否正确配置");
    }
    throw error;
  }
}

export async function crossAnalyze(reportAnalysis: AnalysisResult, marketData: any): Promise<CrossAnalysisResult> {
  console.log("Starting AI cross-analysis for:", reportAnalysis.company?.ticker || marketData.company?.ticker);

  const prompt = `
    You are an expert financial analyst. Compare the financial report analysis with the current market/stock analysis.

    Return:
    1. An alignmentScore from 0 to 100, where 100 means reported fundamentals strongly align with current stock performance.
    2. Whether the reported financials align with current stock performance.
    3. Specific divergence signals, for example profit growing while the stock is falling, margin pressure despite positive sentiment, or strong reported results with weak analyst/market signals.
    4. A one-sentence investment verdict combining both data sources.

    Financial Report Analysis:
    ${JSON.stringify(reportAnalysis, null, 2).substring(0, 20000)}

    Current Market/Stock Analysis:
    ${JSON.stringify(marketData, null, 2).substring(0, 20000)}
  `;

  try {
    const analysisText = await generateStructuredJSON(prompt, {
      type: Type.OBJECT,
      required: [
        "alignmentScore",
        "financialsAlignWithStockPerformance",
        "alignmentSummary",
        "divergenceSignals",
        "investmentVerdict"
      ],
      properties: {
        alignmentScore: { type: Type.NUMBER },
        financialsAlignWithStockPerformance: { type: Type.BOOLEAN },
        alignmentSummary: { type: Type.STRING },
        divergenceSignals: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        investmentVerdict: { type: Type.STRING }
      }
    }, "cross_analysis");

    try {
      return JSON.parse(analysisText) as CrossAnalysisResult;
    } catch (err) {
      console.error("Failed to parse Gemini response as JSON:", analysisText);
      throw new Error("Invalid response format from AI");
    }
  } catch (error: any) {
    console.error("AI cross-analysis failed:", error);
    if (isAuthError(error)) {
      throw new Error("API认证失败，请检查 Gemini 或 OpenAI API key 是否正确配置");
    }
    throw error;
  }
}
