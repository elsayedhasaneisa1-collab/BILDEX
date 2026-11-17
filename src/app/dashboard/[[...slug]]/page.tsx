import { DashboardView } from "@/components/dashboard-view";
import { ensureSeed } from "@/db/seed";

export const metadata = { robots: { index: false, follow: false }, title: "Dashboard" };

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  await ensureSeed();
  const { slug = [] } = await params;
  return <DashboardView section={slug[0] || "overview"} id={slug[1]} />;
}
