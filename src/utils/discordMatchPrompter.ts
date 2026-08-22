import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type ChatInputCommandInteraction,
    StringSelectMenuBuilder,
} from "discord.js";
import type { MatchPrompter } from "../provider";
import type { Track } from "../track";
import { createMatchPromptEmbed } from "./trackEmbeds";

export class DiscordMatchPrompter implements MatchPrompter {
    constructor(private readonly interaction: ChatInputCommandInteraction) {}

    private formatDuration(seconds: number): string {
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

    public async prompt(
        track: Track,
        providerName: string,
        choices: Track[],
        hasNextProvider: boolean,
    ): Promise<
        | { type: "select"; index: number }
        | { type: "switch" }
        | { type: "cancel" }
    > {
        const channel = this.interaction.channel;
        if (!channel || !channel.isSendable()) {
            return { type: "cancel" };
        }

        const embed = createMatchPromptEmbed(track, providerName, choices);
        const components: any[] = [];

        if (choices.length > 0) {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId("select_track")
                .setPlaceholder("Choose a track to play...")
                .addOptions(
                    choices.slice(0, 10).map((r, idx) => ({
                        label: r.title.slice(0, 100),
                        description:
                            `${r.author} (${this.formatDuration(r.duration)})`.slice(
                                0,
                                100,
                            ),
                        value: `track_${idx}`,
                    })),
                );
            components.push(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    selectMenu,
                ),
            );
        }

        const buttons: ButtonBuilder[] = [];
        if (hasNextProvider) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId("switch_provider")
                    .setLabel("Switch to Next Provider")
                    .setStyle(ButtonStyle.Primary),
            );
        }

        buttons.push(
            new ButtonBuilder()
                .setCustomId("cancel_search")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger),
        );

        components.push(
            new ActionRowBuilder<ButtonBuilder>().addComponents(buttons),
        );

        const message = await channel.send({
            embeds: [embed],
            components,
        });

        try {
            const response = await message.awaitMessageComponent({
                filter: (i) => i.user.id === this.interaction.user.id,
                time: 30000,
            });

            await response.deferUpdate();

            if (
                response.customId === "select_track" &&
                response.isStringSelectMenu()
            ) {
                const selectedValue = response.values[0];
                const index = parseInt(selectedValue.replace("track_", ""), 10);

                await message.edit({
                    embeds: [
                        embed
                            .setColor("#2ECC71") // Green
                            .setTitle(`Match selected: ${choices[index].title}`)
                            .setDescription(
                                `Playing: **${choices[index].title}** by **${choices[index].author}**`,
                            ),
                    ],
                    components: [],
                });

                return { type: "select", index };
            }

            if (response.customId === "switch_provider") {
                await message.delete().catch(() => {});
                return { type: "switch" };
            }

            if (response.customId === "cancel_search") {
                await message.edit({
                    content: "Playback search cancelled.",
                    embeds: [],
                    components: [],
                });
                return { type: "cancel" };
            }
        } catch (_error) {
            await message.edit({
                content:
                    "Timed out or encountered an error waiting for choice.",
                embeds: [],
                components: [],
            });
            return { type: "cancel" };
        }

        return { type: "cancel" };
    }
}
