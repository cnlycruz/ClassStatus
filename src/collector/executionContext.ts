import { AsyncLocalStorage } from "node:async_hooks";

const collectorWorkerContext = new AsyncLocalStorage<boolean>();

export function isCollectorWorkerExecution(): boolean {
  return collectorWorkerContext.getStore() === true;
}

export function withCollectorWorkerExecution<T>(operation: () => Promise<T>): Promise<T> {
  return collectorWorkerContext.run(true, operation);
}
