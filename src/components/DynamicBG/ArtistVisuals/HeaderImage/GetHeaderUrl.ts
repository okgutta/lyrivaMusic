import { SpotifyPlayer } from "../../../Global/SpotifyPlayer.ts";

export default function GetHeaderUrl(data: any) {
  if (!data) return SpotifyPlayer.GetCover("xlarge") ?? undefined;

  // 字符串分支：缓存里可能存了损坏/非 JSON 的字符串，解析失败回退封面
  let HeaderImage: string | undefined;
  if (typeof data === "object") {
    HeaderImage = data[0]?.url;
  } else {
    try {
      HeaderImage = JSON.parse(data)[0]?.url;
    } catch {
      return SpotifyPlayer.GetCover("xlarge") ?? undefined;
    }
  }

  if (!HeaderImage) return SpotifyPlayer.GetCover("xlarge") ?? undefined;

  const imageId = HeaderImage.substring(HeaderImage.lastIndexOf("/") + 1);
  return `spotify:image:${imageId}`;
}
