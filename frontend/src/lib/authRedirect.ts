export function getPostAuthRedirect(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) return "/";
  const from = state.from;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}
