import type { Track } from "./track";

const MINIMUM_SCORE = 60;

export class TrackMatcher {
    queries(track: Track): readonly string[] {
        return [
            `${track.author} - ${track.title}`,
            track.match?.album
                ? `${track.match.album} - ${track.title}`
                : undefined,
            track.title,
            track.match?.isrc,
            ...(track.match?.hints ?? []),
        ].filter((query, index, queries): query is string => {
            return Boolean(query) && queries.indexOf(query) === index;
        });
    }

    score(requested: Track, candidate: Track): number {
        const requestedIsrc = this.normalizeIsrc(requested.match?.isrc);
        const candidateIsrc = this.normalizeIsrc(candidate.match?.isrc);

        if (requestedIsrc && requestedIsrc === candidateIsrc) return 100;

        const title = this.textScore(
            requested.match?.title ?? requested.title,
            candidate.match?.title ?? candidate.title,
            50,
            40,
        );
        const artist = this.textScore(
            requested.match?.artist ?? requested.author,
            candidate.match?.artist ?? candidate.author,
            20,
            15,
        );
        const album =
            requested.match?.album && candidate.match?.album
                ? this.textScore(
                      requested.match.album,
                      candidate.match.album,
                      10,
                      5,
                  )
                : 0;
        const isrcMismatch = requestedIsrc && candidateIsrc ? -30 : 0;

        return (
            title +
            artist +
            album +
            this.durationScore(requested, candidate) +
            isrcMismatch
        );
    }

    accepts(score: number): boolean {
        return score >= MINIMUM_SCORE;
    }

    private textScore(
        expected: string,
        actual: string,
        exactScore: number,
        containedScore: number,
    ): number {
        const left = this.normalizeText(expected);
        const right = this.normalizeText(actual);
        if (!left || !right) return 0;
        if (left === right) return exactScore;
        if (left.includes(right) || right.includes(left)) return containedScore;

        return Math.round(this.tokenSimilarity(left, right) * containedScore);
    }

    private durationScore(requested: Track, candidate: Track): number {
        const difference = Math.abs(requested.duration - candidate.duration);
        if (difference <= 2) return 30;
        if (difference <= 5) return 25;
        if (difference <= 10) return 15;
        if (difference <= 20) return 5;
        return 0;
    }

    private tokenSimilarity(left: string, right: string): number {
        const leftTokens = new Set(left.split(" "));
        const rightTokens = new Set(right.split(" "));
        const matches = [...leftTokens].filter((token) =>
            rightTokens.has(token),
        ).length;
        return matches / Math.max(leftTokens.size, rightTokens.size);
    }

    private normalizeText(value: string): string {
        return value
            .normalize("NFKD")
            .toLowerCase()
            .replace(/\p{M}/gu, "")
            .replace(/ё/g, "е")
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim();
    }

    private normalizeIsrc(value: string | undefined): string | undefined {
        return value?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    }
}
