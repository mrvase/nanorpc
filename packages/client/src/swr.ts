import React from "react";
import { Fetcher, MUTATE, Options } from ".";
import useSWR from "swr";
import useSWRMutation, { SWRMutationConfiguration } from "swr/mutation";
import {
  SWRConfiguration,
  State,
  cache as globalCache,
  mutate,
} from "swr/_internal";
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
    [swrHookResult.mutate, procedure]
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
  const FETCH: Record<
    string,
    [
      timestamp: number,
      promise: Promise<any> | undefined,
      data: any | undefined
    ]
  > = {};

  return async (
    key: string,
    options: TOptions & { skipCache?: boolean; swr?: boolean }
  ) => {
    if (options.method !== "GET") {
      return await fetcher(key, options);
    }
    const now = Date.now();
    // fetch if it does not exist
    // or if it is older than 2 seconds (SWR default dedupe interval)
    if (!(key in FETCH) || now - FETCH[key][0] > 2000 || options.skipCache) {
      FETCH[key] = [now, fetcher(key, options), undefined];
    }
    const result = FETCH[key][2] ?? (await FETCH[key][1]);
    if (options.swr) {
      // it will now be handled by SWR cache
      delete FETCH[key];
    } else {
      FETCH[key][2] = result;
      FETCH[key][1] = undefined;
    }
    return result;
  };
}

const getCacheData = <TResult>(state: State<any, any> | undefined) => {
  if (state && state.data && !state.isLoading) {
    return state.data as Exclude<Awaited<TResult>, ErrorCodes<string>>;
  }
};

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
      data: Parameters<
        typeof mutate<Exclude<Awaited<TResult>, ErrorCodes<string>>>
      >[1]
    ) => {
      const key = promise.key();
      mutate(key, data, { revalidate: false });
    },
    read: <
      TResult extends Promise<any> & {
        key: () => string;
      }
    >(
      promise: TResult
    ) => {
      const key = promise.key();
      return getCacheData<TResult>(cache.get(key));
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
        const cached = getCacheData(cache.get(key));
        if (cached) return cached;
      }
      const promise = fetcher(key, options);
      if (options.method === "GET" && !options.swr) {
        return await mutate(key, promise, { revalidate: false });
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
  options?: InferOptions<TProcedure>,
  SWROptions?: SWRMutationConfiguration<
    OnlyData<InferResult<TProcedure>>,
    InferErrorCode<TProcedure>,
    InferInput<TProcedure>
  >
) {
  type Result = InferResult<TProcedure>;

  const fetcher = React.useCallback(
    async (_: string, { arg }: any) => {
      return (await procedure(arg, {
        ...options,
        swr: true,
      })) as OnlyData<Result>;
    },
    [procedure]
  );

  const swr = useSWRMutation(
    (procedure as any).__getKey({}),
    fetcher,
    SWROptions
  );

  return Object.assign(
    React.useCallback(
      async (input: InferInput<TProcedure>) => {
        let result;
        try {
          result = await swr.trigger(input);
        } catch (err) {
          result = err;
        }
        return result as Result;
      },
      [procedure, swr.trigger]
    ),
    {
      reset: swr.reset,
      get data() {
        return swr.data as OnlyData<Result> | undefined;
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
