export interface NormalizedAiRouteError {
  status: number;
  code: number;
  message: string;
}

export function normalizeAiRouteError(error: unknown): NormalizedAiRouteError {
  if (error && typeof error === "object") {
    const candidate = error as {
      status?: number;
      message?: string;
      error?: { message?: string };
    };

    const status =
      typeof candidate.status === "number" && candidate.status >= 400
        ? candidate.status
        : 500;

    const message =
      candidate.message?.trim() ||
      candidate.error?.message?.trim() ||
      "Internal Server Error";

    return {
      status,
      code: status,
      message,
    };
  }

  return {
    status: 500,
    code: 500,
    message: "Internal Server Error",
  };
}
