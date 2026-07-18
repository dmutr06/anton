import type { ZodError } from "zod";

export class SoundCloudError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "SoundCloudError";
    }
}

export class SoundCloudRequestError extends SoundCloudError {
    constructor(
        message: string,
        readonly status: number,
        readonly statusText: string,
    ) {
        super(`${message} (${status} ${statusText})`);
        this.name = "SoundCloudRequestError";
    }
}

export class SoundCloudValidationError extends SoundCloudError {
    constructor(
        message: string,
        readonly validationError: ZodError,
    ) {
        super(message, { cause: validationError });
        this.name = "SoundCloudValidationError";
    }
}
