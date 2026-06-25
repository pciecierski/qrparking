import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppBar, Box, Container, Tab, Tabs, Toolbar, Typography } from "@mui/material";

const NAV_TABS = [
  { path: "/", label: "Stan parkingu" },
  { path: "/miejsca", label: "Miejsca" },
  { path: "/kierowcy", label: "Rejestr Kierowców na placu" }
];

function resolveTab(pathname) {
  if (pathname.startsWith("/miejsca")) return "/miejsca";
  if (pathname.startsWith("/kierowcy")) return "/kierowcy";
  return "/";
}

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = resolveTab(location.pathname);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.100" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
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
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
