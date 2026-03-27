export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  const workerUrl = 'https://quotebot-worker.quotebot-lynn.workers.dev' + url.pathname + url.search;
  
  return fetch(workerUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.method !== 'GET' ? context.request.body : undefined,
  });
}