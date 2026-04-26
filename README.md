# 📘 Study-Hub

Your personal, AI-augmented knowledge management system.  
Organize notes, manage a PDF library, and interact with an AI that understands your local context.

Study-Hub is built on the philosophy of **Constraint-Driven Engineering** — transforming infrastructure limitations into architectural strengths. It is a **resilient, privacy-focused, self-hosted alternative** to ephemeral cloud-based knowledge tools.

---

## 📚 Project Documentation

These documents act as a **complete knowledge archive** of the project, covering everything from beginner concepts to advanced system design:

- 📖 **Complete Beginner’s Tutorial**  
  A 140-page, step-by-step guide to building the entire stack from scratch.  
  Designed for students and developers new to web engineering.  
  → `./Study Hub: My Tutorial.pdf`

- 🎓 **Technical Implementation Thesis**  
  A deep dive into system architecture, engineering trade-offs, RAG-bypass logic, and infrastructure evolution (Cloud → Self-Hosting).  
  → `./Study-Hub: Design and Implementation of an AI-Augmented Knowledge System.pdf`

---

## 🚀 Key Features

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
tailscale funnel 3000
```

---

## 📜 Architectural Philosophy

Study-Hub’s transition from cloud deployment (Render) to **self-hosted infrastructure via Tailscale** reflects a deliberate focus on:

- Reliability  
- Data sovereignty  
- System control  

This project demonstrates that **constraints are not limitations — they are catalysts for better engineering decisions.**
