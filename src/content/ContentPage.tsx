import { useEffect, useState } from "react";
import { PiSparkleFill } from "react-icons/pi";

const API_KEY = import.meta.env.VITE_YT_API_KEY;

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

  // base ratio
  const ratio = likes + dislikes > 0 ? likes / (likes + dislikes) : 0.5;

  // confidence penalty for low-like videos
  const confidence = Math.min(1, likes / CONFIG.FULL_CONFIDENCE_LIKES); // full trust at 1k likes

  // small videos (like < 10) get harsh penalty
  const smallPenalty = likes < 10 ? 0.5 : 1;

  // slight bump for higher views
  const viewBonus = Math.log10(views + 10) / 10;

  const score = ratio * confidence * smallPenalty + viewBonus;
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
  // 2. Sort by score descending
  return videos
    .filter((v) => v.likes >= CONFIG.MIN_LIKES)
    .sort((a, b) => b.score - a.score);
}

export function renderVideoElement(video: SimpleVideo): HTMLElement {
  const el = document.createElement("ytd-video-renderer");
  el.classList.add("style-scope", "ytd-vertical-list-renderer");
  el.setAttribute("bigger-thumbs-style", "BIG");
  el.setAttribute("is-search", "");
  el.setAttribute("use-search-ui", "");
  el.setAttribute("use-bigger-thumbs", "");

  // inner HTML (simplified version of YouTube structure)
  el.innerHTML = `
    <div id="dismissible" class="style-scope ytd-video-renderer">
      <ytd-thumbnail class="style-scope ytd-video-renderer" size="large">
        <a id="thumbnail" class="yt-simple-endpoint inline-block style-scope ytd-thumbnail"
          href="/watch?v=${video.videoId}" target="_blank">
          <img
            alt="${video.title}"
            class="ytCoreImageHost ytCoreImageFillParentHeight ytCoreImageFillParentWidth ytCoreImageContentModeScaleAspectFill"
            src="${video.thumbnail}"
            style="border-radius: 8px; background-color: transparent;"
          />
        </a>
      </ytd-thumbnail>
      <div class="text-wrapper style-scope ytd-video-renderer">
        <div id="meta" class="style-scope ytd-video-renderer">
          <div id="title-wrapper" class="style-scope ytd-video-renderer">
            <h3 class="title-and-badge style-scope ytd-video-renderer" style="font-size: 16px;">
              <a id="video-title"
                class="yt-simple-endpoint style-scope ytd-video-renderer"
                href="/watch?v=${video.videoId}"
                title="${video.title}"
                target="_blank"
                style="text-decoration: none; color: inherit; font-weight: 600;"
              >
                ${video.title}
              </a>
            </h3>
            <div style="font-size: 13px; color: #606060;">${
              video.channelTitle
            }</div>
            <div style="font-size: 12px; color: #111; margin-top: 4px;">
              ${video.likes.toLocaleString()} 👍 | ${video.dislikes.toLocaleString()} 👎 |
              ${video.likePercent ? video.likePercent.toFixed(1) + "%" : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  return el;
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
        url.searchParams.set("key", API_KEY);
        if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);

        const res = await fetch(url.toString());
        const data = await res.json();
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
