const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/emailService');

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    // Check if user exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Generate a random avatar color
    const colors = ['#6c63ff', '#ff6584', '#43b97f', '#f7b731', '#3d5af1', '#e84393'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const result = await query(
      `INSERT INTO users (name, email, password_hash, avatar_color)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, avatar_color, created_at`,
      [name.trim(), email.toLowerCase(), passwordHash, avatarColor]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    // Create default folders for new user
    await query(
      `INSERT INTO note_folders (user_id, name, icon, color) VALUES
       ($1, 'Personal', '✏️', '#6c63ff'),
       ($1, 'Study', '📚', '#43b97f'),
       ($1, 'Work', '💼', '#f7b731')`,
      [user.id]
    );

    await query(
      `INSERT INTO pdf_folders (user_id, name, icon, color) VALUES
       ($1, 'Textbooks', '📖', '#6c63ff'),
       ($1, 'Research', '🔬', '#43b97f')`,
      [user.id]
    );

    res.status(201).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, avatarColor: user.avatar_color }
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const result = await query(
      'SELECT id, name, email, password_hash, avatar_color FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, avatarColor: user.avatar_color }
    });
  } catch (err) {
    next(err);
  }
};

const getProfile = async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      avatarColor: req.user.avatar_color
    }
  });
};

const updateProfile = async (req, res, next) => {
  try {
    const { name, avatarColor } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); values.push(name.trim()); }
    if (avatarColor) { updates.push(`avatar_color = $${idx++}`); values.push(avatarColor); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    values.push(req.user.id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, email, avatar_color`,
      values
    );

    const user = result.rows[0];
    res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, avatarColor: user.avatar_color }
    });
  } catch (err) {
    next(err);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const userRes = await query('SELECT id, name, email FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userRes.rows.length === 0) {
      // For security, don't reveal that the user doesn't exist
      return res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
    }

    const user = userRes.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Save token to DB
    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    // Build reset URL
    const resetUrl = `${req.protocol}://${req.get('host')}/#reset-password?token=${token}`;

    // Send email
    await sendPasswordResetEmail(user.email, user.name, resetUrl);

    res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, error: 'Token and password are required' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

    // Find and validate token
    const tokenRes = await query(
      `SELECT t.*, u.email FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token = $1 AND t.expires_at > NOW()`,
      [token]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    const resetRequest = tokenRes.rows[0];
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetRequest.user_id]);

    // Delete all reset tokens for this user
    await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [resetRequest.user_id]);

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getProfile, updateProfile, forgotPassword, resetPassword };

