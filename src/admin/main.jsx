// Entry point for the admin console.
//
// A second Vite entry rather than a route inside the app (there is no router — see
// DECISIONS.md, "Modular React with no router"). The practical consequence is the
// one that matters: this is a separate bundle, so nothing here — the console, the
// bench, the probes — is downloaded by a client using Marketers Lab.
//
// No StrictMode. It double-invokes effects in development, and the bench's effects
// spend money on four providers; a duplicated run is a duplicated bill. The app
// keeps StrictMode because its effects only read localStorage.
import { createRoot } from "react-dom/client";
import "../index.css";
import AdminApp from "./AdminApp.jsx";

createRoot(document.getElementById("root")).render(<AdminApp />);
