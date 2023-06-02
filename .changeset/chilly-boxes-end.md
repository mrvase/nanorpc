---
"@nanorpc/client": patch
---

Rename "query" method from useQuery to "revalidate" and add setData method - both use SWR's mutate method underneath but separate its dual concern
