import type { ZodError } from "zod";

export class SpotifyError extends Error {
    constructor(
        message: string,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = "SpotifyError";
    }
}

export class SpotifyValidationError extends SpotifyError {
    constructor(message: string, error: ZodError, data: unknown) {
        super(message, { error, data });
        this.name = "SpotifyValidationError";
    }
}

export class SpotifyAPIError extends SpotifyError {
    constructor(
        message: string,
        public readonly status: number,
        public readonly statusText: string,
    ) {
        super(`${message} (${status} ${statusText})`);
        this.name = "SpotifyAPIError";
    }
}
