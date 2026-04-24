const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// ISINs are 2 uppercase letters + 10 alphanumeric chars
const isISIN = (s) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(s);

async function resolveISIN(isin) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=3&newsCount=0`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  // Pick the first result that is an equity or ETF
  const quote = data?.quotes?.find(q => ['EQUITY', 'ETF'].includes(q.quoteType)) ?? data?.quotes?.[0];
  return quote?.symbol ?? null;
}

async function fetchPrice(ticker) {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price != null) return price;
    } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  let { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  let resolvedTicker = ticker;

  if (isISIN(ticker)) {
    const resolved = await resolveISIN(ticker);
    if (resolved) {
      resolvedTicker = resolved;
    } else {
      return res.status(502).json({ error: `Could not resolve ISIN ${ticker} to a ticker` });
    }
  }

  const price = await fetchPrice(resolvedTicker);
  if (price != null) return res.json({ price, resolvedTicker: resolvedTicker !== ticker ? resolvedTicker : undefined });

  res.status(502).json({ error: `Could not fetch price for ${resolvedTicker}` });
}
