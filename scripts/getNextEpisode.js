import getDataEpisode from "./getDataEpisode.js";
import getDataEpisodes from "./getDataEpisodes.js";

/**
 * Given a current episode's identifier, find the next episode to play:
 * - the next episode number within the same season, if one exists
 * - otherwise, episode 1 of the next season, if one exists
 * - otherwise null (this is genuinely the last episode of the series —
 *   nothing should be shown/auto-played, per the spec's "correctly handle
 *   the final episode" requirement)
 */
export default async function getNextEpisode(currentIdentifier) {
  const currentRows = await getDataEpisode(currentIdentifier);
  const current = currentRows[0];
  if (!current) return null;

  const sameSeasonEpisodes = await getDataEpisodes(current.serie_id, current.season);
  const currentIndex = sameSeasonEpisodes.findIndex((e) => e.identifier === currentIdentifier);
  if (currentIndex === -1) return null;

  if (currentIndex + 1 < sameSeasonEpisodes.length) {
    return sameSeasonEpisodes[currentIndex + 1];
  }

  // No more episodes in this season — check the next season.
  const nextSeasonEpisodes = await getDataEpisodes(current.serie_id, Number(current.season) + 1);
  if (nextSeasonEpisodes.length > 0) {
    return nextSeasonEpisodes[0];
  }

  return null;
}
