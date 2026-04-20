const { query } = require('../config/database');

// ── FOLDERS ──────────────────────────────────────────────────────────────────

const getFolders = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT f.*, COUNT(n.id)::int AS note_count
       FROM note_folders f
       LEFT JOIN notes n ON n.folder_id = f.id AND n.is_archived = false
       WHERE f.user_id = $1
       GROUP BY f.id
       ORDER BY f.created_at ASC`,
      [req.user.id]
    );
    res.json({ success: true, folders: result.rows });
  } catch (err) { next(err); }
};

const createFolder = async (req, res, next) => {
  try {
    const { name, icon = '📁', color = '#6c63ff' } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Folder name is required' });

    const result = await query(
      'INSERT INTO note_folders (user_id, name, icon, color) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, name.trim(), icon, color]
    );
    res.status(201).json({ success: true, folder: result.rows[0] });
  } catch (err) { next(err); }
};

const updateFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, icon, color } = req.body;
    const updates = []; const values = []; let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name.trim()); }
    if (icon !== undefined) { updates.push(`icon = $${idx++}`); values.push(icon); }
    if (color !== undefined) { updates.push(`color = $${idx++}`); values.push(color); }

    if (!updates.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    values.push(id, req.user.id);
    const result = await query(
      `UPDATE note_folders SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Folder not found' });
    res.json({ success: true, folder: result.rows[0] });
  } catch (err) { next(err); }
};

const deleteFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      'DELETE FROM note_folders WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Folder not found' });
    res.json({ success: true, message: 'Folder deleted. Notes have been moved to uncategorized.' });
  } catch (err) { next(err); }
};

// ── NOTES ─────────────────────────────────────────────────────────────────────

const getNotes = async (req, res, next) => {
  try {
    const { folder, search, archived = 'false', pinned } = req.query;
    const values = [req.user.id];
    let idx = 2;
    const conditions = ['n.user_id = $1'];

    conditions.push(`n.is_archived = ${archived === 'true'}`);

    if (folder === 'uncategorized') {
      conditions.push('n.folder_id IS NULL');
    } else if (folder) {
      conditions.push(`n.folder_id = $${idx++}`);
      values.push(folder);
    }

    if (pinned === 'true') {
      conditions.push('n.is_pinned = true');
    }

    if (search) {
      conditions.push(`to_tsvector('english', COALESCE(n.title,'') || ' ' || COALESCE(n.content,'')) @@ plainto_tsquery('english', $${idx++})`);
      values.push(search);
    }

    const sql = `
      SELECT n.*, f.name AS folder_name, f.color AS folder_color, f.icon AS folder_icon
      FROM notes n
      LEFT JOIN note_folders f ON f.id = n.folder_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY n.is_pinned DESC, n.updated_at DESC
    `;

    const result = await query(sql, values);
    res.json({ success: true, notes: result.rows });
  } catch (err) { next(err); }
};

const getNote = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT n.*, f.name AS folder_name FROM notes n
       LEFT JOIN note_folders f ON f.id = n.folder_id
       WHERE n.id = $1 AND n.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Note not found' });
    res.json({ success: true, note: result.rows[0] });
  } catch (err) { next(err); }
};

const createNote = async (req, res, next) => {
  try {
    const { title = '', content = '', color = '#1a1a1a', folder_id = null, tags = [] } = req.body;

    const result = await query(
      `INSERT INTO notes (user_id, title, content, color, folder_id, tags)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, title, content, color, folder_id || null, tags]
    );
    res.status(201).json({ success: true, note: result.rows[0] });
  } catch (err) { next(err); }
};

const updateNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, color, folder_id, tags, is_pinned, is_archived } = req.body;
    const updates = []; const values = []; let idx = 1;

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
    if (content !== undefined) { updates.push(`content = $${idx++}`); values.push(content); }
    if (color !== undefined) { updates.push(`color = $${idx++}`); values.push(color); }
    if (folder_id !== undefined) { updates.push(`folder_id = $${idx++}`); values.push(folder_id || null); }
    if (tags !== undefined) { updates.push(`tags = $${idx++}`); values.push(tags); }
    if (is_pinned !== undefined) { updates.push(`is_pinned = $${idx++}`); values.push(is_pinned); }
    if (is_archived !== undefined) { updates.push(`is_archived = $${idx++}`); values.push(is_archived); }

    if (!updates.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    values.push(id, req.user.id);
    const result = await query(
      `UPDATE notes SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Note not found' });
    res.json({ success: true, note: result.rows[0] });
  } catch (err) { next(err); }
};

const deleteNote = async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Note not found' });
    res.json({ success: true, message: 'Note deleted' });
  } catch (err) { next(err); }
};

module.exports = {
  getFolders, createFolder, updateFolder, deleteFolder,
  getNotes, getNote, createNote, updateNote, deleteNote
};
