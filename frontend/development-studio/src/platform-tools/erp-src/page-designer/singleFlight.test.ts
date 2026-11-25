import { describe, expect, it } from "vitest";
import { runSingleFlight, type FlightSlot } from "./singleFlight";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("runSingleFlight", () => {
  it("süren iş varken ikinci iş başlamaz; bekleyen sonra çalışır", async () => {
    const slot: FlightSlot<string> = { current: null };
    const first = deferred<string>();
    let active = 0;
    let overlapped = false;
    const task = (result: Promise<string>) => async () => {
      active++;
      if (active > 1) overlapped = true;
      try { return await result; } finally { active--; }
    };
    const a = runSingleFlight(slot, task(first.promise));
    const b = runSingleFlight(slot, task(Promise.resolve("b")));
    await Promise.resolve();
    expect(active).toBe(1);
    first.resolve("a");
    expect(await a).toBe("a");
    expect(await b).toBe("b");
    expect(overlapped).toBe(false);
    expect(slot.current).toBeNull();
  });

  it("bekleyen çağıran afterWait değer dönerse işi çalıştırmaz", async () => {
    const slot: FlightSlot<string | null> = { current: null };
    const first = deferred<string | null>();
    let calls = 0;
    const a = runSingleFlight(slot, () => { calls++; return first.promise; });
    const b = runSingleFlight(slot, async () => { calls++; return "yeni"; }, () => "son kayıt");
    first.resolve("a");
    await a;
    expect(await b).toBe("son kayıt");
    expect(calls).toBe(1);
  });

  it("afterWait undefined dönerse iş sırayla çalışır", async () => {
    const slot: FlightSlot<string> = { current: null };
    const first = deferred<string>();
    const a = runSingleFlight(slot, () => first.promise);
    const b = runSingleFlight(slot, async () => "ikinci", () => undefined);
    first.resolve("a");
    await a;
    expect(await b).toBe("ikinci");
  });

  it("beklemeden çalışan çağıranda afterWait çağrılmaz", async () => {
    const slot: FlightSlot<string> = { current: null };
    let asked = false;
    expect(await runSingleFlight(slot, async () => "tek", () => { asked = true; return "x"; })).toBe("tek");
    expect(asked).toBe(false);
  });

  it("önceki işin hatası bekleyeni durdurmaz, yuva boşalır", async () => {
    const slot: FlightSlot<string> = { current: null };
    const first = deferred<string>();
    const a = runSingleFlight(slot, () => first.promise);
    const b = runSingleFlight(slot, async () => "sonra");
    first.reject(new Error("409"));
    await expect(a).rejects.toThrow("409");
    expect(await b).toBe("sonra");
    expect(slot.current).toBeNull();
  });

  it("aynı anda bekleyen üç çağıran sırayla, tek tek çalışır", async () => {
    const slot: FlightSlot<number> = { current: null };
    const first = deferred<number>();
    const order: number[] = [];
    let active = 0;
    let overlapped = false;
    const make = (n: number) => async () => {
      active++; if (active > 1) overlapped = true;
      order.push(n);
      await Promise.resolve();
      active--;
      return n;
    };
    const a = runSingleFlight(slot, () => first.promise);
    const rest = [runSingleFlight(slot, make(2)), runSingleFlight(slot, make(3)), runSingleFlight(slot, make(4))];
    first.resolve(1);
    expect(await a).toBe(1);
    expect((await Promise.all(rest)).sort()).toEqual([2, 3, 4]);
    expect(order).toHaveLength(3);
    expect(overlapped).toBe(false);
  });
});
