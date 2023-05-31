import { ErrorCodes } from "@nanorpc/server";

type Prettify<T> = { [Key in keyof T]: T[Key] } & {};

export type QUERY_SERVER<T extends (...args: any) => any> = T & {
  __type: "query";
};

type InferArgs<TProcedure> = TProcedure extends (...args: infer Args) => any
  ? Args
  : never;
type InferResult<TProcedure> = TProcedure extends (
  ...args: any
) => infer Result
  ? Result
  : never;

type Suspend<T> = { suspend: () => [T, any, any] };

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

type TurnIntoQueries<
  TRouter extends Record<string, any>,
  TOptions extends Partial<Options>
> = {
  [Key in keyof TRouter as TRouter[Key] extends { __type: "mutate" }
    ? never
    : Key]: TRouter[Key] extends QUERY_SERVER<infer Func>
    ? QUERY<
        (...args: ClientParams<Parameters<Func>, TOptions>) => ReturnType<Func>
      >
    : TRouter[Key] extends Record<string, any>
    ? Prettify<TurnIntoQueries<TRouter[Key], TOptions>>
    : never;
};

type TurnIntoMutations<
  TRouter extends Record<string, any>,
  TOptions extends Partial<Options>
> = {
  [Key in keyof TRouter as TRouter[Key] extends { __type: "query" }
    ? never
    : Key]: TRouter[Key] extends MUTATE<infer Func>
    ? MUTATE<
        (...args: ClientParams<Parameters<Func>, TOptions>) => ReturnType<Func>
      >
    : TRouter[Key] extends Record<string, any>
    ? Prettify<TurnIntoMutations<TRouter[Key], TOptions>>
    : never;
};

export type Options = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
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

export type CreateClient<TRouter extends Record<string, any>, TFetcher extends Fetcher<any>> = {
  query: Prettify<
    TurnIntoQueries<
      TRouter,
      TFetcher extends Fetcher<infer TOptions> ? Partial<TOptions> : never
    >
  >;
  mutate: Prettify<
    TurnIntoMutations<
      TRouter,
      TFetcher extends Fetcher<infer TOptions> ? Partial<TOptions> : never
    >
  >;
}

export const createClient = <TRouter extends Record<string, any>>(
  url: string
  ) => {
  return <TFetcher extends Fetcher<any>>(
    fetcher: TFetcher,
    globalOptions?: TFetcher extends Fetcher<infer TOptions>
      ? Partial<TOptions>
      : Partial<Options>
  ): CreateClient<TRouter, TFetcher> => {
    const PROXY_CACHE: Record<string, any> = {};

    const createProxy = (type: "query" | "mutate", path: string): any => {
      const getKey = (input: any) => {
        return [`${url}${path}`, input ? `input=${encodeURIComponent(JSON.stringify(input))}` : null].filter(Boolean).join("?");
      };

      const func = (input: any, options: any) => {
        const isPost = type === "mutate";

        let suspended = false;
        let suspend = () => {
          suspended = true;
          return [input, options, proxy];
        };

        const throwOnError = options?.swr === true;

        const promise = new Promise((resolve, reject_) => {
          const reject = throwOnError ? reject_ : (error: string) => resolve({ error });

          queueMicrotask(() => {
            if (suspended) {
              resolve(null);
            } else {
              fetcher(getKey(isPost ? undefined : input), {
                method: isPost ? "POST" : "GET",
                ...(isPost && { body: JSON.stringify({ input }) }),
                ...globalOptions,
                ...options,
              })
                .then((result) => {
                  if (
                    isError(result)
                  ) {
                    reject(result.error);
                  } else {
                    resolve(result);
                  }
                })
                .catch((err) => {
                  reject("SERVER_ERROR");
                });
            }
          });
        });

        return Object.assign(promise, { suspend });
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
}