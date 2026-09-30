import { PaduaMark } from "@/components/shell/padua-mark"

/** The narrow card sign-in and sign-up sit in (V7.6.5a). */
export function AuthCard({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md space-y-6 pt-2 md:pt-6">
      <div className="space-y-2 text-center">
        <PaduaMark size={36} className="mx-auto" />
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="widget p-5 sm:p-6">{children}</div>
    </div>
  )
}

/** Shown in place of the forms when the deployment has no accounts database (no DATABASE_URL). */
export function AccountsUnavailable() {
  return (
    <div role="status" className="space-y-2 text-[14px] leading-relaxed">
      <p className="font-medium">Accounts aren&apos;t set up on this deployment yet.</p>
      <p className="text-muted-foreground">Everything else in Padua works without an account: the public hospital data is open to everyone.</p>
    </div>
  )
}
