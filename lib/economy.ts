export const ENTRY_AMOUNT = process.env.ENTRY_AMOUNT?.trim() || "XXX,XXX";
export const ENTRY_MINT = process.env.ENTRY_MINT?.trim() || "";
export const ENTRY_RECIPIENT = process.env.ENTRY_RECIPIENT?.trim() || "";

function shortenMint(mint: string) {
  if (!mint) {
    return "mint-unset";
  }
  if (mint.length <= 12) {
    return mint;
  }
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

export const ENTRY_MINT_SHORT = shortenMint(ENTRY_MINT);
export const ENTRY_TOKEN_DISPLAY = `${ENTRY_AMOUNT} tokens`;
export const ENTRY_TOKEN_SHORT = ENTRY_AMOUNT;
export const ENTRY_MODEL_NOTE =
  "Season entry uses a fixed SPL-token amount tied to a specific mint address. The mint address is the token identity.";
