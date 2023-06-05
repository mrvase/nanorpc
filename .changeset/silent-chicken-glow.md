---
"@nanorpc/client": patch
---

Fix that SWR middleware accesses "data" prop twice on cache entry so that it returns undefined
