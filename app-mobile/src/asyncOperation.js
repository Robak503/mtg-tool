export function operationError(code) {
  return Object.assign(new Error(code), { code });
}

// Bound the caller's wait even if an optional native command never settles.
// Native cancellation is separate; a timeout does not imply native work stopped.
export function boundedOperation(work, { signal, timeoutMs = 15000 } = {}) {
  if (signal?.aborted) return Promise.reject(operationError("cancelled"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () => finish(reject, operationError("cancelled"));
    const timer = setTimeout(() => finish(reject, operationError("timeout")), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => {
      if (signal?.aborted) throw operationError("cancelled");
      return work();
    }).then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}
