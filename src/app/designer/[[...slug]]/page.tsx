import { DesignerView } from "@/components/designer-view";
import { ensureSeed } from "@/db/seed";

export const metadata = { robots: { index: false, follow: false }, title: "Designer desk" };

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  await ensureSeed();
  const { slug = [] } = await params;
  return <DesignerView section={slug[0] || "overview"} />;
}
