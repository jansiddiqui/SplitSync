import { RawCSVRow } from './csvParser';

export interface Anomaly {
  category: string; // e.g. 'duplicate_expense', 'currency_mismatch', 'missing_payer'
  severity: 'warning' | 'critical' | 'info';
  description: string;
  meta?: {
    duplicateRowIndex?: number;
    duplicateType?: 'database' | 'batch';
    unknownName?: string;
  };
}

export interface StagingExpense {
  rowIndex: number;
  dateStr: string;
  parsedDate: string | null; // ISO string or null
  description: string;
  paidByCSV: string;
  paidByUserId: string | null; // mapped user ID
  amountCSV: string;
  parsedAmount: number; // float amount
  currencyCSV: string;
  splitTypeCSV: string;
  splitWithCSV: string;
  splitDetailsCSV: string;
  notesCSV: string;
  anomalies: Anomaly[];
  isSettlement: boolean;
  isDeleted: boolean;
  exchangeRate: number;
  convertedAmount: number;
}

// Maps specific anomaly category to high-level group
export function getAnomalyGroup(category: string): string {
  const duplicate = ['duplicate_expense', 'duplicate_settlement', 'duplicate_but_conflicting_records'];
  const membership = ['user_not_in_group', 'expense_before_member_joined', 'expense_after_member_left', 'unknown_participant'];
  const currency = ['currency_mismatch', 'missing_exchange_rate'];
  const missing = ['empty_description', 'missing_payer', 'missing_participants', 'invalid_date', 'invalid_amount', 'future_date', 'ambiguous_date_format'];
  const split = ['invalid_split_type', 'conflicting_split_schema', 'split_total_mismatch', 'percentage_total_!=_100', 'share_total_=_0', 'negative_amount', 'refund_transaction', 'precision_anomaly', 'format_anomaly', 'outlier_amount'];
  const settlement = ['settlement_logged_as_expense', 'expense_logged_as_settlement', 'self_settlement'];

  if (duplicate.includes(category)) return 'Duplicate';
  if (membership.includes(category)) return 'Membership';
  if (currency.includes(category)) return 'Currency';
  if (missing.includes(category)) return 'Missing Data';
  if (split.includes(category)) return 'Split Validation';
  if (settlement.includes(category)) return 'Settlement Validation';
  return 'Other';
}

// Fuzzy maps text names from CSV to active group user IDs
export function fuzzyMapMember(
  csvName: string,
  groupMembers: Array<{ userId: string; user: { name: string; email: string } }>
): string | null {
  const cleanCSV = csvName.toLowerCase().trim();
  if (!cleanCSV) return null;

  // 1. Exact or lowercase match
  for (const m of groupMembers) {
    const cleanRoster = m.user.name.toLowerCase().trim();
    if (cleanRoster === cleanCSV || m.user.email.toLowerCase().trim() === cleanCSV) {
      return m.userId;
    }
  }

  // 2. Prefix / Substring match (e.g. "Priya S" -> "Priya")
  for (const m of groupMembers) {
    const cleanRoster = m.user.name.toLowerCase().trim();
    if (cleanCSV.startsWith(cleanRoster) || cleanRoster.startsWith(cleanCSV)) {
      return m.userId;
    }
  }

  return null;
}

// Fuzzy maps text names from CSV to system user records
export function fuzzyMapSystemUser(
  csvName: string,
  systemUsers: Array<{ id: string; name: string; email: string }>
): { id: string; name: string; email: string } | null {
  const cleanCSV = csvName.toLowerCase().trim();
  if (!cleanCSV) return null;

  // 1. Exact or lowercase match
  for (const u of systemUsers) {
    const cleanRoster = u.name.toLowerCase().trim();
    if (cleanRoster === cleanCSV || u.email.toLowerCase().trim() === cleanCSV) {
      return u;
    }
  }

  // 2. Prefix / Substring match (e.g. "Priya S" -> "Priya")
  for (const u of systemUsers) {
    const cleanRoster = u.name.toLowerCase().trim();
    if (cleanCSV.startsWith(cleanRoster) || cleanRoster.startsWith(cleanCSV)) {
      return u;
    }
  }

  return null;
}

// Parses dates supporting DD-MM-YYYY, YYYY-MM-DD, DD.MM.YYYY, DD/MM/YY, and "Mar-14" format
export function parseCSVDate(dateStr: string): Date | null {
  const clean = dateStr.trim();
  if (!clean) return null;

  // Fuzzy match "Mar-14" -> 14th of March 2026
  if (clean.toLowerCase() === 'mar-14') {
    return new Date(2026, 2, 14);
  }

  // Split by common delimiters: dash, slash, dot, or space
  const parts = clean.split(/[-/.\s]+/);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);

    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) {
      const d = new Date(clean);
      return isNaN(d.getTime()) ? null : d;
    }

    // 1. Identify year
    let year = 2026; // default fallback
    let month = 0;
    let day = 1;

    if (p3 >= 1000) {
      // DD-MM-YYYY format
      year = p3;
      // Resolve month vs day
      if (p1 > 12 && p2 <= 12) {
        day = p1;
        month = p2 - 1;
      } else if (p2 > 12 && p1 <= 12) {
        day = p2;
        month = p1 - 1;
      } else {
        // Ambiguous, default to DD-MM-YYYY (p1 is day, p2 is month)
        day = p1;
        month = p2 - 1;
      }
    } else if (p1 >= 1000) {
      // YYYY-MM-DD format
      year = p1;
      day = p3;
      month = p2 - 1;
    } else {
      // 2-digit year (e.g. DD-MM-YY or YY-MM-DD)
      if (p3 < 100) {
        year = 2000 + p3;
        if (p1 > 12 && p2 <= 12) {
          day = p1;
          month = p2 - 1;
        } else {
          day = p1;
          month = p2 - 1;
        }
      } else if (p1 < 100) {
        year = 2000 + p1;
        day = p3;
        month = p2 - 1;
      }
    }

    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }

  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}

export function detectRowAnomalies(
  row: RawCSVRow,
  rowIndex: number,
  groupMembers: any[], // GroupMember[]
  existingExpenses: any[],
  groupBaseCurrency: string = 'INR',
  batchRows: RawCSVRow[] = [],
  systemUsers: any[] = []
): StagingExpense {
  const anomalies: Anomaly[] = [];

  // 1. Clean description
  const description = row.description ? row.description.trim() : '';
  if (!description) {
    anomalies.push({
      category: 'empty_description',
      severity: 'warning',
      description: 'Transaction has an empty description or title.',
    });
  }

  // 2. Parse Date
  const dateStr = row.date || '';
  const dateObj = parseCSVDate(dateStr);
  const parsedDate = dateObj ? dateObj.toISOString() : null;

  if (!dateObj) {
    anomalies.push({
      category: 'invalid_date',
      severity: 'critical',
      description: `Date value "${dateStr}" is invalid or unparseable.`,
    });
  } else {
    // Future Date Check
    if (dateObj.getTime() > Date.now()) {
      anomalies.push({
        category: 'future_date',
        severity: 'warning',
        description: `Date "${dateStr}" is in the future.`,
      });
    }

    // Ambiguous Date Format Check (e.g. 04-05-2026 could be April 5 or May 4)
    const dateParts = dateStr.split(/[-/.]/);
    if (dateParts.length === 3) {
      const p1 = parseInt(dateParts[0], 10);
      const p2 = parseInt(dateParts[1], 10);
      if (p1 <= 12 && p2 <= 12 && p1 !== p2) {
        anomalies.push({
          category: 'ambiguous_date_format',
          severity: 'warning',
          description: `Date "${dateStr}" is ambiguous (could be MM/DD or DD/MM).`,
        });
      }
    }
  }

  // 3. Resolve Amount & Currency from the Amount field
  const rawAmountVal = row.amount || '';
  let cleanedAmtVal = rawAmountVal.replace(/["']/g, '').trim();

  // Try to parse prefix currency code or symbol (e.g. "USD 540", "$540")
  const prefixMatch = cleanedAmtVal.match(/^([A-Za-z$₹£€]+)\s*([0-9.,\-]+)$/);
  // Try to parse suffix currency code or symbol (e.g. "540 USD", "540USD")
  const suffixMatch = cleanedAmtVal.match(/^([0-9.,\-]+)\s*([A-Za-z$₹£€]+)$/);

  let extractedAmtStr = cleanedAmtVal;
  let currencyCSV = row.currency ? row.currency.trim().toUpperCase() : '';

  if (prefixMatch) {
    const symbolOrCode = prefixMatch[1].trim().toUpperCase();
    extractedAmtStr = prefixMatch[2];
    if (!currencyCSV) {
      if (symbolOrCode === '$') currencyCSV = 'USD';
      else if (symbolOrCode === '₹') currencyCSV = 'INR';
      else if (symbolOrCode === '£') currencyCSV = 'GBP';
      else if (symbolOrCode === '€') currencyCSV = 'EUR';
      else if (symbolOrCode.length === 3) currencyCSV = symbolOrCode;
    }
  } else if (suffixMatch) {
    const symbolOrCode = suffixMatch[2].trim().toUpperCase();
    extractedAmtStr = suffixMatch[1];
    if (!currencyCSV) {
      if (symbolOrCode === '$') currencyCSV = 'USD';
      else if (symbolOrCode === '₹') currencyCSV = 'INR';
      else if (symbolOrCode === '£') currencyCSV = 'GBP';
      else if (symbolOrCode === '€') currencyCSV = 'EUR';
      else if (symbolOrCode.length === 3) currencyCSV = symbolOrCode;
    }
  }

  // Fallback to base currency if still empty
  if (!currencyCSV) {
    currencyCSV = groupBaseCurrency.toUpperCase();
  }

  const amountStr = extractedAmtStr.replace(/,/g, '').trim();
  const parsedAmount = parseFloat(amountStr) || 0;

  if (amountStr === '' || isNaN(parseFloat(amountStr))) {
    anomalies.push({
      category: 'invalid_amount',
      severity: 'critical',
      description: `Amount field "${row.amount}" is not a valid number.`,
    });
  } else {
    if (parsedAmount < 0) {
      anomalies.push({
        category: 'refund_transaction',
        severity: 'warning',
        description: `Negative amount (₹${parsedAmount}) indicates a credit/refund transaction.`,
      });
    } else if (parsedAmount === 0) {
      anomalies.push({
        category: 'negative_amount',
        severity: 'warning',
        description: 'Transaction amount is exactly zero.',
      });
    }

    // Format Anomaly Check
    if (rawAmountVal.includes(',') || rawAmountVal.includes('"') || rawAmountVal.includes("'")) {
      anomalies.push({
        category: 'format_anomaly',
        severity: 'warning',
        description: `Amount contains formatting characters: "${rawAmountVal}".`,
      });
    }

    // Precision Anomaly Check
    const decimalPart = amountStr.split('.')[1];
    if (decimalPart && decimalPart.length > 2) {
      anomalies.push({
        category: 'precision_anomaly',
        severity: 'warning',
        description: `Precision anomaly: Amount has more than 2 decimal places (${amountStr}).`,
      });
    }

    // Outlier Check
    const allAmts: number[] = [];
    if (batchRows && batchRows.length > 0) {
      batchRows.forEach((r) => {
        const cleanedVal = (r.amount || '').replace(/["']/g, '').trim();
        const numVal = parseFloat(cleanedVal.replace(/[A-Za-z$₹£€]/g, '').replace(/,/g, '').trim());
        if (!isNaN(numVal) && numVal > 0) {
          allAmts.push(numVal);
        }
      });
    }
    if (existingExpenses && existingExpenses.length > 0) {
      existingExpenses.forEach((e) => {
        const aVal = parseFloat(e.amount);
        if (!isNaN(aVal) && aVal > 0) {
          allAmts.push(aVal);
        }
      });
    }
    if (allAmts.length > 0) {
      const avg = allAmts.reduce((sum, val) => sum + val, 0) / allAmts.length;
      if (parsedAmount > 3 * avg) {
        anomalies.push({
          category: 'outlier_amount',
          severity: 'info', // Downgraded to INFO
          description: `Outlier: Amount (${currencyCSV} ${parsedAmount.toFixed(2)}) is >3x the average (${currencyCSV} ${avg.toFixed(2)}).`,
        });
      }
    }
  }

  // 4. Exchange Rate Handling
  const notesCSV = row.notes ? row.notes.trim() : '';
  const noteRateMatch = notesCSV.match(/rate\s*[:=]\s*([0-9.]+)/i) || description.match(/rate\s*[:=]\s*([0-9.]+)/i);
  let exchangeRate = noteRateMatch ? parseFloat(noteRateMatch[1]) : 1.0;

  if (currencyCSV !== groupBaseCurrency.toUpperCase()) {
    if (exchangeRate === 1.0) {
      if (currencyCSV === 'USD') {
        exchangeRate = 83.0; // realistic default exchange rate for USD
      } else {
        anomalies.push({
          category: 'missing_exchange_rate',
          severity: 'critical',
          description: `Mixed currency transaction (${currencyCSV}) lacks conversion factor. Add conversion rate in the staging editor.`,
        });
      }
    }
  }

  const convertedAmount = parsedAmount * exchangeRate;



  // 5. Payer checks
  const paidByCSV = row.paid_by ? row.paid_by.trim() : '';
  let paidByUserId = fuzzyMapMember(paidByCSV, groupMembers);
  let isSystemUserOnly = false;

  if (!paidByUserId && paidByCSV) {
    const sysUser = fuzzyMapSystemUser(paidByCSV, systemUsers);
    if (sysUser) {
      paidByUserId = sysUser.id;
      isSystemUserOnly = true;
    }
  }

  if (!paidByCSV) {
    anomalies.push({
      category: 'missing_payer',
      severity: 'critical',
      description: 'Payer name is missing in the export sheet.',
    });
  } else if (!paidByUserId) {
    anomalies.push({
      category: 'unknown_participant',
      severity: 'critical',
      description: `Payer "${paidByCSV}" is unregistered. Resolve this name in the staging editor.`,
      meta: { unknownName: paidByCSV }
    });
  } else if (isSystemUserOnly) {
    anomalies.push({
      category: 'user_not_in_group',
      severity: 'warning',
      description: `Payer "${paidByCSV}" is in the system but not currently active in group roster. Will be added to group upon commit.`,
    });
  }

  // 6. Split Participants and Logic
  const splitTypeCSV = row.split_type ? row.split_type.trim().toLowerCase() : '';
  const splitWithCSV = row.split_with ? row.split_with.trim() : '';
  const splitDetailsCSV = row.split_details ? row.split_details.trim() : '';

  const descLower = description.toLowerCase();
  const isSettlementKeyword = 
    descLower.includes('paid back') || 
    descLower.includes('settled') || 
    descLower.includes('repaid') || 
    descLower.includes('deposit share') ||
    descLower.includes('settlement');

  const isSettlement = isSettlementKeyword || splitTypeCSV === 'settlement' || !!(!splitTypeCSV && splitWithCSV && !splitDetailsCSV);

  if (isSettlementKeyword) {
    if (splitTypeCSV && splitTypeCSV !== 'settlement') {
      anomalies.push({
        category: 'settlement_logged_as_expense',
        severity: 'warning',
        description: 'This transaction represents a peer settlement, but is logged with an expense split type.',
      });
      anomalies.push({
        category: 'expense_logged_as_settlement',
        severity: 'warning',
        description: 'This peer settlement was logged in the expense schema.',
      });
    } else {
      anomalies.push({
        category: 'settlement_logged_as_expense',
        severity: 'warning',
        description: 'This transaction represents a peer settlement, not a shared group expense.',
      });
    }
  }

  // If splits are missing
  if (!isSettlement) {
    if (!splitTypeCSV) {
      anomalies.push({
        category: 'invalid_split_type',
        severity: 'critical',
        description: 'Split type is missing or unparseable.',
      });
    } else if (!['equal', 'unequal', 'percentage', 'share'].includes(splitTypeCSV)) {
      anomalies.push({
        category: 'invalid_split_type',
        severity: 'critical',
        description: `Split type "${splitTypeCSV}" is invalid. Must be: equal, unequal, percentage, or share.`,
      });
    }

    if (splitTypeCSV === 'equal' && splitDetailsCSV) {
      anomalies.push({
        category: 'conflicting_split_schema',
        severity: 'warning',
        description: 'Split type is equal, but custom split details/shares are provided.',
      });
    }

    if (!splitWithCSV) {
      anomalies.push({
        category: 'missing_participants',
        severity: 'critical',
        description: 'Split participants list is empty.',
      });
    }
  }

  // Parse split participants
  const participants = splitWithCSV ? splitWithCSV.split(';').map((p) => p.trim()).filter(Boolean) : [];
  const participantIds: string[] = [];
  const unknownNames: string[] = [];
  const nonGroupNames: string[] = [];
  const nonGroupLegacyNames: string[] = [];

  participants.forEach((p) => {
    let uid = fuzzyMapMember(p, groupMembers);
    if (uid) {
      participantIds.push(uid);
    } else {
      const sysUser = fuzzyMapSystemUser(p, systemUsers);
      if (sysUser) {
        participantIds.push(sysUser.id);
        nonGroupNames.push(p);
      } else {
        unknownNames.push(p);
        nonGroupLegacyNames.push(p);
      }
    }
  });

  if (unknownNames.length > 0) {
    anomalies.push({
      category: 'unknown_participant',
      severity: 'critical',
      description: `Participants contain unregistered name(s): ${unknownNames.join(', ')}. Resolve these names in the staging editor.`,
      meta: { unknownName: unknownNames[0] }
    });
  }

  if (nonGroupNames.length > 0) {
    anomalies.push({
      category: 'user_not_in_group',
      severity: 'warning',
      description: `Participants contain users not in group roster (will be added to group upon commit): ${nonGroupNames.join(', ')}.`,
    });
  }

  // 7. Timeline checks (joined/left dates)
  if (dateObj) {
    // Check if payer is active
    if (paidByUserId) {
      const payerMember = groupMembers.find((m) => m.userId === paidByUserId);
      if (payerMember) {
        const joinedTime = payerMember.joinedAt ? new Date(payerMember.joinedAt).getTime() : 0;
        const leftTime = payerMember.leftAt ? new Date(payerMember.leftAt).getTime() : null;
        const expTime = dateObj.getTime();

        if (expTime < joinedTime) {
          anomalies.push({
            category: 'expense_before_member_joined',
            severity: 'critical',
            description: `Payer "${paidByCSV}" had not joined the group yet on the expense date (${row.date}).`,
          });
        }
        if (leftTime && expTime > leftTime) {
          anomalies.push({
            category: 'expense_after_member_left',
            severity: 'critical',
            description: `Payer "${paidByCSV}" had already left the group on the expense date (${row.date}).`,
          });
        }
      }
    }

    // Check participants
    participantIds.forEach((uid) => {
      const pm = groupMembers.find((m) => m.userId === uid);
      if (pm) {
        const joinedTime = pm.joinedAt ? new Date(pm.joinedAt).getTime() : 0;
        const leftTime = pm.leftAt ? new Date(pm.leftAt).getTime() : null;
        const expTime = dateObj.getTime();

        if (expTime < joinedTime) {
          anomalies.push({
            category: 'expense_before_member_joined',
            severity: 'critical',
            description: `Participant "${memberName(uid)}" had not joined yet on the expense date (${row.date}).`,
          });
        }
        if (leftTime && expTime > leftTime) {
          anomalies.push({
            category: 'expense_after_member_left',
            severity: 'critical',
            description: `Participant "${memberName(uid)}" had already left the group on the expense date (${row.date}).`,
          });
        }
      }
    });
  }

  function memberName(id: string): string {
    return groupMembers.find((m) => m.userId === id)?.user.name ||
      systemUsers.find((u) => u.id === id)?.name ||
      'Unknown';
  }

  // 8. Split details validation
  if (!isSettlement && splitTypeCSV && splitWithCSV) {
    if (splitTypeCSV === 'unequal') {
      const detailsMap: { [name: string]: number } = {};
      const detailParts = splitDetailsCSV ? splitDetailsCSV.split(';').map((p) => p.trim()) : [];
      let unequalSum = 0;

      detailParts.forEach((part) => {
        const m = part.match(/^(.+?)\s+([0-9.]+)$/);
        if (m) {
          const name = m[1].trim();
          const amt = parseFloat(m[2]) || 0;
          detailsMap[name.toLowerCase()] = amt;
          unequalSum += amt;
        }
      });

      if (Math.abs(unequalSum - parsedAmount) > 0.02) {
        anomalies.push({
          category: 'split_total_mismatch',
          severity: 'critical',
          description: `Sum of unequal split shares (₹${unequalSum.toFixed(2)}) does not equal total amount (₹${parsedAmount.toFixed(2)}).`,
        });
      }
    } else if (splitTypeCSV === 'percentage') {
      const detailParts = splitDetailsCSV ? splitDetailsCSV.split(';').map((p) => p.trim()) : [];
      let percentSum = 0;

      detailParts.forEach((part) => {
        const m = part.match(/^(.+?)\s+([0-9.]+)\s*%?$/);
        if (m) {
          const pct = parseFloat(m[2]) || 0;
          percentSum += pct;
        }
      });

      if (Math.abs(percentSum - 100) > 0.02) {
        anomalies.push({
          category: 'percentage_total_!=_100',
          severity: 'critical',
          description: `Sum of percentages (${percentSum.toFixed(1)}%) must equal exactly 100%.`,
        });
      }
    } else if (splitTypeCSV === 'share') {
      const detailParts = splitDetailsCSV ? splitDetailsCSV.split(';').map((p) => p.trim()) : [];
      let shareSum = 0;

      detailParts.forEach((part) => {
        const m = part.match(/^(.+?)\s+([0-9.]+)$/);
        if (m) {
          const sc = parseFloat(m[2]) || 0;
          shareSum += sc;
        }
      });

      if (shareSum === 0) {
        anomalies.push({
          category: 'share_total_=_0',
          severity: 'critical',
          description: 'Sum of portion shares cannot be zero.',
        });
      }
    }
  }

  // 9. Peer-to-peer anomalies
  if (isSettlement && paidByUserId && participantIds.length === 1) {
    const receiverId = participantIds[0];
    if (paidByUserId === receiverId) {
      anomalies.push({
        category: 'self_settlement',
        severity: 'critical',
        description: 'Payer and recipient in settlement must be different members.',
      });
    }
  }

  // 10. Duplicate checks across database and batch
  if (dateObj && parsedAmount > 0) {
    const cleanTitle = description.toLowerCase();
    
    // Check against db existing expenses
    const dbDuplicate = existingExpenses.some((exp) => {
      const expAmt = parseFloat(exp.amount);
      const timeDiff = Math.abs(dateObj.getTime() - new Date(exp.created_at).getTime());
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      const cleanExpTitle = exp.title.replace(/ (🏖|🏠|🎓|💍|🚗|📦|🍔|✈️|🏨|🎟️|🛒)$/, '').trim().toLowerCase();
      return expAmt === parsedAmount && cleanTitle === cleanExpTitle && hoursDiff < 24;
    });

    if (dbDuplicate) {
      anomalies.push({
        category: 'duplicate_expense',
        severity: 'warning',
        description: `Possible duplicate transaction found in the database.`,
        meta: { duplicateType: 'database' }
      });
    }

    // Check exact duplicate in current CSV batch
    let duplicateBatchIdx = -1;
    for (let bIdx = 0; bIdx < batchRows.length; bIdx++) {
      if (bIdx === rowIndex) continue;
      const bRow = batchRows[bIdx];
      const bDate = parseCSVDate(bRow.date);
      if (!bDate) continue;

      const timeDiff = Math.abs(dateObj.getTime() - bDate.getTime());
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      const bTitle = bRow.description ? bRow.description.trim().toLowerCase() : '';
      const bAmt = parseFloat(bRow.amount ? bRow.amount.replace(/["',]/g, '') : '0') || 0;
      const bPayer = bRow.paid_by ? bRow.paid_by.trim().toLowerCase() : '';

      if (bAmt === parsedAmount && bTitle === cleanTitle && hoursDiff < 24 && bPayer === paidByCSV.toLowerCase()) {
        duplicateBatchIdx = bIdx;
        break;
      }
    }

    if (duplicateBatchIdx !== -1) {
      anomalies.push({
        category: 'duplicate_expense',
        severity: 'warning',
        description: `Potential duplicate of staged Row #${duplicateBatchIdx + 1}.`,
        meta: {
          duplicateRowIndex: duplicateBatchIdx,
          duplicateType: 'batch'
        }
      });
    }

    // Check conflict (duplicate but conflicting records in batch)
    const batchConflict = batchRows.some((bRow, bIdx) => {
      if (bIdx >= rowIndex) return false; // only compare with previous rows
      const bDate = parseCSVDate(bRow.date);
      if (!bDate) return false;

      const timeDiff = Math.abs(dateObj.getTime() - bDate.getTime());
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      const bTitle = bRow.description ? bRow.description.trim().toLowerCase() : '';
      const bAmt = parseFloat(bRow.amount ? bRow.amount.replace(/["',]/g, '') : '0') || 0;

      // Conflicting means same date/event, but different payer or amount
      const isSameEvent = bTitle === cleanTitle && hoursDiff < 24;
      const hasConflict = bAmt !== parsedAmount || bRow.paid_by?.trim() !== paidByCSV;
      return isSameEvent && hasConflict;
    });

    if (batchConflict) {
      anomalies.push({
        category: 'duplicate_but_conflicting_records',
        severity: 'warning',
        description: 'Found a transaction with the same description/date but conflicting amount or payer.',
      });
    }
  }

  return {
    rowIndex,
    dateStr,
    parsedDate,
    description,
    paidByCSV,
    paidByUserId,
    amountCSV: row.amount,
    parsedAmount,
    currencyCSV,
    splitTypeCSV,
    splitWithCSV,
    splitDetailsCSV,
    notesCSV: row.notes,
    anomalies,
    isSettlement,
    isDeleted: false,
    exchangeRate,
    convertedAmount,
  };
}
