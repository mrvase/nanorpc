# @nanorpc/client

## 0.0.17

### Patch Changes

- 4290229: Do not revalidate when writing to cache outside hooks

## 0.0.16

### Patch Changes

- 5bc52b9: Fix exports from entry points other than main. Now actual files are used instead of the "typesVersions" config

## 0.0.15

### Patch Changes

- 8a353df: Let entries in dedupe middleware cache stay longer

## 0.0.14

### Patch Changes

- 454fe09: Fix that SWR middleware accesses "data" prop twice on cache entry so that it returns undefined

## 0.0.13

## 0.0.12

### Patch Changes

- 58e0c4d: Handle input correctly on OPTIONS request

## 0.0.11

### Patch Changes

- 34510c4: Add input as parameter on native callbacks

## 0.0.10

### Patch Changes

- dba209f: Add native onSuccess and onError callbacks to mutations as well as queries

## 0.0.9

### Patch Changes

- f40a3f5: Rename "query" method from useQuery to "revalidate" and add setData method - both use SWR's mutate method underneath but separate its dual concern

## 0.0.8

### Patch Changes

- b2d21ec: Add typesafe cache access
- 628b660: Add native onSuccess and onError callbacks

## 0.0.7

### Patch Changes

- 8d1f3c2: Add support for SWR hook options and useSWRImmutable
- 5325523: Expose "key" method on a query promise that gives the cache key

## 0.0.6

## 0.0.5

## 0.0.4

### Patch Changes

- 638301b: Use JSON stringify instead of qs

## 0.0.3

### Patch Changes

- 2a08005: Support local cache provided by user

## 0.0.2

### Patch Changes

- f626c5d: Add fetch deduplication middleware to swr
