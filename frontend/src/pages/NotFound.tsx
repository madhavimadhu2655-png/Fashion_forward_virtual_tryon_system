import { Link } from "react-router-dom";
import { EmptyPanel } from "../components/ui";

export default function NotFound() {
  return (
    <div className="page max-w-3xl py-20">
      <EmptyPanel
        icon="search"
        title="This page isn't here"
        body="The link may be old or mistyped. Everything in the collection is one click away."
        action={
          <>
            <Link to="/shop" className="btn btn-primary">
              Browse crop tops
            </Link>
            <Link to="/" className="btn btn-ghost">
              Home
            </Link>
          </>
        }
      />
    </div>
  );
}
