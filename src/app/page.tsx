import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/session";

export default async function Home() {
  const active = await getActiveSession();
  redirect(active ? "/app" : "/sign-in");
}
