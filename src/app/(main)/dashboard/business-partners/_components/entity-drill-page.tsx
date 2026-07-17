"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { useWindowTabsCached } from "@/lib/idempiere/entity-hooks";

import { EntityFormPage } from "./entity-form-page";

// ponytail: catch-all drill parser. Route `/[headerId]/[...drill]` where drill is
// (tabSlug, id|"new") pairs — last pair is the entity, the rest are ancestors.
// The header (the [id] param) is always the first ancestor (parent FK + breadcrumb root).
interface EntityDrillPageProps {
  windowSlug: string;
  basePath: string;
  title: string;
  headerId: number;
  drill: string[];
}

interface DrillSegment {
  tabSlug: string;
  id: number;
}

export function EntityDrillPage({ windowSlug, basePath, title, headerId, drill }: EntityDrillPageProps) {
  const router = useRouter();
  const { data: tabsData, isPending } = useWindowTabsCached(windowSlug);
  const tabs = tabsData?.tabs ?? [];

  // ponytail: chunk drill into (tabSlug, id|new) pairs
  const pairs: { tabSlug: string; id: string }[] = [];
  for (let i = 0; i + 1 < drill.length; i += 2) {
    pairs.push({ tabSlug: drill[i], id: drill[i + 1] });
  }
  const dangling = drill.length % 2 === 1; // trailing tabSlug with no id — no grid route exists

  // odd-length drill → redirect up to the last valid entity
  React.useEffect(() => {
    if (drill.length % 2 !== 1) return;
    const segs: DrillSegment[] = [];
    for (let i = 0; i + 1 < drill.length; i += 2) {
      segs.push({ tabSlug: drill[i], id: Number(drill[i + 1]) });
    }
    router.replace(routeFor(basePath, headerId, segs));
  }, [drill, basePath, headerId, router]);

  if (dangling || isPending || tabs.length === 0) {
    return <Skeleton className="h-9 w-full" />;
  }

  const current = pairs[pairs.length - 1];
  const isCreate = current?.id === "new";
  const currentTab = tabs.find((t) => t.slug === current?.tabSlug);

  // ancestor chain = header (from [id]) + intermediate pairs (exclude current)
  const headerSlug = tabsData?.headerTab?.slug;
  const intermediate = pairs.slice(0, -1).map((p) => ({ tabSlug: p.tabSlug, id: Number(p.id) }));
  const drillPath: DrillSegment[] = headerSlug
    ? [{ tabSlug: headerSlug, id: headerId }, ...intermediate]
    : intermediate;

  if (!currentTab?.tableName) {
    return <p className="text-muted-foreground text-sm">Tab not found (admin access may be required).</p>;
  }

  return (
    <EntityFormPage
      windowSlug={windowSlug}
      modelName={currentTab.tableName}
      basePath={basePath}
      title={title}
      entityId={isCreate ? undefined : current.id}
      tabSlug={currentTab.slug}
      drillPath={drillPath}
    />
  );
}

/** Route for a header + chain of (tabSlug,id) segments: header → basePath/{headerId}, then /{tabSlug}/{id}. */
function routeFor(basePath: string, headerId: number, segs: DrillSegment[]): string {
  let route = `${basePath}/${headerId}`;
  for (const s of segs) {
    route = `${route}/${s.tabSlug}/${s.id}`;
  }
  return route;
}
