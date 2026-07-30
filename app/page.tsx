import { OrbGallery } from "@/components/orb-gallery";
import { orbRegistry } from "@/lib/registry-config";

export default function HomePage() {
  const items = orbRegistry.map((orb) => ({
    slug: orb.slug,
    title: orb.title,
    description: orb.description,
    componentName: orb.componentName
  }));

  return <OrbGallery items={items} />;
}
