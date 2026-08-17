import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthContext } from "../../common/guards/session.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AssistantService } from "./assistant.service";

/**
 * Bounds are the point of this schema: an unbounded message array or an
 * unbounded string would let one request drive an arbitrarily large: and
 * arbitrarily expensive: model call.
 */
const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

@Controller("assistant")
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  // Authenticated by the global SessionGuard; CSRF is enforced there too.
  @Post("chat")
  async chat(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(chatSchema)) body: z.infer<typeof chatSchema>,
  ) {
    return this.assistant.reply(user.userId, body.messages);
  }
}
