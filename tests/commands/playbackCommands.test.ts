import { describe, expect, test } from "bun:test";
import type {
    ChatInputCommandInteraction,
    InteractionReplyOptions,
} from "discord.js";
import { ClearCommand } from "../../src/commands/clear";
import { LoopCommand } from "../../src/commands/loop";
import { PauseCommand } from "../../src/commands/pause";
import { ResumeCommand } from "../../src/commands/resume";
import type { LoopMode } from "../../src/music/queue";
import type {
    PauseResult,
    PlaybackControl,
    ResumeResult,
} from "../../src/playback/playback";

class TestPlayback implements PlaybackControl {
    pauseResult: PauseResult = "paused";
    resumeResult: ResumeResult = "resumed";
    clearedTracks = 0;
    loopMode: LoopMode = "off";

    skip(): boolean {
        return false;
    }

    stop(): boolean {
        return false;
    }

    pause(): PauseResult {
        return this.pauseResult;
    }

    resume(): ResumeResult {
        return this.resumeResult;
    }

    clear(): number {
        return this.clearedTracks;
    }

    setLoopMode(
        _guildId: string,
        _voiceChannelId: string,
        mode: LoopMode,
    ): boolean {
        this.loopMode = mode;
        return true;
    }
}

function createInteraction(voiceChannelId: string | null = "voice"): {
    interaction: ChatInputCommandInteraction<"cached">;
    replies: InteractionReplyOptions[];
} {
    const replies: InteractionReplyOptions[] = [];
    const interaction = {
        guildId: "guild",
        member: { voice: { channelId: voiceChannelId } },
        async reply(response: InteractionReplyOptions) {
            replies.push(response);
        },
    } as unknown as ChatInputCommandInteraction<"cached">;

    return { interaction, replies };
}

describe("playback commands", () => {
    test("registers playback command data", () => {
        const playback = new TestPlayback();

        expect(new PauseCommand(playback).data.toJSON().name).toBe("pause");
        expect(new ResumeCommand(playback).data.toJSON().name).toBe("resume");
        expect(new ClearCommand(playback).data.toJSON().name).toBe("clear");
        expect(new LoopCommand(playback).data.toJSON()).toMatchObject({
            name: "loop",
            options: [
                {
                    name: "mode",
                    required: true,
                    choices: [
                        { name: "Off", value: "off" },
                        { name: "Current track", value: "track" },
                        { name: "Entire queue", value: "queue" },
                    ],
                },
            ],
        });
    });

    test("reports pause and resume state", async () => {
        const playback = new TestPlayback();
        const pause = createInteraction();
        const resume = createInteraction();

        playback.pauseResult = "already_paused";
        playback.resumeResult = "already_playing";
        await new PauseCommand(playback).execute(pause.interaction);
        await new ResumeCommand(playback).execute(resume.interaction);

        expect(pause.replies[0]?.content).toBe("Playback is already paused.");
        expect(resume.replies[0]?.content).toBe("Playback is already running.");
    });

    test("reports how many upcoming tracks were cleared", async () => {
        const playback = new TestPlayback();
        const { interaction, replies } = createInteraction();
        playback.clearedTracks = 3;

        await new ClearCommand(playback).execute(interaction);

        expect(replies[0]?.content).toBe("Cleared 3 queued tracks.");
    });

    test("requires the user to be in a voice channel", async () => {
        const playback = new TestPlayback();
        const { interaction, replies } = createInteraction(null);

        await new PauseCommand(playback).execute(interaction);

        expect(replies[0]?.content).toBe(
            "You must be in a voice channel to use this command.",
        );
    });

    test("sets the selected loop mode", async () => {
        const playback = new TestPlayback();
        const { interaction, replies } = createInteraction();
        Object.assign(interaction, {
            options: { getString: () => "queue" },
        });

        await new LoopCommand(playback).execute(interaction);

        expect(playback.loopMode).toBe("queue");
        expect(replies[0]?.content).toBe("Loop mode set to **queue**.");
    });
});
