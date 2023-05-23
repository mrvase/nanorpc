<p align="center">
  <h1 align="center">nanorpc</h1>
  <h4 align="center">Typesafe APIs have never been simpler</h4>
</p>

---

## Introduction

`nanorpc` is a library for creating typesafe APIs with TypeScript. It is heavily inspired by [tRPC](https://github.com/trpc/trpc), but explores possibilities for an even simpler developer experience while being sufficient for most apps and sites.

## Features

- **Tiny**. Client library is ~1.5 kb minified and `swr` adapter is ~1kb.
- **Typesafe**. Like `tRPC`, **_inputs_** are inferred from your (zod) validation and **_outputs_** are inferred from your function return type. Unlike `tRPC`, all **_error codes_** that a function might produce are inferred so your client code is always aware of the errors it should deal with.
- **Composable**. Build your procedures with the `schema`, `middleware`, `query`, and `mutate` methods. Build partial procedures and compose them with the `use` method.
- **Simple**. Your RPCs are just functions, without wrappers and extra methods, and your routers are just regular objects that stitch together your functions. The API for calling your RPCs is similar on the server and on the client.
- **Integrates with SWR**. Wrap your functions in the useQuery or useMutation hooks to get all the features of [@vercel/swr](https://github.com/vercel/swr). Even your non-wrapped function calls can easily be integrated with the `swr` cache.
