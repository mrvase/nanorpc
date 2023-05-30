import { NextRequest } from "next/server";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Router, CreateContext } from "..";
import { handleRequest } from "../request";
export type { NextRequest, NextApiRequest, NextApiResponse };

export const createAPIRoute = <T extends Router>(
  router: T,
  options: {
    route?: string[];
    createContext?: CreateContext<NextApiRequest, NextApiResponse>;
  }
) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const { route } = req.query;

    let body = undefined;

    if (req.method === "POST") {
      try {
        body = JSON.parse(req.body);
      } catch (err) {}
    }

    const { status, data } = await handleRequest(router, {
      method: req.method as "GET" | "POST" | "OPTIONS",
      url: req.url!,
      route: [...(options.route ?? []), ...((route as string[]) ?? [])],
      body,
      context: options.createContext?.({ request: req, response: res }) ?? {},
    });

    res.status(status ?? 200).json(data);

    res.end();
  };
};

export const createRouteHandler = <T extends Router>(
  router: T,
  options: {
    route?: string[];
    createContext?: CreateContext<NextRequest, Response>;
  }
) => {
  const createEndpoint =
    (method: "GET" | "POST" | "OPTIONS") =>
    async (req: NextRequest, context: { params: Record<string, string[]> }) => {
      const { route } = context?.params ?? {};

      let body = undefined;

      if (method === "POST") {
        try {
          body = await req.json();
        } catch (err) {}
      }

      const response = new Response();

      const { status, data } = await handleRequest(router, {
        method: req.method as "GET" | "POST" | "OPTIONS",
        url: req.url!,
        route: [...(options.route ?? []), ...((route as string[]) ?? [])],
        body,
        context: options.createContext?.({ request: req, response }) ?? {},
      });

      return new Response(JSON.stringify(data) ?? null, {
        status,
        headers: response.headers,
      });
    };

  return {
    GET: createEndpoint("GET"),
    POST: createEndpoint("POST"),
    OPTIONS: createEndpoint("OPTIONS"),
  };
};
