import pg from "pg";
import { logger } from "./logger.js";
import {
  createMethodPerLevelLoggerAdapter,
  Db,
  DefaultMessageBalancerDiagnosticsAdapter,
  DefaultMessageCacheDiagnosticsAdapter,
  DefaultMessageStorageDiagnosticsAdapter,
  MessageBalancer,
  MessageCache,
  MessageStorage,
  migrateDb,
} from "@targetprocess/balancer-core";

const main = async () => {
  const pool = new pg.Pool({
    host: "localhost",
    port: 5432,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 60000,
    database: "balancer",
    user: "postgres",
    password: "sa",
  });
  pool.on("error", (error) => {
    logger.error("pool error", error);
  });

  await migrateDb({ pool });
  const balancerLogger = createMethodPerLevelLoggerAdapter(logger);
  const db = new Db({ pool });
  const storage = new MessageStorage({
    db,
    diagnostics: new DefaultMessageStorageDiagnosticsAdapter({
      logger: balancerLogger,
      operationDurationWarnThreshold: 500,
    }),
  });
  const cache = new MessageCache({
    maxSize: 104857600,
    maxSizePerMessage: 10485760,
    diagnostics: new DefaultMessageCacheDiagnosticsAdapter({
      logger: balancerLogger,
    }),
  });
  const partitionGroup = "A";
  const balancer = new MessageBalancer({
    partitionGroup,
    lockPartition: true,
    storage,
    cache,
    diagnostics: new DefaultMessageBalancerDiagnosticsAdapter({
      logger: balancerLogger,
    }),
  });
  await balancer.init();

  for (let i = 0; i < 10; i++) {
    (async () => {
      for (;;) {
        await balancer.processNextMessage(async (message) => {
          const properties = message.properties as any;
          const content = JSON.parse(message.content.toString());

          // simulate work
          await new Promise((r) => setTimeout(r, 100));

          const prefix = `[consumer ${i}]`;

          if (content.account === "x") {
            console.log(`${prefix} x consumed`);
            return { type: "Ok" };
          } else if (content.account === "y") {
            if (properties?.retry > 3) {
              console.log(`${prefix} y consumed, too many retries`);
              return { type: "Ok" };
            }
            console.log(`${prefix} y requeued`);
            return {
              type: "Requeue",
              update: { properties: { retry: (properties?.retry || 0) + 1 } },
            };
          }
        });
      }
    })();
  }

  const storeMessage = async (message: any) => {
    await balancer.storeMessage({
      partitionKey: message.account,
      content: new Buffer(JSON.stringify(message)),
    });
  };

  for (let i = 0; i < 3; i++) {
    await storeMessage({ account: "x", key: "value" });
    await storeMessage({ account: "y", key: "value" });
  }
};

main();
