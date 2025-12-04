import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref, type Ref, type ComputedRef } from "vue";
import { FameFabric } from "@naylence/core";
import { Agent, type AgentProxy } from "@naylence/agent-sdk";
import {
  FabricProvider,
  useFabric,
  useFabricEffect,
  useRemoteAgent,
  type FabricProviderProps,
  type FabricStatus,
  type FabricContextValue,
} from "../index";

function buildMockFabric() {
  return {
    enter: vi.fn().mockResolvedValue(undefined),
    exit: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    invoke: vi.fn(),
    invokeByCapability: vi.fn(),
    invokeStream: vi.fn(),
    invokeByCapabilityStream: vi.fn(),
    subscribe: vi.fn(),
    serve: vi.fn(),
    resolveServiceByCapability: vi.fn(),
  };
}

function buildMockAgentProxy() {
  return {
    runTask: vi.fn().mockResolvedValue({ result: "test" }),
    startTask: vi.fn(),
    getTaskStatus: vi.fn(),
    cancelTask: vi.fn(),
    subscribeToTaskUpdates: vi.fn(),
    unsubscribeTask: vi.fn(),
    registerPushEndpoint: vi.fn(),
    getPushNotificationConfig: vi.fn(),
  } as unknown as AgentProxy<Agent>;
}

vi.mock("@naylence/core", () => ({
  FameFabric: {
    create: vi.fn().mockResolvedValue(buildMockFabric()),
  },
}));

vi.mock("@naylence/agent-sdk", () => ({
  Agent: {
    remoteByAddress: vi
      .fn()
      .mockImplementation(
        () => buildMockAgentProxy() as unknown as AgentProxy<Agent>,
      ),
  },
}));

const resetDefaultMocks = () => {
  vi.mocked(FameFabric.create).mockReset();
  vi.mocked(FameFabric.create).mockResolvedValue(
    buildMockFabric() as unknown as FameFabric,
  );

  vi.mocked(Agent.remoteByAddress).mockReset();
  vi.mocked(Agent.remoteByAddress).mockImplementation(
    () => buildMockAgentProxy() as unknown as AgentProxy<Agent>,
  );
};

beforeEach(() => {
  resetDefaultMocks();
});

type FabricCtx = FabricContextValue;
type RemoteAgentRef<T extends Agent = Agent> = ComputedRef<AgentProxy<T> | null>;

function expectCtx(ctx: FabricCtx | undefined): asserts ctx is FabricCtx {
  expect(ctx).toBeDefined();
}

const mountWithProvider = (
  child: ReturnType<typeof defineComponent>,
  opts?: FabricProviderProps["opts"],
) =>
  mount(
    defineComponent({
      setup() {
        return () => h(FabricProvider, { opts }, { default: () => h(child) });
      },
    }),
  );

describe("FabricProvider", () => {
  it("should provide fabric context to children", async () => {
    let ctx!: FabricCtx;
    const Consumer = defineComponent({
      setup() {
        ctx = useFabric();
        return () => null;
      },
    });

    mountWithProvider(Consumer);

    expectCtx(ctx);
    expect(ctx.status.value).toBe("connecting");
    expect(ctx.fabric.value).toBeNull();

    await flushPromises();

    expectCtx(ctx);
    expect(ctx.status.value).toBe("ready");
    expect(ctx.fabric.value).toBeTruthy();
    expect(ctx.error.value).toBeNull();
    expect(FameFabric.create).toHaveBeenCalledTimes(1);
  });

  it("should call fabric.enter() on mount", async () => {
    const mockEnter = vi.fn().mockResolvedValue(undefined);
    const mockFabric: Partial<FameFabric> = {
      enter: mockEnter,
      exit: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(FameFabric.create).mockResolvedValue(mockFabric as FameFabric);

    let ctx!: FabricCtx;
    const Consumer = defineComponent({
      setup() {
        ctx = useFabric();
        return () => null;
      },
    });

    mountWithProvider(Consumer);

    await flushPromises();

    expect(mockEnter).toHaveBeenCalledTimes(1);
    expectCtx(ctx);
    expect(ctx.fabric.value).toBe(mockFabric);
  });

  it("should call fabric.exit() on unmount", async () => {
    const mockExit = vi.fn().mockResolvedValue(undefined);
    const mockFabric: Partial<FameFabric> = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: mockExit,
    };
    vi.mocked(FameFabric.create).mockResolvedValue(mockFabric as FameFabric);

    const Consumer = defineComponent({
      setup() {
        useFabric();
        return () => null;
      },
    });

    const wrapper = mountWithProvider(Consumer);

    await flushPromises();
    wrapper.unmount();
    await flushPromises();

    expect(mockExit).toHaveBeenCalledTimes(1);
  });

  it("should handle fabric creation errors", async () => {
    const error = new Error("Creation failed");
    vi.mocked(FameFabric.create).mockRejectedValue(error);

    let ctx!: FabricCtx;
    const Consumer = defineComponent({
      setup() {
        ctx = useFabric();
        return () => null;
      },
    });

    mountWithProvider(Consumer);

    await flushPromises();

    expectCtx(ctx);
    expect(ctx.status.value).toBe("error");
    expect(ctx.error.value).toBe(error);
    expect(ctx.fabric.value).toBeNull();
  });

  it("should handle fabric enter errors", async () => {
    const error = new Error("Enter failed");
    const mockFabric: Partial<FameFabric> = {
      enter: vi.fn().mockRejectedValue(error),
      exit: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(FameFabric.create).mockResolvedValue(mockFabric as FameFabric);

    let ctx!: FabricCtx;
    const Consumer = defineComponent({
      setup() {
        ctx = useFabric();
        return () => null;
      },
    });

    mountWithProvider(Consumer);

    await flushPromises();

    expectCtx(ctx);
    expect(ctx.status.value).toBe("error");
    expect(ctx.error.value).toBe(error);
  });

  it("should pass opts to FameFabric.create", async () => {
    const opts = { rootConfig: { some: "config" } };

    mountWithProvider(
      defineComponent({
        setup() {
          useFabric();
          return () => null;
        },
      }),
      opts,
    );

    await flushPromises();

    expect(FameFabric.create).toHaveBeenCalledWith(opts);
  });

  it("should recreate fabric when opts change", async () => {
    const opts1 = { rootConfig: { version: 1 } };
    const opts2 = { rootConfig: { version: 2 } };

    const optsRef: Ref<FabricProviderProps["opts"]> = ref(opts1);

    const wrapper = mount(
      defineComponent({
        setup() {
          const Consumer = defineComponent({
            setup() {
              useFabric();
              return () => null;
            },
          });

          return () =>
            h(
              FabricProvider,
              { opts: optsRef.value },
              { default: () => h(Consumer) },
            );
        },
      }),
    );

    await flushPromises();
    expect(FameFabric.create).toHaveBeenCalledWith(opts1);

    optsRef.value = opts2;
    await flushPromises();

    expect(FameFabric.create).toHaveBeenCalledWith(opts2);
    expect(FameFabric.create).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });
});

describe("useFabric", () => {
  it("should throw error when used outside FabricProvider", () => {
    expect(() => {
      mount(
        defineComponent({
          setup() {
            useFabric();
            return () => null;
          },
        }),
      );
    }).toThrow("useFabric must be used inside a <FabricProvider>.");
  });

  it("should return fabric context refs", async () => {
    let ctx!: FabricCtx;
    const Consumer = defineComponent({
      setup() {
        ctx = useFabric();
        return () => null;
      },
    });

    mountWithProvider(Consumer);
    await flushPromises();

    expectCtx(ctx);
    expect(ctx.fabric.value).toBeTruthy();
    expect(ctx.status.value).toBe("ready");
    expect(ctx.error.value).toBeNull();
  });
});

describe("useFabricEffect", () => {
  it("should run effect when fabric is ready and clean up on unmount", async () => {
    const cleanup = vi.fn();
    const effectFn = vi.fn(() => cleanup);

    const Consumer = defineComponent({
      setup() {
        useFabricEffect(effectFn);
        return () => null;
      },
    });

    const wrapper = mountWithProvider(Consumer);
    await flushPromises();

    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(effectFn).toHaveBeenCalledWith(expect.any(Object));

    wrapper.unmount();
    await flushPromises();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("should not run effect when fabric initialization fails", async () => {
    const error = new Error("Not ready");
    vi.mocked(FameFabric.create).mockRejectedValue(error);

    const effectFn = vi.fn();

    const Consumer = defineComponent({
      setup() {
        useFabricEffect(effectFn);
        return () => null;
      },
    });

    mountWithProvider(Consumer);
    await flushPromises();

    expect(effectFn).not.toHaveBeenCalled();
  });

  it("should rerun effect when dependencies change", async () => {
    const effectFn = vi.fn();
    const dep = ref(1);

    const Consumer = defineComponent({
      setup() {
        useFabricEffect(effectFn, [dep]);
        return () => null;
      },
    });

    mountWithProvider(Consumer);
    await flushPromises();

    expect(effectFn).toHaveBeenCalledTimes(1);

    dep.value = 2;
    await flushPromises();

    expect(effectFn).toHaveBeenCalledTimes(2);
  });
});

describe("useRemoteAgent", () => {
  it("should return null when fabric is not ready", async () => {
    const error = new Error("Not ready");
    vi.mocked(FameFabric.create).mockRejectedValue(error);

    let agent!: RemoteAgentRef | null;
    const Consumer = defineComponent({
      setup() {
        agent = useRemoteAgent("test@fame.fabric");
        return () => null;
      },
    });

    mountWithProvider(Consumer);
    await flushPromises();

    expect(agent?.value).toBeNull();
  });

  it("should return agent proxy when fabric is ready", async () => {
    let agent!: RemoteAgentRef | null;
    const Consumer = defineComponent({
      setup() {
        agent = useRemoteAgent("test@fame.fabric");
        return () => null;
      },
    });

    mountWithProvider(Consumer);
    await flushPromises();

    expect(agent).not.toBeNull();
    expect(agent!.value).toBeTruthy();
    expect(Agent.remoteByAddress).toHaveBeenCalled();
  });

  it("should memoize agent for the same address and recreate when it changes", async () => {
    const address = ref("test1@fame.fabric");
    let agent!: RemoteAgentRef | null;

    const Consumer = defineComponent({
      setup() {
        agent = useRemoteAgent(address);
        return () => null;
      },
    });

    mountWithProvider(Consumer);
    await flushPromises();

    expect(agent).not.toBeNull();
    const firstAgent = agent!.value;

    address.value = "test2@fame.fabric";
    await flushPromises();

    expect(agent).not.toBeNull();
    expect(agent!.value).not.toBe(firstAgent);
  });
});

describe("Type exports", () => {
  it("should export FabricStatus type", () => {
    const statuses: FabricStatus[] = ["idle", "connecting", "ready", "error"];
    expect(statuses).toHaveLength(4);
  });
});
