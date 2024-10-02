import { createLogger } from "@fibery/vizydrop-logger";

export const logger = createLogger({
  correlationId: {
    enabled: true,
    getCorrelationId: () => "",
    emptyValue: "nocorrelation",
  },
  mode: process.env.NODE_ENV,
  level: "debug",
});

export type Logger = typeof logger;
