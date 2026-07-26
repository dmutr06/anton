import { Client, GatewayIntentBits, REST } from "discord.js";
import { CommandRegistry } from "./bot/commandRegistry";
import { DiscordBot } from "./bot/discordBot";
import { ClearCommand } from "./commands/clear";
import { LoopCommand } from "./commands/loop";
import { PauseCommand } from "./commands/pause";
import { PlayCommand } from "./commands/play";
import { QueueCommand } from "./commands/queue";
import { ResumeCommand } from "./commands/resume";
import { SkipCommand } from "./commands/skip";
import { StopCommand } from "./commands/stop";
import { type AppConfig, loadConfig } from "./config";
import type { Logger } from "./lib/logger";
import { createPinoLogger } from "./lib/pinoLogger";
import { MusicService } from "./music/play";
import { MusicProviderRegistry } from "./music/providerRegistry";
import { SearchAudioSourceResolver } from "./music/searchAudioSource";
import { DiscordPlaybackManager } from "./playback/discordPlayback";
import { DiscordVoiceRuntime } from "./playback/discordVoiceRuntime";
import { DiscordPlaybackNotifier } from "./playback/playbackNotifier";
import { SoundCloudClient } from "./soundcloud/client";
import { SoundCloudProvider } from "./soundcloud/provider";
import { SpotifyClient } from "./spotify/client";
import { SpotifyProvider } from "./spotify/provider";
import { YtdlpClient } from "./ytdlp/client";
import { YtdlpProvider } from "./ytdlp/provider";

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
    const ytdlp = new YtdlpProvider(
        new YtdlpClient({ executable: config.ytdlpPath }),
    );
    const spotify = config.spotify
        ? new SpotifyProvider(
              new SpotifyClient(config.spotify),
              new SearchAudioSourceResolver([soundCloud]),
          )
        : null;
    const providers = new MusicProviderRegistry(
        spotify ? [soundCloud, ytdlp, spotify] : [soundCloud, ytdlp],
        soundCloud.id,
    );
    logger.info("ytdlp.provider_configured", {
        executable: config.ytdlpPath,
    });
    logger.info("spotify.provider_configured", {
        enabled: spotify !== null,
    });
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
        new PauseCommand(playback),
        new ResumeCommand(playback),
        new ClearCommand(playback),
        new LoopCommand(playback),
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
