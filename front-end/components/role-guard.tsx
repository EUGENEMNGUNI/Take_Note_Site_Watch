"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getAuthenticatedProfile, signOut, type UserRole } from "@/lib/auth";

export function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "authorized" | "error">("checking");
  const allowedRoleKey = allowedRoles.join(",");

  useEffect(() => {
    let active = true;

    const verifyAccess = async () => {
      try {
        const profile = await getAuthenticatedProfile();
        if (!active) return;

        if (!profile) {
          router.replace("/");
          return;
        }

        if (!profile.isActive) {
          await signOut();
          if (active) router.replace("/");
          return;
        }

        const roleRoute = profile.role === "admin" ? "/admin" : "/employee";
        if (!allowedRoleKey.split(",").includes(profile.role)) {
          router.replace(roleRoute);
          return;
        }

        setStatus("authorized");
      } catch {
        if (active) setStatus("error");
      }
    };

    void verifyAccess();
    return () => {
      active = false;
    };
  }, [allowedRoleKey, router]);

  if (status === "error") {
    return (
      <main className="login">
        <p className="message error" role="alert">
          We could not verify your account. Please return to sign in and try again.
          <button type="button" onClick={() => router.replace("/")}>Return to sign in</button>
        </p>
      </main>
    );
  }

  return status === "authorized" ? <>{children}</> : null;
}
