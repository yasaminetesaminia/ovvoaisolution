import { redirect } from "next/navigation";

// Root → dashboard. Middleware sends unauthed users to /login first.
export default function Root() {
  redirect("/appointments");
}
