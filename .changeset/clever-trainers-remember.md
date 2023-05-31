---
"@nanorpc/server": patch
---

Accumulate middlewares and schemas with sets so that when the same middleware is used again (e.g. if two pieces of middleware are used, but they are also both made on top of the same piece of middleware), then the function is only called once
