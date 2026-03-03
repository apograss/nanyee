import { NextRequest } from "next/server";
import { verifyApiToken, isModelAllowed, recordTokenUsage } from "@/lib/tokens/verify";
import { createAIClient, DEFAULT_MODEL, AVAILABLE_MODELS } from "@/lib/ai/client";
import { selectProviderKey, recordKeyUsage } from "@/lib/keys/selector";
import { z } from "zod";

const completionSchema = z.object({
  model: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).optional(),
});

// POST /api/v1/chat/completions — OpenAI compatible endpoint
export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const token = await verifyApiToken(req.headers.get("authorization"));

  if (!token) {
    return Response.json(
      { error: { message: "Invalid API key", type: "invalid_request_error" } },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const data = completionSchema.parse(body);
    const model = data.model || DEFAULT_MODEL;

    // Check model access
    if (!isModelAllowed(token, model)) {
      return Response.json(
        { error: { message: `Model ${model} not allowed for this token`, type: "invalid_request_error" } },
        { status: 403 }
      );
    }

    // Check if model exists
    if (!AVAILABLE_MODELS.includes(model)) {
      return Response.json(
        { error: { message: `Model ${model} not found`, type: "invalid_request_error" } },
        { status: 404 }
      );
    }

    // Select provider key
    const keyInfo = await selectProviderKey();
    if (!keyInfo) {
      return Response.json(
        { error: { message: "No available upstream keys", type: "server_error" } },
        { status: 503 }
      );
    }

    const client = createAIClient(keyInfo.apiKey);

    if (data.stream) {
      // Stream response
      const response = await client.chat.completions.create({
        model,
        messages: data.messages,
        stream: true,
        temperature: data.temperature,
        max_tokens: data.max_tokens,
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of response) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
              );
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));

            const latencyMs = Date.now() - startMs;
            await Promise.all([
              recordKeyUsage({
                providerKeyId: keyInfo.id,
                apiTokenId: token.id,
                model,
                promptTokens: 0,
                completionTokens: 0,
                latencyMs,
                success: true,
              }),
              recordTokenUsage({
                apiTokenId: token.id,
                endpoint: "/v1/chat/completions",
                model,
                promptTokens: 0,
                completionTokens: 0,
                success: true,
                responseMs: latencyMs,
                clientIp: req.headers.get("x-forwarded-for") || undefined,
                userAgent: req.headers.get("user-agent") || undefined,
              }),
            ]);

            controller.close();
          } catch (err) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  error: { message: err instanceof Error ? err.message : "Stream error" },
                })}\n\n`
              )
            );
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
    }

    // Non-stream response
    const response = await client.chat.completions.create({
      model,
      messages: data.messages,
      temperature: data.temperature,
      max_tokens: data.max_tokens,
    });

    const latencyMs = Date.now() - startMs;
    const usage = response.usage;

    await Promise.all([
      recordKeyUsage({
        providerKeyId: keyInfo.id,
        apiTokenId: token.id,
        model,
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        latencyMs,
        success: true,
      }),
      recordTokenUsage({
        apiTokenId: token.id,
        endpoint: "/v1/chat/completions",
        model,
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        success: true,
        responseMs: latencyMs,
        clientIp: req.headers.get("x-forwarded-for") || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      }),
    ]);

    return Response.json(response);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: { message: "Invalid request format", type: "invalid_request_error" } },
        { status: 400 }
      );
    }

    const latencyMs = Date.now() - startMs;
    await recordTokenUsage({
      apiTokenId: token.id,
      endpoint: "/v1/chat/completions",
      model: "unknown",
      promptTokens: 0,
      completionTokens: 0,
      success: false,
      errorCode: err instanceof Error ? err.message.slice(0, 100) : "UNKNOWN",
      responseMs: latencyMs,
      clientIp: req.headers.get("x-forwarded-for") || undefined,
    });

    return Response.json(
      { error: { message: "Internal server error", type: "server_error" } },
      { status: 500 }
    );
  }
}
