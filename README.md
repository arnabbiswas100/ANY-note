
```markdown
# Study-Hub

Your personal, AI-augmented knowledge management system. Organize notes, manage a PDF library, and chat with an AI that understands your local context.

Study-Hub was built under the philosophy of **Constraint-Driven Engineering**. It is a resilient, privacy-focused, and self-hosted alternative to ephemeral cloud knowledge tools, designed to turn infrastructure limitations into architectural strengths.

---

## 📚 Project Documentation
These documents represent the "mental time capsule" of the project, covering everything from basic syntax to complex system design.

* 📖 [**Complete Beginner's Tutorial**](./Study%20Hub:%20My%20Tutorial.pdf) — A 140-page, step-by-step guide to building this entire stack from scratch. Designed for students and those new to web development.
* 🎓 [**Technical Implementation Thesis**](./Study-Hub:%20Design%20and%20Implementation%20of%20an%20AI-Augmented%20Knowledge%20System.pdf) — A deep dive into engineering decisions, RAG-bypass logic, architectural pivots (from Cloud to Self-Hosting), and solving low-level data integrity issues.

---

## 🚀 Key Features

- **Notes Engine:** Create and categorize notes with full Markdown support and an integrated editor.
- **PDF Library:** High-performance extraction pipeline allowing you to read and process documents in-browser.
- **AI Context Injection:** Chat with an AI that references your specific notes and PDFs using character-based truncation heuristics for maximum token efficiency.
- **Auto-Save Protocol:** Non-deterministic AI to deterministic DB bridge via `[[CREATE_NOTE]]` tags, automatically archiving AI-generated insights.
- **Privacy-First Infrastructure:** Engineered for self-hosting via **Tailscale Funnel** for secure, global access to your physical hardware.

---

## 🛠 Technical Stack & Engineering "Wins"

### Backend
- **Runtime:** Node.js + Express.
- **Database:** PostgreSQL (Hardened with regex sanitization to prevent **Null Byte (`\x00`)** encoding crashes).
- **PDF Pipeline:** Redundant fallback chain: `unpdf` (Primary) → `pdfjs-dist` (Secondary). 
- **Asynchronous Processing:** Text extraction is decoupled from the HTTP cycle via a background "fire-and-forget" pattern to prevent timeouts.

### Frontend
- **Architecture:** Vanilla JavaScript SPA (No frameworks, no build steps).
- **Idempotency:** State-based guards (`_sendLock`, `isUploading`) to prevent duplicate database writes from rapid UI interactions.

### AI Layer
- **Orchestration:** OpenRouter API.
- **Verified Resilience:** Multi-model fallback logic utilizing **Llama 3.3 70B** and **Nemotron-3** to ensure 99.9% uptime on free-tier endpoints.

---

## 💻 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL
- An OpenRouter API Key

### Installation
1. **Clone the Repo:**
   ```bash
   git clone <your-repo-url>
   cd study-hub
   ```
2. **Install Dependencies:**
   ```bash
   npm install
   ```
3. **Environment Setup:**
   Create a `.env` file and configure the following:
   ```env
   PORT=3000
   DATABASE_URL=postgres://user:password@localhost:5432/studyhub
   JWT_SECRET=your_secure_secret
   OPENROUTER_API_KEY=your_key
   OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
   ```
4. **Initialize & Start:**
   ```bash
   npm run db:init
   npm start
   ```

---

## 🌐 Deployment (Self-Hosting)
This project is optimized for deployment on **Debian/Ubuntu** systems. To expose your local server securely without port forwarding, use **Tailscale Funnel**:

```bash
tailscale funnel 3000
```

---

## 📜 Architectural Philosophy
The path from initial deployment on Render to self-hosting via Tailscale was a deliberate shift toward reliability and data sovereignty. Study-Hub proves that financial and hardware constraints are not limitations, but catalysts for creative engineering. Logic is the only resource that scales without a budget.
```
