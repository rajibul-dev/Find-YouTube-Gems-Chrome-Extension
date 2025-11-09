import { useEffect, useState } from "react";
import { PiSparkleFill } from "react-icons/pi";

const API_KEY = import.meta.env.VITE_YT_API_KEY;

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

interface LikeDislikeData {
  id: string;
  dateCreated: string;
  likes: number;
  dislikes: number;
  rating: number;
  viewCount: number;
  deleted: boolean;
}

async function fetchLikeAndDislikes(videoId: string): Promise<LikeDislikeData> {
  const result = await fetch(
    `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`
  );
  return result.json();
}

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

      // Fetch up to 10 pages (10×50 = 500 videos)
      for (let i = 0; i < 10; i++) {
        const url = new URL("https://www.googleapis.com/youtube/v3/search");
        url.searchParams.set("part", "snippet");
        url.searchParams.set("type", "video");
        url.searchParams.set("maxResults", "50");
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

      // Optionally: parallel fetch like/dislike ratios
      const enriched = await Promise.all(
        allResults.map(async (item) => {
          const id = item.id?.videoId;
          if (!id) return item;
          try {
            const ld = await fetchLikeAndDislikes(id);
            return { ...item, stats: ld };
          } catch {
            return item;
          }
        })
      );

      setResults(enriched);
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
