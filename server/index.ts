import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// ========== CORS ==========
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://demo-edpos.vercel.app",
    "http://localhost:5000",
    "http://localhost:3000",
    "http://localhost:5001",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:5001",
  ];

  const origin = req.headers.origin as string | undefined;

  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-tenant-id"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header("Access-Control-Allow-Credentials", "true");

  if (origin && (allowedOrigins.includes(origin) || origin.includes("replit.dev") || origin.includes("vercel.app"))) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ========== Logging ==========
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      console.log(logLine);
    }
  });

  next();
});

// ========== Register routes ==========
(async () => {
  const server = await registerRoutes(app);

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    if (status >= 500) {
      console.error("💥 Server error:", err);
    }
  });

  // Example extra routes
  app.post("/api/popup/close", (req, res) => {
    const { success } = req.body;
    import("./websocket-server").then((wsModule) => {
      wsModule.broadcastPopupClose(success);
    });
    res.json({ success: true, message: "Popup close signal sent" });
  });

  app.post("/api/NotifyPos/ReceiveNotify", (req, res) => {
    try {
      const { TransactionUuid } = req.body;
      console.log("📢 Received payment notification:", TransactionUuid);
      import("./websocket-server").then((wsModule) => {
        wsModule.broadcastPaymentSuccess(TransactionUuid);
      });
      res.json({ message: "Notification received successfully." });
    } catch (error) {
      console.error("Error processing payment notification:", error);
      res.status(500).json({ error: "Failed to process notification" });
    }
  });

  // Start WebSocket
  try {
    const wsModule = await import("./websocket-server");
    wsModule.initializeWebSocketServer(server);
    console.log("✅ WebSocket server initialized");
  } catch (error) {
    console.error("⚠️ Failed to start WebSocket:", error);
  }

  // Start Express server
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
  });

  server.on("error", (err: any) => {
    console.error("💥 Server error:", err);
    if (err.code === "EADDRINUSE") {
      console.log(`⚠️ Port ${PORT} is already in use`);
    }
  });
})();

// test route
app.get("/api/hello", (req: Request, res: Response) => {
  res.json({ message: "Hello from backend!" });
});
