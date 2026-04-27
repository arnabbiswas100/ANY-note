const { query } = require('../config/database');
const llmService = require('../services/llmService');

// ── SESSIONS ──────────────────────────────────────────────────────────────────

const getSessions = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.*, 
        (SELECT content FROM chat_messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_message,
        (SELECT COUNT(*)::int FROM chat_messages WHERE session_id = s.id) AS message_count
       FROM chat_sessions s
       WHERE s.user_id = $1
       ORDER BY s.updated_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, sessions: result.rows });
  } catch (err) { next(err); }
};

const createSession = async (req, res, next) => {
  try {
    const { title = 'New Chat' } = req.body;
    const result = await query(
      'INSERT INTO chat_sessions (user_id, title) VALUES ($1,$2) RETURNING *',
      [req.user.id, title]
    );
    res.status(201).json({ success: true, session: result.rows[0] });
  } catch (err) { next(err); }
};

const updateSession = async (req, res, next) => {
  try {
    const { title, linked_note_id } = req.body;
    const updates = [];
    const values  = [];
    let idx = 1;

    if (title !== undefined)          { updates.push(`title=$${idx++}`);          values.push(title); }
    if (linked_note_id !== undefined) { updates.push(`linked_note_id=$${idx++}`); values.push(linked_note_id); }

    if (!updates.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    values.push(req.params.id, req.user.id);
    const result = await query(
      `UPDATE chat_sessions SET ${updates.join(', ')} WHERE id=$${idx++} AND user_id=$${idx} RETURNING *`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, session: result.rows[0] });
  } catch (err) { next(err); }
};

const deleteSession = async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM chat_sessions WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, message: 'Chat session deleted' });
  } catch (err) { next(err); }
};

const getMessages = async (req, res, next) => {
  try {
    // Verify session ownership
    const session = await query(
      'SELECT id FROM chat_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!session.rows.length) return res.status(404).json({ success: false, error: 'Session not found' });

    const result = await query(
      'SELECT * FROM chat_messages WHERE session_id=$1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ success: true, messages: result.rows });
  } catch (err) { next(err); }
};

// ── CHAT (send message + get AI response) ─────────────────────────────────────

const sendMessage = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    // Support both legacy single-item fields and the array fields sent by the frontend
    const {
      content,
      context_note_ids,
      context_pdf_ids,
      // legacy fallback fields (kept for backwards compat)
      contextType,
      contextRefId,
    } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required' });
    }

    // Normalise to arrays (frontend sends context_note_ids / context_pdf_ids)
    const noteIds = Array.isArray(context_note_ids) ? context_note_ids
      : (context_note_ids ? [context_note_ids] : []);
    const pdfIds  = Array.isArray(context_pdf_ids)  ? context_pdf_ids
      : (context_pdf_ids  ? [context_pdf_ids]  : []);

    // Legacy single-item support: if arrays are empty but old fields are set, use those
    if (noteIds.length === 0 && contextType === 'note' && contextRefId) noteIds.push(contextRefId);
    if (pdfIds.length  === 0 && contextType === 'pdf'  && contextRefId) pdfIds.push(contextRefId);

    // Verify session ownership
    const session = await query(
      'SELECT * FROM chat_sessions WHERE id=$1 AND user_id=$2',
      [sessionId, req.user.id]
    );
    if (!session.rows.length) return res.status(404).json({ success: false, error: 'Session not found' });

    // Save user message (store first note/pdf id for reference if available)
    const savedContextType   = noteIds.length ? 'note' : (pdfIds.length ? 'pdf' : null);
    const savedContextRefId  = noteIds[0] || pdfIds[0] || null;
    const userMsg = await query(
      `INSERT INTO chat_messages (session_id, user_id, role, content, context_type, context_ref_id)
       VALUES ($1,$2,'user',$3,$4,$5) RETURNING *`,
      [sessionId, req.user.id, content.trim(), savedContextType, savedContextRefId]
    );

    // Gather context
    const context = await buildContext(req.user.id, content, noteIds, pdfIds);

    // Fetch message history (last 20)
    const history = await query(
      `SELECT role, content FROM chat_messages
       WHERE session_id=$1 ORDER BY created_at ASC LIMIT 20`,
      [sessionId]
    );

    // Call LLM
    let aiResponse;
    try {
      aiResponse = await llmService.chat(history.rows, context, req.user);
    } catch (llmErr) {
      console.error('LLM error:', llmErr.message);
      aiResponse = `I encountered an error connecting to the AI service: ${llmErr.message}. Please check your GEMINI_API_KEY configuration.`;
    }

    // Check if AI wants to create a note (only when explicit [[CREATE_NOTE]] tags are used)
    let savedNote = null;
    if (aiResponse.includes('[[CREATE_NOTE]]')) {
      const noteMatch = aiResponse.match(/\[\[CREATE_NOTE\]\]([\s\S]*?)\[\[\/CREATE_NOTE\]\]/);
      if (noteMatch) {
        const noteContent = noteMatch[1].trim();
        const titleMatch = noteContent.match(/^#\s+(.+)/m);
        const noteTitle = titleMatch ? titleMatch[1] : 'AI Generated Note';
        try {
          const noteResult = await query(
            'INSERT INTO notes (user_id, title, content, color) VALUES ($1,$2,$3,$4) RETURNING *',
            [req.user.id, noteTitle, noteContent, '#1a2035']
          );
          savedNote = noteResult.rows[0];
        } catch (e) {
          console.error('Failed to save AI note:', e.message);
        }
        // Strip the raw CREATE_NOTE tags from the response but keep everything else
        const strippedResponse = aiResponse.replace(/\[\[CREATE_NOTE\]\][\s\S]*?\[\[\/CREATE_NOTE\]\]/, '').trim();
        // If stripping left the response empty (AI put everything in tags), use the note content as the response
        if (strippedResponse) {
          aiResponse = strippedResponse + '\n\n✅ **Note saved to your Notes library!**';
        } else {
          aiResponse = noteContent + '\n\n✅ **Note saved to your Notes library!**';
        }
      }
    }

    // Save assistant message
    const assistantMsg = await query(
      `INSERT INTO chat_messages (session_id, user_id, role, content)
       VALUES ($1,$2,'assistant',$3) RETURNING *`,
      [sessionId, req.user.id, aiResponse]
    );

    // ── Per-session note accumulation ────────────────────────────
    // All Q&A in the same session goes into ONE note, appended sequentially.
    try {
      const sessionRow = session.rows[0];
      const qaPair = `**Q: ${content.trim()}**\n\n${aiResponse}\n\n---\n`;

      if (sessionRow.linked_note_id) {
        // Append to existing note
        const existingNote = await query(
          'SELECT content FROM notes WHERE id=$1 AND user_id=$2',
          [sessionRow.linked_note_id, req.user.id]
        );
        if (existingNote.rows.length) {
          const newContent = existingNote.rows[0].content + '\n' + qaPair;
          await query(
            'UPDATE notes SET content=$1, updated_at=NOW() WHERE id=$2',
            [newContent, sessionRow.linked_note_id]
          );
        }
      } else {
        // First message in session — create a new note
        const noteTitle = sessionRow.title !== 'New Chat'
          ? sessionRow.title
          : content.trim().slice(0, 60) + (content.length > 60 ? '…' : '');
        const newNote = await query(
          'INSERT INTO notes (user_id, title, content) VALUES ($1,$2,$3) RETURNING id',
          [req.user.id, noteTitle, qaPair]
        );
        const noteId = newNote.rows[0].id;
        // Link the note to the session
        await query(
          'UPDATE chat_sessions SET linked_note_id=$1 WHERE id=$2',
          [noteId, sessionId]
        );
      }
    } catch (noteErr) {
      // Non-fatal — chat still works even if note save fails
      console.warn('[Chat] Note save failed:', noteErr.message);
    }
    // ────────────────────────────────────────────────────────────

    // Update session title if it's the first message
    if (session.rows[0].title === 'New Chat') {
      const autoTitle = content.trim().slice(0, 60) + (content.length > 60 ? '...' : '');
      await query('UPDATE chat_sessions SET title=$1 WHERE id=$2', [autoTitle, sessionId]);
    }

    res.json({
      success: true,
      userMessage: userMsg.rows[0],
      assistantMessage: assistantMsg.rows[0],
    });
  } catch (err) { next(err); }
};

// ── CONTEXT BUILDER ───────────────────────────────────────────────────────────

async function buildContext(userId, userMessage, noteIds = [], pdfIds = []) {
  const context = { notes: [], pdfs: [] };
  const msg = userMessage.toLowerCase();

  // ── Explicitly attached notes ────────────────────────────────
  if (noteIds.length > 0) {
    // Fetch all selected notes in one query using ANY($2)
    const placeholders = noteIds.map((_, i) => `$${i + 2}`).join(',');
    const result = await query(
      `SELECT title, content FROM notes WHERE user_id=$1 AND id IN (${placeholders})`,
      [userId, ...noteIds]
    );
    context.notes = result.rows;
  }

  // ── Explicitly attached PDFs ─────────────────────────────────
  if (pdfIds.length > 0) {
    const placeholders = pdfIds.map((_, i) => `$${i + 2}`).join(',');
    const result = await query(
      `SELECT original_name, extracted_text, page_count FROM pdfs WHERE user_id=$1 AND id IN (${placeholders})`,
      [userId, ...pdfIds]
    );
    context.pdfs = result.rows;
  }

  // ── Keyword-based fallback (only when nothing is attached) ───
  const hasAttached = noteIds.length > 0 || pdfIds.length > 0;
  if (!hasAttached) {
    const wantsNotes = msg.includes('note') || msg.includes('notes');
    const wantsPdf   = msg.includes('pdf') || msg.includes('document') || msg.includes('summarize');

    if (wantsNotes) {
      const notes = await query(
        'SELECT title, content FROM notes WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 5',
        [userId]
      );
      context.notes = notes.rows;
    }

    if (wantsPdf) {
      const pdfs = await query(
        'SELECT id, original_name, page_count, extracted_text FROM pdfs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 3',
        [userId]
      );
      context.pdfs = pdfs.rows;
    }
  }

  return context;
}

// ── SEARCH SESSIONS ───────────────────────────────────────────────────────────

/**
 * Levenshtein edit distance (optimized single-row DP).
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length > b.length) [a, b] = [b, a];
  const la = a.length, lb = b.length;
  let prev = Array.from({ length: la + 1 }, (_, i) => i);
  let curr = new Array(la + 1);
  for (let j = 1; j <= lb; j++) {
    curr[0] = j;
    for (let i = 1; i <= la; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[la];
}

/**
 * Bigram similarity (Dice coefficient) — 0 to 1.
 */
function bigramSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const p = s.slice(i, i + 2);
      m.set(p, (m.get(p) || 0) + 1);
    }
    return m;
  };
  const aB = bigrams(a), bB = bigrams(b);
  let inter = 0;
  for (const [p, c] of aB) if (bB.has(p)) inter += Math.min(c, bB.get(p));
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

/**
 * Fuzzy match a token against a word. Returns 0–100.
 */
function fuzzyMatchWord(word, token) {
  if (word === token) return 100;
  if (word.includes(token)) return 85 + (token.length / word.length) * 15;
  if (token.includes(word)) return 60;
  const maxLen = Math.max(word.length, token.length);
  const dist = levenshtein(word, token);
  if (dist > Math.ceil(maxLen * 0.4)) return 0;
  return (1 - dist / maxLen) * 50 + bigramSimilarity(word, token) * 50;
}

/**
 * Score how well `text` matches `queryStr`.
 */
function fuzzyScore(text, queryStr) {
  if (!text || !queryStr) return 0;
  const t = text.toLowerCase().trim();
  const q = queryStr.toLowerCase().trim();
  if (t === q) return 200;
  if (t.includes(q)) return 150 + (q.length / t.length) * 50;

  const tokens = q.split(/\s+/).filter(Boolean);
  const words = t.split(/[\s\-_.,;:!?/()]+/).filter(Boolean);
  let total = 0, matched = 0;

  for (const tok of tokens) {
    let best = 0;
    if (t.includes(tok)) { best = 80; }
    else {
      for (const w of words) best = Math.max(best, fuzzyMatchWord(w, tok));
      for (const w of words) {
        if (w.startsWith(tok.slice(0, Math.max(2, tok.length - 1)))) best = Math.max(best, 55);
      }
    }
    if (best > 15) matched++;
    total += best;
  }
  if (matched === 0) return 0;
  return (total / tokens.length) * (matched / tokens.length);
}

const searchSessions = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json({ success: true, sessions: [] });
    }

    // Fetch ALL user sessions with last message for deep fuzzy scoring.
    // SQL LIKE is kept as a fast pre-filter for exact matches, but we also
    // score all sessions via JS fuzzy matching to catch typos & misspellings.
    const allResult = await query(
      `SELECT s.*,
        (SELECT content FROM chat_messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_message,
        (SELECT COUNT(*)::int FROM chat_messages WHERE session_id = s.id) AS message_count
       FROM chat_sessions s
       WHERE s.user_id = $1
       ORDER BY s.updated_at DESC`,
      [req.user.id]
    );

    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);

    // Also do a SQL search for deep message-content matches (exact substring).
    // This catches matches inside older messages that aren't the last_message.
    const conditions = tokens.map((_, i) => {
      const p = `$${i + 2}`;
      return `EXISTS (
        SELECT 1 FROM chat_messages m
        WHERE m.session_id = s.id
          AND LOWER(m.content) LIKE '%' || ${p} || '%'
      )`;
    });

    let sqlMatchIds = new Set();
    if (conditions.length > 0) {
      try {
        const sqlResult = await query(
          `SELECT s.id FROM chat_sessions s
           WHERE s.user_id = $1 AND (${conditions.join(' OR ')})`,
          [req.user.id, ...tokens]
        );
        sqlMatchIds = new Set(sqlResult.rows.map(r => r.id));
      } catch { /* non-fatal */ }
    }

    // Score every session using fuzzy matching
    const scored = allResult.rows.map(session => {
      const titleScore = fuzzyScore(session.title || '', q);
      const msgScore = fuzzyScore(session.last_message || '', q) * 0.6;
      const sqlBonus = sqlMatchIds.has(session.id) ? 20 : 0;
      const score = titleScore + msgScore + sqlBonus;
      return { ...session, _score: score };
    });

    // Filter: only include sessions with meaningful scores
    const threshold = 15;
    const filtered = scored
      .filter(s => s._score > threshold)
      .sort((a, b) => b._score - a._score)
      .slice(0, 30);

    // Strip internal score
    const sessions = filtered.map(({ _score, ...rest }) => rest);

    res.json({ success: true, sessions });
  } catch (err) { next(err); }
};

module.exports = { getSessions, createSession, updateSession, deleteSession, getMessages, sendMessage, searchSessions };
