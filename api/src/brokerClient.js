import { config } from './config.js';
async function request(path, options={}) {
  const response = await fetch(`${config.brokerUrl}${path}`, {
    ...options,
    headers: { 'content-type':'application/json', 'x-broker-secret':config.brokerSecret, ...(options.headers || {}) },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error(`Simulated broker returned HTTP ${response.status}`);
  return response.json();
}
export async function submitPaperOrder(order) {
  return request('/orders', { method:'POST', body: JSON.stringify(order) });
}
export async function fetchPaperOrder(clientOrderId) {
  return request(`/orders/${encodeURIComponent(clientOrderId)}`);
}
export async function cancelPaperOrder(clientOrderId) {
  return request(`/orders/${encodeURIComponent(clientOrderId)}/cancel`, { method:'POST' });
}
