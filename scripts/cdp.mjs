// CDP request transport only; callers own target selection, sessions, and tabs.
export async function connectCdp(url, timeout = 30000) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(Error('CDP connection failed'));
    socket.onclose = () => reject(Error('CDP connection closed'));
  });
  let nextId = 0, failure;
  const pending = new Map();
  const listeners = new Map();
  function fail(error) {
    failure = error;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
    listeners.clear();
  }
  socket.onerror = () => fail(Error('CDP connection failed'));
  socket.onclose = () => fail(Error('CDP connection closed'));
  socket.onmessage = event => {
    const reply = JSON.parse(event.data);
    if (reply.method) {
      for (const handler of listeners.get(reply.method) || []) handler(reply.params, reply.sessionId);
      return;
    }
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id); clearTimeout(request.timer);
    if (reply.error || reply.result?.exceptionDetails)
      request.reject(Error(JSON.stringify(reply.error || reply.result.exceptionDetails)));
    else request.resolve(reply.result);
  };
  return {
    on(method, handler) {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(handler);
      return () => listeners.get(method)?.delete(handler);
    },
    call(method, params = {}, sessionId) {
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id); reject(Error(`CDP timeout: ${method}`));
        }, timeout);
        pending.set(id, {resolve, reject, timer});
        try { socket.send(JSON.stringify({id, method, params, sessionId})); }
        catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
      });
    },
    close() { fail(Error('CDP connection closed')); socket.close(); }
  };
}
