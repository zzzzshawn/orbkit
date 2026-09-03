import { OrbGallery } from "@/components/orb-gallery";
import { orbRegistry } from "@/lib/registry-config";
import { getOrbSource } from "@/lib/source";

export default async function HomePage() {
  const items = await Promise.all(
    orbRegistry.map(async (orb) => ({
      slug: orb.slug,
      title: orb.title,
      description: orb.description,
      componentName: orb.componentName,
      // Read here rather than fetched when the drawer opens: the Manual tab
      // shows the exact text shadcn installs, and the drawer should not have a
      // loading state for content that is already on disk at build time.
      sourceCode: await getOrbSource(orb.fileName)
    }))
  );

  return <OrbGallery items={items} />;
}
