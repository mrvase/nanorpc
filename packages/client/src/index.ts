import { ErrorCodes } from "@nanorpc/server";

type Prettify<T> = { [Key in keyof T]: T[Key] } & {};

export type QUERY_SERVER<T extends (...args: any) => any> = T & {
  __type: "query";
};

type InferArgs<TProcedure> = TProcedure extends (...args: infer Args) => any
  ? Args
  : never;
type InferResult<TProcedure> = TProcedure extends (...args: any) => infer Result
  ? Result
  : never;

type Suspend<T> = { key: () => string; suspend: () => [T, any, any] };

export type QUERY<T extends (...args: any) => any> = ((
  ...args: InferArgs<T>
) => InferResult<T> & Suspend<InferArgs<T>[0]>) & { __type: "query" };

export type MUTATE<T extends (...args: any) => any> = T & { __type: "mutate" };

type ClientParams<
  T extends any[],
  TOptions extends Partial<Options>
> = undefined extends T[0]
  ? [input?: T[0], options?: TOptions]
  : [input: T[0], options?: TOptions];

export type Result<TQuery extends (...args: any) => any> = Exclude<
  Awaited<ReturnType<TQuery>>,
  ErrorCodes<string>
>;

/* 
It creates two objects, one with static keys and one with dynamic keys.
We need to do it like this to make cmd+click work in vscode (to go to definition)
for static keys.
*/
type TurnIntoQueries<
  TRouter extends Record<string, any>,
  TOptions extends Partial<Options>
> = {
  [Key in keyof TRouter as TRouter[Key] extends { __type: "mutate" }
    ? never
    : Key extends `[${string}]`
    ? never
    : Key]: TurnChildIntoQueries<TRouter[Key], TOptions>;
} & {
  [Key in keyof TRouter as TRouter[Key] extends { __type: "mutate" }
    ? never
    : Key extends `[${string}]`
    ? string
    : never]: TurnChildIntoQueries<TRouter[Key], TOptions>;
} & {};

type TurnChildIntoQueries<
  TChildRouter extends any,
  TOptions extends Partial<Options>
> = TChildRouter extends QUERY_SERVER<infer Func>
  ? QUERY<
      (
        ...args: ClientParams<
          Parameters<Func>,
          TOptions & NativeOptions<Result<Func>, Parameters<Func>[0]>
        >
      ) => ReturnType<Func>
    >
  : TChildRouter extends Record<string, any>
  ? TurnIntoQueries<TChildRouter, TOptions> & {}
  : never;

type TurnIntoMutations<
  TRouter extends Record<string, any>,
  TOptions extends Partial<Options>
> = {
  [Key in keyof TRouter as TRouter[Key] extends { __type: "query" }
    ? never
    : Key extends `[${string}]`
    ? never
    : Key]: TurnChildIntoMutations<TRouter[Key], TOptions>;
} & {
  [Key in keyof TRouter as TRouter[Key] extends { __type: "query" }
    ? never
    : Key extends `[${string}]`
    ? string
    : never]: TurnChildIntoMutations<TRouter[Key], TOptions>;
} & {};

type TurnChildIntoMutations<
  TChildRouter extends any,
  TOptions extends Partial<Options>
> = TChildRouter extends MUTATE<infer Func>
  ? MUTATE<
      (
        ...args: ClientParams<
          Parameters<Func>,
          TOptions & NativeOptions<Result<Func>, Parameters<Func>[0]>
        >
      ) => ReturnType<Func>
    >
  : TChildRouter extends Record<string, any>
  ? TurnIntoMutations<TChildRouter, TOptions> & {}
  : never;

export type Options = {
  method: "GET" | "POST";
  body: string;
};

type NativeOptions<TResult, TInput> = {
  onError?: (error: string, input: TInput) => void;
  onSuccess?: (result: TResult, input: TInput) => void;
};

export type Fetcher<TOptions> = (
  key: string,
  options: TOptions
) => Promise<any>;

type FetcherMiddleware = (fetcher: Fetcher<any>) => Fetcher<any>;

type MergeOptions<
  Funcs extends readonly FetcherMiddleware[],
  Result
> = Funcs extends readonly [(fetcher: Fetcher<any>) => Fetcher<infer O1>]
  ? Prettify<Result & O1>
  : Funcs extends readonly [
      (fetcher: Fetcher<any>) => Fetcher<infer O2>,
      ...infer Tail
    ]
  ? Tail extends readonly FetcherMiddleware[]
    ? MergeOptions<Tail, Result & O2>
    : Result
  : never;

export function withMiddleware<
  TOptions extends Options,
  const Middlewares extends readonly FetcherMiddleware[]
>(
  fetcher: Fetcher<TOptions>,
  middleware: Middlewares
): Fetcher<TOptions & MergeOptions<Middlewares, {}>> {
  return middleware.reduce(
    (fetcher, middleware) => middleware(fetcher),
    fetcher
  );
}

type CreateClientWithOptions<
  TRouter extends Record<string, any>,
  TOptions extends Partial<Options>
> = {
  query: TurnIntoQueries<TRouter, TOptions>;
  mutate: TurnIntoMutations<TRouter, TOptions>;
} & {};

type InferFetcherOptions<TFetcher extends Fetcher<any>> =
  TFetcher extends Fetcher<infer TOptions> ? Partial<TOptions> : never;

export type CreateClient<
  TRouter extends Record<string, any>,
  TFetcher extends Fetcher<any>
> = CreateClientWithOptions<TRouter, InferFetcherOptions<TFetcher>> & {};

export const createClient = <TRouter extends Record<string, any>>(
  clientOptions: { url?: string, getUrl?: (options: Record<string, string>) => string | undefined } = {}
) => {
  return <TFetcher extends Fetcher<any>>(
    fetcher: TFetcher,
    globalOptions?: InferFetcherOptions<TFetcher>
  ): CreateClient<TRouter, TFetcher> => {
    const PROXY_CACHE: Record<string, any> = {};

    const createProxy = (type: "query" | "mutate", path: string): any => {
      const getKey = (input: any, options: any) => {
        const urlFromOptions = clientOptions.getUrl && clientOptions.getUrl(options);

        return [
          `${urlFromOptions ?? clientOptions.url ?? ""}${path}`,
          input ? `input=${encodeURIComponent(JSON.stringify(input))}` : null,
        ]
          .filter(Boolean)
          .join("?");
      };

      const func = (input: any, options: any) => {
        const isPost = type === "mutate";

        let suspended = false;
        let suspend = () => {
          suspended = true;
          return [input, options, proxy];
        };
        let key = () => {
          suspended = true;
          return getKey(isPost ? undefined : input, options);
        };

        const throwOnError = options?.swr === true;

        const promise = new Promise((resolve, reject_) => {
          const reject = throwOnError
            ? reject_
            : (error: string) => resolve({ error });

          queueMicrotask(() => {
            if (suspended) {
              resolve(null);
            } else {
              fetcher(getKey(isPost ? undefined : input, options), {
                method: isPost ? "POST" : "GET",
                ...(isPost && { body: JSON.stringify({ input }) }),
                ...globalOptions,
                ...options,
              })
                .then((result) => {
                  if (isError(result)) {
                    options?.onError?.(result.error, input);
                    reject(result.error);
                  } else {
                    options?.onSuccess?.(result, input);
                    resolve(result);
                  }
                })
                .catch((err) => {
                  console.error("[nanorpc] CLIENT SIDE ERROR:", err);
                  reject("SERVER_ERROR");
                });
            }
          });
        });

        return Object.assign(promise, { suspend, key });
      };

      const proxy = new Proxy(func, {
        get(target, prop: string) {
          if (prop === "__getKey") {
            return getKey;
          }
          if (prop === "__type") {
            return type;
          }
          if (prop in target) {
            return target[prop as "bind"];
          }
          const nextPath = path + `/${prop}`;
          const cachedPath = `${type}/${nextPath};`;
          return (PROXY_CACHE[cachedPath] =
            PROXY_CACHE[cachedPath] ?? createProxy(type, nextPath));
        },
      });

      return proxy;
    };

    return {
      query: createProxy("query", ""),
      mutate: createProxy("mutate", ""),
    };
  };
};

export const isError = (value: unknown): value is ErrorCodes<string> => {
  return value !== null && typeof value === "object" && "error" in value;
};
