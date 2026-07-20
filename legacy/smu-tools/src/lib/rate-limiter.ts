/**
 * Simple rate limiter — limits concurrent requests to the academic system
 */

class RateLimiter {
    private queue: (() => void)[] = [];
    private running = 0;
    private maxConcurrent: number;
    private delayMs: number;

    constructor(maxConcurrent = 3, delayMs = 300) {
        this.maxConcurrent = maxConcurrent;
        this.delayMs = delayMs;
    }

    async acquire(): Promise<void> {
        if (this.running < this.maxConcurrent) {
            this.running++;
            return;
        }
        return new Promise<void>((resolve) => {
            this.queue.push(() => {
                this.running++;
                resolve();
            });
        });
    }

    release(): void {
        this.running--;
        if (this.queue.length > 0) {
            const next = this.queue.shift()!;
            next();
        }
    }

    /** Execute a function with rate limiting */
    async run<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            const result = await fn();
            // Add delay between requests
            await new Promise((r) => setTimeout(r, this.delayMs));
            return result;
        } finally {
            this.release();
        }
    }
}

// Global instance: max 3 concurrent sessions, 300ms delay between requests
export const globalLimiter = new RateLimiter(3, 300);

// Ranking-specific limiter: max 1 concurrent, 400ms delay (more conservative)
export const rankingLimiter = new RateLimiter(1, 400);

// Per-student throttle: track last request time per student ID
const studentLastRequest = new Map<string, number>();
const STUDENT_COOLDOWN = 10 * 60 * 1000; // 10 minutes

export function checkStudentThrottle(studentId: string): boolean {
    const last = studentLastRequest.get(studentId);
    if (last && Date.now() - last < STUDENT_COOLDOWN) {
        return false; // throttled
    }
    return true;
}

export function recordStudentRequest(studentId: string): void {
    studentLastRequest.set(studentId, Date.now());
}

// Clean up old entries every 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, time] of studentLastRequest) {
        if (now - time > STUDENT_COOLDOWN * 2) {
            studentLastRequest.delete(id);
        }
    }
}, 30 * 60 * 1000);
