// Plan gratuito con un solo servicio: WORKER_IN_PROCESS=true corre el worker dentro del servidor web.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.WORKER_IN_PROCESS === "true") {
    const { workerLoop } = await import("./server/worker-loop");
    void workerLoop();
  }
}
