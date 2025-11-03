import { useEffect, useState } from "react";

const API_KEY = import.meta.env.VITE_YT_API_KEY;

export default function ContentPage() {
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = new URL(window.location.href).searchParams.get(
      "search_query"
    );
    setSearchQuery(query);
  }, []);

  function handleClick() {
    if (!searchQuery) return;

    setLoading(true);

    fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(
        searchQuery
      )}&key=${API_KEY}&maxResults=50`
    )
      .then((res) => res.json())
      .then((data) => {
        setResults(data.items || []);
      })
      .catch((err) => console.error("YouTube API error:", err))
      .finally(() => setLoading(false));
  }

  console.log(results);

  return (
    <div className="p-2 bg-white/80 rounded-lg shadow-md text-black flex gap-2 items-center">
      <button
        onClick={handleClick}
        className="bg-purple-500 text-white px-3 py-1 rounded-md hover:bg-purple-600 cursor-pointer"
      >
        Enhance
      </button>
    </div>
  );
}

// reference of a video item
// {
//     "kind": "youtube#searchResult",
//     "etag": "hjvBcuiwqgm6HnSR8jUqsJbrA8o",
//     "id": {
//         "kind": "youtube#video",
//         "videoId": "MI4ccHDFA_w"
//     },
//     "snippet": {
//         "publishedAt": "2024-02-27T16:30:07Z",
//         "channelId": "UCtFHdruMogfCGmUAHhtdi4w",
//         "title": "How to quickly get started with the YouTube Search API",
//         "description": "",
//         "thumbnails": {
//             "default": {
//                 "url": "https://i.ytimg.com/vi/MI4ccHDFA_w/default.jpg",
//                 "width": 120,
//                 "height": 90
//             },
//             "medium": {
//                 "url": "https://i.ytimg.com/vi/MI4ccHDFA_w/mqdefault.jpg",
//                 "width": 320,
//                 "height": 180
//             },
//             "high": {
//                 "url": "https://i.ytimg.com/vi/MI4ccHDFA_w/hqdefault.jpg",
//                 "width": 480,
//                 "height": 360
//             }
//         },
//         "channelTitle": "Edward Banner",
//         "liveBroadcastContent": "none",
//         "publishTime": "2024-02-27T16:30:07Z"
//     }
// }
