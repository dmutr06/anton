import {
    ApplicationCommandOptionType,
    Client,
    Events,
    GatewayIntentBits,
    REST,
    Routes,
} from "discord.js";
import { OptionType, type Command } from "./command";
import { SkipCommand } from "./commands/skip";
import { StopCommand } from "./commands/stop";
import { PlayCommand } from "./commands/play";
import { PauseCommand } from "./commands/pause";
import { ResumeCommand } from "./commands/resume";
import { NowPlayingCommand } from "./commands/nowplaying";
import { QueueCommand } from "./commands/queue";
import { ClearCommand } from "./commands/clear";
import { LoopCommand } from "./commands/loop";
import { PlayerManager } from "./playerManager";
import { SoundcloudProvider } from "./soundcloud";
import { YtdlpProvider } from "./ytdlp";
import { SpotifyProvider } from "./spotify";

const REFRESH_APPLICATION_COMMANDS = true;

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

    client.login(process.env.TOKEN!);
}

main();
