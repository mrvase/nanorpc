import { SWRMutationHook } from "swr/mutation";
import type { MUTATE, QUERY } from ".";
import { SWRHook } from "swr";

const getKey = <TProcedure, TInput>(procedure: TProcedure, input: TInput) => {
  return `${(procedure as any).__PATH__}/${JSON.stringify(input)}`;
};

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

export function useRPC<
  TProcedure extends QUERY<(input: any, options?: any) => any>
>(
  procedure: TProcedure,
  options?: InferOptions<TProcedure>
): ((
  input: InferInput<TProcedure>,
  options?: InferOptions<TProcedure>
) => InferResult<TProcedure> | undefined) & {
  error: string | undefined;
  isLoading: boolean;
  call: () => [{}, {}];
};
export function useRPC<
  TProcedure extends MUTATE<(input: any, options?: any) => any>
>(
  procedure: TProcedure,
  options?: InferOptions<TProcedure>
): ((
  input: InferInput<TProcedure>,
  options?: InferOptions<TProcedure>
) => Promise<InferResult<TProcedure>>) & {
  error: string | undefined;
  isLoading: boolean;
};
export function useRPC<
  TProcedure extends
    | QUERY<(input: any, options?: any) => any>
    | MUTATE<(input: any, options?: any) => any>
>(
  procedure: TProcedure,
  options?: InferOptions<TProcedure>
): ((
  input: InferInput<TProcedure>,
  options?: InferOptions<TProcedure>
) => Promise<InferResult<TProcedure>>) & {
  error: string | undefined;
  isLoading: boolean;
  call?: () => [{}, {}];
} {
  const result = [() => {}, {}] as [() => {}, {}];
  return Object.assign(result, {
    call() {
      return [{}, {}] as [{}, {}];
    },
  });
}

export const createHooks = <
  TResultHook extends SWRHook,
  TTriggerHook extends SWRMutationHook
>(
  resultHook: TResultHook,
  triggerHook: TTriggerHook
) => {
  const useResult = <
    TProcedureCaller extends () => QUERY<(input: any, options?: any) => any>
  >(
    procedureCaller: TProcedureCaller
  ) => {
    const { swr, ...options } = (opts ?? {}) as InferOptions<TProcedure> & {
      swr?: {};
    };
    const key = getKey(() => procedureCaller());
    return resultHook(
      getKey(procedure, input),
      () => procedure()(input, options) as Promise<InferResult<TProcedure>>,
      swr
    );
  };

  const useTrigger = <
    TProcedure extends MUTATE<(input: any, options?: any) => any>
  >(
    procedure: TProcedure,
    opts?: InferOptions<TProcedure> & { swr?: {} }
  ) => {
    const { swr, ...options } = (opts ?? {}) as InferOptions<TProcedure> & {
      swr?: {};
    };

    return triggerHook(
      getKey(procedure, {}),
      (key: string, input: { arg: InferInput<TProcedure> }) =>
        procedure(input, options) as Promise<InferResult<TProcedure>>,
      swr
    );
  };

  return { useResult, useTrigger };
};
