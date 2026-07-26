import { z } from "zod";

const ytdlpEntrySchema = z.object({
    id: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    uploader: z.string().nullable().optional(),
    creator: z.string().nullable().optional(),
    channel: z.string().nullable().optional(),
    duration: z.number().nonnegative().nullable().optional(),
    is_live: z.boolean().optional(),
    live_status: z.string().nullable().optional(),
    webpage_url: z.string().url().nullable().optional(),
    thumbnail: z.string().url().nullable().optional(),
});

export const ytdlpSearchSchema = z.object({
    entries: z.array(ytdlpEntrySchema.nullable()).optional(),
});

export const ytdlpTrackSchema = ytdlpEntrySchema;

export type YtdlpEntry = z.infer<typeof ytdlpEntrySchema>;
