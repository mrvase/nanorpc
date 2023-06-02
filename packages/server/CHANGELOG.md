# @nanorpc/server

## 0.0.11

## 0.0.10

### Patch Changes

- 2dbe65b: Remove context as required procedure argument

## 0.0.9

### Patch Changes

- 0004bb7: Set status to 307 on redirect

## 0.0.8

## 0.0.7

## 0.0.6

### Patch Changes

- 509844f: Accumulate middlewares and schemas with sets so that when the same middleware is used again (e.g. if two pieces of middleware are used, but they are also both made on top of the same piece of middleware), then the function is only called once
- f242853: Support combination of static and dynamic route

## 0.0.5

### Patch Changes

- 3d83ef2: Add support for Next.js App Router

## 0.0.4

### Patch Changes

- 638301b: Use JSON stringify instead of qs

## 0.0.3

## 0.0.2

### Patch Changes

- f626c5d: Add fetch deduplication middleware to swr
