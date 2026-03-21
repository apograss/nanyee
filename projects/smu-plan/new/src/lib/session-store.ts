/**
 * In-memory store for temporary captcha sessions.
 * Maps a random session ID → the Set-Cookie strings from UIS,
 * so we can attach them to the subsequent login request.
 *
 * Sessions are auto-cleaned after 5 minutes.
 */

interface CaptchaSession {
    cookies: string[];
    createdAt: number;
}

const store = new Map<string, CaptchaSession>();

const SESSION_TTL = 5 * 60 * 1000; // 5 min

// Clean up expired sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [id, s] of store) {
        if (now - s.createdAt > SESSION_TTL) store.delete(id);
    }
}, 60_000);

export function createSession(cookies: string[]): string {
    const id = crypto.randomUUID();
    store.set(id, { cookies, createdAt: Date.now() });
    return id;
}

export function getSession(id: string): string[] | null {
    const s = store.get(id);
    if (!s) return null;
    return s.cookies;
}

export function replaceSession(id: string, cookies: string[]): void {
    const existing = store.get(id);
    if (!existing) return;
    store.set(id, { cookies, createdAt: Date.now() });
}

export function createImportedSession(cookies: string[]): string {
    return createSession(cookies);
}

export function deleteSession(id: string): void {
    store.delete(id);
}
