import { httpRouter } from "convex/server";
import { auth } from "./auth";
import {
  httpUpdateQR,
  httpWhatsAppConnected,
  httpWhatsAppDisconnected,
  httpIncomingMessage,
} from "./whatsapp";

const http = httpRouter();

// Auth routes (required by @convex-dev/auth)
// NOTE: convex/http.ts must be DELETED — having both causes duplicate route error
auth.addHttpRoutes(http);

// ── WhatsApp bridge callbacks ─────────────────────────────────────────────
http.route({ path: "/api/updateQR",             method: "POST", handler: httpUpdateQR });
http.route({ path: "/api/whatsappConnected",    method: "POST", handler: httpWhatsAppConnected });
http.route({ path: "/api/whatsappDisconnected", method: "POST", handler: httpWhatsAppDisconnected });
http.route({ path: "/api/incomingMessage",      method: "POST", handler: httpIncomingMessage });

export default http;