import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { Issuer, generators, type Client } from "openid-client";
import { CONFIG, type AppConfig } from "../../config";
import { PrismaService } from "../prisma/prisma.service";

const GOOGLE_ISSUER = "https://accounts.google.com";

type PendingAuth = { state: string; nonce: string; codeVerifier: string; returnTo: string; createdAt: number };

/**
 * Google OIDC (§12). No password path exists anywhere in this codebase.
 *
 * The library validates issuer, audience, signature, expiry and nonce; we add
 * the `email_verified` check, because an unverified Google email would let
 * someone claim an invitation addressed to another person.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private client: Client | null = null;
  /** Short-lived, single-use. In multi-instance deploys back this with Redis. */
  private readonly pending = new Map<string, PendingAuth>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private async getClient(): Promise<Client> {
    if (!this.config.googleConfigured) {
      throw new BadRequestException("Google sign-in is not configured on this deployment.");
    }
    if (!this.client) {
      const issuer = await Issuer.discover(GOOGLE_ISSUER);
      this.client = new issuer.Client({
        client_id: this.config.GOOGLE_CLIENT_ID,
        client_secret: this.config.GOOGLE_CLIENT_SECRET,
        redirect_uris: [this.config.GOOGLE_REDIRECT_URI],
        response_types: ["code"],
      });
    }
    return this.client;
  }

  async startLogin(returnTo: string): Promise<string> {
    const client = await this.getClient();
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();

    this.sweepPending();
    this.pending.set(state, { state, nonce, codeVerifier, returnTo, createdAt: Date.now() });

    return client.authorizationUrl({
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: generators.codeChallenge(codeVerifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  }

  async completeLogin(params: Record<string, string | undefined>) {
    const state = params.state;
    const flow = state ? this.pending.get(state) : undefined;
    // Consume immediately — an authorization code must never be replayable.
    if (state) this.pending.delete(state);
    if (!flow) throw new UnauthorizedException("Sign-in request expired. Please try again.");

    const client = await this.getClient();
    const tokenSet = await client.callback(
      this.config.GOOGLE_REDIRECT_URI,
      params,
      { state: flow.state, nonce: flow.nonce, code_verifier: flow.codeVerifier },
    );

    const claims = tokenSet.claims();
    if (!claims.email) throw new UnauthorizedException("Google did not return an email address.");
    if (claims.email_verified !== true) {
      throw new UnauthorizedException("Your Google email address is not verified.");
    }

    const user = await this.upsertUser({
      googleSubject: claims.sub,
      email: claims.email,
      name: (claims.name as string | undefined) ?? claims.email,
      avatarUrl: (claims.picture as string | undefined) ?? null,
    });

    return { user, returnTo: flow.returnTo };
  }

  /**
   * Google's `sub` is the stable identity — email can be reassigned within a
   * Workspace domain, so matching on it alone would hand an account to whoever
   * inherits the address.
   */
  async upsertUser(profile: { googleSubject: string; email: string; name: string; avatarUrl: string | null }) {
    const existing = await this.prisma.user.findUnique({ where: { googleSubject: profile.googleSubject } });
    if (existing) {
      if (existing.disabledAt) throw new UnauthorizedException("This account has been disabled.");
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          emailVerified: true,
          lastLoginAt: new Date(),
        },
      });
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      // Same verified address, different Google subject: adopt the new subject
      // rather than creating a duplicate account the invitations cannot find.
      this.logger.warn({ userId: byEmail.id }, "linking existing email to a new Google subject");
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleSubject: profile.googleSubject, name: profile.name, lastLoginAt: new Date() },
      });
    }

    return this.prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        googleSubject: profile.googleSubject,
        emailVerified: true,
        lastLoginAt: new Date(),
      },
    });
  }

  /**
   * Development-only sign-in so the lab workflow and E2E suite can run without
   * Google credentials. `loadConfig` refuses to boot with this enabled in
   * production, and the route 404s when the flag is off.
   */
  async devLogin(email: string, name: string) {
    if (!this.config.ALLOW_DEV_LOGIN) throw new BadRequestException("Dev login is disabled.");
    return this.upsertUser({
      googleSubject: `dev:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`,
      email,
      name,
      avatarUrl: null,
    });
  }

  /** Only accept relative paths — an absolute URL here is an open redirect. */
  safeReturnTo(raw: unknown): string {
    const value = typeof raw === "string" ? raw : "";
    return value.startsWith("/") && !value.startsWith("//") ? value : "/app";
  }

  private sweepPending() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of this.pending) if (value.createdAt < cutoff) this.pending.delete(key);
    // Bound the map regardless, so a flood of /auth/google cannot exhaust heap.
    if (this.pending.size > 5000) this.pending.clear();
  }

  newStateToken() {
    return randomBytes(16).toString("base64url");
  }
}
