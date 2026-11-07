export const ACTION_RULE_CONFIG_V1 = {
  version: "action-rules.v1",
  supervisorQualityThreshold: 35,
  coachingQualityThreshold: 75,
  serviceRecoverySentimentThreshold: -0.45,
  technicalIntentPattern: /technical|system|platform|application|app|login|payment|terminal|технич|систем|прилож|платформ|терминал/i
} as const;
