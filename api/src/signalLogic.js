/**
 * Auditable SCREENING HEURISTIC; not a price forecast, a calibrated probability,
 * or an investment recommendation. Only verified quote fields and headlines are inputs.
 */
const POSITIVE = ['beats estimates', 'raises guidance', 'record revenue', 'profit rises', 'earnings beat', 'upgrade', 'raises dividend', 'buyback', 'strong demand', 'contract win'];
const NEGATIVE = ['misses estimates', 'cuts guidance', 'profit falls', 'earnings miss', 'downgrade', 'cuts dividend', 'investigation', 'recall', 'layoffs', 'weak demand'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function headlineSignals(articles = []) {
  let positive = 0, negative = 0;
  const matched = [];
  for (const article of articles.slice(0,5)) {
    const title = String(article.title || '').toLowerCase();
    const pos = POSITIVE.find(k => title.includes(k));
    const neg = NEGATIVE.find(k => title.includes(k));
    if (pos && !neg) positive++;
    if (neg && !pos) negative++;
    if (pos || neg) matched.push({ title: article.title, phrase: pos || neg, direction: pos && !neg ? 'POSITIVE' : neg && !pos ? 'NEGATIVE' : 'MIXED' });
  }
  return { positive, negative, matched };
}

export function scoreSecurity({ security, quote, news, account }) {
  if (!quote || !(Number(quote.price) > 0) || !Number.isFinite(Number(quote.changePercentage))) {
    throw new Error('No usable verified price data; cannot calculate signal');
  }
  const dayChange = clamp(Number(quote.changePercentage),-15,15);
  const momentumPoints = Math.round(clamp(dayChange * 9, -22, 22));
  const headlines = headlineSignals(news?.articles || []);
  const newsPoints = clamp((headlines.positive - headlines.negative) * 7, -14, 14);
  const rangePct = quote.dayHigh > 0 && quote.dayLow > 0 && quote.price > 0
    ? 100 * (quote.dayHigh - quote.dayLow) / quote.price : null;
  const volatilityPenalty = (rangePct != null && rangePct > 6) ? 4 : 0;
  const score = clamp(50 + momentumPoints + newsPoints - volatilityPenalty,0,100);
  const heldUsd = Number(account?.positions?.find(p=>p.symbol===security.symbol)?.value || 0);
  // Never suggest a sale of something the fictional paper account does not own.
  const signal = score >= 63 ? 'BUY' : score <= 42 && heldUsd > 0 ? 'SELL' : 'HOLD';
  const hasHeadlines = (news?.articles?.length || 0) > 0;
  const dataGrade = quote.source === 'SAMPLE_DATA' ? 'SAMPLE' : hasHeadlines && (headlines.positive + headlines.negative > 0) ? 'LIMITED' : 'LOW';
  const explanations = [
    `Latest daily move ${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}% contributes ${momentumPoints >= 0 ? '+' : ''}${momentumPoints} screening points.`,
    headlines.positive || headlines.negative
      ? `Keyword matches in ${headlines.positive} positive and ${headlines.negative} negative headline(s) contribute ${newsPoints >= 0 ? '+' : ''}${newsPoints} points.`
      : 'No directional keyword matches in available company headlines; news contributes zero points.',
    volatilityPenalty ? 'Wide reported intraday range reduces the score.' : 'No additional intraday-range penalty was applied.',
    signal === 'SELL' ? 'The paper account has a holding; this is a research suggestion to consider reducing it.'
      : signal === 'HOLD' ? 'Available evidence does not meet this screen’s buy/sell thresholds.'
      : 'This stock met the screen’s positive threshold; portfolio controls still decide if a paper purchase is allowed.'
  ];
  const caveats = [
    'Heuristic based mainly on a one-day move and simple headline keywords; it is NOT a validated prediction or personalized financial advice.',
    quote.source === 'SAMPLE_DATA' ? 'Prices are synthetic examples, not market data.' : 'Data may be delayed. Source and last trade time are shown.',
    !hasHeadlines ? (news?.note || 'No current company headlines available.') : 'Headlines are weak signals; article contents were not independently fact-checked.',
    security.currency !== 'USD' ? 'Paper positions use USD notional; CAD/USD currency conversion is not modeled.' : null
  ].filter(Boolean);
  return {
    signal, score, dataGrade, heldUsd, quote, security,
    signals: {dayChangePct:dayChange,momentumPoints,newsPoints,newsPositive:headlines.positive,
      newsNegative:headlines.negative,volatilityPenalty,rangePct},
    explanations, caveats,
    articles: (news?.articles || []).slice(0,5),
    newsSource: news?.source || 'UNKNOWN', newsNote: news?.note || '',
    methodology:'SCREEN_V1_ONE_DAY_MOMENTUM_HEADLINE_KEYWORDS',
    modelVersion:1
  };
}
export function validateScanSymbols(symbols, finder) {
  if (!Array.isArray(symbols) || symbols.length < 2 || symbols.length > 10) {
    throw Object.assign(new Error('Choose between 2 and 10 distinct securities per scan.'), {statusCode:400});
  }
  const normalized = symbols.map(s => String(s || '').toUpperCase().trim());
  if (new Set(normalized).size !== normalized.length || normalized.some(s => !finder(s))) {
    throw Object.assign(new Error('Every security must be unique and belong to the supported universe.'),{statusCode:400});
  }
  return normalized;
}
