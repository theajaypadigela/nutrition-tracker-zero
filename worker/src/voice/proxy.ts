import { HttpError } from '../http';

/** Authenticated backend relay for inference-only keys. No key or provider error body reaches the app. */
export async function connectDeepgramProxy(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'websocket_required', 'A WebSocket connection is required');
  if ((env.ON_DEVICE as string) === '1' || !env.DEEPGRAM_API_KEY) throw new HttpError(503, 'voice_not_configured', 'Configure the hosted voice backend');
  const upstream = await fetch('https://agent.deepgram.com/v1/agent/converse', {
    headers: { Upgrade: 'websocket', Authorization: `Token ${env.DEEPGRAM_API_KEY}` },
  });
  const agent = upstream.webSocket;
  if (upstream.status !== 101 || !agent) throw new HttpError(502, 'voice_connect_failed', 'Deepgram could not connect. Check the backend key and credit');
  const pair = new WebSocketPair();
  const client = pair[0], server = pair[1];
  agent.binaryType = 'arraybuffer';
  server.binaryType = 'arraybuffer';
  agent.accept(); server.accept();
  let ended = false;
  const close = (code = 1000, reason = 'Voice call ended') => {
    if (ended) return;
    ended = true; clearTimeout(limit);
    try { server.close(code, reason); } catch { /* already closed */ }
    try { agent.close(code, reason); } catch { /* already closed */ }
  };
  const limit = setTimeout(() => close(1000, 'Maximum call duration reached'), 600000);
  const relay = (to: WebSocket, data: string | ArrayBuffer) => {
    if (ended) return;
    if ((typeof data === 'string' ? data.length : data.byteLength) > 256000) { close(1009, 'Voice message too large'); return; }
    try { to.send(data); } catch { close(1011, 'Voice connection interrupted'); }
  };
  server.addEventListener('message', event => relay(agent, event.data));
  agent.addEventListener('message', event => relay(server, event.data));
  server.addEventListener('close', () => close());
  agent.addEventListener('close', event => close(event.code === 1000 ? 1000 : 1011));
  server.addEventListener('error', () => close(1011));
  agent.addEventListener('error', () => close(1011));
  return new Response(null, { status: 101, webSocket: client });
}
