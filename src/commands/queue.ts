import { EmbedBuilder, MessageFlags } from "discord.js";
import { createCommand } from "../command";
import type { PlayerManager } from "../playerManager";

export type QueueCommandDeps = {
    playerManager: PlayerManager;
};

function formatDuration(seconds: number): string {
    if (seconds <= 0) return "00:00";
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

export const QueueCommand = createCommand(
    "queue",
    "show the current track queue",
    {},
    async (interaction, _, { playerManager }: QueueCommandDeps) => {
        const player = playerManager.getOrCreate(interaction.guildId);
        const currentTrack = player.getCurrentTrack();
        const queue = player.getQueue();

        if (!currentTrack && queue.length === 0) {
            await interaction.reply({
                content: "The queue is currently empty",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor("#3498DB")
            .setTitle("Music Queue");

        const descriptionParts: string[] = [];

        if (currentTrack) {
            descriptionParts.push(
                `**Now Playing:**\n[${currentTrack.track.title}](${currentTrack.track.url ?? ""}) | \`${formatDuration(currentTrack.track.duration)}\`\n`,
            );
        }

        if (queue.length > 0) {
            descriptionParts.push("**Up Next:**");
            const tracksToShow = queue.slice(0, 10);
            for (let i = 0; i < tracksToShow.length; i++) {
                const trackCtx = tracksToShow[i];
                if (trackCtx) {
                    descriptionParts.push(
                        `${i + 1}. [${trackCtx.track.title}](${trackCtx.track.url ?? ""}) | \`${formatDuration(trackCtx.track.duration)}\``,
                    );
                }
            }

            if (queue.length > 10) {
                descriptionParts.push(
                    `\n*And ${queue.length - 10} more track(s)...*`,
                );
            }
        } else {
            descriptionParts.push("No more tracks enqueued.");
        }

        embed.setDescription(descriptionParts.join("\n"));

        await interaction.reply({ embeds: [embed] });
    },
);
