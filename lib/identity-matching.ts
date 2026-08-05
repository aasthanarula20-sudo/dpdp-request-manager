import { getServiceClient } from "./supabase/server";

export interface MatchedContact {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  legal_basis: "consent" | "legal_obligation" | "contract";
  consent_marketing: boolean;
  is_anonymized: boolean;
}

/**
 * Exact match only against crm_contacts.email / .phone. No fuzzy matching.
 * Email match takes priority; falls back to phone if no email match.
 */
export async function matchContact(
  email: string,
  phone?: string | null
): Promise<MatchedContact | null> {
  const supabase = getServiceClient();

  const normalizedEmail = email.trim().toLowerCase();

  const { data: byEmail, error: emailError } = await supabase
    .from("crm_contacts")
    .select("id, full_name, email, phone, legal_basis, consent_marketing, is_anonymized")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (emailError) throw emailError;
  if (byEmail) return byEmail as MatchedContact;

  if (phone) {
    const { data: byPhone, error: phoneError } = await supabase
      .from("crm_contacts")
      .select("id, full_name, email, phone, legal_basis, consent_marketing, is_anonymized")
      .eq("phone", phone.trim())
      .limit(1)
      .maybeSingle();

    if (phoneError) throw phoneError;
    if (byPhone) return byPhone as MatchedContact;
  }

  return null;
}
