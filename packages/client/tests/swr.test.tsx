import { vi } from "vitest";
import { createResponse, renderWithConfig, sleep } from "./utils";
import { render, screen } from "@testing-library/react";
import { createProcedure } from "@nanorpc/server";
import { createClient, withMiddleware } from "../src";
import { createSWRMiddleware, useQuery } from "../src/swr";
import { SWRConfig, useSWRConfig } from "swr";
import React from "react";

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

describe("", () => {
  it("makes two independent fetches without cache", async () => {
    let count = 0;
    function fetcher<TOptions>(key: string, options: TOptions) {
      ++count;
      return createResponse(fetch(key));
    }

    const client = createClient<typeof router>("/api")(fetcher);

    function Page() {
      const { data } = useQuery(client.query.users.getUser());
      return <div>data:{data}</div>;
    }

    expect(count).toBe(0);
    await client.query.users.getUser();
    expect(count).toBe(1);
    render(<Page />);
    await screen.findByText("data:foo");
    expect(count).toBe(2);
  });

  it("makes only a single fetch with deduping", async () => {
    let count = 0;
    function fetcher<TOptions>(key: string, options: TOptions) {
      ++count;
      return createResponse(fetch(key));
    }

    const fetcherWithMiddleware = withMiddleware(fetcher, [
      createSWRMiddleware(),
    ]);

    const client = createClient<typeof router>("/api")(fetcherWithMiddleware);

    expect(count).toBe(0);
    await Promise.all([
      client.query.users.getUser(),
      client.query.users.getUser(),
      client.query.users.getUser(),
    ]);
    expect(count).toBe(1);
  });

  it("makes only a single fetch with deduping", async () => {
    let count = 0;
    function fetcher<TOptions>(key: string, options: TOptions) {
      ++count;
      return createResponse(fetch(key));
    }

    const fetcherWithMiddleware = withMiddleware(fetcher, [
      createSWRMiddleware(),
    ]);

    const client = createClient<typeof router>("/api")(fetcherWithMiddleware);

    function Page() {
      const { data } = useQuery(client.query.users.getUser());
      return <div>data:{data}</div>;
    }

    expect(count).toBe(0);
    await client.query.users.getUser();
    // make sure deduping does not explain the result
    expect(count).toBe(1);
    await sleep(100);
    await client.query.users.getUser();
    expect(count).toBe(1);
    await sleep(100);
    render(<Page />);
    await screen.findByText("data:foo");
    expect(count).toBe(1);
  });

  it("uses local cache when provided", async () => {
    let count = 0;
    function fetcher<TOptions>(key: string, options: TOptions) {
      ++count;
      return createResponse(fetch(key));
    }

    const cache = new Map();

    const spy = vi.spyOn(cache, "set");

    const provider = () => cache;

    function Page() {
      const { cache, mutate } = useSWRConfig();
      const client = React.useMemo(() => {
        const fetcherWithMiddleware = withMiddleware(fetcher, [
          createSWRMiddleware({ cache, mutate }),
        ]);
        return createClient<typeof router>("/api")(fetcherWithMiddleware);
      }, []);

      const { data } = useQuery(client.query.users.getUser());
      return <div>data:{data}</div>;
    }

    expect(count).toBe(0);
    renderWithConfig(<Page />, { provider });
    await screen.findByText("data:foo");
    expect(count).toBe(1);
    expect(spy).toHaveBeenCalled();
  });
});
