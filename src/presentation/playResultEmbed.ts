import { EmbedBuilder } from "discord.js";
import type { PlayResult } from "../music/play";
import { formatDuration } from "./duration";

export function createPlayResultEmbed(result: PlayResult): EmbedBuilder {
    if (result.kind === "playlist") {
        const { playlist } = result;
        const embed = new EmbedBuilder()
            .setColor("#3498DB")
            .setAuthor({ name: "Added Playlist to Queue" })
            .setTitle(playlist.title)
            .setDescription(`by **${playlist.author}**`)
            .addFields(
                {
                    name: "Tracks",
                    value: `\`${playlist.trackCount}\``,
                    inline: true,
                },
                {
                    name: "Provider",
                    value: `\`${playlist.provider}\``,
                    inline: true,
                },
            )
            .setURL(playlist.url);

        if (playlist.thumbnail) {
            embed.setThumbnail(playlist.thumbnail);
        }

        return embed;
    }

    const { track } = result;
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
        )
        .setURL(track.url);

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }

    return embed;
}
