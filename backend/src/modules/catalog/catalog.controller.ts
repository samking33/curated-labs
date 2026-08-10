import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthContext } from "../../common/guards/session.guard";
import { CatalogService } from "./catalog.service";

/** Catalog is public: browsing labs does not require an account. */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get("lab-categories")
  categories(@CurrentUser() user: AuthContext | undefined) {
    return this.catalog.listCategories(user);
  }

  @Public()
  @Get("labs")
  labs(@CurrentUser() user: AuthContext | undefined, @Query("category") category?: string) {
    return this.catalog.listLabs(user, { categorySlug: category });
  }

  @Public()
  @Get("labs/:labId")
  lab(@CurrentUser() user: AuthContext | undefined, @Param("labId") labId: string) {
    return this.catalog.getLab(user, labId);
  }

  @Public()
  @Get("labs/:labId/dfd")
  dfd(@Param("labId") labId: string) { return this.catalog.getDfd(labId); }
}
