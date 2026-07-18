import type {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

export type CommandBuilder =
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;

export interface Command {
    readonly data: CommandBuilder;

    execute(interaction: ChatInputCommandInteraction<"cached">): Promise<void>;

    autocomplete?(
        interaction: AutocompleteInteraction<"cached">,
    ): Promise<void>;
}
