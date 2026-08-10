"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Protection = "public" | "email" | "email_password" | "password";

/** Which fields each protection level requires. Mirrors the server rules in
 *  `lib/share.ts` — this is a convenience, never the only validation. */
const NEEDS_EMAIL: Record<Protection, boolean> = {
  public: false,
  email: true,
  email_password: true,
  password: true,
};
const NEEDS_PASSWORD: Record<Protection, boolean> = {
  public: false,
  email: false,
  email_password: true,
  password: true,
};

export function CreateShareForm({ artifactId }: { artifactId: string }) {
  const router = useRouter();
  const [protection, setProtection] = useState<Protection>("public");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [password, setPassword] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("0");
  const [loading, setLoading] = useState(false);

  const needsEmail = NEEDS_EMAIL[protection];
  const needsPassword = NEEDS_PASSWORD[protection];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/creator/shares", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        artifactId,
        protection,
        recipientEmail: needsEmail ? recipientEmail : undefined,
        recipientLabel: recipientLabel || undefined,
        password: needsPassword ? password : undefined,
        expiresInDays: Number(expiresInDays) || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast.error(data.error ?? "Could not create the share.");
      return;
    }
    try {
      await navigator.clipboard?.writeText(data.url);
      toast.success("Share created — link copied to clipboard.");
    } catch {
      toast.success("Share created.");
    }
    setRecipientEmail("");
    setRecipientLabel("");
    setPassword("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a share</CardTitle>
        <CardDescription>
          Pick how much protection the link needs. An email gate{" "}
          <strong>identifies</strong> the recipient — it does not authenticate
          them, so anyone who knows the address can open the link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={onSubmit}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="flex flex-col gap-2">
            <Label>Protection</Label>
            <Select
              value={protection}
              onValueChange={(v) => setProtection(v as Protection)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Anyone with the link</SelectItem>
                <SelectItem value="email">Only this email address</SelectItem>
                <SelectItem value="email_password">Email + password</SelectItem>
                <SelectItem value="password">Password only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="recipientEmail">
              Recipient email{needsEmail ? "" : " (not used)"}
            </Label>
            <Input
              id="recipientEmail"
              type="email"
              placeholder="jane@acme.com"
              value={recipientEmail}
              required={needsEmail}
              disabled={!needsEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="recipientLabel">Recipient label (optional)</Label>
            <Input
              id="recipientLabel"
              placeholder="Jane @ Acme"
              value={recipientLabel}
              onChange={(e) => setRecipientLabel(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">
              Password{needsPassword ? "" : " (not used)"}
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="off"
              value={password}
              required={needsPassword}
              disabled={!needsPassword}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Expires</Label>
            <Select value={expiresInDays} onValueChange={setExpiresInDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Never</SelectItem>
                <SelectItem value="1">In 1 day</SelectItem>
                <SelectItem value="7">In 7 days</SelectItem>
                <SelectItem value="30">In 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create share"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
