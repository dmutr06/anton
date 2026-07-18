import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";
import type { Command } from "./command";

export class CommandRegistry {
    private readonly commands = new Map<string, Command>();

    constructor(commands: readonly Command[]) {
        for (const command of commands) {
            const name = command.data.name;

            if (this.commands.has(name)) {
                throw new TypeError(`Duplicate command: ${name}`);
            }

            this.commands.set(name, command);
        }
    }

    get size(): number {
        return this.commands.size;
    }

    get(name: string): Command | undefined {
        return this.commands.get(name);
    }

    toJSON(): RESTPostAPIApplicationCommandsJSONBody[] {
        return Array.from(this.commands.values(), (command) =>
            command.data.toJSON(),
        );
    }
}
