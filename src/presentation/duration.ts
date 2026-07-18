export function formatDuration(seconds: number): string {
    if (seconds <= 0) return "00:00";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const parts = [
        minutes.toString().padStart(2, "0"),
        remainingSeconds.toString().padStart(2, "0"),
    ];

    if (hours > 0) {
        parts.unshift(hours.toString().padStart(2, "0"));
    }

    return parts.join(":");
}
