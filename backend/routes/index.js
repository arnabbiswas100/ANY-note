const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Controllers
const authController = require('../controllers/authController');
const notesController = require('../controllers/notesController');
const pdfController = require('../controllers/pdfController');
const chatController = require('../controllers/chatController');

// =============================================
// AUTH ROUTES
// =============================================
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/profile', authenticate, authController.getProfile);
router.put('/auth/profile', authenticate, authController.updateProfile);

// =============================================
// NOTES ROUTES
// =============================================
// Folders
router.get('/notes/folders', authenticate, notesController.getFolders);
router.post('/notes/folders', authenticate, notesController.createFolder);
router.put('/notes/folders/:id', authenticate, notesController.updateFolder);
router.delete('/notes/folders/:id', authenticate, notesController.deleteFolder);

// Notes
router.get('/notes', authenticate, notesController.getNotes);
router.get('/notes/:id', authenticate, notesController.getNote);
router.post('/notes', authenticate, notesController.createNote);
router.put('/notes/:id', authenticate, notesController.updateNote);
router.delete('/notes/:id', authenticate, notesController.deleteNote);

// =============================================
// PDF ROUTES
// =============================================
// Folders
router.get('/pdfs/folders', authenticate, pdfController.getFolders);
router.post('/pdfs/folders', authenticate, pdfController.createFolder);
router.put('/pdfs/folders/:id', authenticate, pdfController.updateFolder);
router.delete('/pdfs/folders/:id', authenticate, pdfController.deleteFolder);

// PDFs
router.get('/pdfs', authenticate, pdfController.getPdfs);
router.get('/pdfs/:id', authenticate, pdfController.getPdf);
router.post('/pdfs/upload', authenticate, upload.single('pdf'), pdfController.uploadPdf);
router.get('/pdfs/:id/stream', authenticate, pdfController.streamPdf);
router.get('/pdfs/:id/download', authenticate, pdfController.downloadPdf);
router.put('/pdfs/:id', authenticate, pdfController.updatePdf);
router.delete('/pdfs/:id', authenticate, pdfController.deletePdf);

// =============================================
// CHAT ROUTES
// =============================================
router.get('/chat/sessions', authenticate, chatController.getSessions);
router.post('/chat/sessions', authenticate, chatController.createSession);
router.put('/chat/sessions/:id', authenticate, chatController.updateSession);
router.delete('/chat/sessions/:id', authenticate, chatController.deleteSession);
router.get('/chat/sessions/:id/messages', authenticate, chatController.getMessages);
router.post('/chat/sessions/:sessionId/messages', authenticate, chatController.sendMessage);

// =============================================
// HEALTH CHECK
// =============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
