import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { TermsContent, TERMS_UPDATED } from "@/components/legal/terms-content";

export const metadata: Metadata = {
  title: "Terms of Service — Artifact Room",
  description: `Terms of Service for this Artifact Room instance (last updated ${TERMS_UPDATED}).`,
};

export default function TermsPage() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-8 p-6 md:p-10">
      <Link href="/" className="flex items-center gap-2 font-medium">
        <Logo className="size-7 text-primary" />
        Artifact Room
      </Link>
      <main className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Terms of Service
        </h1>
        <TermsContent />
      </main>
    </div>
  );
}
