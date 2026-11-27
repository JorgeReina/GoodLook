export interface Membership {
  businessId: string;
  businessName: string;
  timezone: string;
  role: 'owner' | 'admin' | 'professional';
  professionalId: string | null;
}
