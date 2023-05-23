# `@nanorpc/client`

## Installation

```bash
# npm
npm install @nanorpc/client

# yarn
yarn add @nanorpc/client

# pnpm
pnpm add @nanorpc/client
```

## Basic setup

This setup imports the type of your router to get end-to-end typesafety. See [@nanorpc/server](https://github.com/mrvase/nanorpc/tree/main/packages/server) to learn more.

```ts
import { createClient, isError, withMiddleware } from "@nanorpc/client";
import { SWRCacheMiddleware } from "@nanorpc/client/swr";
import type { Router } from "./server";

let fetcher = async (key, options) => {
  return await fetch(key, options).then((res) => res.json());
};

// Optionally use the SWR cache middleware
// to store and retrieve data from the cache
fetcher = withMiddleware(fetcher, [SWRCacheMiddleware]);

export const { query, mutate } = createClient<Router>("/api")(fetcher);
```

### Call your remote procedure

```ts
async function getPost(id: string) {
  // Get the fully typed post
  const response = await query.getPost(id);

  // If it responds with an error, log it and return undefined
  if (isError(response)) {
    console.error(response.error);
    return;
  }

  return response;
}
```

## Example with `React` and `swr`

```tsx
import { useQuery, useMutation } from "@nanorpc/client/swr";
import { query, mutate } from "./client";

const errors = {
  NOT_FOUND: "This post does not exist",
  SERVER_ERROR: "Something unexpected happened. Please try again later",
};

export default function Post({ id }: { id: string }) {
  const post = useQuery(query.posts.getPost(id));

  if (post.error === "NOT_FOUND") {
    const createPost = async () => {
      await mutate.posts.createPost({ id });
      post.update();
    };

    return <button onClick={createPost}>Create post</button>;
  }

  if (post.error) {
    return <>Error: {errors[post.error]}</>;
  }

  if (!post.data) {
    return <>Loading...</>;
  }

  return <h1>{post.data.title}</h1>;
}
```
