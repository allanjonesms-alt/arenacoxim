import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import admin from 'firebase-admin';
import fs from 'fs';

// Load config using fs to be safe in ESM
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));

console.log("Starting server initialization...");

// Initialize Firebase Admin
try {
  const app = admin.initializeApp({
    projectId: firebaseConfig.projectId, 
  });
  console.log("Firebase Admin initialized successfully for project:", app.options.projectId);
} catch (e) {
  console.error("Firebase Admin initialization failed:", e);
}

const auth = admin.auth();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // Simple health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.get("/api/health/firebase", async (req, res) => {
    try {
      const projId = admin.app().options.projectId;
      // Just check if we can list users (minimal check)
      const listUsersResult = await auth.listUsers(1);
      res.json({ 
        status: "ok", 
        projectId: projId,
        authReady: true,
        usersCount: listUsersResult.users.length 
      });
    } catch (error: any) {
      res.status(500).json({ 
        status: "error", 
        error: error.message,
        code: error.code,
        projectId: admin.app().options.projectId 
      });
    }
  });

  console.log("Setting up Express app...");

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Initializing Vite dev server...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom", // Use custom to handle index.html manually
    });
    app.use(vite.middlewares);
    
    app.use('*', async (req, res, next) => {
      // Ignore API routes in catch-all
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }

      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
    console.log("Vite middleware and catch-all attached.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
