import Link from "next/link"
import { SignupForm } from "@/components/signup-form"
import { Logo } from "@/components/logo"

export default function SignupPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <Logo className="size-7 text-primary" />
          Artifact Room
        </Link>
        <SignupForm />
      </div>
    </div>
  )
}
