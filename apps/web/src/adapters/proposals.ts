/**
 * Proposals API Adapter
 * Fetches proposals from Worker API
 */

export type Proposal = {
  id: number;
  created_at: number;
  symbol: string;
  strategy: string;
  action: 'BUY' | 'SELL';
  entry_type: 'CREDIT_SPREAD' | 'DEBIT_CALL';
  entry_price: number;
  target_price: number;
  stop_price: number;
  legs_json: string;
  qty: number;
  pop?: number | null;
  rr?: number | null;
  score?: number | null;
  status: string;
  rationale?: string;
};

export async function fetchProposals(base = ''): Promise<Proposal[]> {
  const url = base ? `${base}/proposals` : '/api/proposals';
  const res = await fetch(url, { credentials: 'include' });
  
  if (!res.ok) {
    throw new Error(`Failed to load proposals: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}

