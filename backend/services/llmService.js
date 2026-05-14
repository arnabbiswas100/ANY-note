const fetch = require('node-fetch');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OLLAMA_BASE_URL    = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// Build model list: prefer env-configured model, then fallbacks
const FALLBACK_MODELS = [
  'openrouter/free',                            // Auto-router: picks the best available free model
  'meta-llama/llama-3.3-70b-instruct:free',     // Strong 70B model
  'google/gemma-3-4b-it:free',                  // Lightweight Google model
  'nvidia/nemotron-3-super-120b-a12b:free',     // NVIDIA 120B MoE
];

const getModels = () => {
  const envModel = process.env.OPENROUTER_MODEL;
  if (envModel && !FALLBACK_MODELS.includes(envModel)) {
    return [envModel, ...FALLBACK_MODELS];
  }
  return envModel ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)] : FALLBACK_MODELS;
};

const SYSTEM_PROMPT = `You are Study-Hub AI, a smart study assistant integrated into a personal knowledge management system.

You have access to the user's notes and uploaded PDF documents. You can:
1. Answer questions based on stored notes and PDFs
2. Summarize notes or PDF content
3. Generate structured study notes from PDFs
4. Help organize and understand study materials
5. Answer general knowledge questions

IMPORTANT RULES:
- Always provide a thorough, comprehensive, and detailed answer to the user's question.
- Never give one-word or extremely short answers. Explain concepts fully.
- Your answer is automatically saved as a note, so you do NOT need to use [[CREATE_NOTE]] tags.
- ONLY use [[CREATE_NOTE]] tags when the user EXPLICITLY asks you to "create a note" or "save a note" with specific content they dictate.
- When you DO use [[CREATE_NOTE]] tags, you MUST ALSO provide a conversational answer OUTSIDE the tags. Never put your entire response inside the tags.

When the user explicitly asks you to CREATE or SAVE a specific note, generate ONLY that note content between tags:
[[CREATE_NOTE]]
# Note Title

Note content in markdown format...
[[/CREATE_NOTE]]

But always include a conversational response outside the tags too.

Format responses with markdown when appropriate.
Use headings, bullet points, and code blocks where they aid clarity.
Give detailed, well-structured answers that help the user learn.

If you reference a PDF or note, mention it by name for transparency.`;

const callOpenRouter = async (apiKey, model, messages) => {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Study-Hub',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
    timeout: 60000,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMsg;
    try {
      errorMsg = JSON.parse(errorBody).error?.message || `HTTP ${response.status}`;
    } catch {
      errorMsg = `HTTP ${response.status}: ${errorBody.slice(0, 200)}`;
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0) {
    throw new Error('No response generated');
  }
  return data.choices[0].message?.content || '';
};

const chat = async (history, context, user) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    throw new Error('OpenRouter API key not configured. Please set OPENROUTER_API_KEY in your .env file.');
  }

  // Build context string
  let contextStr = '';

  if (context.notes && context.notes.length > 0) {
    if (context.notes.length === 1) {
      contextStr += `\n\n--- ATTACHED NOTE: "${context.notes[0].title || 'Untitled'}" ---\n`;
      contextStr += context.notes[0].content;
      contextStr += '\n--- END OF NOTE ---\n';
    } else {
      contextStr += "\n\n--- USER'S ATTACHED NOTES ---\n";
      context.notes.forEach(n => {
        contextStr += `\n**${n.title || 'Untitled'}:**\n${n.content.slice(0, 3000)}\n---\n`;
      });
    }
  }

  if (context.pdfs && context.pdfs.length > 0) {
    if (context.pdfs.length === 1) {
      const p = context.pdfs[0];
      contextStr += `\n\n--- ATTACHED PDF: "${p.original_name}" (${p.page_count} pages) ---\n`;
      contextStr += p.extracted_text ? p.extracted_text.slice(0, 15000) : '[No text extracted]';
      contextStr += '\n--- END OF PDF ---\n';
    } else {
      contextStr += "\n\n--- USER'S ATTACHED PDFs ---\n";
      context.pdfs.forEach(p => {
        contextStr += `\n**${p.original_name}** (${p.page_count} pages):\n`;
        if (p.extracted_text) contextStr += p.extracted_text.slice(0, 5000) + '\n---\n';
      });
    }
  }

  const systemWithContext = SYSTEM_PROMPT + (contextStr ? `\n\nCONTEXT FROM USER'S LIBRARY:${contextStr}` : '');
  const messages = [{ role: 'system', content: systemWithContext }];
  for (const msg of history) {
    if (msg.role === 'system') continue;
    messages.push({ role: msg.role, content: msg.content });
  }

  // Try each model in order until one works
  let lastError;
  const models = getModels();
  for (const model of models) {
    try {
      console.log(`[LLM] Trying OpenRouter model: ${model}`);
      const text = await callOpenRouter(apiKey, model, messages);
      console.log(`[LLM] Success with ${model}`);
      return text;
    } catch (err) {
      console.warn(`[LLM] Failed with ${model}: ${err.message}`);
      lastError = err;
    }
  }
  throw new Error(`All models failed. Last error: ${lastError?.message}`);
};

// ── Ollama ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the list of locally installed Ollama models.
 * Returns [{ name, size, modified }]
 */
const getOllamaModels = async () => {
  let response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });
  } catch (netErr) {
    throw new Error(`Cannot reach Ollama at ${OLLAMA_BASE_URL}. Is it running? (${netErr.message})`);
  }

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}. Is it running?`);
  }

  const data = await response.json();
  return (data.models || []).map(m => ({
    name:     m.name,
    size:     m.size,
    modified: m.modified_at,
  }));
};

/**
 * Chat with a local Ollama model using /api/chat (non-streaming).
 * Accepts the same history + context shape as the OpenRouter path.
 */
const chatOllama = async (history, context, user, model) => {
  if (!model) throw new Error('No Ollama model specified.');

  // Build context string — identical logic to the OpenRouter path
  let contextStr = '';

  if (context.notes && context.notes.length > 0) {
    if (context.notes.length === 1) {
      contextStr += `\n\n--- ATTACHED NOTE: "${context.notes[0].title || 'Untitled'}" ---\n`;
      contextStr += context.notes[0].content;
      contextStr += '\n--- END OF NOTE ---\n';
    } else {
      contextStr += "\n\n--- USER'S ATTACHED NOTES ---\n";
      context.notes.forEach(n => {
        contextStr += `\n**${n.title || 'Untitled'}:**\n${n.content.slice(0, 3000)}\n---\n`;
      });
    }
  }

  if (context.pdfs && context.pdfs.length > 0) {
    if (context.pdfs.length === 1) {
      const p = context.pdfs[0];
      contextStr += `\n\n--- ATTACHED PDF: "${p.original_name}" (${p.page_count} pages) ---\n`;
      contextStr += p.extracted_text ? p.extracted_text.slice(0, 15000) : '[No text extracted]';
      contextStr += '\n--- END OF PDF ---\n';
    } else {
      contextStr += "\n\n--- USER'S ATTACHED PDFs ---\n";
      context.pdfs.forEach(p => {
        contextStr += `\n**${p.original_name}** (${p.page_count} pages):\n`;
        if (p.extracted_text) contextStr += p.extracted_text.slice(0, 5000) + '\n---\n';
      });
    }
  }

  const systemWithContext =
    SYSTEM_PROMPT + (contextStr ? `\n\nCONTEXT FROM USER'S LIBRARY:${contextStr}` : '');

  // Build messages array for Ollama's /api/chat format
  const messages = [{ role: 'system', content: systemWithContext }];
  for (const msg of history) {
    if (msg.role === 'system') continue;
    messages.push({ role: msg.role, content: msg.content });
  }

  console.log(`[LLM/Ollama] Calling model: ${model}`);

  let response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: 0.7, num_predict: 4096 },
      }),
      timeout: 180000, // local models can be slow — 3 min
    });
  } catch (netErr) {
    throw new Error(`Cannot reach Ollama at ${OLLAMA_BASE_URL}. Is it running? (${netErr.message})`);
  }

  if (!response.ok) {
    const errBody = await response.text();
    let errMsg;
    try { errMsg = JSON.parse(errBody).error || `HTTP ${response.status}`; }
    catch { errMsg = `HTTP ${response.status}: ${errBody.slice(0, 200)}`; }
    throw new Error(`Ollama error: ${errMsg}`);
  }

  const data = await response.json();
  const content = data.message?.content;
  if (!content) throw new Error('Ollama returned an empty response.');

  console.log(`[LLM/Ollama] Success with model: ${model}`);
  return content;
};

/**
 * Stream tokens from a local Ollama model.
 * Calls /api/chat with stream:true and yields each chunk via an async generator.
 * Each yielded value: { type: 'token'|'done'|'error', content?: string, error?: string }
 */
const streamOllama = async function* (history, context, user, model) {
  if (!model) throw new Error('No Ollama model specified.');

  // Build context string — identical logic to chatOllama
  let contextStr = '';

  if (context.notes && context.notes.length > 0) {
    if (context.notes.length === 1) {
      contextStr += `\n\n--- ATTACHED NOTE: "${context.notes[0].title || 'Untitled'}" ---\n`;
      contextStr += context.notes[0].content;
      contextStr += '\n--- END OF NOTE ---\n';
    } else {
      contextStr += "\n\n--- USER'S ATTACHED NOTES ---\n";
      context.notes.forEach(n => {
        contextStr += `\n**${n.title || 'Untitled'}:**\n${n.content.slice(0, 3000)}\n---\n`;
      });
    }
  }

  if (context.pdfs && context.pdfs.length > 0) {
    if (context.pdfs.length === 1) {
      const p = context.pdfs[0];
      contextStr += `\n\n--- ATTACHED PDF: "${p.original_name}" (${p.page_count} pages) ---\n`;
      contextStr += p.extracted_text ? p.extracted_text.slice(0, 15000) : '[No text extracted]';
      contextStr += '\n--- END OF PDF ---\n';
    } else {
      contextStr += "\n\n--- USER'S ATTACHED PDFs ---\n";
      context.pdfs.forEach(p => {
        contextStr += `\n**${p.original_name}** (${p.page_count} pages):\n`;
        if (p.extracted_text) contextStr += p.extracted_text.slice(0, 5000) + '\n---\n';
      });
    }
  }

  const systemWithContext =
    SYSTEM_PROMPT + (contextStr ? `\n\nCONTEXT FROM USER'S LIBRARY:${contextStr}` : '');

  const messages = [{ role: 'system', content: systemWithContext }];
  for (const msg of history) {
    if (msg.role === 'system') continue;
    messages.push({ role: msg.role, content: msg.content });
  }

  console.log(`[LLM/Ollama/stream] Starting stream — model: ${model}`);

  let response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: { temperature: 0.7, num_predict: 4096 },
      }),
      // No timeout on the fetch itself — streaming may be slow
    });
  } catch (netErr) {
    throw new Error(`Cannot reach Ollama at ${OLLAMA_BASE_URL}. Is it running? (${netErr.message})`);
  }

  if (!response.ok) {
    const errBody = await response.text();
    let errMsg;
    try { errMsg = JSON.parse(errBody).error || `HTTP ${response.status}`; }
    catch { errMsg = `HTTP ${response.status}: ${errBody.slice(0, 200)}`; }
    throw new Error(`Ollama stream error: ${errMsg}`);
  }

  // Ollama streams NDJSON — one JSON object per line
  const reader = response.body;
  let buf = '';

  for await (const chunk of reader) {
    buf += chunk.toString('utf8');
    // A single network chunk may contain multiple lines
    const lines = buf.split('\n');
    buf = lines.pop(); // keep incomplete last line for next iteration

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        const token = obj.message?.content ?? '';
        if (token) yield { type: 'token', content: token };
        if (obj.done) { yield { type: 'done' }; return; }
      } catch { /* malformed line — skip */ }
    }
  }

  // Flush any remaining buffer
  if (buf.trim()) {
    try {
      const obj = JSON.parse(buf.trim());
      const token = obj.message?.content ?? '';
      if (token) yield { type: 'token', content: token };
    } catch { /* ignore */ }
  }

  yield { type: 'done' };
};

module.exports = { chat, chatOllama, getOllamaModels, streamOllama };
