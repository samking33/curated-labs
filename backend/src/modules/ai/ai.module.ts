import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { NimClient } from "./nim-client";
import { AnthropicClient } from "./anthropic-client";

@Module({
  providers: [AiService, NimClient, AnthropicClient],
  exports: [AiService, NimClient, AnthropicClient],
})
export class AiModule {}
