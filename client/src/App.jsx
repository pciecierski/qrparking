import { Route, Routes } from "react-router-dom";
import MainLayout from "./layout/MainLayout.jsx";
import OccupancyPage from "./pages/OccupancyPage.jsx";
import SpotsPage from "./pages/SpotsPage.jsx";
import DriversPage from "./pages/DriversPage.jsx";
import PobranieAutaPage from "./pages/PobranieAutaPage.jsx";
import KierowcyPlacowiPage from "./pages/KierowcyPlacowiPage.jsx";
import WirtualnyParkingPage from "./pages/WirtualnyParkingPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<OccupancyPage />} />
        <Route path="/miejsca" element={<SpotsPage />} />
        <Route path="/kierowcy" element={<DriversPage />} />
        <Route path="/pobranie-auta" element={<PobranieAutaPage />} />
        <Route path="/kierowcy-placowi" element={<KierowcyPlacowiPage />} />
        <Route path="/wirtualnyparking" element={<WirtualnyParkingPage />} />
      </Route>
    </Routes>
  );
}
