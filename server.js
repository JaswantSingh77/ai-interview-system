import "dotenv/config";
import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  dest: "tmp/",
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

// ----------------------------------------------------
// GEMINI CONFIGURATION
// ----------------------------------------------------

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "WARNING: GEMINI_API_KEY is not set. AI endpoints will not work."
  );
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Current Gemini models used by this project.
const TEXT_MODEL = "gemini-3.8-flash";
const TRANSCRIBE_MODEL = "gemini-3.5-transcribe";

// ----------------------------------------------------
// EXPRESS CONFIGURATION
// ----------------------------------------------------

app.use(express.json({ limit: "2mb" }));

app.use(
  express.static(path.join(process.cwd(), "public"))
);

// ----------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanJson(text) {
  let value = String(text || "").trim();

  // Remove markdown JSON fences if Gemini returns them.
  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(value);
}

/*
  Gemini can temporarily return 503 or 429.

  We retry those temporary errors automatically.
*/
async function generateWithRetry(request, attempts = 4) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      lastError = error;

      const status =
        error?.status ||
        error?.code ||
        error?.response?.status;

      console.error(
        `Gemini request failed. Attempt ${attempt + 1}/${attempts}`,
        {
          status,
          message: error?.message
        }
      );

      // Retry only temporary errors.
      if (status !== 503 && status !== 429) {
        throw error;
      }

      if (attempt < attempts - 1) {
        const delay = 1000 * Math.pow(2, attempt);

        console.log(
          `Gemini temporarily unavailable. Retrying in ${
            delay / 1000
          } seconds...`
        );

        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// ----------------------------------------------------
// HEALTH CHECK
// ----------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY
    ),
    textModel: TEXT_MODEL,
    transcriptionModel: TRANSCRIBE_MODEL
  });
});

// ----------------------------------------------------
// START INTERVIEW
// ----------------------------------------------------

app.post("/api/interview/start", async (req, res) => {
  try {
    const {
      name,
      subject,
      difficulty = "medium"
    } = req.body;

    if (!name || !subject) {
      return res.status(400).json({
        error: "Name and subject are required."
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key is not configured."
      });
    }

    const prompt = `
You are an expert technical interviewer.

Create exactly 5 interview questions for a BCA student.

Candidate name: ${name}
Subject: ${subject}
Difficulty: ${difficulty}

Requirements:
- Questions must be suitable for a live spoken interview.
- Start with a basic question.
- Gradually increase difficulty.
- Include conceptual and practical questions.
- Avoid extremely difficult questions.
- Do not ask questions about protected personal characteristics.
- Keep each question concise.

Return ONLY valid JSON in exactly this format:

{
  "questions": [
    {
      "id": 1,
      "question": "Question here"
    },
    {
      "id": 2,
      "question": "Question here"
    },
    {
      "id": 3,
      "question": "Question here"
    },
    {
      "id": 4,
      "question": "Question here"
    },
    {
      "id": 5,
      "question": "Question here"
    }
  ]
}
`;

    const response = await generateWithRetry({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.6
      }
    });

    const data = cleanJson(response.text);

    if (
      !data.questions ||
      !Array.isArray(data.questions) ||
      data.questions.length === 0
    ) {
      throw new Error(
        "Gemini returned an invalid questions format."
      );
    }

    res.json(data);

  } catch (error) {
    console.error(
      "INTERVIEW START ERROR:",
      error
    );

    res.status(500).json({
      error: "Could not generate interview questions.",
      details:
        error?.message || "Unknown Gemini error."
    });
  }
});

// ----------------------------------------------------
// EVALUATE ANSWER
// ----------------------------------------------------

app.post("/api/interview/evaluate", async (req, res) => {
  try {
    const {
      question,
      answer,
      subject
    } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        error:
          "Question and answer are required."
      });
    }

    const prompt = `
You are evaluating a student's technical interview answer.

Subject:
${subject || "General"}

Question:
${question}

Student answer:
${answer}

Evaluate only the quality of the answer.

Consider:
- Relevance
- Technical correctness
- Clarity
- Completeness

Do not judge:
- Appearance
- Accent
- Personality
- Gender
- Religion
- Caste
- Disability
- Health
- Any protected characteristic

Return ONLY valid JSON:

{
  "score": 0,
  "relevance": 0,
  "technicalAccuracy": 0,
  "clarity": 0,
  "feedback": "Short useful feedback.",
  "strengths": [
    "Strength 1"
  ],
  "improvement": [
    "Improvement 1"
  ]
}

All numeric values must be between 0 and 100.
`;

    const response = await generateWithRetry({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    const result = cleanJson(response.text);

    res.json(result);

  } catch (error) {
    console.error(
      "ANSWER EVALUATION ERROR:",
      error
    );

    res.status(500).json({
      error: "Could not evaluate answer.",
      details:
        error?.message || "Unknown Gemini error."
    });
  }
});

// ----------------------------------------------------
// AUDIO TRANSCRIPTION
// ----------------------------------------------------

app.post(
  "/api/transcribe",
  upload.single("audio"),
  async (req, res) => {
    let uploadedPath = req.file?.path;

    try {
      if (!req.file) {
        return res.status(400).json({
          error: "Audio file is required."
        });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: "Gemini API key is not configured."
        });
      }

      console.log(
        "Uploading audio:",
        req.file.originalname
      );

      /*
        Upload the recorded audio to Gemini.
      */
      const audioFile = await ai.files.upload({
        file: uploadedPath,
        config: {
          mimeType:
            req.file.mimetype || "audio/webm"
        }
      });

      console.log(
        "Audio uploaded:",
        audioFile.name
      );

      /*
        Current Gemini transcription approach:
        send the uploaded audio file directly
        to gemini-3.5-transcribe.
      */
      const response = await generateWithRetry({
        model: TRANSCRIBE_MODEL,
        contents: [audioFile],
        config: {
          audioTranscriptionConfig: {
            languageCodes: []
          }
        }
      });

      const transcript =
        response.text?.trim() || "";

      console.log(
        "Transcript length:",
        transcript.length
      );

      res.json({
        transcript
      });

    } catch (error) {
      console.error(
        "TRANSCRIPTION ERROR:",
        error
      );

      res.status(500).json({
        error: "Transcription failed.",
        details:
          error?.message || "Unknown transcription error."
      });

    } finally {
      /*
        Delete the temporary local audio file.
      */
      if (uploadedPath) {
        fs.promises
          .unlink(uploadedPath)
          .catch(() => {});
      }
    }
  }
);

// ----------------------------------------------------
// FINAL INTERVIEW REPORT
// ----------------------------------------------------

app.post("/api/report", async (req, res) => {
  try {
    const {
      candidate,
      subject,
      evaluations,
      alerts
    } = req.body;

    const prompt = `
Create a concise technical interview report.

Candidate:
${candidate || "Unknown"}

Subject:
${subject || "General"}

Answer evaluations:
${JSON.stringify(
  evaluations || [],
  null,
  2
)}

Monitoring alerts:
${JSON.stringify(
  alerts || [],
  null,
  2
)}

Return ONLY valid JSON:

{
  "overallScore": 0,
  "summary": "Short summary of interview performance.",
  "technicalSummary": "Short technical summary.",
  "recommendationForReviewer": "Review the interview answers and monitoring events before making any candidate decision."
}

Rules:
- overallScore must be 0-100.
- Base the score on interview answers.
- Monitoring alerts should be presented as events for reviewer consideration, not automatically treated as proof of cheating.
- Do not infer personality.
- Do not infer health or disability.
- Do not infer protected characteristics.
- Do not make an automatic hiring decision.
`;

    const response = await generateWithRetry({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    const report = cleanJson(
      response.text
    );

    res.json(report);

  } catch (error) {
    console.error(
      "REPORT GENERATION ERROR:",
      error
    );

    res.status(500).json({
      error: "Report generation failed.",
      details:
        error?.message || "Unknown Gemini error."
    });
  }
});

// ----------------------------------------------------
// FRONTEND FALLBACK
// ----------------------------------------------------

app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(
      process.cwd(),
      "public",
      "index.html"
    )
  );
});

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `AI Interview running at http://localhost:${PORT}`
  );
});