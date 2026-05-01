const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

export default async function handler(req, res) {
  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=0&newsCount=5&enableFuzzyQuery=false`;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return res.status(502).json({ error: 'Yahoo Finance error' });
    const data = await r.json();
    const news = (data?.news ?? []).map(n => ({
      uuid: n.uuid,
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      publishedAt: n.providerPublishTime,
      relatedTickers: n.relatedTickers ?? [],
    }));
    res.json({ news });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
