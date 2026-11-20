export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

export interface Membership {
  businessId: string;
  businessName: string;
  timezone: string;
  role: 'owner' | 'admin' | 'professional';
  professionalId: string | null;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  displayName: string;
}

export interface PublicBusiness {
  id: string;
  name: string;
  timezone: string;
  sector?: string | null;
  address?: string | null;
}
