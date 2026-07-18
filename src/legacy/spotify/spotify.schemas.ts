import { z } from "zod";

export const SpotifyTokenResponseSchema = z.object({
    access_token: z.string(),
    token_type: z.string(),
    expires_in: z.number(),
});

export const SpotifyArtistSchema = z.object({
    name: z.string(),
});

export const SpotifyTrackSchema = z.object({
    id: z.string(),
    name: z.string(),
    duration_ms: z.number(),
    external_urls: z.object({
        spotify: z.string(),
    }),
    artists: z.array(SpotifyArtistSchema),
    album: z
        .object({
            images: z
                .array(
                    z.object({
                        url: z.string().url(),
                    }),
                )
                .optional(),
        })
        .optional(),
});

export type SpotifyRawTrack = z.infer<typeof SpotifyTrackSchema>;

export const SpotifyAlbumSchema = z.object({
    name: z.string(),
    artists: z.array(SpotifyArtistSchema),
    external_urls: z.object({
        spotify: z.string(),
    }),
    images: z
        .array(
            z.object({
                url: z.string().url(),
            }),
        )
        .optional(),
    tracks: z.object({
        items: z.array(
            z.object({
                id: z.string(),
                name: z.string(),
                duration_ms: z.number(),
                external_urls: z.object({
                    spotify: z.string(),
                }),
                artists: z.array(SpotifyArtistSchema),
            }),
        ),
    }),
});

export type SpotifyRawAlbum = z.infer<typeof SpotifyAlbumSchema>;

export const SpotifyPlaylistSchema = z.object({
    name: z.string(),
    owner: z
        .object({
            display_name: z.string().catch("Unknown"),
        })
        .optional(),
    external_urls: z.object({
        spotify: z.string(),
    }),
    images: z
        .array(
            z.object({
                url: z.string().url(),
            }),
        )
        .optional(),
    tracks: z.object({
        items: z.array(
            z.object({
                track: SpotifyTrackSchema.nullable(),
            }),
        ),
    }),
});

export type SpotifyRawPlaylist = z.infer<typeof SpotifyPlaylistSchema>;

export const SpotifySearchResponseSchema = z.object({
    tracks: z.object({
        items: z.array(SpotifyTrackSchema),
    }),
});
