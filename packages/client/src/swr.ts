import React from "react";
import { Fetcher, MUTATE, Options, withMiddleware } from ".";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { cache, mutate } from "swr/_internal";
import type { ErrorCodes, UnpackErrorCodes } from "@nanorpc/server";
import qs from "qs";

const getInput = <TInput>(key: string) => {
  const searchParams = key.split("?")[1] ?? "";
  return qs.parse(searchParams).input as TInput;
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
>(promise: TResult) {
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

  const query = React.useCallback(
    async (input?: Input) => {
      if (!input) {
        return await swr.mutate();
      } else if (procedure) {
        const key = procedure.__getKey(input);
        const result = await procedure(input, options);
        setKey(key);
        return result;
      }
    },
    [procedure]
  );

  const swr = Object.assign(
    useSWR<Exclude<Awaited<TResult>, ErrorCodes<string>>, ErrorCode>(
      key,
      fetcher
    ),
    {
      query,
    }
  );

  return swr as {
    [Key in keyof typeof swr as Key extends "mutate"
      ? never
      : Key]: typeof swr[Key];
  } & {}; // basically an omit of "mutate", but this makes the output type pretty
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

function SWRCacheMiddleware<TOptions extends Options>(
  fetcher: Fetcher<TOptions>
) {
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
}

export function SWRMiddleware<TOptions extends Options>(
  fetcher: Fetcher<TOptions>
) {
  return withMiddleware(fetcher, [SWRDedupeMiddleware, SWRCacheMiddleware]);
}

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
