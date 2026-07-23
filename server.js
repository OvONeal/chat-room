import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json({limit: "10mb"}));

const io = new Server(server, {
  cors: { 
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 密钥存储
let keys = [
  { key: "ABC123", type: "permanent", used: false },
  { key: "ONCE1", type: "one-time", used: false }
];

const users = new Map();

// 健康检查
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.post("/api/verify-key", (req, res) => {
  const { key } = req.body;
  const found = keys.find(k => k.key === key);

  if (!found) return res.json({ ok: false, message: "密钥错误" });
  if (found.type === "one-time" && found.used) {
    return res.json({ ok: false, message: "这个一次性密钥已经用过了" });
  }
  if (found.type === "one-time") found.used = true;

  res.json({ ok: true, message: "密钥正确" });
});

app.post("/api/admin-change-key", (req, res) => {
  const { adminCode, oldKey, newKey, type } = req.body;

  if (adminCode !== "160519") {
    return res.json({ ok: false, message: "管理员密码错误" });
  }

  const found = keys.find(k => k.key === oldKey);
  if (!found) return res.json({ ok: false, message: "旧密钥不存在" });

  found.key = newKey;
  found.type = type === "one-time" ? "one-time" : "permanent";
  found.used = false;

  res.json({ ok: true, message: "密钥已修改" });
});

io.on("connection", (socket) => {
  socket.on("join", (user) => {
    users.set(socket.id, user);
    socket.join(user.room);
    
    // 通知当前房间
    io.to(user.room).emit("system", { 
      text: `${user.avatar || "🌟"} ${user.name} 上线了`,
      room: user.room 
    });
    
    // 更新所有房间的在线用户列表
    io.emit("users", Array.from(users.values()));
  });

  socket.on("chat message", (data) => {
    io.to(data.room).emit("chat message", data);
  });
  
  socket.on("file message", (data) => {
    io.to(data.room).emit("file message", data);
  });

  socket.on("leave", (data) => {
    const user = users.get(socket.id);
    if (user) {
      io.to(user.room).emit("system", { 
        text: `${user.avatar || "🌟"} ${user.name} 离开了`,
        room: user.room 
      });
      users.delete(socket.id);
      io.emit("users", Array.from(users.values()));
    }
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      io.to(user.room).emit("system", { 
        text: `${user.avatar || "🌟"} ${user.name} 离开了`,
        room: user.room 
      });
      users.delete(socket.id);
      io.emit("users", Array.from(users.values()));
    }
  });
});

app.use(express.static(__dirname));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

server.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://0.0.0.0:${PORT}`);
});
