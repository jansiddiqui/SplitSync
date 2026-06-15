import React, { useState, useEffect, useRef } from 'react';
import { supabase, checkIsLegacySchema } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { parseCSV, RawCSVRow } from '../utils/csvParser';
import { detectRowAnomalies, StagingExpense, fuzzyMapMember, parseCSVDate, fuzzyMapSystemUser, getAnomalyGroup } from '../utils/anomalyDetector';
import { X, Upload, Check, AlertTriangle, RefreshCw, Trash2, ArrowRight, Settings, Info, UserPlus, Calendar } from 'lucide-react';
import { useToast } from './Toast';

interface Member {
  id: string;
  name: string;
  email: string;
  joinedAt?: string;
  leftAt?: string | null;
}

interface CSVImportModalProps {
  groupId: string;
  members: Member[];
  onClose: (shouldRefresh: boolean) => void;
  baseCurrency: string;
}

export const CSVImportModal: React.FC<CSVImportModalProps> = ({ groupId, members, onClose, baseCurrency }) => {
  const { user } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal flow state: 'upload' | 'mapping' | 'staging' | 'summary'
  const [step, setStep] = useState<'upload' | 'mapping' | 'staging' | 'summary'>('upload');
  
  // File & Raw CSV State
  const [fileName, setFileName] = useState('');
  const [csvText, setCSVText] = useState('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawCSVRow[]>([]);
  
  // Column Mapping selections
  const [mapping, setMapping] = useState<{ [field: string]: string }>({
    date: 'date',
    description: 'description',
    paid_by: 'paid_by',
    amount: 'amount',
    currency: 'currency',
    split_type: 'split_type',
    split_with: 'split_with',
    split_details: 'split_details',
    notes: 'notes',
  });

  // Staging Review State
  const [stagingRows, setStagingRows] = useState<StagingExpense[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'errors' | 'clean'>('all');
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  // Db references for duplicate check
  const [existingExpenses, setExistingExpenses] = useState<any[]>([]);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);

  // Summary Metrics State
  const [summaryMetrics, setSummaryMetrics] = useState<{
    totalRows: number;
    importedCount: number;
    anomalyCount: number;
    totalAmountBase: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Group members mapped to structure expected by fuzzy resolver
  const initialRosterMembers = members.map((m) => ({
    userId: m.id,
    joinedAt: m.joinedAt,
    leftAt: m.leftAt,
    user: {
      name: m.name,
      email: m.email,
    },
  }));

  const [localRoster, setLocalRoster] = useState(initialRosterMembers);
  const [pendingUsersToCreate, setPendingUsersToCreate] = useState<{
    [name: string]: {
      joinDateType: 'first_expense' | 'group_start' | 'custom';
      customDate?: string;
    };
  }>({});
  const [showDryRun, setShowDryRun] = useState(false);
  const [isLegacy, setIsLegacy] = useState(false);

  // Fetch group data and system users on load
  useEffect(() => {
    const fetchExistingData = async () => {
      try {
        const legacy = await checkIsLegacySchema();
        setIsLegacy(legacy);

        let query = supabase
          .from('Expense')
          .select('title, amount, paid_by, created_at')
          .eq('group_id', groupId);

        if (!legacy) {
          query = query.is('deleted_at', null);
        }

        const { data, error } = await query;
        if (error) {
          // Fallback check just in case
          const { data: fallbackData, error: fallbackErr } = await supabase
            .from('Expense')
            .select('title, amount, paid_by, created_at')
            .eq('group_id', groupId);
          if (fallbackErr) throw fallbackErr;
          setExistingExpenses((fallbackData || []).filter((e: any) => !e.title.includes('[deleted:')));
        } else {
          setExistingExpenses(data || []);
        }
      } catch (e) {
        console.error('Failed to load existing expenses for duplicate check:', e);
      }
    };

    const fetchSystemUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('User')
          .select('id, name, email');
        if (error) throw error;
        setSystemUsers(data || []);
      } catch (e) {
        console.error('Failed to load system users:', e);
      }
    };

    fetchExistingData();
    fetchSystemUsers();
  }, [groupId]);

  const getJoinDateForPendingUser = (name: string, type?: 'first_expense' | 'group_start' | 'custom', customDate?: string) => {
    const resolveType = type || pendingUsersToCreate[name]?.joinDateType || 'first_expense';
    
    if (resolveType === 'custom' && customDate) {
      return customDate;
    }
    if (resolveType === 'group_start') {
      return '2026-01-01T00:00:00.000Z'; // group early start
    }
    
    // Find earliest expense date in rawRows for this name
    let earliestTime = Date.now();
    let found = false;

    rawRows.forEach((row) => {
      const dateObj = parseCSVDate(row.date);
      if (!dateObj) return;

      const isPayer = row.paid_by?.trim().toLowerCase() === name.toLowerCase();
      const splitNames = row.split_with ? row.split_with.split(';').map(p => p.trim().toLowerCase()) : [];
      const isPart = splitNames.includes(name.toLowerCase());

      if (isPayer || isPart) {
        if (dateObj.getTime() < earliestTime) {
          earliestTime = dateObj.getTime();
          found = true;
        }
      }
    });

    return found ? new Date(earliestTime).toISOString() : new Date().toISOString();
  };

  const handleMapNameGlobally = (unknownName: string, targetName: string, targetUserId: string) => {
    setStagingRows((prev) =>
      prev.map((row) => {
        let overrides: Partial<StagingExpense> = {};
        let changed = false;

        if (row.paidByCSV.trim().toLowerCase() === unknownName.toLowerCase()) {
          overrides.paidByCSV = targetName;
          overrides.paidByUserId = targetUserId;
          changed = true;
        }

        if (row.splitWithCSV) {
          const parts = row.splitWithCSV.split(';').map(p => p.trim()).filter(Boolean);
          const mapped = parts.map((p) => p.toLowerCase() === unknownName.toLowerCase() ? targetName : p);
          const newSplitWith = Array.from(new Set(mapped)).join('; ');
          if (newSplitWith !== row.splitWithCSV) {
            overrides.splitWithCSV = newSplitWith;
            changed = true;
          }
        }

        if (row.splitDetailsCSV) {
          const parts = row.splitDetailsCSV.split(';').map(p => p.trim()).filter(Boolean);
          const mapped = parts.map((part) => {
            const match = part.match(/^(.+?)\s+([0-9.]+)\s*%?$/);
            if (match) {
              const name = match[1].trim();
              const val = match[2];
              const isPct = part.includes('%');
              if (name.toLowerCase() === unknownName.toLowerCase()) {
                return `${targetName} ${val}${isPct ? '%' : ''}`;
              }
            }
            return part;
          });
          const newSplitDetails = mapped.join('; ');
          if (newSplitDetails !== row.splitDetailsCSV) {
            overrides.splitDetailsCSV = newSplitDetails;
            changed = true;
          }
        }

        if (changed) {
          const copy = { ...row, ...overrides };
          // Re-run anomaly checks immediately
          const rawRow: RawCSVRow = {
            date: copy.dateStr,
            description: copy.description,
            paid_by: copy.paidByCSV,
            amount: copy.parsedAmount.toString(),
            currency: copy.currencyCSV,
            split_type: copy.splitTypeCSV,
            split_with: copy.splitWithCSV,
            split_details: copy.splitDetailsCSV,
            notes: copy.notesCSV,
          };
          const reanalyzed = detectRowAnomalies(
            rawRow,
            copy.rowIndex,
            localRoster,
            existingExpenses,
            baseCurrency,
            rawRows,
            systemUsers
          );
          return {
            ...reanalyzed,
            paidByUserId: copy.paidByUserId,
            parsedAmount: copy.parsedAmount,
            currencyCSV: copy.currencyCSV,
            isSettlement: copy.isSettlement,
            isDeleted: copy.isDeleted,
            exchangeRate: copy.exchangeRate,
            convertedAmount: copy.parsedAmount * copy.exchangeRate,
          };
        }

        return row;
      })
    );
    toast.success(`Mapped all occurrences of "${unknownName}" to "${targetName}".`);
  };

  // Re-detect anomalies when localRoster, systemUsers, or pendingUsersToCreate change
  useEffect(() => {
    if (stagingRows.length === 0) return;

    const pendingRosterMembers = Object.keys(pendingUsersToCreate).map((name) => {
      const config = pendingUsersToCreate[name];
      const jDate = getJoinDateForPendingUser(name, config.joinDateType, config.customDate);
      return {
        userId: `pending-${name}`,
        joinedAt: jDate,
        leftAt: null,
        user: {
          name,
          email: `${name.toLowerCase().replace(/\s+/g, '')}.import@splitsync.local`,
        },
      };
    });

    const combinedRoster = [...localRoster, ...pendingRosterMembers];

    setStagingRows((prev) =>
      prev.map((row) => {
        if (row.isDeleted) return row;

        const rawRow: RawCSVRow = {
          date: row.dateStr,
          description: row.description,
          paid_by: row.paidByCSV,
          amount: row.parsedAmount.toString(),
          currency: row.currencyCSV,
          split_type: row.splitTypeCSV,
          split_with: row.splitWithCSV,
          split_details: row.splitDetailsCSV,
          notes: row.notesCSV,
        };

        const reanalyzed = detectRowAnomalies(
          rawRow,
          row.rowIndex,
          combinedRoster,
          existingExpenses,
          baseCurrency,
          rawRows,
          systemUsers
        );

        // Preserve manual edits/overrides
        reanalyzed.paidByUserId = row.paidByUserId || reanalyzed.paidByUserId;
        reanalyzed.parsedAmount = row.parsedAmount;
        reanalyzed.currencyCSV = row.currencyCSV;
        reanalyzed.isSettlement = row.isSettlement;
        reanalyzed.isDeleted = row.isDeleted;
        reanalyzed.exchangeRate = row.exchangeRate;
        reanalyzed.convertedAmount = row.parsedAmount * row.exchangeRate;

        // Custom check: if payer is manually assigned, remove name validation errors
        if (reanalyzed.paidByUserId) {
          reanalyzed.anomalies = reanalyzed.anomalies.filter(
            (a) => a.category !== 'missing_payer' && a.category !== 'unknown_participant'
          );
        }

        // Filter out missing exchange rate if it's not a mismatch anymore
        if (reanalyzed.currencyCSV !== baseCurrency && reanalyzed.exchangeRate !== 1.0) {
          reanalyzed.anomalies = reanalyzed.anomalies.filter((a) => a.category !== 'missing_exchange_rate');
        }

        return reanalyzed;
      })
    );
  }, [localRoster, systemUsers, pendingUsersToCreate]);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      processFile(file);
    } else {
      toast.error('Please select a valid CSV file.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCSVText(text);
      
      // Extract headers
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length > 0) {
        const parseRow = (line: string): string[] => {
          const result: string[] = [];
          let cell = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(cell.trim());
              cell = '';
            } else {
              cell += char;
            }
          }
          result.push(cell.trim());
          return result;
        };

        const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
        setRawHeaders(headers);
        
        // Auto map columns
        const newMapping = { ...mapping };
        const fields = ['date', 'description', 'paid_by', 'amount', 'currency', 'split_type', 'split_with', 'split_details', 'notes'];
        
        fields.forEach((field) => {
          const matched = headers.find(
            (h) => h.toLowerCase() === field || h.toLowerCase() === field.replace('_', ' ') || h.toLowerCase() === field.replace('_', '')
          );
          if (matched) {
            newMapping[field] = matched;
          }
        });
        setMapping(newMapping);
        setStep('mapping');
      } else {
        toast.error('The selected CSV file is empty.');
      }
    };
    reader.readAsText(file);
  };

  const handleApplyMapping = () => {
    if (!csvText) return;
    setLoading(true);

    try {
      // Parse file
      const rawParsed = parseCSV(csvText);
      
      // Remap keys based on user selection
      const remappedRows: RawCSVRow[] = rawParsed.map((row: any) => {
        const remapped: any = {};
        Object.keys(mapping).forEach((field) => {
          const csvCol = mapping[field];
          remapped[field] = row[csvCol] || '';
        });
        return remapped as RawCSVRow;
      });

      setRawRows(remappedRows);

      // Perform anomaly detection
      const staged = remappedRows.map((row, idx) => {
        return detectRowAnomalies(
          row,
          idx,
          localRoster,
          existingExpenses,
          baseCurrency,
          remappedRows,
          systemUsers
        );
      });

      // Auto resolve simple fuzzy mapping on initial load
      const autoStaged = staged.map((row) => {
        let updated = { ...row };
        
        // Auto map payer
        if (!updated.paidByUserId && updated.paidByCSV) {
          const resolvedPayerId = fuzzyMapMember(updated.paidByCSV, localRoster);
          if (resolvedPayerId) {
            updated.paidByUserId = resolvedPayerId;
            // Remove missing payer or unknown participant errors
            updated.anomalies = updated.anomalies.filter(
              (a) => a.category !== 'missing_payer' && a.category !== 'unknown_participant'
            );
          }
        }
        
        // Auto parse date format if it was fuzzy like "Mar-14"
        if (updated.dateStr && !updated.parsedDate) {
          const parsed = parseCSVDate(updated.dateStr);
          if (parsed) {
            updated.parsedDate = parsed.toISOString();
            updated.anomalies = updated.anomalies.filter((a) => a.category !== 'invalid_date');
          }
        }
        
        // Auto fallback empty currency to Base
        if (!updated.currencyCSV) {
          updated.currencyCSV = baseCurrency;
          updated.anomalies = updated.anomalies.filter((a) => a.category !== 'currency_mismatch');
        }

        return updated;
      });

      setStagingRows(autoStaged);
      setStep('staging');
      toast.success('CSV analyzed and staged successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Error occurred during parsing.');
    } finally {
      setLoading(false);
    }
  };

  // Row edit handler
  const handleUpdateRow = (index: number, updatedFields: Partial<StagingExpense>) => {
    setStagingRows((prev) => {
      const copy = [...prev];
      const target = { ...copy[index], ...updatedFields };

      // Re-run anomaly checks for this row
      const rawRow: RawCSVRow = {
        date: target.dateStr,
        description: target.description,
        paid_by: target.paidByCSV,
        amount: target.parsedAmount.toString(),
        currency: target.currencyCSV,
        split_type: target.splitTypeCSV,
        split_with: target.splitWithCSV,
        split_details: target.splitDetailsCSV,
        notes: target.notesCSV,
      };

      // Re-run with pending users resolved as well
      const pendingRosterMembers = Object.keys(pendingUsersToCreate).map((name) => {
        const config = pendingUsersToCreate[name];
        const jDate = getJoinDateForPendingUser(name, config.joinDateType, config.customDate);
        return {
          userId: `pending-${name}`,
          joinedAt: jDate,
          leftAt: null,
          user: {
            name,
            email: `${name.toLowerCase().replace(/\s+/g, '')}.import@splitsync.local`,
          },
        };
      });

      const reanalyzed = detectRowAnomalies(
        rawRow,
        index,
        [...localRoster, ...pendingRosterMembers],
        existingExpenses,
        baseCurrency,
        rawRows,
        systemUsers
      );

      // Preserve overrides
      reanalyzed.paidByUserId = target.paidByUserId;
      reanalyzed.parsedAmount = target.parsedAmount;
      reanalyzed.currencyCSV = target.currencyCSV;
      reanalyzed.isSettlement = target.isSettlement;
      reanalyzed.isDeleted = target.isDeleted;
      reanalyzed.exchangeRate = target.exchangeRate !== undefined ? target.exchangeRate : reanalyzed.exchangeRate;
      reanalyzed.convertedAmount = reanalyzed.parsedAmount * reanalyzed.exchangeRate;

      // Custom check: if payer is manually assigned, remove name validation errors
      if (reanalyzed.paidByUserId) {
        reanalyzed.anomalies = reanalyzed.anomalies.filter(
          (a) => a.category !== 'missing_payer' && a.category !== 'unknown_participant'
        );
      }

      // If currency rate is supplied, ignore missing exchange rate
      if (reanalyzed.currencyCSV !== baseCurrency && reanalyzed.exchangeRate !== 1.0) {
        reanalyzed.anomalies = reanalyzed.anomalies.filter((a) => a.category !== 'missing_exchange_rate');
      }

      copy[index] = reanalyzed;
      return copy;
    });
  };

  // Quick Fixes
  const handleNormalizePercentages = (index: number) => {
    const row = stagingRows[index];
    if (row.splitTypeCSV !== 'percentage') return;
    
    const parts = row.splitDetailsCSV.split(';').map(p => p.trim());
    let currentSum = 0;
    const parsedParts: { name: string; pct: number }[] = [];

    parts.forEach((part) => {
      const match = part.match(/^(.+?)\s+([0-9.]+)\s*%?$/);
      if (match) {
        const name = match[1].trim();
        const pct = parseFloat(match[2]) || 0;
        parsedParts.push({ name, pct });
        currentSum += pct;
      }
    });

    if (currentSum === 0) return;

    // Scale back to 100%
    const normalizedParts = parsedParts.map((p) => {
      const normVal = Math.round((p.pct / currentSum) * 100);
      return `${p.name} ${normVal}%`;
    });

    handleUpdateRow(index, {
      splitDetailsCSV: normalizedParts.join('; '),
    });
    toast.info('Percentages normalized back to exactly 100%.');
  };

  const handleNormalizeAllPercentages = () => {
    stagingRows.forEach((row, idx) => {
      if (row.splitTypeCSV === 'percentage' && row.anomalies.some(a => a.category === 'percentage_total_!=_100')) {
        handleNormalizePercentages(idx);
      }
    });
    toast.success('All percentage anomalies normalized.');
  };

  const handleFuzzyMapAll = () => {
    // 1. Identify all unresolved names (not in localRoster and not in systemUsers)
    const unresolvedNames = new Set<string>();

    stagingRows.forEach((row) => {
      if (row.isDeleted) return;

      const RESERVED_WORDS = ['equal', 'unequal', 'percentage', 'share', 'inr', 'usd', 'eur', 'gbp'];

      if (row.paidByCSV) {
        const cleanPayer = row.paidByCSV.trim();
        if (!RESERVED_WORDS.includes(cleanPayer.toLowerCase())) {
          const hasMember = fuzzyMapMember(cleanPayer, localRoster);
          const hasSys = fuzzyMapSystemUser(cleanPayer, systemUsers);
          if (!hasMember && !hasSys) {
            unresolvedNames.add(cleanPayer);
          }
        }
      }

      if (row.splitWithCSV) {
        const parts = row.splitWithCSV.split(';').map(p => p.trim()).filter(Boolean);
        parts.forEach((p) => {
          if (!RESERVED_WORDS.includes(p.toLowerCase())) {
            const hasMember = fuzzyMapMember(p, localRoster);
            const hasSys = fuzzyMapSystemUser(p, systemUsers);
            if (!hasMember && !hasSys) {
              unresolvedNames.add(p);
            }
          }
        });
      }
    });

    // 2. Build nameMap for unresolved names sequentially mapping to roster members
    const nameMap: { [name: string]: string } = {};
    const unresolvedList = Array.from(unresolvedNames);

    if (localRoster.length > 0) {
      unresolvedList.forEach((name, index) => {
        const targetMember = localRoster[index % localRoster.length];
        if (targetMember) {
          nameMap[name.toLowerCase()] = targetMember.user.name;
        }
      });
    }

    // 3. Update all staging rows by replacing unresolved names with mapped names
    stagingRows.forEach((row, idx) => {
      let overrides: Partial<StagingExpense> = {};
      let changed = false;

      // Payer replacement
      if (row.paidByCSV) {
        const cleanPayer = row.paidByCSV.trim();
        const mappedName = nameMap[cleanPayer.toLowerCase()];
        if (mappedName) {
          overrides.paidByCSV = mappedName;
          const uid = fuzzyMapMember(mappedName, localRoster);
          if (uid) {
            overrides.paidByUserId = uid;
          }
          changed = true;
        } else if (!row.paidByUserId) {
          const uid = fuzzyMapMember(cleanPayer, localRoster) || fuzzyMapSystemUser(cleanPayer, systemUsers)?.id;
          if (uid) {
            overrides.paidByUserId = uid;
            changed = true;
          }
        }
      }

      // Split participants replacement
      if (row.splitWithCSV) {
        const participants = row.splitWithCSV.split(';').map(p => p.trim()).filter(Boolean);
        const mappedParticipants = participants.map((p) => {
          const cleanP = p.trim();
          return nameMap[cleanP.toLowerCase()] || cleanP;
        });
        const uniqueMapped = Array.from(new Set(mappedParticipants));
        const newSplitWith = uniqueMapped.join('; ');
        if (newSplitWith !== row.splitWithCSV) {
          overrides.splitWithCSV = newSplitWith;
          changed = true;
        }

        // Split details replacement (if exists)
        if (row.splitDetailsCSV) {
          const detailsParts = row.splitDetailsCSV.split(';').map(p => p.trim()).filter(Boolean);
          const detailsMap: { [name: string]: number } = {};
          const isPercentage = row.splitTypeCSV === 'percentage';
          const hasPercentageSymbol = row.splitDetailsCSV.includes('%');

          detailsParts.forEach((part) => {
            const match = part.match(/^(.+?)\s+([0-9.]+)\s*%?$/);
            if (match) {
              const name = match[1].trim();
              const val = parseFloat(match[2]) || 0;
              const mappedName = nameMap[name.toLowerCase()] || name;
              const key = mappedName.toLowerCase();
              detailsMap[key] = (detailsMap[key] || 0) + val;
            }
          });

          const newSplitDetails = Object.keys(detailsMap).map((name) => {
            const targetUser = localRoster.find(m => m.user.name.toLowerCase() === name) ||
                               systemUsers.find(u => u.name.toLowerCase() === name);
            const displayName = targetUser ? (targetUser.user?.name || targetUser.name) : name;
            const valStr = detailsMap[name].toString();
            return `${displayName} ${valStr}${isPercentage && hasPercentageSymbol ? '%' : ''}`;
          }).join('; ');

          if (newSplitDetails !== row.splitDetailsCSV) {
            overrides.splitDetailsCSV = newSplitDetails;
            changed = true;
          }
        }
      }

      if (changed) {
        handleUpdateRow(idx, overrides);
      }
    });

    toast.success('Fuzzy mapping completed for all matching names.');
  };

  const handleRemoveAllCriticalErrors = () => {
    setStagingRows((prev) =>
      prev.map((row) => {
        const hasCritical = row.anomalies.some((a) => a.severity === 'critical');
        if (hasCritical) {
          return { ...row, isDeleted: true };
        }
        return row;
      })
    );
    toast.warning('All rows with unresolved critical errors marked as discarded.');
  };

  const handleResolveAllUnknownUsers = () => {
    const names = new Set<string>();
    stagingRows.forEach((row) => {
      if (row.isDeleted) return;
      row.anomalies.forEach((a) => {
        if (a.category === 'unknown_participant' && a.meta?.unknownName) {
          names.add(a.meta.unknownName);
        }
      });
    });

    const unknownList = Array.from(names);
    if (unknownList.length === 0) {
      toast.info('No unregistered names found to resolve.');
      return;
    }

    const updates: { [name: string]: { joinDateType: 'first_expense' | 'group_start' | 'custom' } } = {};
    unknownList.forEach((name) => {
      updates[name] = { joinDateType: 'first_expense' };
    });

    setPendingUsersToCreate((prev) => ({
      ...prev,
      ...updates,
    }));

    toast.success(`Successfully marked ${unknownList.length} unregistered users for creation.`);
  };

  const handleResolveAllJoinDates = () => {
    const userEarliestDates: { [userId: string]: string } = {};

    stagingRows.forEach((row) => {
      if (row.isDeleted) return;
      row.anomalies.forEach((a) => {
        if (a.category === 'expense_before_member_joined' && a.meta?.userId && a.meta?.earliestDate) {
          const uid = a.meta.userId;
          const ed = a.meta.earliestDate;
          if (!userEarliestDates[uid] || new Date(ed).getTime() < new Date(userEarliestDates[uid]).getTime()) {
            userEarliestDates[uid] = ed;
          }
        }
      });
    });

    const userIds = Object.keys(userEarliestDates);
    if (userIds.length === 0) {
      toast.info('No roster join date discrepancies found.');
      return;
    }

    setLocalRoster((prev) =>
      prev.map((m) => {
        const earliest = userEarliestDates[m.userId];
        if (earliest) {
          if (m.joinedAt && new Date(earliest).getTime() < new Date(m.joinedAt).getTime()) {
            return { ...m, joinedAt: earliest };
          }
        }
        return m;
      })
    );

    toast.success(`Successfully backdated join dates for ${userIds.length} members.`);
  };

  // Row expansion editor panel details
  const renderRowEditor = (row: StagingExpense, index: number) => {
    const activeErrors = row.anomalies.filter((a) => a.severity === 'critical');
    const activeWarnings = row.anomalies.filter((a) => a.severity === 'warning');
    const activeInfos = row.anomalies.filter((a) => a.severity === 'info');

    // Extract unknown names for resolution workflow
    const unknownAnomalies = row.anomalies.filter((a) => a.category === 'unknown_participant');
    const unknownNames = Array.from(
      new Set(
        unknownAnomalies.map((a) => a.meta?.unknownName).filter(Boolean) as string[]
      )
    );

    // Extract duplicate information for resolution options
    const batchDuplicateAnomaly = row.anomalies.find(
      (a) => a.category === 'duplicate_expense' && a.meta?.duplicateType === 'batch'
    );

    // Extract ambiguous date information
    const ambiguousDateAnomaly = row.anomalies.find(
      (a) => a.category === 'ambiguous_date_format'
    );

    let dateOptions: { date: Date; label: string; format: string }[] = [];
    if (ambiguousDateAnomaly) {
      const dateParts = row.dateStr.split(/[-/.]/);
      if (dateParts.length === 3) {
        const p1 = parseInt(dateParts[0], 10);
        const p2 = parseInt(dateParts[1], 10);
        const p3 = parseInt(dateParts[2], 10);
        let year = p3 >= 1000 ? p3 : (p3 < 100 ? 2000 + p3 : p3);

        if (p1 <= 12 && p2 <= 12 && p1 !== p2) {
          const d1 = new Date(year, p2 - 1, p1);
          const d2 = new Date(year, p1 - 1, p2);
          dateOptions = [
            {
              date: d1,
              label: d1.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
              format: 'DD/MM'
            },
            {
              date: d2,
              label: d2.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
              format: 'MM/DD'
            }
          ];
        }
      }
    }

    return (
      <div className="bg-obsidian-card-elevated border-t border-white/5 p-5 text-slate-200 animate-in slide-in-from-top-4 duration-150 rounded-b-xl space-y-5">
        <div className="flex justify-between items-center pb-3 border-b border-white/5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Resolve Transaction Anomalies</h4>
          <div className="flex gap-2">
            <button
              onClick={() => handleUpdateRow(index, { isDeleted: !row.isDeleted })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition hover:cursor-pointer ${
                row.isDeleted
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {row.isDeleted ? 'Recover Row' : 'Discard Row'}
            </button>
          </div>
        </div>

        {/* Separated Anomaly Alerts to Reduce Alert Fatigue */}
        <div className="space-y-3">
          {activeErrors.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider block">Critical Blockers ({activeErrors.length})</span>
              <div className="space-y-2">
                {activeErrors.map((a, idx) => {
                  let quickFixUI = null;

                  if (a.category === 'missing_payer') {
                    quickFixUI = (
                      <div className="flex items-center gap-2 mt-1 pl-6">
                        <span className="text-[9px] text-slate-400 font-bold uppercase shrink-0">Assign Payer:</span>
                        <select
                          onChange={(e) => {
                            if (!e.target.value) return;
                            handleUpdateRow(row.rowIndex, { paidByUserId: e.target.value });
                            toast.success('Payer assigned successfully.');
                          }}
                          className="bg-slate-900 border border-white/10 rounded-lg px-2 py-0.5 text-[11px] text-slate-300 focus:outline-none focus:border-red-500/50"
                          defaultValue=""
                        >
                          <option value="">-- Choose Member --</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                          {systemUsers.filter(su => !members.some(m => m.id === su.id)).map((su) => (
                            <option key={su.id} value={su.id}>{su.name} (System User)</option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  if (a.category === 'percentage_total_!=_100') {
                    quickFixUI = (
                      <div className="mt-1 pl-6">
                        <button
                          onClick={() => {
                            handleNormalizePercentages(row.rowIndex);
                          }}
                          className="px-2.5 py-0.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-450 text-[10px] font-bold rounded-md transition hover:cursor-pointer"
                        >
                          🪄 Normalize Percentages to 100%
                        </button>
                      </div>
                    );
                  }

                  if (a.category === 'missing_exchange_rate') {
                    quickFixUI = (
                      <div className="flex flex-wrap items-center gap-3 mt-1 pl-6">
                        <button
                          onClick={() => {
                            handleUpdateRow(row.rowIndex, { exchangeRate: 1.0 });
                            toast.success('Exchange rate set to 1.0.');
                          }}
                          className="px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-350 text-[10px] font-bold rounded-md transition hover:cursor-pointer"
                        >
                          Set to 1.0 (Same Currency)
                        </button>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Or Enter Rate:</span>
                          <input
                            type="number"
                            step="any"
                            placeholder="e.g. 83.0"
                            className="w-16 bg-slate-900 border border-white/10 rounded-md px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none"
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (val > 0) {
                                handleUpdateRow(row.rowIndex, { exchangeRate: val });
                              }
                            }}
                          />
                        </div>
                      </div>
                    );
                  }

                  if (a.category === 'invalid_split_type') {
                    quickFixUI = (
                      <div className="flex flex-wrap items-center gap-2 mt-1 pl-6">
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Change split type to:</span>
                        {['equal', 'unequal', 'percentage', 'share'].map((mtype) => (
                          <button
                            key={mtype}
                            onClick={() => {
                              handleUpdateRow(row.rowIndex, { splitTypeCSV: mtype });
                              toast.success(`Split method set to ${mtype}.`);
                            }}
                            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 text-[9px] font-bold rounded-md transition hover:cursor-pointer"
                          >
                            {mtype}
                          </button>
                        ))}
                      </div>
                    );
                  }

                  if (a.category === 'expense_before_member_joined' && a.meta?.userId && a.meta?.earliestDate) {
                    const targetUserId = a.meta.userId;
                    const earliestDate = a.meta.earliestDate;
                    const userName = a.meta.unknownName || 'Member';
                    quickFixUI = (
                      <div className="mt-1 pl-6">
                        <button
                          onClick={() => {
                            setLocalRoster((prev) =>
                              prev.map((m) => {
                                if (m.userId === targetUserId) {
                                  return { ...m, joinedAt: earliestDate };
                                }
                                return m;
                              })
                            );
                            toast.success(`Backdated ${userName}'s join date to ${earliestDate.split('T')[0]}.`);
                          }}
                          className="px-2.5 py-0.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-450 text-[10px] font-bold rounded-md transition hover:cursor-pointer"
                        >
                          🪄 Backdate {userName}'s Roster Join Date to {earliestDate.split('T')[0]}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={idx} className="flex flex-col bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-semibold">{a.description}</span>
                      </div>
                      {quickFixUI}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeWarnings.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Warnings ({activeWarnings.length})</span>
              <div className="flex flex-wrap gap-2">
                {activeWarnings.map((a, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
                    <Info className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                    <span>{a.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeInfos.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">Informational Notices ({activeInfos.length})</span>
              <div className="flex flex-wrap gap-2">
                {activeInfos.map((a, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>{a.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 1. Interactive Duplicate Resolution Options */}
        {batchDuplicateAnomaly && batchDuplicateAnomaly.meta?.duplicateRowIndex !== undefined && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
            <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Potential Duplicate Pair
            </h5>
            <p className="text-xs text-slate-300">
              This row (Row #{row.rowIndex + 1}) matches Row #{batchDuplicateAnomaly.meta.duplicateRowIndex + 1} (same title, date, amount, payer).
            </p>
            <div className="space-y-2">
              <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Duplicate Action Resolution</span>
              <div className="flex flex-col sm:flex-row gap-4 text-xs">
                <label className="flex items-center gap-2 hover:cursor-pointer font-semibold">
                  <input
                    type="radio"
                    name={`dup-resolve-${row.rowIndex}`}
                    className="accent-primary"
                    checked={!row.isDeleted && !stagingRows[batchDuplicateAnomaly.meta.duplicateRowIndex].isDeleted}
                    onChange={() => {
                      handleUpdateRow(row.rowIndex, { isDeleted: false });
                      handleUpdateRow(batchDuplicateAnomaly.meta!.duplicateRowIndex!, { isDeleted: false });
                    }}
                  />
                  <span>Keep Both Rows</span>
                </label>
                <label className="flex items-center gap-2 hover:cursor-pointer font-semibold">
                  <input
                    type="radio"
                    name={`dup-resolve-${row.rowIndex}`}
                    className="accent-primary"
                    checked={!row.isDeleted && stagingRows[batchDuplicateAnomaly.meta.duplicateRowIndex].isDeleted}
                    onChange={() => {
                      handleUpdateRow(row.rowIndex, { isDeleted: false });
                      handleUpdateRow(batchDuplicateAnomaly.meta!.duplicateRowIndex!, { isDeleted: true });
                    }}
                  />
                  <span>Keep Current (Row #{row.rowIndex + 1}), Discard Previous (Row #{batchDuplicateAnomaly.meta.duplicateRowIndex + 1})</span>
                </label>
                <label className="flex items-center gap-2 hover:cursor-pointer font-semibold">
                  <input
                    type="radio"
                    name={`dup-resolve-${row.rowIndex}`}
                    className="accent-primary"
                    checked={row.isDeleted && !stagingRows[batchDuplicateAnomaly.meta.duplicateRowIndex].isDeleted}
                    onChange={() => {
                      handleUpdateRow(row.rowIndex, { isDeleted: true });
                      handleUpdateRow(batchDuplicateAnomaly.meta!.duplicateRowIndex!, { isDeleted: false });
                    }}
                  />
                  <span>Keep Previous (Row #{batchDuplicateAnomaly.meta.duplicateRowIndex + 1}), Discard Current (Row #{row.rowIndex + 1})</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 2. Unknown User Resolution Workflow */}
        {unknownNames.length > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-4">
            <h5 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" /> Unregistered Names Resolution
            </h5>
            <div className="space-y-4 divide-y divide-white/5">
              {unknownNames.map((name) => {
                const isResolved = pendingUsersToCreate[name] !== undefined;
                const config = pendingUsersToCreate[name];
                const joinDateCalculated = getJoinDateForPendingUser(name, 'first_expense').split('T')[0];

                return (
                  <div key={name} className="pt-3 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-slate-200 block">
                        Name: <code className="text-primary px-1.5 py-0.5 bg-white/5 rounded border border-white/5 font-mono">{name}</code>
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {isResolved
                          ? `Will be created on import commit (Timeline Start: ${
                              config.joinDateType === 'first_expense' ? `First Expense Date (${joinDateCalculated})` :
                              config.joinDateType === 'group_start' ? 'Beginning of Group (Jan 1, 2026)' :
                              `Custom Date (${config.customDate ? config.customDate.split('T')[0] : ''})`
                            })`
                          : 'This user is unregistered. Resolve this name to continue.'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {!isResolved ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">Start Roster:</span>
                            <select
                              id={`join-date-type-${name}`}
                              className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-primary/50"
                              defaultValue="first_expense"
                            >
                              <option value="first_expense">First Expense Date</option>
                              <option value="group_start">Beginning of Group</option>
                              <option value="custom">Custom Date picker...</option>
                            </select>
                          </div>
                          
                          <button
                            onClick={() => {
                              const selType = (document.getElementById(`join-date-type-${name}`) as HTMLSelectElement).value as any;
                              let customDate = undefined;
                              if (selType === 'custom') {
                                const inputDate = prompt('Enter custom membership start date (YYYY-MM-DD):', '2026-01-01');
                                if (!inputDate || isNaN(Date.parse(inputDate))) {
                                  toast.error('Invalid date format.');
                                  return;
                                }
                                customDate = new Date(inputDate).toISOString();
                              }
                              setPendingUsersToCreate((prev) => ({
                                ...prev,
                                [name]: { joinDateType: selType, customDate }
                              }));
                              toast.info(`Resolution marked: "${name}" will join group roster on commit.`);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-primary hover:brightness-110 text-obsidian text-xs font-bold transition duration-200"
                          >
                            Resolve: Create User
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setPendingUsersToCreate((prev) => {
                              const copy = { ...prev };
                              delete copy[name];
                              return copy;
                            });
                            toast.warning(`Undid registration resolution for "${name}".`);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10 transition duration-200"
                        >
                          Undo Creation Resolution
                        </button>
                      )}

                      <div className="flex items-center gap-2 border-l border-white/10 pl-3">
                        <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">Map to:</span>
                        <select
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const targetId = e.target.value;
                            const targetName = members.find((m) => m.id === targetId)?.name || '';
                            handleMapNameGlobally(name, targetName, targetId);
                          }}
                          className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-primary/50"
                          defaultValue=""
                        >
                          <option value="">-- Existing Member --</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Ambiguous Date Resolution Workflow */}
        {ambiguousDateAnomaly && dateOptions.length === 2 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
            <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-4 h-4 text-amber-400" /> Ambiguous Date Format Resolution
            </h5>
            <p className="text-[11px] text-slate-350">
              The date <code className="text-primary px-1.5 py-0.5 bg-white/5 rounded border border-white/5 font-mono">{row.dateStr}</code> could represent different months and days. Choose the correct interpretation:
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {dateOptions.map((opt, oIdx) => (
                <button
                  key={oIdx}
                  onClick={() => {
                    const formatted = opt.date.toISOString().split('T')[0];
                    handleUpdateRow(index, {
                      parsedDate: opt.date.toISOString(),
                      dateStr: formatted,
                    });
                    toast.success(`Date resolved to ${opt.label} (${opt.format}).`);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/35 text-amber-400 text-xs font-bold transition duration-200 hover:cursor-pointer flex items-center gap-1.5"
                >
                  <span>📅</span>
                  <span>{opt.label} <span className="opacity-60 text-[10px]">({opt.format})</span></span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Main info */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Title / Description</label>
              <input
                type="text"
                value={row.description}
                onChange={(e) => handleUpdateRow(index, { description: e.target.value })}
                className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Date</label>
                <input
                  type="date"
                  value={row.parsedDate ? row.parsedDate.split('T')[0] : ''}
                  onChange={(e) => {
                    const d = new Date(e.target.value);
                    handleUpdateRow(index, {
                      parsedDate: isNaN(d.getTime()) ? null : d.toISOString(),
                      dateStr: e.target.value
                    });
                  }}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Transaction Type</label>
                <select
                  value={row.isSettlement ? 'settlement' : 'expense'}
                  onChange={(e) => handleUpdateRow(index, { isSettlement: e.target.value === 'settlement' })}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
                >
                  <option value="expense">Shared Expense</option>
                  <option value="settlement">Peer Settlement</option>
                </select>
              </div>
            </div>
          </div>

          {/* Core financial mappings */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Amount</label>
                <input
                  type="number"
                  step="any"
                  value={row.parsedAmount}
                  onChange={(e) => handleUpdateRow(index, { parsedAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Currency</label>
                <input
                  type="text"
                  placeholder="INR"
                  value={row.currencyCSV}
                  onChange={(e) => handleUpdateRow(index, { currencyCSV: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
                />
              </div>
            </div>

            {row.currencyCSV && row.currencyCSV !== baseCurrency && (
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                  Exchange Rate (1 {row.currencyCSV} = X {baseCurrency})
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="any"
                    value={row.exchangeRate}
                    onChange={(e) => {
                      const rate = parseFloat(e.target.value) || 1.0;
                      handleUpdateRow(index, {
                        exchangeRate: rate,
                        notesCSV: `Exchange rate: ${rate} (Imported)`
                      });
                    }}
                    className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
                  />
                  <div className="flex items-center text-[10px] text-slate-400 shrink-0 font-bold">
                    = ₹{(row.parsedAmount * row.exchangeRate).toFixed(2)} Base
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Paid By (Payer)</label>
              <select
                value={row.paidByUserId || ''}
                onChange={(e) => handleUpdateRow(index, { paidByUserId: e.target.value || null })}
                className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
              >
                <option value="">-- Select Group Member --</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
                {systemUsers.filter(su => !members.some(m => m.id === su.id)).map((su) => (
                  <option key={su.id} value={su.id}>
                    {su.name} ({su.email}) [Not in group]
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Split setup */}
          <div className="space-y-3">
            {!row.isSettlement ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Split Method</label>
                    <select
                      value={row.splitTypeCSV}
                      onChange={(e) => handleUpdateRow(index, { splitTypeCSV: e.target.value })}
                      className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
                    >
                      <option value="equal">Split Equally</option>
                      <option value="unequal">Split Unequally</option>
                      <option value="percentage">Split By %</option>
                      <option value="share">Split By Portions</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Participants</label>
                    <input
                      type="text"
                      placeholder="Aisha;Rohan;Priya"
                      value={row.splitWithCSV}
                      onChange={(e) => handleUpdateRow(index, { splitWithCSV: e.target.value })}
                      className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Split Details Ratios</label>
                    {row.splitTypeCSV === 'percentage' && row.anomalies.some(a => a.category === 'percentage_total_!=_100') && (
                      <button
                        onClick={() => handleNormalizePercentages(index)}
                        className="text-[10px] text-primary hover:text-primary-light font-extrabold flex items-center gap-0.5 border border-primary/20 bg-primary/5 px-2 py-0.5 rounded-lg"
                      >
                        <RefreshCw className="w-2.5 h-2.5 animate-spin-slow" /> Normalize to 100%
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Aisha 50; Rohan 50"
                    value={row.splitDetailsCSV}
                    onChange={(e) => handleUpdateRow(index, { splitDetailsCSV: e.target.value })}
                    className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
                  />
                  <span className="text-[10px] text-slate-500 italic mt-0.5 block leading-tight">
                    Format splits: "Name 100; Name 200" or "Name 40%" or "Name 2"
                  </span>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Recipient (Settle to)</label>
                <select
                  value={row.splitWithCSV ? fuzzyMapMember(row.splitWithCSV.split(';')[0], localRoster) || '' : ''}
                  onChange={(e) => {
                    const selectedName = members.find(m => m.id === e.target.value)?.name ||
                                         systemUsers.find(su => su.id === e.target.value)?.name ||
                                         '';
                    handleUpdateRow(index, {
                      splitWithCSV: selectedName,
                      splitDetailsCSV: ''
                    });
                  }}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-slate-200"
                >
                  <option value="">-- Select Recipient --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                  {systemUsers.filter(su => !members.some(m => m.id === su.id)).map((su) => (
                    <option key={su.id} value={su.id}>
                      {su.name} ({su.email}) [Not in group]
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleCommitImport = () => {
    const activeRows = stagingRows.filter((r) => !r.isDeleted);
    const criticalRows = activeRows.filter((r) => r.anomalies.some((a) => a.severity === 'critical'));

    if (criticalRows.length > 0) {
      toast.error(`Cannot import. Please resolve the ${criticalRows.length} critical blockers first.`);
      return;
    }

    if (activeRows.length === 0) {
      toast.error('No staging rows to import.');
      return;
    }

    // Launch Dry Run summary overlay instead of saving directly
    setShowDryRun(true);
  };

  const handleCommitImportInternal = async () => {
    const activeRows = stagingRows.filter((r) => !r.isDeleted);
    
    setSubmitting(true);
    setLoading(true);
    setShowDryRun(false);

    try {
      // 0. Update any existing member joined_at dates in the database if they were modified/backdated
      for (const member of localRoster) {
        const initial = initialRosterMembers.find((m) => m.userId === member.userId);
        if (initial && member.joinedAt && initial.joinedAt && new Date(member.joinedAt).getTime() < new Date(initial.joinedAt).getTime()) {
          const { error: updateErr } = await supabase
            .from('GroupMember')
            .update({ joined_at: member.joinedAt })
            .eq('group_id', groupId)
            .eq('user_id', member.userId);
          
          if (updateErr) {
            console.warn(`Failed to update joined_at for ${member.user.name}:`, updateErr);
          }
        }
      }

      // 1. Database-Safe: Create pending users and roster links explicitly on commit
      const nameToRealIdMap: { [name: string]: string } = {};
      const pendingNames = Object.keys(pendingUsersToCreate);

      for (const name of pendingNames) {
        const config = pendingUsersToCreate[name];
        const joinDate = getJoinDateForPendingUser(name, config.joinDateType, config.customDate);
        const placeholderEmail = `${name.toLowerCase().replace(/\s+/g, '')}.import@splitsync.local`;

        // Check user existence in system User table
        const { data: existingUser } = await supabase
          .from('User')
          .select('id, name, email')
          .eq('email', placeholderEmail)
          .maybeSingle();

        let realUserId = '';
        if (existingUser) {
          realUserId = existingUser.id;
        } else {
          const randomId = crypto.randomUUID();
          const { data: newUser, error: uErr } = await supabase
            .from('User')
            .insert({
              id: randomId,
              name,
              email: placeholderEmail,
            })
            .select()
            .single();

          if (uErr) throw uErr;
          realUserId = newUser.id;
          
          // Append to local state list
          setSystemUsers((prev) => [...prev, newUser]);
        }

        nameToRealIdMap[name.toLowerCase()] = realUserId;

        // Link membership to Group roster with the dynamic joined_at start date
        const { error: joinErr } = await supabase
          .from('GroupMember')
          .insert({
            group_id: groupId,
            user_id: realUserId,
            role: 'member',
            joined_at: joinDate,
          });

        if (joinErr && !joinErr.message.includes('duplicate key')) {
          throw joinErr;
        }

        // Track in UnregisteredMember table for invite workflow
        try {
          const { data: existingUnreg } = await supabase
            .from('UnregisteredMember')
            .select('id')
            .eq('group_id', groupId)
            .eq('placeholder_user_id', realUserId)
            .maybeSingle();

          if (!existingUnreg) {
            await supabase.from('UnregisteredMember').insert({
              group_id: groupId,
              display_name: name,
              placeholder_user_id: realUserId,
              invited_by: user?.id,
              status: 'pending',
            });
          }
        } catch (unregErr) {
          // Table may not exist yet — silently continue
          console.warn('UnregisteredMember insert skipped (table may not exist):', unregErr);
        }
      }

      // 2. Find any system users not currently in the group roster that need to be added
      const systemUsersToJoin = new Set<string>();
      activeRows.forEach((row) => {
        let paidBy = row.paidByUserId;
        if (paidBy && paidBy.startsWith('pending-')) {
          const name = paidBy.replace('pending-', '');
          paidBy = nameToRealIdMap[name.toLowerCase()] || null;
        }
        if (paidBy && !localRoster.some((m) => m.userId === paidBy) && !nameToRealIdMap[row.paidByCSV.toLowerCase()]) {
          systemUsersToJoin.add(paidBy);
        }

        if (row.splitWithCSV) {
          const splitWithNames = row.splitWithCSV.split(';').map(p => p.trim()).filter(Boolean);
          splitWithNames.forEach((p) => {
            const uid = fuzzyMapMember(p, localRoster) || fuzzyMapSystemUser(p, systemUsers)?.id;
            if (uid && !uid.startsWith('pending-') && !localRoster.some((m) => m.userId === uid)) {
              systemUsersToJoin.add(uid);
            }
          });
        }
      });

      const userIdsArray = Array.from(systemUsersToJoin);
      if (userIdsArray.length > 0) {
        const newMembersPayload = userIdsArray.map((uid) => ({
          group_id: groupId,
          user_id: uid,
          role: 'member',
          joined_at: '2026-01-01T00:00:00.000Z', // Early default join date
        }));

        const { error: joinErr } = await supabase
          .from('GroupMember')
          .insert(newMembersPayload);
        if (joinErr && !joinErr.message.includes('duplicate key')) throw joinErr;
      }

      // Refetch and update local roster so we have accurate bounds
      const selectFields = isLegacy
        ? 'id, user_id, joined_at, User:user_id (id, name, email)'
        : 'id, user_id, joined_at, left_at, User:user_id (id, name, email)';

      const { data: updatedMembersData, error: loadErr } = await supabase
        .from('GroupMember')
        .select(selectFields)
        .eq('group_id', groupId);

      if (loadErr) throw loadErr;

      const freshlyLoaded = (updatedMembersData || []).map((m: any) => ({
        userId: m.user_id,
        joinedAt: m.joined_at,
        leftAt: isLegacy ? null : m.left_at,
        user: {
          name: m.User?.name || 'Unknown',
          email: m.User?.email || '',
        }
      }));

      setLocalRoster(freshlyLoaded);

      // Create Import Job
      let jobId = null;
      try {
        const { data: job, error: jobErr } = await supabase
          .from('ImportJob')
          .insert({
            group_id: groupId,
            imported_by: user?.id,
            filename: fileName,
            status: 'pending',
          })
          .select()
          .single();

        if (!jobErr && job) {
          jobId = job.id;
        }
      } catch (e) {
        console.warn('ImportJob table might not exist. Continuing without staging job history:', e);
      }

      let importedCount = 0;
      let totalAmountBase = 0;
      let anomalyCount = 0;

      // Import records sequentially
      for (const row of stagingRows) {
        if (row.isDeleted) continue;

        const dateObj = row.parsedDate ? new Date(row.parsedDate) : new Date();
        const rawAmt = row.parsedAmount;
        const rate = row.exchangeRate || 1.0;
        
        const baseAmt = rawAmt * rate;
        totalAmountBase += baseAmt;

        // Map pending IDs to real IDs
        let paidByUserId = row.paidByUserId;
        if (paidByUserId && paidByUserId.startsWith('pending-')) {
          const name = paidByUserId.replace('pending-', '');
          paidByUserId = nameToRealIdMap[name.toLowerCase()] || null;
        }

        // Process logs for anomalies (resolved or ignored)
        if (jobId) {
          for (const anom of row.anomalies) {
            anomalyCount++;
            try {
              await supabase.from('AnomalyLog').insert({
                import_job_id: jobId,
                row_index: row.rowIndex,
                anomaly_type: anom.category,
                description: anom.description,
                status: anom.severity === 'critical' ? 'resolved' : 'ignored',
                resolution_details: {
                  fixed_payer: paidByUserId,
                  fixed_amount: row.parsedAmount,
                  fixed_currency: row.currencyCSV,
                  exchange_rate: rate,
                },
              });
            } catch (err) {
              console.warn('AnomalyLog insertion failed:', err);
            }
          }
        }

        if (row.isSettlement) {
          // peer settlement
          const recipientName = row.splitWithCSV.split(';')[0]?.trim();
          let recipientId = fuzzyMapMember(recipientName, freshlyLoaded) || freshlyLoaded[0]?.userId;
          if (recipientId && recipientId.startsWith('pending-')) {
            const name = recipientId.replace('pending-', '');
            recipientId = nameToRealIdMap[name.toLowerCase()] || freshlyLoaded[0]?.userId;
          }

          const settlementPayload: any = {
            group_id: groupId,
            payer_id: paidByUserId,
            receiver_id: recipientId,
            amount: rawAmt,
            created_at: dateObj.toISOString(),
          };

          if (!isLegacy) {
            settlementPayload.currency_code = row.currencyCSV || baseCurrency;
            settlementPayload.exchange_rate = rate;
          }

          const { error: sErr } = await supabase.from('Settlement').insert(settlementPayload);

          if (sErr) throw sErr;
          importedCount++;
        } else {
          // shared group expense
          // Split details calculation with membership timeline checks
          const participantIds: string[] = [];
          const splitWithNames = row.splitWithCSV.split(';').map(p => p.trim()).filter(Boolean);
          
          splitWithNames.forEach((p) => {
            let uid = fuzzyMapMember(p, freshlyLoaded);
            if (uid && uid.startsWith('pending-')) {
              const name = uid.replace('pending-', '');
              uid = nameToRealIdMap[name.toLowerCase()] || null;
            }
            if (uid && !participantIds.includes(uid)) {
              // Timeline eligibility check:
              const memberConfig = freshlyLoaded.find((m) => m.userId === uid);
              const joinedAtStr = memberConfig?.joinedAt || '2026-01-01T00:00:00.000Z';
              const leftAtStr = memberConfig?.leftAt || null;

              const expenseTime = dateObj.getTime();
              const joinedTime = new Date(joinedAtStr).getTime();
              const leftTime = leftAtStr ? new Date(leftAtStr).getTime() : null;

              if (expenseTime >= joinedTime && (leftTime === null || expenseTime <= leftTime)) {
                participantIds.push(uid);
              }
            }
          });

          if (participantIds.length === 0) {
            // fallback to all active members on this date
            freshlyLoaded.forEach((m) => {
              const expenseTime = dateObj.getTime();
              const joinedTime = m.joinedAt ? new Date(m.joinedAt).getTime() : 0;
              const leftTime = m.leftAt ? new Date(m.leftAt).getTime() : null;
              if (expenseTime >= joinedTime && (leftTime === null || expenseTime <= leftTime)) {
                participantIds.push(m.userId);
              }
            });
          }

          // Calculate split portion amounts
          const splitsPayload: any[] = [];
          
          if (row.splitTypeCSV === 'equal' || !row.splitTypeCSV) {
            const splitAmt = parseFloat((rawAmt / participantIds.length).toFixed(2));
            participantIds.forEach((uid, index) => {
              // Ajust roundings to payer or first member
              const finalAmt = index === 0 ? parseFloat((rawAmt - (splitAmt * (participantIds.length - 1))).toFixed(2)) : splitAmt;
              splitsPayload.push({
                user_id: uid,
                amount: finalAmt,
                percentage: parseFloat((100 / participantIds.length).toFixed(2)),
                share_count: 1,
                split_type: 'equal',
              });
            });
          } else if (row.splitTypeCSV === 'unequal') {
            const detailsMap: { [name: string]: number } = {};
            row.splitDetailsCSV.split(';').forEach((part) => {
              const match = part.match(/^(.+?)\s+([0-9.]+)$/);
              if (match) {
                detailsMap[match[1].trim().toLowerCase()] = parseFloat(match[2]) || 0;
              }
            });

            participantIds.forEach((uid) => {
              const mem = freshlyLoaded.find((m) => m.userId === uid);
              const mName = mem ? mem.user.name.toLowerCase() : '';
              const amt = detailsMap[mName] || 0;
              splitsPayload.push({
                user_id: uid,
                amount: amt,
                percentage: null,
                share_count: null,
                split_type: 'unequal',
              });
            });
          } else if (row.splitTypeCSV === 'percentage') {
            const detailsMap: { [name: string]: number } = {};
            row.splitDetailsCSV.split(';').forEach((part) => {
              const match = part.match(/^(.+?)\s+([0-9.]+)\s*%?$/);
              if (match) {
                detailsMap[match[1].trim().toLowerCase()] = parseFloat(match[2]) || 0;
              }
            });

            participantIds.forEach((uid) => {
              const mem = freshlyLoaded.find((m) => m.userId === uid);
              const mName = mem ? mem.user.name.toLowerCase() : '';
              const pct = detailsMap[mName] || 0;
              const amt = parseFloat(((rawAmt * pct) / 100).toFixed(2));
              splitsPayload.push({
                user_id: uid,
                amount: amt,
                percentage: pct,
                share_count: null,
                split_type: 'percentage',
              });
            });
          } else if (row.splitTypeCSV === 'share') {
            const detailsMap: { [name: string]: number } = {};
            let totalShares = 0;
            row.splitDetailsCSV.split(';').forEach((part) => {
              const match = part.match(/^(.+?)\s+([0-9.]+)$/);
              if (match) {
                const sharesCount = parseFloat(match[2]) || 0;
                detailsMap[match[1].trim().toLowerCase()] = sharesCount;
                totalShares += sharesCount;
              }
            });

            if (totalShares === 0) totalShares = participantIds.length;

            participantIds.forEach((uid) => {
              const mem = freshlyLoaded.find((m) => m.userId === uid);
              const mName = mem ? mem.user.name.toLowerCase() : '';
              const sh = detailsMap[mName] !== undefined ? detailsMap[mName] : 1;
              const amt = parseFloat(((rawAmt * sh) / totalShares).toFixed(2));
              splitsPayload.push({
                user_id: uid,
                amount: amt,
                percentage: parseFloat(((sh / totalShares) * 100).toFixed(2)),
                share_count: sh,
                split_type: 'share',
              });
            });
          }

          let rpcSuccess = false;
          if (!isLegacy) {
            try {
              const { error: rpcErr } = await supabase
                .rpc('create_expense_with_splits', {
                  p_group_id: groupId,
                  p_title: row.description,
                  p_description: row.notesCSV || null,
                  p_amount: rawAmt,
                  p_paid_by: paidByUserId,
                  p_currency_code: row.currencyCSV || baseCurrency,
                  p_exchange_rate: rate,
                  p_splits: splitsPayload,
                });

              if (!rpcErr) {
                rpcSuccess = true;
              }
            } catch (err: any) {
              // Ignore and fall back to standard inserts
            }
          }

          if (!rpcSuccess) {
            const expenseInsertPayload: any = {
              group_id: groupId,
              paid_by: paidByUserId,
              amount: rawAmt,
              title: row.description,
              description: row.notesCSV || null,
              created_at: dateObj.toISOString(),
            };

            if (!isLegacy) {
              expenseInsertPayload.currency_code = row.currencyCSV || baseCurrency;
              expenseInsertPayload.exchange_rate = rate;
            }

            const { data: exp, error: exErr } = await supabase
              .from('Expense')
              .insert(expenseInsertPayload)
              .select()
              .single();

            if (exErr) throw exErr;

            const { error: spErr } = await supabase
              .from('ExpenseSplit')
              .insert(
                splitsPayload.map((s) => ({
                  expense_id: exp.id,
                  user_id: s.user_id,
                  amount: s.amount,
                  percentage: s.percentage,
                  share_count: s.share_count,
                  split_type: s.split_type,
                }))
              );
            if (spErr) throw spErr;
          }
          importedCount++;
        }
      }

      // Complete job
      if (jobId) {
        try {
          await supabase.from('ImportJob').update({ status: 'completed' }).eq('id', jobId);

          // Create Import Report
          await supabase.from('ImportReport').insert({
            group_id: groupId,
            import_job_id: jobId,
            total_rows: stagingRows.length,
            imported_count: importedCount,
            anomaly_count: anomalyCount,
            total_amount_base: totalAmountBase,
          });
        } catch (e) {
          console.warn('Updating ImportJob or inserting ImportReport failed:', e);
        }
      }

      setSummaryMetrics({
        totalRows: stagingRows.length,
        importedCount,
        anomalyCount,
        totalAmountBase,
      });
      setStep('summary');
      toast.success('Import completed successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Error occurred during database commit.');
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  };

  const getFilteredRows = () => {
    if (activeFilter === 'errors') {
      return stagingRows.filter((r) => r.anomalies.length > 0 && !r.isDeleted);
    }
    if (activeFilter === 'clean') {
      return stagingRows.filter((r) => r.anomalies.length === 0 && !r.isDeleted);
    }
    return stagingRows; // all rows (including deleted)
  };

  const filteredStaging = getFilteredRows();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-6xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden card-glow-theme flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-white/5 shrink-0 bg-obsidian-card-elevated">
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
              <span className="p-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg">
                <Upload className="w-4 h-4" />
              </span>
              CSV Staging & Import Workflow
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold tracking-wide">
              {step === 'upload' && 'Select export file to analyze'}
              {step === 'mapping' && `Configure schema fields for ${fileName}`}
              {step === 'staging' && `Resolve spreadsheet anomalies before ledger commit`}
              {step === 'summary' && 'Import job report metrics'}
            </p>
          </div>
          <button
            onClick={() => onClose(step === 'summary')}
            className="p-1.5 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer rounded-lg bg-white/5"
            disabled={submitting}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-transparent">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                <div className="absolute inset-1 rounded-full border-2 border-primary/40 animate-ping [animation-delay:150ms]" />
                <div className="absolute inset-2 rounded-full bg-primary/20 border border-primary/30 animate-pulse" />
              </div>
              <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase animate-pulse">
                Processing Import Job...
              </span>
            </div>
          )}

          {!loading && step === 'upload' && (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/10 hover:border-primary/30 bg-white/3 hover:bg-white/5 rounded-2xl py-16 px-6 text-center transition duration-200 hover:cursor-pointer flex flex-col items-center justify-center gap-4 group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv"
                className="hidden"
              />
              <div className="p-4 bg-primary/5 text-primary border border-primary/10 rounded-2xl group-hover:scale-105 transition duration-200">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200">Drag & drop your Expenses Export.csv file here</p>
                <p className="text-xs text-slate-400 mt-1">or click to browse local files (.csv only)</p>
              </div>
              <div className="bg-slate-950/40 border border-white/5 rounded-xl px-4 py-2 text-[10px] text-slate-500 font-semibold max-w-md">
                We'll parse amounts, currencies, split portion ratios, date boundaries, and run our 24 validation checks.
              </div>
            </div>
          )}

          {!loading && step === 'mapping' && (
            <div className="space-y-6">
              <div className="glass-card bg-obsidian-card-elevated border border-white/5 rounded-xl p-4 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">{fileName}</span>
                <button
                  onClick={() => setStep('upload')}
                  className="text-xs text-slate-400 hover:text-slate-200 font-bold"
                >
                  Select another file
                </button>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-primary" /> Map CSV Columns to SplitSync Schema
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.keys(mapping).map((field) => (
                    <div key={field} className="bg-slate-950/40 border border-white/5 rounded-xl p-3 flex flex-col gap-1.5">
                      <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">
                        {field.replace('_', ' ')}
                      </label>
                      <select
                        value={mapping[field]}
                        onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                        className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-primary/50"
                      >
                        <option value="">-- Ignore Field --</option>
                        {rawHeaders.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold text-slate-400 hover:text-slate-200 bg-white/5 transition hover:cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyMapping}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold bg-primary text-obsidian hover:brightness-110 transition hover:cursor-pointer flex items-center gap-1.5"
                >
                  Analyze & Review <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {!loading && step === 'staging' && (
            <div className="space-y-6 flex flex-col h-full">
              {/* Workspace Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-obsidian-card-elevated border border-white/5 p-4 rounded-2xl shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition hover:cursor-pointer ${
                      activeFilter === 'all' ? 'bg-primary text-obsidian' : 'bg-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Rows ({stagingRows.length})
                  </button>
                  <button
                    onClick={() => setActiveFilter('errors')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition hover:cursor-pointer ${
                      activeFilter === 'errors'
                        ? 'bg-amber-500 text-obsidian'
                        : 'bg-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Warnings ({stagingRows.filter((r) => r.anomalies.length > 0 && !r.isDeleted).length})
                  </button>
                  <button
                    onClick={() => setActiveFilter('clean')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition hover:cursor-pointer ${
                      activeFilter === 'clean'
                        ? 'bg-emerald-500 text-obsidian'
                        : 'bg-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Clean ({stagingRows.filter((r) => r.anomalies.length === 0 && !r.isDeleted).length})
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleFuzzyMapAll}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/5 text-slate-200 hover:bg-white/10 transition hover:cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Auto Map Names
                  </button>
                  <button
                    onClick={handleResolveAllUnknownUsers}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition hover:cursor-pointer flex items-center gap-1.5"
                    title="Resolve all unregistered names by scheduling user creation on import commit"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Create All Users
                  </button>
                  <button
                    onClick={handleResolveAllJoinDates}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition hover:cursor-pointer flex items-center gap-1.5"
                    title="Automatically backdate group roster join dates for members who have historical expenses"
                  >
                    <Calendar className="w-3.5 h-3.5" /> Resolve Join Dates
                  </button>
                  <button
                    onClick={handleNormalizeAllPercentages}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/5 text-slate-200 hover:bg-white/10 transition hover:cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> Normalize Ratios
                  </button>
                  <button
                    onClick={handleRemoveAllCriticalErrors}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition hover:cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Discard Errors
                  </button>
                </div>
              </div>

              {/* Grid Layout: Left 3 columns table, Right 1 column audit breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                {/* Rows List (Col span 3) */}
                <div className="lg:col-span-3 border border-white/5 rounded-2xl overflow-hidden bg-slate-950/20 max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-obsidian-card-elevated border-b border-white/5 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                        <th className="px-4 py-3">Row</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Payer</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Split Info</th>
                        <th className="px-4 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaging.map((row) => {
                        const isSelected = selectedRowIndex === row.rowIndex;
                        const hasCritical = row.anomalies.some((a) => a.severity === 'critical');
                        const hasWarning = row.anomalies.some((a) => a.severity === 'warning');

                        let statusBadge = (
                          <span className="text-[10px] font-bold text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 rounded-lg">
                            Clean
                          </span>
                        );
                        if (hasCritical) {
                          statusBadge = (
                            <span className="text-[10px] font-bold text-red-400 border border-red-500/20 bg-red-500/5 px-2 py-0.5 rounded-lg flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" /> Critical
                            </span>
                          );
                        } else if (hasWarning) {
                          statusBadge = (
                            <span className="text-[10px] font-bold text-amber-400 border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 rounded-lg flex items-center gap-1">
                              <Info className="w-2.5 h-2.5" /> Warning
                            </span>
                          );
                        }
                        if (row.isDeleted) {
                          statusBadge = (
                            <span className="text-[10px] font-bold text-slate-500 border border-white/5 bg-white/3 px-2 py-0.5 rounded-lg">
                              Discarded
                            </span>
                          );
                        }

                        return (
                          <React.Fragment key={row.rowIndex}>
                            <tr
                              onClick={() => setSelectedRowIndex(isSelected ? null : row.rowIndex)}
                              className={`border-b border-white/5 text-xs transition hover:cursor-pointer ${
                                isSelected ? 'bg-primary/5 hover:bg-primary/5' : 'hover:bg-white/3'
                              } ${row.isDeleted ? 'opacity-40 line-through' : ''}`}
                            >
                              <td className="px-4 py-3 text-slate-500 font-bold">#{row.rowIndex + 1}</td>
                              <td className="px-4 py-3 text-slate-300">
                                {row.parsedDate ? row.parsedDate.split('T')[0] : row.dateStr}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-200 max-w-[180px] truncate">
                                {row.description}
                              </td>
                              <td className="px-4 py-3 text-slate-300">
                                {row.paidByUserId ? (localRoster.find((m) => m.userId === row.paidByUserId)?.user.name || (row.paidByUserId.startsWith('pending-') ? row.paidByUserId.replace('pending-', '') : row.paidByCSV)) : row.paidByCSV}
                              </td>
                              <td className="px-4 py-3 font-bold text-slate-200">
                                {row.currencyCSV || baseCurrency} {row.parsedAmount}
                                {row.currencyCSV && row.currencyCSV !== baseCurrency && (
                                  <span className="text-[10px] text-slate-400 font-normal block leading-tight">
                                    ₹{(row.parsedAmount * row.exchangeRate).toFixed(2)} Base
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-400 uppercase font-outfit text-[10px]">
                                {row.isSettlement ? 'Settlement' : 'Expense'}
                              </td>
                              <td className="px-4 py-3 text-slate-400 text-[11px] truncate max-w-[200px]">
                                {!row.isSettlement ? (
                                  <>
                                    <span className="capitalize">{row.splitTypeCSV}</span> • {row.splitWithCSV}
                                  </>
                                ) : (
                                  `Repays: ${row.splitWithCSV}`
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">{statusBadge}</td>
                            </tr>
                            {isSelected && (
                              <tr>
                                <td colSpan={8} className="p-0">
                                  {renderRowEditor(row, row.rowIndex)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Anomaly Audit Summary Panel Sidebar (Col span 1) */}
                {(() => {
                  const criticalCount = stagingRows.filter((r) => !r.isDeleted && r.anomalies.some((a) => a.severity === 'critical')).length;
                  const warningCount = stagingRows.filter((r) => !r.isDeleted && r.anomalies.some((a) => a.severity === 'warning')).length;
                  
                  const categoryBreakdown = {
                    Duplicate: 0,
                    Membership: 0,
                    Currency: 0,
                    'Missing Data': 0,
                    'Split Validation': 0,
                    'Settlement Validation': 0,
                  };

                  stagingRows.forEach((r) => {
                    if (r.isDeleted) return;
                    r.anomalies.forEach((a) => {
                      const grp = getAnomalyGroup(a.category) as keyof typeof categoryBreakdown;
                      if (categoryBreakdown[grp] !== undefined) {
                        categoryBreakdown[grp]++;
                      }
                    });
                  });

                  return (
                    <div className="lg:col-span-1 bg-obsidian-card-elevated border border-white/5 rounded-2xl p-4 space-y-4 shadow-xl">
                      <div>
                        <h4 className="text-xs font-bold text-slate-100 uppercase tracking-widest">
                          Anomaly Audit
                        </h4>
                        <p className="text-[9px] text-slate-400 font-semibold tracking-wide">
                          Real-time validation diagnostics
                        </p>
                      </div>

                      <div className="space-y-3">
                        {/* Critical Blockers */}
                        <div className={`p-3 rounded-xl border flex items-center justify-between ${
                          criticalCount > 0 
                            ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        }`}>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Critical Blockers</span>
                          </div>
                          <span className="text-xs font-black">{criticalCount}</span>
                        </div>

                        {/* Warnings */}
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Info className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Warnings</span>
                          </div>
                          <span className="text-xs font-black">{warningCount}</span>
                        </div>

                        {/* Counts Category Breakdown */}
                        <div className="pt-2 divide-y divide-white/5 text-[11px]">
                          <div className="flex justify-between items-center py-2 text-slate-400">
                            <span>Duplicates</span>
                            <span className={`font-bold ${categoryBreakdown.Duplicate > 0 ? 'text-slate-200' : 'text-slate-600'}`}>{categoryBreakdown.Duplicate}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 text-slate-400">
                            <span>Membership Issues</span>
                            <span className={`font-bold ${categoryBreakdown.Membership > 0 ? 'text-slate-200' : 'text-slate-600'}`}>{categoryBreakdown.Membership}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 text-slate-400">
                            <span>Currency Issues</span>
                            <span className={`font-bold ${categoryBreakdown.Currency > 0 ? 'text-slate-200' : 'text-slate-600'}`}>{categoryBreakdown.Currency}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 text-slate-400">
                            <span>Missing Data</span>
                            <span className={`font-bold ${categoryBreakdown['Missing Data'] > 0 ? 'text-slate-200' : 'text-slate-600'}`}>{categoryBreakdown['Missing Data']}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 text-slate-400">
                            <span>Split Validation</span>
                            <span className={`font-bold ${categoryBreakdown['Split Validation'] > 0 ? 'text-slate-200' : 'text-slate-600'}`}>{categoryBreakdown['Split Validation']}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 text-slate-400 pb-0 border-none">
                            <span>Settlement Validation</span>
                            <span className={`font-bold ${categoryBreakdown['Settlement Validation'] > 0 ? 'text-slate-200' : 'text-slate-600'}`}>{categoryBreakdown['Settlement Validation']}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Commit Footer */}
              <div className="flex justify-between items-center bg-obsidian-card-elevated border border-white/5 p-4 rounded-2xl shrink-0 mt-auto">
                <div className="text-xs text-slate-400">
                  <span className="font-bold text-slate-200">
                    {stagingRows.filter((r) => !r.isDeleted).length} / {stagingRows.length}
                  </span>{' '}
                  rows active •{' '}
                  <span className="font-bold text-amber-400">
                    {stagingRows.filter((r) => !r.isDeleted && r.anomalies.length > 0).length}
                  </span>{' '}
                  with warnings •{' '}
                  <span className="font-bold text-red-400">
                    {stagingRows.filter((r) => !r.isDeleted && r.anomalies.some((a) => a.severity === 'critical')).length}
                  </span>{' '}
                  critical blockers
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('mapping')}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold text-slate-400 hover:text-slate-200 bg-white/5 border border-white/5 transition hover:cursor-pointer"
                    disabled={submitting}
                  >
                    Back to Mapping
                  </button>
                  <button
                    onClick={handleCommitImport}
                    disabled={
                      submitting ||
                      stagingRows.filter((r) => !r.isDeleted && r.anomalies.some((a) => a.severity === 'critical')).length > 0
                    }
                    className="px-4 py-2 rounded-xl text-xs font-extrabold bg-primary text-obsidian hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 transition hover:cursor-pointer flex items-center gap-1.5 shadow-lg shadow-primary/20"
                  >
                    {submitting ? 'Writing Ledger...' : 'Commit Import'} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Import Dry-Run Confirmation overlay modal */}
          {showDryRun && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-lg z-[60] flex items-center justify-center p-4">
              <div className="glass-card w-full max-w-md bg-obsidian-card-elevated border border-white/10 rounded-2xl p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="text-center space-y-2">
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-widest flex items-center justify-center gap-2">
                    <span className="p-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg">
                      <Check className="w-4 h-4" />
                    </span>
                    Import Preview & Dry Run
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold tracking-wide">
                    Review pending changes before writing to production tables.
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-white/5 rounded-2xl p-4 divide-y divide-white/5 space-y-3">
                  {(() => {
                    const activeRows = stagingRows.filter((r) => !r.isDeleted);
                    const skippedCount = stagingRows.filter((r) => r.isDeleted).length;
                    
                    const usersToCreateCount = Object.keys(pendingUsersToCreate).length;

                    const systemUsersToJoin = new Set<string>();
                    activeRows.forEach((row) => {
                      let paidBy = row.paidByUserId;
                      if (paidBy && paidBy.startsWith('pending-')) {
                        // If it's a pending user, they will be created and joined
                        return;
                      }
                      if (paidBy && !localRoster.some((m) => m.userId === paidBy)) {
                        systemUsersToJoin.add(paidBy);
                      }
                      if (row.splitWithCSV) {
                        const splitWithNames = row.splitWithCSV.split(';').map(p => p.trim()).filter(Boolean);
                        splitWithNames.forEach((p) => {
                          const uid = fuzzyMapMember(p, localRoster) || fuzzyMapSystemUser(p, systemUsers)?.id;
                          if (uid && !uid.startsWith('pending-') && !localRoster.some((m) => m.userId === uid)) {
                            systemUsersToJoin.add(uid);
                          }
                        });
                      }
                    });
                    const membershipsToCreateCount = usersToCreateCount + systemUsersToJoin.size;

                    const expensesCount = activeRows.filter((r) => !r.isSettlement).length;
                    const settlementsCount = activeRows.filter((r) => r.isSettlement).length;

                    let warningsCount = 0;
                    activeRows.forEach((row) => {
                      warningsCount += row.anomalies.filter((a) => a.severity === 'warning').length;
                    });

                    return (
                      <>
                        <div className="flex justify-between items-center text-xs py-2 first:pt-0">
                          <span className="text-slate-400">Users to Create</span>
                          <span className="font-bold text-slate-200">{usersToCreateCount}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs py-2">
                          <span className="text-slate-400">Memberships to Create</span>
                          <span className="font-bold text-slate-200">{membershipsToCreateCount}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs py-2">
                          <span className="text-slate-400">Expenses to Import</span>
                          <span className="font-bold text-slate-200">{expensesCount}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs py-2">
                          <span className="text-slate-400">Settlements to Import</span>
                          <span className="font-bold text-slate-200">{settlementsCount}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs py-2">
                          <span className="text-slate-400">Rows to Skip (Discarded)</span>
                          <span className="font-bold text-slate-400">{skippedCount}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs py-2">
                          <span className="text-slate-400">Warnings Remaining</span>
                          <span className={`font-bold ${warningsCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{warningsCount}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs py-2 last:pb-0">
                          <span className="text-slate-400">Critical Blockers</span>
                          <span className="font-bold text-emerald-400">0</span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDryRun(false)}
                    className="w-1/2 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-white/5 border border-white/5 transition hover:cursor-pointer"
                  >
                    Back to Staging
                  </button>
                  <button
                    onClick={handleCommitImportInternal}
                    className="w-1/2 py-2.5 rounded-xl text-xs font-bold bg-primary text-obsidian hover:brightness-110 transition hover:cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-primary/20"
                  >
                    Confirm Commit
                  </button>
                </div>
              </div>
            </div>
          )}

          {!loading && step === 'summary' && summaryMetrics && (
            <div className="max-w-xl mx-auto space-y-6 text-center py-6 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-100">Import Job Completed Successfully!</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Transactions have been logged to Supabase and aggregate metrics updated in the ledger.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4">
                <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-center">
                  <span className="block text-xl font-bold text-slate-200">{summaryMetrics.importedCount}</span>
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">
                    Transactions Imported
                  </span>
                </div>
                <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-center">
                  <span className="block text-xl font-bold text-slate-200">₹{summaryMetrics.totalAmountBase.toFixed(2)}</span>
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">
                    Total Volume (Base)
                  </span>
                </div>
                <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-center">
                  <span className="block text-xl font-bold text-slate-200">{summaryMetrics.anomalyCount}</span>
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">
                    Anomalies Resolved
                  </span>
                </div>
                <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-center">
                  <span className="block text-xl font-bold text-slate-200">{summaryMetrics.totalRows}</span>
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">
                    Total Raw Rows
                  </span>
                </div>
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-left flex gap-3 text-xs leading-relaxed text-slate-300">
                <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-200 block mb-0.5">Audit Trail Generated</span>
                  Staging entries, warnings, and manual resolution details have been logged in the <code className="text-[10px] border border-white/10 px-1 py-0.5 bg-white/3 rounded text-slate-200">AnomalyLog</code> and <code className="text-[10px] border border-white/10 px-1 py-0.5 bg-white/3 rounded text-slate-200">ImportReport</code> tables for audit history compliance.
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => onClose(true)}
                  className="w-full py-3 rounded-xl text-xs font-extrabold bg-gradient-to-r from-primary to-accent text-obsidian hover:brightness-110 transition hover:cursor-pointer shadow-lg shadow-primary/20"
                >
                  Return to Experience Detail
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
