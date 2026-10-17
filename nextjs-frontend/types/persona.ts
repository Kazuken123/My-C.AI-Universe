export interface UserPersona {
  id: string;
  userId?: string | null;
  name: string;
  avatar: string;
  description: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface PersonaCreatePayload {
  name: string;
  avatar?: string;
  description?: string;
  isDefault?: boolean;
}

export type PersonaUpdatePayload = Partial<PersonaCreatePayload>;
