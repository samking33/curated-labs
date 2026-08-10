import { Global, Module } from "@nestjs/common";
import { CONFIG, loadConfig } from "./index";

/**
 * Global so every feature module can inject CONFIG without importing it.
 * Parsed once at boot — loadConfig throws on invalid configuration, which is
 * what turns a missing SESSION_SECRET into a failed start instead of a hole.
 */
@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => loadConfig() }],
  exports: [CONFIG],
})
export class ConfigModule {}
