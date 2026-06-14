# AI_CONTEXT - SplitSync (Supabase Serverless)

This document serves as the single source of truth for the SplitSync codebase. Any agent or developer should be able to reconstruct the entire application using this file.

---

## 1. Product Context & Scope
SplitSync is a serverless version of Splitwise. The goal is to track expenses within a group, calculate who owes whom, and simplify the transactions needed to settle up. The client React application talks directly to Supabase BaaS.

### Core Modules
1. **User Authentication**: Register, login, and logout using Supabase Auth.
2. **Group Management**: Create groups, invite users via email, list group members, remove members, and accept/reject pending invites.
3. **Expense Splitting**: Create expenses with title, description, amount, paid_by, and split type:
   - **Equal**: Split evenly.
   - **Unequal**: Split by specific amounts.
   - **Percentage**: Split by custom percentages.
   - **Share**: Split by ratios/shares.
4. **Real-time Chat**: Connects to the expense chat via Supabase Realtime Channels (`postgres_changes` on the `Message` table).
5. **Debt Simplification**: Dynamic computation of net balances and greedy debt matching to minimize the transactions required to settle.
6. **Settlements**: Record payments from user A to user B, updating net balances.

---

## 2. Supabase SQL DDL Schema

Copy and execute this script in your Supabase SQL Editor:

```sql
-- 1. Create public User profile table linked to auth.users
create table public."User" (
  id uuid references auth.users on delete cascade not null primary key,
  name text not null,
  email text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create Group table
create table public."Group" (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_by uuid references public."User" on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create GroupMember table
create table public."GroupMember" (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public."Group" on delete cascade not null,
  user_id uuid references public."User" on delete cascade not null,
  role text default 'member' not null, -- 'creator', 'member'
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (group_id, user_id)
);

-- 4. Create GroupInvite table
create table public."GroupInvite" (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public."Group" on delete cascade not null,
  email text not null,
  invited_by uuid references public."User" on delete cascade not null,
  status text default 'pending' not null, -- 'pending', 'accepted', 'rejected'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (group_id, email)
);

-- 5. Create Expense table
create table public."Expense" (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public."Group" on delete cascade not null,
  title text not null,
  description text,
  amount numeric(12, 2) not null,
  paid_by uuid references public."User" on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Create ExpenseSplit table
create table public."ExpenseSplit" (
  id uuid default gen_random_uuid() primary key,
  expense_id uuid references public."Expense" on delete cascade not null,
  user_id uuid references public."User" on delete cascade not null,
  amount numeric(12, 2) not null,
  percentage numeric(5, 2),
  share_count numeric(8, 2),
  split_type text not null, -- 'equal', 'unequal', 'percentage', 'share'
  unique (expense_id, user_id)
);

-- 7. Create Settlement table
create table public."Settlement" (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public."Group" on delete cascade not null,
  payer_id uuid references public."User" on delete cascade not null,
  receiver_id uuid references public."User" on delete cascade not null,
  amount numeric(12, 2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. Create Message table
create table public."Message" (
  id uuid default gen_random_uuid() primary key,
  expense_id uuid references public."Expense" on delete cascade not null,
  user_id uuid references public."User" on delete cascade not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 9. Automatic profile sync trigger from auth.users -> public.User
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public."User" (id, name, email)
  values (
    new.id, 
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

---

## 3. Client Business Logic Details

### Mathematical Splitting Formulas (React Client)
1. **Equal Split**: 
   - Input: $N$ participants, total expense amount $T$.
   - Calculate basic share: $S = \text{round}(T / N, 2)$.
   - Adjustment for rounding errors: Sum of shares must equal $T$. If there's a discrepancy (e.g., $1000 / 3 = 333.33 \times 3 = 999.99$, difference is $+0.01$), add/subtract the difference to/from the first split participant's share.
2. **Unequal Split**:
   - Verify: $\sum amount_i == T$.
3. **Percentage Split**:
   - Verify: $\sum percentage_i == 100.00$.
   - Calculate amount: $amount_i = \text{round}(T \times \frac{percentage_i}{100}, 2)$. Adjust rounding error on the first participant.
4. **Share Split**:
   - Sum total shares: $S_{total} = \sum shareCount_i$.
   - Calculate amount: $amount_i = \text{round}(T \times \frac{shareCount_i}{S_{total}}, 2)$. Adjust rounding error on the first participant.

### Greedy Debt Simplification (Client)
Calculated dynamically in `frontend/src/utils/balances.ts`:
1. Calculate net balance for each member:
   $$\text{netBalance}[i] = \sum \text{ExpensesPaidBy}[i] - \sum \text{ExpenseSplitsOwedBy}[i] + \sum \text{SettlementsReceivedBy}[i] - \sum \text{SettlementsPaidBy}[i]$$
2. Classify:
   - Creditors: users with `netBalance > 0.005`
   - Debtors: users with `netBalance < -0.005`
3. Sort both groups descending by magnitude.
4. While Debtors is not empty and Creditors is not empty:
   - Take the largest debtor $D$ and largest creditor $C$.
   - Transaction amount $A = \min(|D.balance|, |C.balance|)$.
   - Record settlement: $D$ pays $C$ amount $A$.
   - Update balances:
     - $D.balance += A$
     - $C.balance -= A$
   - Remove $D$ or $C$ from queues if their balance reaches 0 (with precision threshold e.g. $< 0.005$).
   - Yield transaction: `{ from: D.userId, to: C.userId, amount: A }`.

---

## 4. Real-time Message Updates
Listen directly to database insert events on the `"Message"` table using Supabase Realtime Channels:
```typescript
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
      // Map user profile in-memory from members list
      const newMsg = {
        id: payload.new.id,
        message: payload.new.message,
        createdAt: payload.new.created_at,
        userId: payload.new.user_id,
      };
      // Append to local message array
    }
  )
  .subscribe();
```

---

## 5. Deployment Notes
- **Vercel**: Deploy the frontend React app. Set environmental variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project configuration.
- **Supabase**: Ensure tables are set up using the SQL editor. Realtime must be enabled for the `Message` table in the Supabase Dashboard settings (Replication settings).
