import { expect, it } from "vitest";
import { RPCError, createProcedure } from "../src";
import { z } from "zod";

it("returns value of query or mutation", async () => {
  let p1 = createProcedure().query(() => null);
  expect(await p1()).toBe(null);

  let p2 = createProcedure().mutate(() => null);
  expect(await p2()).toBe(null);
});

it("returns error object on error", async () => {
  let p1 = createProcedure().query(() => new RPCError({ code: "NOT_FOUND" }));
  expect(await p1()).toMatchObject({ error: "NOT_FOUND" });
});

it("validates input", async () => {
  let p1 = createProcedure()
    .schema(z.string())
    .query(() => {});

  expect(await p1(undefined as unknown as string)).toMatchObject({
    error: "SERVER_ERROR",
  });
});

it("makes middleware context accessible to antecedent functions", async () => {
  let p1 = createProcedure()
    .middleware((i, c, n) => n(i, { ...c, auth: true }))
    .query((_, ctx) => {
      return ctx;
    });

  expect(await p1()).toMatchObject({ auth: true });
});

it("only calls the same middleware function once", async () => {
  let procedureWithMiddleware = createProcedure().middleware((i, c, n) => {
    return n(i, {
      ...c,
      count: (((c as any).count as number) ?? 0) + 1,
    });
  });

  // it begins with the middleware: +1
  let p1 = procedureWithMiddleware
    // it uses the same middlware: +0
    .use(procedureWithMiddleware)
    // but it then does the same in another function: +1
    .middleware((i, c, n) => {
      return n(i, {
        ...c,
        count: c.count + 1,
      });
    })
    .query(async (_, ctx) => {
      return ctx.count;
    });

  expect(await p1()).toMatchObject(2);
});
