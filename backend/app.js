// File: backend/app.js
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { google } = require("googleapis");
const stream = require("stream");
require("dotenv").config();
const supervisorMap = require("./supervisors");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Decode and write the key file to disk
const serviceKey = Buffer.from(process.env.GOOGLE_SERVICE_KEY, "base64").toString("utf8");

fs.writeFileSync("apikey.json", serviceKey);

const auth = new google.auth.GoogleAuth({
  keyFile: "../backend/apikey.json",
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

const FOLDER_ID = process.env.FOLDER_ID;

const uploadTimesheet = async (req, res) => {
  try {
    const uploader = req.body.username || "unknown";
    const filename = req.file.originalname;
    const assignedSupervisor = supervisorMap[uploader] || null;

    const meta = {
      employee: uploader,
      timestamp: Date.now(),
      status: "pending",
      supervisor: assignedSupervisor,
    };

    const fileMetadata = {
      name: filename,
      parents: [FOLDER_ID],
      description: JSON.stringify(meta),
    };

    const media = {
      mimeType: req.file.mimetype,
      body: stream.Readable.from(req.file.buffer),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: "id, name",
    });

    const fileId = response.data.id;

    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    const fileUrl = `https://drive.google.com/file/d/${fileId}/view`;

    res.json({
      success: true,
      message: "Uploaded to Google Drive",
      timesheet: {
        id: fileId,
        filename,
        employee: uploader,
        url: fileUrl,
        timestamp: meta.timestamp,
      },
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
};

const listTimesheets = async (req, res) => {
  const role = req.query.role;
  const username = req.query.username;

  try {
    const response = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: "files(id, name, description)",
    });

    const timesheets = response.data.files.map(file => {
      let meta = {};
      try {
        meta = JSON.parse(file.description || "{}");
      } catch {}

      return {
        id: file.id,
        filename: file.name,
        employee: meta.employee || "unknown",
        timestamp: meta.timestamp || null,
        url: `https://drive.google.com/file/d/${file.id}/view`,
        status: meta.status || "pending",
        supervisor: meta.supervisor || null,
      };
    });

    const filtered = timesheets.filter(ts => {
      if (role === "employee") return ts.employee === username;
      if (role === "frontdesk") return ts.status === "pending";
      if (role === "supervisor") return ts.status === "frontdesk-approved" && ts.supervisor === username;
      if (role === "payroll") return ts.status === "supervisor-approved";
      return false;
    });

    res.json(filtered);
  } catch (err) {
    console.error("Listing error:", err);
    res.status(500).json({ error: "Failed to load timesheets" });
  }
};

const approveTimesheet = async (req, res) => {
  const { fileId, role, approver } = req.body;

  try {
    const file = await drive.files.get({
      fileId,
      fields: "description",
    });

    let meta = {};
    try {
      meta = JSON.parse(file.data.description || "{}");
    } catch {}

    if (role === "frontdesk") {
      meta.frontdesk = approver;
      meta.status = "frontdesk-approved";
    } else if (role === "supervisor") {
      meta.supervisor = approver;
      meta.status = "supervisor-approved";
    }

    await drive.files.update({
      fileId,
      resource: {
        description: JSON.stringify(meta),
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Approval error:", err);
    res.status(500).json({ error: "Approval failed" });
  }
};

const deleteTimesheet = async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId) {
      return res.status(400).json({ success: false, error: "Missing fileId" });
    }
    await drive.files.delete({ fileId });
    res.json({ success: true });
  } catch (error) {
    console.error(`Error deleting file from Google Drive: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  app,
  upload,
  uploadTimesheet,
  listTimesheets,
  approveTimesheet,
  deleteTimesheet
};
