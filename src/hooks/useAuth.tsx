import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "organizer" | "participant" | "volunteer";
export type VerificationStatus = "unverified" | "pending" | "review" | "verified" | "rejected";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  verificationStatus: VerificationStatus | null;
  verificationNote: string | null;
  // Admins : toujours considérés comme vérifiés.
  isVerified: boolean;
  refreshVerification: () => Promise<void>;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [verificationNote, setVerificationNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => { fetchRole(sess.user.id); fetchVerification(sess.user.id); }, 0);
      } else {
        setRole(null);
        setVerificationStatus(null);
        setVerificationNote(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) { fetchRole(sess.user.id); fetchVerification(sess.user.id); }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRole(userId: string) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .order("role", { ascending: true })
      .limit(1)
      .maybeSingle();
    setRole((data?.role as AppRole) ?? "participant");
  }

  async function fetchVerification(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("verification_status, verification_note")
      .eq("id", userId)
      .maybeSingle();
    setVerificationStatus((data?.verification_status as VerificationStatus) ?? "unverified");
    setVerificationNote(data?.verification_note ?? null);
  }

  async function refreshVerification() {
    if (user) await fetchVerification(user.id);
  }

  const isVerified = role === "admin" || verificationStatus === "verified";

  async function signOut() {
    await supabase.auth.signOut();
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{ user, session, role, verificationStatus, verificationNote, isVerified, refreshVerification, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
