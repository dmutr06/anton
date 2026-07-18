import { describe, expect, test } from "bun:test";
import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../src/bot/command";
import { CommandRegistry } from "../../src/bot/commandRegistry";

function createCommand(name: string): Command {
    return {
        data: new SlashCommandBuilder()
            .setName(name)
            .setDescription(`${name} command`),
        execute: async () => {},
    };
}

describe("CommandRegistry", () => {
    test("finds commands and serializes their builders", () => {
        const play = createCommand("play");
        const registry = new CommandRegistry([play]);

        expect(registry.size).toBe(1);
        expect(registry.get("play")).toBe(play);
        expect(registry.toJSON()).toHaveLength(1);
        expect(registry.toJSON()[0]).toMatchObject({
            name: "play",
            description: "play command",
            options: [],
        });
    });

    test("rejects duplicate command names", () => {
        expect(
            () =>
                new CommandRegistry([
                    createCommand("play"),
                    createCommand("play"),
                ]),
        ).toThrow("Duplicate command: play");
    });
});
