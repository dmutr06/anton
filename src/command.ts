import type { ChatInputCommandInteraction } from "discord.js";
import { z } from "zod";

export enum OptionType {
    Number = "number",
    String = "string",
    Bool = "boolean",
}

export const ZodOptionMap = {
    [OptionType.Number]: z.number(),
    [OptionType.String]: z.string(),
    [OptionType.Bool]: z.boolean(),
} as const;

export type OptionValueMap<T extends OptionType = OptionType> =
    T extends OptionType.Number
        ? number
        : T extends OptionType.String
          ? string
          : T extends OptionType.Bool
            ? boolean
            : never;

export type BaseOption<T extends OptionType> = {
    description: string;
    type: T;
};

export type RequiredOption<T extends OptionType> = BaseOption<T> & {
    required: true;
    defaultValue?: never;
};

export type OptionalOption<T extends OptionType> = BaseOption<T> & {
    required?: false;
    defaultValue?: OptionValueMap<T>;
};

export type Option<T extends OptionType = OptionType> =
    | RequiredOption<T>
    | OptionalOption<T>;

type OptionsValues<Options extends Record<string, Option>> = {
    [K in keyof Options]: OptionValueMap<Options[K]["type"]>;
};

export interface Command<
    Options extends Record<string, Option> = Record<string, Option>,
> {
    name: string;
    description: string;
    options: Options;
    parse(input: unknown): OptionsValues<Options>;
    run(
        interaction: ChatInputCommandInteraction<"cached">,
        opts?: OptionsValues<Options>,
    ): Awaited<unknown>;
}

export function createCommand<
    Options extends Record<string, Option>,
    Deps = unknown,
>(
    name: string,
    description: string,
    options: { [K in keyof Options]: Option<Options[K]["type"]> } & Options,
    handle: (
        interaction: ChatInputCommandInteraction<"cached">,
        opts: OptionsValues<Options>,
        deps: Deps,
    ) => Awaited<unknown>,
) {
    const schema = z.object(
        Object.fromEntries(
            Object.entries(options).map(([key, opt]) => {
                const base = ZodOptionMap[opt.type] as unknown as z.ZodType<
                    OptionValueMap<typeof opt.type>
                >;

                return [
                    key,
                    opt.required
                        ? base
                        : opt.defaultValue !== undefined
                          ? base.default(opt.defaultValue as any)
                          : base.optional(),
                ];
            }),
        ),
    );

    const parse = (input: unknown) =>
        schema.parse(input) as OptionsValues<Options>;

    type CmdClass = keyof Deps extends never
        ? { new (): Command<Options> }
        : { new (deps: Deps): Command<Options> };

    return class implements Command<Options> {
        readonly name = name;
        readonly description = description;
        readonly options = options;
        private deps: Deps;

        constructor(...args: keyof Deps extends never ? [] : [Deps]) {
            this.deps = (args[0] ?? {}) as Deps;
        }

        parse(input: unknown) {
            return parse(input);
        }

        run(
            interaction: ChatInputCommandInteraction<"cached">,
            opts?: OptionsValues<Options>,
        ) {
            if (opts) return handle(interaction, opts, this.deps);

            const rawOptions = Object.fromEntries(
                interaction.options.data.map((o) => [o.name, o.value]),
            );
            return handle(interaction, this.parse(rawOptions), this.deps);
        }
    } as unknown as CmdClass;
}
