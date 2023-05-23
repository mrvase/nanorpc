import { z, ZodType } from "zod";
import { getUnknownErrorMessage } from "./utils";
import { RPCError } from "./error";
type Prettify<T> = T extends object ? { [Key in keyof T]: T[Key] } & {} : T;

export type RPCRequest = {
  method: "GET" | "POST" | "OPTIONS" | undefined;
  url: string;
  headers: Headers;
  route: string[];
};

export type RPCResponse = {
  headers: Headers;
  status: number;
  redirect?: string;
};

export { RPCError } from "./error";

type ErrorCode<T extends string = string> = T;

type Next<TInput, TContext> = Promise<{
  data: unknown;
  input: TInput;
  context: TContext;
}>;

type MiddlewareFunc<TInput, TContext> = (
  input: TInput,
  ctx: Prettify<TContext>,
  next: <NextInput, NextContext>(
    input: NextInput,
    context: NextContext
  ) => Next<NextInput, Prettify<TContext & NextContext>>
) => Promise<Awaited<ReturnType<typeof next>> | RPCError>;

type SchemaFunc<TInput> = ZodType | ((input: TInput) => unknown);

type QueryFunc<TInput, TContext> = (
  input: TInput,
  ctx: Prettify<TContext>
) => unknown | Promise<unknown>;

type MutateFunc<TInput, TContext> = (
  input: TInput,
  ctx: Prettify<TContext>
) => unknown | Promise<unknown>;

declare const isError: unique symbol;

export type ErrorCodes<T extends ErrorCode> = {
  [isError]: true;
  error: T;
};

export type UnpackErrorCodes<T extends ErrorCodes<string>> =
  T extends ErrorCodes<infer E> ? E : never;

export type Procedure<
  TType extends "query" | "mutate",
  TInput,
  TContext,
  TOutput,
  TError extends ErrorCode
> = ((
  ...args: keyof TContext extends never
    ? TInput extends undefined
      ? []
      : [input: TInput]
    : [input: TInput, context: TContext]
) => Promise<TOutput | ErrorCodes<TError>>) & { __type: TType };

/* an instance of Procedure */
type QUERY<T extends (...args: any) => any> = T & {
  __type: "query";
};

/* an instance of Procedure */
type MUTATE<T extends (...args: any) => any> = T & {
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
    | QUERY<(...args: [input: any, context: any]) => Promise<any>>
    | MUTATE<(...args: [input: any, context: any]) => Promise<any>>
    | Router;
};

type HTTPContext<
  Request extends object = object,
  Response extends object = object
> = { request: Request; response: Response };

export type CreateContext<
  Request extends object = object,
  Response extends object = object
> = (context: HTTPContext<Request, Response>) => Record<string, any>;

type ProcedureBuilder<
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
    Prettify<
      TInput &
        (F extends ZodType
          ? z.infer<F>
          : F extends (input: TInput) => infer Result
          ? Exclude<Result, RPCError>
          : {})
    >,
    TContext,
    TOutput,
    TError | (F extends () => infer Result ? Extract<Result, RPCError> : never)
  >;
  middleware: <F extends MiddlewareFunc<TInput, TContext>>(
    f: F
  ) => ReturnType<F> extends Promise<
    Awaited<Next<infer NextInput, infer NextContext>> | RPCError
  >
    ? ProcedureBuilder<
        TType,
        NextInput,
        NextContext,
        TOutput,
        TError | Extract<Awaited<ReturnType<F>>, RPCError>["error"]
      >
    : never;
  query: <F extends QueryFunc<TInput, TContext>>(
    f: F
  ) => PrettifyProcedure<
    Procedure<
      "query",
      unknown extends TInput ? undefined : TInput,
      TContext,
      F extends (...args: any[]) => infer Result
        ? Exclude<Awaited<Result>, RPCError | ErrorCodes<string>>
        : never,
      | TError
      | (F extends (...args: any[]) => infer Result
          ?
              | UnpackErrorCodes<Extract<Awaited<Result>, ErrorCodes<string>>>
              | Extract<Awaited<Result>, RPCError>["error"]
          : never)
    >
  >;
  mutate: <F extends MutateFunc<TInput, TContext>>(
    f: F
  ) => PrettifyProcedure<
    Procedure<
      "mutate",
      unknown extends TInput ? undefined : TInput,
      TContext,
      F extends (...args: any[]) => infer Result
        ? Exclude<Awaited<Result>, RPCError | ErrorCodes<string>>
        : never,
      | TError
      | TError
      | (F extends (...args: any[]) => infer Result
          ?
              | UnpackErrorCodes<Extract<Awaited<Result>, ErrorCodes<string>>>
              | Extract<Awaited<Result>, RPCError>["error"]
          : never)
    >
  >;
  use: <F extends ProcedureBuilder<any, any, any, any, any>>(
    f: F
  ) => F extends ProcedureBuilder<
    infer UType,
    infer UInput,
    infer UContext,
    infer UOutput,
    infer UError
  >
    ? ProcedureBuilder<
        TType & UType,
        UInput & TInput,
        Prettify<TContext & UContext>,
        TOutput,
        TError | UError
      >
    : never;
  state: () => ProcedureState<TType>;
};

type ProcedureState<TType extends "query" | "mutate"> = {
  main: QueryFunc<any, any> | MutateFunc<any, any>;
  schemas: SchemaFunc<any>[];
  middlewares: MiddlewareFunc<any, any>[];
  type: TType;
  error: ErrorCode;
};

const cloneState = <TType extends "query" | "mutate">(
  state: ProcedureState<TType>
) => {
  return {
    ...state,
    middlewares: [...state.middlewares],
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
      let [input, context] = args;
      const options = ((args as any)[2] ?? {}) as InternalProcedureOptions;

      try {
        for (let schema of state.schemas) {
          if (typeof schema === "function") {
            input = schema(input) as any;
            if (input instanceof RPCError) {
              throw input;
            }
          } else if (input instanceof ZodType) {
            try {
              schema.parse(input);
            } catch (e) {
              throw new RPCError({
                code: "SERVER_ERROR",
                status: 500,
                message: getUnknownErrorMessage(e),
              });
            }
          }
        }

        const main = options.onlyMiddleware ? async () => {} : state.main;

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
        const next = async (input: any, context: any) => {
          const mdlw = state.middlewares[i++];

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

  function middleware<F extends MiddlewareFunc<TInput, TContext>>(f: F) {
    const newState = cloneState(state);
    newState.middlewares.push(f);

    type Result = ReturnType<F> extends Promise<
      Awaited<Next<infer NextInput, infer NextContext>> | RPCError
    >
      ? ProcedureBuilder<
          TType,
          NextInput,
          NextContext,
          TOutput,
          TError | Extract<Awaited<ReturnType<F>>, RPCError>["error"]
        >
      : never;

    return createBuilderFromState(newState) as Result;
  }

  function schema<F extends SchemaFunc<TInput>>(f: F) {
    const newState = cloneState(state);
    newState.schemas.push(f);

    return createBuilderFromState<
      TType,
      Prettify<
        TInput &
          (F extends ZodType
            ? z.infer<F>
            : F extends (input: TInput) => infer Result
            ? Exclude<Result, RPCError>
            : {})
      >,
      TContext,
      TOutput,
      | TError
      | (F extends () => infer Result ? Extract<Result, RPCError> : never)
    >(newState);
  }

  function query<F extends QueryFunc<TInput, TContext>>(f: F) {
    const newState = cloneState(state) as ProcedureState<"query">;
    newState.type = "query";
    newState.main = f as any;

    return createProcedureFromState<
      "query",
      unknown extends TInput ? undefined : TInput,
      TContext,
      F extends (...args: any[]) => infer Result
        ? Exclude<Awaited<Result>, RPCError | ErrorCodes<string>>
        : never,
      | TError
      | (F extends (...args: any[]) => infer Result
          ?
              | UnpackErrorCodes<Extract<Awaited<Result>, ErrorCodes<string>>>
              | Extract<Awaited<Result>, RPCError>["error"]
          : never)
    >(newState);
  }

  function mutate<F extends MutateFunc<TInput, TContext>>(f: F) {
    const newState = cloneState(state) as ProcedureState<"mutate">;
    newState.type = "mutate";
    newState.main = f as any;

    return createProcedureFromState<
      "mutate",
      unknown extends TInput ? undefined : TInput,
      TContext,
      F extends (...args: any[]) => infer Result
        ? Exclude<Awaited<Result>, RPCError | ErrorCodes<string>>
        : never,
      | TError
      | (F extends (...args: any[]) => infer Result
          ?
              | UnpackErrorCodes<Extract<Awaited<Result>, ErrorCodes<string>>>
              | Extract<Awaited<Result>, RPCError>["error"]
          : never)
    >(newState);
  }

  function use<F extends ProcedureBuilder<any, any, any, any, any>>(
    f: F
  ): F extends ProcedureBuilder<
    infer UType,
    infer UInput,
    infer UContext,
    infer UOutput,
    infer UError
  >
    ? ProcedureBuilder<
        TType & UType,
        UInput & TInput,
        Prettify<TContext & UContext>,
        TOutput,
        TError | UError
      >
    : never {
    const newState = cloneState(state);
    const usedState = f.state();
    newState.schemas.push(...usedState.schemas);
    newState.middlewares.push(...usedState.middlewares);

    return createBuilderFromState<
      TType,
      TInput,
      TContext,
      F extends (...args: any[]) => infer Result ? Awaited<Result> : never,
      TError
    >(newState) as any;
  }
};

export const createProcedure = <
  TContext extends Record<string, any> | CreateContext = {}
>() => {
  type InitialContext = TContext extends (...args: any[]) => infer Context
    ? Prettify<Partial<Awaited<Context>>>
    : TContext extends Promise<object>
    ? Prettify<Partial<Awaited<TContext>>>
    : Prettify<Partial<TContext>>;

  const initialState: ProcedureState<"query"> = {
    type: "query",
    main: () => {},
    schemas: [],
    middlewares: [] as MiddlewareFunc<any, any>[],
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
