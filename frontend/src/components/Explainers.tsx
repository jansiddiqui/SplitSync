import React, { useState } from 'react';
import { X, HelpCircle, RefreshCw, Layers, Calendar, DollarSign } from 'lucide-react';

interface Member {
  id: string;
  name: string;
  email: string;
  joinedAt?: string;
  leftAt?: string | null;
}

interface Expense {
  id: string;
  title: string;
  amount: string;
  paidBy: string;
  createdAt: string;
  currencyCode?: string;
  exchangeRate?: string;
  splits: Array<{
    userId: string;
    amount: string;
    splitType: string;
  }>;
}

interface Settlement {
  id: string;
  amount: string;
  payerId: string;
  receiverId: string;
  createdAt: string;
  currencyCode?: string;
  exchangeRate?: string;
}

interface ExplainersModalProps {
  onClose: () => void;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  baseCurrency: string;
}

export const ExplainersModal: React.FC<ExplainersModalProps> = ({
  onClose,
  members,
  expenses,
  settlements,
  baseCurrency,
}) => {
  const [activeTab, setActiveTab] = useState<'greedy' | 'rounding' | 'currency' | 'timelines'>('greedy');

  const getMemberName = (id: string) => {
    return members.find((m) => m.id === id)?.name || 'Unknown';
  };

  // Helper to convert float to paise
  const toPaise = (num: number) => Math.round(num * 100);

  // 1. Calculate Net Balances and Greedy Path Trace
  const getGreedyTrace = () => {
    const netBalancesPaise: { [userId: string]: number } = {};
    const traceLog: string[] = [];

    members.forEach((m) => {
      netBalancesPaise[m.id] = 0;
    });

    traceLog.push("Initializing ledger: all balances set to zero.");

    // Add expenses
    expenses.forEach((exp) => {
      const payerId = exp.paidBy;
      const rawAmt = parseFloat(exp.amount) || 0;
      const rate = parseFloat(exp.exchangeRate || '1.0');
      const baseAmtPaise = toPaise(parseFloat((rawAmt * rate).toFixed(2)));

      if (netBalancesPaise[payerId] !== undefined) {
        netBalancesPaise[payerId] += baseAmtPaise;
        traceLog.push(
          `Expense "${exp.title}": Payer ${getMemberName(payerId)} credited with base amount of ₹${(baseAmtPaise / 100).toFixed(2)}`
        );
      }

      const splits = exp.splits || [];
      splits.forEach((split) => {
        const splitUserId = split.userId;
        const rawSplitAmt = parseFloat(split.amount) || 0;
        const splitBaseAmtPaise = toPaise(parseFloat((rawSplitAmt * rate).toFixed(2)));

        if (netBalancesPaise[splitUserId] !== undefined) {
          netBalancesPaise[splitUserId] -= splitBaseAmtPaise;
          traceLog.push(
            `Expense "${exp.title}": Participant ${getMemberName(splitUserId)} debited for split share of -₹${(splitBaseAmtPaise / 100).toFixed(2)}`
          );
        }
      });
    });

    // Add settlements
    settlements.forEach((settle) => {
      const payerId = settle.payerId;
      const receiverId = settle.receiverId;
      const rawAmt = parseFloat(settle.amount) || 0;
      const rate = parseFloat(settle.exchangeRate || '1.0');
      const baseAmtPaise = toPaise(parseFloat((rawAmt * rate).toFixed(2)));

      if (netBalancesPaise[payerId] !== undefined) {
        netBalancesPaise[payerId] += baseAmtPaise;
        traceLog.push(
          `Settlement: Payer ${getMemberName(payerId)} credited with ₹${(baseAmtPaise / 100).toFixed(2)}`
        );
      }
      if (netBalancesPaise[receiverId] !== undefined) {
        netBalancesPaise[receiverId] -= baseAmtPaise;
        traceLog.push(
          `Settlement: Recipient ${getMemberName(receiverId)} debited for -₹${(baseAmtPaise / 100).toFixed(2)}`
        );
      }
    });

    const netBalances: { [userId: string]: number } = {};
    Object.keys(netBalancesPaise).forEach((id) => {
      netBalances[id] = parseFloat((netBalancesPaise[id] / 100).toFixed(2));
    });

    // Greedy simplification
    const debtors = Object.keys(netBalances)
      .map((id) => ({ userId: id, balance: netBalances[id] }))
      .filter((u) => u.balance < -0.005)
      .sort((a, b) => a.balance - b.balance);

    const creditors = Object.keys(netBalances)
      .map((id) => ({ userId: id, balance: netBalances[id] }))
      .filter((u) => u.balance > 0.005)
      .sort((a, b) => b.balance - a.balance);

    const simplificationSteps: string[] = [];
    let dIdx = 0;
    let cIdx = 0;

    const tempDebtors = debtors.map((d) => ({ ...d }));
    const tempCreditors = creditors.map((c) => ({ ...c }));

    simplificationSteps.push("Greedy Path Simplification Trace:");
    if (tempDebtors.length === 0 || tempCreditors.length === 0) {
      simplificationSteps.push("All debts are fully settled. No simplification steps required.");
    }

    while (dIdx < tempDebtors.length && cIdx < tempCreditors.length) {
      const debtor = tempDebtors[dIdx];
      const creditor = tempCreditors[cIdx];

      const debtLeft = Math.abs(debtor.balance);
      const creditLeft = creditor.balance;

      const amountToSettle = Math.min(debtLeft, creditLeft);
      if (amountToSettle > 0.005) {
        simplificationSteps.push(
          `👉 ${getMemberName(debtor.userId)} (owes ₹${debtLeft.toFixed(2)}) settles with ${getMemberName(creditor.userId)} (is owed ₹${creditLeft.toFixed(2)}) for ₹${amountToSettle.toFixed(2)}.`
        );
      }

      debtor.balance += amountToSettle;
      creditor.balance -= amountToSettle;

      if (Math.abs(debtor.balance) < 0.005) {
        simplificationSteps.push(`✅ ${getMemberName(debtor.userId)} is now fully settled.`);
        dIdx++;
      }
      if (Math.abs(creditor.balance) < 0.005) {
        simplificationSteps.push(`✅ ${getMemberName(creditor.userId)} is now fully settled.`);
        cIdx++;
      }
    }

    return {
      netBalances,
      traceLog,
      simplificationSteps,
    };
  };

  // 2. Rounding Traces
  const getRoundingTrace = () => {
    const roundingIssues: Array<{ title: string; rawAmount: number; splitCount: number; payerShare: number; otherShare: number; remainder: number }> = [];

    expenses.forEach((exp) => {
      const amt = parseFloat(exp.amount) || 0;
      if (amt === 0) return;
      
      const splits = exp.splits || [];
      if (splits.length === 0) return;

      const userShares = splits.map((s) => parseFloat(s.amount) || 0);
      const uniqueShares = Array.from(new Set(userShares));

      // Check if there are rounding discrepancies
      const sumShares = userShares.reduce((s, a) => s + a, 0);
      const diff = Math.abs(amt - sumShares);

      if (diff > 0.001 || uniqueShares.length > 1) {
        const payerSplit = splits.find(s => s.userId === exp.paidBy);
        const payerSplitAmt = payerSplit ? parseFloat(payerSplit.amount) : 0;
        const otherSplit = splits.find(s => s.userId !== exp.paidBy);
        const otherSplitAmt = otherSplit ? parseFloat(otherSplit.amount) : 0;

        roundingIssues.push({
          title: exp.title,
          rawAmount: amt,
          splitCount: splits.length,
          payerShare: payerSplitAmt,
          otherShare: otherSplitAmt,
          remainder: diff,
        });
      }
    });

    return roundingIssues;
  };

  // 3. Foreign Currency Conversion Traces
  const getCurrencyTrace = () => {
    return expenses
      .filter((exp) => exp.currencyCode && exp.currencyCode !== baseCurrency)
      .map((exp) => {
        const amt = parseFloat(exp.amount) || 0;
        const rate = parseFloat(exp.exchangeRate || '1.0');
        const baseAmt = amt * rate;
        return {
          title: exp.title,
          currency: exp.currencyCode || 'USD',
          amount: amt,
          rate: rate,
          baseAmt: baseAmt,
        };
      });
  };

  // 4. Timeline Exclusions Trace
  const getTimelineTrace = () => {
    const timelineLog: string[] = [];

    members.forEach((m) => {
      const joinedStr = m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : 'Beginning';
      const leftStr = m.leftAt ? new Date(m.leftAt).toLocaleDateString() : 'Active';
      timelineLog.push(`${m.name}: Joined on ${joinedStr} • Status: ${leftStr}`);
    });

    // Find timeline issues in expenses
    expenses.forEach((exp) => {
      const expDate = new Date(exp.createdAt);
      
      members.forEach((m) => {
        const joinedTime = m.joinedAt ? new Date(m.joinedAt).getTime() : 0;
        const leftTime = m.leftAt ? new Date(m.leftAt).getTime() : null;
        const expTime = expDate.getTime();

        if (expTime < joinedTime) {
          timelineLog.push(
            `🚫 ${m.name} excluded from "${exp.title}" (${expDate.toLocaleDateString()}) because they joined later (${new Date(joinedTime).toLocaleDateString()}).`
          );
        }
        if (leftTime && expTime > leftTime) {
          timelineLog.push(
            `🚫 ${m.name} excluded from "${exp.title}" (${expDate.toLocaleDateString()}) because they left earlier (${new Date(leftTime).toLocaleDateString()}).`
          );
        }
      });
    });

    return timelineLog;
  };

  const greedyData = getGreedyTrace();
  const roundingData = getRoundingTrace();
  const currencyData = getCurrencyTrace();
  const timelineData = getTimelineTrace();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-4xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden card-glow-theme flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-white/5 bg-obsidian-card-elevated shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
              <span className="p-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg">
                <HelpCircle className="w-4 h-4" />
              </span>
              SplitSync Math Explainability Engine
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold tracking-wide">
              Auditable trace log of ledger equations and simplified debt paths
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer rounded-lg bg-white/5 border border-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-white/5 bg-slate-950/20 shrink-0">
          <button
            onClick={() => setActiveTab('greedy')}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-2 hover:cursor-pointer ${
              activeTab === 'greedy' ? 'border-b-2 border-primary text-primary bg-primary/5' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Debt Path Trace
          </button>
          <button
            onClick={() => setActiveTab('rounding')}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-2 hover:cursor-pointer ${
              activeTab === 'rounding' ? 'border-b-2 border-primary text-primary bg-primary/5' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Rounding & Remainders
          </button>
          <button
            onClick={() => setActiveTab('currency')}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-2 hover:cursor-pointer ${
              activeTab === 'currency' ? 'border-b-2 border-primary text-primary bg-primary/5' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" /> Multi-Currency
          </button>
          <button
            onClick={() => setActiveTab('timelines')}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-2 hover:cursor-pointer ${
              activeTab === 'timelines' ? 'border-b-2 border-primary text-primary bg-primary/5' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> Member Timelines
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 bg-transparent">
          
          {activeTab === 'greedy' && (
            <div className="space-y-6">
              <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 text-xs text-slate-300 leading-relaxed">
                <span className="font-bold text-primary block mb-1">Greedy Debt Simplification Engine</span>
                Net balance is calculated as <code className="text-primary font-bold">Total Paid - Total Owed</code>. 
                Instead of everyone making multiple transactions, our simplification engine pairs the largest debtors with the largest creditors to settle the group in the fewest possible steps.
              </div>

              {/* Net Balances list */}
              <div className="space-y-2">
                <h4 className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Computed Net Balances</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.keys(greedyData.netBalances).map((id) => {
                    const bal = greedyData.netBalances[id];
                    return (
                      <div key={id} className="bg-slate-950/40 border border-white/5 rounded-xl p-3 text-center">
                        <span className="block text-xs font-bold text-slate-300 truncate">{getMemberName(id)}</span>
                        <span className={`block font-outfit text-sm font-bold mt-1 ${bal > 0 ? 'text-emerald-400' : bal < 0 ? 'text-red-450' : 'text-slate-400'}`}>
                          {bal > 0 ? `+₹${bal.toFixed(2)}` : bal < 0 ? `-₹${Math.abs(bal).toFixed(2)}` : '₹0.00'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Simulation steps */}
              <div className="space-y-3">
                <h4 className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Step-by-Step Simplification Trace</h4>
                <div className="bg-slate-950/60 border border-white/5 rounded-2xl p-4 font-mono text-[11px] text-slate-300 space-y-2 leading-relaxed">
                  {greedyData.simplificationSteps.map((step, idx) => (
                    <div key={idx} className={step.startsWith('👉') ? 'text-primary' : step.startsWith('✅') ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                      {step}
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw transaction logs */}
              <div className="space-y-3">
                <h4 className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Raw Ledger Ledger Entries</h4>
                <div className="bg-slate-950/30 border border-white/5 rounded-2xl p-4 font-mono text-[10px] text-slate-400 space-y-1.5 max-h-48 overflow-y-auto">
                  {greedyData.traceLog.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rounding' && (
            <div className="space-y-6">
              <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 text-xs text-slate-300 leading-relaxed">
                <span className="font-bold text-primary block mb-1">Rounding Consistency Policy</span>
                SplitSync converts all amounts to <code className="text-primary font-bold">Integer Cents (Paise)</code> for calculations. 
                When division results in fractional remainders, the leftover paise are automatically allocated to the payer to prevent currency leak and keep the group total exact.
              </div>

              {roundingData.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs italic">
                  No rounding adjustments were necessary in the active ledger.
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Rounding Audits</h4>
                  <div className="space-y-2">
                    {roundingData.map((item, idx) => (
                      <div key={idx} className="bg-slate-950/40 border border-white/5 rounded-xl p-4 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-slate-200">{item.title}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            Amount: ₹{item.rawAmount.toFixed(2)} split among {item.splitCount} friends.
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-300 font-semibold">
                            Payer share: ₹{item.payerShare.toFixed(2)}
                          </p>
                          <p className="text-slate-400">
                            Others share: ₹{item.otherShare.toFixed(2)}
                          </p>
                          <span className="text-[10px] text-primary font-bold bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg mt-1 inline-block">
                            +{Math.round(item.remainder * 100)} paise payer adjustment
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'currency' && (
            <div className="space-y-6">
              <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 text-xs text-slate-300 leading-relaxed">
                <span className="font-bold text-primary block mb-1">Base Currency Calculations</span>
                Foreign currency items must be unified to the group base currency (<code className="text-primary font-bold">{baseCurrency}</code>). 
                Each transaction saves its locked exchange rate to prevent historical rate fluctuations from altering balance totals.
              </div>

              {currencyData.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs italic">
                  No foreign currency transactions found in the active ledger.
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Currency Exchange Conversions</h4>
                  <div className="space-y-2">
                    {currencyData.map((item, idx) => (
                      <div key={idx} className="bg-slate-950/40 border border-white/5 rounded-xl p-4 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-slate-200">{item.title}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            Original Amount: {item.currency} {item.amount.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-300 font-semibold font-outfit">
                            Rate: {item.rate.toFixed(4)}
                          </p>
                          <p className="text-emerald-400 font-bold font-outfit mt-0.5">
                            ₹{item.baseAmt.toFixed(2)} Base
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'timelines' && (
            <div className="space-y-6">
              <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 text-xs text-slate-300 leading-relaxed">
                <span className="font-bold text-primary block mb-1">Membership Timelines Bounds</span>
                SplitSync protects members from being charged for events that occurred before they joined or after they left. 
                Our engine automatically intersects expense creation timestamps with individual joined/left bounds to determine split eligibility.
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Timeline Log & Bounds Check</h4>
                <div className="bg-slate-950/60 border border-white/5 rounded-2xl p-4 font-mono text-[11px] text-slate-300 space-y-2.5 leading-relaxed">
                  {timelineData.map((log, idx) => (
                    <div key={idx} className={log.startsWith('🚫') ? 'text-red-400' : 'text-slate-400'}>
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
