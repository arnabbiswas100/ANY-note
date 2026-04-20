const fetch = require('node-fetch');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `You are Study-Hub AI, a smart study assistant integrated into a personal knowledge management system.

You have access to the user's notes and uploaded PDF documents. You can:
1. Answer questions based on stored notes and PDFs
2. Summarize notes or PDF content
3. Generate structured study notes from PDFs
4. Help organize and understand study materials
5. Answer general knowledge questions

When the user asks you to CREATE or SAVE notes, generate the note content between special tags:
[[CREATE_NOTE]]
# Note Title

Note content in markdown format...
[[/CREATE_NOTE]]

The system will automatically detect this and save the note to their library.

Always be concise, helpful, and academic in tone. Format responses with markdown when appropriate.
Use headings, bullet points, and code blocks where they aid clarity.

If you reference a PDF or note, mention it by name for transparency.`;

const chat = async (history, context, user) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in your .env file.');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  // Build context string
  let contextStr = '';

  if (context.specificContent) {
    const c = context.specificContent;
    if (c.type === 'pdf') {
      contextStr += `\n\n--- ATTACHED PDF: "${c.original_name}" (${c.page_count} pages) ---\n`;
      contextStr += c.extracted_text
        ? c.extracted_text.slice(0, 15000)
        : '[No text extracted from this PDF]';
      contextStr += '\n--- END OF PDF ---\n';
    } else if (c.type === 'note') {
      contextStr += `\n\n--- ATTACHED NOTE: "${c.title}" ---\n${c.content}\n--- END OF NOTE ---\n`;
    }
  }

  if (context.notes.length > 0) {
    contextStr += '\n\n--- USER\'S RECENT NOTES ---\n';
    context.notes.forEach(n => {
      contextStr += `\n**${n.title || 'Untitled'}:**\n${n.content.slice(0, 2000)}\n---\n`;
    });
  }

  if (context.pdfs.length > 0) {
    contextStr += '\n\n--- USER\'S PDF LIBRARY ---\n';
    context.pdfs.forEach(p => {
      contextStr += `\n**${p.original_name}** (${p.page_count} pages):\n`;
      if (p.extracted_text) {
        contextStr += p.extracted_text.slice(0, 3000) + '\n---\n';
      }
    });
  }

  // Build Gemini conversation format
  const systemWithContext = SYSTEM_PROMPT + (contextStr ? `\n\nCONTEXT FROM USER'S LIBRARY:${contextStr}` : '');

  const contents = [];

  // Add history (skip system messages)
  for (const msg of history) {
    if (msg.role === 'system') continue;
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    });
  }

  // If history already has the last user message, don't duplicate
  // (sendMessage saves user msg before calling this, so history includes it)

  const requestBody = {
    system_instruction: { parts: [{ text: systemWithContext }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ]
  };

  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    timeout: 30000
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMsg;
    try {
      const errorJson = JSON.parse(errorBody);
      errorMsg = errorJson.error?.message || `HTTP ${response.status}`;
    } catch {
      errorMsg = `HTTP ${response.status}: ${errorBody.slice(0, 200)}`;
    }
    throw new Error(`Gemini API error: ${errorMsg}`);
  }

  const data = await response.json();

  if (!data.candidates || data.candidates.length === 0) {
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Request blocked: ${data.promptFeedback.blockReason}`);
    }
    throw new Error('No response generated from Gemini');
  }

  const candidate = data.candidates[0];
  if (candidate.finishReason === 'SAFETY') {
    throw new Error('Response blocked due to safety filters');
  }

  const text = candidate.content?.parts?.map(p => p.text).join('') || '';
  return text;
};

module.exports = { chat };
