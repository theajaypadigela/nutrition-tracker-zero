// Live dry run: no production meal writes, no credentials or transcripts printed.
// node scripts/check-deepgram.mjs [--audio /path/to/16k-mono-linear16.wav]
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import WebSocket from 'ws';

const vars = await readFile(new URL('../.dev.vars', import.meta.url), 'utf8').catch(() => '');
const key = process.env.DEEPGRAM_API_KEY || vars.match(/^DEEPGRAM_API_KEY=(.+)$/m)?.[1]?.trim();
const backendIndex = process.argv.indexOf('--backend');
const backend = backendIndex >= 0 ? process.argv[backendIndex + 1].replace(/\/+$/, '') : null;
const appToken = process.env.APP_TOKEN || vars.match(/^APP_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!backend && !key) throw new Error('Set DEEPGRAM_API_KEY on the backend first');
const compiled = await build({ stdin: {
  contents: "export { deepgramProvider } from '../src/voice/providers/deepgram'; export { parseItemList } from '../src/domain/items';",
  resolveDir: new URL('.', import.meta.url).pathname, loader: 'ts',
}, bundle: true, platform: 'node', format: 'esm', write: false });
const { deepgramProvider, parseItemList } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const session = deepgramProvider.prepare({ env: {}, user: { id: 'dry-run', name: 'Voice Test' }, callId: 1,
  localDate: '2026-10-13', localTime: '14:00', alreadyLogged: [] });
let credentials;
try {
  if (backend) {
    const res = await fetch(`${backend}/voice/credentials`, { method: 'POST', headers: { Authorization: `Bearer ${appToken}` }, body: '{}' });
    credentials = await res.json();
    if (!res.ok) throw new Error(credentials.error?.message || 'Backend authorization failed');
  } else credentials = await deepgramProvider.credentials({ DEEPGRAM_API_KEY: key });
}
catch (error) { console.error(error.message); process.exit(1); }
console.log(`Backend authentication mode: ${credentials.transport} (key stays on backend)`);
let pcm;
const audioIndex = process.argv.indexOf('--audio');
if (audioIndex >= 0) {
  const wav = await readFile(process.argv[audioIndex + 1]);
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4), type = wav.toString('ascii', offset, offset + 4);
    if (type === 'fmt ' && (wav.readUInt16LE(offset + 8) !== 1 || wav.readUInt16LE(offset + 10) !== 1 || wav.readUInt32LE(offset + 12) !== 16000 || wav.readUInt16LE(offset + 22) !== 16)) throw new Error('Use a 16kHz mono linear16 WAV');
    if (type === 'data') { pcm = wav.subarray(offset + 8, offset + 8 + size); break; }
    offset += 8 + size + size % 2;
  }
  if (!pcm) throw new Error('WAV data chunk missing');
}
let audioBytes = 0, saved = false, heardUser = false, rounds = 0, settings = false, done = false, closing = null, sendingAudio = false;
const socket = new WebSocket(credentials.transport === 'proxy' && backend ? `${backend.replace(/^http/, 'ws')}/voice/connect` : session.config.url,
  { headers: { Authorization: credentials.transport === 'proxy' ? backend ? `Bearer ${appToken}` : `Token ${key}` : `Bearer ${credentials.accessToken}` } });
const send = message => socket.send(JSON.stringify(message));
let complete;
const completion = new Promise((resolve, reject) => { complete = error => error ? reject(error) : resolve(); });
const timer = setTimeout(() => finish(new Error('Live test timed out')), 90000);
const keepAlive = setInterval(() => { if (socket.readyState === WebSocket.OPEN) send({ type: 'KeepAlive' }); }, 5000);
// A real microphone continues sending silence between turns; emulate that during the audio test.
const microphone = setInterval(() => { if (pcm && settings && !sendingAudio && socket.readyState === WebSocket.OPEN) socket.send(Buffer.alloc(1280)); }, 40);
function finish(error) {
  if (done) return;
  done = true; clearTimeout(timer); clearInterval(keepAlive); clearInterval(microphone); socket.close(); complete(error);
}
socket.on('message', async (data, binary) => {
  if (binary) { audioBytes += data.length; return; }
  try {
    const msg = JSON.parse(data.toString());
    if (process.env.VOICE_CHECK_DEBUG === '1') console.log(`Event: ${msg.type}${msg.functions ? ` (${msg.functions.map(f => f.name).join(', ')})` : ''}`);
    if (msg.type === 'Welcome') send(session.config.settings);
    if (msg.type === 'SettingsApplied') { settings = true; console.log('Voice Agent settings accepted'); }
    if (msg.type === 'ConversationText' && msg.role === 'user') heardUser = true;
    if (msg.type === 'AgentAudioDone' && !saved) {
      rounds++;
      if (rounds === 1 && pcm) {
        sendingAudio = true;
        const samples = Buffer.concat([pcm, Buffer.alloc(16000 * 2 * 2)]);
        for (let at = 0; at < samples.length && socket.readyState === WebSocket.OPEN; at += 1280) {
          socket.send(samples.subarray(at, at + 1280));
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        sendingAudio = false;
      } else send({ type: 'InjectUserMessage', content: rounds === 1
        ? 'I had two idli for breakfast and one katori dal for lunch. No snacks, no drinks, no dinner yet. That is everything new today.'
        : 'Yes, that is correct. The quantities and units are correct. Save those foods now. I have nothing else to add.' });
      if (rounds > 6) finish(new Error('Agent did not save the confirmed list'));
    }
    if (msg.type === 'AgentAudioDone' && closing) {
      send({ type: 'FunctionCallResponse', id: closing.id, name: closing.name, content: '{"result":"Ending call"}' });
      if (!settings || !saved || !audioBytes || !heardUser) throw new Error('Test did not exercise all stages');
      console.log(`Live test passed: conversation, ${pcm ? 'speech recognition, ' : ''}speech output (${audioBytes} bytes), confirmed save and end_call`);
      finish();
    }
    if (msg.type === 'FunctionCallRequest') for (const fn of msg.functions) {
      if (fn.name === 'save_foods') {
        const args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments;
        const parsed = parseItemList(args?.items);
        if ('error' in parsed) throw new Error('Meal tool arguments failed validation');
        saved = true;
        console.log(`Confirmed meal tool validated: ${parsed.items.length} items (dry run)`);
        send({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: JSON.stringify({ result: `Saved ${parsed.items.length} items` }) });
      } else if (fn.name === 'end_call') {
        closing = fn;
        const args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments;
        send({ type: 'InjectAgentMessage', message: args?.message || 'Goodbye.' });
      } else throw new Error('Unexpected agent function');
    }
    if (msg.type === 'Error') finish(new Error(`Deepgram rejected the session (${msg.code || 'unknown'}): ${String(msg.description || '').replaceAll(key || 'unused-secret', '[redacted]').slice(0, 1500)}`));
  } catch (error) { finish(error); }
});
socket.on('error', () => finish(new Error('Deepgram WebSocket could not connect')));
socket.on('close', () => { if (!done) finish(new Error('Deepgram closed before test completion')); });
try { await completion; } catch (error) { console.error(error.message); process.exitCode = 1; }
