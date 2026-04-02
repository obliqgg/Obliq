import Link from "next/link";
import { verifyPaymentAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { ENTRY_MINT, ENTRY_MINT_SHORT, ENTRY_TOKEN_DISPLAY } from "@/lib/economy";
import { getPaymentForUser, getOrCreatePaymentIntent } from "@/lib/product";
import { buildSolanaPayUrl, getSolanaEntryConfig } from "@/lib/solana";

type EnterPageProps = {
  searchParams: Promise<{
    notice?: string;
  }>;
};

export default async function EnterPage({ searchParams }: EnterPageProps) {
  const { notice } = await searchParams;
  const user = await requireUser();
  const existingPayment = await getPaymentForUser(user.id);
  const payment = existingPayment ?? (await getOrCreatePaymentIntent(user.id));
  const config = getSolanaEntryConfig();
  const payUrl = buildSolanaPayUrl(payment.reference);

  return (
    <main className="page-shell">
      <section className="terminal-dashboard-shell">
        <div className="terminal-dashboard-screen">
          <div className="terminal-dashboard-block">
            <p className="eyebrow">Entry Console</p>
            <h1>{user.has_paid ? "Entry confirmed" : "Authorize season entry"}</h1>
            <p className="hero-body">
              {user.has_paid
                ? "This account already has entry access. You can return to the shell or inspect the wallet split."
                : `Send ${ENTRY_TOKEN_DISPLAY} using a Solana wallet that supports Solana Pay, then verify the transfer here.`}
            </p>

            <div className="terminal-dashboard-list">
              <div className="terminal-dashboard-row">
                <span>status</span>
                <strong>{payment.status}</strong>
              </div>
              <div className="terminal-dashboard-row">
                <span>reference</span>
                <strong>{payment.reference}</strong>
              </div>
              <div className="terminal-dashboard-row">
                <span>recipient</span>
                <strong>{config.recipient || "not configured"}</strong>
              </div>
              <div className="terminal-dashboard-row">
                <span>token mint</span>
                <strong>{ENTRY_MINT || config.tokenMint || "not configured"}</strong>
              </div>
              <div className="terminal-dashboard-row">
                <span>amount</span>
                <strong>{config.amount || ENTRY_TOKEN_DISPLAY}</strong>
              </div>
            </div>

            <div className="hero-actions">
              {user.has_paid ? (
                <Link href="/archon" className="primary-button">
                  Return to archon
                </Link>
              ) : payUrl && config.configured ? (
                <Link href={payUrl} className="primary-button">
                  Open wallet
                </Link>
              ) : (
                <span className="notice-strip">Entry payment config is missing on this deployment.</span>
              )}
              <form action={verifyPaymentAction}>
                <input type="hidden" name="paymentId" value={payment.id} />
                <button type="submit" className="ghost-button">
                  Check payment status
                </button>
              </form>
            </div>

            {notice ? <div className="notice-strip">{notice}</div> : null}
            {payment.confirmed_at ? (
              <div className="notice-strip">
                Confirmed at <strong>{new Date(payment.confirmed_at).toLocaleString()}</strong>.
              </div>
            ) : null}
          </div>

          <div className="terminal-dashboard-block">
            <div className="panel-heading">
              <p className="eyebrow">Mobile Flow</p>
              <h2>How to enter from a phone</h2>
            </div>
            <div className="announcement-list">
              <div className="announcement-row">
                <div>
                  <strong>1. Open wallet</strong>
                  <p>The primary button uses the Solana Pay deep link for Phantom, Solflare, and similar mobile wallets.</p>
                </div>
              </div>
              <div className="announcement-row">
                <div>
                  <strong>2. Approve transfer</strong>
                  <p>The reference key is embedded in the payment URL so the transfer can be matched onchain against the required mint.</p>
                </div>
              </div>
              <div className="announcement-row">
                <div>
                  <strong>3. Verify here</strong>
                  <p>Return to this screen and tap <code>Check payment status</code> to confirm the transfer and unlock the season.</p>
                </div>
              </div>
            </div>
            {payUrl ? (
              <div className="notice-strip">
                <strong>Solana Pay URL / mint {ENTRY_MINT_SHORT}</strong>
                <code>{payUrl}</code>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
