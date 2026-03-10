export interface VerificationLookupInput {
  email: string;
  purpose: string;
  requestId?: string | null;
}

export interface VerificationRecordInput extends VerificationLookupInput {
  codeHash: string;
  expiresAt: Date;
}

export function buildVerificationLookup<TNow>(
  input: VerificationLookupInput,
  now: TNow,
) {
  return {
    email: input.email,
    purpose: input.purpose,
    requestId: input.requestId ?? null,
    usedAt: null,
    expiresAt: { gt: now },
  };
}

export function buildVerificationRecordInput(
  input: VerificationRecordInput,
) {
  return {
    email: input.email,
    codeHash: input.codeHash,
    purpose: input.purpose,
    requestId: input.requestId ?? null,
    expiresAt: input.expiresAt,
  };
}
