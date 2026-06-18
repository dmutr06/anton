import { MessageFlags } from "discord.js";
import { createCommand, OptionType } from "../command";
import type { PlayerManager } from "../playerManager";
import { LoopMode } from "../player";

export type LoopCommandDeps = {
    playerManager: PlayerManager;
};

export const LoopCommand = createCommand(
    "loop",
    "set the queue loop mode",
    {
        mode: {
            type: OptionType.String,
            description: "loop mode (off, track, queue)",
            required: false,
            autocomplete: true,
        },
    },
    async (interaction, { mode }, { playerManager }: LoopCommandDeps) => {
        const player = playerManager.getOrCreate(interaction.guildId);

        if (!mode) {
            const currentMode = player.getLoopMode();
            await interaction.reply({
                content: `Current loop mode is **${currentMode}**`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const validModes = Object.values(LoopMode);
        const selectedMode = mode.toLowerCase() as LoopMode;

        if (!validModes.includes(selectedMode)) {
            await interaction.reply({
                content:
                    "Invalid loop mode. Choose one of: `off`, `track`, `queue`",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        player.setLoopMode(selectedMode);
        await interaction.reply(`Loop mode set to **${selectedMode}**`);
    },
    async (interaction) => {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "mode") return;

        const val = focused.value.toLowerCase();
        const choices = [
            { name: "Off - disable looping", value: "off" },
            { name: "Track - repeat the current track", value: "track" },
            { name: "Queue - repeat the entire queue", value: "queue" },
        ];

        const filtered = choices.filter(
            (c) => c.value.includes(val) || c.name.toLowerCase().includes(val),
        );

        try {
            await interaction.respond(filtered.slice(0, 25));
        } catch (err) {
            console.error("Failed to respond to loop autocomplete:", err);
        }
    },
);
