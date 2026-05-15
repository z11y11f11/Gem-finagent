/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, TrendingDown, Minus, 
  AlertTriangle, CheckCircle2, FileText, 
  BarChart3, RefreshCcw, DollarSign,
  ChevronDown, Maximize2, Minimize2, Activity,
  PieChart, Sprout, Target, Download, GitCompareArrows
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { AnalysisResult, CrossAnalysisResult, StockData, HistoricalBar, ValuationSummary } from '../types';
import { ValuationModels } from './ValuationModels';
import { PeerComparison } from './PeerComparison';
import { isLikelyResolvedYahooTicker, normalizeYahooTicker } from '../utils/ticker';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

interface DashboardProps {
  data: AnalysisResult;
  onReset: () => void;
  onError?: (msg: string) => void;
}

export default function AnalysisDashboard({ data, onReset, onError }: DashboardProps) {
  const [stock, setStock] = useState<StockData | null>(null);
  const [history, setHistory] = useState<HistoricalBar[]>([]);
  const [summary, setSummary] = useState<ValuationSummary | null>(null);
  const [resolvedTicker, setResolvedTicker] = useState<string>('');
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [crossAnalysis, setCrossAnalysis] = useState<CrossAnalysisResult | null>(null);
  const [loadingCrossAnalysis, setLoadingCrossAnalysis] = useState(false);

  const [sections, setSections] = useState({
    metrics: true,
    history: true,
    valuation: false,
    summary: true,
    crossAnalysis: true,
    insights: true,
    esg: true,
    competitors: false
  });

  const dashboardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportPDF = async (exportAll = false) => {
    if (!dashboardRef.current) return;
    setIsExporting(true);

    let originalState = { ...sections };
    if (exportAll) {
      setAllSections(true);
      // Wait for React to render expanded sections
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      const element = dashboardRef.current;
      const captureWidth = Math.max(element.scrollWidth, element.offsetWidth, 1152);
      const sectionsToExport = Array.from(element.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.offsetHeight > 0
      );

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const margin = 8;
      const blockGap = 6;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pdfWidth = pageWidth - margin * 2;
      const pageContentHeight = pageHeight - margin * 2;
      let cursorY = margin;

      for (const section of sectionsToExport) {
        const sectionHeight = Math.max(section.scrollHeight, section.offsetHeight);
        const imgData = await toPng(section, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          width: captureWidth,
          height: sectionHeight,
          style: {
            width: `${captureWidth}px`,
            maxWidth: 'none',
            transform: 'none',
          },
          skipFonts: true,
        });

        const imgProps = pdf.getImageProperties(imgData);
        const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

        if (cursorY > margin && cursorY + imgHeight > pageHeight - margin) {
          pdf.addPage();
          cursorY = margin;
        }

        if (imgHeight <= pageContentHeight) {
          pdf.addImage(imgData, 'PNG', margin, cursorY, pdfWidth, imgHeight);
          cursorY += imgHeight + blockGap;
          continue;
        }

        let renderedHeight = 0;
        while (renderedHeight < imgHeight) {
          if (renderedHeight > 0) {
            pdf.addPage();
          }

          pdf.addImage(
            imgData,
            'PNG',
            margin,
            margin - renderedHeight,
            pdfWidth,
            imgHeight
          );
          renderedHeight += pageContentHeight;
        }
        cursorY = margin + (imgHeight % pageContentHeight) + blockGap;
        if (cursorY > pageHeight - margin) {
          pdf.addPage();
          cursorY = margin;
        }
      }

      pdf.save(`${data.company.ticker || 'Analysis'}_Report.pdf`);
    } catch (err) {
      console.error("PDF Export failed", err);
      onError?.("Failed to generate PDF report.");
    } finally {
      if (exportAll) {
        setSections(originalState);
      }
      setIsExporting(false);
    }
  };

  const toggleSection = (key: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllSections = (isOpen: boolean) => {
    setSections({
      metrics: isOpen,
      history: isOpen,
      valuation: isOpen,
      summary: isOpen,
      crossAnalysis: isOpen,
      insights: isOpen,
      esg: isOpen,
      competitors: isOpen
    });
  };

  const allExpanded = Object.values(sections).every(Boolean);

  const firstUsableSummaryTicker = async (symbols: string[]) => {
    for (const symbol of symbols) {
      const normalized = normalizeYahooTicker(symbol);
      if (!normalized) {
        continue;
      }

      const response = await fetch(`/api/stock/${encodeURIComponent(normalized)}/summary`);
      if (response.ok) {
        return normalized;
      }
    }

    return '';
  };

  useEffect(() => {
    const resolveAndFetch = async () => {
      if (!data.company.ticker) return;
      
      let finalTicker = normalizeYahooTicker(data.company.ticker);
      let searchFailed = false;
      
      try {
        const searchRes = await fetch(`/api/search/${encodeURIComponent(finalTicker)}`);
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.quotes && searchData.quotes.length > 0) {
             finalTicker = normalizeYahooTicker(searchData.quotes[0].symbol || finalTicker);
          }
        } else {
          searchFailed = true;
        }
      } catch (e) {
        console.warn("Search resolution failed, falling back to original ticker", e);
        searchFailed = true;
      }
      
      finalTicker = normalizeYahooTicker(finalTicker);
      if (!isLikelyResolvedYahooTicker(finalTicker) || searchFailed) {
        const { resolveYahooTickersWithAI } = await import('../services/ai');
        const aiCandidates = await resolveYahooTickersWithAI(data.company.ticker);
        const aiTicker = await firstUsableSummaryTicker(aiCandidates.map(candidate => candidate.symbol));
        if (aiTicker) {
          finalTicker = aiTicker;
        }
      }

      setResolvedTicker(finalTicker);
      await Promise.allSettled([
        fetchStock(finalTicker),
        fetchHistory(finalTicker),
        fetchSummary(finalTicker)
      ]);
    };

    resolveAndFetch();
  }, [data.company.ticker]);

  useEffect(() => {
    if (!stock || !summary || !resolvedTicker) {
      return;
    }

    const runCrossAnalysis = async () => {
      setLoadingCrossAnalysis(true);
      try {
        const { crossAnalyze } = await import('../services/ai');
        const result = await crossAnalyze(data, {
          company: {
            name: stock.longName || data.company.name,
            ticker: resolvedTicker
          },
          stock,
          valuation: summary,
          latestTechnical: history.length > 0 ? history[history.length - 1] : null
        });
        setCrossAnalysis(result);
      } catch (err: any) {
        console.error('Cross analysis failed', err);
        onError?.(err.message || 'Failed to generate cross analysis');
      } finally {
        setLoadingCrossAnalysis(false);
      }
    };

    runCrossAnalysis();
  }, [data, history, onError, resolvedTicker, stock, summary]);

  const fetchSummary = async (ticker: string) => {
    setLoadingSummary(true);
    try {
      const response = await fetch(`/api/stock/${encodeURIComponent(ticker)}/summary`);
      if (!response.ok) {
        const text = await response.text();
        if (text.includes('Cookie check') || text.includes('goog-auth')) {
          onError?.('Preview environment interrupted the request. Please click "Open in New Tab" at the top right to verify your identity.');
        } else {
          console.warn(`Failed to fetch summary: ${response.status} ${text}`);
        }
        return;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const raw = await response.json();

        const stats = raw.defaultKeyStatistics || {};
        const financial = raw.financialData || {};
        const detail = raw.summaryDetail || {};

        setSummary({
          trailingPE: detail.trailingPE || stats.trailingPE,
          forwardPE: detail.forwardPE || stats.forwardPE,
          priceToBook: stats.priceToBook,
          pegRatio: stats.pegRatio,
          enterpriseToEbitda: stats.enterpriseToEbitda,
          dividendYield: detail.dividendYield,
          payoutRatio: stats.payoutRatio,
          ebitdaMargins: financial.ebitdaMargins,
          returnOnEquity: financial.returnOnEquity,
          revenueGrowth: financial.revenueGrowth,
          recommendationKey: financial.recommendationKey,
          targetMeanPrice: financial.targetMeanPrice,
          targetHighPrice: financial.targetHighPrice,
          targetLowPrice: financial.targetLowPrice,
          numberOfAnalystOpinions: financial.numberOfAnalystOpinions,
          recommendationTrend: raw.recommendationTrend?.trend || [],
        });
      } else {
        const text = await response.text();
        if (text.includes('Cookie check') || text.includes('goog-auth')) {
          onError?.('Preview environment interrupted the request. Please click "Open in New Tab" at the top right to verify your identity.');
        }
      }
    } catch (err) {
      console.error('Failed to fetch summary', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const fetchHistory = async (ticker: string) => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/stock/${encodeURIComponent(ticker)}/history`);
      if (!response.ok) {
        const text = await response.text();
        if (text.includes('Cookie check') || text.includes('goog-auth')) {
          onError?.('Preview environment interrupted the request. Please click "Open in New Tab" at the top right to verify your identity.');
        } else {
          console.warn(`Failed to fetch history: ${response.status} ${text}`);
          onError?.(`Failed to fetch historical data for ${ticker}. Symbol may be invalid or delisted.`);
        }
        return;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const rawData: any[] = await response.json();
        
        // Data usually comes sorted by date, but let's be sure
        const sorted = rawData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // Map and calculate MAs
        const calculateMA = (data: any[], index: number, period: number) => {
          if (index < period - 1) return undefined;
          let sum = 0;
          let count = 0;
          for (let i = 0; i < period; i++) {
            const closeVal = data[index - i]?.close;
            if (closeVal != null) {
              sum += closeVal;
              count++;
            }
          }
          return count === period ? parseFloat((sum / period).toFixed(2)) : undefined;
        };

        const processed = sorted.map((d, i, arr) => {
          const closeVal = d.close != null ? parseFloat(d.close.toFixed(2)) : null;
          return {
            date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            fullDate: new Date(d.date).toLocaleDateString(),
            close: closeVal,
            ma20: calculateMA(arr, i, 20),
            ma50: calculateMA(arr, i, 50),
            ma200: calculateMA(arr, i, 200),
          };
        }).filter(d => d.close !== null); // remove purely null days from rendering

        // Filter last 250 days for display but we needed the full year for MA calculations
        setHistory(processed.slice(-250) as any);
      } else {
        const text = await response.text();
        if (text.includes('Cookie check') || text.includes('goog-auth')) {
          onError?.('Preview environment interrupted the request. Please click "Open in New Tab" at the top right to verify your identity.');
        }
      }
    } catch (err) {
      console.error('Failed to fetch history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchStock = async (ticker: string) => {
    setLoadingStock(true);
    try {
      const response = await fetch(`/api/stock/${encodeURIComponent(ticker)}`);
      if (!response.ok) {
        const text = await response.text();
        if (text.includes('Cookie check') || text.includes('goog-auth')) {
          onError?.('Preview environment interrupted the request. Please click "Open in New Tab" at the top right to verify your identity.');
        } else {
          console.warn(`Failed to fetch stock: ${response.status} ${text}`);
          onError?.(`Failed to fetch stock quote for ${ticker}. Symbol may be invalid.`);
        }
        return;
      }
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const quote = await response.json();
        setStock(quote);
      } else {
        const text = await response.text();
        if (text.includes('Cookie check') || text.includes('goog-auth')) {
          onError?.('Preview environment interrupted the request. Please click "Open in New Tab" at the top right to verify your identity.');
        }
      }
    } catch (err) {
      console.error('Failed to fetch stock', err);
    } finally {
      setLoadingStock(false);
    }
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment.toLowerCase()) {
      case 'positive': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'negative': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getSignalColor = (signal: string) => {
    const lower = signal.toLowerCase();
    if (lower.includes('fall') || lower.includes('declin') || lower.includes('risk') || lower.includes('weak') || lower.includes('pressure') || lower.includes('negative')) {
      return 'bg-rose-50 text-rose-700 border-rose-100';
    }
    if (lower.includes('grow') || lower.includes('strong') || lower.includes('positive') || lower.includes('improv') || lower.includes('upside')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    }
    return 'bg-slate-50 text-slate-700 border-slate-100';
  };

  const businessDescription = (() => {
    const firstSentence = data.summary.split(/(?<=[.!?。！？])\s+/)[0]?.trim();
    if (!firstSentence) return 'Business description pending from report analysis.';
    return firstSentence.length > 180 ? `${firstSentence.slice(0, 177)}...` : firstSentence;
  })();

  const financialHealth = (() => {
    const growth = summary?.revenueGrowth ?? 0;
    const roe = summary?.returnOnEquity ?? 0;
    const margin = summary?.ebitdaMargins ?? 0;
    if (data.sentiment === 'Positive' && (growth > 0.05 || roe > 0.1 || margin > 0.12)) {
      return { label: 'Green', className: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
    }
    if (data.sentiment === 'Negative' || growth < -0.02 || roe < 0 || margin < 0) {
      return { label: 'Red', className: 'bg-rose-100 text-rose-700 border-rose-200', dot: 'bg-rose-500' };
    }
    return { label: 'Yellow', className: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
  })();

  const valuationVerdict = (() => {
    const price = stock?.regularMarketPrice;
    const target = summary?.targetMeanPrice;
    if (price && target) {
      const upside = (target - price) / price;
      if (upside > 0.15) return 'Undervalued';
      if (upside < -0.15) return 'Overvalued';
      return 'Fair';
    }
    if ((summary?.pegRatio && summary.pegRatio < 1) || (summary?.trailingPE && summary.trailingPE < 15)) return 'Undervalued';
    if ((summary?.pegRatio && summary.pegRatio > 2) || (summary?.trailingPE && summary.trailingPE > 35)) return 'Overvalued';
    return 'Fair';
  })();

  return (
    <motion.div 
      ref={dashboardRef}
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-6xl mx-auto pb-20"
    >
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-200">
            {data.company.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">
              {data.company.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono font-bold tracking-wider">
                {resolvedTicker || data.company.ticker}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getSentimentColor(data.sentiment)}`}>
                {data.sentiment} Sentiment
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {stock && (
            <div className="flex flex-col items-end px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Market Price</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-900">
                  {stock.currency === 'USD' ? '$' : ''}{stock.regularMarketPrice?.toFixed(2)}
                </span>
                <span className={`text-sm font-bold flex items-center ${ (stock.regularMarketChangePercent || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600' }`}>
                   {(stock.regularMarketChangePercent || 0) >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                   {Math.abs(stock.regularMarketChangePercent || 0).toFixed(2)}%
                </span>
              </div>
            </div>
          )}
          <div className="h-10 w-px bg-slate-200 mx-2" />
          <div className="flex flex-col gap-2 relative group items-end pb-1 pr-1">
            <button 
              onClick={() => exportPDF(false)}
              disabled={isExporting}
              className="px-4 py-2 flex items-center gap-2 bg-indigo-600 border border-transparent text-white hover:bg-indigo-700 rounded-xl transition-colors shrink-0 font-medium text-sm disabled:opacity-50"
            >
              {isExporting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export PDF
            </button>
            <button 
              onClick={() => exportPDF(true)}
              disabled={isExporting}
              className="px-3 py-1 text-xs text-slate-500 hover:text-indigo-600 transition-colors absolute -bottom-5"
            >
              Export All Sections
            </button>
          </div>
          <button 
            onClick={() => setAllSections(!allExpanded)}
            className="px-4 py-2 flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 rounded-xl transition-colors shrink-0 font-medium text-sm"
          >
            {allExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
          <button 
            onClick={onReset}
            className="p-2.5 text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shrink-0"
            title="Reset Analysis"
          >
            <RefreshCcw className="w-5 h-5" />
          </button>
        </div>
      </header>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-start justify-between gap-6 mb-5">
          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1">30-Second Summary</div>
            <h2 className="text-2xl font-bold text-slate-900 flex flex-wrap items-center gap-2">
              {data.company.name}
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono font-bold tracking-wider">
                {resolvedTicker || data.company.ticker}
              </span>
            </h2>
          </div>
          <span className={`px-3 py-1 rounded-full border text-xs font-bold flex items-center gap-2 ${financialHealth.className}`}>
            <span className={`w-2 h-2 rounded-full ${financialHealth.dot}`} />
            {financialHealth.label} Health
          </span>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed mb-5">
          {businessDescription}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
            <div className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1">Financial Health</div>
            <div className="text-lg font-bold text-slate-900">{financialHealth.label}</div>
          </div>
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
            <div className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1">Valuation Verdict</div>
            <div className="text-lg font-bold text-slate-900">{valuationVerdict}</div>
          </div>
          <div className="bg-slate-900 rounded-xl p-4 text-white">
            <div className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1">Investment Verdict</div>
            <div className="text-sm leading-relaxed">
              {crossAnalysis?.investmentVerdict || 'Verdict pending while market and cross-analysis data loads.'}
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Grid */}
      <CollapsibleSection
        title="Key Performance Indicators"
        icon={<Activity className="w-5 h-5 text-blue-500" />}
        isOpen={sections.metrics}
        onToggle={() => toggleSection('metrics')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.metrics?.map((metric, idx) => (
            <motion.div 
              key={idx} 
              variants={item}
              className="bg-slate-50 p-5 rounded-xl border border-slate-100 group hover:border-blue-200 transition-all cursor-default"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-medium text-slate-500">{metric.label}</span>
                <div className={`p-1 rounded-lg ${
                  metric.trend === 'up' ? 'bg-emerald-100 text-emerald-700' : 
                  metric.trend === 'down' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  {metric.trend === 'up' ? <TrendingUp className="w-4 h-4" /> : 
                   metric.trend === 'down' ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                {metric.value}
              </div>
            </motion.div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Stock Chart Section */}
      <CollapsibleSection
        title="Historical Performance & Trends"
        icon={<BarChart3 className="w-5 h-5 text-indigo-500" />}
        isOpen={sections.history}
        onToggle={() => toggleSection('history')}
        containerClassName="h-[480px]"
      >
        <div className="flex flex-col h-[400px]">
          <div className="flex items-center justify-end mb-4">
            <div className="flex gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-blue-500"></div>Price</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-emerald-500"></div>MA20</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-amber-500"></div>MA50</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-rose-500"></div>MA200</div>
            </div>
          </div>
          
          <div className="w-full flex-1">
          {loadingHistory ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-xl animate-pulse">
              <RefreshCcw className="w-8 h-8 text-blue-400 animate-spin" />
              <span className="text-sm font-medium text-slate-400">Loading historical data...</span>
            </div>
          ) : history.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  minTickGap={40}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  orientation="right"
                  domain={['auto', 'auto']}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#1e293b' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="close" 
                  stroke="#3b82f6" 
                  strokeWidth={2} 
                  dot={false} 
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  name="Price"
                />
                <Line type="monotone" dataKey="ma20" stroke="#10b981" strokeWidth={1} dot={false} strokeDasharray="5 5" name="MA20" />
                <Line type="monotone" dataKey="ma50" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="5 5" name="MA50" />
                <Line type="monotone" dataKey="ma200" stroke="#ef4444" strokeWidth={1} dot={false} strokeDasharray="5 5" name="MA200" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <p className="text-slate-400 text-sm">No historical data available for this ticker.</p>
            </div>
          )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Valuation Models */}
      <CollapsibleSection
        title="Valuation Models & Market Analytics"
        icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
        isOpen={sections.valuation}
        onToggle={() => toggleSection('valuation')}
      >
        <ValuationModels summary={summary} stock={stock} loading={loadingSummary} />
      </CollapsibleSection>

      {/* Summary */}
      <CollapsibleSection
        title="Executive Summary & Context"
        icon={<FileText className="w-5 h-5 text-purple-500" />}
        isOpen={sections.summary}
        onToggle={() => toggleSection('summary')}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-50 p-6 rounded-xl border border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Automated Document Insight</h3>
            <p className="text-slate-600 leading-relaxed text-sm">
              {data.summary}
            </p>
          </div>

          {/* Highlight Stats (Contextual Info) */}
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-xl text-white shadow-md overflow-hidden relative">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2 relative z-10">
              <TrendingUp className="w-4 h-4 text-purple-200" /> Recent Technical Trend
            </h3>
            <div className="space-y-4 relative z-10">
              {history.length > 0 && (
                <>
                  <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 border border-white/20 text-xs leading-relaxed">
                    {(() => {
                      const latest = history[history.length - 1];
                      if (!latest.ma200 || !latest.ma50) return "Gathering trend data...";
                      const isAbove200 = latest.close > latest.ma200;
                      const isAbove50 = latest.close > latest.ma50;
                      
                      if (isAbove200 && isAbove50) return "Confirmed long-term uptrend: trading above both 50 and 200-day moving averages.";
                      if (isAbove200 && !isAbove50) return "Above long-term average, but facing short-term resistance (below 50-day MA).";
                      if (!isAbove200 && isAbove50) return "Technical recovery signals present: price broke above 50-day MA despite being below 200-day MA.";
                      return "Bearish phase: trading below all major technical moving averages.";
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/10 backdrop-blur-md rounded-lg p-2 border border-white/20 text-center">
                      <div className="text-[10px] text-white/70 font-semibold mb-0.5">200-Day MA</div>
                      <div className="text-sm font-bold">${history[history.length - 1].ma200?.toFixed(2)}</div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-lg p-2 border border-white/20 text-center">
                      <div className="text-[10px] text-white/70 font-semibold mb-0.5">50-Day MA</div>
                      <div className="text-sm font-bold">${history[history.length - 1].ma50?.toFixed(2)}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Cross Analysis */}
      <CollapsibleSection
        title="Cross Analysis & Investment Signal"
        icon={<GitCompareArrows className="w-5 h-5 text-fuchsia-500" />}
        isOpen={sections.crossAnalysis}
        onToggle={() => toggleSection('crossAnalysis')}
      >
        {loadingCrossAnalysis ? (
          <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3 text-slate-500">
            <RefreshCcw className="w-5 h-5 animate-spin text-fuchsia-500" />
            Generating cross-source investment signal...
          </div>
        ) : crossAnalysis ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-fuchsia-50/60 border border-fuchsia-100 rounded-xl p-6">
              <div className="text-xs uppercase tracking-wider font-bold text-fuchsia-600 mb-2">Alignment Score</div>
              <div className="text-4xl font-bold text-slate-900">
                {Math.round(crossAnalysis.alignmentScore ?? (crossAnalysis.financialsAlignWithStockPerformance ? 75 : 40))}
                <span className="text-lg text-slate-500">/100</span>
              </div>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                {crossAnalysis.alignmentSummary}
              </p>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {crossAnalysis.divergenceSignals.map((signal, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border text-sm leading-relaxed ${getSignalColor(signal)}`}>
                    {signal}
                  </div>
                ))}
              </div>
              <div className="p-4 rounded-xl bg-slate-900 text-white">
                <div className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1">Investment Verdict</div>
                <p className="text-sm leading-relaxed">{crossAnalysis.investmentVerdict}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 text-slate-500 text-sm">
            Cross analysis will appear once real-time market data is available.
          </div>
        )}
      </CollapsibleSection>

      {/* Strategic Highlights and Risks */}
      {(data.highlights?.length > 0 || data.risks?.length > 0) && (
        <CollapsibleSection
          title="Strategic Insights & Risks"
          icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
          isOpen={sections.insights}
          onToggle={() => toggleSection('insights')}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.highlights?.length > 0 && (
              <div className="p-6 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <h3 className="text-sm font-bold text-emerald-900 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Investment Highlights
                </h3>
                <ul className="space-y-3">
                  {data.highlights?.map((h, i) => (
                    <li key={i} className="flex gap-3 text-slate-700">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm leading-relaxed">{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.risks?.length > 0 && (
              <div className="p-6 bg-rose-50/50 rounded-xl border border-rose-100">
                <h3 className="text-sm font-bold text-rose-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" /> Key Strategic Risks
                </h3>
                <ul className="space-y-3">
                  {data.risks?.map((r, i) => (
                    <li key={i} className="flex gap-3 text-slate-700">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-bold mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm leading-relaxed">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ESG Summary */}
      {data.esgSummary && (
        <CollapsibleSection
          title="ESG (Environment, Social & Governance)"
          icon={<Sprout className="w-5 h-5 text-emerald-500" />}
          isOpen={sections.esg}
          onToggle={() => toggleSection('esg')}
        >
          <div className="bg-emerald-50/30 p-6 rounded-xl border border-emerald-100">
            <p className="text-slate-700 leading-relaxed text-sm">
              {data.esgSummary}
            </p>
          </div>
        </CollapsibleSection>
      )}

      {/* Competitor Analysis */}
      {data.competitors && data.competitors.length > 0 && (
        <CollapsibleSection
          title="Peer Comparison"
          icon={<Target className="w-5 h-5 text-indigo-500" />}
        isOpen={sections.competitors}
        onToggle={() => toggleSection('competitors')}
      >
          <PeerComparison
            competitors={data.competitors}
            currentTicker={resolvedTicker || data.company.ticker}
            currentCompanyName={data.company.name}
            currentSummary={summary}
          />
          
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.competitors?.map((comp, idx) => (
              <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm text-slate-900">{comp.name}</h4>
                  {comp.ticker && (
                    <span className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded text-[10px] font-mono font-bold ml-2">
                      {comp.ticker}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {comp.rationale}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </motion.div>
  );
}

function CollapsibleSection({ 
  title, 
  icon, 
  children, 
  isOpen, 
  onToggle,
  containerClassName = ""
}: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode; 
  isOpen: boolean; 
  onToggle: () => void;
  containerClassName?: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <button 
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={`p-6 pt-0 ${containerClassName}`}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
