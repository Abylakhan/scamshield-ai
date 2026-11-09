import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { AnimatedBackground, CursorGlow, PageTransition } from "./lib/motion";
import { installRipple } from "./lib/ripple";
import { CommandPalette } from "./components/CommandPalette";
import { AiSettings } from "./components/AiSettings";
import { FeedbackProvider } from "./components/Feedback";
import { RouteLoader } from "./components/RouteLoader";
import "./index.css";
import { I18nProvider } from "./lib/i18n";
import { AppLayout } from "./components/AppLayout";
import Landing from "./pages/Landing";
const Dashboard = lazy(() => import("./pages/Dashboard"));
import Analyzer from "./pages/Analyzer";
const Intel = lazy(() => import("./pages/Intel"));
const HistoryPage = lazy(() => import("./pages/History"));
const ReportPage = lazy(() => import("./pages/Report"));
const Learn = lazy(() => import("./pages/Learn"));
const Demo = lazy(() => import("./pages/Demo"));
const CallGuard = lazy(() => import("./pages/CallGuard"));

const P = (el: React.ReactNode) => <PageTransition>{el}</PageTransition>;
// Heavier pages (charts, report views) load on demand; the landing page and analyzer stay in the main bundle.
const L = (el: React.ReactNode) => <Suspense fallback={<RouteLoader />}>{el}</Suspense>;

function AnimatedRoutes() {
  const location = useLocation();
  // Landing and the app shell animate as two top-level scenes; app pages animate inside the shell.
  const scene = location.pathname === "/" ? "landing" : "app";
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={scene}>
        <Route path="/" element={P(<Landing />)} />
        <Route element={<AppLayout />}>
          <Route path="/analyze" element={<Analyzer />} />
          <Route path="/dashboard" element={L(<Dashboard />)} />
          <Route path="/intel" element={L(<Intel />)} />
          <Route path="/history" element={L(<HistoryPage />)} />
          <Route path="/history/:id" element={L(<ReportPage />)} />
          <Route path="/learn" element={L(<Learn />)} />
          <Route path="/demo" element={L(<Demo />)} />
          <Route path="/call-guard" element={L(<CallGuard />)} />
          <Route path="*" element={<Analyzer />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

installRipple();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <I18nProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AnimatedBackground />
          <CursorGlow />
          <FeedbackProvider>
            <AnimatedRoutes />
            <CommandPalette />
            <AiSettings />
          </FeedbackProvider>
        </BrowserRouter>
      </I18nProvider>
    </MotionConfig>
  </React.StrictMode>,
);
