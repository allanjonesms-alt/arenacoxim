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
  
  // Set generous limit for image uploads in base64
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  const PORT = 3000;

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Serve static uploads
  app.use('/uploads', express.static(uploadsDir));

  // Generous upload-image endpoint to save base64 cards/photos to local uploads folder
  app.post('/api/upload-image', (req, res) => {
    try {
      const { name, imageDataUrl } = req.body;
      if (!imageDataUrl) {
        return res.status(400).json({ error: 'Missing imageDataUrl' });
      }

      // Handle base64 extraction
      const matches = imageDataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer: Buffer;
      let extension = 'jpg';

      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
        if (mimeType.includes('png')) {
          extension = 'png';
        } else if (mimeType.includes('gif')) {
          extension = 'gif';
        } else if (mimeType.includes('webp')) {
          extension = 'webp';
        }
      } else {
        buffer = Buffer.from(imageDataUrl, 'base64');
      }

      const cleanName = (name || 'upload')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .substring(0, 50);

      const filename = `${cleanName}_${Date.now()}.${extension}`;
      const filePath = path.join(uploadsDir, filename);

      fs.writeFileSync(filePath, buffer);
      console.log(`Saved uploaded image to: ${filePath}`);

      res.json({ imageUrl: `/uploads/${filename}` });
    } catch (error: any) {
      console.error("Error saving uploaded image:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Simple health check
  app.get('/api/proxy-image', async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl) {
        return res.status(400).send('Missing url parameter');
      }

      // If it's already a relative path, we don't need to proxy it
      if (!imageUrl.startsWith('http')) {
        return res.redirect(imageUrl);
      }

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.send(buffer);
    } catch (error: any) {
      console.error("Proxy image error:", error.message);
      res.status(500).send(`Error proxying image: ${error.message}`);
    }
  });

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
        res.status(200).set({ 
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
    console.log("Vite middleware and catch-all attached.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Set no-cache policy specifically for the index.html entry point
    app.use(express.static(distPath, {
      etag: true,
      lastModified: true,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        } else {
          // For compiled chunks/assets, let them use standard cache but prevent infinite stale states
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
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
