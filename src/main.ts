import { Client, GatewayIntentBits, REST } from "discord.js";
import { CommandRegistry } from "./bot/commandRegistry";
import { DiscordBot } from "./bot/discordBot";
import { PlayCommand } from "./commands/play";
import { QueueCommand } from "./commands/queue";
import { SkipCommand } from "./commands/skip";
import { StopCommand } from "./commands/stop";
import { type AppConfig, loadConfig } from "./config";
import type { Logger } from "./lib/logger";
import { createPinoLogger } from "./lib/pinoLogger";
import { MusicService } from "./music/play";
import { MusicProviderRegistry } from "./music/providerRegistry";
import { DiscordPlaybackManager } from "./playback/discordPlayback";
import { DiscordVoiceRuntime } from "./playback/discordVoiceRuntime";
import { DiscordPlaybackNotifier } from "./playback/playbackNotifier";
import { SoundCloudClient, SoundCloudProvider } from "./soundcloud";

async function main(config: AppConfig, logger: Logger): Promise<void> {
    logger.info("application.starting", {
        maxPlaylistTracks: config.maxPlaylistTracks,
        maxQueueTracks: config.maxQueueTracks,
    });
    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });
    const rest = new REST({ version: "10" }).setToken(config.discordToken);
    const soundCloud = new SoundCloudProvider(
        new SoundCloudClient({ clientId: config.soundCloudClientId }),
    );
    const providers = new MusicProviderRegistry([soundCloud], soundCloud.id);
    const playback = new DiscordPlaybackManager({
        client,
        sources: providers,
        voice: new DiscordVoiceRuntime(),
        notifier: new DiscordPlaybackNotifier(
            client,
            logger.child({ component: "playback_notifier" }),
        ),
        logger: logger.child({ component: "playback" }),
        maxQueueTracks: config.maxQueueTracks,
    });
    const music = new MusicService(providers, playback, {
        maxPlaylistTracks: config.maxPlaylistTracks,
    });
    const commands = new CommandRegistry([
        new PlayCommand(music),
        new QueueCommand(playback),
        new SkipCommand(playback),
        new StopCommand(playback),
    ]);
    const bot = new DiscordBot({
        client,
        rest,
        commands,
        logger: logger.child({ component: "discord_bot" }),
        registerCommands: config.registerCommands,
    });

    const stop = () => {
        logger.info("application.stopping");
        playback.destroy();
        bot.stop();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    await bot.start(config.discordToken);
}

const config = loadConfig();
const logger = createPinoLogger({
    level: config.logLevel,
    pretty: config.logPretty,
});

main(config, logger).catch((error) => {
    logger.error("application.start_failed", error);
    process.exitCode = 1;
});
