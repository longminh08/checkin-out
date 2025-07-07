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
  keyFile: "./backend/apikey.json", // Replace with your service account key path
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

// Your Google Drive folder ID
const FOLDER_ID = "1JF7g6EAjUYNWgAIwv2vRwiktxjM-sDfE";

// Upload timesheet to Google Drive
app.post("/upload", upload.single("timesheet"), async (req, res) => {
  try {
    const uploader = req.body.username || "unknown";
    const filename = req.file.originalname;

    const meta = {
      employee: uploader,
      timestamp: Date.now(),
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
      };
    });

    res.json(timesheets);
  } catch (err) {
    console.error("Listing error:", err);
    res.status(500).json({ error: "Failed to load timesheets" });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
