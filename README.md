# Study-Hub

A production-grade personal knowledge + AI-powered study system combining notes, PDFs, and LLM interaction.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your DB credentials and Gemini API key

# 3. Initialize database
npm run db:init

# 4. Start server
npm start
```

Open http://localhost:3000

---

## Project Structure

```
study-hub/
├── backend/
│   ├── config/
│   │   ├── database.js          # PostgreSQL pool + query helper
│   │   └── schema.sql           # All table definitions + triggers
│   ├── controllers/
│   │   ├── authController.js    # register, login, profile
│   │   ├── notesController.js   # note + folder CRUD
│   │   ├── pdfController.js     # pdf + folder CRUD, upload, stream
│   │   └── chatController.js    # sessions, messages, LLM dispatch
│   ├── middleware/
│   │   ├── auth.js              # JWT authenticate + generateToken
│   │   ├── errorHandler.js      # global error + 404 handlers
│   │   └── upload.js            # multer config for PDF uploads
│   ├── routes/
│   │   └── index.js             # all API routes wired up
│   ├── services/
│   │   ├── llmService.js        # Gemini API integration
│   │   └── pdfService.js        # PDF text extraction via pdf-parse
│   └── server.js                # Express app + startup
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── reset.css
│   │   ├── variables.css
│   │   ├── base.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   ├── animations.css
│   │   ├── auth.css
│   │   ├── notes.css
│   │   ├── pdfs.css
│   │   └── chat.css
│   └── js/
│       ├── app.js               # main entry point, router
│       ├── modules/
│       │   ├── auth.js          # login/register UI
│       │   ├── notes.js         # notes section UI
│       │   ├── pdfs.js          # PDF library UI
│       │   └── chat.js          # chat UI
│       └── utils/
│           ├── api.js           # fetch wrapper with auth headers
│           ├── helpers.js       # shared utility functions
│           └── storage.js       # localStorage helpers
├── scripts/
│   ├── setup.js                 # one-shot setup wizard
│   ├── db-init.js               # creates DB + applies schema
│   └── db-reset.js              # drops all tables + re-applies schema
├── uploads/
│   ├── pdfs/                    # uploaded PDFs (per-user subdirs)
│   └── thumbnails/              # future: PDF thumbnails
├── .env.example
├── .gitignore
└── package.json
```

## npm Scripts

| Command | Description |
|---|---|
| `npm start` | Start production server |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm run setup` | First-time setup wizard |
| `npm run db:init` | Create DB + apply schema |
| `npm run db:reset` | ⚠️ Drop all data + re-apply schema |

## Environment Variables

See `.env.example` for all options. Required:

- `DB_PASSWORD` — PostgreSQL password
- `JWT_SECRET` — at least 32 random characters
- `GEMINI_API_KEY` — from https://aistudio.google.com/app/apikey

## API Routes

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/profile
PUT    /api/auth/profile

GET    /api/notes/folders
POST   /api/notes/folders
PUT    /api/notes/folders/:id
DELETE /api/notes/folders/:id
GET    /api/notes
GET    /api/notes/:id
POST   /api/notes
PUT    /api/notes/:id
DELETE /api/notes/:id

GET    /api/pdfs/folders
POST   /api/pdfs/folders
PUT    /api/pdfs/folders/:id
DELETE /api/pdfs/folders/:id
GET    /api/pdfs
GET    /api/pdfs/:id
POST   /api/pdfs/upload
GET    /api/pdfs/:id/stream
GET    /api/pdfs/:id/download
PUT    /api/pdfs/:id
DELETE /api/pdfs/:id

GET    /api/chat/sessions
POST   /api/chat/sessions
PUT    /api/chat/sessions/:id
DELETE /api/chat/sessions/:id
GET    /api/chat/sessions/:id/messages
POST   /api/chat/sessions/:sessionId/messages

GET    /api/health
```
