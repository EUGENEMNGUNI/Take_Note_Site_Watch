import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Site Watch",
  description: "Sign in to Take Note Site Watch with the account your administrator created for you.",
};

export default function SignInLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
