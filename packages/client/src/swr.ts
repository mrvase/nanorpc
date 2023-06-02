import React from "react";
import { Fetcher, MUTATE, Options } from ".";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { SWRConfiguration, cache as globalCache, mutate } from "swr/_internal";
import type { ErrorCodes, UnpackErrorCodes } from "@nanorpc/server";

const getInput = <TInput>(key: string) => {
  const paramsString = key.split("?")[1];
  if (!paramsString) return undefined;
  const searchParams = new URLSearchParams(paramsString);
  return JSON.parse(decodeURIComponent(searchParams.get("input")!)) as TInput;
};

type InferErrorCode<TProcedure> = TProcedure extends (
  input: any,
  opts?: any
) => infer Result
  ? UnpackErrorCodes<Extract<Awaited<Result>, ErrorCodes<string>>>
  : never;

export function useQuery<
  TResult extends
    | (Promise<any> & { suspend: () => [any, any, any] })
    | undefined
>(promise: TResult, SWROptions?: SWRConfiguration) {
  type Input = TResult extends { suspend: any }
    ? TResult["suspend"] extends () => [infer Input, any, any]
      ? Input
      : never
    : never;
  type ErrorCode = UnpackErrorCodes<
    Extract<Awaited<TResult>, ErrorCodes<string>>
  >;

  const [input, options, procedure] = promise ? (promise as any).suspend() : [];

  const [key, setKey] = React.useState(
    promise ? procedure.__getKey(input) : undefined
  );

  if (!key && promise) {
    setKey(procedure.__getKey(input));
  }

  const fetcher = React.useCallback(
    (key: string) => procedure(getInput<any>(key), { ...options, swr: true }),
    [procedure]
  );

  const swrHookResult = useSWR<
    Exclude<Awaited<TResult>, ErrorCodes<string>>,
    ErrorCode
  >(key, fetcher, SWROptions);

  const revalidate = React.useCallback(
    async (input?: Input) => {
      if (!input) {
        return await swrHookResult.mutate();
      } else if (procedure) {
        const key = procedure.__getKey(input);
        const result = await procedure(input, options);
        setKey(key);
        return result;
      }
    },
    [procedure]
  );

  const setData = (
    data: Parameters<typeof swrHookResult.mutate>[0],
    options?: Parameters<typeof swrHookResult.mutate>[1]
  ) => swrHookResult.mutate(data, options);

  const swr = Object.assign(swrHookResult, {
    revalidate,
    setData,
  });

  return swr as {
    [Key in keyof typeof swr as Key extends "mutate"
      ? never
      : Key]: typeof swr[Key];
  } & {}; // basically an omit of "mutate", but this makes the output type pretty
}

export function useImmutableQuery<
  TResult extends
    | (Promise<any> & { suspend: () => [any, any, any] })
    | undefined
>(promise: TResult, SWROptions?: SWRConfiguration) {
  return useQuery(promise, {
    ...SWROptions,
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnReconnect: false,
  });
}

function SWRDedupeMiddleware<TOptions extends Options>(
  fetcher: Fetcher<TOptions>
) {
  const FETCH: Record<string, Promise<any>> = {};

  return async (key: string, options: TOptions & { skipCache?: boolean }) => {
    if (options.method !== "GET" || !(key in FETCH)) {
      FETCH[key] = fetcher(key, options);
    }
    const result = await FETCH[key];
    setTimeout(() => {
      // allow cache to be set and catch anteceding fetches
      if (key in FETCH) delete FETCH[key];
    });
    return result;
  };
}

export const createCacheAccess = (
  options: {
    cache: typeof globalCache;
    mutate: typeof mutate;
  } = { cache: globalCache, mutate }
) => {
  const { cache, mutate } = options;
  return {
    set: <
      TResult extends Promise<any> & {
        key: () => string;
      }
    >(
      promise: TResult,
      data: Exclude<Awaited<TResult>, ErrorCodes<string>>
    ) => {
      const key = promise.key();
      mutate(key, data);
    },
    read: <
      TResult extends Promise<any> & {
        key: () => string;
      }
    >(
      promise: TResult
    ) => {
      const key = promise.key();
      const cached = cache.get(key);
      if (cached) {
        return cached.data as Exclude<Awaited<TResult>, ErrorCodes<string>>;
      }
    },
  };
};

export const cache = createCacheAccess();

const createSWRCacheMiddleware = (
  options: {
    cache: typeof globalCache;
    mutate: typeof mutate;
  } = { cache: globalCache, mutate }
) => {
  const { cache, mutate } = options;
  return <TOptions extends Options>(fetcher: Fetcher<TOptions>) => {
    return async (
      key: string,
      options: TOptions & { skipCache?: boolean; swr?: boolean }
    ) => {
      if (options.method === "GET" && !options.swr && !options.skipCache) {
        let cached = cache.get(key)?.data;
        if (cached) {
          return cached?.data;
        }
      }
      const promise = fetcher(key, options);
      if (!options.swr) {
        return await mutate(key, async () => {
          return await promise;
        });
      }
      return await promise;
    };
  };
};

export const createSWRMiddleware = (options?: {
  cache: typeof globalCache;
  mutate: typeof mutate;
}) => {
  return <TOptions extends Options>(fetcher: Fetcher<TOptions>) => {
    return SWRDedupeMiddleware(createSWRCacheMiddleware(options)(fetcher));
  };
};

export const SWRMiddleware = createSWRMiddleware();

type InferInput<TProcedure> = TProcedure extends (
  input: infer Input,
  opts?: any
) => any
  ? Input
  : never;

type InferOptions<TProcedure> = TProcedure extends (
  input: any,
  opts?: infer Options
) => any
  ? Options
  : never;

type InferResult<TProcedure> = TProcedure extends (
  input: any,
  opts?: any
) => Promise<infer Result>
  ? Result
  : never;

type OnlyData<T> = Exclude<T, ErrorCodes<string>>;

export function useMutation<
  TProcedure extends MUTATE<(input: any, options?: any) => any>
>(
  procedure: TProcedure,
  options?: InferOptions<TProcedure>
): ((input: InferInput<TProcedure>) => Promise<InferResult<TProcedure>>) & {
  data: OnlyData<InferResult<TProcedure>> | undefined;
  error: InferErrorCode<TProcedure> | undefined;
  isMutating: boolean;
} {
  const fetcher = React.useCallback(
    async (_: string, { arg }: any) => {
      return (await procedure(arg, {
        ...options,
        swr: true,
      })) as InferResult<TProcedure>;
    },
    [procedure]
  );

  const swr = useSWRMutation((procedure as any).__getKey({}), fetcher);

  return Object.assign(
    React.useCallback(
      async (input: InferInput<TProcedure>) => {
        let result;
        try {
          result = await swr.trigger(input);
        } catch (err) {
          result = err;
        }
        return result as InferResult<TProcedure>;
      },
      [procedure, swr.trigger]
    ),
    {
      get data() {
        return swr.data as OnlyData<InferResult<TProcedure>> | undefined;
      },
      get error() {
        return swr.error as InferErrorCode<TProcedure> | undefined;
      },
      get isMutating() {
        return swr.isMutating;
      },
    }
  );
}
