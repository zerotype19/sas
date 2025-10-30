import { useEffect, useState } from 'react';
import { ProposalCard } from '../components/ProposalCard';

type Proposal = {
  id: string;
  created_at: string;
  symbol: string;
  bias: string;
  dte: number;
  long_leg: any;
  short_leg: any;
  width: number;
  debit: number;
  max_profit: number;
  rr: number;
  filters: any;
  status: string;
  strategy_version: string;
};

export default function Proposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProposals();
  }, []);

  async function fetchProposals() {
    try {
      const res = await fetch('/api/review');
      const data = await res.json();
      setProposals(data);
    } catch (error) {
      console.error('Failed to fetch proposals:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(proposalId: string, qty: number) {
    try {
      const res = await fetch('/api/act/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId, qty })
      });

      if (res.ok) {
        alert('✓ Position opened');
        // Remove from list
        setProposals(proposals.filter(p => p.id !== proposalId));
      } else {
        const error = await res.json();
        alert(`✗ ${error.error}: ${error.reason || error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Approve error:', error);
      alert('Failed to approve');
    }
  }

  async function handleSkip(proposalId: string) {
    try {
      const res = await fetch('/api/act/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId })
      });

      if (res.ok) {
        // Remove from list
        setProposals(proposals.filter(p => p.id !== proposalId));
      } else {
        alert('Failed to skip');
      }
    } catch (error) {
      console.error('Skip error:', error);
      alert('Failed to skip');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Proposals</h2>
        <p className="text-gray-600">
          New trade opportunities identified by the SAS system
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading proposals...</div>
      ) : proposals.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md p-12 text-center">
          <div className="text-gray-400 text-lg">No pending proposals</div>
          <div className="text-gray-500 text-sm mt-2">
            New opportunities will appear here when signals meet SAS criteria
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onApprove={handleApprove}
              onSkip={handleSkip}
            />
          ))}
        </div>
      )}
    </div>
  );
}

