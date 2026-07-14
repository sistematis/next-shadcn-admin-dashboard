"use client";

import * as React from "react";

import Link from "next/link";

import { Banknote, FileText, Package, ShoppingCart, TrendingUp, Users } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/idempiere";
import { getModels } from "@/lib/idempiere/client";

export default function DashboardDefaultPage() {
  const { token, session } = useAuth();
  const [stats, setStats] = React.useState<{ bp: number; products: number } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [bpResp, prodResp] = await Promise.all([
          getModels("c_bpartner", token, { top: 1 }),
          getModels("m_product", token, { top: 1 }),
        ]);
        if (!cancelled) {
          setStats({
            bp: bpResp["row-count"] ?? bpResp.records.length,
            products: prodResp["row-count"] ?? prodResp.records.length,
          });
        }
      } catch {
        // best effort — dashboard still renders
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">{session ? `Welcome back. Session active.` : "ERP overview"}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Business Partners"
          value={loading ? null : (stats?.bp ?? null)}
          href="/dashboard/business-partners"
        />
        <StatCard
          icon={Package}
          label="Products"
          value={loading ? null : (stats?.products ?? null)}
          href="/dashboard/products"
        />
        <StatCard icon={ShoppingCart} label="Sales Orders" value="—" href="/dashboard/sales-orders" />
        <StatCard icon={FileText} label="Invoices" value="—" href="/dashboard/invoices" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
          <CardDescription>Jump to common tasks</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <QuickLink href="/dashboard/business-partners" icon={Users} label="Business Partners" />
          <QuickLink href="/dashboard/products" icon={Package} label="Products" />
          <QuickLink href="/dashboard/sales-orders" icon={ShoppingCart} label="Sales Orders" />
          <QuickLink href="/dashboard/purchase-orders" icon={TrendingUp} label="Purchase Orders" />
          <QuickLink href="/dashboard/payments" icon={Banknote} label="Payments" />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string | null;
  href: string;
}) {
  return (
    <Link prefetch={false} href={href}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardDescription>{label}</CardDescription>
            <Icon className="size-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl tabular-nums">
            {value === null ? "…" : typeof value === "number" ? value.toLocaleString() : value}
          </CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link
      prefetch={false}
      href={href}
      className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50"
    >
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </Link>
  );
}
