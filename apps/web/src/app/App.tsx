import { Link, Route, Routes } from "react-router-dom";

function HomePage() {
  return (
    <main className="site-main" id="main-content">
      <section className="surface welcome" aria-labelledby="welcome-title">
        <span className="brand-mark" aria-hidden="true">
          VL
        </span>
        <p className="eyebrow">Product traceability</p>
        <h1 id="welcome-title">VeriLot</h1>
        <p>Secure operational oversight for products, batches, custody, alerts, and recalls.</p>
      </section>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="site-main" id="main-content">
      <section className="surface welcome" aria-labelledby="not-found-title">
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

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
