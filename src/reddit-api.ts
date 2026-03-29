/**
 * Reddit API client — OAuth2 password grant, token caching, rate limit handling.
 */

const AUTH_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";

interface TokenData {
  access_token: string;
  expires_at: number;
}

export class RedditClient {
  private clientId: string;
  private clientSecret: string;
  private username: string;
  private password: string;
  private userAgent: string;

  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  }) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.username = config.username;
    this.password = config.password;
    this.userAgent = `mcp:reddit-content:v1.0 (by /u/${this.username})`;
  }

  async authenticate(): Promise<void> {
    const credentials = btoa(`${this.clientId}:${this.clientSecret}`);

    const resp = await fetch(AUTH_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this.userAgent,
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: this.username,
        password: this.password,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Reddit auth failed (${resp.status}): ${body}`);
    }

    const data = (await resp.json()) as Record<string, unknown>;

    if (data.error) {
      throw new Error(`Reddit auth error: ${data.error}`);
    }

    this.accessToken = data.access_token as string;
    this.expiresAt =
      Date.now() / 1000 + ((data.expires_in as number) || 3600);
  }

  private async ensureToken(): Promise<string> {
    // Re-auth if token expires within 5 minutes
    if (!this.accessToken || this.expiresAt < Date.now() / 1000 + 300) {
      await this.authenticate();
    }
    return this.accessToken!;
  }

  async get(
    endpoint: string,
    params?: Record<string, string>
  ): Promise<Record<string, unknown>> {
    const token = await this.ensureToken();

    let url = `${API_BASE}${endpoint}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": this.userAgent,
      },
    });

    if (resp.status === 429) {
      const retryAfter = resp.headers.get("Retry-After") || "60";
      throw new Error(
        `Reddit rate limited. Retry after ${retryAfter}s. Please wait and try again.`
      );
    }

    if (resp.status === 403) {
      throw new Error(
        "Reddit returned 403 Forbidden. The subreddit may be private or quarantined."
      );
    }

    if (resp.status === 404) {
      throw new Error(
        "Reddit returned 404 Not Found. The resource may not exist."
      );
    }

    if (resp.status >= 400) {
      let errorMsg: string;
      try {
        errorMsg = await resp.text();
      } catch {
        errorMsg = `HTTP ${resp.status}`;
      }
      throw new Error(`Reddit API error (${resp.status}): ${errorMsg}`);
    }

    return (await resp.json()) as Record<string, unknown>;
  }
}
