/* ═══════════════════════════════════════════════════════════════
   STUDY-HUB — Export Module
   Exports all notes as a ZIP of Markdown files (fully client-side)
   ═══════════════════════════════════════════════════════════════ */

window.ExportNotes = (() => {

  // ── Build YAML-style frontmatter ────────────────────────────
  const buildFrontmatter = (note, folderName) => {
    const lines = [
      '---',
      `title: "${(note.title || 'Untitled').replace(/"/g, '\\"')}"`,
      `folder: "${folderName}"`,
      `pinned: ${note.is_pinned || false}`,
      `color: "${note.color || '#1a1a1a'}"`,
      `tags: [${(note.tags || []).map(t => `"${t}"`).join(', ')}]`,
      `created: ${note.created_at}`,
      `updated: ${note.updated_at}`,
      '---',
      '',
    ];
    return lines.join('\n');
  };

  // ── Sanitize string for use as a filename ───────────────────
  const sanitizeFilename = (str) =>
    (str || 'Untitled')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100) || 'Untitled';

  // ── Build folder name map from folder list ──────────────────
  const buildFolderMap = (folders) => {
    const map = {}; // id → display path
    const byId = {};
    folders.forEach(f => { byId[f.id] = f; });

    const getPath = (folderId) => {
      if (!folderId || !byId[folderId]) return null;
      const f = byId[folderId];
      if (f.parent_id && byId[f.parent_id]) {
        return `${getPath(f.parent_id)}/${f.icon || '📁'} ${f.name}`;
      }
      return `${f.icon || '📁'} ${f.name}`;
    };

    folders.forEach(f => {
      map[f.id] = getPath(f.id);
    });

    return map;
  };

  // ── Main export function ────────────────────────────────────
  const exportAllNotes = async () => {
    // Guard: JSZip must be available
    if (typeof JSZip === 'undefined') {
      toast.error('Export library not loaded. Please refresh and try again.');
      return;
    }

    const btn = document.getElementById('export-notes-btn');
    if (btn) {
      btn.textContent = 'Exporting…';
      btn.disabled = true;
    }

    try {
      // Fetch all notes + folders in parallel
      const [notesData, foldersData] = await Promise.all([
        API.notes.getAll({}),
        API.notes.getFolders(),
      ]);

      const notes   = notesData.notes   || [];
      const folders = foldersData.folders || [];

      if (notes.length === 0) {
        toast.info('No notes to export.');
        return;
      }

      const folderMap = buildFolderMap(folders);
      const zip       = new JSZip();
      const dateStr   = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const rootName  = `study-hub-notes-${dateStr}`;

      // Track used filenames per folder to handle duplicates
      const usedNames = {};

      notes.forEach(note => {
        // Determine folder path inside ZIP
        const folderPath = note.folder_id && folderMap[note.folder_id]
          ? folderMap[note.folder_id]
          : '📋 Uncategorized';

        const sanitizedFolder = sanitizeFilename(folderPath);
        const baseTitle       = sanitizeFilename(note.title || 'Untitled');

        // Deduplicate filenames within the same folder
        const key = `${sanitizedFolder}/${baseTitle}`;
        usedNames[key] = (usedNames[key] || 0) + 1;
        const suffix    = usedNames[key] > 1 ? ` (${usedNames[key]})` : '';
        const fileName  = `${baseTitle}${suffix}.md`;

        const frontmatter = buildFrontmatter(note, folderPath.replace(/^[^\w]*/, '').trim());
        const fileContent = frontmatter + (note.content || '');

        zip.folder(sanitizedFolder).file(fileName, fileContent);
      });

      // Add manifest JSON
      const manifest = {
        exportDate:  new Date().toISOString(),
        totalNotes:  notes.length,
        totalFolders: folders.length,
        notes: notes.map(n => ({
          id:        n.id,
          title:     n.title,
          folder:    n.folder_id ? folderMap[n.folder_id] : 'Uncategorized',
          pinned:    n.is_pinned,
          tags:      n.tags,
          created:   n.created_at,
          updated:   n.updated_at,
        })),
      };
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Generate and trigger download
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = `${rootName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${notes.length} note${notes.length !== 1 ? 's' : ''} successfully!`);

      // Close the dropdown
      document.getElementById('user-dropdown')?.classList.add('hidden');

    } catch (err) {
      console.error('[Export] Failed:', err);
      toast.error('Export failed: ' + err.message);
    } finally {
      if (btn) {
        btn.textContent = 'Export Notes';
        btn.disabled = false;
      }
    }
  };

  // ── Init ─────────────────────────────────────────────────────
  const init = () => {
    document.getElementById('export-notes-btn')
      ?.addEventListener('click', exportAllNotes);
  };

  return { init, exportAllNotes };
})();
