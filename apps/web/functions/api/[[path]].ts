// Cloudflare Pages Function to proxy API calls to Worker

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  
  // Forward to Worker (production), removing /api prefix
  const workerUrl = `https://sas-worker-production.kevin-mcgovern.workers.dev${url.pathname.replace('/api', '')}${url.search}`;
  
  // Clone the request but change the URL
  const modifiedRequest = new Request(workerUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow'
  });
  
  // Forward the request to the Worker
  const response = await fetch(modifiedRequest);
  
  // Return the response
  return response;
};

