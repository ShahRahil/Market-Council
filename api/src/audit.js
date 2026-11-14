import { database } from './db.js';
export async function audit(runId, eventType, actor, details = {}) {
  const entry = { runId, eventType, actor, details, createdAt: new Date() };
  // The application never exposes audit deletion/update APIs. This is NOT a tamper-proof WORM ledger.
  await database().collection('audit_events').insertOne(entry);
  return entry;
}
export async function sendMessage(runId, from, to, kind, body) {
  const message = { runId, from, to, kind, body, createdAt: new Date() };
  await database().collection('agent_messages').insertOne(message);
  await audit(runId, 'AGENT_MESSAGE', from, { to, kind });
  return message;
}
