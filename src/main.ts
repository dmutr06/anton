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
import { PlayerManager } from "./playerManager";
import { SoundcloudProvider } from "./providers/soundcloud";

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
        console.log(cmd.autocomplete);
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
                          autocomplete: opt.autocomplete ?? false,
                      }))
                    : [],
        };
    });
}

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
    await soundcloudProvider.loadClientId();

    const providers = [soundcloudProvider];

    const playerManager = new PlayerManager(providers);

    const commands: Command[] = [
        new PlayCommand({ playerManager }),
        new StopCommand({ playerManager }),
        new SkipCommand({ playerManager }),
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
        if (!interaction.inCachedGuild())
            return;

        if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) {
            return;
        }

        const cmd = commands.find((c) => c.name === interaction.commandName);
        if (!cmd) return;

        if (interaction.isChatInputCommand()) {
            await cmd.run(interaction);
        } else {
            await cmd.autocomplete?.(interaction);
        }

    });

    client.login(process.env.TOKEN!);
}

main();
