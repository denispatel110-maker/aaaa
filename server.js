import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ---------- LOGIN SYSTEM (stores in login.txt) ----------
const LOGIN_FILE = path.join(process.cwd(), "login.txt");

// Save user login (username + country + expire timestamp)
app.post("/login", (req, res) => {
  const { username, country } = req.body;
  if (!username) return res.status(400).json({ error: "Username required" });

  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const record = { username, country, expires };

  let existing = [];
  if (fs.existsSync(LOGIN_FILE)) {
    existing = JSON.parse(fs.readFileSync(LOGIN_FILE, "utf-8"));
  }

  // Replace if already exists
  existing = existing.filter((u) => u.username !== username);
  existing.push(record);

  fs.writeFileSync(LOGIN_FILE, JSON.stringify(existing, null, 2));

  res.json({ success: true, user: record });
});

// ---------- FILE UPLOAD ----------
const upload = multer({ dest: "uploads/" });

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// Serve uploaded files
app.use("/uploads", express.static("uploads"));

// ---------- SOCKET.IO ----------
io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // chat messages (text + file)
  socket.on("chat message", (msg) => {
    io.emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Chat server running on port ${PORT}`);
});
