import {
    type ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../bot/command";
import type { QueueReader, QueueTrack } from "../music/queue";
import { formatDuration } from "../presentation/duration";

const MAX_VISIBLE_TRACKS = 10;

function formatTrack(track: QueueTrack): string {
    return `[${track.title}](${track.url}) | \`${formatDuration(track.duration)}\``;
}

export class QueueCommand implements Command {
    readonly data = new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Show the current track queue");

    constructor(private readonly queueReader: QueueReader) {}

    async execute(
        interaction: ChatInputCommandInteraction<"cached">,
    ): Promise<void> {
        const queue = await this.queueReader.getQueue(interaction.guildId);

        if (!queue.current && queue.upcoming.length === 0) {
            await interaction.reply({
                content: "The queue is currently empty",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const description: string[] = [];

        if (queue.current) {
            description.push(
                `**Now Playing:**\n${formatTrack(queue.current)}\n`,
            );
        }

        if (queue.upcoming.length > 0) {
            description.push("**Up Next:**");

            for (const [index, track] of queue.upcoming
                .slice(0, MAX_VISIBLE_TRACKS)
                .entries()) {
                description.push(`${index + 1}. ${formatTrack(track)}`);
            }

            const hiddenTracks = queue.upcoming.length - MAX_VISIBLE_TRACKS;
            if (hiddenTracks > 0) {
                description.push(`\n*And ${hiddenTracks} more track(s)...*`);
            }
        } else {
            description.push("No more tracks enqueued.");
        }

        const embed = new EmbedBuilder()
            .setColor("#3498DB")
            .setTitle("Music Queue")
            .setDescription(description.join("\n"))
            .setFooter({
                text: `Loop Mode: ${queue.loopMode.toUpperCase()} | Queue Size: ${queue.upcoming.length} track(s)`,
            });

        await interaction.reply({ embeds: [embed] });
    }
}
