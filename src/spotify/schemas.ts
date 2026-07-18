import { z } from "zod";

const spotifyImageSchema = z.object({ url: z.string().url() });
const spotifyArtistSchema = z.object({ name: z.string() });

export const spotifyTokenSchema = z.object({
    access_token: z.string(),
    expires_in: z.number().positive(),
});

export const spotifyTrackSchema = z.object({
    id: z.string(),
    name: z.string(),
    duration_ms: z.number().nonnegative(),
    external_urls: z.object({ spotify: z.string().url() }),
    artists: z.array(spotifyArtistSchema),
    external_ids: z.object({ isrc: z.string().optional() }).optional(),
    album: z
        .object({
            name: z.string().optional(),
            images: z.array(spotifyImageSchema).optional(),
        })
        .optional(),
});

export type SpotifyTrackData = z.infer<typeof spotifyTrackSchema>;

export const spotifyTrackPageSchema = z.object({
    items: z.array(spotifyTrackSchema),
    next: z.string().url().nullable().optional(),
});

export const spotifyAlbumSchema = z.object({
    name: z.string(),
    artists: z.array(spotifyArtistSchema),
    external_urls: z.object({ spotify: z.string().url() }),
    images: z.array(spotifyImageSchema).optional(),
    tracks: spotifyTrackPageSchema,
});

export type SpotifyAlbumData = Omit<
    z.infer<typeof spotifyAlbumSchema>,
    "tracks"
> & {
    tracks: readonly SpotifyTrackData[];
};

const spotifyPlaylistEntrySchema = z
    .union([
        z.object({ item: spotifyTrackSchema.nullable().catch(null) }),
        z.object({ track: spotifyTrackSchema.nullable().catch(null) }),
    ])
    .transform((entry) => ("item" in entry ? entry.item : entry.track));

export const spotifyPlaylistPageSchema = z.object({
    items: z.array(spotifyPlaylistEntrySchema),
    next: z.string().url().nullable().optional(),
});

export const spotifyPlaylistSchema = z.object({
    name: z.string(),
    owner: z.object({ display_name: z.string().nullable() }).optional(),
    external_urls: z.object({ spotify: z.string().url() }),
    images: z.array(spotifyImageSchema).optional(),
    items: spotifyPlaylistPageSchema.optional(),
    tracks: spotifyPlaylistPageSchema.optional(),
});

export type SpotifyPlaylistData = Omit<
    z.infer<typeof spotifyPlaylistSchema>,
    "items" | "tracks"
> & {
    tracks: readonly SpotifyTrackData[];
};
