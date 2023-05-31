import { createProcedure } from "@nanorpc/server";
import { createResponse } from "./utils";
import { createClient } from "../src";

const router = {
  users: {
    getUser: createProcedure().query(() => "foo"),
    getLatest: createProcedure().query(() => "bar"),
  },
};

const fetch = (key: string) => {
  const route = key.split("/").slice(2);
  const func = route.reduce(
    (acc, cur) => acc[cur as "users"] as any,
    router
  ) as any;
  return func();
};

it("should not fetch when suspend methods are called", async () => {
  let count = 0;
  function fetcher<TOptions>(key: string, options: TOptions) {
    ++count;
    return createResponse(fetch(key));
  }

  const client = createClient<typeof router>("/api")(fetcher);

  const promise1 = client.query.users.getUser();
  const key = promise1.key();

  expect(key).toBe("/api/users/getUser");
  await promise1;
  expect(count).toBe(0);

  const promise2 = client.query.users.getUser();
  const suspended = promise2.suspend();

  expect(typeof suspended).toBe("object");
  await promise2;
  expect(count).toBe(0);
});
