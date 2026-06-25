import { Route, Routes } from "react-router-dom";
import MainLayout from "./layout/MainLayout.jsx";
import OccupancyPage from "./pages/OccupancyPage.jsx";
import SpotsPage from "./pages/SpotsPage.jsx";
import DriversPage from "./pages/DriversPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<OccupancyPage />} />
        <Route path="/miejsca" element={<SpotsPage />} />
        <Route path="/kierowcy" element={<DriversPage />} />
      </Route>
    </Routes>
  );
}
