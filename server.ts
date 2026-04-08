import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import path from "path";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" }
  });
  const PORT = 3000;

  // Store online players
  const players = new Map();

  io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("update", (playerData) => {
      players.set(socket.id, { ...playerData, id: socket.id, lastSeen: Date.now() });
    });

    socket.on("disconnect", () => {
      console.log("Player disconnected:", socket.id);
      players.delete(socket.id);
    });
  });

  // Broadcast state at 20 FPS
  setInterval(() => {
    const now = Date.now();
    const activePlayers = [];
    
    for (const [id, player] of players.entries()) {
      // Remove stale players (timeout after 2 seconds)
      if (now - player.lastSeen > 2000) {
        players.delete(id);
      } else if (!player.isDead) {
        activePlayers.push(player);
      }
    }
    
    io.volatile.emit("state", activePlayers);
  }, 1000 / 20);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
