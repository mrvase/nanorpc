# @nanorpc/server

## 0.0.18

## 0.0.17

## 0.0.16

### Patch Changes

- e7e0cf7: Export core types from server package to fix max serialization length error in Typescript. This makes the library compatible with having the "declaration" option set to true in tsconfig
- 5bc52b9: Fix exports from entry points other than main. Now actual files are used instead of the "typesVersions" config

## 0.0.15

## 0.0.14

## 0.0.13

### Patch Changes

- ea27911: Do not run validation if onlyMiddleware option is true

## 0.0.12

### Patch Changes

- 58e0c4d: Handle input correctly on OPTIONS request

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
