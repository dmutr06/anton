import { Player } from "./player";

export class PlayerManager {
    private players = new Map<string, Player>();

    public getOrCreate(guildId: string) {
        let player = this.players.get(guildId);
        if (player) return player;

        player = new Player(guildId, (id) => this.remove(id));
        this.players.set(guildId, player);

        return player;
    }

    public remove(guildId: string) {
        this.players.delete(guildId);
    }
}
