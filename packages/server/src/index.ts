import { z, ZodType } from "zod";
import { getUnknownErrorMessage } from "./utils";
import { RPCError } from "./error";

export { RPCError } from "./error";

type Prettify<T> = T extends object ? { [Key in keyof T]: T[Key] } & {} : T;

type ErrorCode<T extends string = string> = T;

type Next<TInput, TContext> = Promise<{
  data: unknown;
  input: TInput;
  context: TContext;
}>;

type MiddlewareFunc<
  TInput,
  TContext,
  TNextInput,
  TNextContext extends Record<string, any>,
  TNextError extends string
> = (
  input: TInput,
  ctx: TContext,
  next: <NextInput, NextContext>(
    input: NextInput,
    context: NextContext
  ) => Next<NextInput, TContext & NextContext>
) => Promise<
  | Awaited<ReturnType<typeof next<TNextInput, TNextContext>>>
  | RPCError<TNextError>
>;

type SchemaFunc<TInput> = ZodType | ((input: TInput) => unknown);

type QueryFunc<TInput, TContext, TNextResult> = (
  input: TInput,
  ctx: TContext
) => TNextResult;

type MutateFunc<TInput, TContext, TNextResult> = (
  input: TInput,
  ctx: TContext
) => TNextResult;

declare const is_error: unique symbol;

export type ErrorCodes<T extends ErrorCode> = {
  [is_error]: true;
  error: T;
};

export type UnpackErrorCodes<T extends ErrorCodes<string>> =
  T extends ErrorCodes<infer E> ? E : never;

/*
if I need to check for context:
keyof TContext extends never
    ? TInput extends undefined
      ? []
      : [input: Prettify<TInput>]
    : [input: Prettify<TInput>, context: Prettify<TContext>]
*/

export type Procedure<
  TType extends "query" | "mutate",
  TInput,
  TContext,
  TOutput,
  TError extends ErrorCode
> = ((
  ...args: TInput extends undefined ? [] : [input: Prettify<TInput>]
) => Promise<TOutput | ErrorCodes<TError>>) & { __type: TType };

/* an instance of Procedure */
export type QUERY<T extends (...args: any) => any> = T & {
  __type: "query";
};

/* an instance of Procedure */
export type MUTATE<T extends (...args: any) => any> = T & {
  __type: "mutate";
};

type PrettifyProcedure<T> = T extends ((
  ...args: infer Args
) => infer Result) & { __type: infer Type }
  ? Type extends "query"
    ? QUERY<(...args: Args) => Result>
    : MUTATE<(...args: Args) => Result>
  : never;

export type Router = {
  [key: string]:
    | QUERY<(...args: [input: any]) => Promise<any>>
    | MUTATE<(...args: [input: any]) => Promise<any>>
    | Router;
};

export type HTTPContext<
  Request extends object = object,
  Response extends object = object
> = { request: Request; response: Response };

export type CreateContext<
  Request extends object = object,
  Response extends object = object
> = (context: HTTPContext<Request, Response>) => Record<string, any>;

export type ProcedureBuilder<
  TType extends "query" | "mutate",
  TInput,
  TContext,
  TOutput,
  TError extends ErrorCode
> = /* Procedure<TType, TContext, TInput, TOutput> & */ {
  schema: <F extends SchemaFunc<TInput>>(
    f: F
  ) => ProcedureBuilder<
    TType,
    TInput &
      (F extends ZodType
        ? z.infer<F>
        : F extends (input: TInput) => infer Result
        ? Exclude<Result, RPCError>
        : {}),
    TContext,
    TOutput,
    TError | (F extends () => infer Result ? Extract<Result, RPCError> : never)
  >;
  middleware: <
    TNextInput,
    TNextContext extends Record<string, any>,
    TNextError extends string
  >(
    f: MiddlewareFunc<TInput, TContext, TNextInput, TNextContext, TNextError>
  ) => ProcedureBuilder<
    TType,
    TNextInput,
    TNextContext,
    TOutput,
    TError | TNextError
  >;
  query: <TNextResult>(
    f: QueryFunc<TInput, TContext, TNextResult>
  ) => PrettifyProcedure<
    Procedure<
      "query",
      unknown extends TInput ? undefined : TInput,
      TContext,
      Exclude<Awaited<TNextResult>, RPCError | ErrorCodes<string>>,
      | TError
      | UnpackErrorCodes<Extract<Awaited<TNextResult>, ErrorCodes<string>>>
      | Extract<Awaited<TNextResult>, RPCError>["error"]
    >
  >;
  mutate: <TNextResult>(
    f: MutateFunc<TInput, TContext, TNextResult>
  ) => PrettifyProcedure<
    Procedure<
      "mutate",
      unknown extends TInput ? undefined : TInput,
      TContext,
      Exclude<Awaited<TNextResult>, RPCError | ErrorCodes<string>>,
      | TError
      | UnpackErrorCodes<Extract<Awaited<TNextResult>, ErrorCodes<string>>>
      | Extract<Awaited<TNextResult>, RPCError>["error"]
    >
  >;
  use: <
    UType extends "query" | "mutate",
    UInput,
    UContext,
    UError extends ErrorCode
  >(
    f: ProcedureBuilder<UType, UInput, UContext, any, UError>
  ) => ProcedureBuilder<
    TType & UType,
    UInput & TInput,
    TContext & UContext,
    TOutput,
    TError | UError
  >;
  state: () => ProcedureState<TType>;
};

export type ProcedureState<TType extends "query" | "mutate"> = {
  main: QueryFunc<any, any, any> | MutateFunc<any, any, any>;
  schemas: Set<SchemaFunc<any>>;
  middlewares: Set<MiddlewareFunc<any, any, any, any, any>>;
  type: TType;
  error: ErrorCode;
};

const cloneState = <TType extends "query" | "mutate">(
  state: ProcedureState<TType>
): ProcedureState<TType> => {
  return {
    ...state,
    middlewares: new Set(state.middlewares),
    schemas: new Set(state.schemas),
  };
};

export type InternalProcedureOptions = {
  onlyMiddleware?: boolean;
  throwOnError?: boolean;
};

const createProcedureFromState = <
  TType extends "query" | "mutate",
  TInput,
  TContext extends Record<string, any>,
  TOutput,
  TError extends ErrorCode
>(
  state: ProcedureState<TType>
): Procedure<TType, TInput, TContext, TOutput, TError> => {
  return Object.assign(
    async (
      ...args: Parameters<Procedure<TType, TInput, TContext, TOutput, TError>>
    ): Promise<TOutput | ErrorCodes<TError>> => {
      let [input, context = {}] = args;
      const options = ((args as any)[2] ?? {}) as InternalProcedureOptions;

      try {
        if (!options.onlyMiddleware) {
          for (let schema of state.schemas.values()) {
            try {
              if (typeof schema === "function") {
                input = schema(input) as any;
              } else if (schema instanceof ZodType) {
                schema.parse(input);
              }
            } catch (err) {
              console.error("VALIDATION ERROR:", err);
              throw new RPCError({
                code: "SERVER_ERROR",
                status: 500,
                message: getUnknownErrorMessage(err),
              });
            }
            if (input instanceof RPCError) {
              console.error("VALIDATION ERROR:", input);
              throw input;
            }
          }
        }

        class MiddlewareResult {
          data: any;
          input: any;
          context: any;
          constructor(opts: { data: any; input: any; context: any }) {
            this.data = opts.data;
            this.input = opts.input;
            this.context = opts.context;
          }
        }

        let i = 0;
        const middlewares = [...state.middlewares.values()];
        const main = options.onlyMiddleware ? async () => {} : state.main;
        const next = async (input: any, context: any) => {
          const mdlw = middlewares[i++];

          const result: unknown = await (mdlw
            ? mdlw(input, context, next)
            : main(input, context));

          if (result instanceof RPCError) throw result;
          if (result instanceof MiddlewareResult) return result;
          return new MiddlewareResult({
            data: result,
            input,
            context,
          });
        };

        return (await next(input, context)).data as TOutput;
      } catch (err: unknown) {
        if (options.throwOnError) {
          // if thrown, the consumer will receive the extra error information in RPCError
          throw err;
        }
        if (err instanceof RPCError) {
          return {
            error: err.error,
          } as ErrorCodes<TError>;
        }
        console.error("UNKNOWN RPC ERROR [1]:", err);
        return {
          error: "SERVER_ERROR",
        } as ErrorCodes<TError>;
      }
    },
    { __type: state.type }
  );
};

const createBuilderFromState = <
  TType extends "query" | "mutate",
  TInput,
  TContext extends Record<string, any>,
  TOutput,
  TError extends ErrorCode
>(
  state: ProcedureState<TType>
): ProcedureBuilder<TType, TInput, TContext, TOutput, TError> => {
  return {
    schema,
    middleware,
    query,
    mutate,
    use,
    state: () => state,
  };

  function middleware<
    TNextInput,
    TNextContext extends Record<string, any>,
    TNextError extends string
  >(f: MiddlewareFunc<TInput, TContext, TNextInput, TNextContext, TNextError>) {
    const newState = cloneState(state);
    newState.middlewares.add(f);

    return createBuilderFromState<
      TType,
      TNextInput,
      TNextContext,
      TOutput,
      TError | TNextError
    >(newState);
  }

  function schema<F extends SchemaFunc<TInput>>(f: F) {
    const newState = cloneState(state);
    newState.schemas.add(f);

    return createBuilderFromState<
      TType,
      TInput &
        (F extends ZodType
          ? z.infer<F>
          : F extends (input: TInput) => infer Result
          ? Exclude<Result, RPCError>
          : {}),
      TContext,
      TOutput,
      | TError
      | (F extends () => infer Result ? Extract<Result, RPCError> : never)
    >(newState);
  }

  function query<TNextResult>(f: QueryFunc<TInput, TContext, TNextResult>) {
    const newState = cloneState(state) as ProcedureState<"query">;
    newState.type = "query";
    newState.main = f as any;

    return createProcedureFromState<
      "query",
      unknown extends TInput ? undefined : TInput,
      TContext,
      Exclude<Awaited<TNextResult>, RPCError | ErrorCodes<string>>,
      | TError
      | UnpackErrorCodes<Extract<Awaited<TNextResult>, ErrorCodes<string>>>
      | Extract<Awaited<TNextResult>, RPCError>["error"]
    >(newState);
  }

  function mutate<TNextResult>(f: MutateFunc<TInput, TContext, TNextResult>) {
    const newState = cloneState(state) as ProcedureState<"mutate">;
    newState.type = "mutate";
    newState.main = f as any;

    return createProcedureFromState<
      "mutate",
      unknown extends TInput ? undefined : TInput,
      TContext,
      Exclude<Awaited<TNextResult>, RPCError | ErrorCodes<string>>,
      | TError
      | UnpackErrorCodes<Extract<Awaited<TNextResult>, ErrorCodes<string>>>
      | Extract<Awaited<TNextResult>, RPCError>["error"]
    >(newState);
  }

  function use<
    UType extends "query" | "mutate",
    UInput,
    UContext,
    UError extends ErrorCode,
    F extends ProcedureBuilder<UType, UInput, UContext, any, UError>
  >(f: F) {
    const newState = cloneState(state) as ProcedureState<TType & UType>;
    const usedState = f.state();
    usedState.schemas.forEach((newSchema) => newState.schemas.add(newSchema));
    usedState.middlewares.forEach((newMiddleware) =>
      newState.middlewares.add(newMiddleware)
    );

    return createBuilderFromState<
      TType & UType,
      UInput & TInput,
      TContext & UContext,
      TOutput,
      TError | UError
    >(newState);
  }
};

export const createProcedure = <
  TContext extends Record<string, any> | CreateContext = {}
>() => {
  type InitialContext = TContext extends (...args: any[]) => infer Context
    ? Partial<Awaited<Context>>
    : TContext extends Promise<object>
    ? Partial<Awaited<TContext>>
    : Partial<TContext>;

  const initialState: ProcedureState<"query"> = {
    type: "query",
    main: () => {},
    schemas: new Set(),
    middlewares: new Set(),
    error: "",
  };

  return createBuilderFromState<
    "query",
    unknown,
    InitialContext,
    unknown,
    "SERVER_ERROR" | "NOT_FOUND"
  >(initialState);
};

export const isError = (value: unknown): value is ErrorCodes<string> => {
  return value !== null && typeof value === "object" && "error" in value;
};
