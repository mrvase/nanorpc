import { NextRequest, NextResponse } from "next/server";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Router, CreateContext } from "..";
import { handleRequest } from "../request";
export type { NextRequest, NextResponse, NextApiRequest, NextApiResponse };

export const createAPIRoute = <T extends Router>(
  router: T,
  options: {
    route?: string[];
    createContext?: CreateContext<NextApiRequest, NextApiResponse>;
  }
) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const { route } = req.query;

    const response = await handleRequest(router, {
      method: req.method as "GET" | "POST" | "OPTIONS",
      url: req.url!,
      route: options.route ?? (route as string[]),
      body: req.body ? JSON.parse(req.body) : undefined,
      context: options.createContext?.({ request: req, response: res }) ?? {},
    });

    const { status, data } = response;

    res.status(status ?? 200).json(data);

    res.end();
  };
};

/*
export const createRouteHandler = <T extends Router>(
  router: T,
  routeFromArg?: string[]
) => {
  const createEndpoint =
    (method: "GET" | "POST" | "OPTIONS") =>
    async (req: NextRequest, context: { params: Record<string, string[]> }) => {
      const { route } = context?.params ?? {};

      let body;

      if (method === "POST") {
        try {
          body = await req.json();
        } catch (err) {}
      }

      const request: RPCRequest & { body?: any } = {
        method,
        url: req.url,
        headers: req.headers,
        route: routeFromArg ?? route,
        body,
      };

      const {
        init: { redirect, ...init },
        data,
      } = await handleRequest(request, router);

      if (typeof redirect === "string") {
        return NextResponse.redirect(redirect, init);
      }

      if (!data) {
        return new Response(null, init);
      }

      return NextResponse.json(data, init);
    };

  return {
    GET: createEndpoint("GET"),
    POST: createEndpoint("POST"),
    OPTIONS: createEndpoint("OPTIONS"),
  };
};
*/
