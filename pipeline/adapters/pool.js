// Runs `fn` over `items` with at most `concurrency` in flight.
export async function mapPool(items, concurrency, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
