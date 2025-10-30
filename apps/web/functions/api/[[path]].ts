// Cloudflare Pages Function to proxy API calls to Worker

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);

  // Build Worker URL (remove /api prefix)
  const workerUrl = `https://sas-worker-production.kevin-mcgovern.workers.dev${url.pathname.replace('/api', '')}${url.search}`;

  // Construct a clean request to avoid forwarding browser/CF headers that can
  // interfere with routing. Only pass essentials.
  const headers = new Headers();
  const incomingContentType = request.headers.get('content-type');
  if (incomingContentType) headers.set('content-type', incomingContentType);
  headers.set('accept', 'application/json, */*');
  headers.set('cache-control', 'no-cache');

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'follow'
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // Re-stream body only for methods that can have a body
    init.body = request.body;
  }

  const response = await fetch(workerUrl, init);

  // Graceful handling for positions endpoint: map non-200 to empty list
  const isPositions = url.pathname.endsWith('/api/broker/positions');
  if (isPositions && !response.ok) {
    return new Response(JSON.stringify({ positions: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  // Return the response
  return response;
};

