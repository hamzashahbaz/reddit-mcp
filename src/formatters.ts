/**
 * Format Reddit API responses as readable plain text.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface RedditPost {
  id?: string;
  name?: string;
  title?: string;
  subreddit?: string;
  subreddit_name_prefixed?: string;
  author?: string;
  score?: number;
  num_comments?: number;
  url?: string;
  selftext?: string;
  created_utc?: number;
  link_flair_text?: string | null;
  permalink?: string;
  is_self?: boolean;
  domain?: string;
  over_18?: boolean;
  stickied?: boolean;
}

interface RedditComment {
  id?: string;
  author?: string;
  score?: number;
  body?: string;
  created_utc?: number;
  replies?: { data?: { children?: Array<{ kind: string }> } } | string;
  stickied?: boolean;
  is_submitter?: boolean;
  distinguished?: string | null;
}

interface RedditUser {
  name?: string;
  link_karma?: number;
  comment_karma?: number;
  created_utc?: number;
  is_gold?: boolean;
  is_mod?: boolean;
  subreddit?: {
    display_name?: string;
    public_description?: string;
  };
}

interface SubredditInfo {
  display_name?: string;
  display_name_prefixed?: string;
  subscribers?: number;
  active_user_count?: number;
  public_description?: string;
  title?: string;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatScore(score: number | undefined): string {
  if (score === undefined) return "0";
  if (Math.abs(score) >= 1000) {
    return `${(score / 1000).toFixed(1)}k`;
  }
  return String(score);
}

function timeAgo(utcSeconds: number | undefined): string {
  if (!utcSeconds) return "unknown";

  const now = Date.now() / 1000;
  const diff = now - utcSeconds;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

function formatDate(utcSeconds: number | undefined): string {
  if (!utcSeconds) return "";
  try {
    return new Date(utcSeconds * 1000).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function truncate(text: string | undefined, maxLen: number): string {
  if (!text) return "";
  const cleaned = text.replace(/\n+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + "...";
}

function accountAge(createdUtc: number | undefined): string {
  if (!createdUtc) return "unknown";
  const diff = Date.now() / 1000 - createdUtc;
  const years = Math.floor(diff / 31536000);
  const months = Math.floor((diff % 31536000) / 2592000);
  if (years > 0) return `${years}y ${months}mo`;
  if (months > 0) return `${months}mo`;
  return `${Math.floor(diff / 86400)}d`;
}

function countReplies(comment: RedditComment): number {
  if (!comment.replies || typeof comment.replies === "string") return 0;
  const children = comment.replies.data?.children || [];
  // Filter out "more" type entries
  return children.filter((c) => c.kind === "t1").length;
}

// ─── Post Formatters ────────────────────────────────────────────────────────

export function formatPostList(posts: RedditPost[]): string {
  if (!posts.length) return "No posts found.";

  return posts
    .map((post, i) => {
      const score = formatScore(post.score);
      const comments = formatScore(post.num_comments);
      const time = timeAgo(post.created_utc);
      const date = formatDate(post.created_utc);
      const flair = post.link_flair_text ? ` [${post.link_flair_text}]` : "";
      const nsfw = post.over_18 ? " [NSFW]" : "";
      const pinned = post.stickied ? " [PINNED]" : "";
      const sub = post.subreddit_name_prefixed || `r/${post.subreddit || ""}`;
      const selftext = truncate(post.selftext, 300);
      const link = post.is_self ? "" : `  Link: ${post.url}`;

      const lines = [
        `${i + 1}. ${post.title || "(no title)"}${flair}${nsfw}${pinned}`,
        `   ${sub} | u/${post.author || "[deleted]"} | ${score} pts | ${comments} comments | ${time} (${date})`,
      ];

      if (selftext) lines.push(`   ${selftext}`);
      if (link) lines.push(link);
      lines.push(`   ID: ${post.name || post.id || ""}`);
      lines.push(`   https://reddit.com${post.permalink || ""}`);

      return lines.join("\n");
    })
    .join("\n\n" + "─".repeat(60) + "\n\n");
}

export function formatPostDetail(post: RedditPost): string {
  const score = formatScore(post.score);
  const comments = formatScore(post.num_comments);
  const time = timeAgo(post.created_utc);
  const date = formatDate(post.created_utc);
  const sub = post.subreddit_name_prefixed || `r/${post.subreddit || ""}`;
  const flair = post.link_flair_text ? `\nFlair: ${post.link_flair_text}` : "";

  const parts = [
    `Title: ${post.title || "(no title)"}`,
    `Subreddit: ${sub}`,
    `Author: u/${post.author || "[deleted]"}`,
    `Score: ${score} | Comments: ${comments}`,
    `Posted: ${time} (${date})`,
  ];

  if (flair) parts.push(flair.trim());
  if (!post.is_self && post.url) parts.push(`Link: ${post.url}`);
  parts.push(`Permalink: https://reddit.com${post.permalink || ""}`);
  parts.push(`ID: ${post.name || post.id || ""}`);

  if (post.selftext) {
    const body = post.selftext.length > 2000
      ? post.selftext.slice(0, 2000) + "\n\n... [truncated]"
      : post.selftext;
    parts.push("\n" + "─".repeat(40) + "\n\n" + body);
  }

  return parts.join("\n");
}

// ─── Comment Formatters ─────────────────────────────────────────────────────

export function formatCommentList(comments: RedditComment[]): string {
  if (!comments.length) return "No comments found.";

  return comments
    .map((comment, i) => {
      const score = formatScore(comment.score);
      const time = timeAgo(comment.created_utc);
      const body = truncate(comment.body, 500);
      const replies = countReplies(comment);
      const repliesStr = replies > 0 ? ` | ${replies} replies` : "";
      const op = comment.is_submitter ? " [OP]" : "";
      const mod = comment.distinguished === "moderator" ? " [MOD]" : "";
      const pinned = comment.stickied ? " [PINNED]" : "";

      return [
        `${i + 1}. u/${comment.author || "[deleted]"}${op}${mod}${pinned} | ${score} pts | ${time}${repliesStr}`,
        `   ${body}`,
      ].join("\n");
    })
    .join("\n\n");
}

// ─── User Formatters ────────────────────────────────────────────────────────

export function formatUserProfile(user: RedditUser): string {
  const age = accountAge(user.created_utc);
  const date = formatDate(user.created_utc);

  const parts = [
    `User: u/${user.name || "unknown"}`,
    `Account Age: ${age} (created ${date})`,
    `Link Karma: ${formatScore(user.link_karma)}`,
    `Comment Karma: ${formatScore(user.comment_karma)}`,
  ];

  if (user.is_gold) parts.push("Reddit Premium: Yes");
  if (user.is_mod) parts.push("Moderator: Yes");
  if (user.subreddit?.public_description) {
    parts.push(`\nBio: ${truncate(user.subreddit.public_description, 300)}`);
  }

  return parts.join("\n");
}

export function formatUserActivity(
  items: Array<{ kind: string; data: RedditPost | RedditComment }>
): string {
  if (!items.length) return "No recent activity.";

  return items
    .map((item, i) => {
      if (item.kind === "t3") {
        // Post
        const post = item.data as RedditPost;
        const score = formatScore(post.score);
        const time = timeAgo(post.created_utc);
        const sub = post.subreddit_name_prefixed || `r/${post.subreddit || ""}`;
        return [
          `${i + 1}. [POST] ${post.title || "(no title)"}`,
          `   ${sub} | ${score} pts | ${time}`,
        ].join("\n");
      } else {
        // Comment
        const comment = item.data as RedditComment;
        const score = formatScore(comment.score);
        const time = timeAgo(comment.created_utc);
        const body = truncate(comment.body, 200);
        return [
          `${i + 1}. [COMMENT] ${score} pts | ${time}`,
          `   ${body}`,
        ].join("\n");
      }
    })
    .join("\n\n");
}

// ─── Trending Formatters ────────────────────────────────────────────────────

export function formatTrendingPosts(posts: RedditPost[]): string {
  if (!posts.length) return "No trending posts found.";

  return posts
    .map((post, i) => {
      const score = formatScore(post.score);
      const comments = formatScore(post.num_comments);
      const time = timeAgo(post.created_utc);
      const sub = post.subreddit_name_prefixed || `r/${post.subreddit || ""}`;

      return [
        `${i + 1}. ${post.title || "(no title)"}`,
        `   ${sub} | ${score} pts | ${comments} comments | ${time}`,
        `   https://reddit.com${post.permalink || ""}`,
      ].join("\n");
    })
    .join("\n\n");
}
