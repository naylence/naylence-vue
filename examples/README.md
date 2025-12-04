# @naylence/vue examples

Vue ports of the @naylence/react demo apps. Each folder is an isolated Vite + Vue 3 project:

- `hello` – two-node hello world (client + sentinel with hello agent)
- `hello-3node` – three-node chain (client → sentinel → agent)
- `rpc` – math RPC sample with streaming Fibonacci

## Running an example

```bash
cd examples/<example-name>
npm install
npm run dev
```

> These projects reference the local `@naylence/vue` source via relative imports (`../../../src/index`). When publishing the package, swap to the npm package name if you prefer.
