import type { InternalProcedureOptions, Procedure, Router } from ".";
import { getUnknownErrorMessage, modifyTypes } from "./utils";
import { RPCError } from "./error";

const getInputFromUrl = (url: string | undefined) => {
  const query = (url ?? "").split("?")[1];
  if (!query) return { input: undefined };
  const params = new URLSearchParams(query);
  const parsedQuery = {
    input: JSON.parse(decodeURIComponent(params.get("input")!)),
  };
  return parsedQuery;
};

const getInput = (req: { method: string; url: string; body?: any }) => {
  if (req.method === "GET") {
    return modifyTypes(getInputFromUrl(req.url));
  }
  if (req.method === "POST") {
    return {
      ctx: modifyTypes(getInputFromUrl(req.url))?.ctx ?? {},
      input: req.body?.input,
    };
  }
  if (req.method === "OPTIONS") {
    return {
      ctx: {},
      input: undefined,
    };
  }
  return undefined;
};

export async function handleRequest<T extends Router>(
  router: T,
  {
    method,
    body,
    url,
    context,
    route,
  }: {
    method: "GET" | "POST" | "OPTIONS";
    url: string;
    context: object;
    body?: { input: any; ctx?: object };
    route: string[];
  }
): Promise<{ data?: any; status?: number }> {
  if (
    !route ||
    !Array.isArray(route) ||
    route.some((el) => typeof el !== "string")
  ) {
    return {
      data: { error: `Invalid route`, code: "NOT_FOUND" },
      status: 404,
    };
  }

  const { input, ctx: contextFromClient } = getInput({ method, url, body });

  Object.assign(context, contextFromClient);

  const [name] = route.splice(route.length - 1, 1);
  const parent = route.reduce((acc: Router, el) => acc?.[el] as Router, router);
  const func = parent?.[name] as Procedure<any, any, any, any, any>;

  if (!func) {
    console.error(`Route not found: ${route.join("/")}`);
    return {
      data: {
        error: "NOT_FOUND",
      },
      status: 404,
    };
  }

  let result: any;

  const options: InternalProcedureOptions = {
    onlyMiddleware: method === "OPTIONS",
    throwOnError: true,
  };

  try {
    result = await (func as any)(input, context, options);
  } catch (err) {
    if (err instanceof RPCError) {
      return {
        data: { error: err.error, message: err.message },
        status: err.status || 500,
      };
    }
    console.error("UNKNOWN RPC ERROR [2]:", err);
    return {
      data: { error: "SERVER_ERROR" },
      status: 500,
    };
  }

  if (method === "OPTIONS") {
    return {
      status: 200,
    };
  }

  return {
    data: result,
  };
}
