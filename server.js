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
app.use(express.urlencoded({ extended: true }));

// ---------- LOGIN SYSTEM ----------
const LOGIN_FILE = path.join(process.cwd(), "login.txt");

app.post("/login", (req, res) => {
  const { username, country } = req.body;
  if (!username) return res.status(400).json({ error: "Username required" });

  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const record = { username, country, expires };

  let existing = [];
  if (fs.existsSync(LOGIN_FILE)) {
    existing = JSON.parse(fs.readFileSync(LOGIN_FILE, "utf-8"));
  }

  // Replace existing user
  existing = existing.filter((u) => u.username !== username);
  existing.push(record);

  fs.writeFileSync(LOGIN_FILE, JSON.stringify(existing, null, 2));

  res.json({ success: true, user: record });
});

// ---------- FILE UPLOAD ----------
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname)
});
const upload = multer({ storage });

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, name: req.file.originalname });
});

// Serve uploaded files
app.use("/uploads", express.static(UPLOAD_DIR));

// ---------- SOCKET.IO ----------
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Track online members
let members = [];

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // User joins chat
  socket.on("join", (username) => {
    socket.username = username;
    if (!members.includes(username)) members.push(username);
    io.emit("updateMembers", members);
  });

  // Handle chat messages
  socket.on("chat message", (msg) => {
    io.emit("chat message", msg);
  });

  // User disconnects
  socket.on("disconnect", () => {
    if (socket.username) {
      members = members.filter((u) => u !== socket.username);
      io.emit("updateMembers", members);
    }
    console.log("❌ User disconnected:", socket.id);
  });
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Chat server running on port ${PORT}`);
});
