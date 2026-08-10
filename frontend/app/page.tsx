import { redirect } from "next/navigation";

/**
 * The root is just an entry point. `/app` is the dashboard and already makes
 * the rest of the decision — signed-out visitors go to /login, half-onboarded
 * ones to /onboarding — so there is nothing worth checking twice here.
 *
 * This used to point at /app/catalog, from before the dashboard existed.
 */
export default function Root() {
  redirect("/app");
}
