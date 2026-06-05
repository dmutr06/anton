import { EmbedBuilder } from "discord.js";
import type { Track, Playlist } from "../track";

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
        .setAuthor({ name: "Now Playing" })
        .setTitle(track.title)
        .setDescription(`by **${track.author}**`)
        .addFields(
            {
                name: "Duration",
                value: `\`${formatDuration(track.duration)}\``,
                inline: true,
            },
            {
                name: "Provider",
                value: `\`${track.provider}\``,
                inline: true,
            },
        );

    if (track.url) {
        embed.setURL(track.url);
    }

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }

    return embed;
}

export function createAddedToQueueEmbed(track: Track): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor("#3498DB")
        .setAuthor({ name: "Added to Queue" })
        .setTitle(track.title)
        .setDescription(`by **${track.author}**`)
        .addFields(
            {
                name: "Duration",
                value: `\`${formatDuration(track.duration)}\``,
                inline: true,
            },
            {
                name: "Provider",
                value: `\`${track.provider}\``,
                inline: true,
            },
        );

    if (track.url) {
        embed.setURL(track.url);
    }

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }

    return embed;
}

export function createErrorEmbed(message: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor("#E74C3C")
        .setAuthor({ name: "Error" })
        .setDescription(message);
}

export function createAddedPlaylistToQueueEmbed(
    playlist: Playlist,
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor("#3498DB")
        .setAuthor({ name: "Added Playlist to Queue" })
        .setTitle(playlist.title)
        .setDescription(`by **${playlist.author}**`)
        .addFields(
            {
                name: "Tracks",
                value: `\`${playlist.tracks.length}\``,
                inline: true,
            },
            {
                name: "Provider",
                value: `\`${playlist.provider}\``,
                inline: true,
            },
        );

    if (playlist.url) {
        embed.setURL(playlist.url);
    }

    if (playlist.thumbnail) {
        embed.setThumbnail(playlist.thumbnail);
    }

    return embed;
}
