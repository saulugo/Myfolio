const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

export default async function handler(req, res) {
  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail`;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return res.json({ dividendRate: 0 });
    const data = await r.json();
    const detail = data?.quoteSummary?.result?.[0]?.summaryDetail;
    const dividendRate =
      detail?.dividendRate?.raw ||
      detail?.trailingAnnualDividendRate?.raw ||
      0;
    res.json({ dividendRate });
  } catch {
    res.json({ dividendRate: 0 }); // fail gracefully, never break the UI
  }
}
