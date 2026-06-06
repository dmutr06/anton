export enum PlayErrorKind {
    NotFound = "NotFound",
    NotAvailable = "NotAvailable",
    Unknown = "Unknown",
}

export class PlayError extends Error {
    readonly kind: PlayErrorKind;
    readonly details?: string;

    constructor(kind: PlayErrorKind, message: string, details?: string) {
        super(message);
        this.name = "PlayError";
        this.kind = kind;
        this.details = details;
    }
}

export function toPlayError(error: unknown): PlayError {
    if (error instanceof PlayError) {
        return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (error && typeof error === "object") {
        const errObj = error as Record<string, unknown>;
        if (typeof errObj.status === "number") {
            const status = errObj.status;
            if (status === 404) {
                return new PlayError(
                    PlayErrorKind.NotFound,
                    "The requested item was not found.",
                    message,
                );
            }
            if (status === 403 || status === 401) {
                return new PlayError(
                    PlayErrorKind.NotAvailable,
                    "Access denied or content not available (unauthorized/geo-blocked).",
                    message,
                );
            }
        }
    }

    const lowerMessage = message.toLowerCase();
    if (
        lowerMessage.includes("not found") ||
        lowerMessage.includes("no search results") ||
        lowerMessage.includes("404")
    ) {
        return new PlayError(PlayErrorKind.NotFound, message);
    }
    if (
        lowerMessage.includes("forbidden") ||
        lowerMessage.includes("block") ||
        lowerMessage.includes("private") ||
        lowerMessage.includes("unauthorized") ||
        lowerMessage.includes("403") ||
        lowerMessage.includes("401")
    ) {
        return new PlayError(PlayErrorKind.NotAvailable, message);
    }

    return new PlayError(PlayErrorKind.Unknown, message);
}
