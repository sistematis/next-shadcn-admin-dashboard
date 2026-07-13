import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "ERP Sistematis",
  version: packageJson.version,
  copyright: `© ${currentYear}, Sistematis.id.`,
  meta: {
    title: "ERP Sistematis — Business Management Dashboard",
    description:
      "ERP Sistematis is a modern ERP frontend built on iDempiere REST API, Next.js 16, Tailwind CSS v4, and shadcn/ui.",
  },
};
