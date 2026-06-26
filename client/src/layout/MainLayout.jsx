import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Tab,
  Tabs,
  Toolbar,
  Typography
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";

const NAV_TABS = [
  { path: "/", label: "Stan parkingu" },
  { path: "/miejsca", label: "Miejsca" },
  { path: "/kierowcy", label: "Auta na Placu" }
];

const MODULE_LINKS = [
  { path: "/pobranie-auta", label: "Pobranie auta" },
  { path: "/kierowcy-placowi", label: "Kierowcy placowi" }
];

function resolveTab(pathname) {
  if (
    pathname.startsWith("/pobranie-auta") ||
    pathname.startsWith("/kierowcy-placowi") ||
    pathname.startsWith("/wirtualnyparking")
  ) {
    return false;
  }
  if (pathname.startsWith("/miejsca")) return "/miejsca";
  if (pathname.startsWith("/kierowcy")) return "/kierowcy";
  return "/";
}

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = resolveTab(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  const goToModule = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.100" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            aria-label="Menu modułów"
            onClick={() => setMenuOpen(true)}
            sx={{ mr: 1 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            QR Parking
          </Typography>
        </Toolbar>
        <Tabs
          value={tab}
          onChange={(_e, value) => navigate(value)}
          textColor="inherit"
          indicatorColor="secondary"
          sx={{
            px: 2,
            minHeight: 48,
            "& .MuiTab-root": {
              minHeight: 48,
              py: 1.25,
              px: 2.5,
              mx: 0.25,
              opacity: 0.72,
              fontWeight: 500,
              fontSize: "0.95rem",
              textTransform: "none",
              borderRadius: "8px 8px 0 0",
              transition: "background-color 0.15s ease, opacity 0.15s ease"
            },
            "& .MuiTab-root.Mui-selected": {
              opacity: 1,
              fontWeight: 700,
              bgcolor: "rgba(255, 255, 255, 0.22)"
            },
            "& .MuiTab-root:hover": {
              opacity: 1,
              bgcolor: "rgba(255, 255, 255, 0.1)"
            },
            "& .MuiTabs-indicator": {
              height: 4,
              borderRadius: "4px 4px 0 0",
              bgcolor: "#fff"
            }
          }}
        >
          {NAV_TABS.map((item) => (
            <Tab key={item.path} label={item.label} value={item.path} />
          ))}
        </Tabs>
      </AppBar>

      <Drawer anchor="left" open={menuOpen} onClose={() => setMenuOpen(false)}>
        <Box sx={{ width: 280, pt: 1 }} role="presentation">
          <Typography variant="subtitle2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
            Moduły
          </Typography>
          <List dense>
            {MODULE_LINKS.map((item) => (
              <ListItemButton
                key={item.path}
                selected={location.pathname === item.path}
                onClick={() => goToModule(item.path)}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
          <Divider sx={{ my: 1 }} />
          <Typography variant="subtitle2" color="text.secondary" sx={{ px: 2, py: 1 }}>
            QR Parking
          </Typography>
          <List dense>
            {NAV_TABS.map((item) => (
              <ListItemButton
                key={item.path}
                selected={location.pathname === item.path}
                onClick={() => goToModule(item.path)}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
