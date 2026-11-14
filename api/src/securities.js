// Curated starter universe, not index membership or a comprehensive security master.
export const SECURITIES = Object.freeze([
  {symbol:'AAPL',name:'Apple',market:'US',type:'Stock',currency:'USD'},
  {symbol:'MSFT',name:'Microsoft',market:'US',type:'Stock',currency:'USD'},
  {symbol:'NVDA',name:'NVIDIA',market:'US',type:'Stock',currency:'USD'},
  {symbol:'AMZN',name:'Amazon',market:'US',type:'Stock',currency:'USD'},
  {symbol:'GOOGL',name:'Alphabet',market:'US',type:'Stock',currency:'USD'},
  {symbol:'META',name:'Meta Platforms',market:'US',type:'Stock',currency:'USD'},
  {symbol:'JPM',name:'JPMorgan Chase',market:'US',type:'Stock',currency:'USD'},
  {symbol:'V',name:'Visa',market:'US',type:'Stock',currency:'USD'},
  {symbol:'RY.TO',name:'Royal Bank of Canada',market:'Canada',type:'Stock',currency:'CAD'},
  {symbol:'TD.TO',name:'Toronto-Dominion Bank',market:'Canada',type:'Stock',currency:'CAD'},
  {symbol:'SHOP.TO',name:'Shopify',market:'Canada',type:'Stock',currency:'CAD'},
  {symbol:'ENB.TO',name:'Enbridge',market:'Canada',type:'Stock',currency:'CAD'},
  {symbol:'BNS.TO',name:'Scotiabank',market:'Canada',type:'Stock',currency:'CAD'},
  {symbol:'CNQ.TO',name:'Canadian Natural Resources',market:'Canada',type:'Stock',currency:'CAD'},
  {symbol:'SPY',name:'SPDR S&P 500 ETF',market:'US',type:'ETF',currency:'USD'},
  {symbol:'QQQ',name:'Invesco QQQ',market:'US',type:'ETF',currency:'USD'},
  {symbol:'VTI',name:'Vanguard Total Stock Market',market:'US',type:'ETF',currency:'USD'},
  {symbol:'XLF',name:'Financial Select Sector SPDR',market:'US',type:'ETF',currency:'USD'},
  {symbol:'XIU.TO',name:'iShares S&P/TSX 60 ETF',market:'Canada',type:'ETF',currency:'CAD'},
  {symbol:'XIC.TO',name:'iShares Core S&P/TSX Capped Composite ETF',market:'Canada',type:'ETF',currency:'CAD'}
]);
export function findSecurity(symbol){return SECURITIES.find(s=>s.symbol===String(symbol||'').trim().toUpperCase());}
// Risk model denominates all synthetic account exposures in USD. For CAD symbols, conversion is not assumed.
export function validateRequest(input){
  const security=findSecurity(input?.symbol);
  const notionalUsd=Number(input?.notionalUsd);
  const proposerId=String(input?.proposerId||'portfolio-agent');
  const side=String(input?.side||'BUY').toUpperCase();
  if(!['BUY','SELL'].includes(side)) throw Object.assign(new Error('Only BUY and SELL paper reviews are supported.'),{statusCode:400});
  if(!security) throw Object.assign(new Error('Select a security from the supported universe.'),{statusCode:400});
  if(!Number.isFinite(notionalUsd)||notionalUsd<1||notionalUsd>100000||Math.round(notionalUsd*100)!==notionalUsd*100)
    throw Object.assign(new Error('Enter a USD notional between $1 and $100,000 with at most two decimals.'),{statusCode:400});
  if(!/^[a-z]+(?:-[a-z]+)*$/.test(proposerId) || proposerId.length>50)
    throw Object.assign(new Error('Invalid agent identity.'),{statusCode:400});
  return {security,notionalUsd,proposerId,side,recommendationId:input?.recommendationId||null};
}
