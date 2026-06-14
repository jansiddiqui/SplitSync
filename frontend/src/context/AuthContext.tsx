import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch the public User profile matching the auth.uid()
  const fetchUserProfile = async (userId: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('User')
        .select('id, name, email, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching public profile:', error.message);
        return null;
      }

      // Profile found successfully
      if (data) {
        return {
          id: data.id,
          name: data.name,
          email: data.email,
          createdAt: data.created_at,
        };
      }

      // Profile does not exist (e.g. user registered before trigger was set, or trigger latency)
      // We dynamically create it to prevent crashes, but first check for imported placeholder profiles to merge.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const name = authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'New User';
        const email = authUser.email || '';
        const cleanEmail = email.toLowerCase().trim();

        // Check if there is an existing placeholder user record with this email but a different ID
        const { data: placeholderProfile } = await supabase
          .from('User')
          .select('id, name')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (placeholderProfile && placeholderProfile.id !== userId) {
          const oldId = placeholderProfile.id;

          // Migrate all related entries to the new authenticated userId
          try {
            await supabase.from('GroupMember').update({ user_id: userId }).eq('user_id', oldId);
          } catch (e) {
            console.warn('GroupMember migration warning:', e);
          }

          try {
            await supabase.from('Expense').update({ paid_by: userId }).eq('paid_by', oldId);
          } catch (e) {
            console.warn('Expense migration warning:', e);
          }

          try {
            await supabase.from('ExpenseSplit').update({ user_id: userId }).eq('user_id', oldId);
          } catch (e) {
            console.warn('ExpenseSplit migration warning:', e);
          }

          try {
            await supabase.from('Settlement').update({ payer_id: userId }).eq('payer_id', oldId);
          } catch (e) {
            console.warn('Settlement payer migration warning:', e);
          }

          try {
            await supabase.from('Settlement').update({ receiver_id: userId }).eq('receiver_id', oldId);
          } catch (e) {
            console.warn('Settlement receiver migration warning:', e);
          }

          // Update the User profile ID itself to match the auth account userId
          const { data: mergedProfile, error: mergeErr } = await supabase
            .from('User')
            .update({
              id: userId,
              name: name !== 'New User' ? name : placeholderProfile.name
            })
            .eq('id', oldId)
            .select()
            .maybeSingle();

          if (!mergeErr && mergedProfile) {
            return {
              id: mergedProfile.id,
              name: mergedProfile.name,
              email: mergedProfile.email,
              createdAt: mergedProfile.created_at,
            };
          } else {
            console.error('Failed to merge placeholder profile:', mergeErr?.message);
          }
        }

        // If no placeholder user exists, create a new User record
        const { data: newProfile, error: insErr } = await supabase
          .from('User')
          .insert({
            id: userId,
            name,
            email,
          })
          .select()
          .maybeSingle();

        if (!insErr && newProfile) {
          return {
            id: newProfile.id,
            name: newProfile.name,
            email: newProfile.email,
            createdAt: newProfile.created_at,
          };
        } else {
          console.error('Failed to auto-create public user profile:', insErr?.message);
        }
      }
      return null;
    } catch (err) {
      console.error('Failed to get user profile:', err);
      return null;
    }
  };

  const refreshUser = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        setUser(profile);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Session refresh error:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Initial session load
    refreshUser();

    // 2. Subscribe to auth state updates
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Supabase Auth Event:', event);
      if (session?.user) {
        if (event === 'SIGNED_IN') {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const profile = await fetchUserProfile(session.user.id);
        setUser(profile);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new Error(error.message);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    });
    if (error) {
      throw new Error(error.message);
    }
    // We let onAuthStateChange handle fetching profile and setting state
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
