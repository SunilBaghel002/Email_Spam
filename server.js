require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

/* ------------------ CONFIG ------------------ */
const {
  SMTP_HOST,
  SMTP_PORT = 587,
  SMTP_USER,
  SMTP_PASS,
  FROM_EMAIL,
} = process.env;

/* 5-minute base + up to 1-minute jitter */
const INTERVAL_MS = 1 * 60 * 1000 + Math.floor(Math.random() * 60 * 1000);
const TOTAL_TO_SEND = 50; // 50 e-mails total
const TEMPLATE_PATH = path.join(__dirname, "template.html");
const RECIPIENTS_PATH = path.join(__dirname, "recipients.json");
const ATTACH_DIR = path.join(__dirname, "attachments");

/* ------------------ LOAD TEMPLATE & RECIPIENTS ------------------ */
const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const recipientEmails = JSON.parse(fs.readFileSync(RECIPIENTS_PATH, "utf-8"));

if (!recipientEmails.length) {
  console.error("No e-mail addresses in recipients.json");
  process.exit(1);
}
console.log(
  `Loaded ${recipientEmails.length} recipient e-mails. Will send ${TOTAL_TO_SEND} total.`
);

/* ------------------ FIXED TEAM INFO (same for every mail) ------------------ */
const TEAM_INFO = {
  leader_name: "Sunil",
  member_name: "Satyam Pandey",
  leader_email: "satyam.pandey@acem.edu.in",
  member_email: "sunilbaghel93100@gmail.com",
  team_id: "59365",
  ps_id: "SIH25116",
  contact: "9310065542",
  youtube: "https://youtu.be/b8clHw2-ZAs?si=DJ1Ax4kWi9yfoWWf",
};

/* ------------------ TRANSPORTER ------------------ */
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: SMTP_PORT == 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

/* ------------------ ATTACHMENTS ------------------ */
let attachments = [];
try {
  const files = fs.readdirSync(ATTACH_DIR);
  attachments = files.map((f) => ({
    filename: f,
    path: path.join(ATTACH_DIR, f),
  }));
} catch (e) {
  console.warn("No attachments folder or files.");
}

/* ------------------ STATE ------------------ */
let sent = 0;
let interval = null;

/* ------------------ PICK RECIPIENT (round-robin) ------------------ */
function pickRecipient() {
  const idx = sent % recipientEmails.length; // 0,1,0,1,...
  return recipientEmails[idx];
}

/* ------------------ SEND ONE E-MAIL ------------------ */
async function sendNext() {
  if (sent >= TOTAL_TO_SEND) {
    clearInterval(interval);
    interval = null;
    console.log(`Finished! ${sent} e-mails sent.`);
    return;
  }

  const toEmail = pickRecipient(); // <-- just the address

  /* ---- Fill the template ---- */
  const html = template
    .replace(/{{NAME}}/g, toEmail.split("@")[0].replace(".", " ")) // optional greeting
    .replace(/{{TEAM_LEADER_NAME}}/g, TEAM_INFO.leader_name)
    .replace(/{{TEAM_MEMBER_NAME}}/g, TEAM_INFO.member_name)
    .replace(/{{TEAM_ID}}/g, TEAM_INFO.team_id)
    .replace(/{{PS_ID}}/g, TEAM_INFO.ps_id)
    .replace(/{{EMAIL}}/g, TEAM_INFO.leader_email) // leader e-mail
    .replace(/{{CONTACT}}/g, TEAM_INFO.contact)
    .replace(/{{YOUTUBE_LINK}}/g, TEAM_INFO.youtube);

  const uniqueId = `${Date.now()}.${Math.random()}@sih-appeal`;

  const mail = {
    from: `"${TEAM_INFO.leader_name}" <${FROM_EMAIL}>`, // ALWAYS the leader
    to: toEmail,
    subject: `Urgent: Request for Re-evaluation – Team ID ${
      TEAM_INFO.team_id
    } (PS: ${TEAM_INFO.ps_id}) #${sent + 1}`,
    html,
    attachments: attachments.length ? attachments : undefined,

    /* ---- BREAK THREADING ---- */
    messageId: `<${uniqueId}>`,
    inReplyTo: undefined,
    references: undefined,
    headers: { "X-Entity-Ref-ID": uniqueId },
  };

  try {
    await transporter.sendMail(mail);
    sent++;
    console.log(
      `[${new Date().toISOString()}] Sent ${sent}/${TOTAL_TO_SEND} → ${toEmail}`
    );
  } catch (err) {
    console.error(`Failed → ${toEmail}:`, err.message);
    sent++; // count the attempt anyway
  }
}

/* ------------------ ROUTES ------------------ */
app.get("/start", (req, res) => {
  if (interval) return res.send("Already running.");
  sendNext(); // first e-mail instantly
  interval = setInterval(sendNext, INTERVAL_MS);
  res.send(`Started – ${TOTAL_TO_SEND} e-mails, ~1 every 5 min.`);
});

app.get("/status", (req, res) => {
  res.json({
    totalToSend: TOTAL_TO_SEND,
    sent,
    remaining: TOTAL_TO_SEND - sent,
    running: !!interval,
  });
});

app.get("/stop", (req, res) => {
  if (interval) {
    clearInterval(interval);
    interval = null;
    res.send("Stopped.");
  } else res.send("Not running.");
});

app.listen(PORT, () => {
  console.log(`Server → http://localhost:${PORT}`);
  console.log("  /start   – begin");
  console.log("  /status  – progress");
  console.log("  /stop    – halt");
});
