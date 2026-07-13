import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard/business-partners");
  return <>Coming Soon</>;
}
