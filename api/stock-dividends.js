const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

async function fromV7Quote(ticker) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
  if (!r.ok) return null;
  const data = await r.json();
  const q = data?.quoteResponse?.result?.[0];
  return q?.trailingAnnualDividendRate || q?.dividendRate || null;
}

async function fromQuoteSummary(ticker) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail`;
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
  if (!r.ok) return null;
  const data = await r.json();
  const d = data?.quoteSummary?.result?.[0]?.summaryDetail;
  return d?.dividendRate?.raw || d?.trailingAnnualDividendRate?.raw || null;
}

export default async function handler(req, res) {
  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  try {
    const rate = await fromV7Quote(ticker) ?? await fromQuoteSummary(ticker) ?? 0;
    res.json({ dividendRate: rate, ticker });
  } catch (e) {
    res.json({ dividendRate: 0, ticker, error: e.message });
  }
}
