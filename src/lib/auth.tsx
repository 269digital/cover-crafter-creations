import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  credits: number;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  refreshCredits: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(0);

  const refreshCredits = async () => {
    if (!user) {
      console.log('No user found for credit refresh');
      return;
    }
    
    console.log('Refreshing credits for user:', user.id, 'email:', user.email);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("credits, user_id, email")
        .eq("user_id", user.id)
        .maybeSingle();
      
      console.log('Credits query result:', { data, error, userIdSearched: user.id });
      
      if (error) {
        console.error("Error fetching credits:", error);
        setCredits(0);
        return;
      }
      
      if (data) {
        console.log('Profile found:', data, 'Setting credits to:', data.credits);
        setCredits(data.credits || 0);
      } else {
        console.warn("No profile found for user ID:", user.id);
        setCredits(0);
      }
    } catch (error) {
      console.error("Error refreshing credits:", error);
      setCredits(0);
    }
  };

  useEffect(() => {
    console.log('Auth provider initializing...');
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, 'Session:', !!session);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          console.log('User authenticated:', session.user.email);
          // Defer credit refresh to avoid blocking auth state
          setTimeout(() => {
            refreshCredits();
          }, 0);
        } else {
          console.log('No user in session');
          setCredits(0);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    console.log('Checking for existing session...');
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('Initial session check:', !!session, 'Error:', error);
      if (error) {
        console.error('Session check error:', error);
        setLoading(false);
        return;
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('Found existing session for:', session.user.email);
        setTimeout(() => {
          refreshCredits();
        }, 0);
      }
      setLoading(false);
    }).catch((error) => {
      console.error('Error checking session:', error);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setCredits(0);
    }
    return { error };
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/auth`;
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });
    return { error };
  };

  const value = {
    user,
    session,
    loading,
    credits,
    signUp,
    signIn,
    signOut,
    resetPassword,
    refreshCredits,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};