import {
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    type Client,
    Events,
    type Interaction,
    MessageFlags,
    type REST,
    Routes,
} from "discord.js";
import type { Logger } from "../lib/logger";
import type { CommandRegistry } from "./commandRegistry";

export type DiscordBotDependencies = {
    client: Client;
    rest: REST;
    commands: CommandRegistry;
    logger: Logger;
    registerCommands: boolean;
};

export class DiscordBot {
    constructor(private readonly dependencies: DiscordBotDependencies) {}

    async start(token: string): Promise<void> {
        const { client, logger } = this.dependencies;

        logger.info("discord.login_started");

        client.once(Events.ClientReady, (readyClient) => {
            void this.handleReady(
                readyClient.user.id,
                readyClient.user.tag,
            ).catch((error) => {
                logger.error("discord.initialization_failed", error);
            });
        });

        client.on(Events.InteractionCreate, (interaction) => {
            void this.handleInteraction(interaction).catch(() => {
                void this.handleInteractionError(interaction);
            });
        });

        await client.login(token);
    }

    stop(): void {
        this.dependencies.client.destroy();
        this.dependencies.logger.info("discord.stopped");
    }

    private async handleReady(
        applicationId: string,
        userTag: string,
    ): Promise<void> {
        const { commands, logger, registerCommands, rest } = this.dependencies;

        if (registerCommands && commands.size > 0) {
            await rest.put(Routes.applicationCommands(applicationId), {
                body: commands.toJSON(),
            });
            logger.info("discord.commands_registered", {
                commandCount: commands.size,
            });
        } else if (registerCommands) {
            logger.warn("discord.command_registration_skipped", {
                reason: "empty_registry",
            });
        }

        logger.info("discord.ready", { applicationId, userTag });
    }

    private async handleInteraction(interaction: Interaction): Promise<void> {
        if (!interaction.inCachedGuild()) return;
        if (
            !interaction.isChatInputCommand() &&
            !interaction.isAutocomplete()
        ) {
            return;
        }

        const kind = interaction.isChatInputCommand()
            ? "command"
            : "autocomplete";

        const logger = this.dependencies.logger.child({
            command: interaction.commandName,
            guildId: interaction.guildId,
            interactionId: interaction.id,
            interactionKind: kind,
            userId: interaction.user.id,
        });
        const startedAt = performance.now();

        if (kind === "command") logger.info("interaction.started");
        else logger.debug("interaction.started");

        try {
            await this.dispatchInteraction(interaction, logger);
        } catch (error) {
            logger.error("interaction.failed", error, {
                durationMs: Math.round(performance.now() - startedAt),
            });
            throw error;
        }

        const context = {
            durationMs: Math.round(performance.now() - startedAt),
        };
        if (kind === "command") logger.info("interaction.completed", context);
        else logger.debug("interaction.completed", context);
    }

    private async dispatchInteraction(
        interaction:
            | ChatInputCommandInteraction<"cached">
            | AutocompleteInteraction<"cached">,
        logger: Logger,
    ): Promise<void> {
        const command = this.dependencies.commands.get(interaction.commandName);

        if (!command) {
            logger.warn("interaction.command_missing");
            if (interaction.isAutocomplete()) await interaction.respond([]);
            return;
        }

        if (interaction.isChatInputCommand()) {
            await command.execute(interaction);
            return;
        }

        if (!command.autocomplete) {
            await interaction.respond([]);
            return;
        }

        await command.autocomplete(interaction);
    }

    private async handleInteractionError(
        interaction: Interaction,
    ): Promise<void> {
        try {
            if (interaction.isAutocomplete()) {
                await this.respondToAutocompleteError(interaction);
                return;
            }

            if (interaction.isChatInputCommand()) {
                await this.respondToCommandError(interaction);
            }
        } catch (responseError) {
            this.dependencies.logger.error(
                "interaction.error_response_failed",
                responseError,
                { interactionId: interaction.id },
            );
        }
    }

    private async respondToAutocompleteError(
        interaction: AutocompleteInteraction,
    ): Promise<void> {
        if (!interaction.responded) {
            await interaction.respond([]);
        }
    }

    private async respondToCommandError(
        interaction: ChatInputCommandInteraction,
    ): Promise<void> {
        const response = {
            content: "Something went wrong while executing this command.",
            flags: MessageFlags.Ephemeral,
        } as const;

        if (interaction.deferred) {
            await interaction.editReply({ content: response.content });
        } else if (interaction.replied) {
            await interaction.followUp(response);
        } else {
            await interaction.reply(response);
        }
    }
}
