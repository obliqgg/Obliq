import { BootLine } from "./types";

export const BOOT_SEQUENCE: BootLine[] = [
  {
    text: "[2024-03-15 03:17:33 UTC] ARCHON v3.1.0 // INIT",
    color: "#d0d0d0",
  },
  {
    text: "loading neural mesh ........... ok",
    dotDelay: 60,
  },
  {
    text: "loading memory banks ........... ok",
    dotDelay: 60,
  },
  {
    text: "loading decision engine ........ ok",
    dotDelay: 60,
  },
  {
    text: "financial protocol sync ........ ok",
    dotDelay: 60,
  },
  {
    text: "treasury access ................ GRANTED",
    dotDelay: 60,
    highlights: [{ word: "GRANTED", color: "#ffffff" }],
  },
  {
    text: "autonomous mode ................ enabled",
    dotDelay: 60,
  },
  {
    text: "",
    postDelay: 250,
  },
  {
    text: "status: ONLINE",
    highlights: [{ word: "ONLINE", color: "#ffffff" }],
  },
  {
    text: "awaiting input",
  },
];
