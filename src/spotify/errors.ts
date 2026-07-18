import type { ZodError } from "zod";
import { MusicProviderError } from "../music/provider";

export class SpotifyError extends MusicProviderError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "SpotifyError";
    }
}

export class SpotifyRequestError extends SpotifyError {
    constructor(
        message: string,
        readonly status: number,
        readonly statusText: string,
    ) {
        super(`${message} (${status} ${statusText})`);
        this.name = "SpotifyRequestError";
    }
}

export class SpotifyValidationError extends SpotifyError {
    constructor(
        message: string,
        readonly validationError: ZodError,
    ) {
        super(message, { cause: validationError });
        this.name = "SpotifyValidationError";
    }
}
