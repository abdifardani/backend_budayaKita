
import { GoogleGenAI } from "@google/genai";
import Culture from "../models/Culture";

const REQUEST_TIMEOUT_MS = 10_000;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableGeminiError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    /GEMINI_TIMEOUT/i.test(message) ||
    /\b503\b/.test(message) ||
    /\b429\b/.test(message) ||
    /\b500\b/.test(message) ||
    /UNAVAILABLE/i.test(message) ||
    /RESOURCE_EXHAUSTED/i.test(message) ||
    /high demand/i.test(message) ||
    /overloaded/i.test(message) ||
    /model.*not found/i.test(message) ||
    /not available to.*users/i.test(message)
  );
}

function getModels(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim();

  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return [
    ...new Set(
      [primary, ...fallbacks].filter(
        (model): model is string => Boolean(model),
      ),
    ),
  ];
}

async function generateWithTimeout(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
): Promise<string> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.3,
          systemInstruction:
            "Kamu adalah BudayaKita, asisten edukasi budaya Indonesia. Jawab dalam Bahasa Indonesia, jangan mengarang fakta atau sumber.",
        },
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `GEMINI_TIMEOUT: Respons model ${model} melebihi 10 detik.`,
            ),
          );
        }, REQUEST_TIMEOUT_MS);
      }),
    ]);

    const answer = response.text?.trim();

    if (!answer) {
      throw new Error(
        `Gemini mengembalikan jawaban kosong dari model ${model}`,
      );
    }

    return answer;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function answerCultureQuestion(message: string) {
  // 1. Cari konteks budaya di MongoDB.
  const keywords = message
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);

  const keywordPattern = keywords
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const related = keywordPattern
    ? await Culture.find({
        $or: [
          {
            title: {
              $regex: keywordPattern,
              $options: "i",
            },
          },
          {
            category: {
              $regex: keywordPattern,
              $options: "i",
            },
          },
        ],
      })
        .limit(5)
        .lean()
    : [];

  const context = related.map((item) => ({
    title: item.title,
    category: item.category,
    summary: item.summary,
    description: item.description,
    sources: item.sources,
  }));

  const sources = context.flatMap((item) => item.sources || []);
  const first = context[0];

  // 2. Fallback jika API key belum tersedia.
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return {
      answer: first
        ? `Informasi dari database BudayaKita tentang ${first.title}:\n\n${
            first.summary ||
            first.description ||
            "Deskripsi belum tersedia."
          }\n\nJawaban ini berasal dari database, bukan hasil analisis AI.`
        : "Gemini belum dikonfigurasi. Tambahkan GEMINI_API_KEY ke backend/.env.",
      sources,
      mode: "fallback" as const,
    };
  }

  // 3. Siapkan daftar model.
  const models = getModels();

  if (models.length === 0) {
    throw new Error(
      "GEMINI_MODEL belum dikonfigurasi di backend/.env",
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
PERTANYAAN PENGGUNA:
${message}

KONTEKS BUDAYA DARI DATABASE:
${JSON.stringify(context)}

KAMU ADALAH BUDAYAKITA
Asisten edukasi budaya Indonesia yang berkomunikasi
dalam Bahasa Indonesia.

ATURAN:
- Utamakan informasi budaya Sumatera Selatan yang relevan.
- Gunakan konteks database sebagai referensi, bukan jaminan kebenaran.
- Jangan mengarang fakta, kutipan, atau sumber.
- Bedakan fakta dari interpretasi.
- Jika informasi tidak cukup, jelaskan keterbatasannya.
- Jangan mengklaim sumber telah diverifikasi jika belum.
- Jawab dengan jelas, alami, dan informatif.
`;

  let lastError: unknown;

  // 4. Coba model utama, lalu model cadangan.
  for (const model of models) {
    try {
      console.info(`[Gemini] Mencoba model: ${model}`);

      const answer = await generateWithTimeout(ai, model, prompt);

      console.info(`[Gemini] Berhasil menggunakan model: ${model}`);

      return {
        answer,
        sources,
        mode: "ai" as const,
      };
    } catch (error) {
      lastError = error;

      console.error(
        `[Gemini] Model ${model} gagal: ${getErrorMessage(error)}`,
      );

      if (!isRetryableGeminiError(error)) {
        throw error;
      }

      console.warn(
        `[Gemini] Model ${model} gagal atau timeout. Mencoba model berikutnya.`,
      );
    }
  }

  // 5. Jika semua model gagal, gunakan data database jika tersedia.
  if (first) {
    return {
      answer:
        `Layanan AI sedang tidak tersedia. Berikut informasi dari ` +
        `database BudayaKita tentang ${first.title}:\n\n` +
        `${first.summary || first.description || "Deskripsi belum tersedia."}`,
      sources,
      mode: "fallback" as const,
    };
  }

  throw new Error(
    `Semua model Gemini gagal. ${getErrorMessage(lastError)}`,
  );
}
