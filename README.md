# 📘 Study-Hub

**Your personal, AI-augmented knowledge management system.**

Study-Hub is a powerful, local-first platform designed to organize your notes, manage your PDF library, and let you interact with an AI that understands your documents. It acts as an intelligent, privacy-focused study companion running directly on your machine.

🌐 **Live Demo:** [https://study-hub-yke0.onrender.com](https://study-hub-yke0.onrender.com)  
*(Note: This is a limited demo environment. To experience the full power, privacy, and performance of the platform, you must host it locally using the guide below).*

---

## 🚀 Key Features

- 📝 **Notes Engine:** Create, organize, and manage notes with an integrated Markdown editor.
- 📄 **PDF Library:** Upload and process PDFs for in-browser reading and fast text extraction.
- 🧠 **Local AI Context:** Chat seamlessly with an AI that dynamically references your notes and PDFs. Fully supports local AI models through [Ollama](https://ollama.com/), ensuring absolute data privacy.
- 🌓 **Dynamic Interface:** Switch effortlessly between "Minimal" and "Glassmorphism" design themes, complete with a beautiful split-pane streaming desktop layout.
- 🔒 **Privacy-First Infrastructure:** Everything from your database to your AI models runs completely offline and locally.

---

## 💻 Getting Started (Out of the Box)

We provide a **Zero-Config Setup Script** (`setup.sh`) that installs and configures everything you need across macOS and major Linux distributions (Debian, Ubuntu, Fedora, Arch). 

### 1. Run the Setup Wizard

Clone the repository and run the setup script:

```bash
git clone https://github.com/arnabbiswas100/Study-Hub
cd Study-Hub
chmod +x setup.sh
./setup.sh
```

**What the script does automatically:**
- Detects your OS and installs necessary system dependencies.
- Installs **Node.js** and **PostgreSQL**.
- Installs **Ollama** (for local, private AI models).
- Generates secure random database passwords and configures PostgreSQL.
- Creates and sets up your `.env` configuration file automatically.
- Installs all Node dependencies (`npm install`).

### 2. Download an AI Model (Optional but Recommended)

For the best privacy and offline capability, download a local AI model via Ollama. For general tasks, we recommend a fast and intelligent model:

```bash
ollama pull gemma4:4b
```

*(If you prefer to use external cloud APIs like OpenRouter or Gemini instead of local models, you can skip this step and use the API mode).*

### 3. PostgreSQL Database Setup Guide

The `setup.sh` script automatically handles the database creation and user setup for you. However, if you ever need to set it up manually or reset your database, here are the detailed commands:

**Access PostgreSQL:**
```bash
# On Linux
sudo -u postgres psql

# On macOS
psql postgres
```

**Create User and Database:**
```sql
CREATE USER studyhub_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE studyhub OWNER studyhub_user;
\q
```
*(Make sure your `.env` file matches the database name, user, and password you set).*

### 4. Start the Application

Before starting the server, make sure your PostgreSQL database service is running in the background.

**Database Starting & Stopping Guide:**
- **Linux (Systemd):**
  - Start: `sudo systemctl start postgresql`
  - Stop: `sudo systemctl stop postgresql`
- **macOS (Homebrew):**
  - Start: `brew services start postgresql`
  - Stop: `brew services stop postgresql`

Once the database is running, start your local Study-Hub server:

```bash
npm run dev
```

Open your browser and navigate to: **[http://localhost:3000](http://localhost:3000)**

---

## 📚 Project Documentation

These documents act as a complete knowledge archive of the project's evolution and architecture:

- 📖 **Complete Beginner’s Tutorial**  
  A 140-page, step-by-step guide to building the entire stack from scratch.  
  → `./Study Hub: My Tutorial.pdf`

- 🎓 **Technical Implementation Thesis**  
  A deep dive into system architecture, engineering trade-offs, and infrastructure design.  
  → `./Study-Hub: Design and Implementation of an AI-Augmented Knowledge System.pdf`
