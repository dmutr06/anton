import type { Provider } from "./provider";
import { Player } from "./player";

export class PlayerManager {
    private players = new Map<string, Player>();

    constructor(public readonly providers: Provider[]) {}

    public getOrCreate(guildId: string) {
        let player = this.players.get(guildId);
        if (player) return player;

        player = new Player(this.providers);
        this.players.set(guildId, player);

        return player;
    }

    public remove(guildId: string) {
        this.players.delete(guildId);
    }
}
