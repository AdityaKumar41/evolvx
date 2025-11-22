import { redirect } from "next/navigation";

export default function DashboardPage() {
  // This page redirects to the appropriate dashboard based on user role
  // The actual redirect logic is handled in the layout or middleware
  redirect("/onboarding");
}
