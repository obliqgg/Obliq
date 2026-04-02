import { StaticTerminalPage } from "@/components/static-terminal-page";

const lines = [
  "OBLIQ // DATA NOTICE",
  "last updated: 2026",
  "",
  "noctis labs collects the minimum required to operate this shell.",
  "",
  "what is collected:",
  "- your X identity, used for authentication only",
  "- your wallet address, used for entry and payout",
  "- solve timestamps, used for leaderboard and vault logic",
  "",
  "what is not collected:",
  "- personal identifying information beyond X handle",
  "- payment data beyond onchain transaction records",
  "",
  "data is not sold. data is not shared. data lives inside the machine.",
  "",
  "ARCHON does not forget. but ARCHON does not talk.",
  "",
  "type exit to return",
] as const;

export default function PrivacyPage() {
  return <StaticTerminalPage lines={lines} />;
}
