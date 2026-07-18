import { z } from "zod";

export const soundCloudTrackUrnSchema = z
    .string()
    .regex(/^soundcloud:tracks:\d+$/);

const soundCloudTrackReferenceSchema = z.object({
    urn: soundCloudTrackUrnSchema,
});

const soundCloudTrackReferencesSchema = z
    .array(z.unknown())
    .transform((items) =>
        items.flatMap((item) => {
            const result = soundCloudTrackReferenceSchema.safeParse(item);
            return result.success ? [result.data] : [];
        }),
    );

export const soundCloudUserSchema = z.object({
    username: z.string().catch("Unknown"),
    avatar_url: z.string().url().nullable().optional(),
});

export const soundCloudTranscodingSchema = z.object({
    url: z.string().url(),
    preset: z.string(),
    snipped: z.boolean().optional(),
    format: z.object({
        protocol: z.string(),
        mime_type: z.string().optional(),
    }),
});

export const soundCloudTrackSchema = z.object({
    urn: soundCloudTrackUrnSchema,
    title: z.string(),
    permalink_url: z.string().url(),
    duration: z.number().nonnegative(),
    policy: z.string().optional(),
    artwork_url: z.string().url().nullable().optional(),
    user: soundCloudUserSchema.optional(),
    media: z.object({
        transcodings: z.array(soundCloudTranscodingSchema),
    }),
});

export type SoundCloudTrackData = z.infer<typeof soundCloudTrackSchema>;

export const soundCloudPlaylistSchema = z.object({
    kind: z.literal("playlist"),
    id: z.number().int().positive(),
    title: z.string(),
    permalink_url: z.string().url(),
    artwork_url: z.string().url().nullable().optional(),
    user: soundCloudUserSchema.optional(),
    tracks: soundCloudTrackReferencesSchema,
});

export type SoundCloudPlaylistData = z.infer<typeof soundCloudPlaylistSchema>;

export const soundCloudSearchSchema = z.object({
    collection: z.array(z.unknown()),
});

export const soundCloudChartsSchema = z.object({
    collection: z.array(
        z.object({
            items: z.object({
                collection: z.array(
                    z.object({
                        id: z.number().int().positive(),
                    }),
                ),
            }),
        }),
    ),
});

export const soundCloudPlaylistTracksSchema = z.object({
    tracks: soundCloudTrackReferencesSchema,
});

export const soundCloudTrackListSchema = z.array(z.unknown());

export const soundCloudStreamSchema = z.object({
    url: z.string().url(),
});
