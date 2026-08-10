import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { NimClient } from "./nim-client";

@Module({ providers: [AiService, NimClient], exports: [AiService, NimClient] })
export class AiModule {}
