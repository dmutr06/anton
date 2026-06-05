import { z } from "zod";

export const SoundcloudTranscodingSchema = z.object({
    url: z.string().url(),
    format: z.object({
        protocol: z.string(),
    }),
});

export const SoundcloudUserSchema = z.object({
    username: z.string().catch("Unknown"),
    avatar_url: z.string().url().nullable().optional(),
});

export const SoundcloudRawTrackSchema = z
    .object({
        id: z.number(),
        title: z.string(),
        permalink_url: z.string(),
        duration: z.number(),
        artwork_url: z.string().nullable().optional(),
        policy: z.string(),
        user: SoundcloudUserSchema.optional(),
        media: z.object({
            transcodings: z.array(SoundcloudTranscodingSchema),
        }),
    })
    .refine(
        (track) => {
            if (track.policy !== "ALLOW") {
                return false;
            }
            const progressive = track.media.transcodings.find(
                (t) => t.format.protocol === "progressive",
            );
            return !!progressive && !!progressive.url;
        },
        {
            message:
                "Track must have ALLOW policy and a valid progressive transcoding format",
        },
    );

export type SoundcloudRawTrack = z.infer<typeof SoundcloudRawTrackSchema>;

export const SoundcloudSearchResponseSchema = z.object({
    collection: z.array(z.unknown()),
});

export const SoundcloudChartsResponseSchema = z.object({
    collection: z.array(
        z.object({
            items: z.object({
                collection: z.array(
                    z.object({
                        id: z.union([z.number(), z.string()]),
                    }),
                ),
            }),
        }),
    ),
});

export const SoundcloudPlaylistResponseSchema = z.object({
    tracks: z.array(
        z.object({
            id: z.union([z.number(), z.string()]),
        }),
    ),
});

export const SoundcloudStreamResponseSchema = z.object({
    url: z.string().url(),
});

export const SoundcloudRawPlaylistSchema = z.object({
    kind: z.literal("playlist"),
    title: z.string(),
    permalink_url: z.string(),
    artwork_url: z.string().nullable().optional(),
    user: SoundcloudUserSchema.optional(),
    tracks: z.array(
        z.object({
            id: z.number(),
        }),
    ),
});

export type SoundcloudRawPlaylist = z.infer<typeof SoundcloudRawPlaylistSchema>;
