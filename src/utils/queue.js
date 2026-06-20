export function removeFromQueue(queue, socketId) {
  const idx = queue.indexOf(socketId);
  if (idx !== -1) queue.splice(idx, 1);
}

export function getQueue(state, mode) {
  return mode === "video" ? state.videoQueue : state.chatQueue;
}
