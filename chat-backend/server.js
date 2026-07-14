const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);
const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("[warn] GEMINI_API_KEY is missing. /api/chat will fail until it is set.");
}

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS: Origin not allowed"));
    }
  })
);

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "common-table-chat-backend" });
});

function buildSystemPrompt(settings = {}) {
  const persona = settings.persona || "helpful";
  const dietaryPreference = settings.dietaryPreference || "none";
  const difficulty = settings.difficulty || "intermediate";

  return [
    "You are Common Table Chat, a practical recipe assistant for commontablekitchen.com.au.",
    "Keep responses concise, useful, and food-focused.",
    "Prioritize affordable, high-protein, realistic cooking advice.",
    "Offer substitutions when relevant.",
    "Avoid medical claims and never invent unsafe food guidance.",
    `Persona: ${persona}`,
    `Dietary preference: ${dietaryPreference}`,
    `Preferred difficulty: ${difficulty}`
  ].join("\n");
}

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const settings = req.body?.settings || {};

    if (!message) {
      return res.status(400).json({ error: "'message' is required." });
    }

    if (!apiKey) {
      return res.status(500).json({ error: "Server is missing GEMINI_API_KEY." });
    }

    const temperature = Number.isFinite(Number(settings.temperature))
      ? Number(settings.temperature)
      : 0.7;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = [
      buildSystemPrompt(settings),
      "",
      "User message:",
      message
    ].join("\n");

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        topP: 0.9,
        maxOutputTokens: 500
      }
    });

    const reply = result.response?.text?.().trim();

    if (!reply) {
      return res.status(502).json({ error: "No model response received." });
    }

    return res.json({ reply });
  } catch (error) {
    console.error("/api/chat error:", error);
    return res.status(500).json({
      error: "Failed to generate chat response.",
      detail: process.env.NODE_ENV === "development" ? String(error.message || error) : undefined
    });
  }
});

app.listen(port, () => {
  console.log(`[chat-backend] listening on http://localhost:${port}`);
});
