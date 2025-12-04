# @naylence/vue

Vue integration for Naylence Fame Fabric.

## Installation

```bash
npm install @naylence/vue vue
```

## Usage

Wrap your Vue app with `FabricProvider` to manage a long-lived `FameFabric` instance:

```vue
<template>
  <FabricProvider :opts="fabricOpts">
    <AppContent />
  </FabricProvider>
</template>

<script setup lang="ts">
import { FabricProvider } from '@naylence/vue';

const fabricOpts = {
  // Optional FameFabric.create() options
};
</script>
```

### useFabric

Access the current fabric and its status:

```ts
import { computed } from 'vue';
import { useFabric } from '@naylence/vue';

export function useFabricStatus() {
  const { fabric, status, error } = useFabric();

  return {
    isReady: computed(() => status.value === 'ready'),
    fabric,
    status,
    error,
  };
}
```

### useFabricEffect

Run logic only when the fabric is ready (with optional dependencies):

```ts
import { ref } from 'vue';
import { useFabricEffect } from '@naylence/vue';

const userId = ref<string | null>(null);

useFabricEffect(
  (fabric) => {
    console.log('Fabric ready', fabric);
    if (userId.value) {
      // Perform work that needs both fabric + userId
    }

    return () => {
      console.log('Cleanup when fabric changes or component unmounts');
    };
  },
  [userId]
);
```

### useRemoteAgent

Get a reactive remote agent proxy by address:

```ts
import { computed } from 'vue';
import { useRemoteAgent } from '@naylence/vue';

const agent = useRemoteAgent<MyAgent>('my-agent@fame.fabric');

const statusText = computed(() => {
  if (!agent.value) return 'Connecting...';
  return 'Agent ready';
});
```

## API

### `FabricProvider`

Props:
- `opts?: FabricOpts` - Optional configuration passed to `FameFabric.create()`.

### `useFabric()`

Returns refs:
- `fabric: Ref<FameFabric | null>`
- `status: Ref<'idle' | 'connecting' | 'ready' | 'error'>`
- `error: Ref<unknown>`

Throws if called outside of `<FabricProvider>`.

### `useFabricEffect(effect, deps?, options?)`

Parameters:
- `effect: (fabric: FameFabric) => void | (() => void | Promise<void>)` - Called when fabric is ready.
- `deps?: WatchSource[]` - Optional additional reactive dependencies to re-run the effect.
- `options?: WatchOptions` - Optional watch configuration.

Returns a stop handle for the watch.

### `useRemoteAgent<T>(address)`

Parameters:
- `address: string | FameAddress | Ref<string | FameAddress>` - Address of the remote agent.

Returns: `ComputedRef<AgentProxy<T> | null>` - The agent proxy (null until the fabric is ready).

## Scripts

- `npm run build` - Build the library with tsup.
- `npm test` - Run unit tests with Vitest.
- `npm run lint` - Lint source files.

## Examples

Vue sample apps live in `examples/`:
- `examples/hello` – two-node hello world with a simple echo agent
- `examples/hello-3node` – client → sentinel → agent chain
- `examples/rpc` – math RPC with streaming Fibonacci

To run one:
```bash
cd examples/<name>
npm install
npm run dev
```

## License

Apache-2.0
