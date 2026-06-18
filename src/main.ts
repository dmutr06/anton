import {
    ApplicationCommandOptionType,
    Client,
    Events,
    GatewayIntentBits,
    REST,
    Routes,
} from "discord.js";
import { type Command, OptionType } from "./command";
import { ClearCommand } from "./commands/clear";
import { LoopCommand } from "./commands/loop";
import { NowPlayingCommand } from "./commands/nowplaying";
import { PauseCommand } from "./commands/pause";
import { PlayCommand } from "./commands/play";
import { QueueCommand } from "./commands/queue";
import { ResumeCommand } from "./commands/resume";
import { SkipCommand } from "./commands/skip";
import { StopCommand } from "./commands/stop";
import { PlayerManager } from "./playerManager";
import { SoundcloudProvider } from "./soundcloud";
import { SpotifyProvider } from "./spotify";
import { YtdlpProvider } from "./ytdlp";

const REFRESH_APPLICATION_COMMANDS = process.argv.includes("--register");

export function optionTypeToDiscordType(
    type: OptionType,
): ApplicationCommandOptionType {
    switch (type) {
        case OptionType.Number:
            return ApplicationCommandOptionType.Number;
        case OptionType.String:
            return ApplicationCommandOptionType.String;
        case OptionType.Bool:
            return ApplicationCommandOptionType.Boolean;
    }
}

function commandsToApplicationCommandsData(commands: Command[]) {
    return commands.map((cmd) => {
        const opts = Object.entries(cmd.options);
        return {
            name: cmd.name,
            description: cmd.description,
            options:
                opts.length > 0
                    ? opts.map(([name, opt]) => ({
                          name,
                          description: opt.description,
                          type: optionTypeToDiscordType(opt.type),
                          required: opt.required ?? false,
                          autocomplete: !!opt.autocomplete,
                          choices: opt.choices,
                      }))
                    : [],
        };
    });
}

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

async function main() {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN!);
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildVoiceStates,
        ],
    });

    const soundcloudProvider = new SoundcloudProvider();
    const ytdlpProvider = new YtdlpProvider();
    const spotifyProvider = new SpotifyProvider(soundcloudProvider);

    const playerManager = new PlayerManager();

    const commands: Command[] = [
        new PlayCommand({
            playerManager,
            providers: [soundcloudProvider, ytdlpProvider, spotifyProvider],
            defaultProvider: soundcloudProvider,
        }),
        new StopCommand({ playerManager }),
        new SkipCommand({ playerManager }),
        new PauseCommand({ playerManager }),
        new ResumeCommand({ playerManager }),
        new NowPlayingCommand({ playerManager }),
        new QueueCommand({ playerManager }),
        new ClearCommand({ playerManager }),
        new LoopCommand({ playerManager }),
    ];

    client.on(Events.ClientReady, async (client) => {
        if (REFRESH_APPLICATION_COMMANDS) {
            try {
                console.log("started refreshing application (/) commands");

                await rest.put(Routes.applicationCommands(client.user.id), {
                    body: commandsToApplicationCommandsData(commands),
                });

                console.log("successfully reloaded application (/) commands");
            } catch (e) {
                console.error(e);
            }
        }

        console.log(`logged in as ${client.user.tag}`);
    });

    client.on(Events.InteractionCreate, async (interaction) => {
        try {
            if (!interaction.inCachedGuild()) return;

            if (
                !interaction.isChatInputCommand() &&
                !interaction.isAutocomplete()
            ) {
                return;
            }

            const cmd = commands.find(
                (c) => c.name === interaction.commandName,
            );
            if (!cmd) return;

            if (interaction.isChatInputCommand()) {
                await cmd.run(interaction);
            } else {
                await cmd.autocomplete?.(interaction);
            }
        } catch (e) {
            console.error("Error executing interaction:", e);
        }
    });

    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
        try {
            const guildId = oldState.guild.id;
            const player = playerManager.getOrCreate(guildId);
            const botChannel = player.getVoiceChannel();

            if (!botChannel) return;

            if (newState.id === client.user?.id && !newState.channelId) {
                player.disconnect();
                return;
            }

            const nonBots = botChannel.members.filter((m) => !m.user.bot);
            if (nonBots.size === 0) {
                player.disconnect();
            }
        } catch (e) {
            console.error("Error handling voice state update:", e);
        }
    });

    client.login(process.env.TOKEN!);
}

main();
