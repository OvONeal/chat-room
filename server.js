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

// ✅ 支持环境变量，默认 3000
const PORT = process.env.PORT || 3000;

// ✅ CORS 配置：允许所有来源（生产环境建议限制具体域名）
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());

const io = new Server(server, {
  cors: { 
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ✅ 密钥存储（生产环境建议用数据库）
let keys = [
  { key: "ABC123", type: "permanent", used: false },
  { key: "ONCE1", type: "one-time", used: false }
];

const users = new Map();

// ✅ 健康检查接口（部署平台需要）
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
    io.emit("users", Array.from(users.values()));
    io.emit("system", `${user.avatar || "🌟"} ${user.name} 上线了`);
  });

  socket.on("chat message", (data) => {
    io.emit("chat message", data);
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      io.emit("system", `${user.avatar || "🌟"} ${user.name} 离开了`);
      users.delete(socket.id);
      io.emit("users", Array.from(users.values()));
    }
  });
});

// ✅ 静态文件服务：把 index.html 放在同一目录下
app.use(express.static(__dirname));

// ✅ 所有路由都返回 index.html（支持前端路由）
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

server.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://0.0.0.0:${PORT}`);
});