import { useEffect, useState } from "react";
import { PiSparkleFill } from "react-icons/pi";

// ---------- YouTube API Key Management ----------
const API_KEYS: string[] = [];
for (let i = 1; i <= 11; i++) {
  const key = import.meta.env[`VITE_YT_API_KEY_${i}`];
  if (key) API_KEYS.push(key);
}

let currentKeyIndex = 0;

function getCurrentKey() {
  return API_KEYS[currentKeyIndex % API_KEYS.length];
}
function rotateKey() {
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  console.warn(`🔄 Switched to API key #${currentKeyIndex + 1}`);
}

async function youtubeFetch(url: URL, maxRetries = API_KEYS.length) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    url.searchParams.set("key", getCurrentKey());
    const res = await fetch(url.toString());
    const data = await res.json();

    // Check quota
    const reason = data?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") {
      console.warn(`⚠️ Quota exceeded for key #${currentKeyIndex + 1}`);
      rotateKey();
      await new Promise((r) => setTimeout(r, 500)); // brief cooldown
      continue; // try next key
    }

    // Handle other potential network issues
    if (!res.ok) {
      console.warn(`⚠️ YouTube API responded with ${res.status}`);
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    return data;
  }

  throw new Error("❌ All YouTube API keys exhausted.");
}

// ---------- CONFIG ----------
const CONFIG = {
  TOTAL_VIDEOS_TO_FETCH: 500,
  PAGE_SIZE: 50, // max 50 for YouTube API
  MIN_LIKES: 20, // filter out videos with less than this many likes
  FULL_CONFIDENCE_LIKES: 500, // number of likes to reach full confidence in like ratio
};

const TOTAL_PAGES_TO_FETCH = Math.ceil(
  CONFIG.TOTAL_VIDEOS_TO_FETCH / CONFIG.PAGE_SIZE
);

// reference of like/dislike data
// {
//  "id": "kxOuG8jMIgI",
//  "dateCreated": "2021-12-20T12:25:54.418014Z",
//  "likes": 27326,
//  "dislikes": 498153,
//  "rating": 1.212014408444885,
//  "viewCount": 3149885,
//  "deleted": false
// }

// ---------- Interfaces ----------
interface LikeDislikeData {
  id: string;
  dateCreated: string;
  likes: number;
  dislikes: number;
  rating: number;
  viewCount: number;
  deleted: boolean;
}

interface SimpleVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  description?: string;
  thumbnail: string;
  publishedAt?: string;
  viewCount?: number;
  likes: number;
  dislikes: number;
  likePercent: number | null;
  score: number;
  stats?: LikeDislikeData;
}

// ---------- Utils ----------
async function fetchLikeAndDislikes(videoId: string): Promise<LikeDislikeData> {
  const result = await fetch(
    `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`
  );
  return result.json();
}

function computeLikePercent(likes: number, dislikes: number): number | null {
  const total = likes + dislikes;
  if (total === 0) return null;
  return (likes / total) * 100;
}

function computeScore(video: SimpleVideo): number {
  const likes = video.likes || 0;
  const dislikes = video.dislikes || 0;
  const views = video.viewCount || 0;

  const ratio = likes + dislikes > 0 ? likes / (likes + dislikes) : 0.5;
  const confidence = Math.min(1, likes / CONFIG.FULL_CONFIDENCE_LIKES);
  const smallPenalty = likes < 10 ? 0.5 : 1;
  const viewWeight = Math.min(1, Math.log10(views + 1) / 6);

  // main weighted model
  let score = ratio * 0.7 + confidence * 0.2 + viewWeight * 0.1;

  // apply penalty at the end
  score *= smallPenalty;

  return Number(score.toFixed(6));
}

function normalizeVideo(item: any, stats?: LikeDislikeData): SimpleVideo {
  const snippet = item.snippet || {};
  const likes = stats?.likes ?? 0;
  const dislikes = stats?.dislikes ?? 0;

  const likePercent = computeLikePercent(likes, dislikes);
  const videoId = item.id?.videoId || item.id;
  const thumbnail =
    snippet.thumbnails?.high?.url ||
    snippet.thumbnails?.medium?.url ||
    snippet.thumbnails?.default?.url ||
    "";

  const video: SimpleVideo = {
    videoId,
    title: snippet.title,
    channelTitle: snippet.channelTitle,
    description: snippet.description,
    thumbnail,
    publishedAt: snippet.publishedAt,
    viewCount: stats?.viewCount || 0,
    likes,
    dislikes,
    likePercent,
    stats,
    score: 0,
  };

  video.score = computeScore(video);
  return video;
}

function filterAndSort(videos: SimpleVideo[]) {
  // 1. Filter out videos with less than MIN_LIKES
  // 2. higher score first
  return videos
    .filter((v) => v.likes >= CONFIG.MIN_LIKES)
    .sort((a, b) => b.score - a.score);
}

export function renderVideoElement(video: SimpleVideo): HTMLElement {
  // Detect if YouTube is in dark mode (checks for html[dark] or prefers-color-scheme)
  const isDarkMode =
    document.documentElement.hasAttribute("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const colors = {
    background: isDarkMode ? "#181818" : "#f9f9f9",
    border: isDarkMode ? "1px solid #303030" : "1px solid #e5e5e5",
    text: isDarkMode ? "#f1f1f1" : "#0f0f0f",
    subtext: isDarkMode ? "#aaa" : "#606060",
    stat: isDarkMode ? "#ccc" : "#111",
    hoverShadow: isDarkMode
      ? "0 2px 8px rgba(255,255,255,0.05)"
      : "0 2px 6px rgba(0,0,0,0.08)",
  };

  const wrapper = document.createElement("div");
  wrapper.className =
    "yt-enhanced-video style-scope ytd-vertical-list-renderer";
  wrapper.style.cssText = `
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
    padding: 8px;
    border-radius: 12px;
    background: ${colors.background};
    border: ${colors.border};
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  `;
  wrapper.onmouseenter = () => {
    wrapper.style.transform = "translateY(-2px)";
    wrapper.style.boxShadow = colors.hoverShadow;
  };
  wrapper.onmouseleave = () => {
    wrapper.style.transform = "translateY(0)";
    wrapper.style.boxShadow = "none";
  };

  // --- Thumbnail ---
  const thumbLink = document.createElement("a");
  thumbLink.href = `/watch?v=${video.videoId}`;
  thumbLink.target = "_blank";
  thumbLink.style.cssText = `
    flex-shrink: 0;
    width: 180px;
    height: 100px;
    border-radius: 8px;
    overflow: hidden;
    background: #222;
    display: block;
  `;

  const img = document.createElement("img");
  img.src = video.thumbnail || "https://i.ytimg.com/img/no_thumbnail.jpg";
  img.alt = video.title;
  img.loading = "lazy";
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  `;
  img.onerror = () => {
    img.src = "https://i.ytimg.com/img/no_thumbnail.jpg";
  };
  thumbLink.appendChild(img);

  // --- Meta Section ---
  const meta = document.createElement("div");
  meta.style.cssText = `
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  `;

  // Title
  const title = document.createElement("a");
  title.href = `/watch?v=${video.videoId}`;
  title.target = "_blank";
  title.textContent = video.title;
  title.className = "yt-simple-endpoint style-scope ytd-video-renderer";
  title.style.cssText = `
    font-size: 16px;
    font-weight: 600;
    color: ${colors.text};
    text-decoration: none;
    line-height: 1.3;
    margin-bottom: 4px;
  `;
  title.onmouseenter = () => (title.style.textDecoration = "underline");
  title.onmouseleave = () => (title.style.textDecoration = "none");

  // Channel name
  const channel = document.createElement("div");
  channel.textContent = video.channelTitle || "Unknown Channel";
  channel.style.cssText = `
    font-size: 13px;
    color: ${colors.subtext};
    margin-bottom: 6px;
  `;

  // Stats line
  const stats = document.createElement("div");
  const ratio =
    video.likePercent != null ? video.likePercent.toFixed(1) + "%" : "—";
  stats.innerHTML = `
    <span style="font-size: 12px; color: ${colors.stat};">
      ${video.likes.toLocaleString()} 👍 &nbsp;|&nbsp;
      ${video.dislikes.toLocaleString()} 👎 &nbsp;|&nbsp;
      ${ratio}
    </span>
  `;

  meta.appendChild(title);
  meta.appendChild(channel);
  meta.appendChild(stats);

  wrapper.appendChild(thumbLink);
  wrapper.appendChild(meta);

  return wrapper;
}

function injectEnhancedResults(videos: SimpleVideo[]) {
  // YouTube’s search result container
  const container = document.querySelector(
    "ytd-section-list-renderer ytd-item-section-renderer #contents"
  );

  if (!container) {
    console.warn("⚠️ Could not find YouTube results container.");
    return;
  }

  // Optional: backup original YouTube results (so you can restore if needed)
  const original = container.cloneNode(true);
  (window as any).__yt_original_results__ = original;

  // Clear existing results
  container.innerHTML = "";

  // Inject enhanced videos
  const fragment = document.createDocumentFragment();
  videos.forEach((video) => {
    const el = renderVideoElement(video);
    fragment.appendChild(el);
  });

  container.appendChild(fragment);

  console.log(`✅ Injected ${videos.length} enhanced videos.`);
}

// ---------- Component ----------
export default function ContentPage() {
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(window.location.href);
  const path = new URL(currentUrl).pathname;
  const shouldShowButton = path === "/results" && searchQuery;

  console.log(results);

  // ✅ Effect 1 — React to YouTube’s SPA navigation events
  useEffect(() => {
    const updateUrlState = () => {
      const url = window.location.href;
      setCurrentUrl(url);

      const query = new URL(url).searchParams.get("search_query");
      setSearchQuery(query);
    };

    // YouTube emits `yt-navigate-finish` after internal navigation
    window.addEventListener("yt-navigate-finish", updateUrlState);

    // Also listen for manual back/forward (popstate)
    window.addEventListener("popstate", updateUrlState);

    // Initialize on mount
    updateUrlState();

    return () => {
      window.removeEventListener("yt-navigate-finish", updateUrlState);
      window.removeEventListener("popstate", updateUrlState);
    };
  }, []);

  // ✅ Effect 2 — Fetch when Enhance button is clicked
  const handleClick = async () => {
    if (!searchQuery) return;
    setLoading(true);
    setResults([]);

    try {
      let allResults: any[] = [];
      let nextPageToken: string | undefined = undefined;

      // Paginated fetch
      for (let i = 0; i < TOTAL_PAGES_TO_FETCH; i++) {
        const url = new URL("https://www.googleapis.com/youtube/v3/search");
        url.searchParams.set("part", "snippet");
        url.searchParams.set("type", "video");
        url.searchParams.set("maxResults", CONFIG.PAGE_SIZE.toString());
        url.searchParams.set("q", searchQuery);
        if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);

        const data = await youtubeFetch(url);
        if (!data.items) break;

        allResults = [...allResults, ...data.items];
        nextPageToken = data.nextPageToken;
        if (!nextPageToken) break;
      }

      // Parallel fetch + normalize + scoring
      const enriched = await Promise.all(
        allResults.map(async (item) => {
          const id = item.id?.videoId;
          if (!id) return null;
          try {
            const ld = await fetchLikeAndDislikes(id);
            return normalizeVideo(item, ld);
          } catch {
            return normalizeVideo(item);
          }
        })
      );

      const cleanList = enriched.filter((v): v is SimpleVideo => v !== null);
      const finalList = filterAndSort(cleanList);

      setResults(finalList);
      injectEnhancedResults(finalList);

      console.log("✅ Final SimpleVideo list (sorted):", finalList);
    } catch (err) {
      console.error("YouTube API error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log("Current URL:", currentUrl);
    console.log("Search query:", searchQuery);
    console.log("Path:", path);
  }, [currentUrl, searchQuery]);

  if (!shouldShowButton) return null;

  return (
    <button
      style={{
        fontSize: "1.6rem",
        paddingBlock: ".6rem",
        borderRadius: "16px",
        paddingInline: "1.2rem",
        backgroundColor: "#333",
        color: "#fff",
        cursor: "pointer",
        fontWeight: "600",
        border: "1px solid #777",
        outline: "none",
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
      }}
      onClick={handleClick}
    >
      <PiSparkleFill />
      {loading ? "Loading..." : "Enhance"}
    </button>
  );
}

// reference of a video item
// {
//   "kind": "youtube#searchResult",
//   "etag": "hjvBcuiwqgm6HnSR8jUqsJbrA8o",
//   "id": {
//     "kind": "youtube#video",
//     "videoId": "MI4ccHDFA_w"
//   },
//   "snippet": {
//     "publishedAt": "2024-02-27T16:30:07Z",
//     "channelId": "UCtFHdruMogfCGmUAHhtdi4w",
//     "title": "How to quickly get started with the YouTube Search API",
//     "description": "",
//     "thumbnails": {
//       "default": {
//         "url": "https://i.ytimg.com/vi/MI4ccHDFA_w/default.jpg",
//         "width": 120,
//         "height": 90
//       },
//       "medium": {
//         "url": "https://i.ytimg.com/vi/MI4ccHDFA_w/mqdefault.jpg",
//         "width": 320,
//         "height": 180
//       },
//       "high": {
//         "url": "https://i.ytimg.com/vi/MI4ccHDFA_w/hqdefault.jpg",
//         "width": 480,
//         "height": 360
//       }
//     },
//     "channelTitle": "Edward Banner",
//     "liveBroadcastContent": "none",
//     "publishTime": "2024-02-27T16:30:07Z"
//   }
// }
