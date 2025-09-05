// server.js
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

// Ensure uploads dir exists
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, safeName);
  },
});
const upload = multer({ storage });

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// In-memory user map: socketId => { username, country, socketId, lastSeen }
const users = new Map();

// Helper: broadcast online users (lightweight info)
function broadcastOnlineUsers() {
  const list = Array.from(users.values()).map((u) => ({
    username: u.username,
    country: u.country,
    socketId: u.socketId,
  }));
  io.emit("online users", list);
}

// Remove inactive users (no heartbeat) older than INACTIVE_MS
const INACTIVE_MS = 90 * 1000; // 90s
setInterval(() => {
  const now = Date.now();
  let removed = false;
  for (const [sid, u] of users.entries()) {
    if (now - u.lastSeen > INACTIVE_MS) {
      users.delete(sid);
      removed = true;
      console.log(`Removing inactive user ${u.username} (${sid})`);
    }
  }
  if (removed) broadcastOnlineUsers();
}, 30 * 1000);

// Socket.IO events
io.on("connection", (socket) => {
  console.log("✅ socket connected:", socket.id);

  // client should emit 'join' with { username, country }
  socket.on("join", (data) => {
    if (!data || !data.username) return;
    const u = {
      username: data.username,
      country: data.country || "",
      socketId: socket.id,
      lastSeen: Date.now(),
    };
    users.set(socket.id, u);
    broadcastOnlineUsers();
    console.log(`User joined: ${u.username} (${socket.id})`);
  });

  // heartbeat to keep them online
  socket.on("heartbeat", () => {
    const u = users.get(socket.id);
    if (u) {
      u.lastSeen = Date.now();
      users.set(socket.id, u);
    }
  });

  // typing indicator: broadcast to others
  socket.on("typing", (username) => {
    socket.broadcast.emit("typing", username);
  });

  // chat message
  // message expected shape: { id, username, country, text, file?, clientTime? }
  socket.on("chat message", (msg) => {
    if (!msg || !msg.id || !msg.username) return;
    // attach server timestamp (and sanitize lightly)
    const out = {
      ...msg,
      serverTime: Date.now(),
    };
    // broadcast to all
    io.emit("chat message", out);
    console.log("msg", out.id, out.username, out.text ? out.text.slice(0, 50) : "(no text)");
  });

  // explicit leave (when user closes tab)
  socket.on("leave", () => {
    if (users.has(socket.id)) {
      const u = users.get(socket.id);
      console.log(`User left: ${u.username} (${socket.id})`);
      users.delete(socket.id);
      broadcastOnlineUsers();
    }
  });

  socket.on("disconnect", () => {
    if (users.has(socket.id)) {
      const u = users.get(socket.id);
      console.log(`User disconnected: ${u.username} (${socket.id})`);
      users.delete(socket.id);
      broadcastOnlineUsers();
    } else {
      console.log("socket disconnected:", socket.id);
    }
  });
});

// Upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  res.json({ url });
});

// Serve uploaded files
app.use("/uploads", express.static(UPLOAD_DIR));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Chat server running on port ${PORT}`);
});
