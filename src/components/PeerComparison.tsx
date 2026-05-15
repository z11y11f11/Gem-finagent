import React, { useEffect, useState } from 'react';
import { Target, AlertCircle } from 'lucide-react';
import { ValuationSummary } from '../types';
import { normalizeYahooTicker } from '../utils/ticker';

interface PeerComparisonProps {
  competitors: { name: string; ticker: string; rationale: string }[];
  currentTicker: string;
  currentCompanyName: string;
  currentSummary: ValuationSummary | null;
}

type PeerMetricRow = ValuationSummary & { price?: number; name?: string; ticker: string; isCurrent?: boolean; isAverage?: boolean };

export function PeerComparison({ competitors, currentTicker, currentCompanyName, currentSummary }: PeerComparisonProps) {
  const [peerData, setPeerData] = useState<Record<string, ValuationSummary & { price?: number; name?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const validCompetitors = competitors.filter(c => c.ticker || c.name);
    if (validCompetitors.length === 0) return;

    const fetchPeers = async () => {
      setLoading(true);
      setError('');
      try {
        const results = await Promise.all(validCompetitors.slice(0, 5).map(async (c) => {
          const inputKey = c.ticker ? normalizeYahooTicker(c.ticker) : c.name;
          let normalizedTicker = c.ticker ? normalizeYahooTicker(c.ticker) : '';
          try {
            let res = normalizedTicker
              ? await fetch(`/api/stock/${encodeURIComponent(normalizedTicker)}/summary`)
              : new Response(null, { status: 404 });
            if (!res.ok) {
              const { resolveYahooTickersWithAI } = await import('../services/ai');
              const candidates = await resolveYahooTickersWithAI(`${c.name} ${c.ticker}`);
              for (const candidate of candidates) {
                const candidateTicker = normalizeYahooTicker(candidate.symbol);
                res = await fetch(`/api/stock/${encodeURIComponent(candidateTicker)}/summary`);
                if (res.ok) {
                  normalizedTicker = candidateTicker;
                  break;
                }
              }
            }

            if (res.ok) {
              const raw = await res.json();
              const stats = raw.defaultKeyStatistics || {};
              const financial = raw.financialData || {};
              const detail = raw.summaryDetail || {};
              const price = raw.price?.regularMarketPrice;
              const name = raw.price?.longName || raw.price?.shortName || c.name;
              
              return {
                inputKey,
                ticker: normalizedTicker,
                data: {
                  name,
                  price,
                  trailingPE: detail.trailingPE || stats.trailingPE,
                  priceToBook: stats.priceToBook,
                  enterpriseToEbitda: stats.enterpriseToEbitda,
                  dividendYield: detail.dividendYield,
                  revenueGrowth: financial.revenueGrowth,
                }
              };
            }
          } catch (e) {
            console.warn(`Failed to fetch peer ${c.ticker}`, e);
          }
          return { inputKey, ticker: normalizedTicker || c.name, data: null };
        }));

        const newPeerData: Record<string, any> = {};
        results.forEach(r => {
          if (r.data) {
            newPeerData[r.ticker] = r.data;
            newPeerData[r.inputKey] = r.data;
          }
        });
        setPeerData(newPeerData);
      } catch (err: any) {
         setError('Failed to load peer data');
      } finally {
        setLoading(false);
      }
    };
    fetchPeers();
  }, [competitors]);

  const currentRow: PeerMetricRow | null = currentTicker ? {
    ticker: normalizeYahooTicker(currentTicker),
    name: currentCompanyName,
    isCurrent: true,
    ...currentSummary
  } : null;

  const peerRows: PeerMetricRow[] = competitors
    .filter(c => c.ticker || c.name)
    .slice(0, 5)
    .map(c => {
      const ticker = c.ticker ? normalizeYahooTicker(c.ticker) : c.name;
      const d = peerData[ticker] || (Object.values(peerData) as Array<ValuationSummary & { price?: number; name?: string }>).find(peer => peer.name === c.name);
      return {
        ticker: d ? (Object.keys(peerData).find(key => peerData[key] === d) || ticker) : ticker,
        name: d?.name || c.name,
        ...d
      };
    });

  const rowsForAverage = [
    ...(currentRow ? [currentRow] : []),
    ...peerRows
  ].filter(row => row.trailingPE || row.priceToBook || row.enterpriseToEbitda || row.revenueGrowth || row.dividendYield);

  const average = (field: keyof ValuationSummary) => {
    const values = rowsForAverage
      .map(row => row[field])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 0) return undefined;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const averageRow: PeerMetricRow = {
    ticker: 'Average',
    name: 'Industry Average',
    isAverage: true,
    trailingPE: average('trailingPE'),
    priceToBook: average('priceToBook'),
    enterpriseToEbitda: average('enterpriseToEbitda'),
    revenueGrowth: average('revenueGrowth'),
    dividendYield: average('dividendYield')
  };

  const displayRows = [
    ...(currentRow ? [currentRow] : []),
    ...peerRows,
    averageRow
  ];

  const formatNumber = (value?: number) => typeof value === 'number' ? value.toFixed(2) : '-';
  const formatPercent = (value?: number) => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '-';

  if (competitors.filter(c => c.ticker || c.name).length === 0) {
     return (
       <div className="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-500">
         <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-400" />
         No valid competitor tickers identified.
       </div>
     );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
            <tr>
              <th className="px-6 py-4">Company</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">P/E</th>
              <th className="px-6 py-4">P/B</th>
              <th className="px-6 py-4">EV/EBITDA</th>
              <th className="px-6 py-4">Growth %</th>
              <th className="px-6 py-4">Div Yield</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
               <tr>
                 <td colSpan={7} className="px-6 py-8 text-center text-slate-500 animate-pulse">
                   Fetching real-time peer data...
                 </td>
               </tr>
            ) : (
               displayRows.map(d => {
                 return (
                   <tr key={`${d.ticker}-${d.name}`} className={`hover:bg-slate-50/50 transition-colors ${d.isCurrent ? 'bg-blue-50/40' : d.isAverage ? 'bg-slate-100/70 font-semibold' : ''}`}>
                     <td className="px-6 py-4">
                       <div className="font-medium text-slate-900 truncate max-w-[200px]">{d.name}</div>
                       <div className="text-xs text-slate-500 mt-0.5">{d.ticker}</div>
                     </td>
                     <td className="px-6 py-4 text-xs text-slate-500">{d.isCurrent ? 'Analyzed company' : d.isAverage ? 'Average' : 'Competitor'}</td>
                     <td className="px-6 py-4 font-mono">{formatNumber(d.trailingPE)}</td>
                     <td className="px-6 py-4 font-mono">{formatNumber(d.priceToBook)}</td>
                     <td className="px-6 py-4 font-mono">{formatNumber(d.enterpriseToEbitda)}</td>
                     <td className="px-6 py-4 font-mono">
                       {d.revenueGrowth ? (
                         <span className={d.revenueGrowth > 0 ? "text-emerald-600" : "text-rose-600"}>
                           {formatPercent(d.revenueGrowth)}
                         </span>
                       ) : '-'}
                     </td>
                     <td className="px-6 py-4 font-mono">{formatPercent(d.dividendYield)}</td>
                   </tr>
                 );
               })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
