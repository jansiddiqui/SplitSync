import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { X, Send, MessageSquare, Calendar, Info } from 'lucide-react';

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

interface ExpenseSplit {
  id: string;
  userId: string;
  amount: string;
  splitType: string;
}

interface ChatMessage {
  id: string;
  message: string;
  createdAt: string;
  userId: string;
}

interface ExpenseDetails {
  id: string;
  title: string;
  description: string | null;
  amount: string;
  paidBy: string;
  createdAt: string;
  splits: ExpenseSplit[];
}

interface ExpenseChatProps {
  expenseId: string;
  members: UserInfo[]; // Used to map user names in-memory
  onClose: () => void;
}

export const ExpenseChat: React.FC<ExpenseChatProps> = ({ expenseId, members, onClose }) => {
  const { user } = useAuth();
  const [expense, setExpense] = useState<ExpenseDetails | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Mobile Tab State
  const [mobileTab, setMobileTab] = useState<'chat' | 'details'>('chat');
  
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Load expense details and initial chat message history
  const loadExpenseDetailsAndHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Expense
      const { data: expData, error: eErr } = await supabase
        .from('Expense')
        .select(`
          id,
          title,
          description,
          amount,
          paid_by,
          created_at,
          ExpenseSplit (
            id,
            user_id,
            amount,
            split_type
          )
        `)
        .eq('id', expenseId)
        .single();

      if (eErr) throw new Error(eErr.message);

      const formattedExpense: ExpenseDetails = {
        id: expData.id,
        title: expData.title,
        description: expData.description,
        amount: expData.amount,
        paidBy: expData.paid_by,
        createdAt: expData.created_at,
        splits: (expData.ExpenseSplit || []).map((s: any) => ({
          id: s.id,
          userId: s.user_id,
          amount: s.amount,
          splitType: s.split_type,
        })),
      };

      setExpense(formattedExpense);

      // 2. Fetch Chat History
      const { data: msgsData, error: mErr } = await supabase
        .from('Message')
        .select('id, message, created_at, user_id')
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: true });

      if (mErr) throw new Error(mErr.message);

      const formattedMessages: ChatMessage[] = (msgsData || []).map((m: any) => ({
        id: m.id,
        message: m.message,
        createdAt: m.created_at,
        userId: m.user_id,
      }));

      setMessages(formattedMessages);
    } catch (err: any) {
      setError(err.message || 'Failed to load expense details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenseDetailsAndHistory();
  }, [expenseId]);

  // Connect to Supabase Realtime channel
  useEffect(() => {
    const channel = supabase
      .channel(`expense_chat:${expenseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Message',
          filter: `expense_id=eq.${expenseId}`,
        },
        (payload) => {
          const newMsg: ChatMessage = {
            id: payload.new.id,
            message: payload.new.message,
            createdAt: payload.new.created_at,
            userId: payload.new.user_id,
          };
          
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [expenseId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !user) return;

    try {
      const { error } = await supabase
        .from('Message')
        .insert({
          expense_id: expenseId,
          user_id: user.id,
          message: inputMessage.trim(),
        });

      if (error) throw new Error(error.message);
      setInputMessage('');
    } catch (err: any) {
      console.error('Error sending message:', err.message);
    }
  };

  // Maps User ID to name and email in-memory
  const getUserName = (userId: string) => {
    const m = members.find((member) => member.id === userId);
    return m ? m.name : 'Unknown User';
  };

  if (loading && !expense) {
    return (
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-8 max-w-sm w-full text-center space-y-4 border border-white/10 shadow-2xl">
          <span className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto block"></span>
          <span className="text-slate-400 text-sm font-medium animate-pulse">Fetching chat room...</span>
        </div>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-6 max-w-sm w-full text-center space-y-4 border border-white/10 shadow-2xl">
          <p className="text-red-400 font-bold">Error Loading Chat</p>
          <p className="text-xs text-slate-400">{error || 'Expense details not found.'}</p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold rounded-xl border border-white/5 transition hover:cursor-pointer text-xs"
          >
            Close Dialog
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-4xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col md:grid md:grid-cols-5 h-[80vh] max-h-[700px] card-glow-theme">
        
        {/* Mobile Tabs Switcher */}
        <div className="md:hidden col-span-1 bg-slate-950/60 p-1 flex border-b border-white/5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('chat')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold text-center transition hover:cursor-pointer btn-magnetic ${
              mobileTab === 'chat' 
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_-3px_var(--color-primary-glow)] font-extrabold' 
                : 'text-slate-500 hover:text-slate-400'
            }`}
          >
            Discussion
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('details')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold text-center transition hover:cursor-pointer btn-magnetic ${
              mobileTab === 'details' 
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_-3px_var(--color-primary-glow)] font-extrabold' 
                : 'text-slate-500 hover:text-slate-400'
            }`}
          >
            Bill Details
          </button>
        </div>

        {/* Left Columns (3): Chat panel */}
        <div className={`md:col-span-3 flex-1 md:flex-none md:h-full flex-col border-r border-white/5 ${mobileTab === 'chat' ? 'flex' : 'hidden md:flex'}`}>
          
          {/* Chat Header */}
          <header className="p-4 border-b border-white/5 flex justify-between items-center bg-slate-950/20 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="font-bold text-slate-100 text-sm">{expense.title} Chat</h4>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Real-time discussion</p>
              </div>
            </div>
            <button
              id="btn-chat-close-mobile"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/40">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 p-6 text-center">
                <MessageSquare className="w-8 h-8 text-slate-700 animate-pulse" />
                <p className="text-xs font-semibold text-slate-350">No messages yet</p>
                <p className="text-[10px] text-slate-500 max-w-[200px]">
                  Ask questions or discuss the calculations of this bill here.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.userId === user?.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col max-w-[75%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                  >
                    <span className="text-[9px] text-slate-400 font-semibold mb-1 px-1">
                      {isMe ? 'You' : getUserName(msg.userId)}
                    </span>
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed break-words shadow-md transition-all ${
                        isMe
                           ? 'bg-primary/20 border border-primary/30 text-slate-100 rounded-tr-none'
                           : 'bg-slate-900/60 backdrop-blur-md text-slate-200 rounded-tl-none border border-white/5'
                      }`}
                    >
                      {msg.message}
                    </div>
                    <span className="text-[8px] text-slate-550 mt-1 px-1 font-medium">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat input */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-white/5 bg-slate-950/20 shrink-0 flex gap-2">
            <input
              id="input-chat-message"
              type="text"
              placeholder="Write a message..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl glass-input text-xs"
              required
            />
            <button
              id="btn-chat-send"
              type="submit"
              className="p-2.5 bg-gradient-to-r from-primary to-accent hover:brightness-110 text-obsidian rounded-xl transition shadow-lg shadow-primary/20 flex items-center justify-center hover:cursor-pointer btn-magnetic"
            >
              <Send className="w-3.5 h-3.5 text-obsidian" />
            </button>
          </form>
        </div>

        {/* Right Columns (2): Expense and splits details */}
        <div className={`md:col-span-2 flex-1 md:flex-none md:h-full flex-col bg-[#0b0f19]/30 ${mobileTab === 'details' ? 'flex' : 'hidden md:flex'}`}>
          {/* Header */}
          <header className="p-4 border-b border-white/5 flex justify-between items-center shrink-0">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Info className="w-4 h-4 text-primary" />
              Bill Details
            </span>
            <button
              id="btn-chat-close"
              onClick={onClose}
              className="hidden md:block p-1 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* Details details */}
          <div className="p-4 flex-1 overflow-y-auto space-y-6">
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-100 leading-tight">{expense.title}</h3>
              {expense.description && <p className="text-xs text-slate-400">{expense.description}</p>}
            </div>

            {/* Figures */}
            <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-4 rounded-xl border border-white/5">
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Total Amount</p>
                <p className="text-base font-outfit font-semibold text-slate-200 mt-0.5">₹{parseFloat(expense.amount).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Paid By</p>
                <p className="text-xs font-bold text-slate-300 mt-1 line-clamp-1">{getUserName(expense.paidBy)}</p>
              </div>
            </div>

            {/* Metadata info */}
            <div className="text-[9px] text-slate-550 font-medium space-y-1">
              <p className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-600" />
                Added {new Date(expense.createdAt).toLocaleDateString()} at {new Date(expense.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {/* Shares breakdown */}
            <div className="space-y-3 pt-4 border-t border-white/5">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Split Breakdown</p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {expense.splits.map((split) => {
                  const splitAmt = parseFloat(split.amount);
                  const isSplitPayer = split.userId === expense.paidBy;

                  return (
                    <div key={split.id} className="flex justify-between items-center text-xs bg-slate-955/40 p-3 rounded-lg border border-white/5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-200">{getUserName(split.userId)}</span>
                        {isSplitPayer && (
                          <span className="text-[8px] bg-primary/20 text-primary border border-primary/30 px-1 rounded font-bold uppercase tracking-wider">
                            Payer
                          </span>
                        )}
                      </div>
                      <span className="font-outfit font-semibold text-slate-350">
                        ₹{splitAmt.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
