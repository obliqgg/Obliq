const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array) {
  if (bytes.length === 0) {
    return "";
  }

  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }

    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) {
    leadingZeroes += 1;
  }

  let output = "1".repeat(leadingZeroes);
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    output += BASE58_ALPHABET[digits[index]];
  }
  return output;
}

function normalizeUiAmount(value: string) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

type RpcTransactionResponse = {
  blockTime?: number | null;
  transaction?: {
    message?: {
      instructions?: Array<{
        program?: string;
        parsed?: {
          type?: string;
          info?: Record<string, unknown>;
        };
      }>;
    };
  };
};

type ParsedInstruction = {
  program?: string;
  parsed?: {
    type?: string;
    info?: Record<string, unknown>;
  };
};

export function getSolanaEntryConfig() {
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
  const recipient = process.env.ENTRY_RECIPIENT?.trim() || "";
  const tokenMint = process.env.ENTRY_MINT?.trim() || "";
  const amount = process.env.ENTRY_AMOUNT?.trim() || "";
  const label = process.env.OBLIQ_ENTRY_LABEL?.trim() || "Obliq Season 1";
  const message = process.env.OBLIQ_ENTRY_MESSAGE?.trim() || "Season entry";

  return {
    rpcUrl,
    recipient,
    tokenMint,
    amount,
    label,
    message,
    configured: Boolean(recipient && tokenMint && amount),
  };
}

export function createSolanaReference() {
  return encodeBase58(crypto.getRandomValues(new Uint8Array(32)));
}

export function buildSolanaPayUrl(reference: string) {
  const config = getSolanaEntryConfig();
  if (!config.configured) {
    return null;
  }

  const params = new URLSearchParams({
    amount: config.amount,
    "spl-token": config.tokenMint,
    reference,
    label: config.label,
    message: config.message,
    memo: `obliq-entry:${reference}`,
  });

  return `solana:${config.recipient}?${params.toString()}`;
}

async function rpc<T>(method: string, params: unknown[]) {
  const { rpcUrl } = getSolanaEntryConfig();
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: method,
      method,
      params,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Solana RPC request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (payload.error) {
    throw new Error(payload.error.message || "Unknown Solana RPC error");
  }

  return payload.result;
}

function instructionMatchesPayment(
  instruction: ParsedInstruction,
  recipient: string,
  tokenMint: string,
  amount: string
) {
  const parsed = instruction.parsed;
  if (!parsed?.info || instruction.program !== "spl-token") {
    return false;
  }

  const info = parsed.info as Record<string, unknown>;
  if (String(info.destination || "") !== recipient) {
    return false;
  }

  if (info.mint && String(info.mint) !== tokenMint) {
    return false;
  }

  const tokenAmount = info.tokenAmount as { uiAmountString?: string } | undefined;
  const parsedAmount = tokenAmount?.uiAmountString ?? (info.amount ? String(info.amount) : "");
  const expectedUiAmount = normalizeUiAmount(amount);
  const observedUiAmount = normalizeUiAmount(parsedAmount);

  if (expectedUiAmount == null || observedUiAmount == null) {
    return parsedAmount === amount;
  }

  return Math.abs(observedUiAmount - expectedUiAmount) < 1e-9;
}

export async function findConfirmedEntryTransfer(reference: string) {
  const config = getSolanaEntryConfig();
  if (!config.configured) {
    return null;
  }

  const signatures = await rpc<Array<{ signature: string }>>("getSignaturesForAddress", [
    reference,
    { limit: 5 },
  ]);

  if (!signatures?.length) {
    return null;
  }

  for (const signatureInfo of signatures) {
    const transaction = await rpc<RpcTransactionResponse>("getTransaction", [
      signatureInfo.signature,
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ]);

    const instructions = transaction?.transaction?.message?.instructions || [];
    const matched = instructions.some((instruction) =>
      instructionMatchesPayment(instruction, config.recipient, config.tokenMint, config.amount)
    );

    if (matched) {
      return {
        signature: signatureInfo.signature,
        confirmedAt: transaction?.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : null,
      };
    }
  }

  return null;
}
