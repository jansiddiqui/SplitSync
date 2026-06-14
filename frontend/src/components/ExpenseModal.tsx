import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { X, Calculator } from 'lucide-react';
import { useToast } from './Toast';

interface Member {
  id: string;
  name: string;
  email: string;
  joinedAt?: string;
  leftAt?: string | null;
}

interface ExpenseModalProps {
  groupId: string;
  members: Member[];
  expenses?: any[];
  onClose: (shouldRefresh: boolean) => void;
  baseCurrency: string;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ groupId, members, expenses, onClose, baseCurrency }) => {
  const { user } = useAuth();
  const toast = useToast();

  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [draftDetected, setDraftDetected] = useState(false);
  
  // Basic Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(user?.id || '');
  const [splitType, setSplitType] = useState<'equal' | 'unequal' | 'percentage' | 'share'>('equal');
  const [category, setCategory] = useState<'food' | 'travel' | 'stay' | 'transport' | 'activities' | 'shopping' | 'other'>('food');

  // Timeline & Currency States
  const [createdAt, setCreatedAt] = useState(new Date().toISOString().split('T')[0]);
  const [currencyCode, setCurrencyCode] = useState(baseCurrency || 'INR');
  const [exchangeRate, setExchangeRate] = useState('1.0');

  // Dynamic filter for active members based on chosen date
  const activeMembersOnDate = members.filter((m) => {
    const expenseTime = new Date(createdAt).getTime();
    const joinedTime = m.joinedAt ? new Date(m.joinedAt).getTime() : 0;
    const leftTime = m.leftAt ? new Date(m.leftAt).getTime() : null;
    return expenseTime >= joinedTime && (leftTime === null || expenseTime <= leftTime);
  });

  const activeMemberIds = activeMembersOnDate.map((m) => m.id);

  // Split configurations
  const [selectedMembers, setSelectedMembers] = useState<{ [userId: string]: boolean }>(
    members.reduce((acc, m) => ({ ...acc, [m.id]: true }), {})
  );
  const [customAmounts, setCustomAmounts] = useState<{ [userId: string]: string }>(
    members.reduce((acc, m) => ({ ...acc, [m.id]: '' }), {})
  );
  const [percentages, setPercentages] = useState<{ [userId: string]: string }>(
    members.reduce((acc, m) => ({ ...acc, [m.id]: '' }), {})
  );
  const [shares, setShares] = useState<{ [userId: string]: string }>(
    members.reduce((acc, m) => ({ ...acc, [m.id]: '1' }), {})
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Dynamic calculations
  const [remainingAmount, setRemainingAmount] = useState(0);
  const [totalSumPercentage, setTotalSumPercentage] = useState(0);
  const [totalSharesCount, setTotalSharesCount] = useState(0);

  const categoriesList = [
    { id: 'food', label: 'Food 🍔', emoji: '🍔' },
    { id: 'travel', label: 'Travel ✈️', emoji: '✈️' },
    { id: 'stay', label: 'Stay 🏨', emoji: '🏨' },
    { id: 'transport', label: 'Transport 🚗', emoji: '🚗' },
    { id: 'activities', label: 'Activities 🎟️', emoji: '🎟️' },
    { id: 'shopping', label: 'Shopping 🛒', emoji: '🛒' },
    { id: 'other', label: 'Other 📦', emoji: '📦' },
  ];

  // Math expression evaluator
  const evaluateMathExpression = (expr: string): number | null => {
    const cleanExpr = expr.replace(/[^0-9+\-*/.() ]/g, '');
    if (!cleanExpr.trim()) return null;
    try {
      if (/[^0-9+\-*/.() ]/.test(cleanExpr)) return null;
      const result = new Function(`return (${cleanExpr})`)();
      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        return parseFloat(result.toFixed(2));
      }
    } catch (e) {}
    return null;
  };

  const parsedAmount = evaluateMathExpression(amount) ?? (parseFloat(amount) || 0);

  useEffect(() => {
    const activeIds = activeMembersOnDate.map((m) => m.id);
    if (splitType === 'unequal') {
      const sum = activeIds.reduce((acc, id) => {
        return acc + (parseFloat(customAmounts[id]) || 0);
      }, 0);
      setRemainingAmount(parsedAmount - sum);
    } else if (splitType === 'percentage') {
      const sum = activeIds.reduce((acc, id) => {
        return acc + (parseFloat(percentages[id]) || 0);
      }, 0);
      setTotalSumPercentage(sum);
    } else if (splitType === 'share') {
      const sum = activeIds.reduce((acc, id) => {
        return acc + (parseFloat(shares[id]) || 0);
      }, 0);
      setTotalSharesCount(sum);
    }
  }, [amount, splitType, customAmounts, percentages, shares, parsedAmount, createdAt]);

  // Load draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(`splitsync-draft-${groupId}`);
    if (savedDraft) {
      setDraftDetected(true);
    }
  }, [groupId]);

  // Save draft on changes
  useEffect(() => {
    if (title || amount || description) {
      const draft = { title, amount, description, paidBy, splitType, category };
      localStorage.setItem(`splitsync-draft-${groupId}`, JSON.stringify(draft));
    }
  }, [title, amount, description, paidBy, splitType, category, groupId]);

  const handleMemberToggle = (userId: string) => {
    setSelectedMembers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const handleCustomAmountChange = (userId: string, val: string) => {
    setCustomAmounts((prev) => ({
      ...prev,
      [userId]: val,
    }));
  };

  const handlePercentageChange = (userId: string, val: string) => {
    setPercentages((prev) => ({
      ...prev,
      [userId]: val,
    }));
  };

  const handleShareChange = (userId: string, val: string) => {
    setShares((prev) => ({
      ...prev,
      [userId]: val,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Contribution title is required.');
      return;
    }

    if (parsedAmount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    if (!paidBy) {
      setError('Please select who sponsored the contribution.');
      return;
    }

    // Format splits payload
    let splitsPayload: Array<{
      userId: string;
      amount: number;
      percentage: number | null;
      shareCount: number | null;
    }> = [];

    if (splitType === 'equal') {
      const selectedIds = Object.keys(selectedMembers).filter((id) => selectedMembers[id] && activeMemberIds.includes(id));
      if (selectedIds.length === 0) {
        setError('At least one active group member must be selected for equal split.');
        return;
      }
      
      const share = parsedAmount / selectedIds.length;
      splitsPayload = selectedIds.map((id) => ({
        userId: id,
        amount: parseFloat(share.toFixed(2)),
        percentage: parseFloat((100 / selectedIds.length).toFixed(2)),
        shareCount: 1,
      }));

      // Adjust rounding discrepancies
      const sum = splitsPayload.reduce((acc, s) => acc + s.amount, 0);
      const diff = parsedAmount - sum;
      if (Math.abs(diff) > 0.005 && splitsPayload.length > 0) {
        splitsPayload[0].amount = parseFloat((splitsPayload[0].amount + diff).toFixed(2));
      }

    } else if (splitType === 'unequal') {
      const activeIds = activeMembersOnDate.map(m => m.id);
      const sum = activeIds.reduce((acc, id) => {
        return acc + (parseFloat(customAmounts[id]) || 0);
      }, 0);
      if (Math.abs(sum - parsedAmount) > 0.01) {
        setError(`Sum of amounts (₹${sum.toFixed(2)}) must equal total contribution amount (₹${parsedAmount.toFixed(2)}).`);
        return;
      }
      splitsPayload = activeMembersOnDate
        .map((m) => ({
          userId: m.id,
          amount: parseFloat(customAmounts[m.id]) || 0,
          percentage: null,
          shareCount: null,
        }))
        .filter((s) => s.amount > 0);

    } else if (splitType === 'percentage') {
      const activeIds = activeMembersOnDate.map(m => m.id);
      const sum = activeIds.reduce((acc, id) => {
        return acc + (parseFloat(percentages[id]) || 0);
      }, 0);
      if (Math.abs(sum - 100) > 0.01) {
        setError(`Sum of percentages (${sum.toFixed(2)}%) must equal 100%.`);
        return;
      }
      
      let sumCalculated = 0;
      splitsPayload = activeMembersOnDate
        .map((m) => {
          const pct = parseFloat(percentages[m.id]) || 0;
          const shareVal = parseFloat(((parsedAmount * pct) / 100).toFixed(2));
          sumCalculated += shareVal;
          return {
            userId: m.id,
            amount: shareVal,
            percentage: pct,
            shareCount: null,
          };
        })
        .filter((s) => s.percentage! > 0);

      // Adjust rounding
      const diff = parsedAmount - sumCalculated;
      if (Math.abs(diff) > 0.005 && splitsPayload.length > 0) {
        splitsPayload[0].amount = parseFloat((splitsPayload[0].amount + diff).toFixed(2));
      }

    } else if (splitType === 'share') {
      if (totalSharesCount <= 0) {
        setError('Sum of shares must be greater than zero.');
        return;
      }

      let sumCalculated = 0;
      splitsPayload = activeMembersOnDate
        .map((m) => {
          const sc = parseFloat(shares[m.id]) || 0;
          const shareVal = parseFloat(((parsedAmount * sc) / totalSharesCount).toFixed(2));
          sumCalculated += shareVal;
          return {
            userId: m.id,
            amount: shareVal,
            percentage: parseFloat(((sc / totalSharesCount) * 100).toFixed(2)),
            shareCount: sc,
          };
        })
        .filter((s) => s.shareCount! > 0);

      // Adjust rounding
      const diff = parsedAmount - sumCalculated;
      if (Math.abs(diff) > 0.005 && splitsPayload.length > 0) {
        splitsPayload[0].amount = parseFloat((splitsPayload[0].amount + diff).toFixed(2));
      }
    }

    if (splitsPayload.length === 0) {
      setError('Splits calculations yielded empty payload. Make sure splits are non-zero.');
      return;
    }

    // Smart Duplicate Check
    if (expenses && expenses.length > 0 && !duplicateConfirmed) {
      const isDuplicate = expenses.some((exp) => {
        const expAmt = parseFloat(exp.amount);
        const timeDiff = Math.abs(new Date(createdAt).getTime() - new Date(exp.createdAt).getTime());
        const hoursDiff = timeDiff / (1000 * 60 * 60);

        const cleanTitle = title.trim().toLowerCase();
        const cleanExpTitle = exp.title.replace(/ (🏖|🏠|🎓|💍|🚗|📦|🍔|✈️|🏨|🎟️|🛒)$/, '').trim().toLowerCase();

        return expAmt === parsedAmount && cleanTitle === cleanExpTitle && hoursDiff < 6;
      });

      if (isDuplicate) {
        setShowDuplicateWarning(true);
        return;
      }
    }

    setSubmitting(true);
    try {
      const selectedCategory = categoriesList.find((c) => c.id === category) || categoriesList[0];
      const finalTitle = `${title.trim()} ${selectedCategory.emoji}`;

      // Offline Intercept Check
      if (!navigator.onLine) {
        const offlineId = `offline-exp-${Date.now()}`;
        const newExp = {
          id: offlineId,
          group_id: groupId,
          title: finalTitle,
          description: description.trim() || null,
          amount: parsedAmount.toString(),
          paidBy: paidBy,
          createdAt: new Date(createdAt).toISOString(),
          currency_code: currencyCode,
          exchange_rate: parseFloat(exchangeRate) || 1.0,
          splits: splitsPayload.map((s, idx) => ({
            id: `offline-split-${Date.now()}-${idx}`,
            userId: s.userId,
            amount: s.amount.toString(),
            percentage: s.percentage ? s.percentage.toString() : null,
            shareCount: s.shareCount ? s.shareCount.toString() : null,
            splitType: splitType,
          })),
        };

        const queueKey = `splitsync-offline-queue-${groupId}`;
        const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
        queue.push({ type: 'create-expense', payload: newExp });
        localStorage.setItem(queueKey, JSON.stringify(queue));

        localStorage.removeItem(`splitsync-draft-${groupId}`);

        toast.success('Saved contribution offline!');
        onClose(true);
        return;
      }

      let rpcSuccess = false;
      try {
        const { error: rpcErr } = await supabase
          .rpc('create_expense_with_splits', {
            p_group_id: groupId,
            p_title: finalTitle,
            p_description: description.trim() || null,
            p_amount: parsedAmount,
            p_paid_by: paidBy,
            p_currency_code: currencyCode,
            p_exchange_rate: parseFloat(exchangeRate) || 1.0,
            p_splits: splitsPayload.map((s) => ({
              user_id: s.userId,
              amount: s.amount,
              percentage: s.percentage,
              share_count: s.shareCount,
              split_type: splitType,
            })),
          });

        if (!rpcErr) {
          rpcSuccess = true;
        } else if (rpcErr.code !== 'PGRST202' && !rpcErr.message.includes('does not exist')) {
          throw new Error(rpcErr.message);
        }
      } catch (err: any) {
        if (!err.message?.includes('does not exist') && err.code !== 'PGRST202') {
          throw err;
        }
      }

      if (!rpcSuccess) {
        const { data: newExp, error: eErr } = await supabase
          .from('Expense')
          .insert({
            group_id: groupId,
            title: finalTitle,
            description: description.trim() || null,
            amount: parsedAmount,
            paid_by: paidBy,
            created_at: new Date(createdAt).toISOString(),
            currency_code: currencyCode,
            exchange_rate: parseFloat(exchangeRate) || 1.0,
          })
          .select()
          .single();

        if (eErr) throw new Error(eErr.message);

        const { error: sErr } = await supabase
          .from('ExpenseSplit')
          .insert(
            splitsPayload.map((s) => ({
              expense_id: newExp.id,
              user_id: s.userId,
              amount: s.amount,
              percentage: s.percentage,
              share_count: s.shareCount,
              split_type: splitType,
            }))
          );

        if (sErr) throw new Error(sErr.message);
      }

      localStorage.removeItem(`splitsync-draft-${groupId}`);
      onClose(true); // Close and refresh
    } catch (err: any) {
      setError(err.message || 'Failed to add contribution.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-card w-full max-w-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] card-glow-theme">
        
        {/* Header */}
        <header className="p-5 border-b border-white/5 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            Log Contribution (Expense)
          </h3>
          <button
            id="btn-expense-close"
            onClick={() => onClose(false)}
            className="p-1 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer btn-magnetic"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Content area scrollable */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="bg-red-950/40 border border-red-500/30 text-red-200 rounded-xl p-3.5 text-xs font-semibold">
              {error}
            </div>
          )}

          {draftDetected && (
            <div className="bg-primary/5 border border-primary/20 text-slate-350 rounded-xl p-3.5 text-xs font-semibold flex justify-between items-center">
              <span>📝 Unsaved draft detected from your last session.</span>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const savedDraft = localStorage.getItem(`splitsync-draft-${groupId}`);
                    if (savedDraft) {
                      const draft = JSON.parse(savedDraft);
                      setTitle(draft.title || '');
                      setAmount(draft.amount || '');
                      setDescription(draft.description || '');
                      setPaidBy(draft.paidBy || '');
                      setSplitType(draft.splitType || 'equal');
                      setCategory(draft.category || 'food');
                    }
                    setDraftDetected(false);
                  }}
                  className="px-2.5 py-1 bg-primary text-obsidian rounded-lg font-bold text-[10px]"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(`splitsync-draft-${groupId}`);
                    setDraftDetected(false);
                  }}
                  className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-400 font-bold text-[10px]"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {showDuplicateWarning && (
            <div className="bg-amber-950/40 border border-amber-500/30 text-amber-200 rounded-xl p-3.5 text-xs font-semibold space-y-2.5">
              <p>⚠️ Possible duplicate contribution detected (Title: "{title}", Amount: ₹{parsedAmount}) within a 6-hour window. Save anyway?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDuplicateConfirmed(true);
                    setTimeout(() => {
                      const submitBtn = document.getElementById('btn-expense-submit');
                      submitBtn?.click();
                    }, 50);
                  }}
                  className="px-2.5 py-1 bg-amber-500 text-obsidian rounded-lg font-bold text-[10px] hover:brightness-110"
                >
                  Yes, Save Anyway
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDuplicateWarning(false);
                  }}
                  className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-300 font-bold text-[10px] hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" id="form-add-expense">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-expense-title">
                  Contribution Title
                </label>
                <input
                  id="input-expense-title"
                  type="text"
                  placeholder="e.g. Dinner, Flat rent, Flight tickets"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-expense-amount">
                  Total Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-500 font-bold text-xs font-outfit">₹</span>
                  <input
                    id="input-expense-amount"
                    type="text"
                    placeholder="e.g. 1200/3 or 500+300"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-8 pr-24 py-2.5 rounded-xl glass-input text-xs font-outfit font-semibold"
                    required
                  />
                  {/* Smart Parser Indicator */}
                  {amount && evaluateMathExpression(amount) !== null && evaluateMathExpression(amount) !== parseFloat(amount) && (
                    <div className="absolute right-2.5 top-1.5 bg-primary/10 border border-primary/20 rounded-lg px-2 py-1 text-[9px] font-bold text-primary font-outfit animate-fade-in flex items-center justify-center">
                      = ₹{evaluateMathExpression(amount)?.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Timeline & Currency Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-expense-date">
                  Transaction Date
                </label>
                <input
                  id="input-expense-date"
                  type="date"
                  value={createdAt}
                  onChange={(e) => setCreatedAt(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold text-slate-200"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="select-expense-currency">
                  Currency
                </label>
                <select
                  id="select-expense-currency"
                  value={currencyCode}
                  onChange={(e) => {
                    const newCurrency = e.target.value;
                    setCurrencyCode(newCurrency);
                    if (newCurrency === baseCurrency) {
                      setExchangeRate('1.0');
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold text-slate-250 bg-slate-900 border border-white/5"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              {currencyCode !== baseCurrency && (
                <div className="space-y-2 animate-fade-in">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-expense-rate">
                    Exchange Rate (1 {currencyCode} = X {baseCurrency})
                  </label>
                  <input
                    id="input-expense-rate"
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
            </div>

            {/* Category Selector */}
            <div className="space-y-2.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {categoriesList.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id as any)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition hover:cursor-pointer btn-magnetic ${
                      category === cat.id
                        ? 'bg-primary/10 border-primary text-primary shadow-[0_0_12px_rgba(61,255,211,0.15)]'
                        : 'bg-white/3 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="select-expense-payer">
                  Sponsored By (Paid By)
                </label>
                <select
                  id="select-expense-payer"
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold"
                >
                  {activeMembersOnDate.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.id === user?.id ? '(You)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="select-expense-split-type">
                  Sharing Logic (Split Method)
                </label>
                <select
                  id="select-expense-split-type"
                  value={splitType}
                  onChange={(e) => setSplitType(e.target.value as any)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold"
                >
                  <option value="equal">Share Equally</option>
                  <option value="unequal">Custom Shares (Unequal)</option>
                  <option value="percentage">Share by Percentage</option>
                  <option value="share">Share by Portions</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-expense-description">
                Notes / Description (Optional)
              </label>
              <input
                id="input-expense-description"
                type="text"
                placeholder="Details of contribution..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold"
              />
            </div>

            {/* Split Details */}
            <div className="border-t border-white/5 pt-5 space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Share Calculations</h4>
                {splitType === 'unequal' && (
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    Math.abs(remainingAmount) < 0.01 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {Math.abs(remainingAmount) < 0.01 
                      ? 'Fully split' 
                      : remainingAmount > 0 
                        ? `₹${remainingAmount.toFixed(2)} remaining` 
                        : `₹${Math.abs(remainingAmount).toFixed(2)} over limit`}
                  </span>
                )}
                {splitType === 'percentage' && (
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    Math.abs(totalSumPercentage - 100) < 0.01 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {totalSumPercentage.toFixed(1)}% of 100%
                  </span>
                )}
                {splitType === 'share' && (
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Total portions: {totalSharesCount}
                  </span>
                )}
              </div>

              {/* Dynamic split input tables */}
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {activeMembersOnDate.map((m) => {
                  const isChecked = selectedMembers[m.id];
                  
                  // Calculate dynamic display amounts
                  let dynAmt = 0;
                  if (splitType === 'equal') {
                    const activeCount = Object.keys(selectedMembers).filter((id) => selectedMembers[id] && activeMemberIds.includes(id)).length;
                    dynAmt = isChecked && activeCount > 0 ? parsedAmount / activeCount : 0;
                  } else if (splitType === 'unequal') {
                    dynAmt = parseFloat(customAmounts[m.id]) || 0;
                  } else if (splitType === 'percentage') {
                    const pct = parseFloat(percentages[m.id]) || 0;
                    dynAmt = (parsedAmount * pct) / 100;
                  } else if (splitType === 'share') {
                    const share = parseFloat(shares[m.id]) || 0;
                    dynAmt = totalSharesCount > 0 ? (parsedAmount * share) / totalSharesCount : 0;
                  }

                  return (
                    <div key={m.id} className="flex justify-between items-center bg-slate-950/40 p-2.5 sm:p-3.5 rounded-xl border border-white/5 hover:bg-slate-900/40 transition gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {splitType === 'equal' ? (
                          <input
                            id={`checkbox-split-user-${m.id}`}
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleMemberToggle(m.id)}
                            className="w-4 h-4 rounded text-primary bg-slate-950 border-white/10 focus:ring-primary/25 shrink-0"
                          />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/30 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-200 truncate max-w-[85px] sm:max-w-40">{m.name}</p>
                          <p className="text-[9px] text-slate-500 truncate max-w-[85px] sm:max-w-40">{m.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                        {splitType === 'unequal' && (
                          <div className="relative w-20 sm:w-24">
                            <span className="absolute left-2 top-1 text-slate-500 text-[10px] font-outfit">₹</span>
                            <input
                              id={`input-split-amount-user-${m.id}`}
                              type="number"
                              step="0.01"
                              value={customAmounts[m.id]}
                              onChange={(e) => handleCustomAmountChange(m.id, e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-5 pr-2 py-1 rounded-lg glass-input text-xs text-right font-outfit font-semibold"
                            />
                          </div>
                        )}

                        {splitType === 'percentage' && (
                          <div className="relative w-16 sm:w-20">
                            <span className="absolute right-2 top-1 text-slate-500 text-[10px]">%</span>
                            <input
                              id={`input-split-pct-user-${m.id}`}
                              type="number"
                              value={percentages[m.id]}
                              onChange={(e) => handlePercentageChange(m.id, e.target.value)}
                              placeholder="0"
                              className="w-full pl-2 pr-5 py-1 rounded-lg glass-input text-xs text-right font-outfit font-semibold"
                            />
                          </div>
                        )}

                        {splitType === 'share' && (
                          <div className="w-16 sm:w-20">
                            <input
                              id={`input-split-share-user-${m.id}`}
                              type="number"
                              min="0"
                              step="0.1"
                              value={shares[m.id]}
                              onChange={(e) => handleShareChange(m.id, e.target.value)}
                              placeholder="shares"
                              className="w-full px-2 py-1 rounded-lg glass-input text-xs text-center font-outfit font-semibold"
                            />
                          </div>
                        )}

                        <span className="text-xs font-outfit font-semibold text-slate-400 w-16 sm:w-20 text-right shrink-0">
                          ₹{dynAmt.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <footer className="p-5 border-t border-white/5 flex justify-end gap-3 shrink-0">
          <button
            id="btn-expense-cancel"
            type="button"
            onClick={() => onClose(false)}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold border border-white/5 hover:cursor-pointer btn-magnetic"
          >
            Cancel
          </button>
          <button
            id="btn-expense-submit"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 disabled:opacity-50 text-obsidian text-xs font-extrabold flex items-center gap-1 shadow-lg shadow-primary/20 hover:cursor-pointer btn-magnetic"
          >
            {submitting ? (
              <span className="w-3.5 h-3.5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin"></span>
            ) : (
              'Save Contribution'
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};
