const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const imapSimple = require('imap-simple');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');
require('dotenv').config();

// Startup validation for env variables
const REQUIRED_ENV = ['EMAIL_USER', 'EMAIL_PASS', 'GROQ_API_KEY'];
for (const envVar of REQUIRED_ENV) {
  const value = process.env[envVar];
  if (!value || value === 'your_gmail_app_password' || value === 'your_groq_api_key') {
    console.error(`❌ [STARTUP ERROR] Critical environment variable "${envVar}" is missing or unconfigured in .env!`);
    console.error(`Please verify your configuration and restart the server.`);
    process.exit(1);
  }
}

const app = express();

// Lock CORS origin to local React Vite application URL for security
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173']
}));
app.use(express.json());

const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(__dirname, 'database.db');
const ATTACHMENTS_DIR = path.join(__dirname, 'public', 'attachments');

// Ensure attachments directory exists
if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

// Initialize SQLite Database
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL'); // Improve concurrency write performance

// Create database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    timestamp TEXT,
    sender_email TEXT,
    extracted_name TEXT,
    email_subject TEXT,
    raw_body TEXT,
    ai_requirements TEXT,
    assigned_department TEXT,
    attachments TEXT DEFAULT '[]',
    status TEXT,
    ai_suggested_reply TEXT,
    replies TEXT DEFAULT '[]',
    ai_reasoning TEXT,
    ai_suggested_reply_original TEXT,
    confidence REAL
  );

  CREATE TABLE IF NOT EXISTS processed_uids (
    uid INTEGER PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS sender_profiles (
    sender_email TEXT PRIMARY KEY,
    extracted_name TEXT,
    ticket_count INTEGER DEFAULT 0,
    first_seen TEXT,
    last_seen TEXT,
    preferred_department TEXT,
    autopilot_mode TEXT DEFAULT 'DEFAULT',
    autopilot_until TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT,
    action TEXT,
    actor TEXT,
    payload TEXT,
    created_at TEXT
  );
`);

// Backwards-compatible column migrations
try {
  db.prepare("ALTER TABLE tickets ADD COLUMN ai_reasoning TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE tickets ADD COLUMN ai_suggested_reply_original TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE tickets ADD COLUMN confidence REAL").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE sender_profiles ADD COLUMN autopilot_mode TEXT DEFAULT 'DEFAULT'").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE sender_profiles ADD COLUMN autopilot_until TEXT DEFAULT NULL").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE sender_profiles ADD COLUMN autopilot_schedule_enabled INTEGER DEFAULT 0").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE sender_profiles ADD COLUMN autopilot_schedule_start TEXT DEFAULT '00:00'").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE sender_profiles ADD COLUMN autopilot_schedule_end TEXT DEFAULT '23:59'").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE sender_profiles ADD COLUMN autopilot_schedule_days TEXT DEFAULT '1,2,3,4,5,6,0'").run();
} catch (e) {}

// Concurrency Polling lock to prevent race conditions
let isPolling = false;

// Filename sanitization to protect against directory path traversal
function sanitizeFilename(filename) {
  if (!filename) return `attachment_${Date.now()}`;
  // Strip paths and secure file name parts
  const cleanBase = path.basename(filename);
  // Whitelist: letters, numbers, dot, dash, underscore
  let safeName = cleanBase.replace(/[^a-zA-Z0-9\._-]/g, '_');
  // Fallback if name becomes empty
  if (!safeName) safeName = `file_${Date.now()}`;
  return safeName;
}

// Heuristic name extractor (fallback)
function extractNameFromEmail(email) {
  const prefix = email.split('@')[0];
  return prefix
    .split(/[\._-]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Helper to log state changes and mutations to audit_logs
function logAction(ticketId, action, actor, payload) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (ticket_id, action, actor, payload, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(ticketId, action, actor, payload, new Date().toISOString());
  } catch (err) {
    console.error(`❌ [Audit Log Error] Failed to log action ${action} for ticket ${ticketId}:`, err);
  }
}

// Helper to update repeat senders memory profiles
function upsertSenderProfile(senderEmail, extractedName, department) {
  try {
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT * FROM sender_profiles WHERE sender_email = ?').get(senderEmail);
    if (!existing) {
      db.prepare(`
        INSERT INTO sender_profiles (sender_email, extracted_name, ticket_count, first_seen, last_seen, preferred_department)
        VALUES (?, ?, 1, ?, ?, ?)
      `).run(senderEmail, extractedName, now, now, department);
    } else {
      const newCount = existing.ticket_count + 1;
      // Find preferred department dynamically based on ticket history
      const ticketsList = db.prepare('SELECT assigned_department FROM tickets WHERE sender_email = ?').all(senderEmail);
      const freq = { [department]: 1 };
      for (const t of ticketsList) {
        freq[t.assigned_department] = (freq[t.assigned_department] || 0) + 1;
      }
      let preferred = department;
      let maxCount = 0;
      for (const [dept, count] of Object.entries(freq)) {
        if (count > maxCount) {
          maxCount = count;
          preferred = dept;
        }
      }
      db.prepare(`
        UPDATE sender_profiles
        SET extracted_name = ?, ticket_count = ?, last_seen = ?, preferred_department = ?
        WHERE sender_email = ?
      `).run(extractedName, newCount, now, preferred, senderEmail);
    }
  } catch (err) {
    console.error(`❌ [Sender Profile Error] Failed to upsert profile for ${senderEmail}:`, err);
  }
}

// Helper to check if current time is within custom autopilot schedule window
function isWithinAutopilotSchedule(profile, timestamp = new Date()) {
  if (!profile.autopilot_schedule_enabled) {
    return true;
  }
  
  const dateObj = new Date(timestamp);
  // Get day of week in local time: 0 (Sunday) to 6 (Saturday)
  const currentDay = dateObj.getDay(); 
  
  // Convert current time to HH:MM format (local time)
  const pad = (n) => String(n).padStart(2, '0');
  const currentTimeStr = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  
  // Check if currentDay is in active days (comma-separated, e.g. "1,2,3,4,5")
  const activeDays = (profile.autopilot_schedule_days || '').split(',').map(d => d.trim());
  if (!activeDays.includes(String(currentDay))) {
    return false;
  }
  
  const start = profile.autopilot_schedule_start || '00:00';
  const end = profile.autopilot_schedule_end || '23:59';
  
  if (start <= end) {
    // Standard range: e.g. 09:00 to 17:00
    return currentTimeStr >= start && currentTimeStr <= end;
  } else {
    // Overnight range: e.g. 18:00 to 09:00 (crosses midnight boundary)
    return currentTimeStr >= start || currentTimeStr <= end;
  }
}

// Helper to transmit outbound replies via SMTP Nodemailer
async function sendEmailSMTP(toEmail, subject, bodyText) {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });

  const mailOptions = {
    from: emailUser,
    to: toEmail,
    subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
    text: bodyText
  };

  await transporter.sendMail(mailOptions);
}

// Helper to make Groq API calls using global fetch
async function callGroq(messages, model = 'llama-3.3-70b-versatile', responseFormat = null) {
  const apiKey = process.env.GROQ_API_KEY;
  const payload = {
    model: model,
    messages: messages,
    temperature: 0.3
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Groq API returned error: ${res.status} - ${errorBody}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}// Analyze Email using Groq AI
async function analyzeEmailWithGroq(senderEmail, senderName, subject, bodyText, senderHistoryContext = "") {
  const messages = [
    {
      role: 'system',
      content: `You are an AI Email Assistant for Caldim, an Inbound Email Automation SaaS platform.
Analyze the incoming email and return a JSON object with the following properties:
- "assigned_department": Must be exactly one of: "HR/Internship", "Billing", "Technical", or "General".
- "ai_requirements": A clean, bulleted list of 2-4 requirements extracted from the email (plain text).
- "ai_suggested_reply": A professional, polite response draft addressing the client by name (if known, else just "Hi there") and signing off as the Caldim Team. Ensure it directly addresses their questions.
- "ai_reasoning": A single sentence explaining why this department was chosen and the tone of the draft reply.
- "confidence": A decimal number between 0.0 and 1.0 representing your confidence in this classification and draft reply.

You must respond with ONLY a valid raw JSON object. Do not include markdown code block formatting (like \`\`\`json) or any conversational text.`
    },
    {
      role: 'user',
      content: `${senderHistoryContext}

Sender: ${senderName} <${senderEmail}>
Subject: ${subject}
Message Body:
${bodyText}`
    }
  ];

  const responseText = await callGroq(messages, 'llama-3.3-70b-versatile', { type: "json_object" });
  return JSON.parse(responseText);
}

// Fallback logic helpers
function classifyDepartment(subject = '', body = '') {
  const text = (subject + ' ' + body).toLowerCase();
  if (text.includes('internship') || text.includes('apply') || text.includes('resume')) return 'HR/Internship';
  if (text.includes('invoice') || text.includes('billing') || text.includes('charge')) return 'Billing';
  if (text.includes('structur') || text.includes('load') || text.includes('project') || text.includes('technical')) return 'Technical';
  return 'General';
}

function generateSuggestedReply(senderEmail, subject, body, dept) {
  const name = extractNameFromEmail(senderEmail);
  if (dept === 'HR/Internship') {
    return `Dear ${name},\n\nThank you for applying to the Caldim Internship program. We have received your email and the attached files. Our HR department is currently reviewing all submissions and will follow up shortly.\n\nBest regards,\nCaldim HR Team`;
  } else if (dept === 'Billing') {
    return `Hello ${name},\n\nThank you for reaching out regarding your billing query. We have logged your support request regarding the invoice discrepancy. Our finance team is reviewing the transaction details and will respond within 24 hours.\n\nBest,\nCaldim Billing Team`;
  } else if (dept === 'Technical') {
    return `Hello ${name},\n\nThank you for contacting Caldim Technical Support. We have logged your technical request regarding: "${subject}". Our engineering team will review the details and respond shortly.\n\nSincerely,\nCaldim Technical Support Team`;
  } else {
    return `Hello ${name},\n\nThank you for your message. We have received your query regarding "${subject}" and have routed it to the appropriate department for review.\n\nBest regards,\nCaldim Automation Team`;
  }
}

function generateRequirements(subject, body, dept) {
  let reqs = `1. Process incoming inquiry regarding "${subject}".\n2. Follow up with sender.`;
  if (dept === 'HR/Internship') {
    reqs += `\n3. Review attached internship resume / credentials.\n4. Route to HR coordinator.`;
  } else if (dept === 'Billing') {
    reqs += `\n3. Check invoice logs for double billing or overages.\n4. Review transaction history.`;
  } else if (dept === 'Technical') {
    reqs += `\n3. Technical support detailing required.\n4. Review specifications and safety margins.`;
  }
  return reqs;
}

// Gmail IMAP Connection and Polling
async function pollInbox() {
  if (isPolling) {
    console.log("ℹ [IMAP] Polling already in progress. Skipping concurrent run.");
    return;
  }

  isPolling = true;
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  const config = {
    imap: {
      user: emailUser,
      password: emailPass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 5000
    }
  };

  try {
    const connection = await imapSimple.connect(config);
    await connection.openBox('INBOX');

    // Fetch unread messages
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      struct: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`📥 [IMAP] Found ${messages.length} unread email(s).`);

    const selectUidStmt = db.prepare('SELECT 1 FROM processed_uids WHERE uid = ?');
    const insertUidStmt = db.prepare('INSERT INTO processed_uids (uid) VALUES (?)');
    const getTicketCountStmt = db.prepare('SELECT COUNT(*) as count FROM tickets');
    
    const insertTicketStmt = db.prepare(`
      INSERT INTO tickets (
        id, timestamp, sender_email, extracted_name, email_subject, raw_body, 
        ai_requirements, assigned_department, attachments, status, ai_suggested_reply, replies,
        ai_reasoning, ai_suggested_reply_original, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const message of messages) {
      const uid = message.attributes.uid;
      
      // Skip if already parsed (ACID read check)
      const alreadyProcessed = selectUidStmt.get(uid);
      if (alreadyProcessed) continue;

      const allPart = message.parts.find(p => p.which === '');
      if (!allPart) continue;

      const parsed = await simpleParser(allPart.body);
      const subject = parsed.subject || '(No Subject)';
      const fromValue = parsed.from && parsed.from.value && parsed.from.value[0];
      const senderEmail = fromValue ? fromValue.address : 'unknown@domain.com';
      const senderName = fromValue ? fromValue.name || extractNameFromEmail(senderEmail) : 'Unknown Contact';
      const bodyText = parsed.text || parsed.html || '';

      // Calculate sequential ticket index first to prefix attachments and use in db
      const ticketCount = getTicketCountStmt.get().count;
      const ticketId = `TKT-2026-${String(ticketCount + 1).padStart(3, '0')}`;

      // Extract and sanitize attachments with size limits and executable blocks
      const attachmentsList = [];
      if (parsed.attachments) {
        for (const att of parsed.attachments) {
          // Check file size: limit is 10MB (10 * 1024 * 1024 bytes)
          if (att.size > 10 * 1024 * 1024) {
            console.warn(`⚠️ [Attachment Blocked] File "${att.filename}" exceeds 10MB limit. Skipping download.`);
            continue;
          }

          // Check executable whitelist/blocklist
          const ext = path.extname(att.filename || '').toLowerCase();
          const blockedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.js', '.scr', '.vbs', '.jar', '.com'];
          const blockedMimeTypes = [
            'application/x-msdownload',
            'application/x-sh',
            'application/javascript',
            'application/x-bat',
            'application/x-msdos-program'
          ];
          
          if (blockedExtensions.includes(ext) || blockedMimeTypes.includes(att.contentType)) {
            console.warn(`⚠️ [Attachment Blocked] File "${att.filename}" has blocked extension/MIME type. Skipping download.`);
            continue;
          }

          const cleanBase = sanitizeFilename(att.filename);
          const safeName = `${ticketId}_${cleanBase}`;
          const fileSizeMB = (att.size / (1024 * 1024)).toFixed(2) + " MB";
          const filePath = path.join(ATTACHMENTS_DIR, safeName);
          
          fs.writeFileSync(filePath, att.content);
          
          attachmentsList.push({
            name: safeName,
            size: fileSizeMB,
            type: att.contentType
          });
        }
      }

      // Read sender's repeat history profile
      const profile = db.prepare('SELECT * FROM sender_profiles WHERE sender_email = ?').get(senderEmail);
      let senderHistoryContext = "";
      if (profile) {
        senderHistoryContext = `Sender History Context:
- Previous tickets from this sender: ${profile.ticket_count}
- First seen: ${profile.first_seen}
- Last seen: ${profile.last_seen}
- Preferred department: ${profile.preferred_department}`;
      } else {
        senderHistoryContext = "Sender History Context: This is a new sender (first contact).";
      }

      // Route department & write auto-draft (with Groq AI or Local Heuristics fallback)
      let dept, requirements, suggestedReply, reasoning, confidence;
      try {
        console.log(`🧠 [GROQ AI] Analyzing incoming email from ${senderEmail} with history context...`);
        const aiAnalysis = await analyzeEmailWithGroq(senderEmail, senderName, subject, bodyText, senderHistoryContext);
        dept = aiAnalysis.assigned_department || 'General';
        
        const reqs = aiAnalysis.ai_requirements || '';
        if (Array.isArray(reqs)) {
          requirements = reqs.map((r, i) => `${i + 1}. ${r}`).join('\n');
        } else {
          requirements = String(reqs);
        }
        
        suggestedReply = aiAnalysis.ai_suggested_reply || '';
        if (typeof suggestedReply === 'object') {
          suggestedReply = JSON.stringify(suggestedReply);
        } else {
          suggestedReply = String(suggestedReply);
        }

        reasoning = aiAnalysis.ai_reasoning || `Routed to ${dept} based on keyword mapping.`;
        confidence = parseFloat(aiAnalysis.confidence) || 0.0;
      } catch (err) {
        console.log("ℹ [Groq Bypass] Falling back to local parser. Reason:", err.message);
        dept = classifyDepartment(subject, bodyText);
        requirements = generateRequirements(subject, bodyText, dept);
        suggestedReply = generateSuggestedReply(senderEmail, subject, bodyText, dept);
        reasoning = `Bypassed AI analysis. Routed to ${dept} based on local keyword rules.`;
        confidence = 0.0;
      }

      let status = 'Pending Review';
      let repliesList = [];
      let autoSent = false;

      // Auto-Send Evaluation based on Sender Profile Autopilot Rules
      let shouldAutoSend = false;
      let ruleReason = "";

      if (profile) {
        if (profile.autopilot_mode === 'NEVER') {
          shouldAutoSend = false;
          ruleReason = "Sender profile has ALWAYS HOLD review rule active.";
        } else if (profile.autopilot_mode === 'ALWAYS') {
          let timerActive = false;
          let tempTimerReason = "";
          
          if (!profile.autopilot_until) {
            timerActive = true;
            tempTimerReason = "permanent ALWAYS AUTO-SEND autopilot rule active";
          } else {
            const isBeforeExpiry = new Date() < new Date(profile.autopilot_until);
            if (isBeforeExpiry) {
              timerActive = true;
              tempTimerReason = `temporary ALWAYS AUTO-SEND autopilot rule active (expires: ${profile.autopilot_until})`;
            } else {
              timerActive = false;
              tempTimerReason = `temporary autopilot rule expired on ${profile.autopilot_until}`;
            }
          }

          if (timerActive) {
            // Rule timer is active, now verify scheduling limits if enabled
            if (isWithinAutopilotSchedule(profile, new Date())) {
              shouldAutoSend = true;
              ruleReason = `Sender profile has ${tempTimerReason} and is within active scheduled hours.`;
            } else {
              shouldAutoSend = false;
              ruleReason = `Sender profile has ${tempTimerReason} but is currently OUTSIDE scheduled hours (Holding for review).`;
            }
          } else {
            // Revert to system default threshold because the ALWAYS rule timer has expired
            shouldAutoSend = (confidence > 0.90 && dept !== 'Billing');
            ruleReason = `Sender profile ${tempTimerReason}. Reverted to system default confidence thresholds (confidence: ${confidence}, dept: ${dept}).`;
          }
        } else {
          shouldAutoSend = (confidence > 0.90 && dept !== 'Billing');
          ruleReason = `System default auto-send limits (confidence: ${confidence}, dept: ${dept}).`;
        }
      } else {
        shouldAutoSend = (confidence > 0.90 && dept !== 'Billing');
        ruleReason = `New sender. System default auto-send limits (confidence: ${confidence}, dept: ${dept}).`;
      }

      if (shouldAutoSend) {
        try {
          console.log(`🚀 [Auto-Send] ${ruleReason} Sending autopilot SMTP reply for ticket ${ticketId}...`);
          await sendEmailSMTP(senderEmail, subject, suggestedReply);
          status = 'Sent';
          repliesList.push({
            replyText: suggestedReply,
            sentAt: new Date().toISOString()
          });
          autoSent = true;
          console.log(`✔ [Auto-Send] SMTP reply successfully sent to ${senderEmail}`);
        } catch (err) {
          console.error(`❌ [Auto-Send Error] Failed to auto-send SMTP reply for ticket ${ticketId}:`, err.message);
          // Keep as 'Pending Review' so human can review
        }
      }

      // Insert transactionally
      const transaction = db.transaction(() => {
        insertTicketStmt.run(
          ticketId, 
          parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
          senderEmail,
          senderName,
          subject,
          bodyText,
          requirements,
          dept,
          JSON.stringify(attachmentsList),
          status,
          suggestedReply,
          JSON.stringify(repliesList),
          reasoning,
          suggestedReply,
          confidence
        );
        insertUidStmt.run(uid);

        // Upsert sender memory profile
        upsertSenderProfile(senderEmail, senderName, dept);

        // Write audit log rows
        db.prepare(`
          INSERT INTO audit_logs (ticket_id, action, actor, payload, created_at)
          VALUES (?, 'Ingested', 'System', ?, ?)
        `).run(ticketId, reasoning, new Date().toISOString());

        if (autoSent) {
          db.prepare(`
            INSERT INTO audit_logs (ticket_id, action, actor, payload, created_at)
            VALUES (?, 'Approved', 'System', ?, ?)
          `).run(ticketId, suggestedReply, new Date().toISOString());
        }
      });
      transaction();

      console.log(`📥 [INGESTION] Processed email from ${senderEmail} (Assigned to: ${dept}, Status: ${status})`);
    }

    await connection.end();
  } catch (err) {
    console.error("❌ [IMAP Error] Failed to fetch emails: ", err);
  } finally {
    isPolling = false;
  }
}

// Poll Gmail every 10 seconds
setInterval(pollInbox, 10000);

// API Endpoints

// Get all tickets with SQLite Pagination
app.get('/api/tickets', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
    const totalPages = Math.ceil(totalCount / limit);
    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'Pending Review'").get().count;
    const sentCount = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'Sent'").get().count;

    const rows = db.prepare('SELECT * FROM tickets ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset);
    
    const tickets = rows.map(r => ({
      ...r,
      attachments: JSON.parse(r.attachments || '[]'),
      replies: JSON.parse(r.replies || '[]')
    }));

    const pendingRows = db.prepare("SELECT * FROM tickets WHERE status = 'Pending Review' ORDER BY timestamp DESC").all();
    const pendingTickets = pendingRows.map(r => ({
      ...r,
      attachments: JSON.parse(r.attachments || '[]'),
      replies: JSON.parse(r.replies || '[]')
    }));

    res.json({
      tickets,
      pendingTickets,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages
      },
      metrics: {
        total: totalCount,
        pending: pendingCount,
        sent: sentCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mock ingestion trigger for sandbox simulator
app.post('/api/tickets/mock', async (req, res) => {
  const { senderEmail, subject, body, attachments } = req.body;
  
  const ticketCount = db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
  const ticketId = `TKT-2026-${String(ticketCount + 1).padStart(3, '0')}`;
  const name = extractNameFromEmail(senderEmail);

  // Retrieve sender history context
  const profile = db.prepare('SELECT * FROM sender_profiles WHERE sender_email = ?').get(senderEmail);
  let senderHistoryContext = "";
  if (profile) {
    senderHistoryContext = `Sender History Context:
- Previous tickets from this sender: ${profile.ticket_count}
- First seen: ${profile.first_seen}
- Last seen: ${profile.last_seen}
- Preferred department: ${profile.preferred_department}`;
  } else {
    senderHistoryContext = "Sender History Context: This is a new sender (first contact).";
  }

  let dept, requirements, suggestedReply, reasoning, confidence;
  try {
    console.log(`🧠 [GROQ AI] [MOCK] Analyzing mock email from ${senderEmail}...`);
    const aiAnalysis = await analyzeEmailWithGroq(senderEmail, name, subject, body, senderHistoryContext);
    dept = aiAnalysis.assigned_department || 'General';
    
    const reqs = aiAnalysis.ai_requirements || '';
    if (Array.isArray(reqs)) {
      requirements = reqs.map((r, i) => `${i + 1}. ${r}`).join('\n');
    } else {
      requirements = String(reqs);
    }
    
    suggestedReply = aiAnalysis.ai_suggested_reply || '';
    if (typeof suggestedReply === 'object') {
      suggestedReply = JSON.stringify(suggestedReply);
    } else {
      suggestedReply = String(suggestedReply);
    }

    reasoning = aiAnalysis.ai_reasoning || `Routed to ${dept} based on keyword mapping.`;
    confidence = parseFloat(aiAnalysis.confidence) || 0.0;
  } catch (err) {
    console.log("ℹ [Groq Bypass] [MOCK] Falling back to local parser. Reason:", err.message);
    dept = classifyDepartment(subject, body);
    requirements = generateRequirements(subject, body, dept);
    suggestedReply = generateSuggestedReply(senderEmail, subject, body, dept);
    reasoning = `Bypassed AI analysis. Routed to ${dept} based on local keyword rules.`;
    confidence = 0.0;
  }

  // Handle mock attachments
  const attachmentsList = [];
  if (attachments && Array.isArray(attachments)) {
    for (const att of attachments) {
      const sizeBytes = att.sizeBytes || (1 * 1024 * 1024);
      if (sizeBytes > 10 * 1024 * 1024) {
        console.warn(`⚠️ [Attachment Blocked] [MOCK] File "${att.name}" exceeds 10MB size limit.`);
        continue;
      }

      const ext = path.extname(att.name || '').toLowerCase();
      const blockedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.js', '.scr', '.vbs', '.jar', '.com'];
      if (blockedExtensions.includes(ext)) {
        console.warn(`⚠️ [Attachment Blocked] [MOCK] File "${att.name}" has blocked extension.`);
        continue;
      }

      const cleanName = sanitizeFilename(att.name);
      const safeName = `${ticketId}_${cleanName}`;
      const fileSizeMB = (sizeBytes / (1024 * 1024)).toFixed(2) + " MB";
      
      const filePath = path.join(ATTACHMENTS_DIR, safeName);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, att.content || "Mock attachment content placeholder.");
      }

      attachmentsList.push({
        name: safeName,
        size: fileSizeMB,
        type: att.type || 'application/octet-stream'
      });
    }
  }

  let status = 'Pending Review';
  let repliesList = [];
  let autoSent = false;

  // Retrieve sender profile for autopilot settings check in mock hook
  const mockProfile = db.prepare('SELECT * FROM sender_profiles WHERE sender_email = ?').get(senderEmail);
  let shouldAutoSendMock = false;
  let mockRuleReason = "";

  if (mockProfile) {
    if (mockProfile.autopilot_mode === 'NEVER') {
      shouldAutoSendMock = false;
      mockRuleReason = "Sender profile has ALWAYS HOLD review rule active.";
    } else if (mockProfile.autopilot_mode === 'ALWAYS') {
      let timerActive = false;
      let tempTimerReason = "";
      
      if (!mockProfile.autopilot_until) {
        timerActive = true;
        tempTimerReason = "permanent ALWAYS AUTO-SEND autopilot rule active";
      } else {
        const isBeforeExpiry = new Date() < new Date(mockProfile.autopilot_until);
        if (isBeforeExpiry) {
          timerActive = true;
          tempTimerReason = `temporary ALWAYS AUTO-SEND autopilot rule active (expires: ${mockProfile.autopilot_until})`;
        } else {
          timerActive = false;
          tempTimerReason = `temporary autopilot rule expired on ${mockProfile.autopilot_until}`;
        }
      }

      if (timerActive) {
        // Rule timer is active, now verify scheduling limits if enabled
        if (isWithinAutopilotSchedule(mockProfile, new Date())) {
          shouldAutoSendMock = true;
          mockRuleReason = `Sender profile has ${tempTimerReason} and is within active scheduled hours.`;
        } else {
          shouldAutoSendMock = false;
          mockRuleReason = `Sender profile has ${tempTimerReason} but is currently OUTSIDE scheduled hours (Holding for review).`;
        }
      } else {
        // Revert to system default threshold because the ALWAYS rule timer has expired
        shouldAutoSendMock = (confidence > 0.90 && dept !== 'Billing');
        mockRuleReason = `Sender profile ${tempTimerReason}. Reverted to system default confidence thresholds (confidence: ${confidence}, dept: ${dept}).`;
      }
    } else {
      shouldAutoSendMock = (confidence > 0.90 && dept !== 'Billing');
      mockRuleReason = `System default auto-send limits (confidence: ${confidence}, dept: ${dept}).`;
    }
  } else {
    shouldAutoSendMock = (confidence > 0.90 && dept !== 'Billing');
    mockRuleReason = `New sender. System default auto-send limits (confidence: ${confidence}, dept: ${dept}).`;
  }

  if (shouldAutoSendMock) {
    try {
      console.log(`🚀 [Auto-Send] [MOCK] ${mockRuleReason} Sending automatic reply...`);
      await sendEmailSMTP(senderEmail, subject, suggestedReply);
      status = 'Sent';
      repliesList.push({
        replyText: suggestedReply,
        sentAt: new Date().toISOString()
      });
      autoSent = true;
    } catch (err) {
      console.error(`❌ [Auto-Send Error] [MOCK] Failed to auto-send SMTP reply for ticket ${ticketId}:`, err.message);
    }
  }

  try {
    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO tickets (
          id, timestamp, sender_email, extracted_name, email_subject, raw_body, 
          ai_requirements, assigned_department, attachments, status, ai_suggested_reply, replies,
          ai_reasoning, ai_suggested_reply_original, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ticketId,
        new Date().toISOString(),
        senderEmail,
        name,
        subject,
        body,
        requirements,
        dept,
        JSON.stringify(attachmentsList),
        status,
        suggestedReply,
        JSON.stringify(repliesList),
        reasoning,
        suggestedReply,
        confidence
      );

      // Upsert sender profile
      upsertSenderProfile(senderEmail, name, dept);

      // Add audit logs
      db.prepare(`
        INSERT INTO audit_logs (ticket_id, action, actor, payload, created_at)
        VALUES (?, 'Ingested', 'System', ?, ?)
      `).run(ticketId, reasoning, new Date().toISOString());

      if (autoSent) {
        db.prepare(`
          INSERT INTO audit_logs (ticket_id, action, actor, payload, created_at)
          VALUES (?, 'Approved', 'System', ?, ?)
        `).run(ticketId, suggestedReply, new Date().toISOString());
      }
    });
    transaction();

    res.json({ success: true, ticketId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve & send reply
app.post('/api/tickets/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { replyText } = req.body;
  
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);

  if (!ticket) {
    return res.status(404).json({ error: "Ticket not found" });
  }

  try {
    await sendEmailSMTP(ticket.sender_email, ticket.email_subject, replyText);
    console.log(`✉ [SMTP] Reply sent to ${ticket.sender_email}`);
  } catch (err) {
    console.error("❌ [SMTP Error] Failed to send email: ", err.message);
    return res.status(500).json({ error: "Failed to transmit SMTP email: " + err.message });
  }

  // Update status and append to replies history array (auditing)
  try {
    const existingReplies = JSON.parse(ticket.replies || '[]');
    const newReplyLog = {
      replyText,
      sentAt: new Date().toISOString()
    };
    const updatedReplies = [...existingReplies, newReplyLog];

    db.prepare('UPDATE tickets SET status = ?, ai_suggested_reply = ?, replies = ? WHERE id = ?')
      .run('Sent', replyText, JSON.stringify(updatedReplies), id);
      
    // Log action to audit logs
    logAction(id, 'Approved', 'Human', replyText);

    res.json({ id, status: 'Sent', replies: updatedReplies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dismiss & Ignore reply
app.post('/api/tickets/:id/ignore', (req, res) => {
  const { id } = req.params;
  
  const ticket = db.prepare('SELECT 1 FROM tickets WHERE id = ?').get(id);
  if (!ticket) {
    return res.status(404).json({ error: "Ticket not found" });
  }

  try {
    db.prepare("UPDATE tickets SET status = 'Ignored' WHERE id = ?").run(id);
    console.log(`🚫 [ARCHIVE] Ticket ${id} ignored and archived.`);
    
    // Log action to audit logs
    logAction(id, 'Ignored', 'Human', 'Ticket Ignored');

    res.json({ id, status: 'Ignored' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI Enhance Endpoint - Polishes a draft reply using Groq
app.post('/api/tickets/:id/enhance', async (req, res) => {
  const { id } = req.params;
  const { replyText } = req.body;

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);

  if (!ticket) {
    return res.status(404).json({ error: "Ticket not found" });
  }

  const messages = [
    {
      role: 'system',
      content: `You are a professional email editor. Your task is to polish and enhance the provided email draft.
- Correct any spelling, grammar, or punctuation errors.
- Improve the sentence flow and make the tone professional, warm, and polite.
- Address the sender by name if known (Sender Name: "${ticket.extracted_name}").
- Sign off as the "Caldim Team".
- Return ONLY the final polished email text. Do not write any explanations, intro/outro text, or markdown code blocks. Just print the email body.`
    },
    {
      role: 'user',
      content: `Original Customer Email:
"${ticket.raw_body}"

Current Draft Reply to Polish:
"${replyText}"`
    }
  ];

  try {
    console.log(`🧠 [GROQ AI] Enhancing draft response for ticket ${id}...`);
    const enhancedReply = await callGroq(messages, 'llama-3.3-70b-versatile');
    
    // Log action to audit logs
    logAction(id, 'Enhanced', 'Human', 'AI draft enhancement generated');

    res.json({ enhancedReply: enhancedReply.trim() });
  } catch (err) {
    console.error("❌ [Groq Enhance Error]: ", err.message);
    res.status(500).json({ error: "Failed to enhance reply: " + err.message });
  }
});

// Get audit trail logs for a ticket
app.get('/api/tickets/:id/audit', (req, res) => {
  const { id } = req.params;
  try {
    const logs = db.prepare('SELECT * FROM audit_logs WHERE ticket_id = ? ORDER BY created_at ASC').all(id);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/senders - Retrieve sender profiles for Contacts CRM
app.get('/api/senders', (req, res) => {
  try {
    const senders = db.prepare('SELECT * FROM sender_profiles ORDER BY ticket_count DESC').all();
    const sendersWithTickets = senders.map(s => {
      const tickets = db.prepare('SELECT id, timestamp, email_subject, assigned_department, status FROM tickets WHERE sender_email = ? ORDER BY timestamp DESC').all(s.sender_email);
      return {
        ...s,
        tickets
      };
    });
    res.json({ senders: sendersWithTickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/senders/:email/autopilot - Update custom sender autopilot rule
app.post('/api/senders/:email/autopilot', (req, res) => {
  const { email } = req.params;
  const { 
    mode, 
    durationHours, 
    customUntil, 
    scheduleEnabled, 
    scheduleStart, 
    scheduleEnd, 
    scheduleDays 
  } = req.body;

  try {
    const profile = db.prepare('SELECT * FROM sender_profiles WHERE sender_email = ?').get(email);
    if (!profile) {
      return res.status(404).json({ error: "Sender profile not found" });
    }

    let until = null;
    if (mode === 'ALWAYS') {
      if (durationHours !== undefined && durationHours !== null) {
        const now = new Date();
        now.setHours(now.getHours() + parseInt(durationHours));
        until = now.toISOString();
      } else if (customUntil) {
        until = new Date(customUntil).toISOString();
      }
    }

    db.prepare(`
      UPDATE sender_profiles 
      SET autopilot_mode = ?, 
          autopilot_until = ?, 
          autopilot_schedule_enabled = ?, 
          autopilot_schedule_start = ?, 
          autopilot_schedule_end = ?, 
          autopilot_schedule_days = ? 
      WHERE sender_email = ?
    `).run(
      mode, 
      until, 
      scheduleEnabled ? 1 : 0, 
      scheduleStart || '00:00', 
      scheduleEnd || '23:59', 
      scheduleDays || '1,2,3,4,5,6,0', 
      email
    );

    res.json({ 
      success: true, 
      email, 
      autopilot_mode: mode, 
      autopilot_until: until,
      autopilot_schedule_enabled: scheduleEnabled ? 1 : 0,
      autopilot_schedule_start: scheduleStart || '00:00',
      autopilot_schedule_end: scheduleEnd || '23:59',
      autopilot_schedule_days: scheduleDays || '1,2,3,4,5,6,0'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics - Aggregate SaaS metrics and statistics
app.get('/api/analytics', (req, res) => {
  try {
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'Pending Review'").get().count;
    const sentCount = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'Sent'").get().count;
    const ignoredCount = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'Ignored'").get().count;

    const autoSentCount = db.prepare(`
      SELECT COUNT(DISTINCT ticket_id) as count 
      FROM audit_logs 
      WHERE action = 'Approved' AND actor = 'System'
    `).get().count;

    const avgConfidenceRow = db.prepare('SELECT AVG(confidence) as avg FROM tickets WHERE confidence IS NOT NULL AND confidence > 0').get();
    const avgConfidence = avgConfidenceRow.avg ? parseFloat(avgConfidenceRow.avg.toFixed(4)) : 0.0;

    // Department distribution
    const depts = db.prepare('SELECT assigned_department, COUNT(*) as count FROM tickets GROUP BY assigned_department').all();
    const departmentDistribution = {
      'HR/Internship': 0,
      'Billing': 0,
      'Technical': 0,
      'General': 0
    };
    depts.forEach(d => {
      if (d.assigned_department in departmentDistribution) {
        departmentDistribution[d.assigned_department] = d.count;
      }
    });

    // Attachment storage count
    const allTickets = db.prepare('SELECT attachments FROM tickets').all();
    let totalAttachmentsCount = 0;
    allTickets.forEach(t => {
      try {
        const atts = JSON.parse(t.attachments || '[]');
        totalAttachmentsCount += atts.length;
      } catch (e) {}
    });

    res.json({
      totalCount,
      pendingCount,
      sentCount,
      ignoredCount,
      autoSentCount,
      avgConfidence,
      departmentDistribution,
      totalAttachmentsCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to force manual check (safe from concurrency overlay)
app.post('/api/poll', async (req, res) => {
  console.log("⚡ Manually triggered poll request.");
  if (isPolling) {
    return res.status(409).json({ status: "busy", message: "Inbox polling already in progress." });
  }
  // Run asynchronously
  pollInbox();
  res.json({ status: "success", message: "Polling process initiated." });
});

// Serve attachment files statically
app.use('/attachments', express.static(ATTACHMENTS_DIR));

app.listen(PORT, () => {
  console.log(`🟢 [SERVER RUNNING] Email Automation Backend active on http://localhost:${PORT}`);
  // Initial check
  pollInbox();
});
