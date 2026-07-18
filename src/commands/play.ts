import {
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../bot/command";
import { type PlayMusic, PlayMusicError } from "../music/play";
import { createPlayResultEmbed } from "../presentation/playResultEmbed";

const PLAY_TIMEOUT_MS = 20_000;
const AUTOCOMPLETE_TIMEOUT_MS = 2_800;
const MAX_SUGGESTIONS = 25;

export class PlayCommand implements Command {
    readonly data = new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a track")
        .addStringOption((option) =>
            option
                .setName("query")
                .setDescription("Search query or URL")
                .setRequired(true)
                .setAutocomplete(true),
        );

    private readonly autocompleteControllers = new Map<
        string,
        AbortController
    >();

    constructor(private readonly music: PlayMusic) {}

    async execute(
        interaction: ChatInputCommandInteraction<"cached">,
    ): Promise<void> {
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            await interaction.reply({
                content: "You must be in a voice channel to use this command.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const query = interaction.options.getString("query", true).trim();

        if (!query) {
            await interaction.reply({
                content: "Enter a search query or URL.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply();

        const controller = new AbortController();
        const signal = AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(PLAY_TIMEOUT_MS),
        ]);

        try {
            const result = await this.music.enqueue(
                {
                    query,
                    guildId: interaction.guildId,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: interaction.channelId,
                    requestedByUserId: interaction.user.id,
                },
                signal,
            );

            if (signal.aborted) {
                await interaction.editReply(
                    "The request took too long and was cancelled.",
                );
                return;
            }

            await interaction.editReply({
                embeds: [createPlayResultEmbed(result)],
            });
        } catch (error) {
            if (signal.aborted) {
                await interaction.editReply(
                    "The request took too long and was cancelled.",
                );
            } else if (error instanceof PlayMusicError) {
                await interaction.editReply(error.message);
            } else {
                throw error;
            }
        } finally {
            controller.abort();
        }
    }

    async autocomplete(
        interaction: AutocompleteInteraction<"cached">,
    ): Promise<void> {
        const key = `${interaction.guildId}:${interaction.user.id}`;
        this.autocompleteControllers.get(key)?.abort();

        const controller = new AbortController();
        this.autocompleteControllers.set(key, controller);

        const signal = AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(AUTOCOMPLETE_TIMEOUT_MS),
        ]);

        try {
            const focused = interaction.options.getFocused();
            const query = typeof focused === "string" ? focused.trim() : "";
            const suggestions = await this.music.suggest(query, signal);

            if (signal.aborted) return;

            await interaction.respond(
                suggestions.slice(0, MAX_SUGGESTIONS).map((suggestion) => ({
                    name: suggestion.name.slice(0, 100),
                    value: suggestion.value,
                })),
            );
        } catch (error) {
            if (!signal.aborted) throw error;
        } finally {
            if (this.autocompleteControllers.get(key) === controller) {
                this.autocompleteControllers.delete(key);
            }
            controller.abort();
        }
    }
}
