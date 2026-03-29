# reddit-mcp

A read-only Reddit MCP server for Claude Code and other MCP-compatible clients. Search posts, browse subreddits, read comments, view user profiles, and check trending content -- all through the Model Context Protocol.

### Quick Install (Claude Code)

```bash
npx -y @hamzashahbaz/reddit-mcp
```

Or add it to Claude Code with environment variables:

```bash
claude mcp add reddit -e REDDIT_CLIENT_ID=your_id -e REDDIT_CLIENT_SECRET=your_secret -e REDDIT_USERNAME=your_username -e REDDIT_PASSWORD=your_password -- npx -y @hamzashahbaz/reddit-mcp
```

## Features

- **Search Reddit** -- query posts across all of Reddit or within a specific subreddit
- **Browse subreddits** -- get posts sorted by hot, new, top, or rising
- **Read comments** -- fetch a post's details and top-level comments
- **User profiles** -- view profile info and recent activity (posts, comments, or both)
- **Trending posts** -- see what's popular on r/popular

## Prerequisites

- Node.js 18+
- A Reddit account
- A Reddit "script" application (free) -- see [Setup](#setup)

## Setup

### 1. Create a Reddit script app

1. Go to [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
2. Click **"create another app..."**
3. Fill in:
   - **name**: anything (e.g., `mcp-reader`)
   - **type**: select **script**
   - **redirect uri**: `http://localhost:8080` (not used, but required)
4. Note your **client ID** (under the app name) and **client secret**

### 2. Clone and build

```bash
git clone https://github.com/hamzashahbaz/reddit-mcp.git
cd reddit-mcp
npm install
npm run build
```

## Configuration

Add to your `.mcp.json` (Claude Code) or `claude_desktop_config.json` (Claude Desktop):

```json
{
  "mcpServers": {
    "reddit": {
      "command": "node",
      "args": ["/path/to/reddit-mcp/dist/server.js"],
      "env": {
        "REDDIT_CLIENT_ID": "your_client_id",
        "REDDIT_CLIENT_SECRET": "your_client_secret",
        "REDDIT_USERNAME": "your_reddit_username",
        "REDDIT_PASSWORD": "your_reddit_password"
      }
    }
  }
}
```

Replace `/path/to/reddit-mcp` with the actual path to your cloned directory.

## Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `search_reddit` | Search posts by query | `query`, `subreddit?`, `sort`, `time_filter`, `limit` |
| `get_subreddit_posts` | Browse a subreddit | `subreddit`, `sort`, `time_filter`, `limit` |
| `get_post_comments` | Get post details + comments | `post_id`, `sort`, `limit` |
| `get_user_profile` | User info + recent activity | `username`, `content_type`, `limit` |
| `get_trending` | Trending posts from r/popular | *(none)* |

### Parameter details

- **sort** (search): `relevance`, `hot`, `top`, `new`
- **sort** (subreddit): `hot`, `new`, `top`, `rising`
- **sort** (comments): `best`, `top`, `new`, `controversial`
- **time_filter**: `hour`, `day`, `week`, `month`, `year`, `all`
- **content_type**: `overview`, `posts`, `comments`
- **limit**: 1-25 for most tools, 1-50 for comments

## How it works

The server authenticates with Reddit's OAuth2 API using the password grant flow, then exposes read-only endpoints as MCP tools over stdio transport. Tokens are cached and automatically refreshed before expiry.

## License

MIT
