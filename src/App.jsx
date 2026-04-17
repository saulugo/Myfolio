import { useState, useEffect, useCallback } from "react";

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = "https://hrglhocnbciywrtdlnzq.supabase.co";
const SUPABASE_KEY = "sb_publishable_R9-k9r2CDqkXTGEBJhMJ4A_Wz7r3iRE";

// Cliente Supabase ligero usando fetch directo (sin SDK)
const sb = {
  _token: null,
  _userId: null,

  headers(extra = {}) {
    return {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      ...(this._token ? { "Authorization": `Bearer ${this._token}` } : {}),
      ...extra
    };
  },

  async signUp(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ email, password })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || d.msg || "Error al registrar");
    if (d.access_token) { this._token = d.access_token; this._userId = d.user?.id; }
    return d;
  },

  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ email, password })
    });
    const d = await r.json();
    if (d.error || d.error_code) throw new Error(d.error_description || d.message || "Credenciales incorrectas");
    this._token = d.access_token;
    this._userId = d.user?.id;
    // Guardar sesión en sessionStorage
    sessionStorage.setItem("sb_session", JSON.stringify({ token: d.access_token, userId: d.user?.id, email: d.user?.email }));
    return d;
  },

  async signOut() {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST", headers: this.headers()
    }).catch(() => {});
    this._token = null; this._userId = null;
    sessionStorage.removeItem("sb_session");
  },

  restoreSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem("sb_session") || "null");
      if (s?.token) { this._token = s.token; this._userId = s.userId; return s; }
    } catch {}
    return null;
  },

  async getAssets() {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/assets?user_id=eq.${this._userId}&order=created_at.desc`, {
      headers: this.headers({ "Prefer": "return=representation" })
    });
    if (!r.ok) throw new Error("Error cargando activos");
    return r.json();
  },

  async addAsset(asset) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/assets`, {
      method: "POST",
      headers: this.headers({ "Prefer": "return=representation" }),
      body: JSON.stringify({ ...asset, user_id: this._userId })
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Error al guardar"); }
    const data = await r.json();
    return data[0];
  },

  async deleteAsset(id) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/assets?id=eq.${id}`, {
      method: "DELETE", headers: this.headers()
    });
    if (!r.ok) throw new Error("Error al eliminar");
  },

  async updateAsset(id, fields) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/assets?id=eq.${id}`, {
      method: "PATCH",
      headers: this.headers({ "Prefer": "return=representation" }),
      body: JSON.stringify(fields)
    });
    if (!r.ok) throw new Error("Error al actualizar");
    const data = await r.json();
    return data[0];
  }
};

// ============================================================
// DATOS DE DEMO para previsualizar sin backend
// ============================================================
const DEMO_USER = {
  name: "Carlos Rivera",
  email: "carlos@gmail.com",
  avatar: "CR"
};

const DEMO_ASSETS = [
  { id: 1, type: "stock", name: "Apple Inc.", ticker: "AAPL", quantity: 10, buy_price: 150, current_price: 189.5, currency: "USD" },
  { id: 2, type: "stock", name: "Tesla", ticker: "TSLA", quantity: 5, buy_price: 220, current_price: 245.3, currency: "USD" },
  { id: 3, type: "crypto", name: "Bitcoin", ticker: "BTC", quantity: 0.25, buy_price: 38000, current_price: 67400, currency: "USD" },
  { id: 4, type: "crypto", name: "Ethereum", ticker: "ETH", quantity: 2.5, buy_price: 1800, current_price: 3520, currency: "USD" },
  { id: 5, type: "real_estate", name: "Apto. Madrid Centro", ticker: "MAD-01", quantity: 1, buy_price: 180000, current_price: 210000, currency: "EUR" },
];

// ============================================================
// PRICE FETCHING
// ============================================================
const COINGECKO_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano',
  XRP: 'ripple', DOGE: 'dogecoin', AVAX: 'avalanche-2', MATIC: 'matic-network',
  DOT: 'polkadot', LINK: 'chainlink', UNI: 'uniswap', LTC: 'litecoin',
  ATOM: 'cosmos', BNB: 'binancecoin', USDT: 'tether', USDC: 'usd-coin',
  WBETH: 'wrapped-beacon-eth',
};

async function fetchCryptoPrices(assets) {
  const targets = assets
    .filter(a => a.type === 'crypto' && COINGECKO_IDS[a.ticker])
    .map(a => ({ id: a.id, cgId: COINGECKO_IDS[a.ticker], currency: a.currency.toLowerCase() }));
  if (!targets.length) return {};
  const ids = [...new Set(targets.map(t => t.cgId))].join(',');
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,eur`);
    const data = await res.json();
    const prices = {};
    targets.forEach(({ id, cgId, currency }) => {
      const cur = ['usd','eur'].includes(currency) ? currency : 'usd';
      if (data[cgId]?.[cur] != null) prices[id] = data[cgId][cur];
    });
    return prices;
  } catch { return {}; }
}

async function fetchStockPrice(ticker) {
  try {
    const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(yUrl)}`);
    const data = await res.json();
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch { return null; }
}

const TYPE_META = {
  stock:       { label: "Acciones",     icon: "📈", color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  crypto:      { label: "Crypto",       icon: "₿",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
  real_estate: { label: "Inmobiliario", icon: "🏢", color: "#60a5fa", bg: "rgba(96,165,250,0.1)"  },
  fund:        { label: "Fondos",       icon: "🏦", color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
};

// ============================================================
// HELPERS
// ============================================================
const fmt = (n, decimals = 2) =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

const fmtMoney = (n, currency = "USD") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

const calcROI = (buy, current) => ((current - buy) / buy) * 100;

// ============================================================
// STYLES
// ============================================================
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #080c10;
    --surface: #0f1419;
    --surface2: #161d26;
    --border: rgba(255,255,255,0.07);
    --text: #e8edf2;
    --muted: #5a6a7a;
    --green: #4ade80;
    --red: #f87171;
    --gold: #f59e0b;
    --blue: #60a5fa;
    --accent: #4ade80;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'DM Mono', monospace;
    min-height: 100vh;
  }

  /* ── LOGIN ── */
  .login-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    position: relative;
    overflow: hidden;
  }
  .login-grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(74,222,128,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(74,222,128,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent);
  }
  .login-glow {
    position: absolute;
    width: 600px; height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(74,222,128,0.06) 0%, transparent 70%);
    top: 50%; left: 50%; transform: translate(-50%,-50%);
    pointer-events: none;
  }
  .login-card {
    position: relative;
    width: 380px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 48px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    box-shadow: 0 40px 80px rgba(0,0,0,0.6);
  }
  .login-logo {
    width: 56px; height: 56px;
    background: linear-gradient(135deg, rgba(74,222,128,0.2), rgba(74,222,128,0.05));
    border: 1px solid rgba(74,222,128,0.3);
    border-radius: 16px;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px;
  }
  .login-title {
    font-family: 'Syne', sans-serif;
    font-size: 24px; font-weight: 800;
    letter-spacing: -0.5px;
    text-align: center;
    line-height: 1.2;
  }
  .login-title span { color: var(--green); }
  .login-sub {
    font-size: 12px; color: var(--muted);
    text-align: center; line-height: 1.6;
    margin-top: -20px;
  }
  .login-form { width: 100%; display: flex; flex-direction: column; gap: 12px; }
  .login-input {
    width: 100%; padding: 13px 16px;
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 12px; color: var(--text);
    font-family: 'DM Mono', monospace; font-size: 13px;
    outline: none; transition: border-color 0.2s;
  }
  .login-input:focus { border-color: var(--green); }
  .login-input::placeholder { color: var(--muted); }
  .btn-submit {
    width: 100%; padding: 14px;
    background: var(--green); color: #080c10;
    border: none; border-radius: 12px;
    font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700;
    cursor: pointer; transition: opacity 0.2s, transform 0.15s;
    margin-top: 4px;
  }
  .btn-submit:hover { opacity: 0.88; transform: translateY(-1px); }
  .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .login-toggle {
    background: transparent; border: none;
    color: var(--green); font-family: 'DM Mono', monospace; font-size: 12px;
    cursor: pointer; text-decoration: underline; text-underline-offset: 3px;
  }
  .login-error {
    font-size: 11px; color: var(--red);
    background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2);
    border-radius: 8px; padding: 8px 12px; text-align: center;
  }
  .login-divider {
    display: flex; align-items: center; gap: 10px;
    font-size: 11px; color: var(--muted);
  }
  .login-divider::before, .login-divider::after {
    content: ''; flex: 1; height: 1px; background: var(--border);
  }
  .btn-demo {
    background: transparent; border: 1px solid var(--border);
    color: var(--muted); width: 100%; padding: 12px; border-radius: 12px;
    font-family: 'DM Mono', monospace; font-size: 12px;
    cursor: pointer; transition: border-color 0.2s, color 0.2s;
  }
  .btn-demo:hover { border-color: var(--green); color: var(--green); }
  .login-footer { font-size: 11px; color: var(--muted); text-align: center; }

  /* ── APP SHELL ── */
  .app { display: flex; flex-direction: column; min-height: 100vh; }

  /* ── TOPBAR ── */
  .topbar {
    position: sticky; top: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 20px;
    height: 56px;
    background: rgba(8,12,16,0.9);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .topbar-brand {
    font-family: 'Syne', sans-serif;
    font-size: 16px; font-weight: 800;
    letter-spacing: -0.3px;
  }
  .topbar-brand span { color: var(--green); }
  .topbar-right { display: flex; align-items: center; gap: 12px; }
  .avatar {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--green), #22c55e);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Syne', sans-serif;
    font-size: 11px; font-weight: 800; color: #080c10;
  }
  .btn-logout {
    background: transparent; border: 1px solid var(--border);
    color: var(--muted); padding: 6px 14px; border-radius: 8px;
    font-family: 'DM Mono', monospace; font-size: 11px;
    cursor: pointer; transition: all 0.2s;
  }
  .btn-logout:hover { border-color: var(--red); color: var(--red); }

  /* ── MAIN ── */
  .main { flex: 1; padding: 24px 20px; max-width: 700px; margin: 0 auto; width: 100%; }

  /* ── HERO TOTAL ── */
  .hero {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 28px 24px;
    margin-bottom: 20px;
    position: relative; overflow: hidden;
  }
  .hero::before {
    content: '';
    position: absolute; top: -40px; right: -40px;
    width: 160px; height: 160px;
    background: radial-gradient(circle, rgba(74,222,128,0.08), transparent 70%);
    border-radius: 50%;
  }
  .hero-label { font-size: 11px; color: var(--muted); letter-spacing: 2px; text-transform: uppercase; }
  .hero-total {
    font-family: 'Syne', sans-serif;
    font-size: 42px; font-weight: 800;
    letter-spacing: -2px;
    margin: 6px 0;
    line-height: 1;
  }
  .hero-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
  .badge-roi {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 6px;
    font-size: 12px; font-weight: 500;
  }
  .badge-roi.pos { background: rgba(74,222,128,0.12); color: var(--green); }
  .badge-roi.neg { background: rgba(248,113,113,0.12); color: var(--red); }
  .hero-invested { font-size: 12px; color: var(--muted); }

  /* ── BREAKDOWN PILLS ── */
  .pills { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  .pill {
    flex: 1; min-width: 100px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px 16px;
    cursor: pointer;
    transition: border-color 0.2s, transform 0.15s;
  }
  .pill:hover { transform: translateY(-2px); }
  .pill.active { border-color: var(--accent); }
  .pill-icon { font-size: 18px; margin-bottom: 6px; }
  .pill-label { font-size: 10px; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; }
  .pill-value { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; margin-top: 2px; }
  .pill-pct { font-size: 10px; color: var(--muted); margin-top: 1px; }

  /* ── ASSET LIST ── */
  .section-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 12px;
  }
  .section-title {
    font-family: 'Syne', sans-serif;
    font-size: 14px; font-weight: 700; letter-spacing: -0.3px;
  }
  .filter-tabs { display: flex; gap: 6px; }
  .tab {
    padding: 5px 12px; border-radius: 8px;
    font-family: 'DM Mono', monospace; font-size: 11px;
    border: 1px solid transparent;
    cursor: pointer; transition: all 0.15s;
    background: transparent; color: var(--muted);
  }
  .tab.active { background: var(--surface2); border-color: var(--border); color: var(--text); }

  .asset-list { display: flex; flex-direction: column; gap: 8px; }
  .asset-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
    display: flex; align-items: center; gap: 14px;
    transition: border-color 0.2s, transform 0.15s;
    cursor: pointer;
  }
  .asset-card:hover { border-color: rgba(255,255,255,0.14); transform: translateX(2px); }
  .asset-icon {
    width: 40px; height: 40px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; flex-shrink: 0;
  }
  .asset-info { flex: 1; min-width: 0; }
  .asset-name {
    font-family: 'Syne', sans-serif;
    font-size: 14px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .asset-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .asset-right { text-align: right; flex-shrink: 0; }
  .asset-value { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; }
  .asset-roi { font-size: 11px; margin-top: 2px; }
  .pos { color: var(--green); }
  .neg { color: var(--red); }

  /* ── BTN ADD ── */
  .btn-add {
    position: fixed; bottom: 24px; right: 20px;
    width: 52px; height: 52px; border-radius: 50%;
    background: var(--green);
    color: #080c10;
    border: none; font-size: 24px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(74,222,128,0.35);
    transition: transform 0.15s, box-shadow 0.15s;
    font-weight: 300;
  }
  .btn-add:hover { transform: scale(1.08); box-shadow: 0 12px 32px rgba(74,222,128,0.5); }

  /* ── EMPTY ── */
  .empty {
    text-align: center; padding: 48px 20px;
    color: var(--muted); font-size: 13px; line-height: 2;
  }

  /* ── MODAL ── */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(4px);
    display: flex; align-items: flex-end; justify-content: center;
  }
  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 24px 24px 0 0;
    padding: 32px 24px 40px;
    width: 100%; max-width: 500px;
    animation: slideUp 0.25s ease;
  }
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .modal-title {
    font-family: 'Syne', sans-serif;
    font-size: 18px; font-weight: 800;
    margin-bottom: 24px;
  }
  .form-group { margin-bottom: 16px; }
  .form-label { font-size: 11px; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; display: block; margin-bottom: 6px; }
  .form-input, .form-select {
    width: 100%; padding: 12px 14px;
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 10px; color: var(--text);
    font-family: 'DM Mono', monospace; font-size: 13px;
    outline: none; transition: border-color 0.2s;
  }
  .form-input:focus, .form-select:focus { border-color: var(--green); }
  .form-select option { background: var(--surface2); }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .modal-actions { display: flex; gap: 10px; margin-top: 24px; }
  .btn-primary {
    flex: 1; padding: 14px;
    background: var(--green); color: #080c10;
    border: none; border-radius: 12px;
    font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700;
    cursor: pointer; transition: opacity 0.2s;
  }
  .btn-primary:hover { opacity: 0.88; }
  .btn-cancel {
    padding: 14px 20px;
    background: transparent; border: 1px solid var(--border);
    color: var(--muted); border-radius: 12px;
    font-family: 'DM Mono', monospace; font-size: 13px;
    cursor: pointer; transition: border-color 0.2s;
  }
  .btn-cancel:hover { border-color: var(--muted); }

  /* ── NOTA SUPABASE ── */
  .supabase-note {
    background: rgba(245,158,11,0.07);
    border: 1px solid rgba(245,158,11,0.2);
    border-radius: 12px;
    padding: 14px 16px;
    font-size: 11px;
    color: var(--gold);
    line-height: 1.7;
    margin-bottom: 20px;
  }
  .supabase-note strong { font-weight: 600; }
`;

// ============================================================
// LOGIN SCREEN — email + password
// ============================================================
function LoginScreen({ onDemo, onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!email || !password) { setError("Completa email y contraseña"); return; }
    if (mode === "register" && !name) { setError("Escribe tu nombre"); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    setLoading(true);
    try {
      if (mode === "register") {
        await sb.signUp(email, password);
        // Auto login tras registro
        await sb.signIn(email, password);
      } else {
        await sb.signIn(email, password);
      }
      const initials = (name || email).split(/[\s@]/)[0].slice(0,2).toUpperCase();
      onLogin({ name: name || email.split("@")[0], email, avatar: initials });
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-grid" />
      <div className="login-glow" />
      <div className="login-card">
        <div className="login-logo">📊</div>
        <div style={{textAlign:"center"}}>
          <div className="login-title">Mi <span>Portafolio</span><br/>de Inversiones</div>
          <div className="login-sub" style={{marginTop:8}}>
            Acciones · Crypto · Inmobiliario<br/>
            Todo en un solo lugar
          </div>
        </div>

        <div className="login-form">
          {mode === "register" && (
            <input
              className="login-input"
              placeholder="Tu nombre"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          )}
          <input
            className="login-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            className="login-input"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
          {error && <div className="login-error">{error}</div>}
          <button className="btn-submit" onClick={handleSubmit} disabled={loading}>
            {loading ? "Cargando..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
          <div style={{textAlign:"center", fontSize:12, color:"var(--muted)"}}>
            {mode === "login" ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
            <button className="login-toggle" onClick={() => { setMode(mode==="login"?"register":"login"); setError(""); }}>
              {mode === "login" ? "Regístrate" : "Inicia sesión"}
            </button>
          </div>
          <div className="login-divider">o</div>
          <button className="btn-demo" onClick={onDemo}>Ver demo sin cuenta →</button>
        </div>

        <div className="login-footer">
          Tus datos se guardan de forma segura<br/>con Supabase Email Auth
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADD ASSET MODAL
// ============================================================
function AddAssetModal({ onClose, onAdd, onEdit, asset }) {
  const editMode = !!asset;
  const [form, setForm] = useState({
    type: asset?.type ?? "stock",
    name: asset?.name ?? "",
    ticker: asset?.ticker ?? "",
    quantity: asset?.quantity ?? "",
    buy_price: asset?.buy_price ?? "",
    current_price: asset?.current_price ?? "",
    currency: asset?.currency ?? "USD",
    // real estate specific
    address: asset?.address ?? "",
    rent: asset?.rent ?? "",
    monthly_costs: asset?.monthly_costs ?? "",
    purchase_date: asset?.purchase_date ?? "",
    notes: asset?.notes ?? "",
  });
  const set = (k, v) => setForm(f => ({...f, [k]: v}));
  const isRE = form.type === "real_estate";
  const isFund = form.type === "fund";
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const handleFetchPrice = async () => {
    if (!form.ticker) { alert("Introduce primero el Ticker / ISIN"); return; }
    setFetchingPrice(true);
    try {
      let price = null;
      if (form.type === 'crypto') {
        const cgId = COINGECKO_IDS[form.ticker];
        if (!cgId) { alert(`Ticker "${form.ticker}" no reconocido. Comprueba el ticker.`); return; }
        const cur = ['usd','eur'].includes(form.currency.toLowerCase()) ? form.currency.toLowerCase() : 'usd';
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=${cur}`);
        const data = await res.json();
        price = data[cgId]?.[cur] ?? null;
      } else {
        price = await fetchStockPrice(form.ticker);
      }
      if (price != null) set("current_price", price);
      else alert("No se pudo obtener el precio. Verifica el ticker.");
    } catch { alert("Error al conectar con la API de precios."); }
    finally { setFetchingPrice(false); }
  };

  const handleSubmit = () => {
    if (!form.name || !form.buy_price) return;
    if (!isRE && !form.quantity) return;
    const { address, rent, monthly_costs, purchase_date, notes, ...baseForm } = form;
    const fields = {
      ...baseForm,
      quantity: isRE ? 1 : parseFloat(form.quantity),
      buy_price: parseFloat(form.buy_price),
      current_price: parseFloat(form.current_price || form.buy_price),
      ...(isRE && {
        address,
        rent: parseFloat(rent) || 0,
        monthly_costs: parseFloat(monthly_costs) || 0,
        net_income: (parseFloat(rent) || 0) - (parseFloat(monthly_costs) || 0),
        purchase_date: purchase_date || null,
        notes: notes || null,
      }),
    };
    if (editMode) {
      onEdit(asset.id, fields);
    } else {
      onAdd(fields);
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{editMode ? "✏️ Editar Activo" : "+ Nuevo Activo"}</div>
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <select className="form-select" value={form.type} onChange={e=>set("type",e.target.value)}>
            <option value="stock">📈 Acciones</option>
            <option value="crypto">₿ Crypto</option>
            <option value="real_estate">🏢 Inmobiliario</option>
            <option value="fund">🏦 Fondos de inversión</option>
          </select>
        </div>

        {/* CAMPOS COMUNES */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Nombre</label>
            <input className="form-input"
              placeholder={isRE ? "Apto. Madrid Centro" : isFund ? "Vanguard Global Stock" : "Apple Inc."}
              value={form.name} onChange={e=>set("name",e.target.value)} />
          </div>
          {!isRE && (
            <div className="form-group">
              <label className="form-label">{isFund ? "ISIN / Ticker" : "Ticker / ID"}</label>
              <input className="form-input"
                placeholder={isFund ? "ES0173323000" : "AAPL"}
                value={form.ticker}
                onChange={e => set("ticker", e.target.value.toUpperCase().replace(isFund ? /[^A-Z0-9]/g : /[^A-Z.\-]/g, ""))}
              />
            </div>
          )}
        </div>

        {/* CAMPOS SÓLO PARA INMOBILIARIO */}
        {isRE && (
          <>
            <div className="form-group">
              <label className="form-label">Dirección</label>
              <input className="form-input" placeholder="Calle Gran Vía 1, Madrid" value={form.address} onChange={e=>set("address",e.target.value)} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Renta mensual</label>
                <input className="form-input" type="number" placeholder="1200" value={form.rent} onChange={e=>set("rent",e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Costes mensuales</label>
                <input className="form-input" type="number" placeholder="300" value={form.monthly_costs} onChange={e=>set("monthly_costs",e.target.value)} />
              </div>
            </div>
            {(form.rent || form.monthly_costs) && (
              <div className="form-group">
                <label className="form-label">Ingreso neto (calculado)</label>
                <input className="form-input" readOnly value={`${((parseFloat(form.rent)||0) - (parseFloat(form.monthly_costs)||0)).toLocaleString()} / mes`} style={{opacity:0.7}} />
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha de compra</label>
                <input className="form-input" type="date" value={form.purchase_date} onChange={e=>set("purchase_date",e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Moneda</label>
                <select className="form-select" value={form.currency} onChange={e=>set("currency",e.target.value)}>
                  <option value="EUR">EUR €</option>
                  <option value="USD">USD $</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* CAMPOS SÓLO PARA NO INMOBILIARIO */}
        {!isRE && (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{isFund ? "Participaciones" : "Cantidad"}</label>
              <input className="form-input" type="number" placeholder={isFund ? "150.5" : "10"} value={form.quantity} onChange={e=>set("quantity",e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Moneda</label>
              <select className="form-select" value={form.currency} onChange={e=>set("currency",e.target.value)}>
                <option value="USD">USD $</option>
                <option value="EUR">EUR €</option>
                <option value="MXN">MXN $</option>
              </select>
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{isFund ? "Precio de compra / participación" : "Precio compra"}</label>
            <input className="form-input" type="number" placeholder={isRE ? "180000" : isFund ? "12.50" : "150"} value={form.buy_price} onChange={e=>set("buy_price",e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{isFund ? "Valor liquidativo actual" : "Valor actual"}</label>
            {!isRE ? (
              <div style={{display:"flex", gap:6}}>
                <input className="form-input" type="number" placeholder={isFund ? "14.80" : "189"} value={form.current_price} onChange={e=>set("current_price",e.target.value)} style={{flex:1, minWidth:0}} />
                <button
                  type="button"
                  onClick={handleFetchPrice}
                  disabled={fetchingPrice || !form.ticker}
                  title="Obtener precio actual"
                  style={{background:"var(--card)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, color: !form.ticker ? "var(--muted)" : "var(--green)", fontSize:16, cursor: fetchingPrice || !form.ticker ? "default" : "pointer", padding:"0 12px", whiteSpace:"nowrap"}}
                >{fetchingPrice ? "⏳" : "🔄"}</button>
              </div>
            ) : (
              <input className="form-input" type="number" placeholder="210000" value={form.current_price} onChange={e=>set("current_price",e.target.value)} />
            )}
          </div>
        </div>

        {isRE && (
          <div className="form-group">
            <label className="form-label">Notas</label>
            <textarea className="form-input" placeholder="Observaciones, inquilinos, reformas..." value={form.notes} onChange={e=>set("notes",e.target.value)} rows={3} style={{resize:"vertical"}} />
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSubmit}>{editMode ? "Guardar cambios" : "Guardar activo"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ user, onLogout }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [displayCurrency, setDisplayCurrency] = useState(
    () => localStorage.getItem("display_currency") || "USD"
  );
  const [fxRate, setFxRate] = useState(
    () => parseFloat(localStorage.getItem("fx_rate")) || 1.17
  );
  const [fxInput, setFxInput] = useState(
    () => localStorage.getItem("fx_rate") || "1.17"
  );
  const [editingFx, setEditingFx] = useState(false);

  const toDisplay = (amount, assetCurrency = "USD") => {
    if (!assetCurrency || assetCurrency === displayCurrency) return amount;
    if (assetCurrency === "USD" && displayCurrency === "EUR") return amount / fxRate;
    if (assetCurrency === "EUR" && displayCurrency === "USD") return amount * fxRate;
    return amount;
  };

  const handleCurrencyToggle = (cur) => {
    setDisplayCurrency(cur);
    localStorage.setItem("display_currency", cur);
  };

  const handleFxUpdate = () => {
    const rate = parseFloat(fxInput);
    if (!rate || rate <= 0) return;
    setFxRate(rate);
    localStorage.setItem("fx_rate", rate.toString());
    setEditingFx(false);
  };

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await sb.getAssets();
      setAssets(data);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const totalCurrent = assets.reduce((s, a) => s + toDisplay(a.quantity * a.current_price, a.currency), 0);
  const totalInvested = assets.reduce((s, a) => s + toDisplay(a.quantity * a.buy_price, a.currency), 0);
  const totalROI = totalInvested > 0 ? calcROI(totalInvested, totalCurrent) : 0;
  const totalGain = totalCurrent - totalInvested;

  const typeTotal = (type) => assets.filter(a => a.type === type).reduce((s, a) => s + toDisplay(a.quantity * a.current_price, a.currency), 0);
  const filtered = filter === "all" ? assets : assets.filter(a => a.type === filter);

  const handleUpdatePrices = async () => {
    const updatable = assets.filter(a => a.type !== 'real_estate');
    if (!updatable.length) return;
    setUpdatingPrices(true);
    try {
      const newPrices = {};
      // Crypto via CoinGecko (batch)
      const cryptoPrices = await fetchCryptoPrices(updatable);
      Object.assign(newPrices, cryptoPrices);
      // Stocks & funds via Yahoo Finance (parallel)
      const stockAssets = updatable.filter(a => (a.type === 'stock' || a.type === 'fund') && a.ticker);
      const results = await Promise.allSettled(
        stockAssets.map(a => fetchStockPrice(a.ticker).then(price => ({ id: a.id, price })))
      );
      results.forEach(r => { if (r.status === 'fulfilled' && r.value.price != null) newPrices[r.value.id] = r.value.price; });
      // Persist to Supabase and update local state
      const updates = Object.entries(newPrices);
      if (!updates.length) { alert("No se pudieron obtener precios. Comprueba los tickers."); return; }
      await Promise.allSettled(updates.map(([id, price]) => sb.updateAsset(id, { current_price: price })));
      setAssets(prev => prev.map(a => newPrices[a.id] != null ? { ...a, current_price: newPrices[a.id] } : a));
      setLastUpdate(new Date());
    } catch(e) { alert(e.message); }
    finally { setUpdatingPrices(false); }
  };

  const ACCUMULABLE_TYPES = ["stock", "crypto", "fund"];

  const handleAdd = async (asset) => {
    try {
      if (ACCUMULABLE_TYPES.includes(asset.type)) {
        const existing = assets.find(
          a => a.type === asset.type && a.ticker === asset.ticker && a.currency === asset.currency
        );
        if (existing) {
          const newQuantity = existing.quantity + asset.quantity;
          const newBuyPrice = (existing.quantity * existing.buy_price + asset.quantity * asset.buy_price) / newQuantity;
          const updated = await sb.updateAsset(existing.id, {
            quantity: newQuantity,
            buy_price: parseFloat(newBuyPrice.toFixed(6)),
            current_price: asset.current_price,
          });
          setAssets(prev => prev.map(a => a.id === existing.id ? { ...a, ...updated } : a));
          return;
        }
      }
      const saved = await sb.addAsset(asset);
      setAssets(prev => [saved, ...prev]);
    } catch(e) { alert(e.message); }
  };

  const handleUpdate = async (id, fields) => {
    try {
      const updated = await sb.updateAsset(id, fields);
      setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
    } catch(e) { alert(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este activo?")) return;
    try {
      await sb.deleteAsset(id);
      setAssets(prev => prev.filter(a => a.id !== id));
    } catch(e) { alert(e.message); }
  };

  const handleLogout = async () => { await sb.signOut(); onLogout(); };

  return (
    <div className="app">
      <style>{styles}</style>
      <nav className="topbar">
        <div className="topbar-brand">my<span>folio</span></div>
        <div className="topbar-right">
          <div className="avatar">{user.avatar}</div>
          <button className="btn-logout" onClick={handleLogout}>salir</button>
        </div>
      </nav>

      <main className="main">
        {/* HERO */}
        <div className="hero">
          <div className="hero-label">Portafolio total</div>
          <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
            <div className="hero-total">{loading ? "—" : fmtMoney(totalCurrent, displayCurrency)}</div>
            <div style={{display:"flex", gap:4}}>
              {["USD","EUR"].map(cur => (
                <button key={cur} onClick={() => handleCurrencyToggle(cur)} style={{
                  background: displayCurrency === cur ? "var(--green)" : "rgba(255,255,255,0.08)",
                  color: displayCurrency === cur ? "#000" : "var(--muted)",
                  border: "none", borderRadius: 6, padding: "3px 10px",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 1
                }}>{cur}</button>
              ))}
            </div>
          </div>
          <div className="hero-row">
            <span className={`badge-roi ${totalROI >= 0 ? "pos" : "neg"}`}>
              {totalROI >= 0 ? "▲" : "▼"} {fmt(Math.abs(totalROI))}%
            </span>
            <span className={`hero-invested ${totalGain >= 0 ? "pos" : "neg"}`}>
              {totalGain >= 0 ? "+" : ""}{fmtMoney(totalGain, displayCurrency)} ganancia total
            </span>
          </div>
          <div className="hero-invested" style={{marginTop:6}}>
            Invertido: {fmtMoney(totalInvested, displayCurrency)}
          </div>
          {/* TASA DE CAMBIO */}
          <div style={{display:"flex", alignItems:"center", gap:6, marginTop:10, fontSize:12, color:"var(--muted)"}}>
            <span>1 EUR =</span>
            {editingFx ? (
              <>
                <input
                  type="number" step="0.01" value={fxInput}
                  onChange={e => setFxInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleFxUpdate()}
                  style={{width:60, background:"var(--card)", border:"1px solid var(--accent)", color:"var(--fg)", borderRadius:4, padding:"2px 6px", fontSize:12}}
                />
                <span>USD</span>
                <button onClick={handleFxUpdate} style={{background:"none",border:"none",color:"var(--green)",cursor:"pointer",fontSize:14,padding:0}}>✓</button>
                <button onClick={() => setEditingFx(false)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
              </>
            ) : (
              <>
                <span style={{color:"var(--fg)", fontWeight:600}}>{fxRate} USD</span>
                <button onClick={() => { setFxInput(fxRate.toString()); setEditingFx(true); }}
                  style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:12,padding:0}}>
                  ✏️
                </button>
              </>
            )}
          </div>
        </div>

        {/* PILLS */}
        <div className="pills">
          {Object.entries(TYPE_META).map(([type, meta]) => {
            const val = typeTotal(type);
            const pct = totalCurrent > 0 ? (val / totalCurrent * 100) : 0;
            return (
              <div
                key={type}
                className={`pill ${filter === type ? "active" : ""}`}
                style={filter === type ? {borderColor: meta.color} : {}}
                onClick={() => setFilter(filter === type ? "all" : type)}
              >
                <div className="pill-icon">{meta.icon}</div>
                <div className="pill-label">{meta.label}</div>
                <div className="pill-value" style={{color: meta.color}}>{fmtMoney(val, displayCurrency)}</div>
                <div className="pill-pct">{fmt(pct, 1)}% del total</div>
              </div>
            );
          })}
        </div>

        {/* ASSET LIST */}
        <div className="section-head">
          <div>
            <div className="section-title">Mis activos</div>
            {lastUpdate && (
              <div style={{fontSize:10, color:"var(--muted)", marginTop:2}}>
                Actualizado: {lastUpdate.toLocaleTimeString("es-ES", {hour:"2-digit", minute:"2-digit"})}
              </div>
            )}
          </div>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <div className="filter-tabs">
              <button className={`tab ${filter==="all"?"active":""}`} onClick={()=>setFilter("all")}>Todos</button>
            </div>
            <button
              onClick={handleUpdatePrices}
              disabled={updatingPrices}
              title="Actualizar precios"
              style={{background:"none", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, color: updatingPrices ? "var(--muted)" : "var(--green)", fontSize:16, cursor: updatingPrices ? "default" : "pointer", padding:"4px 10px", lineHeight:1}}
            >{updatingPrices ? "⏳" : "🔄"}</button>
          </div>
        </div>

        <div className="asset-list">
          {loading ? (
            <div className="empty">Cargando activos...</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              Sin activos{filter !== "all" ? " en esta categoría" : ""}<br/>
              Toca <strong style={{color:"var(--green)"}}>+</strong> para agregar
            </div>
          ) : filtered.map(asset => {
            const meta = TYPE_META[asset.type] || TYPE_META.stock;
            const value = asset.quantity * asset.current_price;
            const roi = calcROI(asset.buy_price, asset.current_price);
            const gain = (asset.current_price - asset.buy_price) * asset.quantity;
            return (
              <div key={asset.id} className="asset-card" style={{position:"relative"}}>
                <div className="asset-icon" style={{background: meta.bg}}>{meta.icon}</div>
                <div className="asset-info">
                  <div className="asset-name">{asset.name}</div>
                  <div className="asset-meta">
                    {asset.ticker} · {fmt(asset.quantity, asset.type==="real_estate"?0:4)} {asset.type==="fund"?"part.":"uds"}
                  </div>
                  <div style={{fontSize:11, color:"var(--muted)", marginTop:2}}>
                    Precio: {fmtMoney(asset.current_price, asset.currency)}
                  </div>
                </div>
                <div className="asset-right">
                  <div className="asset-value">{fmtMoney(value, asset.currency)}</div>
                  <div className={`asset-roi ${roi >= 0 ? "pos" : "neg"}`}>
                    {roi >= 0 ? "▲" : "▼"} {fmt(Math.abs(roi))}%
                    &nbsp;({gain >= 0 ? "+" : ""}{fmtMoney(gain, asset.currency)})
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingAsset(asset); }}
                      style={{background:"none",border:"none",color:"var(--muted)",fontSize:16,cursor:"pointer",padding:0}}
                      title="Editar"
                    >✏️</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                      style={{background:"none",border:"none",color:"var(--muted)",fontSize:16,cursor:"pointer",padding:0}}
                      title="Eliminar"
                    >🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <button className="btn-add" onClick={() => setShowModal(true)}>+</button>
      {showModal && <AddAssetModal onClose={() => setShowModal(false)} onAdd={handleAdd} />}
      {editingAsset && <AddAssetModal asset={editingAsset} onClose={() => setEditingAsset(null)} onEdit={handleUpdate} />}
    </div>
  );
}

// ============================================================
// ROOT
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Restaurar sesión guardada
    const s = sb.restoreSession();
    if (s) {
      const initials = s.email.split("@")[0].slice(0,2).toUpperCase();
      setUser({ name: s.email.split("@")[0], email: s.email, avatar: initials });
    }
    setChecking(false);
  }, []);

  const handleLogin = (userData) => setUser(userData);
  const handleLogout = () => setUser(null);

  if (checking) return (
    <>
      <style>{styles}</style>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg)",color:"var(--muted)",fontFamily:"'DM Mono',monospace",fontSize:13}}>
        Cargando...
      </div>
    </>
  );

  if (!user) return (
    <>
      <style>{styles}</style>
      <LoginScreen onDemo={() => handleLogin({ name: "Demo", email: "demo@example.com", avatar: "DE" })} onLogin={handleLogin} />
    </>
  );

  return <Dashboard user={user} onLogout={handleLogout} />;
}
