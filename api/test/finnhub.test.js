import test from 'node:test';
import assert from 'node:assert/strict';

// Other test files run in separate Node test processes. Set env before module import.
process.env.DATA_MODE = 'finnhub';
process.env.FINNHUB_API_KEY = 'test-key-not-for-network';
const {config} = await import('../src/config.js');
const {getQuote,getNews,normalizeFinnhubQuote,normalizeFinnhubNews} = await import('../src/marketData.js');
const apple = {symbol:'AAPL',name:'Apple',market:'US',type:'Stock',currency:'USD'};

test('maps Finnhub quote fields, timestamps and keeps source', () => {
  const result = normalizeFinnhubQuote({c:200,dp:1.5,pc:197,h:202,l:195,t:1720000000},apple);
  assert.equal(result.price,200);
  assert.equal(result.source,'FINNHUB');
  assert.equal(result.changePercentage,1.5);
  assert.equal(result.asOf,new Date(1720000000*1000).toISOString());
  assert.equal(result.previousClose,197);
});

test('rejects empty and unavailable quotes rather than inventing prices',()=>{
  assert.throws(()=>normalizeFinnhubQuote({c:0,t:0},apple),/no usable quote/);
  assert.throws(()=>normalizeFinnhubQuote({error:'You do not have access'},apple),/no usable quote/);
});

test('maps Finnhub company headlines, rejects unsafe URLs',()=>{
  const result = normalizeFinnhubNews([{headline:'Earnings update',summary:'A summary',datetime:1720000000,source:'Reuters',url:'https://example.org/story'}, {headline:'Other',url:'javascript:alert(1)'}]);
  assert.equal(result.length,2);
  assert.equal(result[0].publisher,'Reuters');
  assert.equal(result[1].url,null);
});

test('uses X-Finnhub-Token on the server; quote cache avoids repeat call',async()=>{
  const original=globalThis.fetch;
  let requests=0;
  try{
    globalThis.fetch=async(url,options)=>{
      requests++;
      assert.equal(options.headers['X-Finnhub-Token'],config.finnhubKey);
      assert.equal(url.searchParams.has('token'),false);
      assert.equal(url.pathname,'/api/v1/quote');
      return {ok:true,json:async()=>({c:188,dp:-0.3,pc:190,t:1720000000})};
    };
    const google = {symbol:'GOOGL',name:'Alphabet',market:'US',type:'Stock',currency:'USD'};
    const q1=await getQuote(google);
    const q2=await getQuote(google);
    assert.equal(q1.price,188);
    assert.deepEqual(q1,q2);
    assert.equal(requests,1);
  } finally {globalThis.fetch=original;}
});

test('quote permission error fails visibly (no silent fallback)',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>({ok:false,status:403});
    await assert.rejects(getQuote({symbol:'RY.TO',name:'Royal Bank',market:'Canada',type:'Stock',currency:'CAD'}),/plan does not cover/);
  }finally{globalThis.fetch=original;}
});

test('fetches company news with valid date range and no token in URL',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async(url,opts)=>{
      assert.equal(url.pathname,'/api/v1/company-news');
      assert.equal(url.searchParams.get('symbol'),'MSFT');
      assert.match(url.searchParams.get('from'),/^\d{4}-\d{2}-\d{2}$/);
      assert.equal(opts.headers['X-Finnhub-Token'],'test-key-not-for-network');
      return {ok:true,json:async()=>[{headline:'New research note',source:'Publisher',datetime:1720000000,url:'https://example.org'}]};
    };
    const r=await getNews({symbol:'MSFT'});
    assert.equal(r.source,'FINNHUB');
    assert.equal(r.articles[0].title,'New research note');
  } finally {globalThis.fetch=original;}
});

test('news error is labelled unavailable, never substituted with fake headlines',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>({ok:false,status:403});
    const r=await getNews({symbol:'SHOP.TO'});
    assert.equal(r.articles.length,0);
    assert.match(r.note,/unavailable/);
  } finally {globalThis.fetch=original;}
});
