import { EmbedBuilder } from "discord.js";
import type { Track } from "../track";

function formatDuration(seconds: number): string {
    if (seconds <= 0) {
        return "00:00";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    const parts: string[] = [];

    if (hours > 0) {
        parts.push(hours.toString().padStart(2, "0"));
    }

    parts.push(minutes.toString().padStart(2, "0"));
    parts.push(remainingSeconds.toString().padStart(2, "0"));

    return parts.join(":");
}

export function createNowPlayingEmbed(track: Track): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor("#1DB954")
        .setTitle(track.title)
        .setAuthor({ name: `Now Playing` })
        .addFields(
            { name: "Author", value: track.author, inline: true },
            {
                name: "Duration",
                value: `\`${formatDuration(track.duration)}\``,
                inline: true,
            },
        )
        .setTimestamp();

    if (track.url) {
        embed.setURL(track.url);
    }

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }

    embed.setFooter({ text: `Track ID: ${track.id}` });

    return embed;
}

export function createAddedToQueueEmbed(track: Track): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle(track.title)
        .setAuthor({ name: "Added to Queue" })
        .addFields(
            { name: "Author", value: track.author, inline: true },
            {
                name: "Duration",
                value: `\`${formatDuration(track.duration)}\``,
                inline: true,
            },
        )
        .setTimestamp();

    if (track.url) {
        embed.setURL(track.url);
    }

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }

    embed.setFooter({ text: `Track ID: ${track.id}` });

    return embed;
}
