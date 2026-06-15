import React, { useState, useEffect } from 'react';
import { supabase, checkIsLegacySchema } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { X, CreditCard } from 'lucide-react';
import { useToast } from './Toast';

interface Member {
  id: string;
  name: string;
  email: string;
  joinedAt?: string;
  leftAt?: string | null;
}

interface DefaultDebt {
  from: string;
  to: string;
  amount: number;
  fromName: string;
  toName: string;
}

interface SettlementModalProps {
  groupId: string;
  members: Member[];
  defaultDebts: DefaultDebt[];
  onClose: (shouldRefresh: boolean) => void;
  baseCurrency: string;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({ groupId, members, defaultDebts, onClose, baseCurrency }) => {
  const { user } = useAuth();
  const toast = useToast();

  const [payerId, setPayerId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [amount, setAmount] = useState('');
  const [resolutionType, setResolutionType] = useState<'upi' | 'coffee' | 'offset'>('upi');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Timeline & Currency States
  const [createdAt, setCreatedAt] = useState(new Date().toISOString().split('T')[0]);
  const [currencyCode, setCurrencyCode] = useState(baseCurrency || 'INR');
  const [exchangeRate, setExchangeRate] = useState('1.0');

  // Dynamic filter for active members based on chosen date
  const activeMembersOnDate = members.filter((m) => {
    const settleTime = new Date(createdAt).getTime();
    const joinedTime = m.joinedAt ? new Date(m.joinedAt).getTime() : 0;
    const leftTime = m.leftAt ? new Date(m.leftAt).getTime() : null;
    return settleTime >= joinedTime && (leftTime === null || settleTime <= leftTime);
  });

  // Pre-populate if there are active debts involving the user
  useEffect(() => {
    if (defaultDebts.length > 0) {
      const userDebt = defaultDebts.find((d) => d.from === user?.id || d.to === user?.id) || defaultDebts[0];
      if (userDebt) {
        setPayerId(userDebt.from);
        setReceiverId(userDebt.to);
        setAmount(userDebt.amount.toString());
      }
    } else {
      if (members.length >= 2) {
        setPayerId(members[0].id);
        setReceiverId(members[1].id);
      }
    }
  }, [defaultDebts, members, user]);

  const getMemberName = (id: string) => {
    return members.find((m) => m.id === id)?.name || 'Someone';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount) || 0;

    if (!payerId || !receiverId) {
      setError('Please select both payer and receiver.');
      return;
    }

    if (payerId === receiverId) {
      setError('Payer and receiver must be different members.');
      return;
    }

    if (parsedAmount <= 0) {
      setError('Settlement amount must be greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      // Offline Intercept Check
      if (!navigator.onLine) {
        const newSettle = {
          id: `offline-set-${Date.now()}`,
          group_id: groupId,
          payerId: payerId,
          receiverId: receiverId,
          amount: parsedAmount.toString(),
          createdAt: new Date(createdAt).toISOString(),
          currency_code: currencyCode,
          exchange_rate: parseFloat(exchangeRate) || 1.0,
        };

        const queueKey = `splitsync-offline-queue-${groupId}`;
        const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
        queue.push({ type: 'create-settlement', payload: newSettle });
        localStorage.setItem(queueKey, JSON.stringify(queue));

        toast.success('Saved resolution offline!');
        onClose(true);
        return;
      }

      // 1. Record the settlement/resolution
      const isLegacy = await checkIsLegacySchema();
      const insertPayload: any = {
        group_id: groupId,
        payer_id: payerId,
        receiver_id: receiverId,
        amount: parsedAmount,
        created_at: new Date(createdAt).toISOString(),
      };

      if (!isLegacy) {
        insertPayload.currency_code = currencyCode;
        insertPayload.exchange_rate = parseFloat(exchangeRate) || 1.0;
      }

      const { error: sErr } = await supabase
        .from('Settlement')
        .insert(insertPayload);

      if (sErr) throw new Error(sErr.message);

      // 2. Fetch the latest contribution (expense) to post a friendly chat notification
      const { data: latestExpenses } = await supabase
        .from('Expense')
        .select('id')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(1);

      const latestExpenseId = latestExpenses?.[0]?.id;

      if (latestExpenseId && user) {
        const payerName = getMemberName(payerId);
        const receiverName = getMemberName(receiverId);
        const resolutionLabel =
          resolutionType === 'upi'
            ? 'Direct UPI/Bank Transfer 💳'
            : resolutionType === 'coffee'
              ? 'Coffee Treat ☕'
              : 'Future Contribution Offset ⚖️';

        await supabase.from('Message').insert({
          expense_id: latestExpenseId,
          user_id: user.id,
          message: `⚖️ Share Resolved: ${payerName} settled ₹${parsedAmount.toFixed(2)} to ${receiverName} via ${resolutionLabel}!`,
        });
      }

      onClose(true); // Close and refresh
    } catch (err: any) {
      setError(err.message || 'Failed to record resolution.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-card w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 card-glow-theme flex flex-col">
        {/* Header */}
        <header className="p-5 border-b border-white/5 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Resolve Outstanding Share
          </h3>
          <button
            id="btn-settle-close"
            onClick={() => onClose(false)}
            className="p-1 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer btn-magnetic"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Form Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-red-950/40 border border-red-500/30 text-red-200 rounded-xl p-3.5 text-xs font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" id="form-settlement">
            {/* Timeline & Currency Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-settle-date">
                  Resolution Date
                </label>
                <input
                  id="input-settle-date"
                  type="date"
                  value={createdAt}
                  onChange={(e) => setCreatedAt(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold text-slate-205"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="select-settle-currency">
                  Currency
                </label>
                <select
                  id="select-settle-currency"
                  value={currencyCode}
                  onChange={(e) => {
                    const newCurrency = e.target.value;
                    setCurrencyCode(newCurrency);
                    if (newCurrency === baseCurrency) {
                      setExchangeRate('1.0');
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold text-slate-205 bg-slate-900 border border-white/5"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            {currencyCode !== baseCurrency && (
              <div className="space-y-2 animate-fade-in">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-settle-rate">
                  Exchange Rate (1 {currencyCode} = X {baseCurrency})
                </label>
                <input
                  id="input-settle-rate"
                  type="number"
                  step="0.000001"
                  placeholder="e.g. 83.0"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold text-slate-200 font-outfit"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="select-settle-payer">
                Who resolved share? (Payer)
              </label>
              <select
                id="select-settle-payer"
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold"
                required
              >
                <option value="" disabled>Select member</option>
                {activeMembersOnDate.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.id === user?.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="select-settle-receiver">
                Who received? (Recipient)
              </label>
              <select
                id="select-settle-receiver"
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold"
                required
              >
                <option value="" disabled>Select member</option>
                {activeMembersOnDate.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.id === user?.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-settle-amount">
                Amount resolved (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-500 font-bold text-xs font-outfit">₹</span>
                <input
                  id="input-settle-amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl glass-input text-xs font-outfit font-semibold"
                  required
                />
              </div>
            </div>

            {/* Resolution Formats */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Resolution Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setResolutionType('upi')}
                  className={`py-2 rounded-xl border text-[10px] font-bold transition flex flex-col items-center justify-center gap-1 hover:cursor-pointer btn-magnetic ${
                    resolutionType === 'upi'
                      ? 'bg-primary/10 border-primary text-primary shadow-[0_0_12px_rgba(61,255,211,0.15)]'
                      : 'bg-white/3 border-white/5 text-slate-450 hover:text-slate-200'
                  }`}
                >
                  <span className="text-sm">💳</span>
                  UPI / Bank
                </button>
                <button
                  type="button"
                  onClick={() => setResolutionType('coffee')}
                  className={`py-2 rounded-xl border text-[10px] font-bold transition flex flex-col items-center justify-center gap-1 hover:cursor-pointer btn-magnetic ${
                    resolutionType === 'coffee'
                      ? 'bg-primary/10 border-primary text-primary shadow-[0_0_12px_rgba(61,255,211,0.15)]'
                      : 'bg-white/3 border-white/5 text-slate-450 hover:text-slate-200'
                  }`}
                >
                  <span className="text-sm">☕</span>
                  Coffee Treat
                </button>
                <button
                  type="button"
                  onClick={() => setResolutionType('offset')}
                  className={`py-2 rounded-xl border text-[10px] font-bold transition flex flex-col items-center justify-center gap-1 hover:cursor-pointer btn-magnetic ${
                    resolutionType === 'offset'
                      ? 'bg-primary/10 border-primary text-primary shadow-[0_0_12px_rgba(61,255,211,0.15)]'
                      : 'bg-white/3 border-white/5 text-slate-450 hover:text-slate-200'
                  }`}
                >
                  <span className="text-sm">⚖️</span>
                  Offset
                </button>
              </div>
            </div>

            {/* Quick Suggestion Selection */}
            {defaultDebts.length > 0 && (
              <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5 space-y-2.5">
                <p className="text-[9px] font-bold text-slate-550 uppercase tracking-widest">Suggested settlements</p>
                <div className="flex flex-col gap-2 max-h-24 overflow-y-auto pr-1">
                  {defaultDebts.map((d, idx) => (
                    <button
                      key={idx}
                      id={`btn-settle-suggest-${idx}`}
                      type="button"
                      onClick={() => {
                        setPayerId(d.from);
                        setReceiverId(d.to);
                        setAmount(d.amount.toString());
                      }}
                      className="text-left w-full text-xs text-primary hover:text-primary-light hover:underline flex justify-between items-center transition btn-magnetic"
                    >
                      <span className="font-semibold">{d.fromName} &rarr; {d.toName}</span>
                      <span className="font-outfit font-semibold">₹{d.amount.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <footer className="p-5 border-t border-white/5 flex justify-end gap-3 shrink-0">
          <button
            id="btn-settle-cancel"
            type="button"
            onClick={() => onClose(false)}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold border border-white/5 hover:cursor-pointer btn-magnetic"
          >
            Cancel
          </button>
          <button
            id="btn-settle-submit"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 disabled:opacity-50 text-obsidian text-xs font-extrabold flex items-center gap-1 shadow-lg shadow-primary/20 hover:cursor-pointer btn-magnetic"
          >
            {submitting ? (
              <span className="w-3.5 h-3.5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin"></span>
            ) : (
              'Record Resolution'
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};
