import { it, expectTypeOf } from "vitest";
import { ErrorCodes, RPCError, createProcedure } from "../src";
import { z } from "zod";

it("shows type error on invalid input", () => {
  let p1 = createProcedure().query(() => {});

  // @ts-expect-error: does not accept any arguments
  expectTypeOf<Parameters<typeof p1>>().toMatchTypeOf<[any]>();

  let p2 = createProcedure()
    .schema(z.string())
    .query(() => {});

  // @ts-expect-error: requires a string as first argument
  expectTypeOf<Parameters<typeof p2>>().toMatchTypeOf<[]>();
});

it("infers type from the procedure's return type", () => {
  let p1 = createProcedure()
    .middleware((i, c, n) => n(i, c))
    .schema(z.undefined())
    .query(() => {});

  expectTypeOf<ReturnType<typeof p1>>().toMatchTypeOf<
    Promise<void | ErrorCodes<string>>
  >();

  let p2 = createProcedure()
    .middleware((i, c, n) => n(i, c))
    .schema(z.undefined())
    .query(() => "string");

  expectTypeOf<ReturnType<typeof p2>>().toMatchTypeOf<
    Promise<string | ErrorCodes<string>>
  >();
});

it("infers type of context from middleware", () => {
  let p1 = createProcedure()
    .middleware((i, c, n) => n(i, c))
    .schema(z.undefined())
    .query(() => {});

  expectTypeOf<Parameters<typeof p1>["length"]>().toMatchTypeOf<0>();

  let p2 = createProcedure()
    .middleware((i, c, n) => n(i, { ...c, property: "string" }))
    .schema(z.undefined())
    .query(() => {});

  expectTypeOf<Parameters<typeof p2>[1]>().toMatchTypeOf<{
    property: string;
  }>();
});

it("adds returned error codes to return type", () => {
  // base case
  let p1 = createProcedure()
    .middleware((i, c, n) => n(i, c))
    .schema(z.undefined())
    .query(() => {});

  expectTypeOf<
    ErrorCodes<"NOT_FOUND" | "SERVER_ERROR" | "SOME_ERROR">
    // @ts-expect-error: does not have error code "SOME_ERROR"
  >().toMatchTypeOf<
    Extract<Awaited<ReturnType<typeof p1>>, ErrorCodes<string>>
  >();

  // test in middleware
  let p2 = createProcedure()
    .middleware(async (i, c, n) => {
      if (true as boolean) {
        return new RPCError({ code: "SOME_ERROR" });
      }
      return n(i, c);
    })
    .schema(z.undefined())
    .query(() => {});

  expectTypeOf<
    ErrorCodes<"NOT_FOUND" | "SERVER_ERROR" | "SOME_ERROR">
  >().toMatchTypeOf<
    Extract<Awaited<ReturnType<typeof p2>>, ErrorCodes<string>>
  >();

  // test in query
  let p3 = createProcedure()
    .middleware(async (i, c, n) => {
      return n(i, c);
    })
    .schema(z.undefined())
    .query(() => {
      if (true as boolean) {
        return new RPCError({ code: "SOME_ERROR" });
      }
    });

  expectTypeOf<
    ErrorCodes<"NOT_FOUND" | "SERVER_ERROR" | "SOME_ERROR">
  >().toMatchTypeOf<
    Extract<Awaited<ReturnType<typeof p3>>, ErrorCodes<string>>
  >();

  // test in mutation
  let p4 = createProcedure()
    .middleware(async (i, c, n) => {
      return n(i, c);
    })
    .schema(z.undefined())
    .mutate(() => {
      if (true as boolean) {
        return new RPCError({ code: "SOME_ERROR" });
      }
    });

  expectTypeOf<
    ErrorCodes<"NOT_FOUND" | "SERVER_ERROR" | "SOME_ERROR">
  >().toMatchTypeOf<
    Extract<Awaited<ReturnType<typeof p4>>, ErrorCodes<string>>
  >();
});
