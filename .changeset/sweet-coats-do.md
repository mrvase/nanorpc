---
"@nanorpc/server": patch
---

Export core types from server package to fix max serialization length error in Typescript. This makes the library compatible with having the "declaration" option set to true in tsconfig
