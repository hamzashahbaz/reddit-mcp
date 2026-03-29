/**
 * Reddit Content MCP Server — read-only Reddit access via OAuth2.
 * Stdio transport for Claude Code integration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { RedditClient } from "./reddit-api.js";
import {
  formatPostList,
  formatPostDetail,
  formatCommentList,
  formatUserProfile,
  formatUserActivity,
  formatTrendingPosts,
} from "./formatters.js";

// ─── Config ─────────────────────────────────────────────────────────────────

const clientId = process.env.REDDIT_CLIENT_ID;
const clientSecret = process.env.REDDIT_CLIENT_SECRET;
const username = process.env.REDDIT_USERNAME;
const password = process.env.REDDIT_PASSWORD;

if (!clientId || !clientSecret || !username || !password) {
  process.stderr.write(
    "Error: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, and REDDIT_PASSWORD are required.\n"
  );
  process.exit(1);
}

const reddit = new RedditClient({ clientId, clientSecret, username, password });

const server = new McpServer({
  name: "Reddit Content",
  version: "0.1.0",
});

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ListingChild {
  kind: string;
  data: Record<string, unknown>;
}

interface Listing {
  kind?: string;
  data?: {
    children?: ListingChild[];
  };
}

function extractPosts(listing: Record<string, unknown>): Record<string, unknown>[] {
  const data = listing.data as Listing["data"];
  const children = data?.children || [];
  return children.map((c: ListingChild) => c.data);
}

function extractChildren(listing: Record<string, unknown>): ListingChild[] {
  const data = listing.data as Listing["data"];
  return data?.children || [];
}

function normalizePostId(id: string): string {
  // Accept "t3_abc123" or just "abc123"
  return id.startsWith("t3_") ? id.slice(3) : id;
}

// ─── Tools ──────────────────────────────────────────────────────────────────

server.tool(
  "search_reddit",
  "Search Reddit for posts matching a query. Optionally limit to a specific subreddit.",
  {
    query: z.string().describe("Search query"),
    subreddit: z.string().optional().describe("Limit search to this subreddit"),
    sort: z
      .enum(["relevance", "hot", "top", "new"])
      .default("relevance")
      .describe("Sort order"),
    time_filter: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .default("all")
      .describe("Time filter"),
    limit: z.coerce
      .number()
      .min(1)
      .max(25)
      .default(10)
      .describe("Number of results (max 25)"),
  },
  async ({ query, subreddit, sort, time_filter, limit }) => {
    const endpoint = subreddit
      ? `/r/${subreddit}/search`
      : "/search";

    const params: Record<string, string> = {
      q: query,
      sort,
      t: time_filter,
      limit: String(limit),
      restrict_sr: subreddit ? "true" : "false",
      type: "link",
    };

    const data = await reddit.get(endpoint, params);
    const posts = extractPosts(data);
    const text = `Search results for: "${query}"${subreddit ? ` in r/${subreddit}` : ""}\n\n${formatPostList(posts as any[])}`;
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_subreddit_posts",
  "Get posts from a subreddit sorted by hot, new, top, or rising.",
  {
    subreddit: z.string().describe("Subreddit name (without r/ prefix)"),
    sort: z
      .enum(["hot", "new", "top", "rising"])
      .default("hot")
      .describe("Sort order"),
    time_filter: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .default("all")
      .describe("Time filter (only applies to 'top' sort)"),
    limit: z.coerce
      .number()
      .min(1)
      .max(25)
      .default(10)
      .describe("Number of posts (max 25)"),
  },
  async ({ subreddit, sort, time_filter, limit }) => {
    const params: Record<string, string> = {
      limit: String(limit),
    };
    if (sort === "top") {
      params.t = time_filter;
    }

    const data = await reddit.get(`/r/${subreddit}/${sort}`, params);
    const posts = extractPosts(data);
    const text = `r/${subreddit} — ${sort}\n\n${formatPostList(posts as any[])}`;
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_post_comments",
  "Get a post's details and its top-level comments. Accepts a post ID like 't3_abc123' or just 'abc123'.",
  {
    post_id: z.string().describe("Post ID (e.g., 't3_abc123' or 'abc123')"),
    sort: z
      .enum(["best", "top", "new", "controversial"])
      .default("best")
      .describe("Comment sort order"),
    limit: z.coerce
      .number()
      .min(1)
      .max(50)
      .default(15)
      .describe("Number of comments (max 50)"),
  },
  async ({ post_id, sort, limit }) => {
    const id = normalizePostId(post_id);
    const params: Record<string, string> = {
      sort,
      limit: String(limit),
    };

    // Reddit returns an array: [post_listing, comments_listing]
    const data = await reddit.get(`/comments/${id}`, params) as unknown as Record<string, unknown>[];

    if (!Array.isArray(data) || data.length < 2) {
      return {
        content: [{ type: "text" as const, text: "Could not retrieve post and comments." }],
      };
    }

    const postListing = data[0] as Record<string, unknown>;
    const commentListing = data[1] as Record<string, unknown>;

    const posts = extractPosts(postListing);
    const post = posts[0] || {};

    const commentChildren = extractChildren(commentListing);
    // Filter out "more" entries, keep only actual comments (t1)
    const comments = commentChildren
      .filter((c: ListingChild) => c.kind === "t1")
      .map((c: ListingChild) => c.data);

    const postText = formatPostDetail(post as any);
    const commentsText = formatCommentList(comments as any[]);

    const text = `${postText}\n\n${"═".repeat(60)}\nComments (${comments.length})\n${"═".repeat(60)}\n\n${commentsText}`;
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_user_profile",
  "Get a Reddit user's profile info and recent activity (posts, comments, or both).",
  {
    username: z.string().describe("Reddit username (without u/ prefix)"),
    content_type: z
      .enum(["overview", "posts", "comments"])
      .default("overview")
      .describe("Type of activity to retrieve"),
    limit: z.coerce
      .number()
      .min(1)
      .max(25)
      .default(10)
      .describe("Number of activity items (max 25)"),
  },
  async ({ username: targetUser, content_type, limit }) => {
    // Fetch user profile and activity in parallel
    const [aboutData, activityData] = await Promise.all([
      reddit.get(`/user/${targetUser}/about`),
      reddit.get(`/user/${targetUser}/${content_type === "posts" ? "submitted" : content_type}`, {
        limit: String(limit),
      }),
    ]);

    const user = aboutData.data as Record<string, unknown> | undefined;
    const profileText = user ? formatUserProfile(user as any) : `User: u/${targetUser}`;

    const activityChildren = extractChildren(activityData);
    const activityText = formatUserActivity(
      activityChildren.map((c: ListingChild) => ({
        kind: c.kind,
        data: c.data as any,
      }))
    );

    const text = `${profileText}\n\n${"─".repeat(40)}\nRecent ${content_type}\n${"─".repeat(40)}\n\n${activityText}`;
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_trending",
  "Get trending/popular posts from across Reddit (r/popular).",
  {},
  async () => {
    const data = await reddit.get("/r/popular/hot", { limit: "15" });
    const posts = extractPosts(data);
    const text = `Trending on Reddit (r/popular)\n\n${formatTrendingPosts(posts as any[])}`;
    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── Start ──────────────────────────────────────────────────────────────────

async function main() {
  await reddit.authenticate();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
