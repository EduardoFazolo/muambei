type StructuredResponseInput = {
  schemaName: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: string;
};

type OpenAIResponsePayload = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      json?: unknown;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

export class TripResearchError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "trip_research_error") {
    super(message);
    this.name = "TripResearchError";
    this.status = status;
    this.code = code;
  }
}

function getApiKey() {
  return process.env.OPEN_AI_KEY || process.env.OPENAI_API_KEY;
}

function getBaseUrl() {
  return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
}

function getModel() {
  return process.env.TRIP_RESEARCH_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

function extractOutputText(payload: OpenAIResponsePayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.json !== undefined) {
        try {
          return JSON.stringify(content.json);
        } catch {
          // Ignore non-serializable payloads and continue scanning text fields.
        }
      }

      if (content.type === "output_text" && typeof content.text === "string") {
        const text = content.text.trim();
        if (text) {
          return text;
        }
      }
    }
  }

  return "";
}

function stripCodeFence(text: string) {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? text.trim();
}

function extractBalancedJson(text: string) {
  const starts = ["{", "["];

  for (let index = 0; index < text.length; index += 1) {
    const opening = text[index];
    if (!starts.includes(opening)) {
      continue;
    }

    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let cursor = index; cursor < text.length; cursor += 1) {
      const char = text[cursor];

      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === opening) {
        depth += 1;
      } else if (char === closing) {
        depth -= 1;
        if (depth === 0) {
          return text.slice(index, cursor + 1);
        }
      }
    }
  }

  return "";
}

function parseStructuredJson<T>(text: string): T | null {
  const candidates = [
    text.trim(),
    stripCodeFence(text),
    extractBalancedJson(stripCodeFence(text)),
    extractBalancedJson(text),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function summarizeInvalidPayload(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

export async function requestStructuredResearch<T>({
  schemaName,
  schema,
  instructions,
  input,
}: StructuredResponseInput): Promise<T> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new TripResearchError(
      "Configure OPEN_AI_KEY or OPENAI_API_KEY to enable travel research.",
      503,
      "not_configured",
    );
  }

  const response = await fetch(`${getBaseUrl()}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(75_000),
    body: JSON.stringify({
      model: getModel(),
      input,
      instructions,
      tools: [
        {
          type: "web_search",
          search_context_size: "medium",
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  const payload = (await response.json()) as OpenAIResponsePayload;

  if (!response.ok) {
    throw new TripResearchError(
      payload.error?.message || "OpenAI travel research request failed.",
      response.status,
      "openai_error",
    );
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new TripResearchError(
      "OpenAI returned an empty research payload.",
      502,
      "empty_response",
    );
  }

  const parsed = parseStructuredJson<T>(outputText);
  if (parsed) {
    return parsed;
  }

  throw new TripResearchError(
    `OpenAI returned invalid structured travel research. Payload preview: ${summarizeInvalidPayload(outputText)}`,
    502,
    "invalid_response",
  );
}
