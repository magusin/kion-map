// Partagé client / serveur : pas d'import serveur ici.
export type Role = "VIEWER" | "MODERATOR" | "ADMIN";

export const ROLE_LEVEL: Record<Role, number> = { VIEWER: 1, MODERATOR: 2, ADMIN: 3 };

export const ROLE_LABELS: Record<Role, string> = {
  VIEWER: "Utilisateur",
  MODERATOR: "Modérateur",
  ADMIN: "Super admin",
};

export function hasRole(role: Role | undefined | null, min: Role): boolean {
  return !!role && ROLE_LEVEL[role] >= ROLE_LEVEL[min];
}

export type SessionUser = {
  id: number;
  username: string;
  displayName: string | null;
  role: Role;
};
