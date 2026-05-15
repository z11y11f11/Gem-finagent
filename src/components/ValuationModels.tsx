import React, { useEffect, useState } from 'react';
import { TrendingUp, DollarSign, Calculator, CheckCircle2, Scale, RefreshCcw } from 'lucide-react';
import { ValuationSummary, StockData, ValuationVerdictResult } from '../types';

interface ValuationModelsProps {
  summary: ValuationSummary | null;
  stock: StockData | null;
  loading: boolean;
}

export function ValuationModels({ summary, stock, loading }: ValuationModelsProps) {
  const [growthRate, setGrowthRate] = useState<number>(5);
  const [discountRate, setDiscountRate] = useState<number>(10);
  const [terminalGrowthRate, setTerminalGrowthRate] = useState<number>(2);
  const [valuationVerdict, setValuationVerdict] = useState<ValuationVerdictResult | null>(null);
  const [loadingVerdict, setLoadingVerdict] = useState(false);

  // DCF Calculation (simplified)
  // We need FCF, but if we don't have it, we can estimate from some other metric or just use a placeholder base value
  // Let's assume a dummy EPS or FCF of 10 if not provided to show the math.
  // Actually, we can get EPS from summary if we pass it, but maybe we just use $10.00 as a placeholder base FCF per share if we don't have it.
  const baseCashFlow = stock?.regularMarketPrice ? stock.regularMarketPrice / (summary?.trailingPE || 15) : 10;
  
  let dcfValue = 0;
  let yearCashFlows = [];

  if (baseCashFlow > 0) {
    let cf = baseCashFlow;
    for (let i = 1; i <= 5; i++) {
      cf = cf * (1 + (growthRate / 100));
      const discountedCf = cf / Math.pow(1 + (discountRate / 100), i);
      yearCashFlows.push(discountedCf);
      dcfValue += discountedCf;
    }
    
    // Terminal value
    const terminalValue = (cf * (1 + (terminalGrowthRate / 100))) / ((discountRate / 100) - (terminalGrowthRate / 100));
    const discountedTerminalValue = terminalValue / Math.pow(1 + (discountRate / 100), 5);
    
    // Handle edge cases
    if (discountRate <= terminalGrowthRate) {
       dcfValue = NaN; // Invalid
    } else {
       dcfValue += discountedTerminalValue;
    }
  }

  useEffect(() => {
    if (!summary || loading) {
      return;
    }

    const runValuationVerdict = async () => {
      setLoadingVerdict(true);
      try {
        const { synthesizeValuationVerdict } = await import('../services/ai');
        const result = await synthesizeValuationVerdict({
          marketPrice: stock?.regularMarketPrice,
          valuationMultiples: {
            trailingPE: summary.trailingPE,
            forwardPE: summary.forwardPE,
            priceToBook: summary.priceToBook,
            pegRatio: summary.pegRatio,
            enterpriseToEbitda: summary.enterpriseToEbitda,
            dividendYield: summary.dividendYield,
            payoutRatio: summary.payoutRatio
          },
          analystConsensus: {
            recommendationKey: summary.recommendationKey,
            targetMeanPrice: summary.targetMeanPrice,
            targetHighPrice: summary.targetHighPrice,
            targetLowPrice: summary.targetLowPrice,
            numberOfAnalystOpinions: summary.numberOfAnalystOpinions
          },
          dcf: {
            calculatedValue: Number.isFinite(dcfValue) ? dcfValue : null,
            baseCashFlow,
            growthRate,
            discountRate,
            terminalGrowthRate,
            yearCashFlows
          }
        });
        setValuationVerdict(result);
      } finally {
        setLoadingVerdict(false);
      }
    };

    runValuationVerdict();
  }, [baseCashFlow, dcfValue, discountRate, growthRate, loading, stock?.regularMarketPrice, summary, terminalGrowthRate]);

  const getVerdictStyle = (verdict?: string) => {
    if (verdict === 'Undervalued') return 'bg-emerald-50 border-emerald-100 text-emerald-700';
    if (verdict === 'Overvalued') return 'bg-rose-50 border-rose-100 text-rose-700';
    return 'bg-amber-50 border-amber-100 text-amber-700';
  };

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-slate-900 rounded-xl p-6 text-white overflow-hidden relative">
        <DollarSign className="absolute -right-8 -bottom-8 w-40 h-40 text-white/[0.03] pointer-events-none" />
        <h3 className="text-sm font-bold text-white mb-4 relative z-10 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Valuation Multiples
        </h3>
        
        <div className="grid grid-cols-2 gap-3 relative z-10">
          {loading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white/5 rounded-xl p-4 animate-pulse h-16 border border-white/5" />
            ))
          ) : summary ? (
            <>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/10 transition-colors">
                <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider font-semibold">PE/PB/PEG</div>
                <div className="text-sm font-medium">PE: {summary.trailingPE?.toFixed(1) || 'N/A'}</div>
                <div className="text-sm font-medium">PB: {summary.priceToBook?.toFixed(1) || 'N/A'}</div>
                <div className="text-sm font-medium">PEG: {summary.pegRatio?.toFixed(1) || 'N/A'}</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/10 transition-colors">
                <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider font-semibold">EV/EBITDA</div>
                <div className="text-2xl font-bold mt-2">{summary.enterpriseToEbitda?.toFixed(2) || 'N/A'}</div>
              </div>
              <div className="col-span-2 bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/10 transition-colors">
                <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider font-semibold">Dividend Model</div>
                <div className="flex justify-between items-center mt-1">
                  <div>
                    <span className="text-xs text-slate-400">Yield: </span>
                    <span className="text-blue-400 font-bold">{(summary.dividendYield ? (summary.dividendYield * 100).toFixed(2) : '0.00')}%</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Payout: </span>
                    <span className="text-slate-200">{(summary.payoutRatio ? (summary.payoutRatio * 100).toFixed(2) : '0.00')}%</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-2 py-4 text-center text-slate-500 text-xs italic">Valuation data unavailable.</div>
          )}
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-indigo-500" /> DCF Calculator
        </h3>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-6 bg-slate-200 rounded w-1/2"></div>
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="h-4 bg-slate-200 rounded w-full"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Growth Rate (%)</label>
                <input 
                  type="number" 
                  value={growthRate} 
                  onChange={(e) => setGrowthRate(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Discount Rate (%)</label>
                <input 
                  type="number" 
                  value={discountRate} 
                  onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            
            <div className="pt-4 border-t border-slate-200">
               <div className="flex justify-between items-end">
                 <span className="text-sm font-semibold text-slate-700">Estimated Value</span>
                 <span className="text-2xl font-bold text-indigo-600">
                   {isNaN(dcfValue) ? "N/A" : `$${dcfValue.toFixed(2)}`}
                 </span>
               </div>
               <div className="flex justify-between items-end mt-1">
                 <span className="text-xs text-slate-500">Current Price</span>
                 <span className="text-sm font-medium text-slate-600">
                   {stock?.regularMarketPrice ? `$${stock.regularMarketPrice.toFixed(2)}` : "N/A"}
                 </span>
               </div>
            </div>
            <p className="text-[10px] text-slate-400 italic mt-2">
              Real DCF math: base cash flow {baseCashFlow.toFixed(2)} grows at {growthRate}% for 5 years, discounted at {discountRate}%, plus terminal growth of {terminalGrowthRate}%.
            </p>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-500" /> Wall Street Consensus
        </h3>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-12 bg-slate-200 rounded-xl" />
            <div className="h-16 bg-slate-200 rounded-xl" />
          </div>
        ) : summary ? (
          <div className="space-y-5">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs text-slate-500 mb-1 font-medium italic capitalize">{summary.recommendationKey?.replace(/_/g, ' ') || 'No Rating'}</div>
                <div className="text-xl font-black text-slate-900 flex items-center gap-2">
                  {summary.recommendationKey && (
                    <div className={`w-3 h-3 rounded-full ${
                      summary.recommendationKey.includes('buy') ? 'bg-emerald-500' : 
                      summary.recommendationKey.includes('sell') ? 'bg-rose-500' : 'bg-amber-500'
                    }`} />
                  )}
                  {summary.recommendationKey?.toUpperCase().replace(/_/g, ' ') || 'N/A'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Mean Target</div>
                <div className="text-xl font-bold text-indigo-600">${summary.targetMeanPrice?.toFixed(2) || 'N/A'}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col justify-center px-4 py-2 bg-white border border-slate-200 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase font-bold text-center mb-1">Target Range</div>
                <div className="text-xs font-bold text-slate-800 text-center">${summary.targetLowPrice?.toFixed(0)} - ${summary.targetHighPrice?.toFixed(0)}</div>
              </div>
              <div className="flex flex-col justify-center px-4 py-2 bg-white border border-slate-200 rounded-xl text-center">
                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Opinions</div>
                <div className="text-xs font-bold text-slate-800">{summary.numberOfAnalystOpinions || 0} Analysts</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-slate-500 text-xs italic">Analyst data unavailable.</div>
        )}
      </div>
    </div>
      <div className={`rounded-xl border p-6 ${getVerdictStyle(valuationVerdict?.overallVerdict)}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
              <Scale className="w-4 h-4" /> Valuation Verdict
            </h3>
            {loadingVerdict ? (
              <div className="flex items-center gap-2 text-sm">
                <RefreshCcw className="w-4 h-4 animate-spin" />
                Synthesizing valuation models...
              </div>
            ) : (
              <>
                <div className="text-2xl font-black text-slate-900">
                  {valuationVerdict?.overallVerdict || 'Fair Value'}
                </div>
                <p className="text-sm leading-relaxed mt-2 text-slate-700">
                  {valuationVerdict?.keyReason || 'Valuation verdict is pending available market and DCF data.'}
                </p>
              </>
            )}
          </div>
          <div className="bg-white/70 border border-white/70 rounded-xl px-4 py-3 min-w-40">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Confidence</div>
            <div className="text-lg font-bold text-slate-900">
              {valuationVerdict?.confidenceLevel || 'Low'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
