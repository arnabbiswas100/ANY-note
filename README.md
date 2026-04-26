<<<<<<< HEAD
# 📘 Study-Hub

Your personal, AI-augmented knowledge management system.  
Organize notes, manage a PDF library, and interact with an AI that understands your local context.

Study-Hub is built on the philosophy of **Constraint-Driven Engineering** — transforming infrastructure limitations into architectural strengths. It is a **resilient, privacy-focused, self-hosted alternative** to ephemeral cloud-based knowledge tools.
=======

```markdown
# Study-Hub

Your personal, AI-augmented knowledge management system. Organize notes, manage a PDF library, and chat with an AI that understands your local context.

Study-Hub was built under the philosophy of **Constraint-Driven Engineering**. It is a resilient, privacy-focused, and self-hosted alternative to ephemeral cloud knowledge tools, designed to turn infrastructure limitations into architectural strengths.
>>>>>>> 6989ed7 (LLM Priority Order fix, LLM answer waiting animation change)

---

## 📚 Project Documentation
<<<<<<< HEAD

These documents act as a **complete knowledge archive** of the project, covering everything from beginner concepts to advanced system design:

- 📖 **Complete Beginner’s Tutorial**  
  A 140-page, step-by-step guide to building the entire stack from scratch.  
  Designed for students and developers new to web engineering.  
  → `./Study Hub: My Tutorial.pdf`

- 🎓 **Technical Implementation Thesis**  
  A deep dive into system architecture, engineering trade-offs, RAG-bypass logic, and infrastructure evolution (Cloud → Self-Hosting).  
  → `./Study-Hub: Design and Implementation of an AI-Augmented Knowledge System.pdf`
=======
These documents represent the "mental time capsule" of the project, covering everything from basic syntax to complex system design.

* 📖 [**Complete Beginner's Tutorial**](./Study%20Hub:%20My%20Tutorial.pdf) — A 140-page, step-by-step guide to building this entire stack from scratch. Designed for students and those new to web development.
* 🎓 [**Technical Implementation Thesis**](./Study-Hub:%20Design%20and%20Implementation%20of%20an%20AI-Augmented%20Knowledge%20System.pdf) — A deep dive into engineering decisions, RAG-bypass logic, architectural pivots (from Cloud to Self-Hosting), and solving low-level data integrity issues.
>>>>>>> 6989ed7 (LLM Priority Order fix, LLM answer waiting animation change)

---

## 🚀 Key Features

<<<<<<< HEAD
- 📝 **Notes Engine**  
  Create, organize, and manage notes with full Markdown support and an integrated editor.

- 📄 **PDF Library**  
  High-performance document processing pipeline for in-browser reading and extraction.

- 🧠 **AI Context Injection**  
  Chat with an AI that dynamically references your notes and PDFs using **character-based truncation heuristics** for optimal token efficiency.

- ⚙️ **Auto-Save Protocol**  
  Bridges non-deterministic AI output with deterministic storage using `[[CREATE_NOTE]]` tags to automatically persist insights.

- 🔒 **Privacy-First Infrastructure**  
  Fully self-hostable with secure global access via **Tailscale Funnel**.

---

## 🛠 Technical Stack & Engineering Wins

### Backend
- **Runtime:** Node.js + Express  
- **Database:** PostgreSQL  
  - Hardened using regex sanitization to prevent **Null Byte (`\x00`) encoding crashes**
- **PDF Processing Pipeline:**  
  - Primary: `unpdf`  
  - Fallback: `pdfjs-dist`
- **Async Processing:**  
  - Background "fire-and-forget" extraction to prevent request timeouts
=======
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
>>>>>>> 6989ed7 (LLM Priority Order fix, LLM answer waiting animation change)

---

### Frontend
- **Architecture:** Vanilla JavaScript SPA  
  *(No frameworks, no build steps)*

- **Idempotency Controls:**  
  - `_sendLock`, `isUploading` guards  
  - Prevent duplicate writes from rapid UI interactions

---

### AI Layer
- **Orchestration:** OpenRouter API  
- **Resilience Strategy:**  
  Multi-model fallback system using:
  - Llama 3.3 70B  
  - Nemotron-3  

Ensures **high availability even on free-tier endpoints**.

---

## 💻 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL
- OpenRouter API Key

---

### Installation

#### 1. Clone Repository
```bash
<<<<<<< HEAD
git clone <your-repo-url>
cd study-hub
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Environment Configuration
Create a `.env` file:

```env
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/studyhub
JWT_SECRET=your_secure_secret
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

#### 4. Initialize & Run
```bash
npm run db:init
npm start
```

---

## 🌐 Deployment (Self-Hosting)

Optimized for **Debian/Ubuntu environments**.

Expose your local server securely without port forwarding:

```bash
=======
>>>>>>> 6989ed7 (LLM Priority Order fix, LLM answer waiting animation change)
tailscale funnel 3000
```

---

## 📜 Architectural Philosophy
<<<<<<< HEAD

Study-Hub’s transition from cloud deployment (Render) to **self-hosted infrastructure via Tailscale** reflects a deliberate focus on:

- Reliability  
- Data sovereignty  
- System control  

This project demonstrates that **constraints are not limitations — they are catalysts for better engineering decisions.**
=======
The path from initial deployment on Render to self-hosting via Tailscale was a deliberate shift toward reliability and data sovereignty. Study-Hub proves that financial and hardware constraints are not limitations, but catalysts for creative engineering. Logic is the only resource that scales without a budget.
```
>>>>>>> 6989ed7 (LLM Priority Order fix, LLM answer waiting animation change)
