type Prettify<T> = { [Key in keyof T]: T[Key] } & {};

export type QUERY<T extends (...args: any) => any> = T & { __type: "query" };
export type MUTATE<T extends (...args: any) => any> = T & { __type: "mutate" };

type SWRQuery<T extends (...args: any) => any> = T &
  (T extends (...args: infer Args) => infer Result
    ? { useResult: (...input: Args) => { data: Awaited<Result> | undefined } }
    : {});

type SWRMutate<T extends (...args: any) => any> = T &
  (T extends (...args: infer Args) => infer Result
    ? { useTrigger: () => (...input: Args) => Awaited<Result> }
    : {});

type ClientParams<
  T extends any[],
  TOptions extends Partial<Options>
> = T[0] extends undefined
  ? [] | [input: undefined, options?: TOptions]
  : [input: T[0], options?: TOptions];

type TurnIntoRPCs<
  TRouter extends Record<string, any>,
  TOptions extends Partial<Options>
> = {
  [Key in keyof TRouter]: TRouter[Key] extends QUERY<infer Func>
      ? QUERY<(...args: ClientParams<Parameters<Func>, TOptions>) => ReturnType<Func>>
    : TRouter[Key] extends MUTATE<infer Func>
      ? MUTATE<(...args: ClientParams<Parameters<Func>, TOptions>) => ReturnType<Func>>
    : TRouter[Key] extends Record<string, any>
    ? Prettify<TurnIntoRPCs<TRouter[Key], TOptions>>
    : never;
};

type TurnIntoQueries<
  TRouter extends Record<string, any>,
  TOptions extends Partial<Options>
> = {
  [Key in keyof TRouter as TRouter[Key] extends MUTATE<(...args: any[]) => any> ? never : Key]: TRouter[Key] extends QUERY<infer Func>
      ? QUERY<(...args: ClientParams<Parameters<Func>, TOptions>) => ReturnType<Func>>
    : TRouter[Key] extends Record<string, any>
    ? Prettify<TurnIntoQueries<TRouter[Key], TOptions>>
    : never;
};

type TurnIntoMutations<
  TRouter extends Record<string, any>,
  TOptions extends Partial<Options>
> = {
  [Key in keyof TRouter as TRouter[Key] extends { __type: "query" } ? never : Key]: TRouter[Key] extends MUTATE<infer Func>
      ? MUTATE<(...args: ClientParams<Parameters<Func>, TOptions>) => ReturnType<Func>>
    : TRouter[Key] extends Record<string, any>
    ? Prettify<TurnIntoMutations<TRouter[Key], TOptions>>
    : never;
};

type TurnIntoHooks<TClient extends Record<string, any>> = {
  [Key in keyof TClient]: TClient[Key] extends QUERY<infer Func>
    ? SWRQuery<Func>
    : TClient[Key] extends MUTATE<infer Func>
    ? SWRMutate<Func>
    : TClient[Key] extends Record<string, any>
    ? Prettify<TurnIntoHooks<TClient[Key]>>
    : never;
};

type TurnIntoSWRHooks<TClient extends Record<string, any>> = {
  [Key in keyof TClient]: TClient[Key] extends (...args: any[]) => any
    ? SWRQuery<TClient[Key]>
    : TClient[Key] extends Record<string, any>
    ? Prettify<TurnIntoSWRHooks<TClient[Key]>>
    : never;
};

type TurnIntoTriggerHooks<TClient extends Record<string, any>> = {
  [Key in keyof TClient]: TClient[Key] extends (...args: any[]) => any
    ? SWRMutate<TClient[Key]>
    : TClient[Key] extends Record<string, any>
    ? Prettify<TurnIntoTriggerHooks<TClient[Key]>>
    : never;
};

type TurnIntoHooks2<TClient extends { mutate: Record<string, any>, query: Record<string, any> }> = {
  mutate: TurnIntoTriggerHooks<TClient["mutate"]>;
  query: TurnIntoSWRHooks<TClient["query"]>;
};

type Options = { method: "GET"; headers?: Record<string, string>; body?: string };

export type Fetcher<TOptions> = (
  key: string,
  options: TOptions
) => Promise<Response>;

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
): Fetcher<MergeOptions<Middlewares, TOptions>> {
  return middleware.reduce(
    (fetcher, middleware) => middleware(fetcher),
    fetcher
  );
}

const PROXY_CACHE: Record<string, any> = {};

const getKey = (path: string, input: any) => {
  return `${path}/${JSON.stringify(input)}`;
}

export const createClient = <TRouter extends Record<string, any>>() => {
  return <TFetcher extends Fetcher<any>>(
    fetcher: TFetcher,
    globalOptions?: TFetcher extends Fetcher<infer TOptions>
      ? Partial<TOptions>
      : Partial<Options>
  ): Prettify<TurnIntoRPCs<
    TRouter,
    TFetcher extends Fetcher<infer TOptions>
      ? Partial<TOptions>
      : Partial<Options>>
  > => {

    const createProxy = (path: string): any => {
      const func = (input: any, options: any) => {
        return fetcher(getKey(path, input), {
          method: "GET",
          ...globalOptions,
          ...options,
        });
      };

      return new Proxy(func, {
        get(target, prop: string) {
          if (prop === "__PATH__") {
            return path;
          }
          if (prop in target) {
            return target[prop as "bind"];
          }
          path += `/${prop}`;
          return (PROXY_CACHE[path] = PROXY_CACHE[path] ?? createProxy(path));
        },
      });
    };
    return createProxy("");
  };
};

export const createClient2 = <TRouter extends Record<string, any>>() => {
  return <TFetcher extends Fetcher<any>>(
    fetcher: TFetcher,
    globalOptions?: TFetcher extends Fetcher<infer TOptions>
      ? Partial<TOptions>
      : Partial<Options>
  ): { query: Prettify<TurnIntoQueries<
    TRouter,
    TFetcher extends Fetcher<infer TOptions>
      ? Partial<TOptions>
      : never>
  >, mutate: Prettify<TurnIntoMutations<
    TRouter,
    TFetcher extends Fetcher<infer TOptions>
      ? Partial<TOptions>
      : never>
  > } => {
    const createProxy = (path: string[]): any => {
      const func = (input: any, options: any) => {
        return fetcher(path.join("/"), {
          method: "GET",
          ...globalOptions,
          ...options,
        });
      };

      return new Proxy(func, {
        get(target, prop) {
          if (prop in target) {
            return target[prop as "bind"];
          }
          return createProxy([...path, prop.toString()]);
        },
      });
    };
    return createProxy([]);
  };
};

const router = createClient<{
  users: {
    get: QUERY<(id: string) => Promise<{ name: string }>>;
    create: MUTATE<(input: { name: string }) => Promise<{ id: string }>>;
  };
  documents: {
    get: QUERY<(input: { id: string }) => Promise<{ title: string }>>;
    save: MUTATE<(title: string) => Promise<{ id: string }>>;
  };
}>()((key) => fetch(key));

export const addSWRHooks = <TClient extends Record<string, any>>(
  any: TClient
): Prettify<TurnIntoHooks<TClient>> => {
  return {} as any;
};

export const withSWRHooks = <TClient extends { mutate: Record<string, any>, query: Record<string, any> }>(
  any: TClient
): Prettify<TurnIntoHooks2<TClient>> => {
  return {} as any;
};

/*
const fetcher = withMiddleware(
  async (key) => fetch(key),
  [dedupe, throttle, generateHeaders]
);

const client = createClient<typeof router>()(fetcher);

client.get("bla", { throttle: 100 });

const hooks = addSWRHooks(client);

const { data } = hooks.get.useQuery("bla");
*/

import { createHooks, useRPC } from "./swr";

export { createHooks } from "./swr";

const fetcher = async (key: string, options?: Options) => fetch(key);

const api = createClient2<typeof router>()(fetcher);

const { query, mutate } = api;

const getDocument = useRPC(query.documents.get);
const document = getDocument({ id: "" });

const saveDocument = useRPC(mutate.documents.save);

const result = saveDocument("test");


const getUser = useRPC(query.users.get);
const user = getUser("test");