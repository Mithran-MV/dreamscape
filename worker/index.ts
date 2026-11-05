// Background worker: runs the dream pipeline and the nightly job. For now it only proves it's alive.
const started = new Date();

function heartbeat() {
  const minutes = Math.round((Date.now() - started.getTime()) / 60_000);
  console.log(`[worker] alive, up ${minutes} min`);
}

heartbeat();
setInterval(heartbeat, 60_000);
