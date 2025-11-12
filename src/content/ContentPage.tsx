import { useEffect, useState } from "react";
import { PiSparkleFill } from "react-icons/pi";
import { formatDistanceToNow } from "date-fns";

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

async function youtubeFetch(
  url: URL,
  maxRetries = Math.max(1, API_KEYS.length)
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    url.searchParams.set("key", getCurrentKey());
    const res = await fetch(url.toString());
    const data = await res.json();

    // Check quota / disabled / permission problems
    const reason = data?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") {
      console.warn(`⚠️ Quota exceeded for key #${currentKeyIndex + 1}`);
      rotateKey();
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    if (reason === "accessNotConfigured" || reason === "serviceDisabled") {
      console.warn(
        `⚠️ API not enabled for current project / key #${currentKeyIndex + 1}`
      );
      rotateKey();
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

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
  TOTAL_VIDEOS_TO_FETCH: 3000,
  PAGE_SIZE: 50, // max 50 for YouTube API
  MIN_LIKES: 20, // filter out videos with less than this many likes
  FULL_CONFIDENCE_LIKES: 200, // number of likes to reach full confidence in like ratio
};

const TOTAL_PAGES_TO_FETCH = Math.ceil(
  CONFIG.TOTAL_VIDEOS_TO_FETCH / CONFIG.PAGE_SIZE
);

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
  // added at runtime:
  durationFormatted?: string;
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

  let score = ratio * 0.7 + confidence * 0.2 + viewWeight * 0.1;
  score *= smallPenalty;

  return Number(score.toFixed(6));
}

// parse ISO 8601 duration (PT#H#M#S) into human hh:mm:ss or m:ss
function formatDurationISO(iso: string | undefined): string | null {
  if (!iso) return null;
  // Example: PT1H2M30S, PT5M30S, PT45S
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const m = iso.match(regex);
  if (!m) return null;
  const hours = parseInt(m[1] || "0", 10);
  const mins = parseInt(m[2] || "0", 10);
  const secs = parseInt(m[3] || "0", 10);

  const two = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  if (hours > 0) return `${hours}:${two(mins)}:${two(secs)}`;
  return `${mins}:${two(secs)}`;
}

// fetch video details (contentDetails, snippet, statistics) in batches (50 ids per call)
async function fetchVideoDetailsMap(ids: string[]) {
  const map = new Map<string, any>();
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "contentDetails,snippet,statistics");
    url.searchParams.set("id", chunk.join(","));
    const data = await youtubeFetch(url);
    if (!data?.items) continue;
    for (const item of data.items) {
      map.set(item.id, item);
    }
  }
  return map;
}

function normalizeVideo(
  item: any,
  stats?: LikeDislikeData,
  details?: any
): SimpleVideo {
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

  const publishedFromDetails =
    details?.snippet?.publishedAt || snippet.publishedAt;
  const viewCount =
    (details && Number(details.statistics?.viewCount || 0)) ||
    stats?.viewCount ||
    0;

  const durationIso = details?.contentDetails?.duration;
  const durationFormatted = formatDurationISO(durationIso);

  const video: SimpleVideo = {
    videoId,
    title: snippet.title,
    channelTitle: snippet.channelTitle,
    description: snippet.description,
    thumbnail,
    publishedAt: publishedFromDetails,
    viewCount,
    likes,
    dislikes,
    likePercent,
    stats,
    score: 0,
  };

  // attach formatted duration to the object for UI
  (video as any).durationFormatted = durationFormatted ?? undefined;

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
    overlayBg: "rgba(0,0,0,0.75)",
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
    position: relative;
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

  // duration badge on thumbnail (YouTube-like)
  if ((video as any).durationFormatted) {
    const duration = document.createElement("span");
    duration.textContent = (video as any).durationFormatted;
    duration.style.cssText = `
      position: absolute;
      bottom: 6px;
      right: 6px;
      padding: 2px 6px;
      font-size: 12px;
      font-weight: 600;
      background: ${colors.overlayBg};
      color: #fff;
      border-radius: 4px;
    `;
    thumbLink.appendChild(duration);
  }

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

  // Channel
  const channel = document.createElement("div");
  channel.textContent = video.channelTitle || "Unknown Channel";
  channel.style.cssText = `
    font-size: 13px;
    color: ${colors.subtext};
    margin-bottom: 6px;
  `;

  // Stats + uploaded time
  const stats = document.createElement("div");
  const ratio =
    video.likePercent != null ? video.likePercent.toFixed(1) + "%" : "—";
  const uploadedAgo =
    video.publishedAt &&
    formatDistanceToNow(new Date(video.publishedAt), { addSuffix: true });
  stats.innerHTML = `
    <span style="font-size: 12px; color: ${colors.stat};">
      ${video.likes.toLocaleString()} 👍 &nbsp;|&nbsp;
      ${video.dislikes.toLocaleString()} 👎 &nbsp;|&nbsp;
      ${ratio} &nbsp;|&nbsp;
      ${uploadedAgo || "—"}
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
  const container = document.querySelector(
    "ytd-section-list-renderer ytd-item-section-renderer #contents"
  );

  if (!container) {
    console.warn("⚠️ Could not find YouTube results container.");
    return;
  }

  // backup original
  const original = container.cloneNode(true);
  (window as any).__yt_original_results__ = original;

  container.innerHTML = "";

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
  // const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(window.location.href);
  const path = new URL(currentUrl).pathname;
  const shouldShowButton = path === "/results" && searchQuery;

  // react to URL
  useEffect(() => {
    const updateUrlState = () => {
      const url = window.location.href;
      setCurrentUrl(url);
      const query = new URL(url).searchParams.get("search_query");
      setSearchQuery(query);
    };

    window.addEventListener("yt-navigate-finish", updateUrlState);
    window.addEventListener("popstate", updateUrlState);
    updateUrlState();

    return () => {
      window.removeEventListener("yt-navigate-finish", updateUrlState);
      window.removeEventListener("popstate", updateUrlState);
    };
  }, []);

  // handle click
  const handleClick = async () => {
    if (!searchQuery) return;
    setLoading(true);
    // setResults([]);

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
        if (!data?.items) break;

        allResults = [...allResults, ...data.items];
        nextPageToken = data.nextPageToken;
        if (!nextPageToken) break;

        // Remove duplicate videos by videoId as we accumulate
        const seen = new Set<string>();
        allResults = allResults.filter((item) => {
          const id = item.id?.videoId || item.id;
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }

      // collect ids and fetch details
      const ids = Array.from(
        new Set(allResults.map((it) => it.id?.videoId || it.id).filter(Boolean))
      );
      const detailsMap = await fetchVideoDetailsMap(ids);

      // Parallel fetch + normalize + scoring
      const enriched = await Promise.all(
        allResults.map(async (item) => {
          const id = item.id?.videoId || item.id;
          if (!id) return null;
          // call dislike API
          try {
            const ld = await fetchLikeAndDislikes(id);
            const details = detailsMap.get(id);
            return normalizeVideo(item, ld, details);
          } catch {
            const details = detailsMap.get(id);
            return normalizeVideo(item, undefined, details);
          }
        })
      );

      const cleanList = enriched.filter((v): v is SimpleVideo => v !== null);
      const finalList = filterAndSort(cleanList);

      // setResults(finalList);
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
