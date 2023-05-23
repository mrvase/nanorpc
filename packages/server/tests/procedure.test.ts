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

  // @ts-expect-error: missing auth
  expect(await p1()).toMatchObject({ auth: true });
});
