const SUPABASE_URL = "https://hrglhocnbciywrtdlnzq.supabase.co";
const SUPABASE_KEY = "sb_publishable_R9-k9r2CDqkXTGEBJhMJ4A_Wz7r3iRE";

const ASSETS_POOL = [
  // Stocks
  { type: "stock", name: "Apple Inc.", ticker: "AAPL", quantity: 1, buy_price: 195.50, current_price: 197.20, currency: "USD" },
  { type: "stock", name: "Microsoft", ticker: "MSFT", quantity: 1, buy_price: 415.00, current_price: 420.30, currency: "USD" },
  { type: "stock", name: "NVIDIA", ticker: "NVDA", quantity: 1, buy_price: 875.00, current_price: 890.50, currency: "USD" },
  { type: "stock", name: "Alphabet", ticker: "GOOGL", quantity: 1, buy_price: 170.00, current_price: 173.80, currency: "USD" },
  { type: "stock", name: "Amazon", ticker: "AMZN", quantity: 1, buy_price: 185.00, current_price: 188.40, currency: "USD" },
  { type: "stock", name: "Tesla", ticker: "TSLA", quantity: 2, buy_price: 240.00, current_price: 245.60, currency: "USD" },
  { type: "stock", name: "Meta Platforms", ticker: "META", quantity: 1, buy_price: 510.00, current_price: 518.90, currency: "USD" },
  { type: "stock", name: "JPMorgan Chase", ticker: "JPM", quantity: 1, buy_price: 195.00, current_price: 198.20, currency: "USD" },
  // Crypto
  { type: "crypto", name: "Bitcoin", ticker: "BTC", quantity: 0.01, buy_price: 84000, current_price: 85200, currency: "USD" },
  { type: "crypto", name: "Ethereum", ticker: "ETH", quantity: 0.1, buy_price: 3100, current_price: 3180, currency: "USD" },
  { type: "crypto", name: "Solana", ticker: "SOL", quantity: 2, buy_price: 155, current_price: 160, currency: "USD" },
  { type: "crypto", name: "Wrapped Beacon ETH", ticker: "WBETH", quantity: 0.05, buy_price: 3200, current_price: 3290, currency: "EUR" },
  { type: "crypto", name: "Cardano", ticker: "ADA", quantity: 100, buy_price: 0.45, current_price: 0.47, currency: "USD" },
  { type: "crypto", name: "Dogecoin", ticker: "DOGE", quantity: 500, buy_price: 0.12, current_price: 0.13, currency: "USD" },
  // Funds
  { type: "fund", name: "Vanguard S&P 500 ETF", ticker: "VOO", quantity: 1, buy_price: 490.00, current_price: 498.50, currency: "USD" },
  { type: "fund", name: "Invesco QQQ Trust", ticker: "QQQ", quantity: 1, buy_price: 445.00, current_price: 452.30, currency: "USD" },
  { type: "fund", name: "iShares MSCI World", ticker: "IWDA.AS", quantity: 5, buy_price: 92.00, current_price: 93.80, currency: "EUR" },
  // Real estate
  {
    type: "real_estate", name: "Apt. Eixample Barcelona", ticker: null,
    quantity: 1, buy_price: 320000, current_price: 340000, currency: "EUR",
    address: "Carrer de Provença 120, Barcelona", rent: 1800, monthly_costs: 450, net_income: 1350,
    purchase_date: "2022-06-15", notes: "Arrendado. Contrato hasta 2025.",
  },
  {
    type: "real_estate", name: "Apt. Madrid Centro", ticker: null,
    quantity: 1, buy_price: 280000, current_price: 295000, currency: "EUR",
    address: "Calle Gran Vía 45, Madrid", rent: 1600, monthly_costs: 380, net_income: 1220,
    purchase_date: "2021-03-10", notes: "Alquiler turístico.",
  },
];

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.message || "Login failed");
  return { token: data.access_token, userId: data.user.id };
}

async function insertAsset(token, userId, asset) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/assets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ ...asset, user_id: userId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Insert failed");
  }
  return (await res.json())[0];
}

async function main() {
  const email = process.env.KEEPALIVE_EMAIL;
  const password = process.env.KEEPALIVE_PASSWORD;
  if (!email || !password) throw new Error("Missing KEEPALIVE_EMAIL or KEEPALIVE_PASSWORD env vars");

  console.log("🔐 Signing in as demo user...");
  const { token, userId } = await signIn(email, password);
  console.log(`✅ Signed in. User ID: ${userId}`);

  // Pick a random asset, weighted slightly toward variety
  const asset = ASSETS_POOL[Math.floor(Math.random() * ASSETS_POOL.length)];
  console.log(`🎲 Selected asset: [${asset.type}] ${asset.name} (${asset.ticker ?? "no ticker"})`);

  const saved = await insertAsset(token, userId, asset);
  console.log(`✅ Asset inserted with ID: ${saved.id}`);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
