# StudySanctuary 📚

**StudySanctuary** is an advanced AI-powered educational ecosystem designed to revolutionize how students interact with information. It automates study workflows, generates personalized learning paths, and provides intelligent document synthesis using Google's Gemini AI.

## 🚀 Key Features

* **AI Study Assistant:** Intelligent interaction with course materials via `geminiStudy.ts` for deep context understanding.
* **Personalized Learning Paths:** Dynamically generated study plans tailored to individual student needs and progress.
* **Automated Document Synthesis:** Summarization and extraction of key concepts from academic texts using RAG principles.
* **Real-time Collaboration:** Secure, cloud-synced environment for managing study resources and progress tracking.

## 🛠️ Technical Architecture

* **Frontend:** [React](https://react.dev/) + [Vite](https://vitejs.dev/) for an ultra-fast, modern developer experience and performance.
* **Language:** [TypeScript](https://www.typescriptlang.org/) ensuring end-to-end type safety and maintainable code.
* **Infrastructure:** [Firebase](https://firebase.google.com/) for real-time database (Firestore), authentication, and secure hosting.
* **AI Orchestration:** Seamless integration with Google Gemini SDK for complex natural language processing tasks.
* **State & Logic:** Modular hooks and context providers for efficient global state management.

## 📦 Project Structure

```text
src/
├── components/     # UI Building Blocks (Dashboard, StudyViews, Shared)
├── contexts/       # Global State (Auth, StudySettings)
├── hooks/          # Reusable Business Logic & UI Helpers
├── lib/            # Firebase & SDK Configurations
└── services/       # Core AI Logic (Gemini API Integrations)

## ⚙️ Configuration & local checks

Configuration comes from environment variables (no `firebase-applet-config.json`). Copy `.env.example` to `.env` and see [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md).

```bash
npm ci
npm run verify:config   # validates client/server config without printing values
npm run dev             # http://localhost:3000
npm run verify          # typecheck + unit tests + secret scan + bundle tests
npm run test:rules      # Firestore/Storage rules + ops scripts on the local Firebase Emulator (demo project, needs Java 21)
```

Owner-run operations tools: [`docs/ops/README.md`](docs/ops/README.md).

Credentials that must be revoked or rotated: [`docs/SECURITY_CREDENTIALS.md`](docs/SECURITY_CREDENTIALS.md).
