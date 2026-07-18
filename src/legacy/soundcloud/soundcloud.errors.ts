import type { ZodError } from "zod";

export class SoundcloudError extends Error {
    constructor(
        message: string,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = "SoundcloudError";
    }
}

export class SoundcloudValidationError extends SoundcloudError {
    constructor(message: string, error: ZodError, data: unknown) {
        super(message, { error, data });
        this.name = "SoundcloudValidationError";
    }
}

export class SoundcloudAPIError extends SoundcloudError {
    constructor(
        message: string,
        public readonly status: number,
        public readonly statusText: string,
    ) {
        super(`${message} (${status} ${statusText})`);
        this.name = "SoundcloudAPIError";
    }
}
