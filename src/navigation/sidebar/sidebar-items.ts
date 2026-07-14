import {
  Banknote,
  Boxes,
  Building2,
  ChartBar,
  FileText,
  LayoutDashboard,
  Lock,
  type LucideIcon,
  Package,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
  /** Role keys allowed to see this item. Empty/undefined = all roles. */
  roles?: string[];
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Main",
    items: [
      {
        id: "dashboard",
        title: "Dashboard",
        url: "/dashboard/default",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: 2,
    label: "Sales",
    items: [
      {
        id: "business-partners",
        title: "Business Partners",
        url: "/dashboard/business-partners",
        icon: Users,
      },
      {
        id: "sales-orders",
        title: "Sales Orders",
        url: "/dashboard/sales-orders",
        icon: ShoppingCart,
      },
      {
        id: "invoices",
        title: "Invoices",
        url: "/dashboard/invoices",
        icon: FileText,
      },
    ],
  },
  {
    id: 3,
    label: "Procurement",
    items: [
      {
        id: "purchase-orders",
        title: "Purchase Orders",
        url: "/dashboard/purchase-orders",
        icon: Truck,
      },
    ],
  },
  {
    id: 4,
    label: "Inventory",
    items: [
      {
        id: "products",
        title: "Products",
        url: "/dashboard/products",
        icon: Package,
      },
      {
        id: "warehouses",
        title: "Warehouses",
        url: "/dashboard/warehouses",
        icon: Boxes,
      },
    ],
  },
  {
    id: 5,
    label: "Finance",
    items: [
      {
        id: "payments",
        title: "Payments",
        url: "/dashboard/payments",
        icon: Banknote,
      },
      {
        id: "financial-reports",
        title: "Financial Reports",
        url: "/dashboard/financial-reports",
        icon: ChartBar,
      },
    ],
  },
  {
    id: 6,
    label: "Administration",
    items: [
      {
        id: "organization",
        title: "Organization",
        url: "/dashboard/organization",
        icon: Building2,
        roles: ["admin", "system"],
      },
      {
        id: "roles",
        title: "Roles & Permissions",
        url: "/dashboard/roles",
        icon: Lock,
        roles: ["admin", "system"],
      },
      {
        id: "users",
        title: "Users",
        url: "/dashboard/users",
        icon: Users,
        roles: ["admin", "system"],
      },
    ],
  },
];
