import type { ZodError } from "zod";
import { MusicProviderError } from "../music/provider";

export class SoundCloudRequestError extends MusicProviderError {
    constructor(
        message: string,
        readonly status: number,
        readonly statusText: string,
    ) {
        super(`${message} (${status} ${statusText})`);
        this.name = "SoundCloudRequestError";
    }
}

export class SoundCloudValidationError extends MusicProviderError {
    constructor(
        message: string,
        readonly validationError: ZodError,
    ) {
        super(message, { cause: validationError });
        this.name = "SoundCloudValidationError";
    }
}
