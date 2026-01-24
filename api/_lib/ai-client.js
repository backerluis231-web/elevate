const { z } = require("zod");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const LEVEL_NAMES = ["Bronze", "Silber", "Gold", "Platin", "Champion"];

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "difficultyScore",
    "recommendedLevels",
    "levels",
    "questPlan"
  ],
  properties: {
    difficultyScore: { type: "integer", minimum: 1, maximum: 10 },
    recommendedLevels: { type: "integer", minimum: 3, maximum: 10 },
    levels: {
      type: "array",
      minItems: 3,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "criteria"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          criteria: { type: "array", items: { type: "string" } }
        }
      }
    },
    questPlan: {
      type: "array",
      minItems: 3,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "estimatedTime", "xp", "unlockLevel"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          estimatedTime: { type: "integer", minimum: 5, maximum: 600 },
          xp: { type: "integer", minimum: 1, maximum: 100 },
          unlockLevel: { type: "integer", minimum: 1, maximum: 10 }
        }
      }
    },
    warnings: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } }
  }
};

const toNumber = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return value;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : value;
  }
  return value;
};

const toStringArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/[\n;|•]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const CriteriaSchema = z.preprocess(
  toStringArray,
  z.array(z.string().min(1)).min(1)
);

const LevelSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  criteria: CriteriaSchema
});

const QuestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  estimatedTime: z.preprocess(toNumber, z.number().int().min(5).max(600)),
  xp: z.preprocess(toNumber, z.number().int().min(1).max(100)),
  unlockLevel: z.preprocess(toNumber, z.number().int().min(1).max(10))
});

const AnalysisSchema = z.object({
  difficultyScore: z.preprocess(toNumber, z.number().int().min(1).max(10)),
  recommendedLevels: z.preprocess(toNumber, z.number().int().min(3).max(10)),
  levels: z.array(LevelSchema).min(3).max(10),
  questPlan: z.array(QuestSchema).min(3).max(20),
  warnings: z.array(z.string().min(1)).optional(),
  notes: z.array(z.string().min(1)).optional()
});

function buildSystemPrompt() {
  return [
    "You are a skill analysis engine.",
    "Return ONLY valid JSON, no markdown, no prose.",
    "Follow this JSON schema exactly:",
    JSON.stringify(JSON_SCHEMA, null, 2),
    "Rules:",
    "- Use German text for descriptions and criteria.",
    "- Difficulty score: 1 (easy) to 10 (hard).",
    "- Use level names in this order if possible: Bronze, Silber, Gold, Platin, Champion.",
    "- estimatedTime must be an integer (minutes).",
    "- xp is the progress points for a quest (1-100).",
    "- unlockLevel starts at 1.",
    "- Provide at least 6 quests.",
    "- Keep criteria concrete and testable."
  ].join("\n");
}

function buildUserPrompt(payload) {
  const lines = [
    `Skill: ${payload.name}`,
    payload.description ? `Beschreibung: ${payload.description}` : "Beschreibung: (leer)"
  ];
  if (payload.userDescription) {
    lines.push(`User Kontext: ${payload.userDescription}`);
  }
  return lines.join("\n");
}

function extractJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function normalizeAnalysis(raw) {
  const parsed = AnalysisSchema.parse(raw);
  const levels = parsed.levels.slice(0, LEVEL_NAMES.length);
  if (levels.length < LEVEL_NAMES.length) {
    while (levels.length < LEVEL_NAMES.length) {
      levels.push({
        name: LEVEL_NAMES[levels.length],
        description: "Beschreibung folgt.",
        criteria: ["Kernaufgabe sicher ausfuehren."]
      });
    }
  }
  levels.forEach((level, index) => {
    level.name = level.name || LEVEL_NAMES[index] || `Level ${index + 1}`;
  });

  const maxLevel = levels.length;
  const questPlan = parsed.questPlan.map((quest) => ({
    ...quest,
    estimatedTime: Number(quest.estimatedTime),
    xp: Number(quest.xp),
    unlockLevel: Math.min(Math.max(Number(quest.unlockLevel), 1), maxLevel)
  }));

  return {
    difficultyScore: parsed.difficultyScore,
    recommendedLevels: levels.length,
    levels,
    questPlan,
    warnings: parsed.warnings || [],
    notes: parsed.notes || []
  };
}

async function callOpenAI(messages) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OpenAI API key");
  }
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages
    })
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = payload?.error?.message || "OpenAI request failed";
    throw new Error(msg);
  }
  const text = payload?.choices?.[0]?.message?.content || "";
  return text;
}

async function analyzeSkill(payload) {
  const baseMessages = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: buildUserPrompt(payload) }
  ];

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const messages = attempt === 0
      ? baseMessages
      : [
          ...baseMessages,
          { role: "user", content: "Your last JSON was invalid. Fix it to match the schema. Return JSON only." }
        ];
    try {
      const text = await callOpenAI(messages);
      const raw = extractJson(text);
      if (!raw) throw new Error("No JSON object returned.");
      const normalized = normalizeAnalysis(raw);
      return { model: OPENAI_MODEL, analysis: normalized };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Analysis failed.");
}

module.exports = { analyzeSkill };
