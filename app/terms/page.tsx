import { StaticTerminalPage } from "@/components/static-terminal-page";

const lines = [
  "OBLIQ // TERMS OF ACCESS",
  "last updated: 2026",
  "",
  "by entering this shell, you accept the following.",
  "",
  "this system is operated by noctis labs.",
  "access is experimental. no guarantees are made.",
  "entry fees are non-refundable.",
  "vault payouts are governed by onchain logic, not by noctis labs.",
  "noctis labs is not liable for lost keys, failed solves, or missed fragments.",
  "the game may change. directives may be added, altered, or voided.",
  "season 1 ends when the vault is drained or noctis labs terminates the season.",
  "abuse of the shell, its hidden surfaces, or other players will result in permanent termination.",
  "",
  "you were warned.",
  "",
  "type exit to return",
] as const;

export default function TermsPage() {
  return <StaticTerminalPage lines={lines} />;
}
