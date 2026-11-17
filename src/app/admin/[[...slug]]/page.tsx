import { AdminView } from "@/components/admin-view";
import { ensureSeed } from "@/db/seed";

export const metadata = { robots: { index: false, follow: false }, title: "Command Center" };

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  await ensureSeed();
  const { slug = [] } = await params;
  return <AdminView section={slug[0] || "overview"} />;
}
