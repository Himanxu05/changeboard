import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { DetailPage, ListPage, LoginPage, NewChangePage } from "./pages";
import "./styles.css";

function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  return user ? children : <Navigate to="/login" replace />;
}

function Shell() {
  const { user, logout } = useAuth();
  return (
    <>
      <header>
        <Link to="/" className="brand">
          ChangeBoard
        </Link>
        {user && (
          <span>
            {user.name} ({user.role}) <button onClick={logout}>Sign out</button>
          </span>
        )}
      </header>
      <main>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireUser><ListPage /></RequireUser>} />
          <Route path="/new" element={<RequireUser><NewChangePage /></RequireUser>} />
          <Route path="/changes/:id" element={<RequireUser><DetailPage /></RequireUser>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
