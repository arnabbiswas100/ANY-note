# Study Hub

Your personal knowledge system — notes, PDFs, and an AI assistant that actually knows your stuff.

---

## What it does

- Write and organize notes into folders, with a full markdown editor
- Upload PDFs and read them in-browser — no downloading back and forth
- Chat with an AI that has context of your notes and PDFs
- Ask it to create a note from a conversation and it saves directly to your library
- Two themes, two modes: Minimal and Glass, each with dark and light variants

---

## Stack

**Backend** — Node.js + Express, PostgreSQL, JWT auth, Multer for file uploads, pdf-parse for text extraction, OpenRouter API for LLM calls (free tier, auto-selects best available model with Llama 3.3 70B and Gemma as fallbacks)

**Frontend** — Vanilla JS SPA, no framework, no build step

---

## Getting started

You need Node 18+, PostgreSQL running locally, and an OpenRouter API key (free at [openrouter.ai](https://openrouter.ai)).

```bash
git clone <repo-url>
cd study-hub
npm install
cp .env.example .env
```

Fill in `.env` — at minimum you need `DB_PASSWORD`, `JWT_SECRET`, and `GEMINI_API_KEY` (used as the OpenRouter key variable, see note below). Then:

```bash
npm run db:init
npm start
```

Open `http://localhost:3000` and create an account.

> **Note on the API key variable name:** the env var is still called `GEMINI_API_KEY` for historical reasons, but the service now calls OpenRouter, not Gemini directly. Just put your OpenRouter key there.

---

## Environment variables

Copy `.env.example` and edit it. Full reference:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DB_HOST` | yes | `localhost` | |
| `DB_PORT` | no | `5432` | |
| `DB_NAME` | yes | `studyhub` | |
| `DB_USER` | yes | `postgres` | |
| `DB_PASSWORD` | yes | — | |
| `JWT_SECRET` | yes | — | Min 32 chars, keep it random |
| `JWT_EXPIRES_IN` | no | `7d` | |
| `GEMINI_API_KEY` | yes | — | Your OpenRouter key goes here |
| `PORT` | no | `3000` | |
| `NODE_ENV` | no | `development` | Set to `production` on server |
| `MAX_FILE_SIZE_MB` | no | `50` | PDF upload limit |
| `ALLOWED_ORIGINS` | no | `http://localhost:3000` | Comma-separated in production |

---

## npm scripts

```bash
npm start          # run the server
npm run dev        # run with nodemon (auto-restart on changes)
npm run db:init    # create the database and apply schema
npm run db:reset   # ⚠️  wipe everything and re-apply schema
npm run setup      # interactive first-time setup wizard
```

---

## Project layout

```
study-hub/
├── backend/
│   ├── config/
│   │   ├── database.js        # PostgreSQL connection pool
│   │   └── schema.sql         # table definitions, applied on every boot
│   ├── controllers/           # auth, notes, pdfs, chat
│   ├── middleware/
│   │   ├── auth.js            # JWT verification
│   │   ├── errorHandler.js    # global error handling
│   │   └── upload.js          # multer / file validation
│   ├── routes/index.js        # all routes in one place
│   ├── services/
│   │   ├── llmService.js      # OpenRouter integration + fallback chain
│   │   └── pdfService.js      # PDF text extraction
│   └── server.js
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── variables.css      # design tokens, all four theme variants
│   │   ├── glassmorphic.css   # glass theme overrides
│   │   └── ...                # reset, base, layout, components, animations
│   └── js/
│       ├── app.js             # router, theme system, sidebar
│       └── modules/           # auth, notes, pdfs, chat — one file each
├── scripts/                   # setup, db-init, db-reset
├── uploads/pdfs/              # uploaded files, gitignored
├── render.yaml                # Render.com deployment config
└── .env.example
```

---

## API routes

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/profile
PUT    /api/auth/profile

GET    /api/notes
GET    /api/notes/:id
POST   /api/notes
PUT    /api/notes/:id
DELETE /api/notes/:id
GET    /api/notes/folders
POST   /api/notes/folders
PUT    /api/notes/folders/:id
DELETE /api/notes/folders/:id

GET    /api/pdfs
GET    /api/pdfs/:id
POST   /api/pdfs/upload
GET    /api/pdfs/:id/stream
GET    /api/pdfs/:id/download
PUT    /api/pdfs/:id
DELETE /api/pdfs/:id
GET    /api/pdfs/folders
POST   /api/pdfs/folders
PUT    /api/pdfs/folders/:id
DELETE /api/pdfs/folders/:id

GET    /api/chat/sessions
POST   /api/chat/sessions
PUT    /api/chat/sessions/:id
DELETE /api/chat/sessions/:id
GET    /api/chat/sessions/:id/messages
POST   /api/chat/sessions/:sessionId/messages

GET    /api/health
```

All routes except `/auth/register`, `/auth/login`, and `/health` require a `Authorization: Bearer <token>` header.

---

## Deploying to Render

A `render.yaml` is included. Connect the repo on [render.com](https://render.com), add the environment variables that aren't auto-generated (`DB_PASSWORD`, `GEMINI_API_KEY`), and deploy. The free PostgreSQL plan is already wired up in the config.

The schema applies automatically on every server start — no migration step needed.

---

## A few things worth knowing

- PDF text is extracted on upload and stored in the database. The AI reads from this extracted text, not the raw file, so scanned PDFs without embedded text won't work well with the chat.
- The AI auto-detect feature watches for `[[CREATE_NOTE]]` tags in its responses. If it wraps content in those tags, the note is saved to your library automatically.
- Rate limiting is split: auth endpoints (login/register) are capped at 10 requests per 15 minutes, everything else at 300 per minute.
- Uploads are stored under `uploads/pdfs/<user-id>/` and are gitignored — back them up separately if you care about them.
