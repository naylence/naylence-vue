import {
  computed,
  defineComponent,
  inject,
  onBeforeUnmount,
  onScopeDispose,
  provide,
  shallowRef,
  type ComputedRef,
  type PropType,
  type Ref,
  type WatchOptions,
  type WatchSource,
  unref,
  watch,
} from "vue";
import { FameFabric, type FameAddress } from "@naylence/core";
import { Agent, type AgentProxy } from "@naylence/agent-sdk";

// Type for FameFabric.create() options parameter
type FabricOpts = Parameters<typeof FameFabric.create>[0];

// Fabric status union type
type FabricStatus = "idle" | "connecting" | "ready" | "error";

// Context value type
interface FabricContextValue {
  fabric: Ref<FameFabric | null>;
  status: Ref<FabricStatus>;
  error: Ref<unknown>;
}

// Provider props
interface FabricProviderProps {
  opts?: FabricOpts;
}

const FabricSymbol = Symbol("FabricContext");

/**
 * FabricProvider component that manages the lifecycle of a FameFabric instance.
 *
 * Creates a single FameFabric on mount, calls enter(), keeps it entered for the
 * lifetime of the provider, and calls exit() on unmount or when opts change.
 */
export const FabricProvider = defineComponent({
  name: "FabricProvider",
  props: {
    opts: {
      type: Object as PropType<FabricOpts | undefined>,
      required: false,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    const fabric = shallowRef<FameFabric | null>(null);
    const status = shallowRef<FabricStatus>("idle");
    const error = shallowRef<unknown>(null);

    const currentFabric = shallowRef<FameFabric | null>(null);
    const cleanupPromise = shallowRef<Promise<void> | null>(null);

    let runId = 0;
    let destroyed = false;

    const setCleanupPromise = (promise: Promise<void> | null) => {
      if (!promise) {
        cleanupPromise.value = null;
        return null;
      }

      cleanupPromise.value = promise.finally(() => {
        if (cleanupPromise.value === promise) {
          cleanupPromise.value = null;
        }
      });

      return cleanupPromise.value;
    };

    const waitForCleanup = async () => {
      if (cleanupPromise.value) {
        try {
          await cleanupPromise.value;
        } catch (err) {
          console.error("[FabricProvider] Cleanup error", err);
        }
      }
    };

    const cleanupFabric = (instance: FameFabric | null) => {
      if (!instance) {
        return null;
      }

      const promise = instance.exit?.().catch((err: unknown) => {
        console.error("[FabricProvider] Error during fabric exit:", err);
      });

      return setCleanupPromise(promise ?? null);
    };

    const initializeFabric = async (opts?: FabricOpts) => {
      const thisRun = ++runId;

      status.value = "connecting";
      error.value = null;
      fabric.value = null;

      await waitForCleanup();

      // Exit any in-flight fabric before creating a new one
      if (currentFabric.value) {
        const prior = currentFabric.value;
        currentFabric.value = null;
        await cleanupFabric(prior);
      }

      if (destroyed || thisRun !== runId) {
        return;
      }

      let newFabric: FameFabric | null = null;

      try {
        newFabric =
          opts === undefined
            ? await (FameFabric.create as () => Promise<FameFabric>)()
            : await (
                FameFabric.create as (o: FabricOpts) => Promise<FameFabric>
              )(opts);

        if (destroyed || thisRun !== runId) {
          await newFabric.exit?.();
          return;
        }

        currentFabric.value = newFabric;

        await newFabric.enter();

        if (destroyed || thisRun !== runId) {
          await newFabric.exit?.();
          currentFabric.value = null;
          return;
        }

        fabric.value = newFabric;
        status.value = "ready";
      } catch (err) {
        if (newFabric) {
          currentFabric.value = null;
          await cleanupFabric(newFabric);
        }

        if (!destroyed && thisRun === runId) {
          status.value = "error";
          error.value = err;
          fabric.value = null;
        }
      }
    };

    watch(
      () => props.opts,
      (opts) => {
        void initializeFabric(opts);
      },
      { immediate: true, deep: true },
    );

    onBeforeUnmount(() => {
      destroyed = true;
      const instance = currentFabric.value ?? fabric.value;
      currentFabric.value = null;
      fabric.value = null;
      cleanupFabric(instance ?? null);
    });

    const ctx: FabricContextValue = { fabric, status, error };

    provide(FabricSymbol, ctx);

    return () => (slots.default ? slots.default() : null);
  },
});

/**
 * useFabric composable to access the current fabric context.
 *
 * @throws Error if used outside of a FabricProvider
 * @returns The current fabric context refs
 */
export function useFabric(): FabricContextValue {
  const ctx = inject<FabricContextValue | null>(FabricSymbol, null);
  if (!ctx) {
    throw new Error("useFabric must be used inside a <FabricProvider>.");
  }
  return ctx;
}

/**
 * useFabricEffect composable that runs a callback only when the fabric is ready.
 *
 * @param effect - Effect function that receives the fabric instance
 * @param options - Optional Vue watch options
 * @returns A stop handle for the underlying watch
 */
export function useFabricEffect(
  effect: (fabric: FameFabric) => void | (() => void | Promise<void>),
  deps: ReadonlyArray<WatchSource<unknown>> = [],
  options: WatchOptions = {},
): () => void {
  const { fabric, status } = useFabric();
  let cleanup: (() => void | Promise<void>) | undefined;

  const stop = watch(
    [fabric, status, ...deps],
    ([fabricVal, statusVal], _old, onCleanup) => {
      if (statusVal === "ready" && fabricVal) {
        const result = effect(fabricVal);
        cleanup = typeof result === "function" ? result : undefined;

        if (cleanup) {
          onCleanup(() => {
            const maybePromise = cleanup?.();
            cleanup = undefined;
            return maybePromise;
          });
        }
      }
    },
    { immediate: true, deep: false, ...options },
  );

  onScopeDispose(() => {
    if (cleanup) {
      void cleanup();
      cleanup = undefined;
    }
    stop();
  });

  return stop;
}

/**
 * Creates a remote agent proxy for the given address using the provided fabric.
 *
 * @template T - Type of the agent interface extending Agent
 * @param address - The FameAddress of the remote agent
 * @returns A computed AgentProxy that updates when fabric or address changes
 */
export function useRemoteAgent<T extends Agent = Agent>(
  address: string | FameAddress | Ref<string | FameAddress>,
): ComputedRef<AgentProxy<T> | null> {
  const { fabric, status } = useFabric();

  return computed(() => {
    if (status.value !== "ready" || !fabric.value) {
      return null;
    }

    const resolvedAddress = unref(address);
    return Agent.remoteByAddress<T>(resolvedAddress, { fabric: fabric.value });
  });
}

// Re-export types
export type {
  FabricOpts,
  FabricStatus,
  FabricContextValue,
  FabricProviderProps,
};
