import EmptyState from "../components/EmptyState";

export default function Orders() {
  return (
    <EmptyState
      tone="saffron"
      title="Your orders"
      body="Order history isn't built yet. This page exists so the route and authentication are ready for it."
      cta={{ to: "/shop", label: "Keep shopping" }}
    />
  );
}
