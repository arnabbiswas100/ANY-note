/* ═══════════════════════════════════════════════════════════════
   STUDY-HUB — Chat Module
   Sessions, message send/receive, streaming, context attach
   ═══════════════════════════════════════════════════════════════ */

window.Chat = (() => {
  const { toast, show, hide, debounce, formatDate, escHtml,
          renderMarkdown, autoResize, truncate, setLoading } = Helpers;

  // ── State ─────────────────────────────────────────────────────
  let state = {
    sessions:       [],
    activeSession:  null,   // full session object
    messages:       [],
    isStreaming:    false,
    searchQuery:    '',
    searchResults:  null,   // null = not searching, [] = no results
    context: {
      noteIds: [],
      pdfIds:  [],
      notes:   [],   // full objects for display
      pdfs:    [],
    },
  };

  const el = (id) => document.getElementById(id);

  // ─────────────────────────────────────────────────────────────
  // Fuzzy matching engine
  // ─────────────────────────────────────────────────────────────

  /**
   * Levenshtein edit distance between two strings.
   * Counts minimum single-char insertions, deletions, substitutions.
   * Uses optimized single-row DP with early termination.
   */
  const levenshtein = (a, b) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    // Ensure a is shorter for memory efficiency
    if (a.length > b.length) [a, b] = [b, a];

    const la = a.length, lb = b.length;
    let prev = Array.from({ length: la + 1 }, (_, i) => i);
    let curr = new Array(la + 1);

    for (let j = 1; j <= lb; j++) {
      curr[0] = j;
      for (let i = 1; i <= la; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[i] = Math.min(
          prev[i] + 1,       // deletion
          curr[i - 1] + 1,   // insertion
          prev[i - 1] + cost  // substitution
        );
      }
      [prev, curr] = [curr, prev];
    }
    return prev[la];
  };

  /**
   * Bigram similarity (Dice coefficient).
   * Measures overlap of character pairs between two strings.
   * Returns 0–1 where 1 = identical bigram sets.
   */
  const bigramSimilarity = (a, b) => {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const getBigrams = (s) => {
      const bigrams = new Map();
      for (let i = 0; i < s.length - 1; i++) {
        const pair = s.slice(i, i + 2);
        bigrams.set(pair, (bigrams.get(pair) || 0) + 1);
      }
      return bigrams;
    };

    const aB = getBigrams(a);
    const bB = getBigrams(b);
    let intersection = 0;

    for (const [pair, count] of aB) {
      if (bB.has(pair)) intersection += Math.min(count, bB.get(pair));
    }

    return (2 * intersection) / (a.length - 1 + b.length - 1);
  };

  /**
   * Check if query characters appear in order within text (subsequence match).
   * Returns { match: boolean, score: number } where score reflects match quality.
   */
  const subsequenceMatch = (text, query) => {
    let ti = 0, consecutive = 0, maxConsecutive = 0, firstIdx = -1;
    for (let i = 0; i < text.length && ti < query.length; i++) {
      if (text[i] === query[ti]) {
        if (firstIdx === -1) firstIdx = i;
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
        ti++;
      } else {
        consecutive = 0;
      }
    }
    if (ti < query.length) return { match: false, score: 0 };

    // Score: reward consecutive matches, penalize spread-out matches
    const coverage = query.length / text.length;
    const consecutiveBonus = maxConsecutive / query.length;
    const startBonus = firstIdx === 0 ? 0.15 : 0;
    return {
      match: true,
      score: (coverage * 0.3 + consecutiveBonus * 0.5 + startBonus + 0.05) * 25,
    };
  };

  /**
   * Fuzzy match a single query token against a single word from the text.
   * Returns a score 0–100 combining Levenshtein distance and bigram similarity.
   */
  const fuzzyMatchWord = (word, token) => {
    if (word === token) return 100;
    if (word.includes(token)) return 85 + (token.length / word.length) * 15;
    if (token.includes(word)) return 60;

    const maxLen = Math.max(word.length, token.length);
    const dist = levenshtein(word, token);

    // Allow up to ~40% edit distance for fuzzy tolerance
    const maxDist = Math.ceil(maxLen * 0.4);
    if (dist > maxDist) return 0;

    const distScore = (1 - dist / maxLen) * 50;
    const bigramScore = bigramSimilarity(word, token) * 50;

    return distScore + bigramScore;
  };

  /**
   * Main fuzzy scorer: how well `query` matches `text`.
   * Returns 0 for no match, higher = better.
   * Combines exact, substring, subsequence, Levenshtein, and bigram matching.
   */
  const fuzzyScore = (text, query) => {
    if (!text || !query) return 0;
    const tLower = text.toLowerCase().trim();
    const qLower = query.toLowerCase().trim();

    // 1. Exact match
    if (tLower === qLower) return 200;

    // 2. Full substring match
    if (tLower.includes(qLower)) return 150 + (qLower.length / tLower.length) * 50;

    // 3. Subsequence match (chars in order)
    const subseq = subsequenceMatch(tLower, qLower);
    let bestScore = subseq.match ? subseq.score : 0;

    // 4. Token-level fuzzy matching
    const queryTokens = qLower.split(/\s+/).filter(Boolean);
    const textWords = tLower.split(/[\s\-_.,;:!?/()]+/).filter(Boolean);

    let totalTokenScore = 0;
    let matchedTokens = 0;

    for (const qToken of queryTokens) {
      let bestWordScore = 0;

      // Check exact substring in full text first
      if (tLower.includes(qToken)) {
        bestWordScore = 80;
      } else {
        // Try fuzzy match against each word
        for (const word of textWords) {
          const score = fuzzyMatchWord(word, qToken);
          bestWordScore = Math.max(bestWordScore, score);
        }

        // Also try prefix matching (typing partial words)
        for (const word of textWords) {
          if (word.startsWith(qToken.slice(0, Math.max(2, qToken.length - 1)))) {
            bestWordScore = Math.max(bestWordScore, 55);
          }
        }
      }

      if (bestWordScore > 15) matchedTokens++;
      totalTokenScore += bestWordScore;
    }

    // Require at least some tokens to match
    if (matchedTokens === 0) return 0;

    const avgTokenScore = totalTokenScore / queryTokens.length;
    const matchRatio = matchedTokens / queryTokens.length;

    // Blend: average token quality × match coverage
    const tokenFinalScore = avgTokenScore * matchRatio;

    return Math.max(bestScore, tokenFinalScore);
  };

  // ─────────────────────────────────────────────────────────────
  // Sessions
  // ─────────────────────────────────────────────────────────────

  const loadSessions = async () => {
    try {
      const data  = await API.chat.getSessions();
      state.sessions = data.sessions || data.data || data || [];
      renderSessionList();

      // Restore last active session
      const savedId = Storage.getActiveChatSession();
      if (savedId) {
        const found = state.sessions.find(s => String(s.id) === String(savedId));
        if (found) { await activateSession(found, false); return; }
      }
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    }
  };

  /**
   * Highlight matching portions of text with <mark> tags
   */
  const highlightMatch = (text, query) => {
    if (!query || !text) return escHtml(text || '');
    const escaped = escHtml(text);
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    let result = escaped;
    for (const token of tokens) {
      const regex = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      result = result.replace(regex, '<span class="chat-search-highlight">$1</span>');
    }
    return result;
  };

  /**
   * Find a snippet from the last_message that contains a query match
   */
  const getMatchSnippet = (message, query) => {
    if (!message || !query) return '';
    const msgLower = message.toLowerCase();
    const qLower = query.toLowerCase();
    const tokens = qLower.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const idx = msgLower.indexOf(token);
      if (idx !== -1) {
        const start = Math.max(0, idx - 25);
        const end = Math.min(message.length, idx + token.length + 40);
        let snippet = message.slice(start, end).replace(/\n/g, ' ').trim();
        if (start > 0) snippet = '…' + snippet;
        if (end < message.length) snippet = snippet + '…';
        return snippet;
      }
    }
    return '';
  };

  const renderSessionList = () => {
    const list = el('chat-session-list');
    if (!list) return;
    list.innerHTML = '';

    // If we're in search mode, render search results
    if (state.searchResults !== null) {
      renderSearchResults(list);
      return;
    }

    state.sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = `session-item folder-item${state.activeSession?.id === s.id ? ' active' : ''}`;
      item.dataset.id = s.id;
      item.innerHTML = `
        <span class="folder-icon">💬</span>
        <span class="folder-name session-title">${escHtml(s.title || 'New Chat')}</span>
        <div class="folder-actions">
          <button class="folder-action-btn del-session" data-id="${s.id}" title="Delete">✕</button>
        </div>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.folder-actions')) return;
        activateSession(s);
      });
      item.querySelector('.del-session').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(s.id);
      });
      list.appendChild(item);
    });
  };

  const renderSearchResults = (list) => {
    const results = state.searchResults;
    const query = state.searchQuery;

    if (results.length === 0) {
      list.innerHTML = `
        <div class="chat-search-empty">
          <span class="chat-search-empty-icon">🔍</span>
          No chats found for "${escHtml(query)}"
        </div>
      `;
      return;
    }

    results.forEach(s => {
      const item = document.createElement('div');
      item.className = `session-item folder-item${state.activeSession?.id === s.id ? ' active' : ''}`;
      item.dataset.id = s.id;

      const titleHtml = highlightMatch(s.title || 'New Chat', query);
      const snippet = getMatchSnippet(s.last_message, query);
      const snippetHtml = snippet ? `<span class="session-search-snippet">${highlightMatch(snippet, query)}</span>` : '';

      item.innerHTML = `
        <span class="folder-icon">💬</span>
        <span class="folder-name session-title">${titleHtml}${snippetHtml}</span>
        <div class="folder-actions">
          <button class="folder-action-btn del-session" data-id="${s.id}" title="Delete">✕</button>
        </div>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.folder-actions')) return;
        clearSearch();
        activateSession(s);
      });
      item.querySelector('.del-session').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(s.id);
      });
      list.appendChild(item);
    });
  };

  const activateSession = async (session, scroll = true) => {
    state.activeSession = session;
    Storage.setActiveChatSession(session.id);
    renderSessionList();
    showMessagesView();
    await loadMessages(session.id, scroll);
  };

  const createSession = async (title = 'New Chat') => {
    try {
      const data    = await API.chat.createSession({ title });
      const session = data.session || data.data || data;
      state.sessions.unshift(session);
      renderSessionList();
      await activateSession(session);
    } catch (err) {
      toast.error('Failed to create chat: ' + err.message);
    }
  };

  const deleteSession = async (id) => {
    if (!confirm('Delete this chat session?')) return;
    try {
      await API.chat.deleteSession(id);
      state.sessions = state.sessions.filter(s => s.id !== id);
      if (state.activeSession?.id === id) {
        state.activeSession = null;
        state.messages = [];
        Storage.setActiveChatSession(null);
        showWelcomeView();
      }
      renderSessionList();
      toast.success('Chat deleted.');
    } catch (err) {
      toast.error('Failed to delete chat: ' + err.message);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Messages
  // ─────────────────────────────────────────────────────────────

  const loadMessages = async (sessionId, scroll = true) => {
    try {
      const data = await API.chat.getMessages(sessionId);
      state.messages = data.messages || data.data || data || [];
      renderMessages();
      if (scroll) scrollToBottom(true);
    } catch (err) {
      toast.error('Failed to load messages: ' + err.message);
    }
  };

  const renderMessages = () => {
    const list = el('messages-list');
    if (!list) return;
    list.innerHTML = '';

    state.messages.forEach(msg => {
      const bubble = buildMessageBubble(msg);
      list.appendChild(bubble);
    });
  };

  const buildMessageBubble = (msg) => {
    const isUser = msg.role === 'user';
    const wrap   = document.createElement('div');
    wrap.className = `message-wrap ${isUser ? 'user' : 'assistant'}`;
    wrap.dataset.id = msg.id || '';

    const contentHtml = isUser
      ? `<p>${escHtml(msg.content)}</p>`
      : renderMarkdown(msg.content);

    wrap.innerHTML = `
      <div class="message-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}">
        ${!isUser ? '<span class="ai-label">Study-Hub AI</span>' : ''}
        <div class="message-content">${contentHtml}</div>
        <span class="message-time">${msg.created_at ? formatDate(msg.created_at) : ''}</span>
      </div>
    `;
    return wrap;
  };

  const appendMessage = (msg) => {
    state.messages.push(msg);
    const list = el('messages-list');
    if (!list) return;
    const bubble = buildMessageBubble(msg);
    list.appendChild(bubble);
    scrollToBottom();
  };

  const scrollToBottom = (instant = false) => {
    const container = el('chat-messages');
    if (!container) return;
    if (instant) {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  };

  // ─────────────────────────────────────────────────────────────

  let _sendLock = false; // Prevents duplicate sends from rapid clicks/Enter

  const sendMessage = async () => {
    const input   = el('chat-input');
    const sendBtn = el('chat-send-btn');
    const content = input?.value.trim();
    if (!content || state.isStreaming || _sendLock) return;

    _sendLock = true;

    // Auto-create session if none
    if (!state.activeSession) {
      await createSession(content.slice(0, 40) || 'New Chat');
      if (!state.activeSession) { _sendLock = false; return; }
    }

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    state.isStreaming = true;

    // Show user message immediately
    const userMsg = {
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    appendMessage(userMsg);
    showMessagesView();

    // Show typing indicator
    const typingEl = showTypingIndicator();

    try {
      const body = {
        content:          content,
        context_note_ids: state.context.noteIds,
        context_pdf_ids:  state.context.pdfIds,
      };

      const data = await API.chat.sendMessage(state.activeSession.id, body);

      removeTypingIndicator(typingEl);

      // Extract the AI response content — always show it in chat
      const aiContent = data.assistantMessage?.content
        || data.message?.content
        || data.content
        || data.reply
        || data.data?.content
        || 'No response.';

      const aiMsg = {
        role: 'assistant',
        content: aiContent,
        created_at: new Date().toISOString(),
        id: data.assistantMessage?.id || data.message?.id || data.id,
      };
      appendMessage(aiMsg);

    } catch (err) {
      removeTypingIndicator(typingEl);
      const errMsg = {
        role: 'assistant',
        content: `⚠️ Error: ${err.message}`,
        created_at: new Date().toISOString(),
      };
      appendMessage(errMsg);
      toast.error('Message failed: ' + err.message);
    } finally {
      state.isStreaming = false;
      _sendLock = false;
      sendBtn.disabled = false;
      input.focus();
    }
  };

  const showTypingIndicator = () => {
    const list = el('messages-list');
    const el2  = document.createElement('div');
    el2.className = 'message-wrap assistant typing-wrap';
    el2.id = 'typing-indicator';
    el2.innerHTML = `
      <div class="message-bubble ai-bubble thinking-bubble">
        <span class="ai-label">Study-Hub AI</span>
        <span class="thinking-text">Thinking...</span>
      </div>
    `;
    list?.appendChild(el2);
    scrollToBottom();

    // Cycle through status texts
    const phases = ['Thinking...', 'Analyzing...', 'Composing...', 'Reviewing...'];
    let idx = 0;
    const textEl = el2.querySelector('.thinking-text');
    el2._thinkingInterval = setInterval(() => {
      idx = (idx + 1) % phases.length;
      if (textEl) {
        textEl.classList.add('thinking-text--fade');
        setTimeout(() => {
          textEl.textContent = phases[idx];
          textEl.classList.remove('thinking-text--fade');
        }, 250);
      }
    }, 2500);

    return el2;
  };

  const removeTypingIndicator = (el2) => {
    if (el2?._thinkingInterval) clearInterval(el2._thinkingInterval);
    el2?.remove();
  };

  const updateSessionTitle = async (id, title) => {
    try {
      await API.chat.updateSession(id, { title });
      const s = state.sessions.find(s => s.id === id);
      if (s) s.title = title;
      renderSessionList();
    } catch { /* silent */ }
  };

  // ─────────────────────────────────────────────────────────────
  // Context attachment
  // ─────────────────────────────────────────────────────────────

  const openAttachMenu = async () => {
    const menu = el('chat-attach-menu');
    if (!menu) return;

    const isOpen = !menu.classList.contains('hidden');
    if (isOpen) { hide(menu); return; }

    await populateAttachLists();
    show(menu);

    // Close on outside click
    setTimeout(() => {
      const closeMenu = (e) => {
        if (!menu.contains(e.target) && e.target !== el('chat-attach-btn')) {
          hide(menu);
          document.removeEventListener('click', closeMenu);
        }
      };
      document.addEventListener('click', closeMenu);
    }, 10);
  };

  const populateAttachLists = async () => {
    // Notes
    const notesList = el('attach-notes-list');
    if (notesList) {
      try {
        const data  = await API.notes.getAll({ limit: 50 });
        const notes = data.notes || data.data || data || [];
        notesList.innerHTML = notes.length === 0
          ? '<p class="attach-empty">No notes yet</p>'
          : notes.map(n => `
              <label class="attach-item" data-type="note" data-id="${n.id}">
                <input type="checkbox" class="attach-checkbox"
                  value="${n.id}"
                  ${state.context.noteIds.includes(n.id) ? 'checked' : ''}
                />
                <span class="attach-item-name">${escHtml(truncate(n.title || 'Untitled', 36))}</span>
              </label>
            `).join('');

        notesList.querySelectorAll('.attach-checkbox').forEach(cb => {
          cb.addEventListener('change', () => toggleContextItem('note', cb));
        });
      } catch (err) {
        notesList.innerHTML = '<p class="attach-empty">Failed to load notes</p>';
      }
    }

    // PDFs
    const pdfsList = el('attach-pdfs-list');
    if (pdfsList) {
      try {
        const data = await API.pdfs.getAll({ limit: 50 });
        const pdfs = data.pdfs || data.data || data || [];
        pdfsList.innerHTML = pdfs.length === 0
          ? '<p class="attach-empty">No PDFs yet</p>'
          : pdfs.map(p => `
              <label class="attach-item" data-type="pdf" data-id="${p.id}">
                <input type="checkbox" class="attach-checkbox"
                  value="${p.id}"
                  ${state.context.pdfIds.includes(p.id) ? 'checked' : ''}
                />
                <span class="attach-item-name">${escHtml(truncate(p.original_name || p.filename || 'Untitled', 36))}</span>
              </label>
            `).join('');

        pdfsList.querySelectorAll('.attach-checkbox').forEach(cb => {
          cb.addEventListener('change', () => toggleContextItem('pdf', cb));
        });
      } catch {
        pdfsList.innerHTML = '<p class="attach-empty">Failed to load PDFs</p>';
      }
    }
  };

  const toggleContextItem = (type, checkbox) => {
    const id = checkbox.value; // IDs are UUIDs — never parseInt them
    if (type === 'note') {
      if (checkbox.checked) {
        if (!state.context.noteIds.includes(id)) state.context.noteIds.push(id);
      } else {
        state.context.noteIds = state.context.noteIds.filter(x => x !== id);
      }
    } else {
      if (checkbox.checked) {
        if (!state.context.pdfIds.includes(id)) state.context.pdfIds.push(id);
      } else {
        state.context.pdfIds = state.context.pdfIds.filter(x => x !== id);
      }
    }
    updateContextBadge();
  };

  const attachPDF = (pdf) => {
    if (!state.context.pdfIds.includes(pdf.id)) {
      state.context.pdfIds.push(pdf.id);
      state.context.pdfs.push(pdf);
    }
    updateContextBadge();
    // Switch to chat view
    window.dispatchEvent(new CustomEvent('nav:switch', { detail: { view: 'chat' } }));
  };

  const clearContext = () => {
    state.context = { noteIds: [], pdfIds: [], notes: [], pdfs: [] };
    updateContextBadge();
  };

  const updateContextBadge = () => {
    const badge = el('chat-context-badge');
    const label = el('chat-context-label');
    const total = state.context.noteIds.length + state.context.pdfIds.length;

    if (total === 0) {
      hide(badge);
      return;
    }

    show(badge);
    const parts = [];
    if (state.context.noteIds.length) parts.push(`${state.context.noteIds.length} note${state.context.noteIds.length !== 1 ? 's' : ''}`);
    if (state.context.pdfIds.length)  parts.push(`${state.context.pdfIds.length} PDF${state.context.pdfIds.length !== 1 ? 's' : ''}`);
    if (label) label.textContent = '📎 ' + parts.join(', ');
  };

  // ─────────────────────────────────────────────────────────────
  // View helpers
  // ─────────────────────────────────────────────────────────────

  const showWelcomeView = () => {
    show(el('chat-welcome'));
    hide(el('chat-messages'));
  };

  const showMessagesView = () => {
    hide(el('chat-welcome'));
    show(el('chat-messages'));
  };

  // ─────────────────────────────────────────────────────────────
  // Search
  // ─────────────────────────────────────────────────────────────

  const performSearch = async (query) => {
    state.searchQuery = query;

    if (!query) {
      state.searchResults = null;
      renderSessionList();
      return;
    }

    // Step 1: Instant client-side fuzzy match on cached sessions
    const clientResults = state.sessions
      .map(s => ({
        ...s,
        _score: fuzzyScore(s.title || '', query) +
                fuzzyScore(s.last_message || '', query) * 0.5,
      }))
      .filter(s => s._score > 0)
      .sort((a, b) => b._score - a._score);

    // Show client results immediately
    state.searchResults = clientResults;
    renderSessionList();

    // Step 2: Server-side deep search (searches message content too)
    try {
      const data = await API.chat.searchSessions(query);
      const serverSessions = data.sessions || [];

      // Merge: server results may include sessions not matched client-side
      const mergedMap = new Map();

      // Add client results first
      for (const s of clientResults) {
        mergedMap.set(s.id, s);
      }

      // Add/update with server results
      for (const s of serverSessions) {
        if (!mergedMap.has(s.id)) {
          s._score = fuzzyScore(s.title || '', query) +
                     fuzzyScore(s.last_message || '', query) * 0.5 + 5; // bonus for server match
          mergedMap.set(s.id, s);
        } else {
          // Boost score for sessions found by both
          const existing = mergedMap.get(s.id);
          existing._score = (existing._score || 0) + 5;
          // Update last_message if server provided a richer one
          if (s.last_message && !existing.last_message) {
            existing.last_message = s.last_message;
          }
          mergedMap.set(s.id, existing);
        }
      }

      const merged = [...mergedMap.values()].sort((a, b) => (b._score || 0) - (a._score || 0));
      state.searchResults = merged;
      renderSessionList();
    } catch (err) {
      // If server search fails, we still have client results
      console.warn('Server chat search failed:', err.message);
    }
  };

  const debouncedSearch = debounce((query) => performSearch(query), 250);

  const clearSearch = () => {
    const searchInput = el('chat-search-input');
    const clearBtn = el('chat-search-clear');
    if (searchInput) searchInput.value = '';
    if (clearBtn) hide(clearBtn);
    state.searchQuery = '';
    state.searchResults = null;
    renderSessionList();
  };

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────

  const init = () => {
    // New chat button
    el('new-chat-btn')?.addEventListener('click', () => {
      state.activeSession = null;
      state.messages = [];
      Storage.setActiveChatSession(null);
      clearSearch();
      renderSessionList();
      showWelcomeView();
    });

    // Send button & Enter key
    const sendBtn = el('chat-send-btn');
    const input   = el('chat-input');

    sendBtn?.addEventListener('click', sendMessage);

    if (input) {
      input.addEventListener('input', () => {
        autoResize(input, 160);
        if (sendBtn) sendBtn.disabled = !input.value.trim() || state.isStreaming;
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (input.value.trim() && !state.isStreaming) sendMessage();
        }
      });
    }

    // ── Chat search ──────────────────────────────────────────
    const searchInput = el('chat-search-input');
    const clearBtn = el('chat-search-clear');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        if (clearBtn) {
          if (q) show(clearBtn); else hide(clearBtn);
        }
        debouncedSearch(q);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          clearSearch();
          searchInput.blur();
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearSearch();
        searchInput?.focus();
      });
    }

    // Attach menu
    el('chat-attach-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openAttachMenu();
    });

    // Clear context
    el('clear-context-btn')?.addEventListener('click', clearContext);

    // Welcome screen suggestion chips
    document.querySelectorAll('.suggestion-chip[data-prompt]').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        if (input && prompt) {
          input.value = prompt;
          input.dispatchEvent(new Event('input'));
          input.focus();
        }
      });
    });

    // Listen for PDF "Ask AI" from viewer
    window.addEventListener('chat:attach-pdf', (e) => {
      attachPDF(e.detail.pdf);
    });

    loadSessions();
  };

  return {
    init,
    loadSessions,
    createSession,
    attachPDF,
    clearContext,
  };
})();
