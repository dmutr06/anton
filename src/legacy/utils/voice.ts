import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import type { Player } from "../player";

export async function validateVoice(
    interaction: ChatInputCommandInteraction<"cached">,
    player: Player,
): Promise<boolean> {
    const memberChannel = interaction.member.voice.channel;
    if (!memberChannel) {
        await interaction.reply({
            content: "You must be in a voice channel to use this command.",
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }

    const botChannel = player.getVoiceChannel();
    if (botChannel && memberChannel.id !== botChannel.id) {
        await interaction.reply({
            content: `You must be in the same voice channel as the bot (${botChannel.name}) to use this command.`,
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }

    return true;
}
