"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TermsContent } from "@/components/legal/terms-content";
import { PrivacyContent } from "@/components/legal/privacy-content";

const DOCS = {
  terms: { title: "Terms of Service", href: "/terms", Content: TermsContent },
  privacy: { title: "Privacy Policy", href: "/privacy", Content: PrivacyContent },
} as const;

/**
 * Opens a legal document in a scrollable dialog so an in-progress auth form
 * never loses its state; the same content also lives at a canonical route
 * (linked from the dialog footer).
 */
export function LegalDialog({
  doc,
  children,
}: {
  doc: keyof typeof DOCS;
  children: React.ReactNode;
}) {
  const { title, href, Content } = DOCS[doc];

  return (
    <Dialog>
      <DialogTrigger className="underline underline-offset-4 hover:text-foreground">
        {children}
      </DialogTrigger>
      <DialogContent className="max-h-[80svh] grid-rows-[auto_1fr_auto] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="-mr-2 overflow-y-auto pr-2 text-left">
          <Content />
        </div>
        <DialogFooter className="sm:justify-start">
          <Link
            href={href}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Open as page →
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
