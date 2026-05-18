/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, FileText, Settings, Shield, Bell, Search, AlertCircle } from 'lucide-react';
import Uploader from './components/Uploader';
import AnalysisDashboard from './components/AnalysisDashboard';
import { AnalysisResult } from './types';
import { isLikelyResolvedYahooTicker, normalizeYahooTicker } from './utils/ticker';

export default function App() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSearchingTicker, setIsSearchingTicker] = useState(false);

  const fetchUsableMarketSummary = async (symbols: string[]) => {
    for (const symbol of symbols) {
      const normalized = normalizeYahooTicker(symbol);
      if (!normalized) {
        continue;
      }

      const res = await fetch(`/api/stock/${encodeURIComponent(normalized)}/summary`);
      if (res.ok) {
        return { ticker: normalized, marketData: await res.json() };
      }
    }

    return null;
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      {/* Sidebar - Visual only for V1 structure */}
      <aside className="w-64 border-r border-slate-200 flex flex-col hidden lg:flex bg-white">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <Shield className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold font-display tracking-tight text-slate-900">f i n te ch</span>
          </div>

          <nav className="space-y-1">
            <NavItem icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" active />
            <NavItem icon={<FileText className="w-4 h-4" />} label="Reports" />
            <NavItem icon={<Bell className="w-4 h-4" />} label="Alerts" />
            <div className="pt-4 pb-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">System</div>
            <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" />
          </nav>
        </div>
        
        <div className="mt-auto p-6 border-t border-slate-100">
          <div className="p-3 bg-blue-50 rounded-xl">
            <div className="text-xs font-bold text-blue-600 uppercase mb-1">V1 Core</div>
            <div className="text-[10px] text-blue-400">Analysis Engine Active</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const ticker = formData.get('ticker') as string;
              if (ticker) {
                setError(null);
                setIsSearchingTicker(true);
                setAnalysis(null);

                try {
                  let finalTicker = normalizeYahooTicker(ticker);
                  
                  try {
                    const searchRes = await fetch(`/api/search/${encodeURIComponent(ticker)}`);
                    if (searchRes.ok) {
                      const searchData = await searchRes.json();
                      if (searchData.quotes && searchData.quotes.length > 0) {
                        finalTicker = normalizeYahooTicker(searchData.quotes[0].symbol || finalTicker);
                      } else if (ticker.match(/[\u3400-\u9FBF]/)) {
                         throw new Error(`Could not resolve company name "${ticker}" to a stock symbol. Please try entering the ticker symbol directly (e.g. 601857.SS for PetroChina).`);
                      }
                    }
                  } catch (e: any) {
                    console.warn("Search resolution issue", e);
                    if (e.message && e.message.includes('Could not resolve')) {
                       throw e; // re-throw to the outer catch
                    }
                  }

                  const symbolsToTry = [finalTicker];
                  let resolvedMarket = await fetchUsableMarketSummary(symbolsToTry);

                  if (!resolvedMarket && !isLikelyResolvedYahooTicker(finalTicker)) {
                    const { resolveYahooTickersWithAI } = await import('./services/ai');
                    const aiCandidates = await resolveYahooTickersWithAI(ticker);
                    resolvedMarket = await fetchUsableMarketSummary(aiCandidates.map(candidate => candidate.symbol));
                  }

                  if (!resolvedMarket) {
                     throw new Error(`Failed to resolve "${ticker}" to a Yahoo Finance symbol.`);
                  }
                  finalTicker = resolvedMarket.ticker;
                  const marketData = resolvedMarket.marketData;
                  
                  const { analyzeMarketData } = await import('./services/ai');
                  const aiResult = await analyzeMarketData(finalTicker, marketData);
                  setAnalysis(aiResult);
                } catch (err: any) {
                  setError(err.message || 'Failed to search ticker');
                } finally {
                  setIsSearchingTicker(false);
                }
              }
            }}>
              <input 
                name="ticker"
                type="text" 
                placeholder="Search ticker (e.g. AAPL, MSFT, 1810.HK)..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all outline-none"
              />
            </form>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => window.location.reload()}
              className="text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center gap-2 mr-4"
              title="Refresh Page"
            >
              🔄 Refresh Page
            </button>
            <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="fixed bottom-6 left-6 z-50 max-w-md p-4 bg-rose-50 border border-rose-200 shadow-xl rounded-xl flex items-start gap-3 text-rose-700"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium leading-relaxed">{error}</p>
                <button 
                  onClick={() => setError(null)}
                  className="ml-auto text-xs font-bold hover:underline whitespace-nowrap shrink-0 mt-0.5"
                >
                  Dismiss
                </button>
              </motion.div>
            )}

            {!analysis ? (
              <motion.section
                key="uploader"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex items-center justify-center pt-12"
              >
                <div className="text-center w-full">
                  <div className="mb-12">
                    <h2 className="text-4xl font-bold font-display text-slate-900 mb-4 h-12">
                      Precision Financial Analysis
                    </h2>
                    <p className="text-slate-500 max-w-lg mx-auto">
                      Upload your 10-K, ESG, or quarterly report. Our AI-driven engine provides real-time market data alongside deep document insights.
                    </p>
                  </div>
                  {isSearchingTicker ? (
                    <div className="w-full max-w-2xl mx-auto space-y-6 flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-200 rounded-2xl bg-white shadow-sm">
                      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <h3 className="text-lg font-semibold text-slate-900">Gathering Market Data & AI Insights...</h3>
                      <p className="text-sm text-slate-500">Please wait while Gemini analyzes the financial data for the ticker.</p>
                    </div>
                  ) : (
                    <div className={isSearchingTicker ? 'hidden' : ''}>
                      <Uploader 
                        onUploadStarted={() => {
                          setError(null);
                          setIsAnalyzing(true);
                        }}
                        onAnalysisComplete={(res) => {
                          setAnalysis(res);
                          setIsAnalyzing(false);
                        }}
                        onError={(msg) => {
                          setError(msg);
                          setIsAnalyzing(false);
                        }}
                      />
                    </div>
                  )}
                </div>
              </motion.section>
            ) : (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <AnalysisDashboard 
                  data={analysis} 
                  onReset={() => setAnalysis(null)} 
                  onError={(msg) => setError(msg)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={`
      w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
      ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}
    `}>
      {icon}
      {label}
    </button>
  );
}
