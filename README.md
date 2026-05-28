# 📥 Caldim Inbound Email Automation SaaS

Caldim is an Inbound Email Automation SaaS platform designed to automatically digest, classify, and draft responses to customer emails. It uses Groq-powered AI (Llama-3.3-70b-versatile) for analysis and routing, and integrates directly with Gmail (IMAP & SMTP).

This repository is split into a **separated frontend and backend project structure** to make it easy to deploy, extend, and run.

---

## 📂 Project Structure

```
EMAIL_AUTOMATION/
├── backend/                  # Express/Node API Server & Database
│   ├── public/attachments/   # Stored incoming email attachments
│   ├── server.cjs            # Backend server entry point
│   ├── database.db           # Local SQLite Database
│   ├── .env                  # Configuration variables (IMAP/SMTP/AI keys)
│   └── verify_scheduling.cjs # Offline scheduler unit tests
├── frontend/                 # React & Vite Dashboard App
│   ├── src/                  # React components & hooks
│   ├── public/               # Frontend static assets
│   └── vite.config.js        # Vite build configuration
└── package.json              # Monorepo Workspace Controller
```

---

## ⚡ Quick Start (No developer knowledge needed)

To run this project on your computer, you only need to run a single setup and startup step:

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (version 18 or newer).

### 1. Configure the `.env` file
1. Go to the `backend/` directory.
2. Open the `.env` file in any text editor.
3. Make sure to input your actual Gmail credentials and Groq API key:
   ```env
   EMAIL_USER=your_gmail@gmail.com
   EMAIL_PASS=your_gmail_app_password
   GROQ_API_KEY=your_groq_api_key
   PORT=5000
   ```
   *(Note: `EMAIL_PASS` must be a 16-character Google App Password, not your standard Gmail password).*

### 2. Install Dependencies
Open your terminal (PowerShell, Command Prompt, or Bash) in the project's root folder (`EMAIL_AUTOMATION/`) and run:
```bash
npm install
```
This single command installs all dependencies for the root system, the frontend, and the backend simultaneously.

### 3. Run both Frontend & Backend
In the same root folder, run:
```bash
npm run dev
```
This runs both the frontend and backend concurrently in parallel!
* **Frontend Web Dashboard:** Open [http://localhost:5173](http://localhost:5173) in your browser.
* **Backend API Server:** Running on [http://localhost:5000](http://localhost:5000).

---

## 🛠️ Advanced Operations (For Developers)

You can run commands directly from the root workspace or from within individual folders:

### Running Tests
* **Run scheduling unit tests:**
  ```bash
  npm run test:unit
  ```
* **Run live backend endpoints integration tests:**
  Ensure the backend is running first (`npm run start:backend`), then execute:
  ```bash
  npm run test:integration
  ```

### Build & Lint
* **Compile and build the frontend assets for production:**
  ```bash
  npm run build:frontend
  ```
* **Run code quality checking (Linter):**
  ```bash
  npm run lint:frontend
  ```

---

## 🤝 Need Help?
If you have any questions or run into trouble, make sure your `.env` contains valid credentials and that your Node.js version is up to date. Happy automating!
