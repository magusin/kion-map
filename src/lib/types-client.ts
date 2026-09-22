// Forme renvoyée par GET /api/plans
export type PlanSummary = {
  id: number;
  name: string;
  description: string | null;
  zones: { id: number; name: string; color: string }[];
  _count: { zones: number; devices: number };
};
