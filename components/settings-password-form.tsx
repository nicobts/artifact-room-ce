"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";

export function SettingsPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [revokeOthers, setRevokeOthers] = useState(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const currentPassword = String(form.get("current-password") ?? "");
    const newPassword = String(form.get("new-password") ?? "");
    const confirm = String(form.get("confirm-new-password") ?? "");

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      toast.error("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: revokeOthers,
      });
      if (error) {
        toast.error(error.message ?? "Could not change the password.");
        return;
      }
      toast.success("Password changed.");
      formEl.reset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Use at least 8 characters. Changing it here does not sign you out on
          this device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="current-password">
                Current password
              </FieldLabel>
              <PasswordInput
                id="current-password"
                name="current-password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <PasswordInput
                  id="new-password"
                  name="new-password"
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-new-password">
                  Confirm new password
                </FieldLabel>
                <PasswordInput
                  id="confirm-new-password"
                  name="confirm-new-password"
                  autoComplete="new-password"
                  required
                />
              </Field>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="revoke-others"
                checked={revokeOthers}
                onCheckedChange={(v) => setRevokeOthers(v === true)}
              />
              <FieldLabel htmlFor="revoke-others" className="font-normal">
                Sign out other devices
              </FieldLabel>
            </Field>
            <Field>
              <Button type="submit" disabled={loading} className="sm:self-start">
                {loading && <Spinner />}
                {loading ? "Changing…" : "Change password"}
              </Button>
              <FieldDescription>
                Forgot your current password? Ask your instance operator to
                help you recover access.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
