/* ═══════════════════════════════════════════════════════════════
   STUDY-HUB — Notes Module
   ═══════════════════════════════════════════════════════════════ */

const Notes = (() => {
  const { toast, show, hide, debounce, formatDate, formatDateLong,
          escHtml, renderMarkdown, truncate } = Helpers;

  // ── State ─────────────────────────────────────────────────────
  let state = {
    notes:          [],
    folders:        [],
    activeFolder:   'all',
    searchQuery:    '',
    editingNote:    null,   // null = new, id = editing
    currentColor:   '',
    currentPinned:  false,
    iconSelected:   '📁',
    folderColor:    '',     // color selected in folder modal
    folderModalMode: 'note', // 'note' | 'pdf'
  };

  // ── Note color palette ────────────────────────────────────────
  const COLORS = [
    { name: 'default', hex: '' },
    { name: 'red',     hex: '#ff5858' },
    { name: 'orange',  hex: '#ff9644' },
    { name: 'yellow',  hex: '#ffd60a' },
    { name: 'green',   hex: '#4cde80' },
    { name: 'teal',    hex: '#24c6c8' },
    { name: 'blue',    hex: '#4895ef' },
    { name: 'purple',  hex: '#9b5de5' },
    { name: 'pink',    hex: '#f15bb5' },
    { name: 'gray',    hex: '#8a8480' },
  ];

  // ── Folder color palette ──────────────────────────────────────
  const FOLDER_COLORS = [
    { name: 'none',   hex: '' },
    { name: 'red',    hex: '#ff5858' },
    { name: 'orange', hex: '#ff9644' },
    { name: 'yellow', hex: '#ffd60a' },
    { name: 'green',  hex: '#4cde80' },
    { name: 'teal',   hex: '#24c6c8' },
    { name: 'blue',   hex: '#4895ef' },
    { name: 'purple', hex: '#9b5de5' },
    { name: 'pink',   hex: '#f15bb5' },
    { name: 'gray',   hex: '#8a8480' },
  ];
  const el = (id) => document.getElementById(id);

  // ── Load notes ────────────────────────────────────────────────
  const loadNotes = async () => {
    try {
      const params = {};
      if (state.searchQuery)               params.search = state.searchQuery;
      if (state.activeFolder === 'pinned') params.pinned = true;
      else if (state.activeFolder === 'uncategorized') params.folder = 'uncategorized';
      else if (state.activeFolder !== 'all') params.folder = state.activeFolder;

      const data = await API.notes.getAll(params);
      state.notes = data.notes || data.data || data || [];
      renderGrid();
    } catch (err) {
      toast.error('Failed to load notes: ' + err.message);
    }
  };

  // ── Load folders ──────────────────────────────────────────────
  const loadFolders = async () => {
    try {
      const data = await API.notes.getFolders();
      state.folders = data.folders || data.data || data || [];
      renderFolderSidebar();
      renderFolderSelect();
    } catch (err) {
      console.error('Failed to load note folders:', err);
    }
  };

  // ── Render grid ───────────────────────────────────────────────
  const renderGrid = () => {
    const grid    = el('notes-grid');
    const empty   = el('notes-empty');
    const count   = el('notes-count');
    const title   = el('notes-view-title');
    if (!grid) return;

    const folderName = getFolderName(state.activeFolder);
    if (title) title.textContent = folderName;

    // Remove existing cards (keep empty state)
    grid.querySelectorAll('.note-card').forEach(c => c.remove());

    if (state.notes.length === 0) {
      show(empty);
      if (count) count.textContent = '';
      return;
    }

    hide(empty);
    if (count) count.textContent = `${state.notes.length} note${state.notes.length !== 1 ? 's' : ''}`;

    // Render pinned first
    const pinned   = state.notes.filter(n => n.is_pinned);
    const unpinned = state.notes.filter(n => !n.is_pinned);
    [...pinned, ...unpinned].forEach((note, i) => {
      const card = buildNoteCard(note, i);
      grid.appendChild(card);
    });
  };

  // ── Build note card ───────────────────────────────────────────
  const buildNoteCard = (note, idx) => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.dataset.id = note.id;
    if (note.color) card.dataset.color = note.color;
    if (note.is_pinned) card.classList.add('pinned');
    card.style.animationDelay = `${idx * 30}ms`;

    const folderLabel = note.folder_name
      ? `<span class="note-card-folder">${escHtml(note.folder_name)}</span>` : '';

    // Render a short markdown preview for the card body
    const previewText = truncate(note.content || '', 200);
    const previewHtml = renderMarkdown(previewText);

    card.innerHTML = `
      ${note.is_pinned ? '<span class="note-card-pin">📌</span>' : ''}
      ${note.title ? `<div class="note-card-title">${escHtml(note.title)}</div>` : ''}
      <div class="note-card-body">${previewHtml}</div>
      <div class="note-card-footer">
        <span class="note-card-date">${formatDate(note.updated_at)}</span>
        ${folderLabel}
      </div>
      <div class="note-card-actions">
        <button class="note-card-action pin-action" title="${note.is_pinned ? 'Unpin' : 'Pin'}">📌</button>
        <button class="note-card-action danger delete-action" title="Delete">🗑</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.note-card-actions')) return;
      openNoteModal(note);
    });

    card.querySelector('.pin-action').addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(note);
    });

    card.querySelector('.delete-action').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(note.id);
    });

    return card;
  };

  // ── Render folder sidebar ─────────────────────────────────────
  const renderFolderSidebar = () => {
    const container = el('note-folder-items');
    if (!container) return;
    container.innerHTML = '';

    // Update all notes count
    const fcAll = el('fc-all');
    if (fcAll && state.notes.length) fcAll.textContent = state.notes.length;

    state.folders.forEach(folder => {
      const item = document.createElement('div');
      item.className = 'folder-item-wrap';

      const btn = document.createElement('button');
      btn.className = 'folder-item' + (state.activeFolder === String(folder.id) ? ' active' : '');
      btn.dataset.folder = folder.id;

      // Apply folder color as a left accent if set
      const dotStyle = folder.color ? `background:${folder.color};` : 'background:var(--text-3);';

      btn.innerHTML = `
        <span class="folder-color-dot" style="${dotStyle}"></span>
        <span class="folder-icon">${folder.icon || '📁'}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;">${escHtml(folder.name)}</span>
      `;
      btn.addEventListener('click', () => setActiveFolder(String(folder.id)));

      // ⋯ menu button
      const menuBtn = document.createElement('button');
      menuBtn.className = 'folder-menu-btn';
      menuBtn.title = 'Folder options';
      menuBtn.innerHTML = '⋯';
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFolderContextMenu(e, folder);
      });

      item.appendChild(btn);
      item.appendChild(menuBtn);
      container.appendChild(item);
    });
  };

  // ── Render folder select in modal ─────────────────────────────
  const renderFolderSelect = () => {
    const sel = el('note-folder-select');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">No folder</option>';
    state.folders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      sel.appendChild(opt);
    });
    sel.value = current;
  };

  // ── Active folder helpers ─────────────────────────────────────
  const setActiveFolder = (folder) => {
    state.activeFolder = folder;

    document.querySelectorAll('#notes-folders-section .folder-item').forEach(b => {
      b.classList.toggle('active', b.dataset.folder === folder);
    });

    loadNotes();
  };

  const getFolderName = (folder) => {
    if (folder === 'all')           return 'All Notes';
    if (folder === 'pinned')        return 'Pinned';
    if (folder === 'uncategorized') return 'Uncategorized';
    const f = state.folders.find(f => String(f.id) === folder);
    return f ? f.name : 'Notes';
  };

  // ── Note modal ────────────────────────────────────────────────
  const openNoteModal = (note = null) => {
    state.editingNote  = note ? note.id : null;
    state.currentColor = note?.color || '';
    state.currentPinned = note?.is_pinned || false;

    const titleEl    = el('note-title-input');
    const contentEl  = el('note-content-input');
    const deleteBtn  = el('delete-note-btn');
    const pinBtn     = el('note-pin-btn');
    const folderSel  = el('note-folder-select');
    const metaEl     = el('note-meta');
    const modal      = el('note-modal');
    const overlay    = el('note-modal-overlay');

    if (titleEl)   titleEl.value   = note?.title   || '';
    if (contentEl) contentEl.value = note?.content || '';
    if (folderSel) folderSel.value = note?.folder_id || '';

    if (deleteBtn) deleteBtn.style.display = note ? 'inline-flex' : 'none';

    if (pinBtn) {
      pinBtn.classList.toggle('pinned', state.currentPinned);
      pinBtn.title = state.currentPinned ? 'Unpin' : 'Pin';
    }

    if (modal) {
      modal.dataset.color = state.currentColor || '';
    }

    if (metaEl && note) {
      metaEl.textContent = `Edited ${formatDateLong(note.updated_at)}`;
    } else if (metaEl) {
      metaEl.textContent = '';
    }

    renderColorSwatches();

    // Render initial markdown preview
    updateMarkdownPreview();

    show(overlay);
    titleEl?.focus();
  };

  const closeNoteModal = () => {
    hide(el('note-modal-overlay'));
    hide(el('color-picker-popup'));
    state.editingNote = null;
  };

  // ── Color picker ──────────────────────────────────────────────
  const renderColorSwatches = () => {
    const container = el('color-swatches');
    if (!container) return;
    container.innerHTML = '';

    COLORS.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch' + (state.currentColor === c.name ? ' selected' : '');
      swatch.title = c.name;
      swatch.style.background = c.hex || 'var(--bg-3)';
      if (!c.hex) swatch.style.border = '2px solid var(--border-2)';

      swatch.addEventListener('click', () => {
        state.currentColor = c.name === 'default' ? '' : c.name;
        const modal = el('note-modal');
        if (modal) modal.dataset.color = state.currentColor;
        renderColorSwatches(); // re-render to update selected
        hide(el('color-picker-popup'));
      });

      container.appendChild(swatch);
    });
  };

  // ── Save note ─────────────────────────────────────────────────
  const saveNote = async () => {
    const titleEl   = el('note-title-input');
    const contentEl = el('note-content-input');
    const folderSel = el('note-folder-select');

    const title   = titleEl?.value.trim() || '';
    const content = contentEl?.value.replace(/\s+$/, '') || '';  // only trim trailing whitespace, preserve internal newlines/spaces

    if (!title && !content) {
      toast.info('Note is empty — nothing saved.');
      closeNoteModal();
      return;
    }

    const payload = {
      title,
      content,
      color:       state.currentColor || null,
      is_pinned:   state.currentPinned,
      folder_id:   folderSel?.value || null,
    };

    try {
      if (state.editingNote) {
        await API.notes.update(state.editingNote, payload);
        toast.success('Note saved.');
      } else {
        await API.notes.create(payload);
        toast.success('Note created.');
      }
      closeNoteModal();
      await loadNotes();
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    }
  };

  // ── Delete note ───────────────────────────────────────────────
  const deleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    try {
      await API.notes.delete(id);
      toast.success('Note deleted.');
      closeNoteModal();
      await loadNotes();
    } catch (err) {
      toast.error('Delete failed: ' + err.message);
    }
  };

  // ── Toggle pin ────────────────────────────────────────────────
  const togglePin = async (note) => {
    try {
      await API.notes.update(note.id, { is_pinned: !note.is_pinned });
      await loadNotes();
    } catch (err) {
      toast.error('Failed to pin: ' + err.message);
    }
  };

  // ── Folder context menu (⋯ button) ────────────────────────────
  let activeContextMenu = null;

  const openFolderContextMenu = (e, folder) => {
    // Remove any existing menu
    if (activeContextMenu) activeContextMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'folder-context-menu';
    menu.innerHTML = `
      <button class="folder-ctx-item" data-action="edit">✏️ Edit folder</button>
      <button class="folder-ctx-item danger" data-action="delete">🗑 Delete folder</button>
    `;

    document.body.appendChild(menu);
    activeContextMenu = menu;

    // Position near the button
    const rect = e.currentTarget.getBoundingClientRect();
    const menuW = 160;
    let left = rect.left - menuW + rect.width;
    let top  = rect.bottom + 4;
    if (left < 4) left = 4;
    if (top + 100 > window.innerHeight) top = rect.top - 104;
    menu.style.left = left + 'px';
    menu.style.top  = top  + 'px';

    menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
      menu.remove(); activeContextMenu = null;
      openFolderModal('note', folder);
    });
    menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
      menu.remove(); activeContextMenu = null;
      deleteFolder(folder);
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function handler() {
        menu.remove(); activeContextMenu = null;
        document.removeEventListener('click', handler);
      });
    }, 0);
  };

  // ── Delete folder ─────────────────────────────────────────────
  const deleteFolder = async (folder) => {
    if (!confirm(`Delete folder "${folder.name}"? Notes inside will become uncategorized.`)) return;
    try {
      await API.notes.deleteFolder(folder.id);
      toast.success('Folder deleted.');
      // If we were viewing this folder, go back to all
      if (state.activeFolder === String(folder.id)) {
        state.activeFolder = 'all';
      }
      await loadFolders();
      await loadNotes();
    } catch (err) {
      toast.error('Delete failed: ' + err.message);
    }
  };

  // ── Render folder color swatches ──────────────────────────────
  const renderFolderColorSwatches = () => {
    const container = el('folder-color-swatches');
    if (!container) return;
    container.innerHTML = '';

    FOLDER_COLORS.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch folder-color-swatch' + (state.folderColor === c.hex ? ' selected' : '');
      swatch.title = c.name;
      swatch.style.background = c.hex || 'var(--bg-3)';
      if (!c.hex) swatch.style.border = '2px solid var(--border-2)';
      swatch.addEventListener('click', () => {
        state.folderColor = c.hex;
        renderFolderColorSwatches();
      });
      container.appendChild(swatch);
    });
  };

  // ── Folder CRUD ───────────────────────────────────────────────
  let folderModalEditId = null;

  const openFolderModal = (mode = 'note', folder = null) => {
    state.folderModalMode = mode;
    folderModalEditId = folder?.id || null;

    el('folder-modal-title').textContent = folder ? 'Edit Folder' : 'New Folder';
    el('folder-name-input').value = folder?.name || '';

    // Reset icon picker
    state.iconSelected = folder?.icon || '📁';
    document.querySelectorAll('.icon-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.icon === state.iconSelected);
    });

    // Reset color picker
    state.folderColor = folder?.color || '';
    renderFolderColorSwatches();

    show(el('folder-modal-overlay'));
    el('folder-name-input')?.focus();
  };

  const closeFolderModal = () => {
    hide(el('folder-modal-overlay'));
    folderModalEditId = null;
  };

  const saveFolder = async () => {
    const name = el('folder-name-input')?.value.trim();
    if (!name) { toast.error('Folder name required.'); return; }

    const payload = { name, icon: state.iconSelected, color: state.folderColor || null };

    try {
      if (state.folderModalMode === 'note') {
        if (folderModalEditId) {
          await API.notes.updateFolder(folderModalEditId, payload);
        } else {
          await API.notes.createFolder(payload);
        }
        await loadFolders();
      } else {
        if (folderModalEditId) {
          await API.pdfs.updateFolder(folderModalEditId, payload);
        } else {
          await API.pdfs.createFolder(payload);
        }
        window.dispatchEvent(new CustomEvent('pdfs:reloadFolders'));
      }
      closeFolderModal();
      toast.success(folderModalEditId ? 'Folder updated.' : 'Folder created.');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    }
  };

  // ── Search ────────────────────────────────────────────────────
  const handleSearch = debounce((q) => {
    state.searchQuery = q;
    loadNotes();
  }, 350);

  // ── Get notes for external use (chat context) ─────────────────
  const getNotes = () => state.notes;
  const getFolders = () => state.folders;

  // ── Live markdown preview ─────────────────────────────────────
  const updateMarkdownPreview = () => {
    const preview = el('note-markdown-preview');
    if (!preview) return;
    const content = el('note-content-input')?.value || '';
    if (!content.trim()) {
      preview.innerHTML = '<div class="note-preview-empty">Preview will appear here…</div>';
    } else {
      preview.innerHTML = renderMarkdown(content);
    }
  };

  // ── Init ─────────────────────────────────────────────────────
  const init = () => {
    // New note buttons
    el('new-note-btn')?.addEventListener('click', () => openNoteModal());
    el('empty-new-note-btn')?.addEventListener('click', () => openNoteModal());

    // Modal actions
    el('close-note-modal')?.addEventListener('click', closeNoteModal);
    el('save-note-btn')?.addEventListener('click', saveNote);
    el('delete-note-btn')?.addEventListener('click', () => {
      if (state.editingNote) deleteNote(state.editingNote);
    });

    // Pin button in modal
    el('note-pin-btn')?.addEventListener('click', () => {
      state.currentPinned = !state.currentPinned;
      const btn = el('note-pin-btn');
      btn.classList.toggle('pinned', state.currentPinned);
      btn.title = state.currentPinned ? 'Unpin' : 'Pin';
    });

    // Color picker
    el('color-picker-trigger')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const popup = el('color-picker-popup');
      popup?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.color-picker-wrap')) {
        hide(el('color-picker-popup'));
      }
    });

    // Close overlay on backdrop click
    el('note-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'note-modal-overlay') closeNoteModal();
    });

    // Folder sidebar buttons
    el('add-note-folder-btn')?.addEventListener('click', () => openFolderModal('note'));

    document.querySelectorAll('#notes-folders-section .folder-item').forEach(btn => {
      btn.addEventListener('click', () => setActiveFolder(btn.dataset.folder));
    });

    // Folder modal — only handle when PDF module hasn't claimed the modal
    el('save-folder-btn')?.addEventListener('click', () => {
      const overlay = el('folder-modal-overlay');
      if (overlay?.dataset.context !== 'pdf') saveFolder();
    });
    el('cancel-folder-btn')?.addEventListener('click', () => {
      const overlay = el('folder-modal-overlay');
      if (overlay?.dataset.context !== 'pdf') closeFolderModal();
    });

    el('folder-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'folder-modal-overlay') closeFolderModal();
    });

    // Icon picker
    document.querySelectorAll('.icon-option').forEach(opt => {
      opt.addEventListener('click', () => {
        state.iconSelected = opt.dataset.icon;
        document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });

    // Search
    el('notes-search')?.addEventListener('input', (e) => handleSearch(e.target.value));

    // Live markdown preview — updates on every keystroke
    el('note-content-input')?.addEventListener('input', updateMarkdownPreview);

    // Keyboard shortcut
    el('note-content-input')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNote();
      }
    });
  };

  const load = async () => {
    await Promise.all([loadFolders(), loadNotes()]);
  };

  // Expose for PDF module to re-use folder modal
  const openFolderModalPublic = openFolderModal;

  return { init, load, loadNotes, loadFolders, getNotes, getFolders, openFolderModal: openFolderModalPublic };
})();
