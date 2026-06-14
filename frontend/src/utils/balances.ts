import { supabase, checkIsLegacySchema } from './supabase';

export interface MemberBalanceInfo {
  userId: string;
  name: string;
  email: string;
  balance: number;
}

export interface SimplifiedTransaction {
  from: string;
  to: string;
  amount: number;
  fromName: string;
  toName: string;
}

export interface GroupBalances {
  netBalances: { [userId: string]: number };
  simplifiedTransactions: SimplifiedTransaction[];
  totalSpent: number;
  outstanding: number;
}

export const getGroupBalances = async (groupId: string): Promise<GroupBalances> => {
  const isLegacy = await checkIsLegacySchema();

  // 0. Fetch group base currency
  if (!isLegacy) {
    try {
      await supabase
        .from('Group')
        .select('base_currency')
        .eq('id', groupId)
        .maybeSingle();
    } catch (err) {
      // Graceful fallback
    }
  }

  // 1. Fetch all group members (including past ones who have left_at set)
  let members: any[] = [];
  if (isLegacy) {
    const { data: mDataLegacy, error: mErrLegacy } = await supabase
      .from('GroupMember')
      .select(`
        user_id,
        joined_at,
        User (
          name,
          email
        )
      `)
      .eq('group_id', groupId);
    if (mErrLegacy) throw new Error(mErrLegacy.message);
    members = (mDataLegacy || []).map((m: any) => ({ ...m, left_at: null }));
  } else {
    const { data: mData, error: mErr } = await supabase
      .from('GroupMember')
      .select(`
        user_id,
        joined_at,
        left_at,
        User (
          name,
          email
        )
      `)
      .eq('group_id', groupId);
    if (mErr) throw new Error(mErr.message);
    members = mData || [];
  }

  const memberNameMap: { [userId: string]: string } = {};
  const netBalancesPaise: { [userId: string]: number } = {};

  (members || []).forEach((m: any) => {
    const u = m.User;
    if (u) {
      memberNameMap[m.user_id] = u.name;
    }
    netBalancesPaise[m.user_id] = 0;
  });

  // 2. Fetch expenses and splits (filtering out soft deleted ones)
  let expensesData: any[] = [];
  if (isLegacy) {
    const { data: eDataLegacy, error: eErrLegacy } = await supabase
      .from('Expense')
      .select(`
        id,
        title,
        paid_by,
        amount,
        created_at,
        ExpenseSplit (
          user_id,
          amount
        )
      `)
      .eq('group_id', groupId);
    if (eErrLegacy) throw new Error(eErrLegacy.message);
    expensesData = (eDataLegacy || []).map((e: any) => ({
      ...e,
      currency_code: 'INR',
      exchange_rate: 1.0,
      deleted_at: null,
    }));
  } else {
    const { data: eData, error: eErr } = await supabase
      .from('Expense')
      .select(`
        id,
        paid_by,
        amount,
        currency_code,
        exchange_rate,
        created_at,
        deleted_at,
        ExpenseSplit (
          user_id,
          amount
        )
      `)
      .eq('group_id', groupId);
    if (eErr) throw new Error(eErr.message);
    expensesData = eData || [];
  }

  // 3. Fetch settlements (filtering out soft deleted ones)
  let settlementsData: any[] = [];
  if (isLegacy) {
    const { data: sDataLegacy, error: sErrLegacy } = await supabase
      .from('Settlement')
      .select('payer_id, receiver_id, amount')
      .eq('group_id', groupId);
    if (sErrLegacy) throw new Error(sErrLegacy.message);
    settlementsData = (sDataLegacy || []).map((s: any) => ({
      ...s,
      currency_code: 'INR',
      exchange_rate: 1.0,
      deleted_at: null,
    }));
  } else {
    const { data: sData, error: sErr } = await supabase
      .from('Settlement')
      .select('payer_id, receiver_id, amount, currency_code, exchange_rate, deleted_at')
      .eq('group_id', groupId);
    if (sErr) throw new Error(sErr.message);
    settlementsData = sData || [];
  }

  // Filter active (non-soft-deleted) records
  const activeExpenses = (expensesData || []).filter((e: any) => !e.deleted_at && !(e.title && e.title.includes('[deleted:')));
  const activeSettlements = (settlementsData || []).filter((s: any) => !s.deleted_at);

  // Compute total spent in group (converted to base currency)
  let totalSpentPaise = 0;

  // Helper to convert inputs to integer paise
  const toPaise = (num: number) => Math.round(num * 100);

  // 4. Calculate net balance: (Paid - Owed)
  activeExpenses.forEach((exp: any) => {
    const payerId = exp.paid_by;
    const rawAmt = parseFloat(exp.amount) || 0;
    const rate = parseFloat(exp.exchange_rate) || 1.0;
    
    // Amount in base currency (rounded to 2 decimal places, then converted to paise)
    const baseAmtPaise = toPaise(parseFloat((rawAmt * rate).toFixed(2)));
    totalSpentPaise += baseAmtPaise;

    // Credit payer
    if (netBalancesPaise[payerId] !== undefined) {
      netBalancesPaise[payerId] += baseAmtPaise;
    }

    // Debit split members
    const splits = exp.ExpenseSplit || [];
    splits.forEach((split: any) => {
      const splitUserId = split.user_id;
      const rawSplitAmt = parseFloat(split.amount) || 0;
      const splitBaseAmtPaise = toPaise(parseFloat((rawSplitAmt * rate).toFixed(2)));

      if (netBalancesPaise[splitUserId] !== undefined) {
        netBalancesPaise[splitUserId] -= splitBaseAmtPaise;
      }
    });
  });

  // 5. Apply settlements: (Payer gets credit, Receiver gets debit)
  activeSettlements.forEach((set: any) => {
    const payerId = set.payer_id;
    const receiverId = set.receiver_id;
    const rawAmt = parseFloat(set.amount) || 0;
    const rate = parseFloat(set.exchange_rate) || 1.0;

    const baseAmtPaise = toPaise(parseFloat((rawAmt * rate).toFixed(2)));

    if (netBalancesPaise[payerId] !== undefined) {
      netBalancesPaise[payerId] += baseAmtPaise;
    }
    if (netBalancesPaise[receiverId] !== undefined) {
      netBalancesPaise[receiverId] -= baseAmtPaise;
    }
  });

  // Convert net balances back to float currency units
  const netBalances: { [userId: string]: number } = {};
  Object.keys(netBalancesPaise).forEach((id) => {
    netBalances[id] = parseFloat((netBalancesPaise[id] / 100).toFixed(2));
  });

  // Calculate outstanding debt (sum of all positive balances)
  let outstandingPaise = 0;
  Object.keys(netBalancesPaise).forEach((id) => {
    if (netBalancesPaise[id] > 0) {
      outstandingPaise += netBalancesPaise[id];
    }
  });

  // 6. Greedy debt simplification
  // Filter debtors and creditors
  const debtors = Object.keys(netBalances)
    .map((id) => ({ userId: id, balance: netBalances[id] }))
    .filter((u) => u.balance < -0.005)
    .sort((a, b) => a.balance - b.balance); // Most negative first

  const creditors = Object.keys(netBalances)
    .map((id) => ({ userId: id, balance: netBalances[id] }))
    .filter((u) => u.balance > 0.005)
    .sort((a, b) => b.balance - a.balance); // Most positive first

  const simplifiedTransactions: SimplifiedTransaction[] = [];

  let dIdx = 0;
  let cIdx = 0;

  // Make deep copies of balances for greedy manipulation
  const tempDebtors = debtors.map((d) => ({ ...d }));
  const tempCreditors = creditors.map((c) => ({ ...c }));

  while (dIdx < tempDebtors.length && cIdx < tempCreditors.length) {
    const debtor = tempDebtors[dIdx];
    const creditor = tempCreditors[cIdx];

    const debtLeft = Math.abs(debtor.balance);
    const creditLeft = creditor.balance;

    const amountToSettle = Math.min(debtLeft, creditLeft);
    if (amountToSettle > 0.005) {
      simplifiedTransactions.push({
        from: debtor.userId,
        to: creditor.userId,
        amount: parseFloat(amountToSettle.toFixed(2)),
        fromName: memberNameMap[debtor.userId] || 'Unknown',
        toName: memberNameMap[creditor.userId] || 'Unknown',
      });
    }

    debtor.balance += amountToSettle;
    creditor.balance -= amountToSettle;

    if (Math.abs(debtor.balance) < 0.005) {
      dIdx++;
    }
    if (Math.abs(creditor.balance) < 0.005) {
      cIdx++;
    }
  }

  return {
    netBalances,
    simplifiedTransactions,
    totalSpent: parseFloat((totalSpentPaise / 100).toFixed(2)),
    outstanding: parseFloat((outstandingPaise / 100).toFixed(2)),
  };
};

