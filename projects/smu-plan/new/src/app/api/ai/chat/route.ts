import { NextRequest } from "next/server";
import { createAIClient, DEFAULT_MODEL, SYSTEM_PROMPT } from "@/lib/ai/client";
import { toolDefinitions, type ToolName } from "@/lib/ai/tools";
import { executeTool } from "@/lib/ai/executor";
import { selectProviderKey, recordKeyUsage } from "@/lib/keys/selector";
import { getAuthContext } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { normalizeAiRouteError } from "@/lib/ai/errors";
import { z } from "zod";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";

const AI_VISION_MODEL = process.env.AI_VISION_MODEL?.trim() || "";

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  model: z.string().optional(),
  imageBase64: z.string().startsWith("data:image/").optional(),
});

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);

  try {
    const body = await req.json();
    const { messages, model: requestedModel, imageBase64 } = chatSchema.parse(body);

    if (imageBase64 && !AI_VISION_MODEL) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Vision model is not configured" } },
        { status: 400 },
      );
    }

    const model = imageBase64 ? AI_VISION_MODEL : requestedModel || DEFAULT_MODEL;

    // Select a provider key
    const keyInfo = await selectProviderKey();
    if (!keyInfo) {
      return Response.json(
        { ok: false, error: { code: 503, message: "No available API keys" } },
        { status: 503 }
      );
    }

    const client = createAIClient(keyInfo.apiKey);

    // Build messages with system prompt
    const lastUserIndex = imageBase64
      ? messages.reduce((latest, message, index) => (
          message.role === "user" ? index : latest
        ), -1)
      : -1;

    const chatMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((message, index) => {
        if (index === lastUserIndex && imageBase64) {
          return {
            role: "user" as const,
            content: [
              { type: "text" as const, text: message.content },
              { type: "image_url" as const, image_url: { url: imageBase64 } },
            ],
          };
        }

        return {
          role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: message.content,
        };
      }),
    ];

    // Log search query
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();
    if (lastUserMsg) {
      await prisma.searchLog.create({
        data: {
          query: lastUserMsg.content.slice(0, 500),
          userId: auth?.userId,
          ip: req.headers.get("x-forwarded-for") || undefined,
        },
      });
    }

    const startMs = Date.now();

    // First call — may include tool calls
    const response = await client.chat.completions.create({
      model,
      messages: chatMessages,
      tools: toolDefinitions,
      stream: true,
    });

    // SSE streaming
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        }

        let fullContent = "";
        let toolCallsAccum: Map<
          number,
          { id: string; name: string; arguments: string }
        > = new Map();

        try {
          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta;

            // Content streaming
            if (delta?.content) {
              fullContent += delta.content;
              send("delta", { content: delta.content });
            }

            // Accumulate tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCallsAccum.has(idx)) {
                  toolCallsAccum.set(idx, {
                    id: tc.id || "",
                    name: tc.function?.name || "",
                    arguments: tc.function?.arguments || "",
                  });
                } else {
                  const existing = toolCallsAccum.get(idx)!;
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name = tc.function.name;
                  if (tc.function?.arguments)
                    existing.arguments += tc.function.arguments;
                }
              }
            }

            // Finish reason
            if (chunk.choices[0]?.finish_reason === "tool_calls") {
              // Execute tools and get second response
              const toolResults: ChatCompletionToolMessageParam[] = [];

              for (const [, tc] of toolCallsAccum) {
                send("tool_start", { name: tc.name });

                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(tc.arguments);
                } catch {}

                const { result, toolCard, references } = await executeTool(
                  tc.name as ToolName,
                  args,
                  auth?.userId
                );

                if (toolCard) {
                  send("tool_card", toolCard);
                }

                if (references && references.length > 0) {
                  send("tool_references", references);
                }

                toolResults.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: result,
                });

                send("tool_end", { name: tc.name });
              }

              // Second call with tool results
              const assistantMsg: ChatCompletionAssistantMessageParam = {
                role: "assistant",
                content: fullContent || "",
                tool_calls: Array.from(toolCallsAccum.values()).map((tc) => ({
                  id: tc.id,
                  type: "function" as const,
                  function: { name: tc.name, arguments: tc.arguments },
                })),
              };

              const secondResponse = await client.chat.completions.create({
                model,
                messages: [...chatMessages, assistantMsg, ...toolResults],
                stream: true,
              });

              fullContent = "";
              for await (const chunk2 of secondResponse) {
                const delta2 = chunk2.choices[0]?.delta;
                if (delta2?.content) {
                  fullContent += delta2.content;
                  send("delta", { content: delta2.content });
                }
              }
            }
          }

          // Record usage
          const latencyMs = Date.now() - startMs;
          await recordKeyUsage({
            providerKeyId: keyInfo.id,
            model,
            promptTokens: 0, // estimated, actual from usage headers when available
            completionTokens: 0,
            latencyMs,
            success: true,
          });

          send("done", { content: fullContent });
          controller.close();
        } catch (err) {
          console.error("SSE stream error:", err);
          const latencyMs = Date.now() - startMs;
          await recordKeyUsage({
            providerKeyId: keyInfo.id,
            model,
            promptTokens: 0,
            completionTokens: 0,
            latencyMs,
            success: false,
            errorCode: err instanceof Error ? err.message.slice(0, 100) : "STREAM_ERROR",
          });

          send("error", {
            message: err instanceof Error ? err.message : "Stream error",
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Invalid request format" } },
        { status: 400 }
      );
    }
    console.error("Chat API error:", err);
    const normalized = normalizeAiRouteError(err);
    return Response.json(
      { ok: false, error: { code: normalized.code, message: normalized.message } },
      { status: normalized.status }
    );
  }
}
