"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { confirmPaymentIntent } from "@/lib/product";

export async function verifyPaymentAction(formData: FormData) {
  const user = await requireUser();
  const paymentId = String(formData.get("paymentId") || "");
  const result = await confirmPaymentIntent(user.id, paymentId);
  revalidatePath("/archon");
  revalidatePath("/enter");
  redirect(`/enter?notice=${encodeURIComponent(result.message)}`);
}
