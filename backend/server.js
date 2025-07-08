const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "temp/" });

// Google Drive Auth using Service Account
const auth = new google.auth.GoogleAuth({
  keyFile: "./backend/apikey.json", // Service account key path
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

require("dotenv").config(); // Load environment variables

// Google Drive folder ID
const FOLDER_ID = process.env.FOLDER_ID;

// Upload timesheet to Google Drive
app.post("/upload", upload.single("timesheet"), async (req, res) => {
  try {
    const uploader = req.body.username || "unknown";
    const filename = req.file.originalname;

    const meta = {
      employee: uploader,
      timestamp: Date.now(),
      status: "pending",
      frontdesk: null, // Default to null, can be updated later
      supervisor: null, // Default to null, can be updated later
    };

    const fileMetadata = {
      name: filename,
      parents: [FOLDER_ID],
      description: JSON.stringify(meta),
    };

    const media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(req.file.path),
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

    try {
      fs.unlinkSync(req.file.path); // Delete temp file
    } catch (err) {
      console.error("Failed to delete temp file:", err);
    }

    res.json({
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
});

// List all files from Drive folder
app.get("/timesheets", async (req, res) => {
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
        meta = JSON.parse(file.description || "{}" );
      } catch {}

      return {
        id: file.id,
        filename: file.name,
        employee: meta.employee || "unknown",
        timestamp: meta.timestamp || null,
        url: `https://drive.google.com/file/d/${file.id}/view`,
        status: meta.status || "pending",
        frontdesk: meta.frontdesk || null,
        supervisor: meta.supervisor || null
      };
    });
    
    const filtered = timesheets.filter(ts => {
    if (role === "employee") return ts.employee === username;
    if (role === "frontdesk") return ts.status === "pending" ;
    if (role === "supervisor") return ts.status === "frontdesk-approved";
    if (role === "payroll") return ts.status === "supervisor-approved";
    return false;
  });

  res.json(filtered);
  } catch (err) {
    console.error("Listing error:", err);
    res.status(500).json({ error: "Failed to load timesheets" });
  }
});

app.post("/approve", async (req, res) => {
  const { fileId, role, approver } = req.body;

  const file = await drive.files.get({
    fileId,
    fields: "description"
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
      description: JSON.stringify(meta)
    }
  });

  res.json({ success: true });
});

app.delete("/delete", async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId) {
      return res.status(400).json({ success: false, error: "Missing fileId" });
    }
    await drive.files.delete({ fileId });
    console.log('File deleted successfully.');
    res.json({ success: true });
  } catch (error) {
    console.error(`Error deleting file from Google Drive: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});


app.listen(3000, () => {
  console.log(`✅ Server running at http://localhost:3000`);
});
