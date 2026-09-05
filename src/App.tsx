import { useState } from "react";
import { DataProvider } from "./store/DataContext";
import { Header } from "./components/Header";
import { Sidebar, MobileNav, NAV_ITEMS, type PageId } from "./components/Sidebar";
import { Footer } from "./components/Footer";
import { HomePage } from "./pages/HomePage";
import { BatteryPage } from "./pages/BatteryPage";
import { BmsPage } from "./pages/BmsPage";
import { SolarPage } from "./pages/SolarPage";
import { StatsPage } from "./pages/StatsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { EngineeringPage } from "./pages/EngineeringPage";

function Shell() {
  const [page, setPage] = useState<PageId>("home");
  const current = NAV_ITEMS.find((i) => i.id === page);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-scene" aria-hidden="true" />
      <Header />
      <MobileNav page={page} onNavigate={setPage} />
      <div className="flex flex-1 min-h-0">
        <Sidebar page={page} onNavigate={setPage} />
        <main className="flex-1 min-w-0">
          <div className="px-3 md:px-4 py-3.5 max-w-[1500px] mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="font-display font-semibold text-[15px] tracking-[0.08em] uppercase whitespace-nowrap">
                {current?.label ?? "SmartWatt"}
              </h1>
              <span className="h-px flex-1 bg-line" />
              <span className="num text-[10px] text-mut/70 hidden sm:inline">ESP32 Gateway · телеметрия в реальном времени</span>
            </div>
            <div key={page} className="page-anim pb-4">
              {page === "home" && <HomePage />}
              {page === "battery" && <BatteryPage />}
              {page === "bms" && <BmsPage />}
              {page === "solar" && <SolarPage />}
              {page === "stats" && <StatsPage />}
              {page === "settings" && <SettingsPage />}
              {page === "engineering" && <EngineeringPage />}
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}
