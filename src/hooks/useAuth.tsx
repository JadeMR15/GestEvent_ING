import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "organizer" | "participant" | "volunteer";
export type VerificationStatus = "unverified" | "pending" | "review" | "verified" | "rejected";
export type VerificationMethod = "school_email" | "document";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  verificationStatus: VerificationStatus | null;
  verificationNote: string | null;
  // École du profil (déduite du domaine si vérifié par email d'école).
  school: string | null;
  verificationMethod: VerificationMethod | null;
  // Fin de validité de la vérification (31 août) ; au-delà, le compte n'est plus vérifié.
  verificationExpiresAt: string | null;
  schoolEmail: string | null;
  // Admins : toujours considérés comme vérifiés.
  isVerified: boolean;
  refreshVerification: () => Promise<void>;
  // Nom et photo affichés dans le menu ; rechargés après une modification dans Paramètres.
  fullName: string | null;
  avatarPath: string | null;
  refreshProfile: () => Promise<void>;
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
  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [school, setSchool] = useState<string | null>(null);
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod | null>(null);
  const [verificationExpiresAt, setVerificationExpiresAt] = useState<string | null>(null);
  const [schoolEmail, setSchoolEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => { fetchRole(sess.user.id); fetchVerification(sess.user.id); fetchProfile(sess.user.id); }, 0);
      } else {
        setRole(null);
        setVerificationStatus(null);
        setVerificationNote(null);
        setFullName(null);
        setAvatarPath(null);
        setSchool(null);
        setVerificationMethod(null);
        setVerificationExpiresAt(null);
        setSchoolEmail(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) { fetchRole(sess.user.id); fetchVerification(sess.user.id); fetchProfile(sess.user.id); }
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
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("verification_status, verification_note, verification_method, verification_expires_at, school, school_email")
      .eq("id", userId)
      .maybeSingle();
    let row = data;
    if (error) {
      // Colonnes de school_email.sql pas encore créées : on charge l'essentiel.
      ({ data: row } = await supabase.from("profiles")
        .select("verification_status, verification_note, school").eq("id", userId).maybeSingle() as any);
    }
    setVerificationStatus((row?.verification_status as VerificationStatus) ?? "unverified");
    setVerificationNote(row?.verification_note ?? null);
    setSchool(row?.school || null);
    setVerificationMethod(row?.verification_method ?? null);
    setVerificationExpiresAt(row?.verification_expires_at ?? null);
    setSchoolEmail(row?.school_email ?? null);
  }

  // Requête séparée : si la colonne avatar_path n'existe pas encore, la vérification n'est pas affectée.
  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, avatar_path")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      const { data: basic } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      setFullName(basic?.full_name ?? null);
      setAvatarPath(null);
      return;
    }
    setFullName(data?.full_name ?? null);
    setAvatarPath(data?.avatar_path ?? null);
  }

  async function refreshProfile() {
    if (user) await Promise.all([fetchProfile(user.id), fetchVerification(user.id)]);
  }

  async function refreshVerification() {
    if (user) await fetchVerification(user.id);
  }

  const verificationExpired = !!verificationExpiresAt && new Date(verificationExpiresAt).getTime() <= Date.now();
  const isVerified = role === "admin" || (verificationStatus === "verified" && !verificationExpired);

  async function signOut() {
    await supabase.auth.signOut();
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{
      user, session, role, verificationStatus, verificationNote, school, verificationMethod, verificationExpiresAt, schoolEmail,
      isVerified, refreshVerification, fullName, avatarPath, refreshProfile, loading, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
