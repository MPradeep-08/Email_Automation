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
  origin: 'http://localhost:5173'
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
    replies TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS processed_uids (
    uid INTEGER PRIMARY KEY
  );
`);

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
}

// Analyze Email using Groq AI
async function analyzeEmailWithGroq(senderEmail, senderName, subject, bodyText) {
  const messages = [
    {
      role: 'system',
      content: `You are an AI Email Assistant for Caldim, an Inbound Email Automation SaaS platform.
Analyze the incoming email and return a JSON object with the following properties:
- "assigned_department": Must be exactly one of: "HR/Internship", "Billing", "Technical", or "General".
- "ai_requirements": A clean, bulleted list of 2-4 requirements extracted from the email (plain text).
- "ai_suggested_reply": A professional, polite response draft addressing the client by name (if known, else just "Hi there") and signing off as the Caldim Team. Ensure it directly addresses their questions.

You must respond with ONLY a valid raw JSON object. Do not include markdown code block formatting (like \`\`\`json) or any conversational text.`
    },
    {
      role: 'user',
      content: `Sender: ${senderName} <${senderEmail}>
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
        ai_requirements, assigned_department, attachments, status, ai_suggested_reply, replies
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

      // Extract and sanitize attachments
      const attachmentsList = [];
      if (parsed.attachments) {
        for (const att of parsed.attachments) {
          const safeName = sanitizeFilename(att.filename);
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

      // Route department & write auto-draft (with Groq AI or Local Heuristics fallback)
      let dept, requirements, suggestedReply;
      try {
        console.log(`🧠 [GROQ AI] Analyzing incoming email from ${senderEmail}...`);
        const aiAnalysis = await analyzeEmailWithGroq(senderEmail, senderName, subject, bodyText);
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
      } catch (err) {
        console.log("ℹ [Groq Bypass] Falling back to local parser. Reason:", err.message);
        dept = classifyDepartment(subject, bodyText);
        requirements = generateRequirements(subject, bodyText, dept);
        suggestedReply = generateSuggestedReply(senderEmail, subject, bodyText, dept);
      }

      // Calculate sequential ticket index
      const ticketCount = getTicketCountStmt.get().count;
      const ticketId = `TKT-2026-${String(ticketCount + 1).padStart(3, '0')}`;

      // Insert transactionally
      const transaction = db.transaction(() => {
        console.log("DB INSERT PARAM TYPES:", {
          ticketId: typeof ticketId,
          date: typeof (parsed.date ? parsed.date.toISOString() : null),
          senderEmail: typeof senderEmail,
          senderName: typeof senderName,
          subject: typeof subject,
          bodyText: typeof bodyText,
          requirements: typeof requirements,
          requirementsIsArray: Array.isArray(requirements),
          dept: typeof dept,
          attachmentsList: typeof JSON.stringify(attachmentsList),
          status: 'string',
          suggestedReply: typeof suggestedReply,
          replies: 'string',
          uid: typeof uid
        });
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
          'Pending Review',
          suggestedReply,
          JSON.stringify([])
        );
        insertUidStmt.run(uid);
      });
      transaction();

      console.log(`📥 [INGESTION] Processed email from ${senderEmail} (Assigned to: ${dept})`);
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
app.post('/api/tickets/mock', (req, res) => {
  const { senderEmail, subject, body, attachments } = req.body;
  const ticketCount = db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
  const ticketId = `TKT-2026-${String(ticketCount + 1).padStart(3, '0')}`;
  const name = extractNameFromEmail(senderEmail);
  const dept = classifyDepartment(subject, body);
  const requirements = generateRequirements(subject, body, dept);
  const suggestedReply = generateSuggestedReply(senderEmail, subject, body, dept);

  try {
    db.prepare(`
      INSERT INTO tickets (
        id, timestamp, sender_email, extracted_name, email_subject, raw_body, 
        ai_requirements, assigned_department, attachments, status, ai_suggested_reply, replies
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ticketId,
      new Date().toISOString(),
      senderEmail,
      name,
      subject,
      body,
      requirements,
      dept,
      JSON.stringify(attachments || []),
      'Pending Review',
      suggestedReply,
      JSON.stringify([])
    );
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

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  // Send SMTP reply via NodeMailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });

  const mailOptions = {
    from: emailUser,
    to: ticket.sender_email,
    subject: `Re: ${ticket.email_subject}`,
    text: replyText
  };

  try {
    await transporter.sendMail(mailOptions);
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
    res.json({ enhancedReply: enhancedReply.trim() });
  } catch (err) {
    console.error("❌ [Groq Enhance Error]: ", err.message);
    res.status(500).json({ error: "Failed to enhance reply: " + err.message });
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
