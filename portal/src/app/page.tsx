import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// /portal root — redirect to dashboard or login
export default async function PortalRoot() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
