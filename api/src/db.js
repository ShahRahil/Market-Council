import { MongoClient } from 'mongodb';
import { config } from './config.js';
let client, db;

const auditSchema = { $jsonSchema: {
  bsonType: 'object',
  required: ['runId','eventType','actor','details','createdAt'],
  properties: {
    runId: { bsonType: 'string' },
    eventType: { bsonType: 'string' },
    actor: { bsonType: 'string' },
    details: { bsonType: 'object' },
    createdAt: { bsonType: 'date' }
  }
}};
const messageSchema = { $jsonSchema: {
  bsonType: 'object', required: ['runId','from','to','kind','body','createdAt'],
  properties: {
    runId: { bsonType: 'string' }, from: { bsonType: 'string' }, to: { bsonType: 'string' },
    kind: { bsonType: 'string' }, body: { bsonType: 'object' }, createdAt: { bsonType: 'date' }
  }
}};
const identitySchema = { $jsonSchema: {
  bsonType:'object', required:['agentId','role','enabled','allowedActions','createdAt'],
  properties: { agentId:{bsonType:'string'}, role:{bsonType:'string'}, enabled:{bsonType:'bool'},
    allowedActions:{bsonType:'array',items:{bsonType:'string'}}, createdAt:{bsonType:'date'} }
}};
const policySchema = { $jsonSchema: {
  bsonType:'object',required:['version','maxPositionPct','maxOrderUsd','humanApprovalRequired','updatedAt'],
  properties:{version:{bsonType:'number',minimum:1},maxPositionPct:{bsonType:'number',minimum:1,maximum:80},
    maxOrderUsd:{bsonType:'number',minimum:100,maximum:10000},humanApprovalRequired:{bsonType:'bool'},updatedAt:{bsonType:'date'}}
}};
const controlSchema = { $jsonSchema: {
  bsonType:'object',required:['killSwitch','revision','updatedAt'],
  properties:{killSwitch:{bsonType:'bool'},revision:{bsonType:'number',minimum:1},updatedAt:{bsonType:'date'}}
}};
const recommendationScanSchema = { $jsonSchema: {
  bsonType:'object',required:['id','symbols','status','createdAt','updatedAt'],
  properties:{id:{bsonType:'string'},symbols:{bsonType:'array',items:{bsonType:'string'}},
    status:{enum:['QUEUED','RUNNING','COMPLETE','PARTIAL','ERROR','INTERRUPTED']},
    createdAt:{bsonType:'date'},updatedAt:{bsonType:'date'}}
}};
const recommendationSchema = { $jsonSchema: {
  bsonType:'object',required:['id','scanId','symbol','signal','createdAt'],
  properties:{id:{bsonType:'string'},scanId:{bsonType:'string'},symbol:{bsonType:'string'},
    signal:{enum:['BUY','SELL','HOLD','UNAVAILABLE']},score:{bsonType:'number',minimum:0,maximum:100},
    createdAt:{bsonType:'date'}}
}};
const runSchema = { $jsonSchema: {
  bsonType:'object', required:['id','scenario','status','createdAt','updatedAt'],
  properties: {
    id:{bsonType:'string'},scenario:{bsonType:'string'},status:{bsonType:'string'},
    createdAt:{bsonType:'date'},updatedAt:{bsonType:'date'}
  }
}};
export async function connectDb() {
  client = new MongoClient(config.mongoUri, { maxPoolSize: 12, serverSelectionTimeoutMS: 15000, retryWrites: true });
  await client.connect();
  db = client.db(config.mongoDb);
  const collections = [
    ['audit_events', auditSchema], ['agent_messages', messageSchema], ['runs', runSchema],
    ['control', controlSchema], ['policies', policySchema], ['agent_identities', identitySchema], ['broker_receipts', null], ['paper_accounts', null],
    ['recommendation_scans',recommendationScanSchema],['recommendations',recommendationSchema]
  ];
  for (const [name, validator] of collections) {
    const existing = await db.listCollections({ name }).hasNext();
    if (!existing) await db.createCollection(name, validator ? { validator, validationAction: 'error', validationLevel: 'strict' } : {});
  }
  await Promise.all([
    db.collection('runs').createIndex({ id: 1 }, { unique: true }),
    db.collection('audit_events').createIndex({ runId: 1, createdAt: 1 }),
    db.collection('agent_messages').createIndex({ runId: 1, createdAt: 1 }),
    db.collection('agent_identities').createIndex({ agentId: 1 }, { unique: true }),
    db.collection('broker_receipts').createIndex({ clientOrderId: 1 }, { unique: true }),
    db.collection('paper_accounts').createIndex({accountId:1},{unique:true}),
    db.collection('recommendation_scans').createIndex({id:1},{unique:true}),
    db.collection('recommendations').createIndex({id:1},{unique:true}),
    db.collection('recommendations').createIndex({scanId:1,symbol:1},{unique:true})
  ]);
  await seed();
  console.log(`MongoDB connected: ${config.mongoDb}`);
  return db;
}
export function database() { if (!db) throw new Error('MongoDB not initialized'); return db; }
export async function closeDb() { await client?.close(); }
async function seed() {
  const now = new Date();
  await db.collection('paper_accounts').updateOne({_id:'primary'},{$setOnInsert:{accountId:'PAPER-001',currency:'USD',totalValue:10000,cash:7450,positions:[{symbol:'AAPL',value:1500},{symbol:'MSFT',value:700},{symbol:'NVDA',value:350}],reservations:[],version:1,createdAt:now}},{upsert:true});
  await db.collection('control').updateOne({ _id: 'global' }, { $setOnInsert: { killSwitch: false, revision: 1, updatedAt: now } }, { upsert: true });
  await db.collection('policies').updateOne({ _id: 'primary' }, { $setOnInsert: { version: 1, maxPositionPct: 20, maxOrderUsd: 2500, humanApprovalRequired: true, updatedAt: now } }, { upsert: true });
  const specs = [
    ['market-agent','Market intelligence',[]],
    ['news-agent','News analyst',[]],
    ['quant-agent','Quant research',[]],
    ['portfolio-agent','Portfolio decision agent',['PROPOSE_PAPER_ORDER']],
    ['risk-agent','Risk challenger',[]],
    ['execution-gateway','Policy enforcement gateway',['EXECUTE_AUTHORIZED_PAPER_ORDER']]
  ];
  for (const [agentId, role, allowedActions] of specs) {
    await db.collection('agent_identities').updateOne({ agentId }, { $setOnInsert: { agentId, role, allowedActions, enabled: true, createdAt: now } }, { upsert: true });
  }
}
