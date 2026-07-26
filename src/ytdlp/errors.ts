import { MusicProviderError } from "../music/provider";

export class YtdlpProcessError extends MusicProviderError {
    constructor(
        message: string,
        readonly exitCode?: number,
    ) {
        super(message);
        this.name = "YtdlpProcessError";
    }
}

export class YtdlpValidationError extends MusicProviderError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "YtdlpValidationError";
    }
}
