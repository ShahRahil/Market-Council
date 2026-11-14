import {config} from './config.js';
// Clearly marked ILLUSTRATIVE snapshots; not intended to resemble current market prices.
const sample={
 'AAPL':[200,-1.1], 'MSFT':[420,0.8], 'NVDA':[135,2.3], 'AMZN':[205,-0.7],
 'GOOGL':[175,1.4], 'META':[515,-0.4], 'JPM':[238,0.9], 'V':[300,0.2],
 'RY.TO':[165,0.6], 'TD.TO':[82,-0.5], 'SHOP.TO':[125,1.8], 'ENB.TO':[60,-0.2],
 'BNS.TO':[70,0.3], 'CNQ.TO':[43,-0.8], 'SPY':[600,0.2], 'QQQ':[520,0.4],
 'VTI':[290,0.1], 'XLF':[48,-0.1], 'XIU.TO':[38,0.4], 'XIC.TO':[37,0.3]
};
const cache = new Map();
const FINNHUB_ROOT = 'https://finnhub.io/api/v1';

function apiError(message, statusCode = 502) {
  return Object.assign(new Error(message), { statusCode });
}

async function finnhub(path, params) {
  if (!config.finnhubKey) throw apiError('Set FINNHUB_API_KEY to use DATA_MODE=finnhub', 503);
  const url = new URL(`${FINNHUB_ROOT}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  let response;
  try {
    // The key belongs only on the backend, never in the URL, browser, or app logs.
    response = await fetch(url, {
      headers: { 'X-Finnhub-Token': config.finnhubKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(9000)
    });
  } catch (error) {
    throw apiError(`Finnhub connection failed: ${error.name === 'TimeoutError' ? 'request timed out' : 'network unavailable'}`, 502);
  }
  if (!response.ok) {
    if (response.status === 429) throw apiError('Finnhub free-tier rate limit reached; please try again shortly', 429);
    if (response.status === 401) throw apiError('Finnhub API key was rejected', 503);
    if (response.status === 403) throw apiError('Finnhub plan does not cover this data or exchange', 424);
    throw apiError(`Finnhub returned HTTP ${response.status}`, 502);
  }
  const result = await response.json().catch(() => { throw apiError('Finnhub returned invalid JSON'); });
  if (result?.error || result?.message) throw apiError(`Finnhub: ${String(result.error || result.message).slice(0, 160)}`, 424);
  return result;
}

function validTimestamp(epoch) {
  if (!Number.isFinite(Number(epoch)) || Number(epoch) <= 0) return null;
  const parsed = new Date(Number(epoch) * 1000);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function normalizeFinnhubQuote(raw, security) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !(Number(raw.c) > 0)) {
    throw apiError(`Finnhub returned no usable quote for ${security.symbol}. Free-tier Canadian coverage may be unavailable.`, 424);
  }
  const price = Number(raw.c);
  const previousClose = Number(raw.pc);
  const fallbackPercent = previousClose > 0 ? 100 * (price - previousClose) / previousClose : 0;
  const changePercentage = Number.isFinite(Number(raw.dp)) ? Number(raw.dp) : fallbackPercent;
  // A quote endpoint is not guaranteed to be streaming. Keep its provider trade time visible.
  return {
    symbol: security.symbol, name: security.name, price, changePercentage,
    source: 'FINNHUB', asOf: validTimestamp(raw.t), currency: security.currency,
    market: security.market, type: security.type,
    previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : null,
    dayHigh: Number(raw.h) > 0 ? Number(raw.h) : null,
    dayLow: Number(raw.l) > 0 ? Number(raw.l) : null,
    dataNote: 'Latest provider quote. Availability and delay depend on exchange/market hours/plan.'
  };
}

export function normalizeFinnhubNews(raw) {
  if (!Array.isArray(raw)) throw apiError('Finnhub returned unexpected company-news response', 502);
  return raw.filter(a => a && typeof a.headline === 'string' && a.headline.trim())
    .slice(0, 5)
    .map(a => ({
      title: a.headline.slice(0, 240),
      publishedDate: validTimestamp(a.datetime),
      url: typeof a.url === 'string' && /^https:\/\//i.test(a.url) ? a.url : null,
      publisher: String(a.source || 'Unknown source').slice(0, 80),
      summary: String(a.summary || '').slice(0, 400)
    }));
}

export async function getQuote(security) {
  if (config.dataMode !== 'finnhub') {
    const [price, changePercentage] = sample[security.symbol] || [100, 0];
    return { symbol: security.symbol, name: security.name, price, changePercentage,
      source: 'SAMPLE_DATA', asOf: null, currency: security.currency,
      market: security.market, type: security.type,
      dataNote: 'Illustrative sample values, not a market quote.' };
  }
  if (!config.finnhubKey) throw apiError('Set FINNHUB_API_KEY to use DATA_MODE=finnhub', 503);
  const key = `q:${security.symbol}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 60_000) return cached.data;
  const quote = normalizeFinnhubQuote(await finnhub('quote', { symbol: security.symbol }), security);
  cache.set(key, { time: Date.now(), data: quote });
  return quote;
}

export async function getNews(security) {
  if (config.dataMode !== 'finnhub') return {
    source: 'SAMPLE_DATA', articles: [], note: 'No news source connected; sample mode does not invent headlines.'
  };
  const key = `n:${security.symbol}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 300_000) return cached.data;
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 86400_000);
  const date = d => d.toISOString().slice(0, 10);
  try {
    const articles = normalizeFinnhubNews(await finnhub('company-news', {
      symbol: security.symbol, from: date(start), to: date(end)
    }));
    const result = { source: 'FINNHUB', articles,
      note: articles.length ? '' : 'No company headlines returned for the last 14 days.' };
    cache.set(key, { time: Date.now(), data: result });
    return result;
  } catch (error) {
    // News is optional, but failures must be visible and never synthesized as real headlines.
    const result = { source: 'FINNHUB', articles: [], note: `Company news unavailable: ${error.message}` };
    // Cache briefly on error to prevent a failing external service from being hammered.
    cache.set(key, { time: Date.now() - 240_000, data: result });
    return result;
  }
}
