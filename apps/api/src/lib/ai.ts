import Anthropic from "@anthropic-ai/sdk";
import type { ApiEnv } from "@codearena/config";
import { logger } from "./logger.js";

/**
 * What the AI features need from a model provider. Kept tiny so tests (and a
 * future provider swap) can supply their own implementation.
 */
export interface AiProvider {
  readonly model: string;
  /** Plain-text completion. */
  complete(input: { system: string; prompt: string; maxTokens: number }): Promise<string>;
  /**
   * Structured completion: the model is forced to call a single tool whose
   * input matches `schema`; returns that input (callers validate it).
   */
  completeStructured(input: {
    system: string;
    prompt: string;
    maxTokens: number;
    toolName: string;
    toolDescription: string;
    schema: Record<string, unknown>;
  }): Promise<unknown>;
}

/** A provider call failed in a way the user should see as "AI unavailable". */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

function toProviderError(err: unknown): AiProviderError {
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    logger.error({ status: err.status }, "Anthropic rejected the configured API key");
    return new AiProviderError("The AI service isn't configured correctly on this server.", false);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiProviderError("The AI service is busy right now. Try again in a minute.", true);
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiProviderError("The AI service took too long to answer. Try again.", true);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    logger.error({ err }, "Could not reach the Anthropic API");
    return new AiProviderError("Couldn't reach the AI service. Try again in a moment.", true);
  }
  if (err instanceof Anthropic.APIError) {
    const message = typeof err.message === "string" ? err.message : "";
    logger.error({ status: err.status, message }, "Anthropic API error");
    if (/credit/i.test(message)) {
      return new AiProviderError("The AI service is out of credit on this server.", false);
    }
    return new AiProviderError("The AI service returned an error. Try again later.", true);
  }
  logger.error({ err }, "Unexpected AI provider failure");
  return new AiProviderError("The AI service failed unexpectedly. Try again later.", true);
}

/**
 * Claude 5.5-generation models think by default, spending part of max_tokens
 * before any text. These are short answers, so turn thinking off there
 * ({ type: "disabled" } is rejected on those models; "between_tools" means
 * no thinking unless a tool call happens). Older models only think when asked.
 */
function thinkingParams(model: string): { thinking?: Anthropic.ThinkingConfigParam } {
  return model.endsWith("-5-5")
    ? { thinking: { type: "between_tools" } as Anthropic.ThinkingConfigParam }
    : {};
}

/** Pulls the first JSON object out of free text (fallback when no tool call is made). */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

export function createAnthropicProvider(env: ApiEnv): AiProvider | null {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (/\s/.test(apiKey)) {
    logger.error("ANTHROPIC_API_KEY contains whitespace; AI features are disabled");
    return null;
  }

  const client = new Anthropic({ apiKey, timeout: env.AI_TIMEOUT_MS, maxRetries: 1 });
  const model = env.ANTHROPIC_MODEL;

  return {
    model,

    async complete({ system, prompt, maxTokens }) {
      let message;
      try {
        message = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: prompt }],
          ...thinkingParams(model),
        });
      } catch (err) {
        throw toProviderError(err);
      }
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
      if (!text) throw new AiProviderError("The AI service returned an empty answer.", true);
      return text;
    },

    async completeStructured({ system, prompt, maxTokens, toolName, toolDescription, schema }) {
      let message;
      try {
        message = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: `${system}\n\nAlways answer by calling the ${toolName} tool exactly once.`,
          messages: [{ role: "user", content: prompt }],
          // Forcing a tool (tool_choice "tool"/"any") is rejected by Claude
          // 5.5-generation models, so offer a strict tool with "auto" and fall
          // back to parsing JSON from text if the model answers in prose.
          tools: [
            {
              name: toolName,
              description: toolDescription,
              input_schema: schema as Anthropic.Tool.InputSchema,
              strict: true,
            },
          ],
          tool_choice: { type: "auto" },
          ...thinkingParams(model),
        });
      } catch (err) {
        throw toProviderError(err);
      }
      const call = message.content.find(
        (block): block is Anthropic.ToolUseBlock =>
          block.type === "tool_use" && block.name === toolName,
      );
      if (call) return call.input;
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      const parsed = extractJsonObject(text);
      if (parsed === undefined) {
        throw new AiProviderError("The AI service returned an unexpected answer.", true);
      }
      return parsed;
    },
  };
}
