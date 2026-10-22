import { createClient } from "@/lib/supabase/browser";

export type UserRole = "employee" | "manager" | "admin";
export type DatabaseUserRole = UserRole;

export function routeForRole(role: UserRole): string {
  if (role === "admin") return "/admin";
  if (role === "manager") return "/manager";
  return "/employee";
}

const USER_KEY = "siteWatchUser";

export type AuthenticatedProfile = {
  email: string;
  role: DatabaseUserRole;
  isActive: boolean;
};

export async function getAuthenticatedProfile(): Promise<AuthenticatedProfile | null> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profile || (profile.role !== "employee" && profile.role !== "manager" && profile.role !== "admin")) {
    throw new Error("Your account profile is missing or has an unsupported role.");
  }

  return {
    email: user.email ?? "",
    role: profile.role,
    isActive: profile.is_active === true,
  };
}

export function getStoredUserEmail(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(USER_KEY) ?? "";
}

export function setStoredUserEmail(userEmail: string): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(USER_KEY, userEmail.trim());
  }
}

export async function signOut(): Promise<void> {
  const { error } = await createClient().auth.signOut();
  if (error) {
    throw error;
  }

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(USER_KEY);
    window.sessionStorage.removeItem("siteWatchRole");
  }
}
