// Panggilan langsung dari browser ke penyedia AI (tanpa server perantara).
export const PROVIDERS = {
  openai:     { label: 'OpenAI',                      kind: 'openai',    base: 'https://api.openai.com/v1',                       ph: 'gpt-4o' },
  anthropic:  { label: 'Anthropic',                   kind: 'anthropic', base: 'https://api.anthropic.com/v1',                    ph: 'claude-sonnet-5-5' },
  gemini:     { label: 'Google Gemini',               kind: 'gemini',    base: 'https://generativelanguage.googleapis.com/v1beta', ph: 'gemini-2.5-flash' },
  openrouter: { label: 'OpenRouter',                  kind: 'openai',    base: 'https://openrouter.ai/api/v1',                    ph: 'openai/gpt-4o' },
  groq:       { label: 'Groq',                        kind: 'openai',    base: 'https://api.groq.com/openai/v1',                  ph: 'llama-3.3-70b-versatile' },
  custom:     { label: 'Custom / OpenAI-compatible',  kind: 'openai',    base: '',                                                ph: 'model-id' },
};
export const baseOf = (provider, baseUrl) => (baseUrl || PROVIDERS[provider].base).replace(/\/+$/, '');

export function validBaseUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname));
  } catch { return false; }
}

export class ProviderError extends Error {
  constructor(message, { status = 0, code = 'http' } = {}) { super(message); this.status = status; this.code = code; }
}

async function request(url, init) {
  let res;
  try { res = await fetch(url, init); }
  catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ProviderError('network', { code: 'network' });
  }
  if (!res.ok) {
    let msg = '';
    try {
      const raw = await res.text();
      try {
        const j = JSON.parse(raw);
        const e = j.error ?? j.message ?? raw;
        msg = typeof e === 'string' ? e : (e.message ?? JSON.stringify(e));
      } catch { msg = raw; }
    } catch { /* abaikan */ }
    throw new ProviderError(String(msg).slice(0, 300) || `HTTP ${res.status}`, { status: res.status });
  }
  return res;
}

function headers(provider, key, json = true) {
  const kind = PROVIDERS[provider].kind;
  const h = kind === 'anthropic'
    ? { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
    : kind === 'gemini' ? { 'x-goog-api-key': key } : { authorization: `Bearer ${key}` };
  if (json) h['content-type'] = 'application/json';
  return h;
}

export async function testConnection({ provider, baseUrl, apiKey, signal }) {
  const kind = PROVIDERS[provider].kind;
  const base = baseOf(provider, baseUrl);
  const url = kind === 'gemini' ? `${base}/models?pageSize=200` : `${base}/models`;
  const res = await request(url, { headers: headers(provider, apiKey, false), signal });
  const j = await res.json().catch(() => ({}));
  const ids = kind === 'gemini'
    ? (j.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
    : (j.data ?? []).map((m) => m.id);
  return { ok: true, models: ids.filter(Boolean).toSorted() };
}

// Parser Server-Sent Events dari ReadableStream.
async function* sse(res) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value.replace(/\r\n/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      let event = 'message'; const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) yield { event, data: data.join('\n') };
    }
  }
}

// messages: [{ role:'user'|'assistant', text, files:[{kind:'image'|'pdf', mime, name, b64}] }]
function buildOpenAI(modelId, system, messages) {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) {
    if (!m.files?.length) { msgs.push({ role: m.role, content: m.text }); continue; }
    const parts = [{ type: 'text', text: m.text || ' ' }];
    for (const f of m.files) {
      if (f.kind === 'image') parts.push({ type: 'image_url', image_url: { url: `data:${f.mime};base64,${f.b64}` } });
      else parts[0].text += `\n[${f.name}: PDF tidak didukung oleh penyedia ini]`;
    }
    msgs.push({ role: m.role, content: parts });
  }
  return { model: modelId, messages: msgs, stream: true };
}
function buildAnthropic(modelId, system, messages) {
  const out = messages.map((m) => {
    const content = [];
    for (const f of m.files ?? []) {
      content.push(f.kind === 'image'
        ? { type: 'image', source: { type: 'base64', media_type: f.mime, data: f.b64 } }
        : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.b64 } });
    }
    content.push({ type: 'text', text: m.text || ' ' });
    return { role: m.role, content };
  });
  const body = { model: modelId, max_tokens: 8192, messages: out, stream: true };
  if (system) body.system = system;
  return body;
}
function buildGemini(system, messages) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [
      ...(m.files ?? []).map((f) => ({ inlineData: { mimeType: f.mime, data: f.b64 } })),
      { text: m.text || ' ' },
    ],
  }));
  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return body;
}

function extract(kind, ev, j) {
  if (kind === 'openai') {
    if (j.error) throw new ProviderError(j.error.message ?? 'error');
    return j.choices?.[0]?.delta?.content ?? '';
  }
  if (kind === 'anthropic') {
    if (ev.event === 'error' || j.type === 'error') throw new ProviderError(j.error?.message ?? 'error');
    return j.type === 'content_block_delta' && j.delta?.type === 'text_delta' ? j.delta.text : '';
  }
  if (j.error) throw new ProviderError(j.error.message ?? 'error');
  if (j.promptFeedback?.blockReason) throw new ProviderError(`Diblokir: ${j.promptFeedback.blockReason}`);
  return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

export async function streamChat({ provider, baseUrl, apiKey, modelId, system, messages, signal, onDelta }) {
  const kind = PROVIDERS[provider].kind;
  const base = baseOf(provider, baseUrl);
  let url, body;
  if (kind === 'openai') { url = `${base}/chat/completions`; body = buildOpenAI(modelId, system, messages); }
  else if (kind === 'anthropic') { url = `${base}/messages`; body = buildAnthropic(modelId, system, messages); }
  else { url = `${base}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`; body = buildGemini(system, messages); }

  const res = await request(url, { method: 'POST', headers: headers(provider, apiKey), body: JSON.stringify(body), signal });
  let full = '';
  for await (const ev of sse(res)) {
    if (ev.data === '[DONE]') break;
    let j; try { j = JSON.parse(ev.data); } catch { continue; }
    const d = extract(kind, ev, j);
    if (d) { full += d; onDelta?.(d, full); }
  }
  return full;
}
