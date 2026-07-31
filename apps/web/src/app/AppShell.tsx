import { PERMISSIONS, type Permission } from "@verilot/contracts";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router";

import { useSession } from "../auth/SessionProvider.js";
import { moveKeyboardPosition } from "../lib/keyboard.js";

interface NavigationItem {
  label: string;
  path: string;
  permission: Permission;
}

const navigationItems: readonly NavigationItem[] = [
  { label: "Dashboard", path: "/dashboard", permission: PERMISSIONS.dashboardRead },
  { label: "Products", path: "/products", permission: PERMISSIONS.productsRead },
  { label: "Batches", path: "/batches", permission: PERMISSIONS.batchesRead },
  { label: "Alerts", path: "/alerts", permission: PERMISSIONS.alertsRead },
  { label: "Recalls", path: "/recalls", permission: PERMISSIONS.recallsRead },
  { label: "Locations", path: "/locations", permission: PERMISSIONS.locationsRead },
  { label: "Audit", path: "/audit", permission: PERMISSIONS.auditRecordsRead },
];

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function Navigation({ closeMenu, label }: { closeMenu?: () => void; label: string }) {
  const { hasPermission } = useSession();

  return (
    <nav aria-label={label}>
      <ul className="nav-list">
        {navigationItems
          .filter((item) => hasPermission(item.permission))
          .map((item) => (
            <li key={item.path}>
              <NavLink
                className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}
                onClick={closeMenu}
                to={item.path}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
      </ul>
    </nav>
  );
}

function Brand() {
  return (
    <NavLink aria-label="VeriLot dashboard" className="brand-lockup shell-brand" to="/dashboard">
      <span className="brand-mark" aria-hidden="true">
        VL
      </span>
      <span>VeriLot</span>
    </NavLink>
  );
}

export function AppShell() {
  const { session, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        moveKeyboardPosition(menuButton.current);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  if (session === null) {
    return null;
  }

  async function handleSignOut(): Promise<void> {
    setSignOutError(null);

    try {
      await signOut();
    } catch {
      setSignOutError("Sign-out could not be completed. Try again.");
    }
  }

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className="sidebar">
        <Brand />
        <Navigation label="Primary navigation" />
        <div className="account-panel">
          <strong>{session.user.displayName}</strong>
          <span>{session.user.organization.name}</span>
          <span className="role-badge">{roleLabel(session.user.role)}</span>
          <button
            className="button button-secondary"
            onClick={() => void handleSignOut()}
            type="button"
          >
            Sign out
          </button>
          <p aria-live="polite" className="form-error">
            {signOutError}
          </p>
        </div>
      </aside>

      <header className="mobile-header">
        <Brand />
        <button
          aria-controls="mobile-menu"
          aria-expanded={menuOpen}
          className="menu-button"
          onClick={() => setMenuOpen((current) => !current)}
          ref={menuButton}
          type="button"
        >
          <span aria-hidden="true">☰</span>
          <span>Menu</span>
        </button>
      </header>

      {menuOpen ? (
        <div
          aria-label="Mobile menu"
          className="mobile-drawer surface"
          id="mobile-menu"
          role="region"
        >
          <Navigation closeMenu={() => setMenuOpen(false)} label="Mobile navigation" />
          <div className="mobile-account">
            <strong>{session.user.displayName}</strong>
            <span>{session.user.organization.name}</span>
            <span className="role-badge">{roleLabel(session.user.role)}</span>
            <button
              className="button button-secondary"
              onClick={() => void handleSignOut()}
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      <main className="app-content" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
