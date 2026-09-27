import { cachedPublic, TAGS, TTL } from "@/lib/cache"

type HealthArticle = {
  title: string
  summary: string
  category: string
  readTime: string
}

const fallbackArticles: HealthArticle[] = [
  {
    title: "How to Build a Safe Daily Medicine Routine",
    summary:
      "Use fixed timings, pill organizers, and reminder alarms to reduce missed doses and avoid accidental double dosing.",
    category: "Medication Safety",
    readTime: "4 min read",
  },
  {
    title: "Understanding Fever: When Home Care Is Enough",
    summary:
      "Most fevers improve with fluids, rest, and temperature monitoring. Learn warning signs that require medical attention.",
    category: "General Health",
    readTime: "5 min read",
  },
  {
    title: "Managing Diabetes Through Food and Timing",
    summary:
      "Simple meal planning and consistent medicine timing can improve glucose stability and reduce sudden spikes.",
    category: "Diabetes",
    readTime: "6 min read",
  },
  {
    title: "Antibiotics: Why Completing the Course Matters",
    summary:
      "Stopping antibiotics too early can cause relapse and resistance. Understand correct use and common mistakes.",
    category: "Antibiotic Awareness",
    readTime: "4 min read",
  },
  {
    title: "Seasonal Allergy Basics for Families",
    summary:
      "Daily prevention habits and proper antihistamine use can make seasonal allergies easier to manage.",
    category: "Allergy Care",
    readTime: "5 min read",
  },
  {
    title: "How to Read a Medicine Label Correctly",
    summary:
      "Check strength, dosage, expiration date, and interactions before taking any medicine to avoid preventable errors.",
    category: "Medication Literacy",
    readTime: "3 min read",
  },
]

function extractJsonArray(text: string): HealthArticle[] | null {
  const cleaned = text.trim()
  const fenced = cleaned.match(/```json\s*([\s\S]*?)```/i) || cleaned.match(/```\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : cleaned

  const start = candidate.indexOf("[")
  const end = candidate.lastIndexOf("]")
  if (start === -1 || end === -1 || end <= start) return null

  const jsonText = candidate.slice(start, end + 1)

  try {
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) return null

    const normalized = parsed
      .map((item) => ({
        title: String(item?.title || "").trim(),
        summary: String(item?.summary || "").trim(),
        category: String(item?.category || "General Health").trim(),
        readTime: String(item?.readTime || "5 min read").trim(),
      }))
      .filter((item) => item.title && item.summary)

    return normalized.length ? normalized : null
  } catch {
    return null
  }
}

async function fetchGeminiArticles(topic?: string): Promise<HealthArticle[] | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash"

  const subject = topic?.trim() || "everyday medicine safety, preventive care, and common health topics"

  const prompt = `Create exactly 6 health education article previews for an online pharmacy app audience in India.\n\nRules:\n- Return ONLY a JSON array (no markdown, no extra text).\n- Every item must include exactly these keys: title, summary, category, readTime.\n- title: max 65 characters.\n- summary: one sentence, max 120 characters.\n- category: short label (1-3 words).\n- readTime: like \"4 min read\".\n- Practical and medically cautious wording.\n- No diagnosis claims.\n- Focus topic: ${subject}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            topP: 0.9,
            maxOutputTokens: 1600,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      }
    )

    if (!res.ok) return null

    const data = (await res.json()) as any
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: any) => String(part?.text || ""))
        .join("\n") || ""

    return extractJsonArray(text)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function getHealthArticles(topic?: string): Promise<HealthArticle[]> {
  const { articles } = await getHealthArticlesWithMeta(topic)
  return articles
}

type HealthArticlesResult = {
  articles: HealthArticle[]
  usedFallback: boolean
  modelUsed: string | null
}

async function loadHealthArticlesWithMeta(topic?: string): Promise<HealthArticlesResult> {
  const modelUsed = process.env.GEMINI_API_KEY
    ? (process.env.GEMINI_MODEL || "gemini-2.5-flash")
    : null

  const geminiArticles = await fetchGeminiArticles(topic)
  if (geminiArticles?.length) {
    return {
      articles: geminiArticles,
      usedFallback: false,
      modelUsed,
    }
  }

  if (!topic?.trim()) {
    return {
      articles: fallbackArticles,
      usedFallback: true,
      modelUsed,
    }
  }

  const q = topic.trim().toLowerCase()
  const filtered = fallbackArticles.filter((a) => {
    const hay = `${a.title} ${a.summary} ${a.category}`.toLowerCase()
    return hay.includes(q)
  })

  return {
    articles: filtered.length ? filtered : fallbackArticles,
    usedFallback: true,
    modelUsed,
  }
}

/**
 * The no-topic call is what the homepage teaser and the default `/health-articles`
 * landing use — same result for every visitor, and otherwise a live Gemini call on
 * every single page load. A topic search is free-text (see `lib/cache.ts`'s warning
 * against caching by free-text query), so only this zero-argument case is cached.
 */
const getCachedDefaultHealthArticles = cachedPublic(
  () => loadHealthArticlesWithMeta(undefined),
  ["health-articles-default"],
  { revalidate: TTL.TAXONOMY, tags: [TAGS.taxonomy] },
)

export async function getHealthArticlesWithMeta(topic?: string): Promise<HealthArticlesResult> {
  const trimmed = topic?.trim()
  return trimmed ? loadHealthArticlesWithMeta(trimmed) : getCachedDefaultHealthArticles()
}

export type { HealthArticle }
