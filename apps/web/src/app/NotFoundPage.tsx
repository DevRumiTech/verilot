import { Link } from "react-router";

import { BrandMark } from "./BrandMark.js";

export function NotFoundPage() {
  return (
    <main className="site-main" id="main-content">
      <section className="surface welcome" aria-labelledby="not-found-title">
        <BrandMark />
        <p className="eyebrow">404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p>The requested VeriLot page does not exist.</p>
        <Link className="text-link" to="/">
          Return to the start
        </Link>
      </section>
    </main>
  );
}
