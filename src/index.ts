
import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDatabase } from "./config/db";
import cultureRoutes from "./routes/cultures";
import assistantRoutes from "./routes/assistant";

const app = express();
const port = Number(process.env.PORT || 4000);

const allowedOrigins = (
  process.env.FRONTEND_ORIGIN || "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "BudayaKita API" });
});

app.use("/api/cultures", cultureRoutes);
app.use("/api/assistant", assistantRoutes);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: "Terjadi kesalahan pada server." });
  },
);

// Hindari app.listen() saat dijalankan sebagai Vercel Function.
if (process.env.VERCEL !== "1") {
  connectDatabase()
    .then(() => {
      app.listen(port, () => {
        console.log(`BudayaKita API listening on ${port}`);
      });
    })
    .catch((error) => {
      console.error("Database connection failed:", error);
      process.exit(1);
    });
}

export default app;
