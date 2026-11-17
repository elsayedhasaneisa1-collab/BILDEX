import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { ensureSeed } from "@/db/seed";
import { maintenanceOn } from "@/lib/admin";
import { getSessionUser } from "@/lib/auth";
import { getLang } from "@/lib/lang";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  await ensureSeed();
  const lang = await getLang();
  const maintenance = await maintenanceOn();
  const user = await getSessionUser();
  if (maintenance.enabled && !user) {
    return <main id="content" className="hero"><div className="section"><h1 className="display">Maintenance</h1><p>{maintenance.message || "BUILDEX is briefly closed for maintenance."}</p></div></main>;
  }
  return (
    <>
      <SiteHeader lang={lang} />
      <main id="content">{children}</main>
      <SiteFooter lang={lang} />
    </>
  );
}
