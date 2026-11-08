const FREEDOM_CODES: Record<string, string> = {
  "freedom-criterion-01": "contact",
  "freedom-criterion-02": "discovery",
  "freedom-criterion-03": "identification",
  "freedom-criterion-04": "consultation",
  "freedom-criterion-05": "empathy",
  "freedom-criterion-06": "dialogue",
  "freedom-criterion-07": "closure",
  "freedom-criterion-08": "critical"
};

export function organizerCode(criterion: { id: string; code: string }): string {
  return FREEDOM_CODES[criterion.id] ?? criterion.code;
}
