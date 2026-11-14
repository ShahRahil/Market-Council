export const config = {
  port: Number(process.env.PORT || 3001),
  mongoUri: process.env.MONGODB_URI,
  mongoDb: process.env.MONGODB_DB || 'market_council_audit',
  adminToken: process.env.ADMIN_TOKEN,
  brokerSecret: process.env.BROKER_SHARED_SECRET,
  brokerUrl: process.env.BROKER_URL || 'http://broker:3002',
  executionDelayMs: Math.min(30000, Math.max(1000, Number(process.env.EXECUTION_DELAY_MS || 6500))),
  dataMode: process.env.DATA_MODE === 'finnhub' ? 'finnhub' : 'sample',
  finnhubKey: process.env.FINNHUB_API_KEY || '',
  llmEnabled: process.env.ENABLE_LLM === 'true' && !!process.env.OPENAI_API_KEY,
  llmModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini'
};
export function checkConfig() {
  for (const key of ['mongoUri', 'adminToken', 'brokerSecret']) {
    if (!config[key]) throw new Error(`Missing required configuration: ${key}`);
  }
  if (config.adminToken.length < 16 || config.adminToken.startsWith('REPLACE_')) throw new Error('Set a strong ADMIN_TOKEN (at least 16 chars).');
  if (config.brokerSecret.length < 16 || config.brokerSecret.startsWith('REPLACE_')) throw new Error('Set a strong BROKER_SHARED_SECRET (at least 16 chars).');
}
